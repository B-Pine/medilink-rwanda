# ADR 0004 — The visit is the central domain entity

Status: Proposed (2026-10-17)

## Context
Patients reach a facility in many ways: online booking, phone booking, remote queue join, walk-in, follow-up, referral, emergency. Rwanda's public facilities are walk-in heavy. If the system is modelled around appointments, walk-ins become an afterthought, booked no-shows distort the queue, and clinical records, bills and prescriptions have no natural owner for unbooked patients.

## Decision
- The **visit** (one patient, one facility, one day) is the central record. Clinical records, prescriptions, dispensing, bills, documents, tickets and disputes attach to the visit.
- A **booking** is optional and *becomes* a visit at check-in. Until then the patient is **Expected**, not in the live queue.
- A visit moves through configurable **stages** (reception, payment, consultation, pharmacy). Each stage has its own **ticket** and queue.
- Every ticket state change is stored as an event (who, when, reason).

## Consequences
- Booked patients and walk-ins share one queue and one set of ordering rules.
- No-shows never affect wait estimates of patients on site.
- Reports and dispute evidence come directly from visit and ticket events.
- Slightly more complex model than "appointment = visit", but it matches how facilities actually work.
