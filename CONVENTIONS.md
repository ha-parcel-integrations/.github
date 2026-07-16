# Shared conventions

Conventions that apply to **every repository in this organization**. Individual
repos keep their own `CLAUDE.md` for repo-specific details and point here for the
shared parts.

> **General vs project-specific.** The *Workflow*, *Commits*, *Versioning &
> releases*, and *Testing* sections apply to any repo (integrations and, later,
> Lovelace cards). The *Parcel contract* section applies only to the carrier
> integrations and the aggregator.

## Workflow

- **CI runs automatically** on pull requests (validation + tests). Contributors
  never need to ask for a run.
- **Merging is done by the maintainer only.** There is no auto-merge.
- Contributors work via forks/branches and PRs; the maintainer may commit
  directly to `main` for routine changes.

## Commits

- **Single-line commit messages.** No body, no trailers.
- Reference an issue in the subject where relevant (e.g. `… (#12)`).

## Versioning & releases

- **Semantic versioning.** New user-facing feature → **minor** (`0.X.0`); bug fix
  only → **patch** (`0.0.X`).
- **Tags carry no `v` prefix** (e.g. `4.5.0`, not `v4.5.0`).
- Release sequence: bump the version in `manifest.json` → commit
  `Bump version to X.Y.Z` → tag → push (branch + tag) → publish a GitHub release.
- **Release notes are user-facing only.** Use the shared `##` house style
  (`New features`, `Bug fixes`, `Other improvements`, `Credits`), one bullet per
  line (no hard-wrapping inside a bullet), and never cross-reference other repos.
- Leave dev-only changes (gitignore, CI, tooling) out of the notes.

## Testing

- Tests use `pytest`. Run with coverage:
  `python -m pytest tests/ --cov=custom_components.<domain>`.
- Integrations keep coverage **above 95%**.
- A code change updates the docs (`README` / `CLAUDE.md`) where behaviour changes.

## Repo hygiene

- One shared `.gitignore` across repos (Python + tooling + editors + `.DS_Store`
  + `.claude/`).
- `docs/api/` is **local-only** (gitignored) — reverse-engineering notes are not
  published.

## Parcel contract (carrier integrations + aggregator)

- **Canonical `ParcelStatus` enum** in each integration's `const.py`, kept
  identical across carriers, so cross-carrier automations can target
  `status: out_for_delivery` regardless of source.
- **Normalised parcel shape** — every parcel exposes the same top-level keys
  (`carrier`, `barcode`, `sender`, `receiver`, `status`, `raw_status`,
  `delivered`, `planned_from`, `planned_to`, `history`, …).
- **Canonical events** on the HA bus:
  `<carrier>_parcel_registered` / `_status_changed` / `_delivered` /
  `_delivery_time_changed` (plus the outgoing pair where the carrier
  supports it). The hop **to** `delivered` fires only the dedicated
  `_delivered` event, never also `_status_changed`. The payload is the
  full normalised parcel (including `raw`) plus the account's `device_id`. The
  **aggregator** re-emits these under a unified prefix with `raw` stripped —
  onboard a new carrier there by adding its HA domain to `KNOWN_CARRIERS` +
  `CARRIER_EVENT_PREFIXES`, nothing else.
- **First refresh runs in `__init__.py`** (before forwarding platforms), so a
  transient fetch failure fails setup cleanly and Home Assistant retries — never
  in a platform.
- Unmapped statuses/events log a **one-shot warning** with a copy-paste
  `issues/new` line; users report them via the *Unrecognised parcel status*
  issue template.
