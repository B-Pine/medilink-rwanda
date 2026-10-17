# Contributing

## Branches
- `main` is always deployable and protected. No direct pushes.
- Work on short-lived branches: `feat/queue-alerts`, `fix/booking-timezone`, `docs/requirements-update`.

## Commits
Use [Conventional Commits](https://www.conventionalcommits.org/): `feat(api): add call-next endpoint`, `fix(staff-web): …`, `docs: …`.
Scopes: `api`, `patient-web`, `staff-web`, `patient-mobile`, `ml`, `docs`, `ci`.

## Requirements
Requirements have IDs such as `FR-QUE-05` (see [docs/requirements.md](docs/requirements.md)). Reference them in issues and pull requests. If a change alters a requirement, update its document in `docs/analysis/` in the same pull request.

## Pull requests
- Link the issue (`Closes #12`).
- One reviewer approval and green checks before merge.
- Squash-merge.
- Keep PRs small. If a PR touches patient data, say so in the description.

## Issues
Use the bug or feature template. Label with an area and a priority.

## Language
Code, commits and docs in English. User-facing text goes through translation files (Kinyarwanda first, then English, then French) — never hard-code it.
