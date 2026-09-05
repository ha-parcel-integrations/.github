#!/usr/bin/env python3
"""Enforce the suite's one-line Conventional Commit subjects."""

from __future__ import annotations

import re
import subprocess
import sys

CONVENTIONAL = re.compile(
    r"^(?:feat|fix|refactor|docs|test|ci|chore|build|perf|style|revert)(?:\([^)]+\))?!?: .+"
)
RELEASE_BUMP = re.compile(r"^Bump version to \d+\.\d+\.\d+(?:b\d+)?(?: \(#\d+\))?$")
TRAILER = re.compile(r"^Co-Authored-By: .+$", re.IGNORECASE)

# Merged Dependabot commits keep Dependabot as author but carry GitHub's own
# subject and body, which no repository rule can influence.
DEPENDABOT = "dependabot[bot]"


def main() -> int:
    """Validate the subjects and permitted trailers in a commit range."""
    commit_range = sys.argv[1]
    result = subprocess.run(
        ["git", "log", "--format=%H%x1f%s%x1f%an%x1f%b%x1e", commit_range],
        check=True,
        text=True,
        capture_output=True,
    )
    failures = 0
    for item in result.stdout.split("\x1e"):
        if not item.strip():
            continue
        sha, subject, author, body = item.rstrip("\n").split("\x1f", 3)
        if author == DEPENDABOT:
            print(f"SKIP: {sha[:7]} is a Dependabot commit")
            continue
        if not (CONVENTIONAL.fullmatch(subject) or RELEASE_BUMP.fullmatch(subject)):
            print(f"ERROR: {sha[:7]} has a non-conventional subject: {subject}")
            failures += 1
        extra = [line for line in body.splitlines() if line.strip() and not TRAILER.fullmatch(line)]
        if extra:
            print(f"ERROR: {sha[:7]} has a commit body; only Co-Authored-By is allowed")
            failures += 1
    if not failures:
        print("Commit messages passed.")
    return int(bool(failures))


if __name__ == "__main__":
    raise SystemExit(main())
