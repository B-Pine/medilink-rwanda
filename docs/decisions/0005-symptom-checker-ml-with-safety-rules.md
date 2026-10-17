# ADR 0005 — ML symptom checker inside clinician-signed safety rules

Status: Proposed (2026-10-17) · Detail: [11 · AI symptom checker](../analysis/11-ai-symptom-checker.md)

## Context
The team wants a symptom checker built with machine learning. Public datasets exist, but they are synthetic, Western, or toy-sized: DDXPlus, SymCat, Kaggle sets. None reflect Rwanda's disease burden. Diagnostic software shown to patients is likely regulated as a medical device, and wrong advice can cause harm.

## Decision
- The model predicts **urgency, service and level of care**, not a diagnosis shown to patients.
- **Clinician-signed red-flag rules run first** and can't be overridden by the model. A safety layer sends uncertain cases to a higher level of urgency.
- **Data strategy:**
  - bootstrap on DDXPlus and a Rwanda-adjusted knowledge base with synthetic cases
  - then retrain on MediLink's own consented, de-identified intake → diagnosis pairs
  - phase 1 captures structured reasons for visit, ICD-10 diagnoses and research consent so this data exists
- **Release only after:** vignette evaluation with an under-triage gate, a shadow-mode period visible only to doctors, regulatory confirmation, and clinical sign-off.
- LLMs may be used for language (free-text intake, explanations), never for the triage decision.

## Consequences
- AI is not on the phase-1 critical path; phase 1 only collects the right data.
- Requires a clinical lead, ethics approval and Rwanda FDA engagement before patient use.
- Every prediction is logged with model version for accountability and disputes.
