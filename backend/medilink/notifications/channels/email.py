"""Email (contract sprint-09 §3.2): Django mail (Mailpit in dev), plain text + autoescaped HTML in
the recipient's language, a link to the right app's /notifications/<id>; no attachments, no
tracking pixels (security 02 §4)."""

from __future__ import annotations

import logging
import smtplib
from typing import Any, ClassVar

from django.core.mail import EmailMultiAlternatives
from django.template import Context, Engine

from medilink.notifications.channels import Message, SendResult, Target
from medilink.notifications.templates import LIMITS, TextLimits

logger = logging.getLogger(__name__)

FOOTER = {
    "rw": "Fungura ubutumwa kuri MediLink",
    "en": "Open the message in MediLink",
    "fr": "Ouvrir le message dans MediLink",
}
_ENGINE = Engine(autoescape=True)
_HTML = _ENGINE.from_string(
    '<!doctype html><html lang="{{ language }}">'
    '<body style="font-family:sans-serif;line-height:1.5">'
    '<h1 style="font-size:18px">{{ subject }}</h1>'
    "{% for line in lines %}<p>{{ line }}</p>{% endfor %}"
    '<p><a href="{{ url }}">{{ footer }}</a></p></body></html>'
)


class EmailAdapter:
    channel: ClassVar[str] = "email"
    interrupts: ClassVar[bool] = True
    limits: ClassVar[TextLimits] = LIMITS["email"]

    def is_enabled(self) -> bool:
        return True

    def targets(self, notification: Any) -> list[Target]:
        email = getattr(notification.recipient_user, "email", "")
        return [Target(address=email)] if email else []

    def send(self, message: Message, target: Target) -> SendResult:
        footer = FOOTER.get(message.language, FOOTER["en"])
        text = f"{message.body}\n\n{footer}: {message.url}\n"
        html = _HTML.render(
            Context(
                {
                    "language": message.language,
                    "subject": message.subject,
                    "lines": [line for line in message.body.split("\n") if line.strip()],
                    "url": message.url,
                    "footer": footer,
                }
            )
        )
        mail = EmailMultiAlternatives(subject=message.subject, body=text, to=[target.address])
        mail.attach_alternative(html, "text/html")
        try:
            mail.send()
        except (smtplib.SMTPServerDisconnected, smtplib.SMTPConnectError, TimeoutError):
            return SendResult(status="failed", retryable=True, failure_reason="timeout")
        except smtplib.SMTPResponseException as exc:
            retryable = 400 <= exc.smtp_code < 500
            return SendResult(status="failed", retryable=retryable, failure_reason="provider_error")
        except (smtplib.SMTPException, OSError):
            return SendResult(status="failed", retryable=True, failure_reason="provider_error")
        return SendResult(status="sent")
