# Git workflow and releases

Status: v0.1 · Extends [CONTRIBUTING.md](../../CONTRIBUTING.md). Decisions: [ADR 0006](../decisions/0006-separate-frontend-and-backend-hosting.md) (separate versions and tags), [security 09](../security/09-secure-development-lifecycle.md) §2 (repository protection), [security 07](../security/07-infrastructure-and-operations-security.md) §8 (change management).

## 1. Branches

- `main` is always deployable and protected: pull request required, status checks required, no force pushes, linear history (squash merges only).
- Work on short-lived branches from `main`, one topic each, merged within days:

| Prefix | Use | Example |
|---|---|---|
| `feat/` | New capability | `feat/queue-call-next` |
| `fix/` | Bug fix | `fix/booking-timezone` |
| `docs/` | Documentation only | `docs/api-catalogue` |
| `chore/` | Tooling, dependencies, housekeeping | `chore/bump-django` |
| `ci/` | Workflows | `ci/security-scan` |
| `refactor/`, `test/` | No behaviour change / tests only | `test/rls-visits` |
| `hotfix/` | Urgent production fix (§7) | `hotfix/backend-receipt-gap` |

- Rebase on `main` (or merge `main` in) before review; resolve conflicts on your branch, never on `main`.

## 2. Commits

