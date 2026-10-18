#!/usr/bin/env python3
"""Check code rules that reviews keep catching and that a linter cannot see.

Run from a carrier repository root with ``DOMAIN`` set. Every finding names the
rule, the line, and how to either fix it or record why it is deliberate.
Exceptions are inline comments, so the reason lives next to the code:

* ``# suite: allow zoneinfo (<reason>)``
* ``# suite: allow browser user-agent (<reason>)``
"""

from __future__ import annotations

import ast
import json
import os
import re
import sys
from pathlib import Path

CONVENTIONS = "https://github.com/ha-parcel-integrations/.github/blob/main/CONVENTIONS.md"

ALLOW_ZONEINFO = "# suite: allow zoneinfo"
ALLOW_USER_AGENT = "# suite: allow browser user-agent"

# A marker may sit on the offending line or on a comment line above the
# statement (a user-agent string is usually the tail of a multi-line one).
MARKER_LOOKBEHIND = 8

BROWSER_USER_AGENT = re.compile(r"Mozilla/5\.0|Chrome/\d|Firefox/\d|Safari/\d")

# (pattern, minimum Home Assistant version, what needs it). The declared
# ``homeassistant`` minimum in hacs.json must be at least the highest of these
# that the code uses; add a row when a review finds another one.
HA_VERSION_REQUIREMENTS = (
    (re.compile(r"UpdateFailed\([^)]*retry_after\s*=", re.DOTALL), "2025.12.0", "UpdateFailed(retry_after=...)"),
    (re.compile(r"\bconfig_entry\s*=\s*(?:self\.)?(?:config_)?entry\b"), "2024.11.0", "DataUpdateCoordinator(config_entry=...)"),
    (re.compile(r"\._get_reauth_entry\(|\._get_reconfigure_entry\(|\._abort_if_unique_id_mismatch\("), "2024.11.0", "config-flow reauth/reconfigure helpers"),
)


def fail(message: str) -> None:
    """Print a finding in the GitHub Actions error format."""
    print(f"ERROR: {message}")


def _version(text: str) -> tuple[int, ...]:
    return tuple(int(part) for part in text.split("."))


def _has_marker(lines: list[str], lineno: int, marker: str) -> bool:
    """Whether ``marker`` is on line ``lineno`` (1-based) or just above it."""
    start = max(0, lineno - 1 - MARKER_LOOKBEHIND)
    return any(marker in line for line in lines[start:lineno])


def _is_zoneinfo_call(node: ast.Call) -> bool:
    """``ZoneInfo(...)`` or HA's synchronous ``dt_util.get_time_zone(...)``.

    The latter is the same disk read behind a helper; only the ``async_``
    variant is safe on the event loop.
    """
    func = node.func
    if isinstance(func, ast.Name):
        return func.id in {"ZoneInfo", "get_time_zone"}
    return isinstance(func, ast.Attribute) and func.attr in {"ZoneInfo", "get_time_zone"}


def check_zoneinfo(path: Path, source: str, lines: list[str]) -> int:
    """Flag ``ZoneInfo(...)`` (or ``get_time_zone``) built inside a function.

    Building one reads the tz file from disk the first time, which Home
    Assistant reports as blocking I/O when it happens on the event loop. Build
    it once at module level, or resolve it with ``dt_util.async_get_time_zone``.
    """
    errors = 0
    tree = ast.parse(source)

    def visit(node: ast.AST, in_function: bool) -> None:
        nonlocal errors
        if (
            isinstance(node, ast.Call)
            and in_function
            and _is_zoneinfo_call(node)
            and not _has_marker(lines, node.lineno, ALLOW_ZONEINFO)
        ):
            fail(
                f"{path}:{node.lineno}: ZoneInfo(...) built inside a function reads "
                "the tz file on the event loop. Build it at module level or resolve "
                "it with `await dt_util.async_get_time_zone(...)`; if the zone was "
                f"already loaded off the loop, add `{ALLOW_ZONEINFO} (<reason>)`. "
                f"See {CONVENTIONS}"
            )
            errors += 1
        inside = in_function or isinstance(
            node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.Lambda)
        )
        for child in ast.iter_child_nodes(node):
            visit(child, inside)

    visit(tree, False)
    return errors


def check_user_agent(path: Path, lines: list[str]) -> int:
    """Flag a browser User-Agent that is not recorded as required.

    A spoofed browser identity should only be sent when the carrier refuses
    Home Assistant's own; the comment says which carrier behaviour needs it.
    """
    errors = 0
    for number, line in enumerate(lines, start=1):
        if BROWSER_USER_AGENT.search(line) and not _has_marker(lines, number, ALLOW_USER_AGENT):
            fail(
                f"{path}:{number}: browser User-Agent. Send Home Assistant's own unless "
                "the carrier refuses it; if it does, add "
                f"`{ALLOW_USER_AGENT} (<what the carrier does without it>)` above it. "
                f"See {CONVENTIONS}"
            )
            errors += 1
    return errors


def check_ha_version(root: Path, sources: dict[Path, str]) -> int:
    """Require ``hacs.json`` to declare a Home Assistant new enough for the code."""
    hacs = root / "hacs.json"
    if not hacs.is_file():
        return 0
    declared = json.loads(hacs.read_text()).get("homeassistant")
    if not declared:
        fail("hacs.json: no `homeassistant` minimum declared")
        return 1

    errors = 0
    for pattern, required, what in HA_VERSION_REQUIREMENTS:
        if _version(declared) >= _version(required):
            continue
        for path, source in sources.items():
            match = pattern.search(source)
            if match:
                line = source.count("\n", 0, match.start()) + 1
                fail(
                    f"{path}:{line}: {what} needs Home Assistant {required}, "
                    f"but hacs.json declares {declared}. Raise the minimum or "
                    f"drop the call. See {CONVENTIONS}"
                )
                errors += 1
                break
    return errors


def main() -> int:
    root = Path.cwd()
    domain = os.environ.get("DOMAIN")
    base = root / "custom_components"
    domain_dir = base / domain if domain else base
    if not domain_dir.is_dir():
        fail(f"missing custom_components/{domain}")
        return 1

    sources = {
        path: path.read_text()
        for path in sorted(domain_dir.rglob("*.py"))
        if "__pycache__" not in path.parts
    }
    errors = 0
    for path, source in sources.items():
        rel = path.relative_to(root)
        lines = source.splitlines()
        errors += check_zoneinfo(rel, source, lines)
        errors += check_user_agent(rel, lines)
    errors += check_ha_version(
        root, {path.relative_to(root): source for path, source in sources.items()}
    )
    if errors:
        print(f"{errors} code rule violation(s)")
        return 1
    print("Code rules OK")
    return 0


if __name__ == "__main__":
    sys.exit(main())
