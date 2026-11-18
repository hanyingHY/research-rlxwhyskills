#!/usr/bin/env python3
"""OpenDirector desktop launcher.

This is the application a Windows user runs. It does four things:

    1. makes sure a Python runtime with OpenDirector (and FFmpeg) exists,
       downloading and installing it on first run;
    2. starts the local service:  python -m opendirector_api.server --port <port>;
    3. opens the workspace in its own application window (Edge/Chrome app mode,
       no browser chrome) so what the user sees is exactly the same web
       workspace they would open in a browser;
    4. supervises both, and shuts the service down cleanly when the window closes.

It is deliberately dependency-free and single-file (psutil is used when present),
because it has to run on a machine that has nothing installed yet.

Usage
-----
    python opendirector_app.py                 # start the app (installs on first run)
    python opendirector_app.py --install       # only prepare the runtime, then exit
    python opendirector_app.py --check         # print diagnostics and exit
    python opendirector_app.py --update        # upgrade OpenDirector and its tools
    python opendirector_app.py --no-browser    # start the service, do not open a window
    python opendirector_app.py --port 8010 --data-dir D:\\OpenDirector

Exit codes: 0 ok · 1 unexpected · 2 runtime · 3 port · 4 service exited ·
5 service timeout · 6 workspace files missing · 7 no browser.
"""

from __future__ import annotations

import argparse
import json
import locale
import os
import re
import shutil
import socket
import subprocess
import sys
import tempfile
import threading
import time
import urllib.error
import urllib.request
import zipfile
from dataclasses import dataclass, field
from pathlib import Path
from typing import Callable, Iterable, Sequence

APP_NAME = "OpenDirector"
MINIMUM_PYTHON = (3, 11)
DEFAULT_PORT = 8000
PORT_SCAN = 50
HEALTH_TIMEOUT = 120.0
HEALTH_INTERVAL = 0.25
STOP_GRACE = 6.0
POLL_INTERVAL = 2.0
LOG_KEEP = 5
REQUEST_HEADER = "X-OpenDirector-Request"
STATE_VERSION = 1

IS_WINDOWS = os.name == "nt"

EXIT_OK = 0
EXIT_UNEXPECTED = 1
EXIT_RUNTIME = 2
EXIT_PORT = 3
EXIT_SERVICE_EXITED = 4
EXIT_SERVICE_TIMEOUT = 5
EXIT_WEB_MISSING = 6
EXIT_BROWSER = 7

# --------------------------------------------------------------------------------------
# Paths
# --------------------------------------------------------------------------------------

APP_HOME = Path(__file__).resolve().parent          # .../OpenDirector/app
INSTALL_HOME = APP_HOME.parent                      # .../OpenDirector
LIB_DIR = APP_HOME / "lib"
WHEELS_DIR = INSTALL_HOME / "wheels"
BIN_DIR = INSTALL_HOME / "bin"
RUNTIME_DIR = INSTALL_HOME / "runtime"              # bundled Python (created by install.ps1)


def version() -> str:
    for candidate in (INSTALL_HOME / "VERSION", APP_HOME / "VERSION"):
        try:
            return candidate.read_text(encoding="utf-8").strip()
        except OSError:
            continue
    return "dev"


def user_data_root() -> Path:
    """Per-user data root: never inside the install directory."""
    if IS_WINDOWS:
        base = os.environ.get("APPDATA") or str(Path.home() / "AppData" / "Roaming")
        return Path(base) / APP_NAME
    if sys.platform == "darwin":
        return Path.home() / "Library" / "Application Support" / APP_NAME
    base = os.environ.get("XDG_DATA_HOME") or (Path.home() / ".local" / "share")
    return Path(base) / APP_NAME


def resolve_data_dir(explicit: str | None) -> Path:
    if explicit:
        return Path(explicit).expanduser().resolve()
    from_env = os.environ.get("OPENDIRECTOR_ROOT")
    if from_env:
        return Path(from_env).expanduser().resolve()
    return user_data_root()


# --------------------------------------------------------------------------------------
# Localization
# --------------------------------------------------------------------------------------


class Strings:
    def __init__(self, locale_name: str, path: Path = LIB_DIR / "strings.json") -> None:
        try:
            catalog = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            catalog = {}
        self.catalog = catalog if isinstance(catalog, dict) else {}
        self.locale = locale_name if locale_name in self.catalog else "en-US"

    def t(self, key: str, **params: object) -> str:
        table = self.catalog.get(self.locale) or {}
        fallback = self.catalog.get("en-US") or {}
        template = table.get(key) or fallback.get(key) or key
        try:
            return template.format(**params) if params else template
        except (KeyError, IndexError):
            return template


