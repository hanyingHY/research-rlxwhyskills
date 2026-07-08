#!/usr/bin/env python3
"""Generate the window prompt pack for an existing research workspace."""

from __future__ import annotations

import argparse
import sys
from pathlib import Path

sys.dont_write_bytecode = True

from init_research_program import init_windowed_search


def main() -> None:
    parser = argparse.ArgumentParser(description="Generate or refresh the window prompt pack")
    parser.add_argument("--root", required=True)
    parser.add_argument("--profile", default="generic")
    parser.add_argument("--overwrite", action="store_true")
    parser.add_argument("--experimental-autonomy", action="store_true")
    args = parser.parse_args()

    root = Path(args.root)
    init_windowed_search(root, profile_name=args.profile, overwrite_generated=args.overwrite, experimental_autonomy=args.experimental_autonomy)
    print(root / "00_protocol" / "prompts")


if __name__ == "__main__":
    main()
