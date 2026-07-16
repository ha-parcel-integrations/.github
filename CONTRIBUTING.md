# Contributing

Thanks for helping improve these Home Assistant projects! 🎉

## Ways to contribute

- **Report an unrecognised parcel status** — the quickest, most useful contribution. Use the *Unrecognised parcel status* issue template and paste the log line.
- **Report a bug** or **request a feature** via the issue templates.
- **Open a pull request** for a fix, a new mapping, or a new feature.

## Development setup (integrations)

1. Fork and clone the repository.
2. Use a Python environment matching a recent Home Assistant (3.13+). A checked-out Home Assistant dev environment works well, or create a venv and install the dev requirements:
   ```
   pip install -r requirements-dev.txt
   ```
3. Run the tests with coverage (adjust the component path per repo):
   ```
   python -m pytest tests/ --cov=custom_components.<domain>
   ```
   Keep coverage within the project's bar (integrations aim for **>95%**).

## Pull requests

- CI (validation + tests) **runs automatically** on your PR — no need to ask.
- A **maintainer reviews and merges**; contributors don't self-merge.
- Keep **commit messages to a single line**.
- Update docs (README / `CLAUDE.md`) where behaviour changes.
- Fill in the PR template (What / Why / Changes + checklist).

## Conventions

Shared conventions for every repo in this organization — commit style, release
flow, versioning, and the canonical parcel contract — live in
[`CONVENTIONS.md`](CONVENTIONS.md). Please skim it before a larger change.

## Questions

For setup questions and general discussion, use the
[Home Assistant community thread](https://community.home-assistant.io/t/packages-postnl-dhl-nl-dpd-and-gls-parcel-integration/112433/)
rather than an issue.
