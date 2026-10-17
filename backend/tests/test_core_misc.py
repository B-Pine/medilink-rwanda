"""Core helpers: IDs, system checks, admin site, user manager, session store, DB grants."""

from __future__ import annotations

import uuid
from typing import Any
from unittest import mock

import pytest
from django.core.checks import run_checks
from django.test import Client, override_settings

from medilink.accounts.models import User, normalize_email
from medilink.core import ids
from medilink.core.checks import check_deploy_cookies, check_session_audiences
from tests.conftest import totp_code
from tests.factories import UserFactory, make_totp_device


def test_uuid7_fallback_is_version_7() -> None:
    with mock.patch.object(ids.uuid, "uuid7", None, create=True):
        value = ids.uuid7()
    assert isinstance(value, uuid.UUID)
    assert value.version == 7
    assert ids.uuid7().version == 7


def test_request_id_validation() -> None:
    assert ids.is_valid_request_id("01JABCDEFGHJKMNPQRSTVWXYZ0")
    assert not ids.is_valid_request_id(None)
    assert not ids.is_valid_request_id("short")
    assert not ids.is_valid_request_id("has space in it")
    assert len(ids.new_request_id()) == 26


def test_project_system_checks_pass() -> None:
    assert [m for m in run_checks() if m.id and m.id.startswith("medilink")] == []


def test_check_detects_duplicate_cookie_names_and_wildcard_cors() -> None:
    audiences = {
        "staff": {
            "COOKIE_NAME": "same",
            "IDLE_TIMEOUT": 1,
            "ABSOLUTE_TIMEOUT": 1,
            "PATH_PREFIXES": [],
        },
        "patient": {
            "COOKIE_NAME": "same",
            "IDLE_TIMEOUT": 1,
            "ABSOLUTE_TIMEOUT": 1,
            "PATH_PREFIXES": [],
        },
    }
    with override_settings(SESSION_AUDIENCES=audiences, CORS_ALLOW_ALL_ORIGINS=True):
        ids_found = {m.id for m in check_session_audiences()}
    assert ids_found == {"medilink.E001", "medilink.E002"}


def test_deploy_checks_flag_eager_celery_and_missing_csp() -> None:
    with override_settings(SECURE_CSP={}, CELERY_TASK_ALWAYS_EAGER=True):
        found = {m.id for m in check_deploy_cookies()}
    assert {"medilink.W001", "medilink.W002", "medilink.W003", "medilink.W004"} <= found


@pytest.mark.django_db
def test_user_manager_and_email_normalisation() -> None:
    assert normalize_email("  Jeanne@Example.TEST ") == "jeanne@example.test"
    user = User.objects.create_user(
        "  Mixed@Example.TEST", "a long synthetic test passphrase", full_name="Mixed Case"
    )
    assert user.email == "mixed@example.test"
    assert User.objects.get_by_natural_key("MIXED@example.test") == user
    assert str(user) == f"user {user.pk}"  # never the email
    assert user.get_full_name() == "Mixed Case" and user.get_short_name() == "Mixed"
    assert not user.is_staff and not user.has_perm("x") and not user.has_module_perms("tenancy")
    admin = User.objects.create_superuser(
        "root@example.test", "a long synthetic test passphrase", full_name="Root"
    )
    assert admin.is_platform_admin and admin.is_staff and admin.is_superuser
    assert admin.has_perms(["a", "b"]) and admin.has_module_perms("tenancy")
    with pytest.raises(ValueError, match="email"):
        User.objects.create_user("", "x")
    user.email = " UPPER@Example.Test "
    user.clean()
    assert user.email == "upper@example.test"


@pytest.mark.django_db
def test_admin_requires_platform_admin_with_verified_otp() -> None:
    client = Client()
    assert client.get("/ops-admin/").status_code == 302  # to login
    admin = UserFactory(is_platform_admin=True, email="ops@example.test")
    make_totp_device(admin)
    device_id = admin.totpdevice_set.get().persistent_id
    response = client.post(
        "/ops-admin/login/?next=/ops-admin/",
        {
            "username": admin.email,
            "password": "a long synthetic test passphrase",
            "otp_device": device_id,
            "otp_token": totp_code(admin),
        },
    )
    assert response.status_code == 302, response.content[:500]
    assert "ml_admin" in client.cookies
    assert client.get("/ops-admin/").status_code == 200
    assert client.get("/ops-admin/audit/auditentry/").status_code == 200
    assert client.get("/ops-admin/tenancy/facility/").status_code == 200

    plain = UserFactory(email="plain@example.test")
    make_totp_device(plain)
    other = Client()
    other.post(
        "/ops-admin/login/",
        {
            "username": plain.email,
            "password": "a long synthetic test passphrase",
            "otp_device": plain.totpdevice_set.get().persistent_id,
            "otp_token": totp_code(plain),
        },
    )
    assert other.get("/ops-admin/").status_code == 302


@pytest.mark.django_db
def test_session_store_basics() -> None:
    from medilink.accounts.session_store import SessionStore
    from medilink.accounts.sessions import NullSession

    store = SessionStore(audience="patient")
    store["k"] = "v"
    store.save()
    assert SessionStore(store.session_key, audience="patient")["k"] == "v"
    assert SessionStore(store.session_key, audience="staff").get("k") is None  # other audience
    assert store.get_session_cookie_age() == 12 * 3600 + 60
    assert SessionStore().get_session_cookie_age() > 0
    null = NullSession()
    null["x"] = 1
    null.save()
    null.create()
    null.delete()
    NullSession.clear_expired()
    assert not null.exists("anything")
    assert null.load() == {}


