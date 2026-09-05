#!/usr/bin/env python3
"""Check deterministic suite conventions not covered by HACS or hassfest."""

from __future__ import annotations

import json
import os
from pathlib import Path

CONVENTIONS = "https://github.com/ha-parcel-integrations/.github/blob/main/CONVENTIONS.md"


def fail(message: str) -> None:
    """Print a policy failure in the GitHub Actions error format."""
    print(f"ERROR: {message}")


def main() -> int:
    """Check the deterministic public-repository conventions."""
    root = Path.cwd()
    suite = json.loads((root / ".github" / "suite.json").read_text())
    domain = suite["domain"]
    failures = 0

    # The workflow input is what every job actually runs against, so a mismatch
    # would silently test and cover the wrong package.
    expected_domain = os.environ.get("DOMAIN")
    if expected_domain and expected_domain != domain:
        fail(f"workflow domain {expected_domain!r} does not match suite.json {domain!r}")
        failures += 1
    if suite.get("kind") != "integration":
        fail("suite.json kind must be integration")
        failures += 1

    domain_dir = root / "custom_components" / domain
    if not domain_dir.is_dir():
        fail(f"missing custom_components/{domain}/")
        return 1

    manifest = json.loads((domain_dir / "manifest.json").read_text())
    if manifest.get("domain") != domain:
        fail(f"manifest domain must be {domain!r}")
        failures += 1

    repo = os.environ.get("GITHUB_REPOSITORY", f"ha-parcel-integrations/{root.name}")
    expected_docs = f"https://github.com/{repo}"
    if manifest.get("documentation") != expected_docs:
        fail("manifest documentation URL is not the canonical repository URL")
        failures += 1
    if manifest.get("issue_tracker") != f"{expected_docs}/issues":
        fail("manifest issue_tracker URL is not the canonical repository issue URL")
        failures += 1

    claude = (root / "CLAUDE.md").read_text()
    if CONVENTIONS not in claude:
        fail("CLAUDE.md must point to the shared conventions")
        failures += 1
    if suite["research_api_path"] not in claude:
        fail("CLAUDE.md must contain its private research API pointer")
        failures += 1

    if (root / "docs" / "api").exists():
        fail("docs/api/ must not be tracked in a public integration repository")
        failures += 1

    if not failures:
        print("Policy checks passed.")
    return int(bool(failures))


if __name__ == "__main__":
    raise SystemExit(main())