def system_locale() -> str:
    """Chinese Windows (2052/1028/3076) gets Chinese; everything else English."""
    if IS_WINDOWS:
        try:
            import ctypes

            lang = ctypes.windll.kernel32.GetUserDefaultUILanguage() & 0xFFFF  # type: ignore[attr-defined]
            if lang in (0x0804, 0x0404, 0x0C04, 0x1004):
                return "zh-CN"
        except Exception:
            pass
    value = (
        os.environ.get("OPENDIRECTOR_LANGUAGE")
        or os.environ.get("LC_ALL")
        or os.environ.get("LC_MESSAGES")
        or os.environ.get("LANG")
        or ""
    )
    return "zh-CN" if value.lower().startswith("zh") else "en-US"


# --------------------------------------------------------------------------------------
# Logging
# --------------------------------------------------------------------------------------


class Logger:
    """Console plus a rotated daily log file under the data directory."""

    def __init__(self, directory: Path, name: str = "launcher", quiet: bool = False) -> None:
        self.directory = directory
        self.quiet = quiet
        try:
            directory.mkdir(parents=True, exist_ok=True)
            self.path = directory / f"{name}-{time.strftime('%Y%m%d')}.log"
            self._stream = self.path.open("a", encoding="utf-8")
        except OSError:
            self.path = directory / f"{name}.log"
            self._stream = None
        self._rotate()

    def _rotate(self) -> None:
        try:
            files = sorted(
                self.directory.glob("launcher-*.log"),
                key=lambda item: item.stat().st_mtime,
                reverse=True,
            )
            for stale in files[LOG_KEEP:]:
                try:
                    stale.unlink()
                except OSError:
                    pass
        except OSError:
            pass

    def write(self, message: str) -> None:
        line = f"{time.strftime('%H:%M:%S')} {message}"
        if not self.quiet:
            print(line, flush=True)
        if self._stream:
            try:
                self._stream.write(line + "\n")
                self._stream.flush()
            except OSError:
                pass

    def info(self, message: str) -> None:
        self.write(message)

    def warn(self, message: str) -> None:
        self.write(f"WARN  {message}")

    def error(self, message: str) -> None:
        self.write(f"ERROR {message}")

    def close(self) -> None:
        if self._stream:
            try:
                self._stream.close()
            except OSError:
                pass


# --------------------------------------------------------------------------------------
# Errors
# --------------------------------------------------------------------------------------


class LaunchError(Exception):
    def __init__(self, code: int, message_key: str, detail: str = "", **params: object) -> None:
        super().__init__(message_key)
        self.code = code
        self.message_key = message_key
        self.detail = detail
        self.params = params

    def title(self, strings: Strings) -> str:
        return strings.t(f"{self.message_key}.title", **self.params) if self.has(strings, "title") else strings.t("err.title")

    def body(self, strings: Strings, log_path: Path | None = None) -> str:
        text = strings.t(f"{self.message_key}.body", **self.params)
        if self.detail:
            text = f"{text}\n\n{self.detail}"
        if log_path:
            text = f"{text}\n\n{strings.t('err.see_log', path=log_path)}"
        return text

    def has(self, strings: Strings, suffix: str) -> bool:
        table = strings.catalog.get(strings.locale) or {}
        return f"{self.message_key}.{suffix}" in table or f"{self.message_key}.{suffix}" in (strings.catalog.get("en-US") or {})


def show_message_box(title: str, text: str) -> None:
    """Silent (pythonw) runs have no console: fall back to a native dialog on Windows."""
    if not IS_WINDOWS:
        return
    try:
        import ctypes

        ctypes.windll.user32.MessageBoxW(None, text, title, 0x10)  # type: ignore[attr-defined]
    except Exception:
        pass


# --------------------------------------------------------------------------------------
# Runtime
# --------------------------------------------------------------------------------------


@dataclass
class Runtime:
    executable: str
    version: str
    source: str  # bundled | venv | system | source
    python_path: list[str] = field(default_factory=list)


def parse_version(text: str) -> str | None:
    match = re.search(r"(\d+)\.(\d+)\.(\d+)", text.strip())
    return match.group(0) if match else None


def meets_minimum(version: str) -> bool:
    parts = [int(part) for part in version.split(".")[:2]]
    return tuple(parts) >= MINIMUM_PYTHON


def venv_python(directory: Path) -> Path:
    return directory / ("Scripts/python.exe" if IS_WINDOWS else "bin/python")


BUNDLED_CANDIDATES = [
    RUNTIME_DIR / "python.exe",
    RUNTIME_DIR / "bin" / "python3",
    RUNTIME_DIR / "python3.exe",
]

