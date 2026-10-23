"""manage.py import_drugs FILE [--apply] [--retire-missing] (columns: masterdata.kinds)."""

from medilink.masterdata.management.commands._importer import ImportCommand


class Command(ImportCommand):
    help = "Import drugs master data from CSV (dry run unless --apply)."
    kind = "drugs"
