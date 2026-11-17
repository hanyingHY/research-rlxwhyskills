"""Tests for the OpenDirector desktop launcher.

Run them anywhere Python 3.11+ is available:

    python3 windows/tests/test_launcher.py            # or: python3 -m unittest discover -s windows/tests

They exercise the shipped launcher, not a copy of it: the end-to-end test starts
`opendirector_app.py` as a subprocess against a stub API, which makes the real
startup, supervision and shutdown path run on this machine.
"""

from __future__ import annotations

import json
import os
import socket
import subprocess
import sys
import tempfile
import threading
import time
import unittest
from unittest import mock
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path

TESTS = Path(__file__).resolve().parent
WINDOWS = TESTS.parent
APP = WINDOWS / "app"
sys.path.insert(0, str(APP))

import opendirector_app as app  # noqa: E402  (import after path setup)

STUB_PACKAGE = TESTS / "stubpkg"


# ----------------------------------------------------------------------------------
# Localization
# ----------------------------------------------------------------------------------


class TestStrings(unittest.TestCase):
    def test_both_locales_share_the_same_keys(self) -> None:
        catalog = json.loads((APP / "lib" / "strings.json").read_text(encoding="utf-8"))
        self.assertEqual(set(catalog), {"en-US", "zh-CN"})
        english = set(catalog["en-US"])
        chinese = set(catalog["zh-CN"])
        self.assertEqual(english - chinese, set(), "keys missing from zh-CN")
        self.assertEqual(chinese - english, set(), "keys missing from en-US")

    def test_no_empty_strings_and_matching_placeholders(self) -> None:
        import re

        catalog = json.loads((APP / "lib" / "strings.json").read_text(encoding="utf-8"))
        for locale, table in catalog.items():
            for key, value in table.items():
                self.assertTrue(value.strip(), f"{locale}:{key} is empty")
        english, chinese = catalog["en-US"], catalog["zh-CN"]
        for key, value in english.items():
            placeholders = sorted(re.findall(r"\{(\w+)\}", value))
            translated = sorted(re.findall(r"\{(\w+)\}", chinese[key]))
            self.assertEqual(placeholders, translated, f"placeholder mismatch in {key}")

    def test_translation_falls_back_to_english(self) -> None:
        strings = app.Strings("fr-FR")
        self.assertEqual(strings.locale, "en-US")
        self.assertIn("OpenDirector", strings.t("app.title"))

    def test_interpolation(self) -> None:
        strings = app.Strings("en-US")
        self.assertIn("8010", strings.t("msg.waiting_service", port=8010))

    def test_system_locale_prefers_chinese(self) -> None:
        saved = os.environ.get("LANG")
        try:
            os.environ["LANG"] = "zh_CN.UTF-8"
            self.assertEqual(app.system_locale(), "zh-CN")
            os.environ["LANG"] = "en_US.UTF-8"
            self.assertEqual(app.system_locale(), "en-US")
        finally:
            if saved is None:
                os.environ.pop("LANG", None)
            else:
                os.environ["LANG"] = saved


# ----------------------------------------------------------------------------------
# Ports
# ----------------------------------------------------------------------------------


class TestPorts(unittest.TestCase):
    def test_a_free_port_is_preferred(self) -> None:
        port = app.reserve_port(21_000)
        self.assertEqual(port, 21_000)

    def test_a_busy_port_is_skipped(self) -> None:
        blocker = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        blocker.setsockopt(socket.SOL_SOCKET, socket.SO_REUSEADDR, 1)
        blocker.bind(("127.0.0.1", 21_100))
        blocker.listen(1)
        try:
            self.assertEqual(app.reserve_port(21_100), 21_101)
        finally:
            blocker.close()


# ----------------------------------------------------------------------------------
# Health and workspace checks
# ----------------------------------------------------------------------------------


class StubServer:
    """Serves /api/health and / exactly like the real service."""

    def __init__(self, serve_index: bool = True) -> None:
        self.hits: list[str] = []
        outer = self

        class Handler(BaseHTTPRequestHandler):
            protocol_version = "HTTP/1.1"

            def do_GET(self) -> None:  # noqa: N802
                outer.hits.append(self.path)
                if self.path == "/api/health":
                    body = b'{"status":"ok"}'
                    self.send_response(200)
                    self.send_header("Content-Type", "application/json")
                elif self.path == "/":
                    body = b'<div id="root"></div>' if serve_index else b"not built"
                    self.send_response(200)
                    self.send_header("Content-Type", "text/html")
                else:
                    body = b"no"
                    self.send_response(404)
                    self.send_header("Content-Type", "text/plain")
                self.send_header("Content-Length", str(len(body)))
                self.end_headers()
                self.wfile.write(body)

            def log_message(self, *args: object) -> None:
                pass

        self.server = ThreadingHTTPServer(("127.0.0.1", 0), Handler)
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    @property
    def url(self) -> str:
        return f"http://127.0.0.1:{self.server.server_address[1]}"

    def close(self) -> None:
        self.server.shutdown()
        self.server.server_close()
        self.thread.join(timeout=5)


