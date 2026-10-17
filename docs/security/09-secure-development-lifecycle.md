# 09 · Secure development lifecycle

Status: v0.1 · Framework: NIST SP 800-218 **SSDF** (Prepare the organisation · Protect the software · Produce well-secured software · Respond to vulnerabilities). Verification target: **OWASP ASVS 5.0 Level 2**, with selected Level 3 controls ([12](12-compliance-mapping.md)).

## 1. Prepare the organisation

- A named **security lead** (part-time at first) owns this documentation, the risk register and incident response.
- Security requirements live in the requirements (`FR-SEC-*`, `NFR-*`) and in these docs. Pull requests reference them.
- Developers complete OWASP Top 10 / ASVS training and a Django security session before touching patient-data code.

## 2. Protect the software (repository and pipeline)

| Control | Setting |
|---|---|
| GitHub accounts | 2FA required for everyone in the organisation; least-privilege repo roles |
| Branch protection on `main` | PR required, 1+ approval (2 for security-sensitive paths), status checks required, no force pushes, linear history (squash) |
| CODEOWNERS | Security lead must review: `backend/**/authz/**`, `**/permissions*`, `**/migrations/**`, `**/settings/**`, `**/security/**`, CI workflows, Dockerfiles, infrastructure code |
| Secret protection | GitHub secret scanning + push protection; gitleaks in CI and as a pre-commit hook |
| CI permissions | GitHub Actions with minimal `permissions:`; third-party actions pinned by commit SHA; no production secrets in CI except the deploy job, which uses OIDC / short-lived credentials and an environment with required reviewers |
| Signed releases | Container images signed (cosign) and verified at deploy; provenance attestation (SLSA-style) when feasible |

## 3. Produce well-secured software

### Per feature

1. **Threat check** in the design: which assets, which abuse cases (use [01](01-threat-model.md)). Five minutes for small features, a session for big ones.
2. **Security acceptance criteria** in the issue (e.g. "receptionist cannot read diagnosis", "cross-facility ID returns 404").
3. **Tests** for those criteria: the authorisation matrix, cross-tenant and business-rule tests.
4. **Review** with the PR checklist (already in `.github/pull_request_template.md`, extended below).
5. Run **Claude Code `/security-review`** on PRs that touch patient data, auth, payments or file handling, as an extra reviewer (not a replacement for a human).

### CI security gates (every pull request)

| Stage | Tools | Fails the build when |
|---|---|---|
| Lint & SAST (Python) | ruff (incl. bandit `S` rules), Semgrep (`p/django`, `p/python`, `p/owasp-top-ten`, plus our own rules: no `.objects.all()` in views, no `fields="__all__"`, no `mark_safe` on user data, no raw SQL without review tag) | Any high finding |
| SAST (TypeScript) | ESLint with security and React rules (`react/no-danger` error), TypeScript strict | Any error |
| Dependencies | `pip-audit` + `osv-scanner` (Python & npm), `npm audit --omit=dev` | Fixable high/critical |
| Lockfiles | Hash-pinned Python requirements (`uv`/`pip-tools --generate-hashes`), `npm ci` | Lockfile drift |
| Secrets | gitleaks | Any finding |
| Django config | `manage.py check --deploy --fail-level WARNING` (prod settings) | Any warning |
| Containers & IaC | Trivy (image + config), hadolint | Fixable critical/high; misconfig high |
| Tests | Unit + authz matrix + cross-tenant + RLS + business-rule tests | Any failure; coverage on `authz` < 95% |
| SBOM | CycloneDX for Python and npm, attached to the build | — |

### Staging gates (before release)

- **DAST:** OWASP ZAP baseline scan (and an authenticated scan per role) against staging.
- **E2E security tests** (Playwright): logout really ends the session; locked screen hides data; display token can't call APIs; patient can't open another patient's document URL.
- CSP violations reviewed (report-only → enforce).

### Dependencies

- Renovate/Dependabot weekly; security updates merged within the patch deadlines in [07](07-infrastructure-and-operations-security.md) §2.
- **New dependency checklist:** maintained? popular? licence OK? does it need network or native code? is there a smaller alternative? Recorded in the PR.

## 4. Respond to vulnerabilities

- **Responsible disclosure:** `SECURITY.md` updated with a real contact, plus `/.well-known/security.txt` on all domains, before launch. Acknowledge within 2 working days.
- **Triage** using CVSS + our context (patient data? exploitable without login?). Fix deadlines: critical 7 days, high 30, medium 90.
- **Root cause** for every security bug: a regression test plus, where possible, a Semgrep rule so the same mistake can't return.
- **Penetration test** by an independent tester before go-live and yearly, focused on access control, multi-tenancy, business logic and file handling. Retest after fixes.

## 5. Pull request checklist (to add to the template)

```
## Security
- [ ] Touches patient data? → authz policy + tests (own / other facility / other patient)
- [ ] New endpoint has an explicit permission policy and is in the authz matrix
- [ ] Serializer fields explicit; no new sensitive field exposed to an extra role
- [ ] No secrets, real data or personal data in code, logs, fixtures, screenshots
- [ ] User input validated server-side; no raw SQL / mark_safe / dangerouslySetInnerHTML
- [ ] Audit log entries for new sensitive actions
- [ ] Migrations reviewed (RLS policy added for new facility tables)
```
