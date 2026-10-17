# 15 · Sources

Research carried out 17 Oct 2026. Primary standards take precedence over vendor blogs. Points from secondary sources are marked "confirm" in the documents.

## Standards and official guidance

- OWASP Top 10:2025: https://owasp.org/Top10/2025/0x00_2025-Introduction/
- OWASP ASVS 5.0 (overview of the May 2025 release): https://softwaremill.com/whats-new-in-asvs-5-0/ · https://www.securitycompass.com/blog/what-is-owasp-asvs/
- OWASP API Security Top 10:2023 (BOLA, BOPLA): https://www.isaca.org/resources/news-and-trends/industry-news/2023/reviewing-the-2023-owasp-api-top-10 · https://www.imperva.com/blog/understanding-the-owasp-api-security-top-10-why-bola-is-the-number-one-risk-for-apis/
- OWASP Top 10 for LLM Applications 2025: https://www.hackerone.com/ai/owasp-top-10-llms-2025 · https://www.confident-ai.com/blog/owasp-top-10-2025-for-llm-applications-risks-and-mitigation-techniques
- OWASP Django Security Cheat Sheet: https://cheatsheetseries.owasp.org/cheatsheets/Django_Security_Cheat_Sheet.html
- Django deployment checklist (6.0): https://django.readthedocs.io/en/6.0.x/howto/deployment/checklist.html
- Django 6.0 release notes (built-in CSP, tasks): https://docs.djangoproject.com/en/6.0/releases/6.0/
- Django Channels security (origin validation): https://channels.readthedocs.io/en/3.x/topics/security.html
- Celery security (pickle risks): https://docs.celeryq.dev/en/3.1/userguide/security.html
- NIST SP 800-63B-4 (final, July 2025): https://csrc.nist.gov/pubs/sp/800/63/B/4/final · summaries: https://www.enzoic.com/blog/nist-sp-800-63b-rev4/ · https://www.sakimura.org/en/2025/10/7710/
- Qualys on OWASP Top 10 2025 changes: https://blog.qualys.com/qualys-insights/2026/06/15/what-changed-in-owasp-top-10-2025-and-recommendations-for-each-category
- NVISO, OWASP Top 10 2025 from a pentester's perspective: https://blog.nviso.eu/2026/01/09/owasp-top-10-2025-a-pentesters-perspective/

## Rwanda law and regulation

- Hogan Lovells, key features of Rwanda's data protection law (48 h breach notice, registration): https://hoganlovells.com/en/publications/key-features-of-the-new-rwandan-data-protection-law
- DLA Piper Africa, registration deadline: https://www.dlapiperafrica.com/en/rwanda/insights/2023/deadline-for-mandatory-data-controller-set-to-expire-15-October.html
- Securiti, Rwanda data protection law: https://securiti.ai/rwanda-data-protection-law/
- NCSA Minimum Cybersecurity Standards for Essential Service Providers: https://digitalpolicyalert.org/event/24887-adopted-ncsa-minimum-cybersecurity-standards-for-essential-service-providers-including-baseline-cybersecurity-requirements

## Technical topics

- PostgreSQL RLS for multi-tenancy (FORCE RLS, WITH CHECK, security_invoker views): https://www.bytebase.com/reference/postgres/how-to/postgres-row-level-security/ · https://oneuptime.com/blog/post/2026-01-21-postgresql-row-level-security/view
- WeasyPrint `url_fetcher` bypass (CVE-2026-55073, third-party DB, confirm upstream): https://vulert.com/vuln-db/CVE-2026-55073
- Restrictive URL fetcher fix pattern (CVE-2026-69078): https://app.opencve.io/cve/CVE-2026-69078
- Cloudflare Data Localization Suite (TLS termination location): https://blog.cloudflare.com/introducing-the-cloudflare-data-localization-suite/

## Threat landscape and privacy

- Healthcare ransomware every ~10 hours (Securin via IT Brief): https://itbrief.news/story/healthcare-hit-by-ransomware-every-10-hours-securin-says
- Comparitech healthcare ransomware Q1 2026: https://www.comparitech.com/news/healthcare-ransomware-roundup-q1-2026-stats-on-attacks-ransoms-and-data-breaches/
- EHR insider snooping detection: https://www.beckershospitalreview.com/ehrs/ehr-snooping-best-efforts-to-bust-punish-and-prevent-it.html · https://pmc.ncbi.nlm.nih.gov/articles/PMC5977720
- LINDDUN applied to healthcare: https://sol.sbc.org.br/index.php/semish/article/view/43567

## Tools referenced

Semgrep, Bandit/ruff, pip-audit, osv-scanner, npm audit, gitleaks, Trivy, hadolint, OWASP ZAP, CycloneDX, cosign, Renovate/Dependabot, Wazuh, OpenSearch/Loki, Prometheus/Grafana, OpenBao/Vault, SOPS + age, pgBackRest, pgaudit, ClamAV, ModSecurity/Coraza + OWASP CRS, django-otp, WebAuthn libraries, Claude Code `/security-review`.
