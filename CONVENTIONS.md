# Shared conventions

Conventions that apply to **every repository in this organization**. Individual
repos keep their own `CLAUDE.md` for repo-specific details and point here for the
shared parts.

> **General vs project-specific.** The *Workflow*, *Commits*, *Versioning &
> releases*, and *Testing* sections apply to any repo (integrations and, later,
> Lovelace cards). The *Home Assistant developer docs*, *Deliberate skill
> divergences*, and *Parcel contract* sections apply only to the Home Assistant
> integrations (and, for the parcel contract, the aggregator).

## Workflow

- **CI runs automatically** on pull requests (validation + tests). Contributors
  never need to ask for a run.
- **Merging is done by the maintainer only.** There is no auto-merge.
- Contributors work via forks/branches and PRs; the maintainer may commit
  directly to `main` for routine changes.

## Commits

- **Single-line commit messages.** The description is one line — no body.
- Reference an issue in the subject where relevant (e.g. `… (#12)`).
- A `Co-Authored-By: Claude …` trailer is allowed, on its own line after a blank
  line. No other trailers.

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
- **If the repo has open `help wanted` issues, link them before the footer.**
  One line, e.g. `🙋 [N open questions need a real parcel to answer](https://github.com/ha-parcel-integrations/<repo>/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22)`.
  Pre-1.0 carriers almost always have some — this is how a tester finds them
  without digging through the issue tracker.
- **The `1.0.0` bar.** A carrier's *first* release can ship at `1.0.0` instead
  of the usual pre-1.0 start when, independent of the code itself: the happy
  path has been confirmed end-to-end on a real parcel, its capabilities (auth
  flow, endpoints used) are settled, and its status vocabulary is complete and
  maps cleanly onto `ParcelStatus`. Remaining unknowns are fine as long as
  they're edge cases — uncommon delivery outcomes, rate limits, token
  lifetimes — that degrade safely (falling to `unknown` with shape-logging, or
  a clear reauth signal) instead of blocking. That no other carrier has
  shipped at `1.0.0` before is not itself a reason to hold one back that
  clears this bar — judge each carrier on what's actually still unknown about
  it, not on suite precedent.
- **No "Also new in the family" section.** New sibling carriers are not listed in
  a carrier's release notes — the list outgrew the format and went stale the
  moment the next carrier landed. Every release ends with the same footer
  instead, verbatim:

  ```markdown
  ---

  📦 [See every supported carrier](https://github.com/ha-parcel-integrations) — new ones land regularly.
  💛 [Support the project](https://ha-parcel-integrations.github.io/sponsor/)
  ```

  The org profile README is the single source of truth for that list, so
  nothing in a release note goes out of date.

  **`profile/README.md` is generated — never edit it by hand.** It is rendered
  from `data/carriers.yml` in the
  [`ha-parcel-integrations.github.io`](https://github.com/ha-parcel-integrations/ha-parcel-integrations.github.io)
  repo and pushed here by that repo's deploy workflow; a manual edit is
  overwritten on the next run. A new carrier gets one entry in that YAML file
  and everything else — the profile table, the docs site, the repo's homepage
  link — follows.
- **The aggregator names the carriers it adds, and links each one.** When a
  release adds carrier support, write the carrier names as links to their repos
  (`[Packeta](https://github.com/ha-parcel-integrations/ha-packeta)`), not as
  plain text — that release *is* the announcement for those integrations.

## Pre-1.0 releases (early carriers)

A carrier below `1.0.0` still has unconfirmed data — inferred status vocabularies,
guessed payload shapes, roles or fields we've never seen populated in live data.

- **Every such unknown must log a one-shot `WARNING`** with a copy-paste
  `issues/new?template=unrecognised_status.yml` link, so real users report it.
  Passively waiting for a tester to share diagnostics rarely yields the data.
- **`WARNING`, never `INFO`/`DEBUG`.** Home Assistant's default log level hides
  those, so nobody sees — or reports — them. Even a "confirm this shape looks
  right" prompt is a `WARNING`.
- Log **keys / structure, not values**, for anything that could carry PII
  (a pickup address, a recipient name).
- Cross-check the repo's open `help wanted` issues against the code: each
  item should have a log line that fires when a real user hits it.

## Testing

- Tests use `pytest`. Run with coverage:
  `python -m pytest tests/ --cov=custom_components.<domain>`.
- Integrations keep coverage **above 95%**.
- A code change updates the docs (`README` / `CLAUDE.md`) where behaviour changes.

## User-facing content (READMEs, examples, docs site)

- **Everything a user reads is English.** That includes the strings *inside*
  example automations and dashboard cards — notification titles, card titles,
  status labels, and Jinja variable names. The audience is international; a
  Dutch `title: "Pakket onderweg"` is not copy-pasteable for most of it. The
  examples in `ha-parcel-aggregator/examples/` are rendered verbatim onto the
  docs site, so anything left in Dutch ships to the front page of the suite.
- **The aggregator is optional — never write as though it is required.** Every
  carrier integration is standalone and depends on nothing else. The aggregator
  earns its place only from the second carrier onward, and framing it as a
  required step (a numbered install stage, "and then add the aggregator") makes
  the suite look heavier than it is. Show the per-carrier way first, the unified
  way second.
- Say "package" as well as "parcel" in titles and descriptions. The code and the
  contract use *parcel* throughout, but "package tracking" is the more common
  search term in English.

## Translations (integrations)

- **`en.json` is mandatory and is the source of truth** for every string — add
  or change a string there first, then propagate.
- **Add a language when the carrier actually supports that country**, matching
  the countries named in the repo's own README/config flow (e.g. Helthjem →
  Norwegian, GLS → Dutch + German, Sameday → Romanian + Hungarian +
  Bulgarian). A carrier with a country picker gets one translation per
  option in that picker.
