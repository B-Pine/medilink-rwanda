"""Forced facility RLS on every S2 facilities table; append-only change log (contract §2.1, §2.2)."""

from django.db import migrations

from medilink.facilities.db import append_only
from medilink.tenancy.rls import EnableFacilityRLS

MODELS = (
    "profile",
    "department",
    "service",
    "servicepoint",
    "servicepointservice",
    "openinghours",
    "calendarevent",
    "settings",
    "branding",
    "configchange",
)


class Migration(migrations.Migration):
    dependencies = [("facilities", "0001_initial")]

    operations = [
        *(EnableFacilityRLS(model) for model in MODELS),
        append_only("facilities_config_change"),
    ]
