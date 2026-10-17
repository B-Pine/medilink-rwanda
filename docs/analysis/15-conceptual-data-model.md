# 15 · Conceptual data model

Status: Draft v0.2 · Conceptual only. Tables, columns and indexes are decided in the design phase.

## 1. Identity, tenancy and access

```mermaid
erDiagram
    USER_ACCOUNT ||--o{ FACILITY_MEMBERSHIP : "works as"
    FACILITY_MEMBERSHIP }o--|| FACILITY : "at"
    FACILITY_MEMBERSHIP }o--o{ ROLE : "holds"
    ROLE }o--o{ PERMISSION : "grants"
    ORGANIZATION ||--o{ FACILITY : "owns"
    FACILITY ||--o{ FACILITY_APPLICATION_EVENT : "verification history"
    FACILITY ||--o{ DEPARTMENT : "has"
    DEPARTMENT ||--o{ SERVICE : "offers"
    SERVICE }o--|| SERVICE_CATALOGUE_ITEM : "maps to"
    FACILITY ||--o{ SERVICE_POINT : "has"
    USER_ACCOUNT ||--o| CLINICIAN_PROFILE : "may have"
    USER_ACCOUNT ||--o{ SESSION : "has"
```

## 2. Patients and history

```mermaid
erDiagram
    USER_ACCOUNT ||--o{ PATIENT_LINK : "manages"
    PATIENT_LINK }o--|| PATIENT : "self / guardian / delegate"
    PATIENT ||--o{ PATIENT_IDENTIFIER : "has"
    PATIENT ||--o{ INSURANCE_PROFILE : "has"
    PATIENT ||--o{ ALLERGY : "has"
    PATIENT ||--o{ CONDITION : "has"
    PATIENT ||--o{ FACILITY_PATIENT : "known at"
    FACILITY_PATIENT }o--|| FACILITY : "at"
    PATIENT ||--o{ CONSENT : "gives"
    PATIENT ||--o{ SHARE_GRANT : "grants"
    SHARE_GRANT }o--|| FACILITY : "to"
    IMPORT_BATCH ||--o{ FACILITY_PATIENT : "created"
    PATIENT ||--o{ PATIENT_MERGE : "merged in/out"
```

## 3. Scheduling, visits and queue

```mermaid
erDiagram
    FACILITY_MEMBERSHIP ||--o{ SCHEDULE_TEMPLATE : "works"
    SCHEDULE_TEMPLATE }o--|| SERVICE : "for"
    SCHEDULE_TEMPLATE ||--o{ SCHEDULE_EXCEPTION : "overridden by"
    FACILITY ||--o{ CALENDAR_EVENT : "closures, holidays"
    SERVICE ||--o{ SLOT : "generates"
    SLOT ||--o{ BOOKING : "holds"
    BOOKING }o--|| PATIENT : "for"
    BOOKING ||--o| VISIT : "becomes on check-in"
    VISIT }o--|| FACILITY_PATIENT : "of"
    VISIT ||--o{ TICKET : "one per stage"
    TICKET ||--o{ TICKET_EVENT : "state history"
    TICKET }o--o| FACILITY_MEMBERSHIP : "assigned doctor"
    VISIT ||--o{ STRUCTURED_SYMPTOM : "reason for visit"
    PATIENT ||--o{ NO_SHOW_STRIKE : "has"
    FACILITY ||--o{ DISRUPTION : "declares"
```

## 4. Clinical, pharmacy and documents

