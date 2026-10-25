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

- **A one-line subject, optionally followed by a short body.** The subject
  stands on its own and says what changed. Add a body — blank line, then as
  many lines as the reason needs — whenever *why* isn't obvious from the subject:
  the behaviour that was wrong, the constraint that forced the approach, what
  you ruled out. A commit is not a design document, and restating the diff in
  prose adds nothing. Who the body is written for depends on the type: on a
  `feat:`/`fix:` it is published, everywhere else it is maintainer-only.
- **Use Conventional Commit subjects.** Every human- or agent-created commit
  starts with one of `feat:`, `fix:`, `refactor:`, `docs:`, `test:`, `ci:`,
  `chore:`, `build:`, `perf:`, `style:` or `revert:` (an optional scope and
  breaking `!` are allowed). Use `feat:` only for a user-facing feature and
  `fix:` only for a user-facing bug fix: release automation derives the next
  version and draft notes from precisely those two types. Use `chore:` or
  `refactor:` for internal maintenance so it does not propose a release.
- **A `feat:`/`fix:` commit message is the release note.** Release automation
  copies the subject verbatim into `New features` or `Bug fixes` and indents
  the body underneath it as part of the same bullet — so write both for the
  person updating the integration, not for the diff. See
  [`RELEASE_NOTES.md`](RELEASE_NOTES.md) for the full house style, examples,
  and what never belongs in a bullet.
- The generated release commit is the sole exception and is exactly
  `Bump version to X.Y.Z` (or `X.Y.ZbN`).
- Reference an issue in the subject where relevant (e.g. `… (#12)`).
- A `Co-Authored-By: Claude …` trailer is allowed, on its own line at the end
  after a blank line. No other trailers.

## Versioning & releases

- **Semantic versioning.** New user-facing feature → **minor** (`0.X.0`); bug fix
  only → **patch** (`0.0.X`).
- **Tags carry no `v` prefix** (e.g. `4.5.0`, not `v4.5.0`).
- **Pre-releases use a `bN` suffix, no separator** (e.g. `2.0.0b1`, `2.0.0b2`,
  numbering from `1`) — for a build that ships ahead of a real-parcel gate
  clearing, or otherwise needs testers before it's trusted as a normal release.
  Mark the GitHub release itself as a pre-release too.
- **Automated carriers release through a generated PR.** After a successful
  `Validate` run on `main`, the `Release` workflow opens or updates one
  `automation/release` PR that bumps `manifest.json` and carries the proposed
  notes. Merge it with **squash** when the version and notes are right; the tag
  and GitHub release follow automatically. A rebase or merge commit publishes
  nothing. See [`AUTOMATION.md`](AUTOMATION.md) for the details. Carriers not
  yet on the shared workflows follow the manual sequence: bump the version in
  `manifest.json` → commit `Bump version to X.Y.Z` → tag → push (branch + tag)
  → publish a GitHub release.
- **Every release carries a HACS archive.** `hacs.json` sets `zip_release`,
  `filename` (`<domain>.zip`, matching the `domain:` the repo's `Release`
  workflow passes to the shared one) and `hide_default_branch`, and the shared
  workflow attaches that archive built from `custom_components/<domain>/`. HACS
  reads `hacs.json` at the ref it downloads, so releases from before a carrier
  switched keep installing the old way — but a carrier that sets `zip_release`
  without the shared workflow ships a version nobody can install.
