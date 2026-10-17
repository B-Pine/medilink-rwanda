# 02 · Users, roles and permissions

Status: Draft v0.2

## 1. Principles

1. **Few roles in phase 1.** There are six: Patient, Super admin, Facility admin, Receptionist (also cashier), Doctor/clinician, Pharmacist.
2. **Roles are sets of permissions, not hard-coded user types.** One person can hold several roles. At a small clinic, the owner may be both Facility admin and Doctor.
3. **Staff roles apply per facility.** A doctor working at two facilities has one account and two memberships, and each membership has its own roles.
4. **Least privilege.** Each role sees only what its job needs. Clinical content is limited to clinicians and the patient.
5. **Every access to patient data is checked and logged** (see [12](12-security-privacy-and-compliance.md)).

## 2. The roles

### 2.1 Patient (platform level)

**Comes to:**
- find care
- book or join a queue
- track the queue
- pay
- see diagnoses, prescriptions and documents
- manage family members
- raise disputes

**Who:** anyone 16 or older with a phone number or email. Children and dependent adults are **dependents** managed by a caregiver; caregiver is a feature of the patient account, not a separate role. The minimum age for a self-managed account is an open question for legal review.

| Screen | Purpose |
|---|---|
| Home | Next visit, live queue tracker if active, alerts, quick "Find care" |
| Find care | Search by location, service, insurance; map and list; facility profile with fees, hours, wait |
| Book / Join queue | Pick service, doctor (optional), slot, or "join today's queue"; confirm insurance; reason for visit |
| Live tracker | Ticket number, stage, position, estimated wait range, "time to leave", check-in |
| My calendar | Upcoming appointments, follow-ups, medicine schedule, family members' visits; add to phone calendar |
| My visits | Timeline of every visit with summary, diagnoses, prescriptions, dispensing status, documents, receipts |
| My medicines | Active and past medicines with instructions and dispensing status |
| My documents | Prescriptions, sick notes, referral letters, receipts, uploaded results |
| My health profile | Allergies, chronic conditions, current medicines (self-reported until a clinician confirms) |
| Insurance | Insurance cards, member numbers, expiry |
| Family | Dependents, switch profile, delegated access |
| Disputes and help | Raise or follow a dispute, contact support, rate a visit |
| Notifications | In-app inbox |
| Privacy | Consents, who accessed my records, download my data, delete account |
| Settings | Language, notification preferences, travel time to usual facilities, security |

### 2.2 Super admin (platform level)

**Comes to:**
- verify facilities and keep the network trustworthy
- maintain master data
- resolve escalated disputes
- watch platform health and revenue

**Who:** MediLink staff. There are very few, all using two-factor login.

| Screen | Purpose |
|---|---|
| Overview | Facilities live, pending applications, open escalations, platform activity, system health |
| Facility applications | Review documents, request changes, approve, reject with reasons |
| Facilities | Profiles, status (active, suspended, deactivated), subscription, quality score, disputes |
| Master data | Insurers, drug catalogue, diagnosis codes, service catalogue, symptom list, public holidays, administrative locations |
| Disputes (escalated) | Platform-level and escalated cases; decisions |
| Subscriptions | Plans, invoices, payments recorded, overdue facilities |
| Platform users | Super admin accounts |
| Audit and security | Platform audit log, emergency-access ("break-glass") log, security events |
| Announcements | Messages to facilities (maintenance, policy changes) |
| AI content (P2+) | Red-flag rules, symptom mappings, model versions, clinician sign-offs |

**Boundary:** the super admin **cannot browse clinical records**. Clinical data is visible only:
- when attached to a dispute, or
- through emergency access with a stated reason, which is logged and reviewed.

The super admin **cannot edit** any facility's clinical or billing records.

### 2.3 Facility admin (facility level)

**Comes to:** set up and run the facility on MediLink.
- staff and roles
- services, schedules, fees and insurers
- approvals (voids, refunds)
- disputes, reports and subscription

**Who:** the owner, director or administrator. Often also holds the Doctor role at small clinics.

