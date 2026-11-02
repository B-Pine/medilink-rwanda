from django.apps import AppConfig


class PlatformAdminConfig(AppConfig):
    name = "medilink.platform_admin"
    label = "platform_admin"
    verbose_name = "Platform administration"
    default_auto_field = "django.db.models.BigAutoField"