SYSTEM_CANDIDATES = (
    [
        ["py", "-3.13"],
        ["py", "-3.12"],
        ["py", "-3.11"],
        ["py", "-3"],
        ["python"],
    ]
    if IS_WINDOWS
    else [
        ["python3.13"],
        ["python3.12"],
        ["python3.11"],
        ["python3"],
    ]
)


def run(command: Sequence[str], env: dict[str, str] | None = None, timeout: float = 600.0):
    return subprocess.run(
        list(command),
        env=env or os.environ.copy(),
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        timeout=timeout,
        text=True,
        errors="replace",
    )


def probe_python(executable: Sequence[str]) -> str | None:
    try:
        result = run([*executable, "-c", "import sys; print('%d.%d.%d' % sys.version_info[:3])"], timeout=30)
    except (OSError, subprocess.SubprocessError):
        return None
    if result.returncode != 0:
        return None
    return parse_version(result.stdout)


def has_package(executable: Sequence[str], env: dict[str, str] | None = None) -> bool:
    try:
        result = run(
            [*executable, "-c", "import opendirector_api, opendirector"],
            env=env,
            timeout=120,
        )
    except (OSError, subprocess.SubprocessError):
        return False
    return result.returncode == 0


def python_candidates(data_dir: Path, options: "Options") -> list[tuple[str, list[str], list[str]]]:
    """(source, command, extra PYTHONPATH) — most preferred first."""
    source_root = Path(options.source).expanduser().resolve() if options.source else None
    source_path = (
        [str(source_root / "packages" / "core" / "src"), str(source_root / "apps" / "api" / "src")]
        if source_root
        else []
    )
    candidates: list[tuple[str, list[str], list[str]]] = []
    explicit = (options.python or os.environ.get("OPENDIRECTOR_PYTHON") or "").strip()
    if explicit:
        # An explicit interpreter still honours --source, so a checkout can be run
        # with any interpreter that already has the dependencies.
        candidates.append(("system", [explicit], source_path))
    for bundled in BUNDLED_CANDIDATES:
        candidates.append(("bundled", [str(bundled)], []))
    venv = venv_python(data_dir / "runtime" / "venv")
    candidates.append(("venv", [str(venv)], []))
    if source_root:
        for command in SYSTEM_CANDIDATES:
            candidates.append(("source", list(command), source_path))
    for command in SYSTEM_CANDIDATES:
        candidates.append(("system", list(command), []))
    return candidates


def resolve_runtime(data_dir: Path, options: "Options", log: Logger) -> tuple[Runtime | None, str | None]:
    """Returns (runtime, too_old_description)."""
    env = os.environ.copy()
    for source, command, extra_path in python_candidates(data_dir, options):
        if source == "bundled" and not Path(command[0]).is_file():
            continue
        if source == "venv" and not Path(command[0]).is_file():
            continue
        if source == "system" and len(command) == 1 and not shutil.which(command[0]) and not Path(command[0]).is_file():
            continue
        probe_env = env
        if extra_path:
            probe_env = {**env, "PYTHONPATH": os.pathsep.join([*extra_path, env.get("PYTHONPATH", "")]).rstrip(os.pathsep)}
        version = probe_python(command)
        if not version:
            continue
        if not meets_minimum(version):
            return None, f"{' '.join(command)} ({version})"
        log.info(f"runtime candidate {source}: {' '.join(command)} python={version}")
        return Runtime(" ".join(command), version, source, extra_path), None
    return None, None


def pip_install(executable: Sequence[str], args: Sequence[str], env: dict[str, str], on_line: Callable[[str], None]) -> int:
    command = [*executable, "-m", "pip", "install", "--disable-pip-version-check", "--no-input", *args]
    on_line(" ".join(command))
    process = subprocess.Popen(
        list(command),
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        errors="replace",
    )
    assert process.stdout is not None
    for line in process.stdout:
        line = line.rstrip()
        if line:
            on_line(line)
    return process.wait()