- **The release PR body is the release, verbatim — edit it before merging.**
  See [`RELEASE_NOTES.md`](RELEASE_NOTES.md) for the full house style
  (sections, footer, credits, help-wanted link) and what to check before
  merging.
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
- **A new carrier gets one entry in `data/carriers.yml`** in the
  [`ha-parcel-integrations.github.io`](https://github.com/ha-parcel-integrations/ha-parcel-integrations.github.io)
  repo, and the rest follows: the docs site's carriers page and the repo's
  homepage link. That file is also a hard gate — the deploy fails if the org
  has a released public carrier repo missing from it, or lists one that no
  longer exists. (The release-notes footer that points at the same carriers
  page is documented in [`RELEASE_NOTES.md`](RELEASE_NOTES.md).)
- **`profile/README.md` is generated — never edit it by hand.** That repo's
  deploy workflow renders it and pushes it here; a manual edit is overwritten
  on the next run. It carries no carrier list of its own — it is a general
  introduction that sends visitors to the website — so a new carrier needs
  nothing here.

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
- Integrations keep coverage **above 95%**. That bar is **per source module**,
  not just per repo — a repo-wide 96% can hide a freshly added module at 75%,
  so check the new file's own row in `--cov-report=term-missing`.
- **`tests/` mirrors the layout of the package it tests.** A concern that lives
  in one source module gets one `tests/test_<module>.py`. Where the integration
  splits a concern into a sub-package — `custom_components/<domain>/countries/`
  being the suite's only one today — the tests split the same way, one
  directory per sub-package member with its own `__init__.py`:

  ```
  custom_components/gls/countries/     tests/countries/
  ├── ca/__init__.py                   ├── ca/test_ca.py
  ├── de/__init__.py                   ├── de/test_de.py
  ├── de/session.py                    ├── de/test_session.py
  └── nl/__init__.py                   └── nl/test_nl.py
  ```

  One test module per source module, named after it; the package's own
  `__init__.py` is tested by `test_<code>.py`. A flat
  `tests/countries/test_<code>.py` beside a nested source tree is drift — it
  stops being obvious which country a file belongs to as soon as a country
  grows a second module. Tests of a *concern* that merely exercise one country
  (`tests/test_coordinator_de.py`) stay at the top level: they belong to the
  concern, not to the country package.
- A code change updates the docs (`README` / `CLAUDE.md`) where behaviour changes.
- **Fixtures built from a real captured payload must have every identifier
  scrubbed before they're committed** — tracking/parcel number, postal code,
  address, name, phone, email, any UUID tied to the sender who shared it.
  Swap in made-up values that still satisfy the field's format (regex, length,
  checksum) so the test stays meaningful. This applies anywhere the value ends
  up: not just the file the tester's payload first landed in, but every other
  fixture across the repo's test suite that was copy-pasted from the same
  capture (`grep -rn <the-real-value> tests/`) — including
  string constants that carry a real value into shipped `strings.json` UI
  copy (an "example" placeholder, a doc snippet).

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
- **README badge row is Release, Downloads, HACS, License, in that order.**
  The Downloads badge
  (`https://img.shields.io/github/downloads/ha-parcel-integrations/<repo>/total.svg`,
  linking to that repo's `/releases`) belongs on every carrier repo and the
  aggregator; `ha-carrier-template/scaffold/README.md` carries it too so a
  newly bootstrapped carrier gets it for free.
- **Two blockquotes follow the badge row, in this order: the family line**
  (`📦 Part of ha-parcel-integrations …`, linking to the docs site) **then the
  community line** (`💬 Questions or feedback? …`). The family line sits up top
  so someone arriving from HACS sees there are sibling carriers without having
  to reach "Related integrations". It names the aggregator only as *optional*
  — never as a step — and it is the only place the intro says the repo is part of
  the family, so don't repeat it in a sentence further down. The template's
  `scaffold/README.md` carries both.

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

## Shared entity vocabulary (integrations)

The strings a user reads on a dashboard say the same thing in every carrier.
This covers the summary and per-parcel sensor names, their
`unit_of_measurement`, the `deliveries` calendar, the `refresh` button and the
`delivered_filter_type` selector options — the *entity layer*.

- **One word for "parcel" per language, across the whole suite.** Use the term
  the other repos already use, not the carrier's own house word. GLS Czech said
  `balík`, DHL German `Sendung`, Posti Finnish `lähetys` and InPost Polish
  `paczka`; all four were brought in line with the suite (`zásilka`, `Paket`,
  `paketti`, `przesyłka`). A carrier's marketing vocabulary is not a reason to
  diverge.
- **Every counter in one translation file carries the same
  `unit_of_measurement`.** Mixing them within a file — DHL and FedEx counted
  `awaiting_pickup` in a different word than the rest in five languages — is
  the most common form of this drift. `check_policy.py` enforces it.
- **For languages that inflect after a numeral, the unit is nominative
  plural**: `zásilky`, `zásielky`, `przesyłki`, `paketi`, `siuntos`, `pakas`.
  Czech, Slovak, Polish, Slovenian, Croatian, Lithuanian and Latvian all
  decline differently at 1, at 2–4 and at 5+, so no single form is correct for
  every count; the suite picks nominative plural and stays with it. Finnish
  keeps the partitive singular (`pakettia`), which *is* correct after a number.
- **`en_route_to_pickup_point` names the carrier's own network and is the
  deliberate exception** — "En route to ParcelShop", "ServicePoint", "PostNL
  Point", "paketomat". Leave those alone; everything else in the entity layer
  converges.
- **Outside the entity layer, the other word is often the right one.** Setup,
  options and service prose keep the domain term even when it differs from the
  entity vocabulary: a tracking number is a `Sendungsnummer` in German whatever
  the item is called, and InPost's locker is a `Paczkomat`. Never blanket
  replace one stem with another across a whole file.
- **Renaming an entity string moves the entity ID of entities created
  afterwards.** Home Assistant derives the object ID from the name in the
  instance's own language when that language is in its `NATIVE_ENTITY_IDS` set
  (nl, de, fr, es, pl, cs, sk, hr, sl, lt, lv, fi, pt-BR and more), falling
  back to English otherwise. Existing entities keep the ID stored in the
  registry, so nothing breaks — but two installations set up either side of the
  rename end up with different IDs. Align early rather than late, and say so in
  the release note.

`tools/translation_report.py` lists every entity-layer string that differs
across the suite; run it before adding a language and after changing one.

## Entity icons (integrations)

- Shared summary sensors use the same default icon wherever they are exposed:
  `incoming_parcels` → `mdi:package-variant-closed`, `delivered_parcels` →
  `mdi:package-variant`, `en_route_to_pickup_point` → `mdi:truck-delivery`,
  `awaiting_pickup` → `mdi:store-clock`,
  `outgoing_parcels` → `mdi:package-up`, and `outgoing_delivered_parcels` →
  `mdi:package-check`. `next_delivery`, `last_update`, and per-parcel
  `parcel` sensors are likewise centrally checked in suite policy.
- The Parcel Aggregator's older short keys (`incoming`, `delivered`,
  `outgoing`, and `outgoing_delivered`) carry those same icon meanings.
