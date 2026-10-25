"""Errors with a field for statuses other than 400 (same pattern as medilink.patients.errors)."""

from medilink.patients.errors import FieldConflict, FieldError, FieldRule, PatientsAPIView

SetupAPIView = PatientsAPIView

__all__ = ["FieldConflict", "FieldError", "FieldRule", "SetupAPIView"]