def ensure_runtime(data_dir: Path, options: "Options", strings: Strings, log: Logger) -> Runtime:
    """Finds or creates a Python runtime that can run the OpenDirector service.

    Order: bundled runtime (created by install.ps1) → a virtual environment in the
    data directory → a source checkout → a system interpreter. Installing never
    touches the application directory, so an update can replace it freely.
    """
    log.info(strings.t("msg.checking_runtime"))
    runtime, too_old = resolve_runtime(data_dir, options, log)
    if runtime is None and too_old:
        raise LaunchError(EXIT_RUNTIME, "err.runtime_version", minimum=".".join(map(str, MINIMUM_PYTHON)), found=too_old)
    if runtime is None:
        raise LaunchError(EXIT_RUNTIME, "err.runtime_missing", minimum=".".join(map(str, MINIMUM_PYTHON)))

    env = os.environ.copy()
    if runtime.python_path:
        env["PYTHONPATH"] = os.pathsep.join([*runtime.python_path, env.get("PYTHONPATH", "")]).rstrip(os.pathsep)
    if has_package(runtime.executable.split(" ") if " " in runtime.executable else [runtime.executable], env):
        return runtime

    # Nothing has OpenDirector yet: create an environment in user data and install.
    venv_dir = data_dir / "runtime" / "venv"
    venv_py = venv_python(venv_dir)
    print(strings.t("msg.installing_runtime", target=venv_dir))

    def on_line(line: str) -> None:
        log.info(line)

    if not venv_py.is_file():
        created = run([*runtime.executable.split(" "), "-m", "venv", str(venv_dir)], timeout=600)
        log.info(created.stdout.strip() or created.stderr.strip())
        if not venv_py.is_file():
            raise LaunchError(EXIT_RUNTIME, "err.install_failed", created.stderr.strip()[-800:])

    packages: list[str] = []
    wheels = options.wheels or WHEELS_DIR
    if wheels and Path(wheels).is_dir() and any(Path(wheels).glob("*.whl")):
        packages += ["--no-index", "--find-links", str(wheels)]
    else:
        index = options.index_url or os.environ.get("OPENDIRECTOR_PIP_INDEX_URL")
        if index:
            packages += ["--index-url", index]
    if options.source:
        packages += ["-e", str(options.source)]
    else:
        packages += ["opendirector"]
    packages += ["psutil"]

    if pip_install([str(venv_py)], packages, env, on_line) != 0:
        raise LaunchError(EXIT_RUNTIME, "err.install_failed")
    if not has_package([str(venv_py)]):
        raise LaunchError(EXIT_RUNTIME, "err.install_failed")

    probe = probe_python([str(venv_py)])
    return Runtime(str(venv_py), probe or runtime.version, "venv", [])


# --------------------------------------------------------------------------------------
# Media tools
# --------------------------------------------------------------------------------------

FFMPEG_ZIP = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"


def find_tool(name: str) -> str | None:
    executable = f"{name}.exe" if IS_WINDOWS else name
    local = BIN_DIR / executable
    if local.is_file():
        return str(local)
    return shutil.which(executable)


def ensure_media_tools(options: "Options", strings: Strings, log: Logger) -> None:
    if find_tool("ffmpeg") and find_tool("ffprobe"):
        return
    if not IS_WINDOWS or options.no_tools:
        log.warn(f"ffmpeg/ffprobe not found; media features will be limited ({strings.t('check.missing')})")
        return
    print(strings.t("msg.installing_tools"))
    try:
        BIN_DIR.mkdir(parents=True, exist_ok=True)
        with tempfile.TemporaryDirectory() as tmp:
            archive = Path(tmp) / "ffmpeg.zip"
            urllib.request.urlretrieve(options.ffmpeg_url or FFMPEG_ZIP, archive)
            with zipfile.ZipFile(archive) as bundle:
                for member in bundle.namelist():
                    if member.endswith(("bin/ffmpeg.exe", "bin/ffprobe.exe")):
                        target = BIN_DIR / Path(member).name
                        with bundle.open(member) as source, open(target, "wb") as sink:
                            shutil.copyfileobj(source, sink)
    except Exception as error:  # network, permissions, blocked download
        log.warn(f"could not fetch ffmpeg: {error}")
        return
    log.info("ffmpeg: " + str(find_tool("ffmpeg")))


# --------------------------------------------------------------------------------------
# Ports and health
# --------------------------------------------------------------------------------------


def port_is_free(port: int, host: str = "127.0.0.1") -> bool:
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.settimeout(0.3)
        return probe.connect_ex((host, port)) != 0


def reserve_port(preferred: int) -> int:
    for offset in range(PORT_SCAN):
        candidate = preferred + offset
        if candidate > 65535:
            break
        if port_is_free(candidate):
            return candidate
    with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
        probe.bind(("127.0.0.1", 0))
        return int(probe.getsockname()[1])


def wait_for_health(url: str, timeout: float, is_alive: Callable[[], bool]) -> bool:
    deadline = time.time() + timeout
    request = urllib.request.Request(
        f"{url}/api/health",
        headers={REQUEST_HEADER: "1", "Accept": "application/json"},
    )
    while time.time() < deadline:
        if not is_alive():
            return False
        try:
            with urllib.request.urlopen(request, timeout=1.5) as response:
                if 200 <= response.status < 300:
                    return True
        except (urllib.error.URLError, OSError):
            pass
        time.sleep(HEALTH_INTERVAL)
    return False