[Conventional Commits](https://www.conventionalcommits.org/): `type(scope): summary` in the imperative, ≤ 72 characters.

| Type | Meaning | Changelog section |
|---|---|---|
| `feat` | New capability | Added |
| `fix` | Bug fix | Fixed |
| `docs` | Documentation | (root changelog) |
| `refactor`, `perf`, `test`, `style` | No functional change / performance / tests / formatting | Changed (perf) or none |
| `build`, `ci`, `chore` | Build, CI, maintenance | none, unless user-visible |
| `revert` | Revert an earlier commit | Fixed or Removed |

Scopes (from CONTRIBUTING): `backend`, `frontend`, `patient-web`, `staff-web`, `ui`, `patient-mobile`, `ml`, `docs`, `ci`, `brand`. A breaking change adds `!` (`feat(backend)!: …`) and a `BREAKING CHANGE:` footer. Put requirement IDs in the body (`Implements FR-QUE-08`).

## 3. Pull requests

1. Open a pull request with the template filled in: what, why, `Closes #…`, **requirement IDs**, and the security checklist.
2. Keep it small (one reviewable idea). Label `patient-data` if it touches patient data.
3. In the same pull request:
   - add an entry to the relevant `CHANGELOG.md` under `[Unreleased]` (§5);
   - update the [API catalogue](../api/catalogue.md) row status when endpoints are added or changed;
   - update the docs and the [traceability matrix](../qa/traceability-matrix.md) when behaviour or status changes;
   - add or update translation keys for every user-facing string.
4. Required before merge: green checks, **one approval**, and the code owner's approval for security-sensitive paths in [CODEOWNERS](../../.github/CODEOWNERS) (security 09 asks for two approvals there once the team has two reviewers).
5. **Squash merge.** The pull request title becomes the commit on `main`, so it must be a valid Conventional Commit.
6. Delete the branch after merge.

## 4. Versions and tags

Backend and frontend are versioned and released separately with [Semantic Versioning](https://semver.org/):

| Deployable | Version source | Tag | Changelog |
|---|---|---|---|
| Backend (API, workers) | `backend/pyproject.toml`; reported by `GET /api/v1/health/` | `backend-vX.Y.Z` | `backend/CHANGELOG.md` |
| Frontend (both apps) | `frontend/package.json` | `frontend-vX.Y.Z` | `frontend/CHANGELOG.md` |
| Documentation and repository | — | not tagged | [`CHANGELOG.md`](../../CHANGELOG.md) (root) |

| Bump | Backend | Frontend |
|---|---|---|
| MAJOR | A new API version (`/api/v2`) or another breaking change for clients | A change that needs a newer minimum API major |
| MINOR | New endpoints, fields or features (backward compatible within `/api/v1`) | New screens or features |
| PATCH | Fixes without contract changes | Fixes |

- Until the first pilot release, versions stay at `0.y.z`: each sprint release bumps the minor version (Sprint 0 → `0.1.0`). The first release used with real patients is `1.0.0`.
- The frontend build declares the minimum API version it needs; deploy the backend first when the frontend depends on new endpoints.
- Tags are annotated and created on `main` after the release pull request is merged: `git tag -a backend-v0.1.0 -m "backend 0.1.0"`, then `git push origin backend-v0.1.0`. A GitHub Release is created from the tag with the changelog section as notes.

## 5. Changelogs

All changelogs follow [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

- **Every pull request updates the relevant changelog** under `## [Unreleased]`: `backend/CHANGELOG.md` for API changes, `frontend/CHANGELOG.md` for UI changes, the root `CHANGELOG.md` for documentation and repository-wide changes (CI, tooling, policies). A pull request that touches several areas updates each one.
- Sections: `Added`, `Changed`, `Deprecated`, `Removed`, `Fixed`, `Security`.
- Write for people who use or run the software, not a list of commits. Reference requirement IDs and the pull request number: `- Atomic Call next with SKIP LOCKED (FR-QUE-08) (#42)`.
- At release, rename `[Unreleased]` to `[X.Y.Z] - YYYY-MM-DD`, start a new empty `[Unreleased]`, and update the compare links at the bottom.
- Security fixes are described without exploit details until the fix is deployed.

## 6. Release checklist

Copy into the release pull request.

```markdown
### Release backend-vX.Y.Z / frontend-vX.Y.Z

- [ ] Sprint acceptance checks verified with evidence (docs/qa); traceability matrix statuses updated
- [ ] CHANGELOG: [Unreleased] → [X.Y.Z] - YYYY-MM-DD; compare links updated
- [ ] Version bumped (pyproject.toml / package.json); /health reports the new version
- [ ] API catalogue rows set to "Implemented (backend-vX.Y.Z)"; OpenAPI schema and frontend types regenerated
- [ ] Migrations reviewed, reversible, tested on staging with production-sized synthetic data (backend)
- [ ] Minimum API version declared and deployed first (frontend)
- [ ] Security gates green; no new high findings; ZAP on staging reviewed
- [ ] Translations: no missing keys; Kinyarwanda strings reviewed by a native speaker
- [ ] Deployed to staging; e2e and smoke tests green; demoed
- [ ] Rollback plan noted (previous image digest / previous static build)
- [ ] Tag created and pushed; GitHub Release notes from the changelog
- [ ] Production deployment approved (protected environment) and verified with smoke tests
- [ ] Facilities informed if users will notice the change (announcement, FR-NOT-11)
```

Production deployments happen outside facility hours (06:00–20:00 Kigali) unless they are emergency fixes ([environments and deployment](environments-and-deployment.md)).

## 7. Hotfixes

1. Open `hotfix/<deployable>-<topic>` from `main`, with a failing test that reproduces the problem.
2. Review and merge as usual (an expedited review is fine; the review can't be skipped).
3. Release a PATCH version (`backend-vX.Y.Z+1`) with its changelog entry.
4. If `main` already contains unreleased changes that can't ship yet, branch `release/backend-vX.Y` from the last tag, cherry-pick the fix, tag the patch from that branch, and make sure the fix is also on `main`.
5. Emergency changes deployed before full review get a written review within **2 working days** ([security 07](../security/07-infrastructure-and-operations-security.md) §8). Security incidents follow [security 10](../security/10-incident-response-and-continuity.md).

## 8. API deprecation

`/api/v1` stays backward compatible. Removing or renaming a field or endpoint needs `/api/v2` or a 3-month deprecation with `Deprecation` and `Sunset` headers, announced in `backend/CHANGELOG.md` under `Deprecated` ([API conventions](../architecture/02-api-conventions.md) §7).
