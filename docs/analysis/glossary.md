# Glossary

| Term | Meaning |
|---|---|
| **Addendum** | A signed addition to a signed clinical record. The original is never changed. |
| **ANC** | Antenatal care: pregnancy check-ups |
| **Audit log** | Append-only record of who did what to which data, when and why |
| **Booking** | A reserved slot at a future date and time. One way a visit can start. |
| **Break-glass** | Emergency access to data beyond normal permissions, with a stated reason; logged and reviewed |
| **Clinician** | Anyone who consults and prescribes: doctor, nurse, midwife. Holds the Doctor role. |
| **Credit note** | A document that reverses all or part of a paid bill (refund) |
| **Dependent** | A patient managed by another account holder (child, elderly parent) |
| **Disruption** | A doctor's absence, closure or schedule change that affects bookings |
| **EBM** | Electronic Billing Machine: Rwanda Revenue Authority's fiscal receipt system |
| **EMR** | Electronic medical record system |
| **Entered in error** | Status for a record created on the wrong patient; hidden from normal views but never deleted |
| **Expected** | A booked patient who has not yet checked in. Not in the live queue. |
| **Facility** | A hospital, clinic, health center or other provider. The tenant in MediLink. |
| **Facility patient record** | A patient as known at one facility, with that facility's file number and records |
| **Grace window** | Time around a booking's slot in which the booked patient keeps slot-time priority |
| **HMIS** | Health Management Information System (Rwanda uses DHIS2) |
| **ICD-10 / ICD-11** | WHO international classification of diseases codes |
| **IMCI** | WHO Integrated Management of Childhood Illness, including danger signs in children |
| **Level of care** | Primary (health post, health center), secondary (district hospital), tertiary (referral hospital) |
| **Mutuelle de Santé** | Rwanda's community-based health insurance, managed by RSSB |
| **MMI** | Military Medical Insurance |
| **NCSA** | National Cyber Security Authority, the supervisory authority for personal data protection |
| **No-show** | A booking not checked in by the end of its grace window |
| **Pass-over** | Moving a remote joiner who hasn't checked in back by K places when they reach the front |
| **PWA** | Progressive Web App: a website installable on a phone, usable offline, able to receive push notifications |
| **RAMA** | Medical scheme for public and formal-sector employees, managed by RSSB |
| **Remote join** | Taking a place in today's walk-in queue from home, without a booking |
| **RLS** | PostgreSQL row-level security |
| **RMDC / NCNM** | Rwanda Medical and Dental Council / National Council of Nurses and Midwives |
| **RSSB** | Rwanda Social Security Board |
| **Service** | Something a facility offers, e.g. general consultation, pediatrics, dental |
| **Service point** | A physical place where a service is delivered: a room, a desk, a pharmacy window |
| **Shadow mode** | Running an AI model on real cases with output visible only to staff, to validate it |
| **Stage** | A step of a visit: reception, payment, consultation, pharmacy |
| **Ticket** | A patient's place in the queue of the current stage, with a number such as `G-023` |
| **Under-triage** | Classifying a patient as less urgent than they are; the most dangerous AI error |
| **Visit** | One patient's journey through one facility on one day. The central record of the system. |
| **Walk-in** | A patient who arrives without a booking |
| **Walk-in reserve** | Share of capacity kept free from bookings for walk-ins |
