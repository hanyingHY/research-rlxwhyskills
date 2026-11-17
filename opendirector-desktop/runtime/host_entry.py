#!/usr/bin/env python3
"""Desktop Host: run the OpenDirector local API under an owned control channel.

Why a wrapper instead of `opendirector serve`:
  * the port is OS-assigned (port 0) and reported only after the socket is bound;
  * every /api request must carry the per-launch bearer token;
  * the Electron main process gets an explicit lifecycle protocol on stdio
    (ready / fatal / status / shutdown-complete) instead of scraping log lines;
  * stdin EOF (the shell crashed) triggers a clean shutdown instead of leaving an
    orphaned backend holding project locks.

This file is deliberately small. A production version should live in
`apps/api/src/opendirector_api/` and be covered by the repository's Python suite.
"""
from __future__ import annotations

import argparse
import hmac
import json
import os
import signal
import socket
import sys
import threading
import time
from typing import Any

CONTROL_PREFIX = "@@OPENDIRECTOR@@ "
ACTIVE_TASK_STATES = {"queued", "running"}


def emit(message_type: str, **fields: Any) -> None:
    """One control line on stdout. uvicorn logs go to stderr."""
    record = {"type": message_type, **fields}
    sys.stdout.write(CONTROL_PREFIX + json.dumps(record, ensure_ascii=False) + "\n")
    sys.stdout.flush()


class Counter:
    def __init__(self) -> None:
        self._lock = threading.Lock()
        self._value = 0

    def enter(self) -> None:
        with self._lock:
            self._value += 1

    def leave(self) -> None:
        with self._lock:
            self._value = max(0, self._value - 1)

    @property
    def value(self) -> int:
        with self._lock:
            return self._value


class DesktopAuth:
    """Pure ASGI auth gate.

    Not BaseHTTPMiddleware: the image-selection preview cancels inference when
    the browser disconnects, and a buffering middleware would hide that signal.
    """

    def __init__(self, app, token: str) -> None:
        self.app = app
        self.expected = f"Bearer {token}".encode("latin-1")

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http" or not scope["path"].startswith("/api/"):
            await self.app(scope, receive, send)
            return
        supplied = b""
        for key, value in scope["headers"]:
            if key.lower() == b"authorization":
                supplied = value
                break
        if not hmac.compare_digest(supplied, self.expected):
            body = json.dumps(
                {
                    "detail": "This request did not come from the desktop application.",
                    "code": "desktop_unauthorized",
                }
            ).encode()
            await send(
                {
                    "type": "http.response.start",
                    "status": 401,
                    "headers": [
                        (b"content-type", b"application/json"),
                        (b"content-length", str(len(body)).encode()),
                        (b"cache-control", b"no-store"),
                    ],
                }
            )
            await send({"type": "http.response.body", "body": body})
            return
        await self.app(scope, receive, send)


class InFlight:
    """Count requests that have not finished, including streamed responses."""

    def __init__(self, app, counter: Counter) -> None:
        self.app = app
        self.counter = counter

    async def __call__(self, scope, receive, send):
        if scope["type"] != "http":
            await self.app(scope, receive, send)
            return
        self.counter.enter()
        try:
            await self.app(scope, receive, send)
        finally:
            self.counter.leave()


