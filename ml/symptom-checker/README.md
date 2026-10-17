# Symptom checker (ML)

Training pipelines for the triage model: it predicts urgency, service and level of care, not a diagnosis. Phase 2+. See [docs/analysis/11-ai-symptom-checker.md](../../docs/analysis/11-ai-symptom-checker.md) and [ADR 0005](../../docs/decisions/0005-symptom-checker-ml-with-safety-rules.md).

Planned tools: Python, pandas, scikit-learn, LightGBM, MLflow. Models are served from the Django API.

> Never place real patient data in this folder. Training on MediLink data requires ethics approval, research consent and de-identification.
