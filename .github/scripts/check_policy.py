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
    "en_route_to_pickup_point": "mdi:truck-delivery",
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
    "en_route_to_pickup_point": "mdi:truck-delivery",
    "awaiting_pickup": "mdi:store-clock",
    "delivered": "mdi:package-variant",
    "incoming": "mdi:package-variant-closed",
    "next_delivery": "mdi:clock-fast",
    "outgoing_delivered": "mdi:package-check",
    "outgoing": "mdi:package-up",
}


# A platform file means the entity exists, so its icon is not optional the way
# a summary sensor is. Each entry is (platform module, icons.json section,
# translation key, icon).
PLATFORM_ENTITY_ICONS = (
    ("calendar.py", "calendar", "deliveries", "mdi:truck-delivery-outline"),
    ("button.py", "button", "refresh", "mdi:refresh"),
)


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


def check_platform_entity_icons(domain_dir: Path, domain: str) -> int:
    """Require the calendar and button icons wherever those platforms exist.

    Unlike a summary sensor, which a carrier may legitimately not implement,
    these two are present exactly when their platform module is — so here a
    missing icon is a missing icon, not an opted-out entity.
    """
    icons_path = domain_dir / "icons.json"
    if not icons_path.is_file():
        return 0  # already reported by check_summary_sensor_icons

    icons = json.loads(icons_path.read_text()).get("entity", {})
    failures = 0

    for module, section, key, expected_icon in PLATFORM_ENTITY_ICONS:
        if not (domain_dir / module).is_file():
            continue
        entry = icons.get(section, {}).get(key)
        if entry is None:
            fail(
                f"custom_components/{domain}/{module} exists, so icons.json "
                f"must give {section}.{key} the icon {expected_icon!r}"
            )
            failures += 1
            continue
        actual_icon = entry.get("default")
        if actual_icon != expected_icon:
            fail(
                f"icons.json {section} {key!r} must use {expected_icon!r}, "
                f"not {actual_icon!r}"
            )
            failures += 1

    return failures


def check_canonical_pickup_sources(domain_dir: Path) -> int:
    """Allow the optional sensor, but reject its retired identities."""
    legacy_names = ("en_route_to_parcel_shop", "en_route_to_service_point")
    failures = 0
    strings = json.loads((domain_dir / "strings.json").read_text())
    sensor_strings = strings.get("entity", {}).get("sensor", {})
    for name in legacy_names:
        if name in sensor_strings:
            fail(f"strings.json must not contain legacy pickup key {name!r}")
            failures += 1
    # Old IDs are necessarily retained in the narrowly scoped registry
    # migration.  A live entity, however, must not publish one as its
    # translation key.  This static check is intentionally narrow so it keeps
    # accepting integrations that do not implement the optional sensor.
    for source in domain_dir.rglob("*.py"):
        contents = source.read_text()
        for name in legacy_names:
            if f'_attr_translation_key = "{name}"' in contents:
                fail(f"{source.relative_to(domain_dir)} must not publish legacy pickup key {name!r}")
                failures += 1
    return failures


# Counters that all mean "a number of parcels". The letters sensor is a
# genuinely different unit and is excluded by name.
COUNTER_SENSORS = (
    "awaiting_pickup",
    "delivered",
    "delivered_parcels",
    "en_route_to_pickup_point",
    "incoming",
    "incoming_parcels",
    "outgoing",
    "outgoing_delivered",
    "outgoing_delivered_parcels",
    "outgoing_parcels",
)


def check_counter_units(domain_dir: Path) -> int:
    """Require one word for a parcel across the counters of each language.

    Cross-repo wording cannot be seen from inside one repository, but a file
    that counts in two different words is always wrong, and that is how this
    drifts in practice.
    """
    failures = 0
    paths = [domain_dir / "strings.json"]
    paths += sorted((domain_dir / "translations").glob("*.json"))

    for path in paths:
        if not path.is_file():
            continue
        sensors = json.loads(path.read_text()).get("entity", {}).get("sensor", {})
        units = {
            key: sensors[key]["unit_of_measurement"]
            for key in COUNTER_SENSORS
            if isinstance(sensors.get(key), dict) and "unit_of_measurement" in sensors[key]
        }
        if len(set(units.values())) > 1:
            listed = ", ".join(f"{key}={unit!r}" for key, unit in sorted(units.items()))
            fail(
                f"{path.name} counts parcels in more than one word ({listed}); "
                f"every counter in one language uses the same unit"
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
    failures += check_platform_entity_icons(domain_dir, domain)
    failures += check_canonical_pickup_sources(domain_dir)
    failures += check_counter_units(domain_dir)

    if not failures:
        print("Policy checks passed.")
    return int(bool(failures))


if __name__ == "__main__":
    raise SystemExit(main())
