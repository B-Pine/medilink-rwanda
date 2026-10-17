# API

Backend for all channels. Owns facilities, users and roles, patients, schedules, bookings, visits and the queue state, clinical records, prescriptions, billing, documents, notifications, disputes and the audit log.

Planned stack ([ADR 0003](../docs/decisions/0003-stack-django-react-postgresql.md)): Python 3.12+, Django 5.2 LTS, Django REST Framework, PostgreSQL 16 (row-level security), Django Channels + Redis for real-time queue updates, Celery + Redis for background and scheduled jobs, WeasyPrint for PDF documents.

Channel adapters (web push and email in phase 1; SMS, WhatsApp, USSD later) live behind the notification service, so adding a channel never changes feature code.
