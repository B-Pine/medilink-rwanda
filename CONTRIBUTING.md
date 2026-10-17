# Contributing

## Branches
- `main` is always deployable and protected. No direct pushes.
- Work on short-lived branches: `feat/queue-alerts`, `fix/booking-timezone`, `docs/requirements-update`.

## Commits
Use [Conventional Commits](https://www.conventionalcommits.org/): `feat(api): add call-next endpoint`, `fix(staff-web): …`, `docs: …`.
Scopes: `backend`, `frontend`, `patient-web`, `staff-web`, `ui`, `patient-mobile`, `ml`, `docs`, `ci`, `brand`.

## Requirements
Requirements have IDs such as `FR-QUE-05` (see [docs/requirements.md](docs/requirements.md)). Reference them in issues and pull requests. If a change alters a requirement, update its document in `docs/analysis/` in the same pull request. The [traceability matrix](docs/qa/traceability-matrix.md) shows each requirement's sprint and status; update it when a status changes.

## Development
Setup, coding standards, testing, git workflow and releases, translations and deployment: [docs/development](docs/development/README.md).

## Changelog
Every pull request updates the relevant CHANGELOG under `[Unreleased]` ([Keep a Changelog](https://keepachangelog.com/en/1.1.0/)):
- `backend/CHANGELOG.md` for the API, `frontend/CHANGELOG.md` for the apps,
- [CHANGELOG.md](CHANGELOG.md) at the root for documentation and repository-wide changes.

Backend and frontend are versioned and tagged separately (`backend-vX.Y.Z`, `frontend-vX.Y.Z`). Details: [git workflow and releases](docs/development/git-workflow-and-releases.md).

## Pull requests
- Link the issue (`Closes #12`).
- One reviewer approval and green checks before merge. Code owners review security-sensitive paths ([CODEOWNERS](.github/CODEOWNERS)).
- Squash-merge.
- Keep PRs small. If a PR touches patient data, say so in the description.

## Issues
Use the bug or feature template. Label with an area and a priority.

## Language
Code, commits and docs in English. User-facing text goes through translation files (Kinyarwanda first, then English, then French) — never hard-code it.