- `check_policy.py` validates each of these only when the corresponding sensor
  is configured in `icons.json`; optional summary sensors are not required.
- **The calendar and refresh-button icons are required, not optional.** A
  repo with a `calendar.py` must give `calendar.deliveries` the icon
  `mdi:truck-delivery-outline`, and one with a `button.py` must give
  `button.refresh` the icon `mdi:refresh`. Those entities exist exactly when
  their platform module does, so unlike a summary sensor there is no
  "carrier opted out" case — a missing icon is a missing icon, and
  `check_policy.py` fails the build for it. (ha-ppl-cz shipped without the
  calendar icon for several releases because the old check read only
  `entity.sensor`.)

## Repo hygiene

- One shared `.gitignore` across repos (Python + tooling + editors + `.DS_Store`
  + `.claude/`).
- **API mechanics belong in the private research repo, not in the integration
  repo.** Endpoints, request params/headers, auth flows, response envelopes,
  payload→canonical mapping tables, status-code vocabularies and timestamp
  formats go in `carrier-research/<slug>/api/` (slug = repo name minus `ha-`),
  where they are version-controlled and shared instead of living on one machine.
  Do not create — or re-create — a repo-local `docs/api/`; the shared
  `.gitignore` still excludes that path so a stray local scratch file can never
  be published, but it is no longer where notes belong.
