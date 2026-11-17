"""Minimal stand-in for the OpenDirector API, used by the desktop host tests.

It accepts the same command line the real module does (`--port`, `--log-level`) and
serves the two requests the shell depends on: `/api/health` and the built page at `/`.
Failure modes are selected with `STUB_FAIL_MODE` so startup error handling can be
exercised without a real backend:

    port_unavailable  prints a bind error and exits
    dependency        prints a ModuleNotFoundError traceback and exits
    exit              exits silently
"""

import argparse
import os
import sys
import time
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

INDEX = b'<!doctype html><html lang="zh-CN"><body><div id="root"></div></body></html>'
HEALTH = b'{"status":"ok"}'
START = time.time()


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"

    def do_GET(self) -> None:  # noqa: N802 - BaseHTTPRequestHandler API
        if self.path == "/api/health":
            delay = float(os.environ.get("STUB_DELAY_SECONDS", "0"))
            if time.time() - START < delay:
                self.respond(503, b'{"status":"starting"}', "application/json")
                return
            self.respond(200, HEALTH, "application/json")
            return
        if self.path == "/":
            self.respond(200, INDEX, "text/html; charset=utf-8")
            return
        self.respond(404, b"not found", "text/plain; charset=utf-8")

    def respond(self, status: int, body: bytes, content_type: str) -> None:
        self.send_response(status)
        self.send_header("Content-Type", content_type)
        self.send_header("Content-Length", str(len(body)))
        self.end_headers()
        self.wfile.write(body)

    def log_message(self, *args: object) -> None:
        # Keep the captured log small and deterministic.
        pass


def main() -> int:
    parser = argparse.ArgumentParser(description="OpenDirector API stub")
    parser.add_argument("--port", type=int, default=8000)
    parser.add_argument("--log-level", default="info")
    arguments = parser.parse_args()

    mode = os.environ.get("STUB_FAIL_MODE")
    if mode == "port_unavailable":
        print(
            "error while attempting to bind on address ('127.0.0.1', %d): "
            "OSError: [Errno 98] address already in use" % arguments.port,
            file=sys.stderr,
            flush=True,
        )
        return 1
    if mode == "dependency":
        print("Traceback (most recent call last):", file=sys.stderr, flush=True)
        print("ModuleNotFoundError: No module named 'uvicorn'", file=sys.stderr, flush=True)
        return 1
    if mode == "exit":
        print("stub exiting on request", file=sys.stderr, flush=True)
        return 1

    server = ThreadingHTTPServer(("127.0.0.1", arguments.port), Handler)
    server.daemon_threads = True
    print(f"stub serving on 127.0.0.1:{arguments.port}", flush=True)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