def serves_workspace(url: str) -> bool:
    """The API only mounts the workspace when the built interface exists."""
    try:
        request = urllib.request.Request(url, headers={REQUEST_HEADER: "1"})
        with urllib.request.urlopen(request, timeout=5) as response:
            body = response.read(8192).decode("utf-8", "replace")
    except (urllib.error.URLError, OSError):
        return False
    return 'id="root"' in body


def classify_failure(output: str) -> LaunchError:
    lowered = output.lower()
    if "address already in use" in lowered or "10048" in lowered or "eaddrinuse" in lowered:
        return LaunchError(EXIT_PORT, "err.port_unavailable", port="")
    if "no module named" in lowered:
        module = re.search(r"No module named '([^']+)'", output, re.IGNORECASE)
        name = module.group(1) if module else "a dependency"
        if name.startswith("opendirector"):
            return LaunchError(EXIT_RUNTIME, "err.runtime_missing", minimum=".".join(map(str, MINIMUM_PYTHON)))
        return LaunchError(EXIT_SERVICE_EXITED, "err.dependency_missing", detail=name)
    if "ffmpeg" in lowered or "ffprobe" in lowered:
        return LaunchError(EXIT_SERVICE_EXITED, "err.dependency_missing", detail="FFmpeg")
    return LaunchError(EXIT_SERVICE_EXITED, "err.service_exited")


# --------------------------------------------------------------------------------------
# Backend process
# --------------------------------------------------------------------------------------


class Backend:
    def __init__(self, runtime: Runtime, port: int, data_dir: Path, log: Logger, log_level: str = "info") -> None:
        self.runtime = runtime
        self.port = port
        self.data_dir = data_dir
        self.log = log
        self.log_level = log_level
        self.process: subprocess.Popen | None = None
        self.output: list[str] = []
        self.url = f"http://127.0.0.1:{port}"

    def environment(self) -> dict[str, str]:
        env = os.environ.copy()
        path_entries = [str(BIN_DIR)]
        if env.get("PATH"):
            path_entries.append(env["PATH"])
        env.update(
            {
                # Projects, model credentials and caches live in user data.
                "OPENDIRECTOR_ROOT": str(self.data_dir),
                "OPENDIRECTOR_API_URL": self.url,
                "OPENDIRECTOR_LANGUAGE": env.get("OPENDIRECTOR_LANGUAGE", "en-US"),
                "OPENDIRECTOR_DESKTOP": "1",
                "PYTHONUNBUFFERED": "1",
                "PYTHONUTF8": "1",
                "PYTHONIOENCODING": "utf-8",
                "PATH": os.pathsep.join(path_entries),
                "NO_PROXY": ",".join([value for value in (env.get("NO_PROXY"), "127.0.0.1", "localhost") if value]),
                "no_proxy": ",".join([value for value in (env.get("no_proxy"), "127.0.0.1", "localhost") if value]),
            }
        )
        if self.runtime.python_path:
            env["PYTHONPATH"] = os.pathsep.join([*self.runtime.python_path, env.get("PYTHONPATH", "")]).rstrip(os.pathsep)
        return env

    def start(self, strings: Strings, timeout: float = HEALTH_TIMEOUT) -> None:
        command = [
            *self.runtime.executable.split(" "),
            "-m",
            "opendirector_api.server",
            "--port",
            str(self.port),
            "--log-level",
            self.log_level,
        ]
        self.log.info(" ".join(command))
        try:
            self.process = subprocess.Popen(
                command,
                cwd=str(self.data_dir),
                env=self.environment(),
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                errors="replace",
                start_new_session=not IS_WINDOWS,
            )
        except OSError as error:
            raise LaunchError(EXIT_RUNTIME, "err.runtime_missing", str(error), minimum=".".join(map(str, MINIMUM_PYTHON))) from error
        self._pump_output()
        if not wait_for_health(self.url, timeout, is_alive=lambda: self.alive()):
            tail = "\n".join(self.tail(20))
            if self.process.poll() is not None:
                raise classify_failure(tail)
            raise LaunchError(EXIT_SERVICE_TIMEOUT, "err.service_timeout", port=self.port, seconds=int(timeout))
        if not serves_workspace(self.url):
            raise LaunchError(EXIT_WEB_MISSING, "err.web_missing")

    def _pump_output(self) -> None:
        assert self.process is not None and self.process.stdout is not None
        stream = self.process.stdout

        def reader() -> None:
            for line in stream:
                line = line.rstrip()
                self.output.append(line)
                if len(self.output) > 400:
                    self.output.pop(0)
                self.log.write(f"service: {line}")

        threading.Thread(target=reader, daemon=True).start()

    def alive(self) -> bool:
        return self.process is not None and self.process.poll() is None

    def tail(self, count: int = 20) -> list[str]:
        return self.output[-count:]

    def stop(self, grace: float = STOP_GRACE) -> None:
        process = self.process
        self.process = None
        if process is None or process.poll() is not None:
            return
        try:
            import psutil  # type: ignore

            handle = psutil.Process(process.pid)
            children = handle.children(recursive=True)
            handle.terminate()
            gone, alive = psutil.wait_procs([handle, *children], timeout=grace)
            for survivor in alive:
                survivor.kill()
            return
        except Exception:
            pass
        # Fallback without psutil: terminate, then kill the whole tree on Windows.
        try:
            process.terminate()
            process.wait(timeout=grace)
            return
        except Exception:
            pass
        if IS_WINDOWS:
            subprocess.run(
                ["taskkill", "/PID", str(process.pid), "/T", "/F"],
                stdout=subprocess.DEVNULL,
                stderr=subprocess.DEVNULL,
                check=False,
            )
        else:
            try:
                os.killpg(os.getpgid(process.pid), 9)
            except OSError:
                pass
        try:
            process.wait(timeout=5)
        except Exception:
            process.kill()


