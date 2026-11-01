"""Encrypt existing TOTP secrets at rest (issue #12). Reversible: the reverse writes hex again."""

from typing import Any

from django.db import migrations


def encrypt(apps: Any, schema_editor: Any) -> None:
    from medilink.accounts.totp_crypto import protect

    device_model = apps.get_model("otp_totp", "TOTPDevice")
    for device in device_model.objects.only("pk", "user_id", "key"):
        new = protect(device.key, device.user_id)
        if new != device.key:
            device_model.objects.filter(pk=device.pk).update(key=new)


def decrypt(apps: Any, schema_editor: Any) -> None:
    from medilink.accounts.totp_crypto import is_encrypted, stored_to_secret

    device_model = apps.get_model("otp_totp", "TOTPDevice")
    for device in device_model.objects.only("pk", "user_id", "key"):
        if is_encrypted(device.key):
            plain = stored_to_secret(device.key, device.user_id).hex()
            device_model.objects.filter(pk=device.pk).update(key=plain)


class Migration(migrations.Migration):
    dependencies = [
        ("accounts", "0004_user_email_verification_pending"),
        ("otp_totp", "0003_add_timestamps"),
    ]

    operations = [migrations.RunPython(encrypt, decrypt, elidable=False)]
