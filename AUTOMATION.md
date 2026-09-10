# Carrier automation

Every `ha-<carrier>` integration calls two reusable workflows from this
repository at `@main`. The carrier repositories hold only a small caller and
`.github/suite.json`; the steps, scripts and policy live here once.

| Workflow | Called by | Does |
|---|---|---|
| `carrier-validate.yml` | the carrier's `Validate` | HACS, hassfest, pytest with coverage, Ruff, translation structure, suite policy and commit subjects |
| `carrier-release.yml` | the carrier's `Release` | publishes a merged release PR, then proposes the next one |

Reusable workflows run in the caller's context, so HACS and hassfest validate
the carrier repository itself and its checks stay in its own Actions tab.

## How a release happens

Development is pushed directly to `main`. After a successful `Validate` run,
`Release` first publishes anything that is ready and then recalculates:
`feat:` proposes a minor and `fix:` a patch release, accumulated into one
`automation/release` PR. `chore:`, `refactor:`, `docs:`, `test:` and `ci:`
never propose a release.

Merge that PR when a release is wanted. Its own successful validation on `main`
then creates the no-`v` tag and the GitHub Release. Publishing runs before
preparing on purpose, so the new release is already the base when the next
version is calculated.

The release body is the merged PR's body, verbatim. Edit the PR body to add
credits or rewrite a summary before merging — that is the intended place for
the judgement a rule cannot make. Note that a later `feat:`/`fix:` push
regenerates the body, so edit it shortly before merging.

Merge the release PR with **squash**. A merge commit puts "Merge pull request
#N" on `main`, which is not the bump subject publishing looks for, and a rebase
merge breaks the link between the commit and its PR. Either way nothing is
published.

## Requirements per carrier repository

- `.github/suite.json` with `kind` and `domain`.
- `.github/workflows/validate.yml` and `.github/workflows/release.yml` callers.
- A `RELEASE_BOT_TOKEN` secret before the first live release: repository
  `Contents: read/write` and `Pull requests: read/write`, allowed to push
  `automation/*`. A GitHub App token is preferred. It exists so the generated
  PR triggers normal PR checks; tags and releases deliberately use the default
  token instead.

Run **Release** manually with `dry_run` enabled to see the calculated version
and notes without opening a PR.

## Pre-releases

There is no automated pre-release. The suite's `X.Y.ZbN` builds are made by
hand, and the automation stays out of their way: publishing only acts on a
merged `automation/release` PR, and the release manager skips pre-releases when
it looks for the base version.