# --------------------------------------------------------------------------------------
# Application window
# --------------------------------------------------------------------------------------


def browser_candidates() -> list[Path]:
    if IS_WINDOWS:
        roots = [
            os.environ.get("ProgramFiles(x86)"),
            os.environ.get("ProgramFiles"),
            os.environ.get("LOCALAPPDATA"),
        ]
        relative = [
            ("Microsoft", "Edge", "Application", "msedge.exe"),
            ("Google", "Chrome", "Application", "chrome.exe"),
        ]
        found: list[Path] = []
        for root in roots:
            if not root:
                continue
            for parts in relative:
                candidate = Path(root).joinpath(*parts)
                if candidate.is_file() and candidate not in found:
                    found.append(candidate)
        return found
    candidates = []
    for name in ("microsoft-edge", "google-chrome", "chromium", "chromium-browser"):
        found_path = shutil.which(name)
        if found_path:
            candidates.append(Path(found_path))
    return candidates


def open_app_window(url: str, profile: Path, strings: Strings, log: Logger) -> subprocess.Popen | None:
    browser = browser_candidates()
    if not browser:
        raise LaunchError(EXIT_BROWSER, "err.browser_missing", url=url)
    profile.mkdir(parents=True, exist_ok=True)
    command = [
        str(browser[0]),
        f"--app={url}",
        f"--user-data-dir={profile}",
        "--window-size=1440,900",
        "--no-first-run",
        "--no-default-browser-check",
        "--disable-features=Translate",
    ]
    log.info(" ".join(command))
    try:
        return subprocess.Popen(command, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    except OSError as error:
        raise LaunchError(EXIT_BROWSER, "err.browser_missing", f"{error} {url}") from error


def app_window_is_open(profile: Path, starter: subprocess.Popen | None) -> bool:
    """True while at least one browser process owns our dedicated profile."""
    marker = str(profile).lower()
    try:
        import psutil  # type: ignore

        for process in psutil.process_iter(["cmdline"]):
            try:
                cmdline = process.info.get("cmdline") or []
            except Exception:
                continue
            if any(marker in str(part).lower() for part in cmdline):
                return True
        return False
    except Exception:
        pass
    if starter is not None and starter.poll() is None:
        return True
    if IS_WINDOWS:
        names = ("msedge.exe", "chrome.exe")
        query = " or ".join(f"name='{name}'" for name in names)
        result = subprocess.run(
            [
                "powershell",
                "-NoProfile",
                "-Command",
                f"(Get-CimInstance Win32_Process -Filter \"{query}\" | "
                f"Where-Object {{ $_.CommandLine -like '*{marker}*' }} | Measure-Object).Count",
            ],
            stdout=subprocess.PIPE,
            stderr=subprocess.DEVNULL,
            text=True,
            check=False,
        )
        return result.stdout.strip().isdigit() and int(result.stdout.strip()) > 0
    return False


# --------------------------------------------------------------------------------------
# State
# --------------------------------------------------------------------------------------


def read_state(path: Path) -> dict:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else {}
    except (OSError, ValueError):
        return {}


def write_state(path: Path, state: dict) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        temporary = path.with_suffix(".tmp")
        temporary.write_text(json.dumps(state, indent=2), encoding="utf-8")
        temporary.replace(path)
    except OSError:
        pass


# --------------------------------------------------------------------------------------
# Options and commands
# --------------------------------------------------------------------------------------


@dataclass
class Options:
    port: int | None = None
    data_dir: str | None = None
    source: str | None = None
    python: str | None = None
    wheels: str | None = None
    index_url: str | None = None
    ffmpeg_url: str | None = None
    log_level: str = "info"
    language: str | None = None
    no_browser: bool = False
    no_tools: bool = False
    quiet: bool = False
    force: bool = False
    exit_after_ready: bool = False
    timeout: float | None = None
    command: str = "run"


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="opendirector_app.py", description=f"{APP_NAME} desktop launcher")
    # No `default` here: argparse overwrites a store_const flag that shares this dest
    # with a positional string default. The default is applied after parsing instead.
    parser.add_argument("command", nargs="?", choices=("run", "install", "check", "update"))
    parser.add_argument("--port", type=int)
    parser.add_argument("--data-dir")
    parser.add_argument("--source", help="OpenDirector source checkout to run from")
    parser.add_argument("--python", help="interpreter to run the service")
    parser.add_argument("--wheels", help="directory of wheels for an offline install")
    parser.add_argument("--index-url", help="package index mirror")
    parser.add_argument("--ffmpeg-url", help="zip archive containing bin/ffmpeg.exe and bin/ffprobe.exe")
    parser.add_argument("--log-level", default="info", choices=("debug", "info", "warning", "error"))
    parser.add_argument("--language", choices=("zh-CN", "en-US"))
    parser.add_argument("--no-browser", action="store_true", help="start the service without opening a window")
    parser.add_argument("--no-tools", action="store_true", help="do not download ffmpeg")
    parser.add_argument("--quiet", action="store_true", help="write to the log file only")
    parser.add_argument("--force", action="store_true", help="with install/update: rebuild the environment")
    # Friendly aliases: `--check` reads better than a bare `check` when the launcher is
    # double-clicked from a shortcut or run from a console by hand.
    # A separate dest is required: argparse lets the optional positional overwrite any
    # value an option wrote to `command`. `resolve_command()` merges the two.
    parser.add_argument("--check", dest="command_flag", action="store_const", const="check",
                        help="print a diagnostics report and exit")
    parser.add_argument("--install", dest="command_flag", action="store_const", const="install",
                        help="install or repair the private runtime")
    parser.add_argument("--update", dest="command_flag", action="store_const", const="update",
                        help="upgrade OpenDirector inside the private runtime")
    parser.add_argument("--exit-after-ready", action="store_true", help=argparse.SUPPRESS)
    parser.add_argument("--timeout", type=float, help=argparse.SUPPRESS)
    return parser