class TestHealth(unittest.TestCase):
    def test_health_succeeds_and_index_is_recognized(self) -> None:
        server = StubServer()
        try:
            self.assertTrue(app.wait_for_health(server.url, timeout=5, is_alive=lambda: True))
            self.assertTrue(app.serves_workspace(server.url))
            self.assertIn("/api/health", server.hits)
        finally:
            server.close()

    def test_index_without_the_workspace_is_rejected(self) -> None:
        server = StubServer(serve_index=False)
        try:
            self.assertFalse(app.serves_workspace(server.url))
        finally:
            server.close()

    def test_timeout_is_reported(self) -> None:
        self.assertFalse(
            app.wait_for_health("http://127.0.0.1:1", timeout=0.5, is_alive=lambda: True)
        )

    def test_a_dead_process_stops_the_wait(self) -> None:
        self.assertFalse(
            app.wait_for_health("http://127.0.0.1:1", timeout=30, is_alive=lambda: False)
        )


# ----------------------------------------------------------------------------------
# Failure classification
# ----------------------------------------------------------------------------------


class TestClassification(unittest.TestCase):
    def test_port_conflict(self) -> None:
        error = app.classify_failure("OSError: [Errno 98] address already in use")
        self.assertEqual(error.code, app.EXIT_PORT)

    def test_windows_socket_error(self) -> None:
        error = app.classify_failure("[WinError 10048] Only one usage of each socket address")
        self.assertEqual(error.code, app.EXIT_PORT)

    def test_missing_dependency(self) -> None:
        error = app.classify_failure("ModuleNotFoundError: No module named 'uvicorn'")
        self.assertEqual(error.code, app.EXIT_SERVICE_EXITED)
        self.assertEqual(error.message_key, "err.dependency_missing")

    def test_missing_opendirector_is_a_runtime_problem(self) -> None:
        error = app.classify_failure("ModuleNotFoundError: No module named 'opendirector_api'")
        self.assertEqual(error.code, app.EXIT_RUNTIME)

    def test_unknown_output_is_a_plain_exit(self) -> None:
        self.assertEqual(app.classify_failure("something odd").message_key, "err.service_exited")


# ----------------------------------------------------------------------------------
# Runtime resolution
# ----------------------------------------------------------------------------------


class TestRuntime(unittest.TestCase):
    def make_options(self, **overrides: object) -> app.Options:
        options = app.Options()
        for key, value in overrides.items():
            setattr(options, key, value)
        return options

    def test_an_old_interpreter_is_reported_with_its_version(self) -> None:
        with mock.patch.object(app, "SYSTEM_CANDIDATES", [["python3"]]), mock.patch.object(
            app, "probe_python", return_value="3.9.6"
        ):
            runtime, too_old = app.resolve_runtime(Path("/tmp"), self.make_options(), app.Logger(Path("/tmp")))  # type: ignore[arg-type]
        self.assertIsNone(runtime)
        self.assertIn("3.9.6", too_old or "")

    def test_the_first_usable_candidate_wins(self) -> None:
        with mock.patch.object(app, "SYSTEM_CANDIDATES", [["python3"]]), mock.patch.object(
            app, "probe_python", return_value="3.12.7"
        ):
            runtime, _ = app.resolve_runtime(Path("/tmp"), self.make_options(), app.Logger(Path("/tmp")))  # type: ignore[arg-type]
        self.assertIsNotNone(runtime)
        self.assertEqual(runtime.version, "3.12.7")

    def test_source_checkout_adds_pythonpath_entries(self) -> None:
        options = self.make_options(source="/repo")
        candidates = app.python_candidates(Path("/tmp"), options)
        self.assertTrue(any(entry[0] == "source" and entry[2] for entry in candidates))
        source_entries = [entry for entry in candidates if entry[0] == "source"]
        self.assertIn("/repo/packages/core/src", source_entries[0][2])

    def test_explicit_interpreter_honours_the_source_checkout(self) -> None:
        options = self.make_options(python="/opt/python", source="/repo")
        first = app.python_candidates(Path("/tmp"), options)[0]
        self.assertEqual(first[1], ["/opt/python"])
        self.assertEqual(len(first[2]), 2)


