"""Users (email login, no username), MFA recovery codes and audience-scoped sessions."""

from __future__ import annotations

from typing import TYPE_CHECKING, Any

from django.contrib.auth.base_user import AbstractBaseUser, BaseUserManager
from django.contrib.postgres.fields import ArrayField
from django.contrib.sessions.base_session import AbstractBaseSession
from django.db import models
from django.db.models.functions import Lower

from medilink.core.ids import uuid7


class Language(models.TextChoices):
    RW = "rw", "Kinyarwanda"
    EN = "en", "English"
    FR = "fr", "Français"


def normalize_email(email: str | None) -> str:
    """Emails are case-insensitive identifiers: stored and compared trimmed and lowercased."""
    return (email or "").strip().lower()


if TYPE_CHECKING:
    _UserManagerBase = BaseUserManager["User"]
else:
    _UserManagerBase = BaseUserManager


class UserManager(_UserManagerBase):
    use_in_migrations = True

    def get_by_natural_key(self, username: str | None) -> User:
        return self.get(email=normalize_email(username))

    def create_user(self, email: str, password: str | None = None, **extra: Any) -> User:
        if not email:
            raise ValueError("An email address is required.")
        user = self.model(email=normalize_email(email), **extra)
        user.set_password(password)
        user.save(using=self._db)
        return user

    def create_superuser(self, email: str, password: str | None = None, **extra: Any) -> User:
        """`createsuperuser` creates a platform admin (super admin is a flag, not a role)."""
        extra["is_platform_admin"] = True
        extra.setdefault("is_active", True)
        return self.create_user(email, password, **extra)


class User(AbstractBaseUser):
    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)
    email = models.EmailField(max_length=254, unique=True)
    full_name = models.CharField(max_length=150)
    preferred_language = models.CharField(
        max_length=2, choices=Language.choices, default=Language.RW
    )
    # Staff work phone, E.164 (+2507…); patients keep theirs on the encrypted patient record
    phone = models.CharField(max_length=20, blank=True)
    is_platform_admin = models.BooleanField(default=False)
    is_active = models.BooleanField(default=True)
    email_verified_at = models.DateTimeField(null=True, blank=True)
    # Self sign-up (security 03 §6): the account can't sign in until the emailed link is opened.
    email_verification_pending = models.BooleanField(default=False)
    # S1 (contract §2.5): staff unlock PIN, Argon2id hash (C3); null = no PIN
    pin_hash = models.CharField(max_length=256, null=True, blank=True)  # noqa: DJ001
    pin_set_at = models.DateTimeField(null=True, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = UserManager()

    USERNAME_FIELD = "email"
    EMAIL_FIELD = "email"
    REQUIRED_FIELDS = ["full_name"]

    class Meta:
        constraints = [
            models.UniqueConstraint(Lower("email"), name="accounts_user_email_ci_unique")
        ]

    def __str__(self) -> str:
        return f"user {self.pk}"  # never the email: str() ends up in logs

    def save(self, *args: Any, **kwargs: Any) -> None:
        self.email = normalize_email(self.email)
        super().save(*args, **kwargs)

    def clean(self) -> None:
        super().clean()
        self.email = normalize_email(self.email)

    def get_full_name(self) -> str:
        return self.full_name

    def get_short_name(self) -> str:
        return self.full_name.split(" ")[0] if self.full_name else ""

    # Django admin integration: only platform admins may use the (OTP-protected) admin site.
    @property
    def is_staff(self) -> bool:
        return self.is_platform_admin

    @property
    def is_superuser(self) -> bool:
        return self.is_platform_admin

    def has_perm(self, perm: str, obj: Any = None) -> bool:
        return self.is_active and self.is_platform_admin

    def has_perms(self, perm_list: Any, obj: Any = None) -> bool:
        return all(self.has_perm(perm, obj) for perm in perm_list)

    def has_module_perms(self, app_label: str) -> bool:
        return self.is_active and self.is_platform_admin


class RecoveryCode(models.Model):
    """Single-use MFA recovery code, stored hashed (Argon2) and shown to the user only once."""

    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="recovery_codes")
    code_hash = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)
    used_at = models.DateTimeField(null=True, blank=True)

    def __str__(self) -> str:
        return f"recovery code {self.pk}"


class UserSession(AbstractBaseSession):
    """Server-side session row, tagged with its audience and user so sessions can be listed and
    revoked per user (password reset, deactivation)."""

    audience = models.CharField(max_length=16, db_index=True)
    user = models.ForeignKey(
        User, null=True, blank=True, on_delete=models.CASCADE, related_name="sessions"
    )
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta(AbstractBaseSession.Meta):
        db_table = "accounts_user_session"

    @classmethod
    def get_session_store_class(cls) -> type:
        from medilink.accounts.session_store import SessionStore

        return SessionStore


class Council(models.TextChoices):
    RMDC = "rmdc", "Rwanda Medical and Dental Council"
    NCNM = "ncnm", "National Council of Nurses and Midwives"
    NPC = "npc", "National Pharmacy Council"
    RAHPC = "rahpc", "Rwanda Allied Health Professions Council"
    OTHER = "other", "Other council"