| Screen | Purpose |
|---|---|
| Setup checklist | Steps required before the facility is published (see [03](03-tenancy-onboarding-and-master-data.md)) |
| Operations board | Live view of all queues, waits, staff on duty, bottlenecks |
| Staff | Invite, assign roles and service points, deactivate |
| Services and service points | Departments, services, rooms and desks, ticket prefixes |
| Schedules and calendar | Doctor schedules, leave, closures, holidays |
| Tariffs and insurance | Price list, accepted insurers, co-pay rules |
| Queue rules | Stages, priority rules, grace periods, booking-to-walk-in ratio, walk-in reserve |
| Approvals | Voids, refunds, record-merge requests, queue reorder review |
| Patients | Patient list, previous records, legacy import |
| Disputes and ratings | Facility-level disputes and patient feedback |
| Reports | Visits, waits, no-shows, revenue, claims, staff activity |
| Documents and branding | Letterhead, logo, stamp, document templates |
| Subscription | Plan, invoices, payment status |
| Audit | Facility audit log: who did what, who viewed which record |

**Boundary:** a facility admin **cannot write or edit clinical records** unless they also hold the Doctor role.

### 2.4 Receptionist + cashier (facility level)

**Comes to:** run the front door and the till.

**Who:** front-desk staff. In phase 1 the same role covers the cashier work.

| Screen | Purpose |
|---|---|
| Today board | **Expected** (booked, not arrived) and **On site** (checked in) side by side, by service, with stage and status |
| Register / check in | Find patient (name, phone, national ID, facility file number) or quick-register a walk-in; verify insurance; issue ticket; set priority with a reason |
| Queue control | Move between stages, mark no-show, return to queue, transfer service (reorder only with a reason, logged) |
| Bookings and calendar | Book by phone, reschedule, cancel; day and week views per service and doctor |
| Payments | Bills awaiting payment; add lines from the tariff; record payment; issue receipt; request void or refund |
| Cash-up | Open and close shift; expected versus counted totals |
| Print | Ticket, receipts, documents (for patients without smartphones) |
| Disputes | Disputes assigned for comment |

**Boundary:** a receptionist sees reason for visit, vitals they took, bills and documents marked for release. They **don't see** diagnoses, clinical notes or prescriptions. The exception is the receipt line items needed to bill medicines.

### 2.5 Doctor / clinician (facility level)

**Comes to:** see patients, document the consultation and prescribe.

**Who:** doctors, and also **nurses and midwives who consult**. Rwandan health centers are largely nurse-led. Clinicians register their professional council licence number:
- Rwanda Medical and Dental Council (RMDC) for doctors
- National Council of Nurses and Midwives (NCNM) for nurses and midwives

| Screen | Purpose |
|---|---|
| My queue | Own patients and shared service pool; Call next, recall, no response, start, transfer |
| Consultation | Reason for visit, vitals, history, exam, diagnoses, notes, plan, prescriptions, lab requests, referral, sick note, follow-up booking; sign |
| Patient history | All previous visits at this facility; other facilities only with patient consent; imported legacy records |
| Unsigned records | Drafts not yet signed (must be cleared daily) |
| My calendar | Schedule at each facility, leave, booked load |
| Results inbox | Uploaded outside results awaiting review |

**Boundary:**
- A doctor can view clinical data only for patients with a visit at their facility, or with consent.
- A doctor can **amend only their own signed records**. Another clinician can add an addendum but can never change the original.

### 2.6 Pharmacist (facility level)

**Comes to:** dispense prescribed medicines correctly.

**Who:** the facility's pharmacist or dispenser. Pharmacists register a National Pharmacy Council licence number.

| Screen | Purpose |
|---|---|
| Prescription queue | Signed prescriptions waiting, with payment status if the facility requires payment first |
| Dispense | Confirm patient identity (ticket or verification code); dispense each item fully or partly; generic substitution with a reason; mark "not available, buy outside" |
| Availability | Mark medicines available or unavailable (simple stock in P2) |
| Dispensing history | What was dispensed, by whom, when |

**Boundary:** a pharmacist sees **the prescription, allergies and patient identity only**, never the full consultation notes.

### 2.7 Non-user actors

| Actor | Notes |
|---|---|
| Waiting-room display | A device using a revocable display link per facility or service. Shows ticket numbers only. |
| Outside pharmacy or employer | No account. Can verify a document's authenticity with its QR code (see [07](07-clinical-documentation-and-pharmacy.md)). |
| System jobs | Reminders, auto-close at end of day, escalations; logged as "system". |

### 2.8 Later roles (not in P1)

Platform support agent · Triage nurse · Lab technician · Separate cashier · External pharmacy · Ministry/district viewer. The permission model must allow adding them without code changes to existing roles.

