"""manage.py import_diagnosis_codes FILE [--apply] [--retire-missing]."""

from medilink.masterdata.management.commands._importer import ImportCommand


class Command(ImportCommand):
    help = "Import diagnosis-codes master data from CSV (dry run unless --apply)."
    kind = "diagnosis-codes"
