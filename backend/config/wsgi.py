"""WSGI entry point (HTTP only). Production uses ASGI (config.asgi) for WebSockets."""

from django.core.wsgi import get_wsgi_application

from config.environment import require_settings_module

require_settings_module()

application = get_wsgi_application()
