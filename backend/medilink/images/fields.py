"""Serializer field for a Cloudinary public id sent back after a signed upload."""

from __future__ import annotations

from typing import Any

from django.utils.translation import gettext_lazy as _
from rest_framework import serializers

from medilink.images import services


class CloudinaryImageField(serializers.CharField):
    """A public id of an image uploaded for `kind`; "" clears it. Checked with the Admin API
    unless it is one the resource already holds (`keep`: ids that need no new check)."""

    default_error_messages = {
        "not_found": _("We couldn't find that image. Upload it again."),
        "unavailable": _("Image uploads aren't set up on this server."),
        "unreachable": _("We couldn't check the image just now. Try again in a moment."),
    }

    def __init__(self, kind: str, **kwargs: Any) -> None:
        kwargs.setdefault("max_length", 255)
        kwargs.setdefault("allow_blank", True)
        super().__init__(**kwargs)
        self.kind = kind

    def to_internal_value(self, data: Any) -> str:
        value = super().to_internal_value(data).strip()
        if not value:
            return ""
        keep = self.context.get("keep_public_ids", ()) if hasattr(self, "context") else ()
        if value in keep:
            return value
        if not services.is_configured():
            self.fail("unavailable")
        try:
            services.verify_asset(value, self.kind)
        except services.AssetNotFound:
            self.fail("not_found")
        except services.CloudinaryUnavailable:
            self.fail("unreachable")
        return value
