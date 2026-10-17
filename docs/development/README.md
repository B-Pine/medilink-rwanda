# Development guides

Status: v0.1 · For everyone who writes code, tests or documentation for MediLink. Read [CONTRIBUTING.md](../../CONTRIBUTING.md) and [SECURITY.md](../../SECURITY.md) first.

| Guide | Read it for |
|---|---|
| [Getting started](getting-started.md) | Prerequisites, local infrastructure, running the backend and both frontends, Windows notes |
| [Coding standards](coding-standards.md) | Python/Django and TypeScript/React conventions, naming, folder structure per module, error handling, i18n, accessibility, security rules |
| [Testing strategy](testing-strategy.md) | Test pyramid, authorisation matrix, cross-tenant and RLS tests, business rules, frontend tests, contract tests, performance, security tests, acceptance evidence |
| [Git workflow and releases](git-workflow-and-releases.md) | Branches, commits, pull requests, versions and tags, changelogs, release checklist, hotfixes |
| [Translations](translations.md) | Kinyarwanda-first workflow, key naming, native-speaker review, adding a language |
| [Environments and deployment](environments-and-deployment.md) | Local, CI, staging, production; the two pipelines; migrations; rollback; configuration and secrets; data residency |

## Where else to look

| Topic | Document |
|---|---|
| What the system must do | [Requirements index](../requirements.md) and [system analysis](../README.md) |
| How the system is built | [Architecture](../architecture/README.md), [database design](../architecture/04-database-design.md), [API catalogue](../api/README.md) |
| What to build when | [Roadmaps](../roadmap/README.md) and the sprint contracts |
| How we prove it works | [QA: traceability matrix and acceptance records](../qa/README.md) |
| How it is secured | [Security documentation](../security/README.md) |
| How it is run | [Operations runbooks](../operations/README.md) |
| What changed | [Root changelog](../../CHANGELOG.md); `backend/CHANGELOG.md` and `frontend/CHANGELOG.md` for each deployable |
