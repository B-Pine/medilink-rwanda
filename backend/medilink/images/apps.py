from django.apps import AppConfig


class ImagesConfig(AppConfig):
    name = "medilink.images"
    label = "images"
    verbose_name = "Images (Cloudinary)"

    def ready(self) -> None:
        from medilink.images import checks  # noqa: F401  (registers deploy checks)
