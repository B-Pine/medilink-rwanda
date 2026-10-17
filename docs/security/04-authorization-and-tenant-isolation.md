# 04 · Authorisation and tenant isolation

Status: v0.1 · Addresses OWASP A01:2025 (Broken Access Control) and OWASP API1/API3/API5:2023 (BOLA, BOPLA, BFLA). This is the **highest-ranked risk** in the threat model.

## 1. Model

Authorisation is decided by **three questions, every request, on the server**:

1. **Function:** may this role do this action? (RBAC from the permission matrix in [analysis 02](../analysis/02-users-roles-and-permissions.md))
2. **Object:** may this user act on *this* object? Is it in their active facility? Is it their own or their dependent's? Is there a treatment relationship or consent?
3. **Property:** which fields may they read or write? (e.g. a receptionist never receives diagnosis fields)

```
request ─► authenticate ─► resolve active facility membership ─► policy.check(user, action, object)
                                                           │
                                     deny by default ◄─────┘  (all three must pass)
```

## 2. Implementation rules (Django / DRF)

| Rule | How |
|---|---|
| **Deny by default** | A global DRF default permission class denies everything; every view declares its policy explicitly. CI fails if a view lacks one. |
| **One policy layer** | All checks live in `medilink.authz` (policy functions per resource), not scattered in views. Views call `authorize(user, "visit.view", visit)`. |
| **Scoped querysets** | Every queryset starts from a scoped manager: `Visit.objects.for_facility(request.facility)` or `.for_account(request.user)`. A raw `.objects.all()` in views is blocked by a lint rule. |
| **Object lookups go through the scope** | `get_object_or_404(scoped_qs, pk=...)`, never on the global table, so another facility's ID returns **404, not 403** (no existence leak) |
| **Field-level output** | Separate serializers per role (`VisitReceptionSerializer`, `VisitClinicalSerializer`); explicit `fields` lists, never `__all__` |
| **Field-level input** | Explicit writable fields; unknown properties rejected (mass-assignment protection); server sets `facility_id`, `created_by`, prices, totals and statuses, never the client |
| **Function-level** | Staff endpoints under `/api/staff/...` require a staff membership; patient endpoints under `/api/patient/...`; admin endpoints under `/api/platform/...` require super admin + step-up. Routes are not shared across audiences. |
| **IDs** | UUIDs (v7) as public identifiers, so they can't be enumerated. **Never relied on for security**; checks still apply. |
| **Facility context** | The active facility comes from the session (set at facility switch), not from a request parameter the client can change silently |
| **WebSocket subscriptions** | Joining a channel group (e.g. `facility:{id}:queue`) requires the same policy check as the REST equivalent. Group names never come from client input unchecked. |
| **Background tasks** | Celery tasks receive IDs plus the facility context, and run the same scoped queries |
| **Display devices** | Token grants read-only access to "now serving" data for one facility / service. Cannot call any other endpoint. |

## 3. Clinical access rules

| Who | Can see clinical data of |
|---|---|
| Doctor | Patients with a visit at their facility (**treatment relationship**). Full history at their facility. Other facilities only with patient consent (P2) or break-glass. |
| Doctor, patient **not** in their queue today or recent care | Allowed, but a **"reason for access"** prompt appears (care continuity / results review / admin request / other). It's logged and included in snooping analytics. |
| Pharmacist | Prescription items, allergies, patient identity for dispensing only |
| Receptionist | Reason for visit, vitals they recorded, billing lines. No diagnoses or notes. |
| Facility admin | No clinical content (unless also a doctor) |
| Super admin | Only through dispute attachments or break-glass |
| Patient | Own and dependents' records (except private notes; restricted records excluded for delegates) |

**Staff as patients:** when a patient record matches a staff member of the same facility (same national ID or linked account), it's flagged. Every access by colleagues is logged with a mandatory reason and reviewed. This is the classic snooping target.

## 4. PostgreSQL row-level security (second wall)

If application code forgets a filter, the database still refuses rows from other facilities.

```sql
-- application role: no superuser, not table owner, no BYPASSRLS
CREATE ROLE medilink_app LOGIN NOSUPERUSER NOBYPASSRLS;

ALTER TABLE clinical_consultation ENABLE ROW LEVEL SECURITY;
ALTER TABLE clinical_consultation FORCE ROW LEVEL SECURITY;  -- applies even to the owner

CREATE POLICY staff_facility_isolation ON clinical_consultation
  USING      (facility_id = NULLIF(current_setting('app.facility_id', true), '')::uuid)
  WITH CHECK (facility_id = NULLIF(current_setting('app.facility_id', true), '')::uuid);

CREATE POLICY patient_own_records ON clinical_consultation FOR SELECT
  USING (patient_id IN (
    SELECT patient_id FROM patient_link
    WHERE account_id = NULLIF(current_setting('app.account_id', true), '')::uuid
      AND revoked_at IS NULL));
```

- **Context is set per transaction:** `SELECT set_config('app.facility_id', %s, true)` (transaction-local) at the start of each request (`ATOMIC_REQUESTS = True` or explicit atomic blocks). This is safe with PgBouncer in transaction mode.
- **Fails closed:** `NULLIF(..., '')` turns a missing context into `NULL`, so no rows match. A missing context = an empty result plus an alert, never "all rows".
- **`WITH CHECK`** stops writing or moving a row into another facility.
- **Views** are created with `security_invoker = true` (PostgreSQL 15+) so RLS still applies.
- **Roles:**

  | Role | Rights |
  |---|---|
  | `medilink_app` | DML only on application tables; `INSERT`-only on the audit table |
  | `medilink_migrator` | Owner; used only by migrations in CI/CD |
  | `medilink_reporting` | Read-only on de-identified views |
  | `medilink_maint` | BYPASSRLS for audited maintenance only, through the VPN, with ticket reference |

- RLS applies to all tables holding facility data: visits, tickets, consultations, prescriptions, bills, payments, documents metadata, disputes, facility patient records. Platform-wide tables (master data) are read-only to the app role.

## 5. Testing authorisation

- **Authorisation test matrix:** generated from the permission matrix. For each endpoint × role × "own / other facility / other patient" there is an automated test expecting allow or deny. A new endpoint without matrix entries fails CI.
- **Cross-tenant tests:** every list and detail endpoint is called with IDs from a second test facility, expecting 404.
- **RLS tests:** queries run as `medilink_app` without context return nothing; with context A never return B's rows.
- **Property tests:** serializer output per role is compared with an allowlist snapshot (no new fields leak silently).
- **Pen test focus:** IDOR/BOLA, privilege escalation between roles, WebSocket subscription abuse.
