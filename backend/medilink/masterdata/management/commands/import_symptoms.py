"""manage.py import_symptoms FILE [--apply] [--retire-missing] (columns: masterdata.kinds)."""

from medilink.masterdata.management.commands._importer import ImportCommand


class Command(ImportCommand):
    help = "Import symptoms master data from CSV (dry run unless --apply)."
    kind = "symptoms"
