#!/usr/bin/env python3
"""Enforce the suite's Conventional Commit subjects and short commit bodies."""

from __future__ import annotations

import re
import subprocess
import sys

CONVENTIONAL = re.compile(
    r"^(?:feat|fix|refactor|docs|test|ci|chore|build|perf|style|revert)(?:\([^)]+\))?!?: .+"
)
RELEASE_BUMP = re.compile(r"^Bump version to \d+\.\d+\.\d+(?:b\d+)?(?: \(#\d+\))?$")
TRAILER = re.compile(r"^Co-Authored-By: .+$", re.IGNORECASE)

# A body explains why; past this it is a design document in the wrong place.
MAX_BODY_LINES = 12

# Merged Dependabot commits keep Dependabot as author but carry GitHub's own
# subject and body, which no repository rule can influence.
DEPENDABOT = "dependabot[bot]"


def main() -> int:
    """Validate the subjects, bodies and trailers in a commit range."""
    commit_range = sys.argv[1]
    result = subprocess.run(
        ["git", "log", "--format=%H%x1f%an%x1f%B%x1e", commit_range],
        check=True,
        text=True,
        capture_output=True,
    )
    failures = 0
    for item in result.stdout.split("\x1e"):
        if not item.strip():
            continue
        sha, author, message = item.strip("\n").split("\x1f", 2)
        if author == DEPENDABOT:
            print(f"SKIP: {sha[:7]} is a Dependabot commit")
            continue
        lines = message.rstrip().split("\n")
        subject = lines[0]
        if not (CONVENTIONAL.fullmatch(subject) or RELEASE_BUMP.fullmatch(subject)):
            print(f"ERROR: {sha[:7]} has a non-conventional subject: {subject}")
            failures += 1
        if len(lines) > 1 and lines[1].strip():
            print(f"ERROR: {sha[:7]} needs a blank line between subject and body")
            failures += 1
        body = [line for line in lines[2:] if line.strip() and not TRAILER.fullmatch(line)]
        if len(body) > MAX_BODY_LINES:
            print(f"ERROR: {sha[:7]} has a {len(body)}-line body; keep it under {MAX_BODY_LINES}")
            failures += 1
    if not failures:
        print("Commit messages passed.")
    return int(bool(failures))


if __name__ == "__main__":
    raise SystemExit(main())