def command_check(options: Options, strings: Strings, log: Logger) -> int:
    data_dir = resolve_data_dir(options.data_dir)
    state = read_state(data_dir / "state.json")
    runtime, too_old = resolve_runtime(data_dir, options, log)
    package_ok = bool(runtime) and has_package(runtime.executable.split(" "))
    port = options.port or int(state.get("port") or DEFAULT_PORT)
    rows = [
        (strings.t("check.app"), f"{APP_NAME} {version()} ({APP_HOME})"),
        (strings.t("check.python"), f"{runtime.version} [{runtime.source}]" if runtime else (too_old or strings.t("check.missing"))),
        (strings.t("check.package"), strings.t("check.ok") if package_ok else strings.t("check.missing")),
        (strings.t("check.ffmpeg"), find_tool("ffmpeg") or strings.t("check.missing")),
        (strings.t("check.ffprobe"), find_tool("ffprobe") or strings.t("check.missing")),
        (strings.t("check.data"), str(data_dir)),
        (strings.t("check.logs"), str(data_dir / "logs")),
        (strings.t("check.port"), f"{port} ({strings.t('check.free') if port_is_free(port) else strings.t('check.busy')})"),
        (strings.t("check.browser"), str(browser_candidates()[0]) if browser_candidates() else strings.t("check.missing")),
    ]
    width = max(len(label) for label, _ in rows)
    print(strings.t("check.title"))
    for label, value in rows:
        print(f"  {label.ljust(width)}  {value}")
    if not package_ok:
        print(f"\n{strings.t('check.hint')}")
        return EXIT_RUNTIME
    return EXIT_OK


def command_install(options: Options, strings: Strings, log: Logger) -> int:
    data_dir = resolve_data_dir(options.data_dir)
    data_dir.mkdir(parents=True, exist_ok=True)
    venv_dir = data_dir / "runtime" / "venv"
    if options.force and venv_dir.exists():
        shutil.rmtree(venv_dir, ignore_errors=True)
    runtime = ensure_runtime(data_dir, options, strings, log)
    ensure_media_tools(options, strings, log)
    print(strings.t("install.done"))
    log.info(f"installed runtime={runtime.source} python={runtime.version}")
    print(strings.t("msg.diagnostics", path=log.path))
    return EXIT_OK


