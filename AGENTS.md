# Agent instructions

Follow [CONTRIBUTING.md](CONTRIBUTING.md) and the [git workflow](docs/development/git-workflow-and-releases.md).

- Track work in GitHub issues and milestones on `B-Pine/medilink-rwanda`; link PRs with `Closes #N`.
- Branch off `main`, use Conventional Commits, squash-merge only with CI green. Never push to `main`.
- Build sprints contract-first ([sprint contracts](docs/architecture/contracts/README.md)); follow the shared-file protocol.
- Update the CHANGELOG, the [API catalogue](docs/api/catalogue.md) and the [traceability matrix](docs/qa/traceability-matrix.md) with behaviour changes.
- Keep per-user agent or MCP configs (`.cursor/`, `.gemini/`, `.codex/`, `.agents/`) out of git.
