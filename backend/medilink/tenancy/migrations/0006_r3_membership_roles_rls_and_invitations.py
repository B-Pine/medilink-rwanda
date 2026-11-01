"""R3 (S0–S5 audit, issue #85).

1. The membership-role join becomes an explicit model (`MembershipRole`, same table) with its own
   `facility_id`, backfilled from the membership, and forced RLS: `facility_isolation`, plus
   `membership_role_self_read` so a signed-in user still reads the roles of their own memberships
   in other facilities (login, StaffMe, facility picker), as `membership_self_read` does.
2. Invitations: `expired_at` (expiry is no longer recorded as a revocation) and an expired
   invitation no longer blocks a re-invite; `idempotency_key` for `POST /staff/invitations/`.
"""

import django.db.models.deletion
from django.db import migrations, models

from medilink.tenancy.rls import USER_CONTEXT_SQL, CreatePolicy, EnableFacilityRLS

JOIN = "tenancy_facilitymembership_roles"

# The membership table is FORCE RLS for its owner too: lift it for the backfill only.
ADD_FACILITY = f"""
ALTER TABLE {JOIN} ADD COLUMN facility_id uuid NULL;
ALTER TABLE tenancy_facilitymembership NO FORCE ROW LEVEL SECURITY;
UPDATE {JOIN} AS r SET facility_id = m.facility_id
  FROM tenancy_facilitymembership AS m WHERE m.id = r.facilitymembership_id;
ALTER TABLE tenancy_facilitymembership FORCE ROW LEVEL SECURITY;
ALTER TABLE {JOIN} ALTER COLUMN facility_id SET NOT NULL;
ALTER TABLE {JOIN} ADD CONSTRAINT tenancy_membershiprole_facility_id_fk
  FOREIGN KEY (facility_id) REFERENCES tenancy_facility (id) DEFERRABLE INITIALLY DEFERRED;
CREATE INDEX tenancy_membershiprole_facility_id_idx ON {JOIN} (facility_id);
"""
DROP_FACILITY = f"ALTER TABLE {JOIN} DROP COLUMN IF EXISTS facility_id;"

SELF_READ = (
    "EXISTS (SELECT 1 FROM tenancy_facilitymembership AS m "
    f"WHERE m.id = {JOIN}.facilitymembership_id AND m.user_id = {USER_CONTEXT_SQL})"
)


class Migration(migrations.Migration):
    dependencies = [("tenancy", "0005_s2_security")]

    operations = [
        migrations.SeparateDatabaseAndState(
            state_operations=[
                migrations.CreateModel(
                    name="MembershipRole",
                    fields=[
                        ("id", models.BigAutoField(primary_key=True, serialize=False)),
                        (
                            "facilitymembership",
                            models.ForeignKey(
                                on_delete=django.db.models.deletion.CASCADE,
                                to="tenancy.facilitymembership",
                            ),
                        ),
                        (
                            "role",
                            models.ForeignKey(
                                on_delete=django.db.models.deletion.CASCADE, to="tenancy.role"
                            ),
                        ),
                        (
                            "facility",
                            models.ForeignKey(
                                on_delete=django.db.models.deletion.PROTECT,
                                related_name="+",
                                to="tenancy.facility",
                            ),
                        ),
                    ],
                    options={
                        "db_table": JOIN,
                        "unique_together": {("facilitymembership", "role")},
                    },
                ),
                migrations.AlterField(
                    model_name="facilitymembership",
                    name="roles",
                    field=models.ManyToManyField(
                        blank=True,
                        related_name="memberships",
                        through="tenancy.MembershipRole",
                        to="tenancy.role",
                    ),
                ),
            ],
            database_operations=[migrations.RunSQL(ADD_FACILITY, DROP_FACILITY)],
        ),
        EnableFacilityRLS("membershiprole"),
        CreatePolicy(
            "membershiprole",
            name="membership_role_self_read",
            command="SELECT",
            using=SELF_READ,
        ),
        migrations.RemoveConstraint(
            model_name="invitation", name="tenancy_invitation_pending_unique"
        ),
        migrations.AddField(
            model_name="invitation",
            name="expired_at",
            field=models.DateTimeField(blank=True, null=True),
        ),
        migrations.AddField(
            model_name="invitation",
            name="idempotency_key",
            field=models.UUIDField(blank=True, null=True),
        ),
        migrations.AddConstraint(
            model_name="invitation",
            constraint=models.UniqueConstraint(
                condition=models.Q(
                    ("accepted_at__isnull", True),
                    ("expired_at__isnull", True),
                    ("revoked_at__isnull", True),
                ),
                fields=("facility", "email"),
                name="tenancy_invitation_pending_unique",
            ),
        ),
        migrations.AddConstraint(
            model_name="invitation",
            constraint=models.UniqueConstraint(
                condition=models.Q(("idempotency_key__isnull", False)),
                fields=("facility", "idempotency_key"),
                name="tenancy_invitation_idempotency_unique",
            ),
        ),
    ]
