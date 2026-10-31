"""ASGI entry point: HTTP (Django) + WebSockets (Channels).

WebSocket connections must come from an allowlisted frontend origin (WS_ALLOWED_ORIGINS, same as
the CORS allowlist) and are authenticated with the audience session cookie (security 06 §8).

Run:  uvicorn config.asgi:application --port 8000
"""

from django.core.asgi import get_asgi_application

from config.environment import require_settings_module

require_settings_module()

django_asgi_app = get_asgi_application()

# Import after Django is set up (models are used by the WebSocket auth middleware).
from channels.routing import ProtocolTypeRouter  # noqa: E402

from medilink.core.realtime import build_websocket_application  # noqa: E402

application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
        "websocket": build_websocket_application(),
    }
)