## 3. Permission matrix

Legend: **✓** full · **own** only own records or own facility · **view** read only · **ltd** limited subset (see notes) · **—** none

| Capability | Patient | Super admin | Facility admin | Receptionist | Doctor | Pharmacist |
|---|---|---|---|---|---|---|
| Apply to register a facility | — | ✓ (create on behalf) | ✓ (applicant) | — | — | — |
| Verify / approve / suspend facility | — | ✓ | — | — | — | — |
| Manage master data | — | ✓ | — | — | — | — |
| Configure facility (services, rules, tariffs, insurers) | — | view | ✓ | — | — | — |
| Invite staff, assign roles | — | — | ✓ | — | — | — |
| Manage schedules and leave | — | — | ✓ | view | own (request leave) | — |
| Search facilities, book, join queue | ✓ | — | — | ✓ (for patients) | — | — |
| Register walk-in patient | — | — | ✓ | ✓ | ✓ | — |
| Check in, issue ticket, set priority | own (self check-in) | — | ✓ | ✓ | — | — |
| Call next / start consultation | — | — | — | — | ✓ | — |
| Reorder queue (with reason) | — | — | ✓ | ✓ | — | — |
| Record vitals | — | — | — | ✓ | ✓ | — |
| View reason for visit | own | — | ✓ | ✓ | ✓ | — |
| Write and sign clinical record | — | — | — | — | ✓ | — |
| Amend signed record | — | — | — | — | own | — |
| View clinical record | own (excluding private notes) | ltd (dispute or break-glass) | — | — | ✓ (facility) | ltd (prescription + allergies) |
| Issue prescription | — | — | — | — | ✓ | — |
| Dispense | — | — | — | — | — | ✓ |
| Create bill, record payment, issue receipt | — | — | ✓ | ✓ | — | — |
| Approve void / refund | — | — | ✓ | — | — | — |
| Upload documents | own | ✓ (facility verification) | ✓ | ✓ (ID, insurance card) | ✓ (results) | — |
| Import legacy records | — | — | ✓ | — | ltd (clinical history entry) | — |
| Merge duplicate patients | — | ✓ (approve cross-facility) | ✓ (approve within facility) | request | — | — |
| Raise dispute | ✓ | — | ✓ (vs platform) | ltd (on behalf of a patient at the counter) | — | — |
| Handle dispute | — | ✓ (escalated / platform) | ✓ (facility) | comment | comment | comment |
| View reports | — | ✓ (platform) | ✓ (facility) | ltd (own shift) | ltd (own activity) | ltd (own activity) |
| View audit log | own access history | ✓ (platform) | ✓ (facility) | — | — | — |
| Manage subscription | — | ✓ | view / pay | — | — | — |

## 4. Account lifecycle

| Event | Rule |
|---|---|
| Staff invitation | By email (phone once SMS exists); expires after 7 days; the invitee sets a password and two-factor login |
| Clinician licence | Licence number entered and visible to the facility admin. Automated council checks are P4; until then the facility admin attests that the licence was checked. |
| Role change | Effective immediately; logged |
| Staff leaves | Deactivate membership: access removed immediately; records they authored remain, attributed to them |
| Multi-facility user | Picks the active facility after login; one session works in one facility context at a time |
| Patient account deletion | Account deactivated; clinical records retained by facilities as the law requires (see [12](12-security-privacy-and-compliance.md)) |

## 5. Requirements

| ID | Requirement | Phase |
|---|---|---|
| FR-ACC-01 | Roles are permission sets; a user can hold several roles per facility membership | P1 |
| FR-ACC-02 | A user can be a member of several facilities and switch the active facility | P1 |
| FR-ACC-03 | The six phase-1 roles exist with the permissions in §3 | P1 |
| FR-ACC-04 | Staff accounts require two-factor login | P1 |
| FR-ACC-05 | Staff invitations by email, expiring, single use | P1 |
| FR-ACC-06 | Deactivating a membership removes access immediately and ends active sessions | P1 |
| FR-ACC-07 | Clinicians record their professional licence number; facility admin attests verification | P1 |
| FR-ACC-08 | Every permission check on patient data is enforced server-side and logged | P1 |
| FR-ACC-09 | Super admin emergency access to clinical data requires a reason and is logged and reviewable | P1 |
| FR-ACC-10 | New roles can be added later without changing existing role definitions | P2 |
