#!/usr/bin/env python3
"""Shared runtime helpers for the research skill family."""

from __future__ import annotations

import json
import os
import subprocess
import sys
from pathlib import Path


sys.dont_write_bytecode = True


def child_env() -> dict[str, str]:
    env = os.environ.copy()
    env["PYTHONDONTWRITEBYTECODE"] = "1"
    return env


def python_args(script: object, *args: object) -> list[str]:
    return [str(script), *(str(arg) for arg in args)]


def python_command(script: object, *args: object) -> list[str]:
    return [sys.executable, "-B", *python_args(script, *args)]


def run_command(command: list[str], cwd: Path | None = None, check: bool = True) -> subprocess.CompletedProcess[str]:
    return subprocess.run(
        command,
        cwd=cwd,
        capture_output=True,
        text=True,
        encoding="utf-8",
        env=child_env(),
        check=check,
    )


def run_json(command: list[str], cwd: Path | None = None) -> dict:
    completed = run_command(command, cwd=cwd, check=True)
    return json.loads(completed.stdout)


def powershell_quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def portable_quote(value: str) -> str:
    return '"' + value.replace('"', '\\"') + '"'


def format_powershell_command(arguments: list[object]) -> str:
    values = [powershell_quote(str(item)) for item in arguments]
    return "& " + " ".join(values)


def format_powershell_python_command(script: object, *args: object) -> str:
    return format_powershell_command(python_command(script, *args))


def format_portable_python_command(script: object, *args: object) -> str:
    values = [portable_quote(item) for item in ["-B", *python_args(script, *args)]]
    return "python " + " ".join(values)
