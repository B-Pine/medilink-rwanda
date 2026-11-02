"""Pharmacy signals for notifications (contract sprint-09 §11), sent after commit with IDs only."""

from django.dispatch import Signal

prescription_ready = Signal()  # kwargs: prescription_id, facility_id
prescription_dispensed = Signal()  # kwargs: prescription_id, record_id, facility_id
query_raised = Signal()  # kwargs: query_id, prescription_id, facility_id
