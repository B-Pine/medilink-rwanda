"""Images on Cloudinary: signed direct uploads, asset checks and delivery URLs.

Flow (facility photos and logos, clinician and patient avatars):

1. The browser asks MediLink for a signature for one *kind* (POST .../uploads/signature/).
2. The browser posts the file and the signed parameters straight to Cloudinary (the file never
   passes through Django). The account's signed preset caps size, recompresses and allows
   jpg/jpeg/png/webp/heic only.
3. The browser sends the returned `public_id` to the owning resource; the serializer checks with
   the Admin API that the asset exists and sits in the kind's folder, and only `public_id` is
   stored. Delivery URLs are built at read time.

The client never chooses a folder (UPLOAD_KINDS is a whitelist). These images are public by
design (C0: what patients see on facility and doctor pages, a patient's own avatar); identity
documents and prescriptions stay in the scanned upload pipeline (medilink.uploads).
"""

from __future__ import annotations

import time
from typing import Any

import cloudinary
import cloudinary.api
import cloudinary.exceptions
import cloudinary.uploader
import cloudinary.utils
from django.conf import settings

# kind -> subfolder under CLOUDINARY_ROOT_FOLDER
UPLOAD_KINDS: dict[str, str] = {
    "facility_photo": "facilities",
    "facility_logo": "facilities/logos",
    "provider_avatar": "providers/avatars",
    "patient_avatar": "patients/avatars",
}
STAFF_KINDS = ("facility_photo", "facility_logo", "provider_avatar")
PATIENT_KINDS = ("patient_avatar",)
UPLOAD_HOST = "https://api.cloudinary.com/v1_1"


class AssetNotFound(Exception):
    """The public id is unknown to Cloudinary, or wasn't uploaded for this kind."""


def config() -> dict[str, str]:
    return dict(getattr(settings, "CLOUDINARY", {}) or {})


PLACEHOLDER_SECRET = "replace-me"  # noqa: S105 (.env.example's value: counts as not set)


def is_configured() -> bool:
    cfg = config()
    secret = cfg.get("api_secret", "")
    return bool(
        cfg.get("cloud_name") and cfg.get("api_key") and secret != PLACEHOLDER_SECRET and secret
    )


def _apply_config() -> dict[str, str]:
    """Settings win (tests use override_settings): configure the SDK from them on each call."""
    cfg = config()
    cloudinary.config(
        cloud_name=cfg.get("cloud_name", ""),
        api_key=cfg.get("api_key", ""),
        api_secret=cfg.get("api_secret", ""),
        secure=True,
    )
    return cfg


def folder_for(kind: str) -> str:
    root = config().get("root_folder", "medilink").strip("/")
    return f"{root}/{UPLOAD_KINDS[kind]}" if root else UPLOAD_KINDS[kind]


def sign_upload(kind: str) -> dict[str, Any]:
    """The parameters the browser sends to Cloudinary with the file. The browser must send exactly
    these signed keys and values (any extra signed key breaks the signature)."""
    cfg = _apply_config()
    params: dict[str, Any] = {
        "timestamp": int(time.time()),
        "upload_preset": cfg.get("upload_preset", "medilink_signed"),
        "asset_folder": folder_for(kind),
        "tags": f"medilink,{kind}",
    }
    signature = cloudinary.utils.api_sign_request(params, cfg["api_secret"])
    return {
        **params,
        "signature": signature,
        "api_key": cfg["api_key"],
        "cloud_name": cfg["cloud_name"],
        "upload_url": f"{UPLOAD_HOST}/{cfg['cloud_name']}/image/upload",
    }


def verify_asset(public_id: str, kind: str) -> dict[str, Any]:
    """The asset's details from the Admin API, after checking the client didn't invent the id and
    that it was uploaded for this kind (its asset folder, or its public id prefix on accounts
    with fixed folders). Raises AssetNotFound."""
    if not public_id or len(public_id) > 255 or ".." in public_id or public_id.startswith("/"):
        raise AssetNotFound(public_id)
    _apply_config()
    try:
        resource: dict[str, Any] = cloudinary.api.resource(public_id)
    except cloudinary.exceptions.NotFound:
        raise AssetNotFound(public_id) from None
    folder = folder_for(kind)
    in_folder = resource.get("asset_folder") == folder or public_id.startswith(f"{folder}/")
    if not in_folder or resource.get("resource_type", "image") != "image":
        raise AssetNotFound(public_id)
    return resource


def image_url(
    public_id: str | None, *, w: int = 800, h: int | None = None, crop: str = "fill"
) -> str | None:
    """Delivery URL (auto format and quality, smart crop), or None without an image."""
    if not public_id or not config().get("cloud_name"):
        return None
    _apply_config()
    opts: dict[str, Any] = {
        "width": w,
        "crop": crop,
        "gravity": "auto",
        "fetch_format": "auto",
        "quality": "auto",
        "secure": True,
    }
    if h:
        opts["height"] = h
    url: str = cloudinary.utils.cloudinary_url(public_id, **opts)[0]
    return url


def import_remote(url: str, kind: str) -> str:
    """Server-side signed upload of an image Cloudinary fetches from `url` (e.g. a Google profile
    photo), into the kind's folder with the same preset as browser uploads; its public id."""
    cfg = _apply_config()
    result: dict[str, Any] = cloudinary.uploader.upload(
        url,
        upload_preset=cfg.get("upload_preset", "medilink_signed"),
        asset_folder=folder_for(kind),
        tags=f"medilink,{kind},google",
        resource_type="image",
    )
    return str(result["public_id"])
