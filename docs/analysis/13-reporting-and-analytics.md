# 13 · Reporting and analytics

Status: Draft v0.2

## 1. Metric definitions

These definitions are the standard used everywhere: reports, pitch claims, pilot evaluation. They come from the ticket and visit timestamps ([06](06-visit-lifecycle-and-queue.md)).

| Metric | Definition |
|---|---|
| **Wait to be seen** | Check-in → first time the patient is called to consultation |
| **Time on site** | Check-in → visit completed (or left) |
| **Consultation duration** | Consultation started → moved to next stage |
| **Stage wait** | Entered stage queue → called at that stage (payment, pharmacy) |
| **Wait-estimate accuracy** | Share of tickets called within the range shown at check-in |
| **No-show rate** | Bookings marked no-show ÷ bookings due |
| **Late cancellation rate** | Cancellations within the cut-off ÷ bookings |
| **Left without service** | Tickets closed as left ÷ tickets issued |
| **Booked vs walk-in mix** | Visits by source |
| **Throughput** | Completed consultations per doctor per hour on duty |
| **Record completeness** | Visits with signed consultation ÷ completed visits |
| **Late entries** | Records signed > 24 h after consultation |
| **Reorder rate** | Manual queue reorders ÷ tickets, per staff member |
| **Collection** | Amount paid ÷ amount billed (patient share) |

## 2. Facility reports (facility admin)

| Report | Content |
|---|---|
| **Operations today** (live) | Queue length per service, longest current wait, doctors on duty and their state, bottleneck stage |
| Daily summary | Visits by source and service, waits (median and 90th percentile), no-shows, left without service |
| Wait times | Trends by day of week and hour, by service, by doctor; estimate accuracy |
| Peak hours heat map | Arrivals by weekday × hour, to plan staffing for the 06:00–10:00 peak |
| Doctor activity | Patients seen, average consultation time, unsigned / late records |
| Bookings | Booked vs capacity, no-shows, cancellations, strikes |
| Diagnoses | Top diagnoses by period (ICD-10), useful for facility HMIS reporting |
| Prescriptions and pharmacy | Most prescribed medicines, "not available" items (stock-out signal), substitutions |
| Finance | Billed, collected, insurer share by insurer, waivers, voids, refunds, shift differences |
| Insurance claims | Monthly claim list per insurer (P2), rejection rates |
| Staff accountability | Reorders, voids, overrides, waivers per staff member |
| Disputes and ratings | Open, overdue, by type, outcomes; ratings trend |

Every report can be filtered by date range, service and doctor, and exported to Excel and PDF.

## 3. Platform reports (super admin)

| Report | Content |
|---|---|
| Network | Facilities by status, type, district; applications pipeline |
| Adoption | Active facilities, visits recorded per facility, share recorded through MediLink (vs sampled totals) |
| Patients | Sign-ups, active patients, dependents, channel used |
| Impact | Waits, time on site, no-shows per facility vs their baseline |
| Quality | Disputes per 1,000 visits, escalation rate, ratings, estimate accuracy per facility |
| Revenue | Subscriptions, overdue, plan mix |
| System | Usage, errors, notification delivery rates, push opt-in rate |

The platform sees **aggregated** numbers for facilities. It never browses individual clinical records for reporting.

## 4. Impact measurement for the pilot

1. **Baseline** (before go-live, at least 2 weeks): staff or researchers sample arrival, call and finish times on paper for a representative set of patients, plus no-shows from the paper appointment book if one exists.
2. **During the pilot:** the same metrics from MediLink data, plus a sampled check of how many visits are actually recorded in MediLink (adoption).
3. **Patient survey** at baseline and after 3 months: perceived wait, anxiety, income lost.
4. **Report** with honest comparisons, confidence ranges and limitations. This report is what supports or corrects the claims in the pitch.

## 5. Later: Ministry / district analytics (P4)

Anonymised, aggregated statistics for health authorities: load by facility and level of care, wait trends, referral flows, stock-outs. This needs an agreement with the Ministry, de-identification, and minimum group sizes so no individual can be identified.

## 6. Requirements

| ID | Requirement | Phase |
|---|---|---|
| FR-RPT-01 | Metric definitions in §1 implemented consistently from event timestamps | P1 |
| FR-RPT-02 | Live operations board | P1 |
| FR-RPT-03 | Facility daily summary, wait times, doctor activity, bookings, finance, staff accountability | P1 |
| FR-RPT-04 | Export to Excel and PDF | P1 |
| FR-RPT-05 | Platform network, adoption, quality and system reports | P1 |
| FR-RPT-06 | Peak-hours heat map, diagnoses and pharmacy reports | P2 |
| FR-RPT-07 | Pilot impact report support (baseline import, comparisons) | P2 |
| FR-RPT-08 | Aggregated Ministry / district analytics | P4 |