# ----------------------------------------------------------------------------------
# End-to-end: run the shipped launcher
# ----------------------------------------------------------------------------------


def run_launcher(arguments: list[str], data_dir: Path, env_extra: dict[str, str] | None = None, timeout: float = 120):
    env = os.environ.copy()
    env["PYTHONPATH"] = str(STUB_PACKAGE)
    env["OPENDIRECTOR_TEST"] = "1"
    env.update(env_extra or {})
    return subprocess.run(
        [sys.executable, str(APP / "opendirector_app.py"), "--python", sys.executable, "--data-dir", str(data_dir), *arguments],
        env=env,
        stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT,
        text=True,
        timeout=timeout,
    )


class TestEndToEnd(unittest.TestCase):
    def test_starts_the_service_verifies_it_and_stops_cleanly(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            data_dir = Path(temporary) / "data"
            result = run_launcher(["--no-browser", "--exit-after-ready", "--port", "21600"], data_dir)
            self.assertEqual(result.returncode, 0, result.stdout)
            self.assertIn("OpenDirector is open at http://127.0.0.1:21600", result.stdout)
            # Data, logs and the remembered port all live in the data directory.
            self.assertTrue((data_dir / "logs").is_dir())
            state = json.loads((data_dir / "state.json").read_text(encoding="utf-8"))
            self.assertEqual(state["port"], 21600)
            # The service was stopped, so nothing listens any more.
            time.sleep(0.5)
            with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as probe:
                probe.settimeout(0.5)
                self.assertNotEqual(probe.connect_ex(("127.0.0.1", 21600)), 0)

    def test_a_port_conflict_is_reported_with_the_remedy(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            data_dir = Path(temporary) / "data"
            result = run_launcher(
                ["--no-browser", "--exit-after-ready", "--port", "21700"],
                data_dir,
                env_extra={"STUB_FAIL_MODE": "port_unavailable"},
            )
            self.assertEqual(result.returncode, app.EXIT_PORT, result.stdout)
            self.assertIn("already in use", result.stdout)

    def test_a_missing_dependency_names_the_module(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            data_dir = Path(temporary) / "data"
            result = run_launcher(
                ["--no-browser", "--exit-after-ready", "--port", "21800"],
                data_dir,
                env_extra={"STUB_FAIL_MODE": "dependency"},
            )
            self.assertEqual(result.returncode, app.EXIT_SERVICE_EXITED, result.stdout)
            self.assertIn("uvicorn", result.stdout)

    def test_supervision_stops_the_service_after_a_timeout(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            data_dir = Path(temporary) / "data"
            result = run_launcher(["--no-browser", "--timeout", "3", "--port", "21900"], data_dir, timeout=60)
            self.assertEqual(result.returncode, 0, result.stdout)
            self.assertIn("Stopped.", result.stdout)

    def test_diagnostics_report_a_broken_environment(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            data_dir = Path(temporary) / "data"
            result = run_launcher(["check"], data_dir)
            self.assertIn("OpenDirector diagnostics", result.stdout)
            self.assertIn(str(data_dir), result.stdout)


class TestCommandLine(unittest.TestCase):
    """The console launcher is documented as `--check` / `--install`, so the flag form
    has to behave exactly like the positional command."""

    def command_for(self, argv):
        return app.resolve_command(app.build_parser().parse_args(argv))

    def test_without_a_command_it_runs(self):
        self.assertEqual(self.command_for([]), "run")

    def test_flag_aliases_select_the_same_command(self):
        for flag, command in (("--check", "check"), ("--install", "install"), ("--update", "update")):
            self.assertEqual(self.command_for([flag]), command)
            self.assertEqual(self.command_for([command]), command)

    def test_flags_still_combine_with_other_options(self):
        options = app.build_parser().parse_args(["--check", "--language", "zh-CN", "--port", "8010"])
        self.assertEqual(app.resolve_command(options), "check")
        self.assertEqual(options.language, "zh-CN")
        self.assertEqual(options.port, 8010)

    def test_install_force_rebuilds(self):
        options = app.build_parser().parse_args(["--install", "--force"])
        self.assertEqual(app.resolve_command(options), "install")
        self.assertTrue(options.force)


if __name__ == "__main__":
    unittest.main(verbosity=2)