```mermaid
erDiagram
    VISIT ||--o{ CONSULTATION : "has"
    CONSULTATION ||--o{ VITALS : "records"
    CONSULTATION ||--o{ DIAGNOSIS : "codes (ICD-10)"
    CONSULTATION ||--o{ ADDENDUM : "amended by"
    CONSULTATION ||--o{ PRESCRIPTION : "issues"
    PRESCRIPTION ||--o{ PRESCRIPTION_ITEM : "contains"
    PRESCRIPTION_ITEM }o--|| DRUG : "of"
    PRESCRIPTION_ITEM ||--o{ DISPENSE_LINE : "dispensed as"
    DISPENSE_RECORD ||--o{ DISPENSE_LINE : "contains"
    CONSULTATION ||--o{ REFERRAL : "issues"
    CONSULTATION ||--o{ LAB_REQUEST : "issues"
    CONSULTATION ||--o{ SICK_NOTE : "issues"
    DOCUMENT }o--o| VISIT : "about"
    DOCUMENT }o--o| PATIENT : "about"
    DOCUMENT ||--o{ DOCUMENT_VERSION : "versions"
    DOCUMENT ||--o| VERIFICATION_CODE : "verifiable by"
    FACILITY ||--o{ DRUG_AVAILABILITY : "stocks"
    DRUG_AVAILABILITY }o--|| DRUG : "of"
```

## 5. Billing and subscriptions

```mermaid
erDiagram
    FACILITY ||--o{ TARIFF_ITEM : "prices"
    FACILITY ||--o{ INSURER_RULE : "accepts"
    INSURER_RULE }o--|| INSURER : "for"
    VISIT ||--|| BILL : "has"
    BILL ||--o{ BILL_LINE : "contains"
    BILL_LINE }o--o| TARIFF_ITEM : "priced from"
    BILL ||--o{ PAYMENT : "paid by"
    PAYMENT ||--o| RECEIPT : "produces"
    PAYMENT }o--|| CASH_SHIFT : "in"
    BILL ||--o{ CREDIT_NOTE : "corrected by"
    BILL ||--o{ APPROVAL_REQUEST : "void / refund / waiver"
    FACILITY ||--o{ SUBSCRIPTION : "has"
    SUBSCRIPTION ||--o{ SUBSCRIPTION_INVOICE : "bills"
```

## 6. Notifications, disputes, audit and AI

```mermaid
erDiagram
    DOMAIN_EVENT ||--o{ NOTIFICATION : "triggers"
    NOTIFICATION ||--o{ DELIVERY_ATTEMPT : "sent via channel"
    USER_ACCOUNT ||--o{ NOTIFICATION_PREFERENCE : "sets"
    DISPUTE }o--|| PATIENT : "raised for"
    DISPUTE }o--|| FACILITY : "against"
    DISPUTE ||--o{ DISPUTE_MESSAGE : "thread"
    DISPUTE ||--o{ DISPUTE_EVIDENCE : "evidence"
    DISPUTE ||--o{ DISPUTE_ACTION : "outcome actions"
    VISIT ||--o| RATING : "rated by"
    AUDIT_ENTRY }o--|| USER_ACCOUNT : "actor"
    TRIAGE_SESSION }o--o| PATIENT : "for"
    TRIAGE_SESSION ||--o{ TRIAGE_ANSWER : "answers"
    TRIAGE_SESSION }o--|| MODEL_VERSION : "evaluated by"
    TRIAGE_SESSION ||--o| BOOKING : "led to"
```

## 7. Modelling rules

| Rule | Why |
|---|---|
| Every facility-owned row carries `facility_id` | Tenant isolation and row-level security |
| Clinical, billing and audit rows are **append-only or versioned**; no hard deletes | Legal record-keeping and disputes |
| Records keep the **code and display text** of master data at the time of creation | Master data changes never rewrite history |
| All timestamps stored in UTC, shown in Africa/Kigali | Consistency |
| Money stored as integer RWF | No rounding errors |
| Every state change of tickets, bills, prescriptions, disputes is an event row | Reports, evidence, debugging |
| Patient-level vs facility-level data separated (`PATIENT` vs `FACILITY_PATIENT`) | One person across many facilities, with per-facility ownership of records |
| Identifiers stored with type and issuer; national ID encrypted | Privacy and multiple ID types |