def collect_busy(port: int, token: str) -> dict:
    """Read task state through the public API instead of duplicating services.

    Tool tasks are authoritative here. Agent turns and generation jobs are not
    exposed by a stable endpoint yet; they are reported as unknown so the shell
    can warn instead of pretending the application is idle.
    """
    import httpx

    headers = {
        "Authorization": f"Bearer {token}",
        "X-OpenDirector-Request": "1",
        "Accept-Language": "en-US",
    }
    active: list[dict] = []
    projects = 0
    with httpx.Client(
        base_url=f"http://127.0.0.1:{port}",
        headers=headers,
        timeout=httpx.Timeout(2.0, connect=1.0),
        trust_env=False,
    ) as client:
        listing = client.get("/api/creation/projects").json()
        projects = len(listing.get("projects", []))
        for project in listing.get("projects", [])[:64]:
            project_id = project["id"]
            tasks = client.get(f"/api/creation/projects/{project_id}/tool-tasks").json()
            for task in tasks.get("tasks", []):
                if task.get("status") in ACTIVE_TASK_STATES:
                    active.append(
                        {
                            "projectId": project_id,
                            "taskId": task.get("id"),
                            "tool": task.get("tool"),
                            "status": task.get("status"),
                        }
                    )
    return {
        "projects": projects,
        "activeToolTasks": active,
        "busy": bool(active),
        "notExposed": ["agentTurns", "generationJobs"],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="OpenDirector desktop Host")
    parser.add_argument("--port", type=int, default=0, help="0 lets the OS choose")
    parser.add_argument("--log-level", default="info")
    parser.add_argument("--access-log", action="store_true")
    args = parser.parse_args()

    token = os.environ.get("OPENDIRECTOR_DESKTOP_TOKEN", "")
    if len(token) < 32:
        emit("fatal", message="The desktop credential is missing or too short.",
             detail="OPENDIRECTOR_DESKTOP_TOKEN must be set by the desktop shell.")
        return 2

    try:
        from opendirector_api.main import create_app
        from opendirector_api.server import logging_config
    except Exception as error:  # import path problem is a packaging defect
        emit("fatal", message="The OpenDirector Python packages could not be imported.",
             detail=f"{type(error).__name__}: {error}")
        return 2

    listener = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    try:
        listener.bind(("127.0.0.1", args.port))
        listener.listen(2048)
    except OSError as error:
        emit("fatal", message="The local API could not bind to 127.0.0.1.",
             detail=str(error))
        return 2

    port = listener.getsockname()[1]
    started_at = time.time()
    counter = Counter()

    def build():
        application = create_app()
        application.add_middleware(InFlight, counter=counter)
        application.add_middleware(DesktopAuth, token=token)

        from starlette.responses import JSONResponse

        @application.get("/api/desktop/status")
        def desktop_status():
            value: dict[str, Any] = {
                "status": "ready",
                "pid": os.getpid(),
                "port": port,
                "uptimeSeconds": round(time.time() - started_at, 1),
                "inFlight": max(0, counter.value - 1),
            }
            try:
                value.update(collect_busy(port, token))
            except Exception as error:
                value.update({"busy": False, "notExposed": ["taskState"], "reason": type(error).__name__})
            response = JSONResponse(value)
            response.headers["Cache-Control"] = "no-store"
            return response

        return application

    import uvicorn

    try:
        application = build()
    except Exception as error:
        emit("fatal", message="The OpenDirector API failed to initialise.",
             detail=f"{type(error).__name__}: {error}")
        return 2

    config = uvicorn.Config(
        application,
        host="127.0.0.1",
        port=port,
        log_config=logging_config(args.log_level),
        access_log=args.access_log,
        lifespan="on",
        proxy_headers=False,
    )
    server = uvicorn.Server(config)
    finished = threading.Event()

    def run() -> None:
        try:
            server.run(sockets=[listener])
        except BaseException as error:  # surfaced to the shell, never swallowed
            emit("fatal", message="The OpenDirector API stopped unexpectedly.",
                 detail=f"{type(error).__name__}: {error}")
        finally:
            finished.set()

    worker = threading.Thread(target=run, name="opendirector-host", daemon=True)
    worker.start()

    deadline = time.time() + 60
    while time.time() < deadline:
        if getattr(server, "started", False):
            break
        if finished.is_set():
            emit("fatal", message="The OpenDirector API exited during startup.")
            return 2
        time.sleep(0.05)
    else:
        emit("fatal", message="The OpenDirector API did not start in time.")
        server.should_exit = True
        return 2

    def stop(_signum=None, _frame=None) -> None:
        server.should_exit = True

    # uvicorn installs signal handlers only in the main thread; this process
    # owns the socket from the main thread while uvicorn runs in a worker.
    for name in ("SIGTERM", "SIGINT", "SIGHUP"):
        if hasattr(signal, name):
            try:
                signal.signal(getattr(signal, name), stop)
            except (OSError, ValueError):
                pass

    def watch_stdin() -> None:
        for line in sys.stdin:
            try:
                command = json.loads(line)
            except ValueError:
                continue
            kind = command.get("type")
            if kind == "shutdown":
                server.should_exit = True
            elif kind == "status":
                emit("status", pid=os.getpid(), port=port, inFlight=counter.value)
        # EOF means the desktop shell is gone; never leave an orphan behind.
        server.should_exit = True

    threading.Thread(target=watch_stdin, name="opendirector-stdin", daemon=True).start()

    emit("ready", port=port, pid=os.getpid(), version=os.environ.get("OPENDIRECTOR_VERSION", ""))
    worker.join()
    listening_closed = True
    try:
        listener.close()
    except OSError:
        listening_closed = False
    emit("shutdown-complete", port=port, socketClosed=listening_closed)
    return 0


if __name__ == "__main__":
    sys.exit(main())
