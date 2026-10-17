## What changed

## Why
Closes #
Requirements: (e.g. FR-QUE-05)

## Checklist
- [ ] Tested locally
- [ ] No secrets or real patient data added (code, fixtures, logs, screenshots)
- [ ] User-facing text added to translation files

## Security (see docs/security/09-secure-development-lifecycle.md)
- [ ] Touches patient data? → authorisation policy + tests (own / other facility / other patient), audit-logged
- [ ] New endpoint has an explicit permission policy and is in the authorisation matrix
- [ ] Serializer fields explicit; no sensitive field newly exposed to another role
- [ ] User input validated server-side; no raw SQL, `mark_safe` or `dangerouslySetInnerHTML`
- [ ] New facility table → RLS policy (ENABLE + FORCE) in the migration
- [ ] New dependency justified (maintained, licence, smaller alternative considered)