- `CLAUDE.md` holds only HA-integration decisions (lifecycle, entities, options
  model, caching/cost-control, redaction, event suppression) plus a one-line
  pointer to `carrier-research/<slug>/api/`. Do not duplicate API detail into
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
does not apply to these HACS integrations — but its
[image specification](https://github.com/home-assistant/brands#image-specification)
still does, because the same file is what HACS shows and what the docs site
republishes as the carrier tile. CI enforces it
(`.github/scripts/check_brand_icon.py`, in the `policy` job):

- exactly **256x256** PNG (`icon@2x.png`, if present, 512x512)
- **rounded corners must be transparent.** Never flatten a rounded app icon
  onto an opaque backdrop — it shows as coloured wedges in the corners. Round
  all four corners or none.
- **no baked-in border or letterbox** ringing the artwork
- **no upscaling** from a source too small to carry 256px

Padding is deliberately *not* checked. The suite's tile style is a logo
centred on a full-bleed brand-colour plate, which the spec's "trim" rule would
condemn almost everywhere; what is checked is artwork lying about its edges.

Prefer the brand's **Play Store listing icon** as the source — it is square,
512px and official. `tools/icon_audit.py` sweeps every repo plus the docs
site's alias logos at once.

## Claude skills

Skills are installed **globally** (`~/.claude/skills/`), not per repo. The two
in use — `ha-integration-knowledge` and `home-assistant-custom-integration` —
are generic HA-integration knowledge with nothing carrier-specific in them, so
one copy serves every repo in the suite and no repo can drift from another.

Do not commit a `skills-lock.json` to a carrier repo. `.claude/` is gitignored
everywhere, so a per-repo lock file pins content that no clone can see and no
tooling here reads. The global lock lives at `~/.claude/skills-lock.json`.

## Dynamic polling (integrations)

No user-facing polling interval. `coordinator.py` recomputes `update_interval`
after every refresh: a quiet window (00:00–06:00, with two daily catch-up
anchors), a hot tier (15 min) for a tracked parcel `out_for_delivery` within
an hour of `planned_from`, a mid tier (45 min) for everything else in flight,
a full stop for account-less carriers when nothing is tracked, a per-install
stagger, and 429-aware backoff. See `ha-carrier-template/scaffold/CLAUDE.md`
("Dynamic polling") for the authoritative spec — this is a summary pointer,
not a second copy to keep in sync by hand.

A carrier that throttles harder than the 429 backoff handles documents that
divergence in its own repo's `CLAUDE.md`, not here.

## Deliberate skill divergences (integrations)

These diverge from the `ha-integration-knowledge` skill on purpose — that skill
targets HA **Core**; these are **HACS** integrations. Do not "fix" them to match
the core rule.

- **Inline API client** (no separate published library) is acceptable here.
- **Synchronous request patterns** where a carrier's API forces them are
  acceptable; do not re-flag.

## Code rules checked in CI (integrations)

Reviews of the HACS submissions kept finding the same few mistakes, so they
are checked mechanically. Fix the code; add an exception only when the reason
is real, and write it next to the code.

- **Home Assistant core's lint rules, formatting and clean types.** Every
  carrier's `ruff.toml` is the template's copy of core's ruleset, adapted only
  where core assumes a newer Home Assistant than the suite supports; never edit
  it per carrier. CI runs `ruff check`, `ruff format --check` (ruff 0.17.0) and
  `mypy custom_components/<domain> --ignore-missing-imports`. A `noqa` or
  `type: ignore` names its code and carries a short reason.
- **No blocking I/O on the event loop.** `ruff`'s `ASYNC` rules run in CI for
  every carrier. `ZoneInfo(...)` is not caught by them, so
  `check_code_rules.py` flags one built inside a function: constructing it reads
  the tz file from disk the first time, which Home Assistant reports as blocking
  I/O. Build it once at module level (`CARRIER_TZ = ZoneInfo("Europe/Rome")`),
  or resolve a zone named in the data with
  `await dt_util.async_get_time_zone(name)` in the coordinator and pass it in.
  When the zone is already loaded off the loop, mark the call:
  `# suite: allow zoneinfo (<reason>)`.
- **`hacs.json` declares a Home Assistant minimum the code actually runs on.**
  `check_code_rules.py` fails when the code uses an API newer than the declared
  `homeassistant` (today `UpdateFailed(retry_after=...)` needs 2025.12.0 and
  `DataUpdateCoordinator(config_entry=...)` 2024.11.0). Add a row to
  `HA_VERSION_REQUIREMENTS` when a review finds another.
- **No browser User-Agent unless the carrier refuses Home Assistant's own.**
  Test it first: send a plain client User-Agent and a browser one to the same
  endpoint and compare. Only when the carrier answers differently, send the
  browser one and write down what it does without it:
  `# suite: allow browser user-agent (<what the carrier does>)`.
- **A claim in a README or `CLAUDE.md` is a promise.** If the docs describe an
  option, a field, a redaction or a guarantee, the code must do it. Reviewers
  read the two side by side.
- **Warnings that guard an unconfirmed guess log once**, not on every poll (see
  *Pre-1.0 releases*), and a status the main field does not map falls back to
  the newest history event before it becomes `unknown`.

## Engineering principles (integrations)

The HACS reviews keep finding the same kinds of mistakes. These are the
principles behind them; the lists after each are examples, not the full rule.
`carrier-build` builds to them and `carrier-review` checks them.

1. **Never block Home Assistant.** Anything that takes time stays off the
   event loop and out of start-up: disk reads, waiting, heavy calculation (a
   proof-of-work solver, hashing, parsing a large payload). Use the executor,
   or do it once off the loop and pass the result in. CI catches the common
   cases (§ Code rules checked in CI).
2. **One entry never harms another.** A user may run two accounts or hubs.
   Removing, disabling or reloading one must leave the services, entities and
   data of the others working: shared services go away only when the last
   loaded entry does.
3. **A session survives a restart.** Whatever the carrier renews or rotates is
   saved back to the config entry. A rejected login asks for sign-in once, via
   Home Assistant's own reauth, never by starting flows by hand. Reauth tests
   use an entry that has a unique id, as real ones do.
4. **Sensitive data goes nowhere others can see it.** Codes that open
   something (a locker PIN) or sign in (tokens) never reach `raw`, attributes
   or events. Diagnostics redacts everything personal in what is actually
   stored, spelled exactly as it is stored; compare the redaction list with a
   real fixture.
5. **Every source behaves the same.** A carrier with more than one source or
   direction (inbox and tracking codes, incoming and outgoing) gives each the
   same events, sensors and "last update"; a per-parcel sensor looks in every
   list a parcel can be in.
6. **What we promise is true.** The repository description, `hacs.json` name,
   README and forms only claim what the code does and what has been seen on a
   real parcel. Every option and service field appears in the schema, the
   form and every translation, and every `{placeholder}` in a text is filled.
7. **Ship it as users find it.** The README's install steps match where the
   integration is listed. Once accepted into the HACS default list, the badge
   says Default and the steps are "search HACS, install, restart". Before
   submitting to hacs/default, go through the points above: each review round
   costs a wait, and only one pull request per person can be open.

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
  full normalised parcel (including `raw`) plus the account's `device_id`. Event
  data is written to the recorder database, so `raw` there can hold personal
  data (HACS reviewers flag it on every submission); it stays in for now
  because automations read it, and stripping it is a contract change for every
  carrier and the aggregator. The one exception is a code that opens or signs
  in to something (a locker PIN, a token): that never goes into `raw`. The
  **aggregator** re-emits these under a unified prefix with `raw` stripped —
  onboard a new carrier there by adding its HA domain to `KNOWN_CARRIERS` +
  `CARRIER_EVENT_PREFIXES`, nothing else.
- **First refresh runs in `__init__.py`** (before forwarding platforms), so a
  transient fetch failure fails setup cleanly and Home Assistant retries — never
  in a platform.
- **Unmapped status: map, else history, else warn.** An unrecognised carrier
  status or code does not go straight to `ParcelStatus.UNKNOWN` — fall back to
  the newest history event that *does* map, and only then to `unknown`. A
  parcel whose newest scan carries a word we've never seen is almost never a
  parcel in an unknown state; its previous scans still say where it is. Either
  way the unknown value logs a **one-shot warning** with a copy-paste
  `issues/new` line; users report them via the *Unrecognised parcel status*
  issue template. Log the key or code, never a value that could carry PII.
- **Pickup point, not ServicePoint/parcel shop/locker.** Use "pickup point"
  as the one generic term for this concept in docs, conventions, and any
  new shared identifier — it already matches `ParcelStatus.AT_PICKUP_POINT`
  and the normalised `pickup_point` parcel field. A carrier's own
  human-facing sensor name may still use its brand term (DHL's "ServicePoint",
  PostNL's "Punt", …), same as friendly names already vary per carrier — but
  don't introduce a second generic term alongside "pickup point".
- **`awaiting_pickup` sensor.** Any carrier whose parcels can reach
  `ParcelStatus.AT_PICKUP_POINT` from a real raw status/code exposes an
  `awaiting_pickup` sensor (arrived, ready for collection). Membership is
  `status == AT_PICKUP_POINT` alone — no `pickup` gate, so a failed home
  delivery that gets rerouted to a pickup point still counts. Reference
  implementations: `ha-dhl-nl`, `ha-dpd`, `ha-gls`, `ha-inpost`. The Parcel
  Aggregator reads ready parcels only from this sensor, so a carrier that maps
  a status to `AT_PICKUP_POINT` without one drops out of its total. A carrier
  whose statuses never actually reach `AT_PICKUP_POINT` (no pickup-point
  delivery method) is exempt — say so explicitly in that repo's own
  `CLAUDE.md` so the gap reads as a decision, not an oversight.
- **`en_route_to_pickup_point` sensor (optional).** A carrier that can tell,
  before arrival, that a parcel is headed for a pickup point may expose it:
  `pickup is true` and `status != AT_PICKUP_POINT`, so it never overlaps
  `awaiting_pickup`. Only add it when `pickup` is reliable ahead of arrival —
  a carrier that only learns it at arrival would publish a permanently-zero
  sensor. The Parcel Aggregator merges both sensors from their carrier
  sources; it never derives either phase from `incoming_parcels`. Both sensors follow the list-sensor shape
  (integer state, `parcels` attribute) and use the translation key as the
  unique-ID suffix; `incoming_parcels` stays the complete active list.
