"""manage.py import_locations FILE [--apply] [--retire-missing] (columns: masterdata.kinds)."""

from medilink.masterdata.management.commands._importer import ImportCommand


class Command(ImportCommand):
    help = "Import locations master data from CSV (dry run unless --apply)."
    kind = "locations"
