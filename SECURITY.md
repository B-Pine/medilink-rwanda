# Security and patient data

MediLink handles health data, which is sensitive personal data under Rwanda's Law No. 058/2021 on the protection of personal data and privacy.

## Rules for this repository
- **Never commit real patient data** — not in code, fixtures, screenshots, logs or issues. Use generated test data.
- **Never commit secrets.** API keys, database URLs and tokens go in environment variables; `.env` files are git-ignored. Use `.env.example` with placeholder values.
- Encrypt patient data in transit (TLS) and at rest.
- Every access to patient records by staff must be permission-checked and audit-logged.
- Store and process patient data in Rwanda unless a transfer has been authorised.

## Full security documentation
How MediLink is secured (threat model, authentication, tenant isolation, encryption, infrastructure, incident response, go-live checklist): [docs/security](docs/security/README.md).

## Reporting a vulnerability
Do not open a public issue. Email the security contact: `security@<your-domain>` (replace before launch).
