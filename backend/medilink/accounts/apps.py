from django.apps import AppConfig


class AccountsConfig(AppConfig):
    name = "medilink.accounts"
    label = "accounts"
    verbose_name = "Accounts"

    def ready(self) -> None:
        # Registers the OpenAPI security schemes for the audience session cookies.
        from medilink.accounts import authentication  # noqa: F401
