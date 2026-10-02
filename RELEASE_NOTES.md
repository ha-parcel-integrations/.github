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
  turns the subject into a bullet under `New features` or `Bug fixes` and the
  body into the prose underneath it, so write **both** for the person updating
  the integration, not for the diff. The generator may condense, split or
  reword that — see [Editing is the generator's job](#editing-is-the-generators-job)
  — so the body's job is to carry the facts, user-facing and complete; it is
  not a final text nobody may touch. Say what changed *for them* and
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

  **Separate the body's points with a blank line.** Each blank-line-separated
  block becomes one paragraph inside the bullet; everything inside a block is
  re-flowed onto a single line, because git bodies are hand-wrapped at ~72
  columns and GitHub would otherwise render every soft wrap as a hard break.
  A `- ` list also starts a new paragraph per item, so a list no longer welds
  itself into one unreadable run-on — but prose is still the house style, and
  one commit making two unrelated points is usually two commits.

  Other types are never published, so their body only needs to be clear to a
  maintainer. If the *subject* is genuinely hard to state in one user-facing
  line, that is a signal it is two commits, or a `refactor:` — reaching for
  the body to make one commit describe two changes is not the fix.

## Release PR body format

- **The release PR body is the release, verbatim — edit it before merging.**
  That is where the judgement a rule cannot make belongs: naming who reported an
  issue, merging two commits into one clearer bullet, adding context a subject
  had no room for. **An edited body is never overwritten:** a later
  `feat:`/`fix:` push notices the edit, leaves the body alone and posts the
  regenerated notes as a PR comment instead, so the new change is still
  visible and folding it in stays a human decision. An unedited body is
  regenerated in place as before.
- <a id="editing-is-the-generators-job"></a>**Editing is the generator's job,
  not transcription.** `ai_release_notes.js` reads the `feat:`/`fix:` commits
  since the last release and writes the notes from them: it rewrites, shortens
  and restructures, splits one commit that describes two unrelated changes into
  two bullets, and merges several commits describing one change into one. Every
  published fact still has to come from those commits — nothing invented, and
  the essence unchanged — but the wording and the shape are the generator's
  call. A bullet plus at most one short paragraph is the normal size; the
  reasoning a commit body gives for *why* a change was built the way it was
  does not survive into the release, because the reader cannot act on it.
- **Release notes are user-facing only.** Use the shared `##` house style
  (`New features`, `Bug fixes`, `Other improvements`, `Credits`) and never
  cross-reference other repos. A bullet is one line, optionally followed by
  indented paragraphs that expand it — that indentation is what keeps them
  inside the bullet, so don't hard-wrap a bullet's own first line.
  A section with nothing to say is omitted rather than filled with a placeholder
  sentence; `Credits` is generated from the reporters and commenters on every
  issue a commit references, and is still worth extending by hand for anyone
  who tested outside an issue. Maintainers are never credited — the
  tester-request issues are opened by one, so the reporters are the commenters.
- **A bullet's first line stays short, and the detail goes underneath it.**
  Both renderers — the mechanical one and the AI one in
  `.github/scripts/ai_release_notes.js` — emit exactly that shape, and
  anything that asks a bullet to carry its whole story in one sentence is a
  bug in the generator, not a style. The symptom to watch for is a bullet
  chaining unrelated facts with semicolons; that is a paragraph that was
  flattened, and it reads worse than the commit it came from.
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

  That page is generated from `data/carriers.yml` in the
  [`ha-parcel-integrations.github.io`](https://github.com/ha-parcel-integrations/ha-parcel-integrations.github.io)
  repo, where a new carrier gets its one entry. The org profile README is
  generated from that repo too, but carries no carrier list of its own — a
  release note never has to touch either by hand.
- **The aggregator names the carriers it adds, and links each one.** When a
  release adds carrier support, write the carrier names as links to their repos
  (`[Packeta](https://github.com/ha-parcel-integrations/ha-packeta)`), not as
  plain text — that release *is* the announcement for those integrations.
