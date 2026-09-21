#!/usr/bin/env python3
"""Check deterministic suite conventions not covered by HACS or hassfest."""

from __future__ import annotations

import json
import os
from pathlib import Path

CONVENTIONS = "https://github.com/ha-parcel-integrations/.github/blob/main/CONVENTIONS.md"

# Shared summary sensors use the same meaning across carriers. Keep their
# default icons uniform wherever a carrier implements the corresponding key.
SUMMARY_SENSOR_ICONS = {
    "awaiting_pickup": "mdi:store-clock",
    "delivered_parcels": "mdi:package-variant",
    "incoming_parcels": "mdi:package-variant-closed",
    "last_update": "mdi:clock-check-outline",
    "next_delivery": "mdi:clock-fast",
    "outgoing_delivered_parcels": "mdi:package-check",
    "outgoing_parcels": "mdi:package-up",
    "parcel": "mdi:package-variant-closed",
}

# The aggregator predates the longer carrier translation keys but represents
# the same four parcel buckets.
AGGREGATOR_SENSOR_ICONS = {
    "awaiting_pickup": "mdi:store-clock",
    "delivered": "mdi:package-variant",
    "incoming": "mdi:package-variant-closed",
    "next_delivery": "mdi:clock-fast",
    "outgoing_delivered": "mdi:package-check",
    "outgoing": "mdi:package-up",
}


def fail(message: str) -> None:
    """Print a policy failure in the GitHub Actions error format."""
    print(f"ERROR: {message}")


def check_summary_sensor_icons(domain_dir: Path, domain: str) -> int:
    """Require common summary sensors to retain their shared icon meaning."""
    icons_path = domain_dir / "icons.json"
    if not icons_path.is_file():
        fail(f"missing custom_components/{domain}/icons.json")
        return 1

    icons = json.loads(icons_path.read_text())
    sensor_icons = icons.get("entity", {}).get("sensor", {})
    expected_icons = (
        AGGREGATOR_SENSOR_ICONS if domain == "parcel_aggregator" else SUMMARY_SENSOR_ICONS
    )
    failures = 0

    for key, expected_icon in expected_icons.items():
        if key not in sensor_icons:
            continue
        actual_icon = sensor_icons[key].get("default")
        if actual_icon != expected_icon:
            fail(
                f"icons.json sensor {key!r} must use {expected_icon!r}, "
                f"not {actual_icon!r}"
            )
            failures += 1

    return failures


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

    if (root / "docs" / "api").exists():
        fail("docs/api/ must not be tracked in a public integration repository")
        failures += 1

    failures += check_summary_sensor_icons(domain_dir, domain)

    if not failures:
        print("Policy checks passed.")
    return int(bool(failures))


if __name__ == "__main__":
    raise SystemExit(main())