class Profession(models.TextChoices):
    """The cadre a clinician is registered in: the government counts staff by these."""

    MEDICAL_DOCTOR = "medical_doctor", "Medical doctor"
    DENTIST = "dentist", "Dentist"
    NURSE = "nurse", "Nurse"
    MIDWIFE = "midwife", "Midwife"
    PHARMACIST = "pharmacist", "Pharmacist"
    LAB_TECHNOLOGIST = "lab_technologist", "Laboratory technologist"
    RADIOGRAPHER = "radiographer", "Radiographer"
    ANAESTHETIST = "anaesthetist", "Anaesthetist"
    PHYSIOTHERAPIST = "physiotherapist", "Physiotherapist"
    CLINICAL_PSYCHOLOGIST = "clinical_psychologist", "Clinical psychologist"
    NUTRITIONIST = "nutritionist", "Nutritionist"
    OPTOMETRIST = "optometrist", "Optometrist"
    OTHER = "other", "Other"


# A fixed list, so the facility and the government can count by specialty. `specialty` keeps the
# English name for the letters and pages that print it.
SPECIALTIES: dict[str, str] = {
    "general_practice": "General practice",
    "family_medicine": "Family medicine",
    "internal_medicine": "Internal medicine",
    "paediatrics": "Paediatrics",
    "obstetrics_gynaecology": "Obstetrics and gynaecology",
    "general_surgery": "General surgery",
    "orthopaedics": "Orthopaedics",
    "anaesthesiology": "Anaesthesiology",
    "emergency_medicine": "Emergency medicine",
    "psychiatry": "Psychiatry",
    "dermatology": "Dermatology",
    "ophthalmology": "Ophthalmology",
    "ent": "Ear, nose and throat",
    "cardiology": "Cardiology",
    "neurology": "Neurology",
    "radiology": "Radiology",
    "pathology": "Pathology",
    "urology": "Urology",
    "dentistry": "Dentistry",
    "public_health": "Public health",
    "other": "Other",
}


class Sex(models.TextChoices):
    FEMALE = "female", "Female"
    MALE = "male", "Male"


class ClinicianProfile(models.Model):
    """S2: a clinician's professional licence (FR-ACC-07). Platform-wide; a facility sees it only
    for its members. 2026-11-03: the full professional profile (profession, specialty from a fixed
    list, licence expiry and scan, photo, sex, qualifications)."""

    user = models.OneToOneField(
        User, on_delete=models.CASCADE, primary_key=True, related_name="clinician_profile"
    )
    council = models.CharField(max_length=8, choices=Council.choices)
    licence_number = models.CharField(max_length=40)
    # C1: when the council licence (practising certificate) ends, and its scan (purpose
    # clinician_licence); a facility admin checks both before attesting
    licence_valid_until = models.DateField(null=True, blank=True)
    licence_file = models.ForeignKey(
        "uploads.UploadedFile", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    licence_reminder_days = models.PositiveSmallIntegerField(null=True, blank=True)  # 60, 30, 0
    profession = models.CharField(max_length=24, choices=Profession.choices, blank=True)
    specialty_code = models.CharField(max_length=32, blank=True)  # a SPECIALTIES key
    specialty = models.CharField(max_length=100, blank=True)
    sex = models.CharField(max_length=8, choices=Sex.choices, blank=True)
    # C0: the face patients see (purpose clinician_photo)
    photo_file = models.ForeignKey(
        "uploads.UploadedFile", on_delete=models.SET_NULL, null=True, blank=True, related_name="+"
    )
    # [{"degree": "MBChB", "institution": "University of Rwanda", "year": 2015}], up to 5
    qualifications = models.JSONField(default=list, blank=True)
    # upgrade 05 §3: what patients read on the public doctor page (no licence data there)
    bio_i18n = models.JSONField(default=dict, blank=True)
    languages = ArrayField(models.CharField(max_length=8), default=list, blank=True)
    is_public = models.BooleanField(default=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "accounts_clinician_profile"
        constraints = [
            models.UniqueConstraint(
                fields=["council", "licence_number"], name="accounts_clinician_licence_unique"
            )
        ]

    def __str__(self) -> str:
        return f"clinician profile {self.pk}"


class ClinicianTemplate(models.Model):
    """A clinician's own note template and favourite prescription (upgrade 05 §3).

    Personal working text, never patient data, so it follows the clinician across facilities.
    `items` use the prescription item fields (drug_code or free_text_drug, dose, frequency_code,
    route, duration_days, quantity, instructions).
    """

    id = models.UUIDField(primary_key=True, default=uuid7, editable=False)
    user = models.ForeignKey(User, on_delete=models.CASCADE, related_name="clinician_templates")
    name = models.CharField(max_length=80)
    sections = models.JSONField(default=dict, blank=True)
    diagnosis_codes = ArrayField(models.CharField(max_length=10), default=list, blank=True)
    items = models.JSONField(default=list, blank=True)
    use_count = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        db_table = "accounts_clinician_template"
        ordering = ["-use_count", "name"]
        constraints = [
            models.UniqueConstraint(fields=["user", "name"], name="accounts_template_name_unique")
        ]

    def __str__(self) -> str:
        return f"template {self.pk}"