@pytest.mark.django_db
def test_session_store_async_paths_and_errors() -> None:
    from asgiref.sync import async_to_sync
    from django.contrib.sessions.backends.base import CreateError, UpdateError

    from medilink.accounts.models import UserSession
    from medilink.accounts.session_store import SessionStore

    store = SessionStore(audience="staff")
    store["a"] = 1
    async_to_sync(store.asave)()
    assert async_to_sync(SessionStore(store.session_key, audience="staff").aload)() == {"a": 1}
    assert async_to_sync(SessionStore(store.session_key, audience="patient").aload)() == {}

    duplicate = SessionStore(audience="staff")
    duplicate._session_key = store.session_key
    with pytest.raises(CreateError):
        duplicate.save(must_create=True)

    UserSession.objects.filter(pk=store.session_key).delete()  # e.g. revoked concurrently
    store["b"] = 2
    with pytest.raises(UpdateError):
        store.save()
    assert str(UserSession(session_key="k")) == "k"


@pytest.mark.django_db
def test_other_model_string_representations(patient_user: Any) -> None:
    from medilink.accounts.models import RecoveryCode
    from medilink.patients.models import ConsentRecord, Patient, PatientLink

    assert str(RecoveryCode(pk=uuid.UUID(int=1))).startswith("recovery code")
    assert str(Patient.objects.first()).startswith("patient ")
    assert str(PatientLink.objects.first()).startswith("patient link ")
    assert str(ConsentRecord(kind="terms")).startswith("consent terms")


def test_email_backend_has_no_django_permissions() -> None:
    from medilink.accounts.backends import EmailBackend

    backend = EmailBackend()
    assert backend.get_user_permissions(None) == set()
    assert backend.get_group_permissions(None) == set()
    assert backend.get_all_permissions(None) == set()
    assert backend.has_perm(None, "x") is False
    assert backend.has_module_perms(None, "x") is False


@pytest.mark.django_db
def test_grants_are_idempotent_and_skip_missing_role() -> None:
    from django.db import connection

    from medilink.core.db import grant_app_role_privileges

    with connection.cursor() as cursor:
        cursor.execute("RESET ROLE")
    grant_app_role_privileges(using="default")
    with override_settings(DATABASE_APP_ROLE="role_that_does_not_exist"):
        grant_app_role_privileges(using="default")
    with connection.cursor() as cursor:
        cursor.execute("SET ROLE medilink_app")
        grant_app_role_privileges(using="default")  # current_user == app role: nothing to do
        cursor.execute(
            "SELECT has_table_privilege('medilink_app', 'audit_auditentry', 'UPDATE'), "
            "has_table_privilege('medilink_app', 'audit_auditentry', 'INSERT'), "
            "has_table_privilege('medilink_app', 'django_migrations', 'INSERT')"
        )
        assert cursor.fetchone() == (False, True, False)


def test_mailers_config_parses_email_url() -> None:
    from django.core.exceptions import ImproperlyConfigured

    from config.settings.base import mailers_config

    smtp = mailers_config("smtp+tls://user%40x:p%40ss@smtp.example.rw:587")["default"]
    assert smtp["OPTIONS"]["username"] == "user@x" and smtp["OPTIONS"]["password"] == "p@ss"
    assert smtp["OPTIONS"]["use_tls"] is True and smtp["OPTIONS"]["port"] == 587
    assert mailers_config("smtp+ssl://h")["default"]["OPTIONS"]["port"] == 465
    assert mailers_config("console://")["default"]["BACKEND"].endswith("console.EmailBackend")
    with pytest.raises(ImproperlyConfigured):
        mailers_config("ftp://nope")


def test_pagination_defaults() -> None:
    from medilink.core.pagination import DefaultPagination

    assert (DefaultPagination.page_size, DefaultPagination.max_page_size) == (25, 100)
    assert DefaultPagination.page_size_query_param == "page_size"


def test_client_ip_honours_trusted_proxies() -> None:
    from types import SimpleNamespace

    from medilink.core.net import client_ip

    request = SimpleNamespace(
        META={"REMOTE_ADDR": "10.0.0.1", "HTTP_X_FORWARDED_FOR": "1.2.3.4, 5.6.7.8"}
    )
    assert client_ip(request) == "10.0.0.1"  # NUM_PROXIES=0: XFF ignored (spoofable)
    rest = {"NUM_PROXIES": 1}
    with override_settings(REST_FRAMEWORK=rest):
        assert client_ip(request) == "5.6.7.8"
    with override_settings(REST_FRAMEWORK={"NUM_PROXIES": 5}):
        assert client_ip(request) == "1.2.3.4"


def test_security_headers_on_api_responses(client: Any) -> None:
    response = client.get("/api/v1/health/")
    assert response["Cache-Control"] == "no-store"
    assert response["X-Frame-Options"] == "DENY"
    assert response["X-Content-Type-Options"] == "nosniff"
    assert response["Referrer-Policy"] == "same-origin"
    assert response["Cross-Origin-Opener-Policy"] == "same-origin"
    assert response["Cross-Origin-Resource-Policy"] == "same-site"
    assert "camera=()" in response["Permissions-Policy"]
    assert "default-src 'self'" in response["Content-Security-Policy"]
