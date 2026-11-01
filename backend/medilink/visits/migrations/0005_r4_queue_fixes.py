"""R4 queue fixes (#86): remote arrival is claimed by the patient and confirmed by reception;
manual places use `order_at` (arrival stays real); late booked arrivals are flagged; pass-over
warnings are timed; one called or in-service ticket per staff member and day."""

from django.db import migrations, models
from django.db.models import Q


class Migration(migrations.Migration):
    dependencies = [("visits", "0004_s5_security")]

    operations = [
        migrations.RenameField(
            model_name="ticket",
            old_name="remote_checked_in_at",
            new_name="remote_arrival_confirmed_at",
        ),
        migrations.AddField(
            model_name="ticket",
            name="remote_arrival_claimed_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="ticket",
            name="order_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="ticket",
            name="pass_over_warned_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="visit",
            name="is_late_arrival",
            field=models.BooleanField(default=False),
        ),
        migrations.AddConstraint(
            model_name="ticket",
            constraint=models.UniqueConstraint(
                condition=Q(state__in=["called", "in_service"]),
                fields=("facility", "assigned_membership", "service_date"),
                name="visits_one_serving_ticket",
            ),
        ),
    ]