- **A carrier with no specific country ("worldwide") stays English-only** —
  don't invent a translation for it.
- **Never remove an existing translation file**, even one that doesn't match
  a currently-supported country (e.g. `nl.json` predates this rule in most
  repos and stays as-is). This convention is additive only — it explains what
  to add, not a reason to prune what's already there.
- Keep the JSON key structure byte-for-byte identical across every language
  file in a repo; only the leaf string values change. Brand/carrier names,
  placeholders (`{…}`) and service/attribute identifiers are never translated.

## Repo hygiene

- One shared `.gitignore` across repos (Python + tooling + editors + `.DS_Store`
  + `.claude/`).
- **API mechanics belong in the private research repo, not in the integration
  repo.** Endpoints, request params/headers, auth flows, response envelopes,
  payload→canonical mapping tables, status-code vocabularies and timestamp
  formats go in `carrier-research/api/<slug>/` (slug = repo name minus `ha-`),
  where they are version-controlled and shared instead of living on one machine.
  Do not create — or re-create — a repo-local `docs/api/`; the shared
  `.gitignore` still excludes that path so a stray local scratch file can never
  be published, but it is no longer where notes belong.
- `CLAUDE.md` holds only HA-integration decisions (lifecycle, entities, options
  model, caching/cost-control, redaction, event suppression) plus a one-line
  pointer to `carrier-research/api/<slug>/`. Do not duplicate API detail into
  `CLAUDE.md`.
- Reverse-engineering notes are never published: nothing from the research repo
  — least of all the name of a project an endpoint was reconstructed from —
  appears in a public repo, its release notes or its commit messages.

## Home Assistant developer docs (integrations)

HA's integration patterns evolve. **Do not rely on memory of past patterns** —
fetch the canonical page before changing a topic area, and check the
[developer blog](https://developers.home-assistant.io/blog) and
[architecture discussions](https://github.com/home-assistant/architecture/discussions)
before introducing anything you only "know" from training data. Recent posts
trump older recollection.

| When you change | Fetch first |
|---|---|
| Entity properties, naming, lifecycle, attributes | https://developers.home-assistant.io/docs/core/entity/ |
| Sensor specifics (state/device classes, units) | https://developers.home-assistant.io/docs/core/entity/sensor |
| Config flow, options flow, reauth, reconfigure | https://developers.home-assistant.io/docs/config_entries_config_flow_handler |
| DataUpdateCoordinator pattern | https://developers.home-assistant.io/docs/integration_fetching_data |
| Quality scale rules | https://developers.home-assistant.io/docs/core/integration-quality-scale |
| Diagnostics | https://developers.home-assistant.io/docs/core/integration/diagnostics |
| Translations | https://developers.home-assistant.io/docs/internationalization/core |

Branding is handled by each repo's **local `brand/` folder** (HACS reads
`icon.png` from it). The official `home-assistant/brands` repo is Core-only and
does not apply to these HACS integrations.

## Claude skills

Skills are installed **globally** (`~/.claude/skills/`), not per repo. The two
in use — `ha-integration-knowledge` and `home-assistant-custom-integration` —
are generic HA-integration knowledge with nothing carrier-specific in them, so
one copy serves every repo in the suite and no repo can drift from another.

Do not commit a `skills-lock.json` to a carrier repo. `.claude/` is gitignored
everywhere, so a per-repo lock file pins content that no clone can see and no
tooling here reads. The global lock lives at `~/.claude/skills-lock.json`.

## Deliberate skill divergences (integrations)

These diverge from the `ha-integration-knowledge` skill on purpose — that skill
targets HA **Core**; these are **HACS** integrations. Do not "fix" them to match
the core rule.

- **Polling interval is user-configurable** via the options flow (the core skill
  says it must not be) — a tunable poll cadence is a wanted HACS feature.
- **Inline API client** (no separate published library) is acceptable here.
- **Synchronous request patterns** where a carrier's API forces them are
  acceptable; do not re-flag.

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
