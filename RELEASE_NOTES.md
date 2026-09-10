# Release notes

`ha-parcel-integrations` is a suite of independent Home Assistant custom
integrations, one per parcel carrier (PostNL, DPD, GLS, ...), each installed
by end users through HACS. A release note is read by someone deciding whether
to update a live Home Assistant instance — not a developer reading a diff —
so it has to stand on its own: what changed, what they'll now see, without
any of the internal reasoning or code that produced it.

This doc covers how a `feat:`/`fix:` commit becomes a published release note,
and the house style for the generated release PR body. Linked from
[`CONVENTIONS.md`](CONVENTIONS.md) — read this whenever you're writing a
`feat:`/`fix:` commit, editing a release PR before merging, or generating
release notes for one (see `.github/scripts/ai_release_notes.js`).

## Writing the commit (this is the note)

- **A `feat:`/`fix:` commit message is the release note.** Release automation
  copies the subject verbatim into `New features` or `Bug fixes` and indents
  the body underneath it as part of the same bullet, so write **both** for the
  person updating the integration, not for the diff. Say what changed *for them* and
  name the thing they see — the sensor, the setting, the notification — not the
  module, function or field that moved. Avoid the vague verbs that read fine in
  a diff and say nothing in a changelog: *improve*, *standardize*, *expose*,
  *update*, *additional*, *various*. No trailing period; the bullet supplies it.

  | Instead of | Write |
  |---|---|
  | `feat: add awaiting pickup sensor` | `feat: add a sensor counting parcels waiting at a pickup point` |
  | `feat: expose additional parcel details` | `feat: show the delivery window and pickup point on each parcel` |
  | `fix: standardize translation terminology` | `fix: use the same wording for pickup points in every language` |
  | `fix: recognise K01/B03 observation codes instead of reporting unknown` | `fix: recognise two more PostNL status codes instead of reporting unknown: "Sorry, bezorgmoment is bijgewerkt" and "Leeg" (#20)` |

  The last row matters as much as the others: never let an internal code,
  field, enum value or module name leak into the bullet (`observationCode`,
  `K01`, `in_transit`) — only what the user actually sees, quoted if that
  helps (a notification string, a sensor state).

  Give a `feat:`/`fix:` a body whenever one line leaves the reader guessing —
  what they will now see, what they had to do before, what still won't work.
  Some changes need only their subject: `fix: relabel the country field from
  "country dataset" to "country"` is complete as it stands, and padding it out
  helps nobody. The test is whether a user can act on the bullet, not whether
  it reaches a length. Keep it plain prose — no diff detail, no module names.

  Other types are never published, so their body only needs to be clear to a
  maintainer. If the *subject* is genuinely hard to state in one user-facing
  line, that is a signal it is two commits, or a `refactor:` — reaching for
  the body to make one commit describe two changes is not the fix.

## Release PR body format

- **The release PR body is the release, verbatim — edit it before merging.**
  That is where the judgement a rule cannot make belongs: naming who reported an
  issue, merging two commits into one clearer bullet, adding context a subject
  had no room for. A later `feat:`/`fix:` push regenerates the body, so edit it
  shortly before merging.
- **Release notes are user-facing only.** Use the shared `##` house style
  (`New features`, `Bug fixes`, `Other improvements`, `Credits`) and never
  cross-reference other repos. A bullet is one line, optionally followed by
  indented paragraphs that expand it — that indentation is what keeps them
  inside the bullet, so don't hard-wrap a bullet's own first line.
  A section with nothing to say is omitted rather than filled with a placeholder
  sentence; `Credits` in particular is worth adding by hand whenever someone
  reported or tested the change.
- Leave dev-only changes (gitignore, CI, tooling) out of the notes.
- **If the repo has open `help wanted` issues, link them before the footer.**
  One line, e.g. `🙋 [N open questions need a real parcel to answer](https://github.com/ha-parcel-integrations/<repo>/issues?q=is%3Aissue+is%3Aopen+label%3A%22help+wanted%22)`.
  Pre-1.0 carriers almost always have some — this is how a tester finds them
  without digging through the issue tracker.
- **No "Also new in the family" section.** New sibling carriers are not listed in
  a carrier's release notes — the list outgrew the format and went stale the
  moment the next carrier landed. Every release ends with the same footer
  instead, verbatim:

  ```markdown
  ---

  📦 [See every supported carrier](https://ha-parcel-integrations.github.io/carriers/) — new ones land regularly.
  💛 [Support the project](https://ha-parcel-integrations.github.io/sponsor/)
  ```

  The docs site's carriers page is the single source of truth for that list, so
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