def command_update(options: Options, strings: Strings, log: Logger) -> int:
    data_dir = resolve_data_dir(options.data_dir)
    venv_py = venv_python(data_dir / "runtime" / "venv")
    if not venv_py.is_file():
        return command_install(options, strings, log)
    env = os.environ.copy()
    args: list[str] = []
    index = options.index_url or os.environ.get("OPENDIRECTOR_PIP_INDEX_URL")
    if index:
        args += ["--index-url", index]
    args += ["--upgrade"]
    args += ["-e", options.source] if options.source else ["opendirector"]
    code = pip_install([str(venv_py)], args, env, log.info)
    if code != 0:
        raise LaunchError(EXIT_RUNTIME, "err.install_failed")
    ensure_media_tools(options, strings, log)
    print(strings.t("update.done"))
    return EXIT_OK


def command_run(options: Options, strings: Strings, log: Logger) -> int:
    data_dir = resolve_data_dir(options.data_dir)
    for directory in (data_dir, data_dir / "logs"):
        directory.mkdir(parents=True, exist_ok=True)
    state_path = data_dir / "state.json"
    state = read_state(state_path)

    runtime = ensure_runtime(data_dir, options, strings, log)
    ensure_media_tools(options, strings, log)

    print(strings.t("msg.reserving_port"))
    preferred = options.port or int(state.get("port") or DEFAULT_PORT)
    port = reserve_port(preferred)
    if port != preferred:
        log.warn(f"port {preferred} busy, using {port}")

    backend = Backend(runtime, port, data_dir, log, log_level=options.log_level)
    print(strings.t("msg.starting_service", version=runtime.version))
    backend.start(strings)
    write_state(state_path, {**state, "port": port, "version": STATE_VERSION})
    print(strings.t("msg.ready", url=backend.url))

    window = None
    if not options.no_browser:
        print(strings.t("msg.opening_window"))
        window = open_app_window(backend.url, data_dir / "browser-profile", strings, log)
        print(strings.t("msg.press_ctrl_c"))

    if options.exit_after_ready:
        backend.stop()
        return EXIT_OK

    deadline = time.time() + options.timeout if options.timeout else None
    exit_code = EXIT_OK
    try:
        while True:
            time.sleep(POLL_INTERVAL)
            if deadline and time.time() > deadline:
                break
            if not backend.alive():
                if options.no_browser:
                    log.error("service exited")
                    exit_code = EXIT_SERVICE_EXITED
                    break
                print(strings.t("msg.service_lost"))
                backend.start(strings, timeout=30)
                continue
            if window is not None and not app_window_is_open(data_dir / "browser-profile", window):
                print(strings.t("msg.window_closed"))
                break
    except KeyboardInterrupt:
        pass
    finally:
        print(strings.t("msg.stopping"))
        backend.stop()
        print(strings.t("msg.stopped", data=data_dir))
    return exit_code


def resolve_command(args: argparse.Namespace) -> str:
    """Merge the positional command with the `--check` style aliases.

    `--check` is what the console launcher documents, but argparse gives the optional
    positional the last word on any dest it shares, so the alias needs its own dest.
    """
    return args.command or args.command_flag or "run"


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    options = Options(
        port=args.port,
        data_dir=args.data_dir,
        source=args.source,
        python=args.python,
        wheels=args.wheels,
        index_url=args.index_url,
        ffmpeg_url=args.ffmpeg_url,
        log_level=args.log_level,
        language=args.language,
        no_browser=args.no_browser,
        no_tools=args.no_tools,
        quiet=args.quiet,
        force=args.force,
        exit_after_ready=args.exit_after_ready,
        timeout=args.timeout,
        command=resolve_command(args),
    )
    data_dir = resolve_data_dir(options.data_dir)
    log = Logger(data_dir / "logs", quiet=options.quiet)
    strings = Strings(options.language or system_locale())
    log.info(f"{APP_NAME} {version()} launcher starting (python={sys.version.split()[0]})")

    handlers = {
        "run": command_run,
        "install": command_install,
        "check": command_check,
        "update": command_update,
    }
    try:
        return handlers[options.command](options, strings, log)
    except LaunchError as error:
        title = error.title(strings)
        body = error.body(strings, log.path)
        log.error(f"{error.message_key}: {error.detail}")
        print(f"\n{title}\n{body}", file=sys.stderr)
        show_message_box(title, body)
        return error.code
    except KeyboardInterrupt:
        return EXIT_OK
    except Exception as error:  # noqa: BLE001 - the launcher must never show a traceback
        log.error(f"unexpected: {error!r}")
        print(f"\n{strings.t('err.unknown.body')}\n\n{error!r}", file=sys.stderr)
        show_message_box(strings.t("err.title"), strings.t("err.unknown.body"))
        return EXIT_UNEXPECTED
    finally:
        log.close()


if __name__ == "__main__":
    raise SystemExit(main())
