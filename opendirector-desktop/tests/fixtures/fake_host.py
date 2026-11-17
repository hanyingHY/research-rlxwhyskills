#!/usr/bin/env python3
"""Minimal Host stand-in for lifecycle tests (stdlib only, no OpenDirector)."""
from __future__ import annotations

import argparse
import hmac
import json
import os
import signal
import sys
import threading
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

PREFIX = "@@OPENDIRECTOR@@ "


def emit(kind: str, **fields) -> None:
    sys.stdout.write(PREFIX + json.dumps({"type": kind, **fields}) + "\n")
    sys.stdout.flush()


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--port", type=int, default=0)
    parser.add_argument("--fail-start", action="store_true")
    parser.add_argument("--start-hang", action="store_true")
    parser.add_argument("--ignore-shutdown", action="store_true")
    parser.add_argument("--busy", action="store_true")
    parser.add_argument("--echo-secret", action="store_true")
    args = parser.parse_args()

    # Environment modes keep the supervisor's fixed argv stable across cases.
    mode = os.environ.get("FAKE_HOST_MODE", "")
    if mode:
        for name in ("fail-start", "start-hang", "ignore-shutdown", "busy", "echo-secret"):
            setattr(args, name.replace("-", "_"), mode == name)

    token = os.environ.get("OPENDIRECTOR_DESKTOP_TOKEN", "")
    if args.echo_secret and token:
        sys.stderr.write(f"fake host booting with token={token}\n")
        sys.stderr.flush()

    if args.fail_start:
        emit("fatal", message="The fake Host refused to start.", detail="induced failure")
        return 2
    if args.start_hang:
        threading.Event().wait()

    class Handler(BaseHTTPRequestHandler):
        protocol_version = "HTTP/1.1"

        def log_message(self, *_args):
            pass

        def authorized(self) -> bool:
            supplied = self.headers.get("Authorization", "").encode("latin-1")
            return hmac.compare_digest(supplied, f"Bearer {token}".encode("latin-1"))

        def reply(self, status: int, payload: dict) -> None:
            body = json.dumps(payload).encode()
            self.send_response(status)
            self.send_header("Content-Type", "application/json")
            self.send_header("Content-Length", str(len(body)))
            self.send_header("Cache-Control", "no-store")
            self.end_headers()
            self.wfile.write(body)

        def do_GET(self):
            if not self.authorized():
                self.reply(401, {"detail": "unauthorized", "code": "desktop_unauthorized"})
                return
            if self.path == "/api/health":
                self.reply(200, {"status": "ok"})
            elif self.path == "/api/desktop/status":
                self.reply(
                    200,
                    {
                        "busy": bool(args.busy),
                        "activeToolTasks": [{"taskId": "t1"}] if args.busy else [],
                        "unknown": [],
                    },
                )
            else:
                self.reply(404, {"detail": "not found"})

    server = ThreadingHTTPServer(("127.0.0.1", args.port), Handler)
    server.daemon_threads = True
    port = server.server_address[1]
    threading.Thread(target=server.serve_forever, daemon=True).start()

    if args.ignore_shutdown:
        signal.signal(signal.SIGTERM, signal.SIG_IGN)

    def shutdown() -> None:
        server.shutdown()
        emit("shutdown-complete", port=port)
        os._exit(0)

    def watch_stdin() -> None:
        for line in sys.stdin:
            try:
                command = json.loads(line)
            except ValueError:
                continue
            if command.get("type") == "shutdown":
                if args.ignore_shutdown:
                    continue
                shutdown()
        shutdown()

    threading.Thread(target=watch_stdin, daemon=True).start()
    emit("ready", port=port, pid=os.getpid(), version="0.0.0-test")
    threading.Event().wait()
    return 0


if __name__ == "__main__":
    sys.exit(main())
