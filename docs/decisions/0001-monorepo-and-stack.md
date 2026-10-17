# ADR 0001 — Monorepo and stack

Status: Partly superseded. The monorepo decision stands; the stack is replaced by [ADR 0003](0003-stack-django-react-postgresql.md) (Django + React + PostgreSQL), and the channel plan by [ADR 0002](0002-web-first-paid-channels-later.md).

## Context
A small team must ship a patient app, a staff dashboard, and a backend that also serves WhatsApp, SMS and USSD. Health data must stay in Rwanda.

## Decision
- **One repository** for all parts, so one change to booking or queue logic ships consistently across channels.
- **TypeScript everywhere** (React Native/Expo, React, Node.js) so every developer can work on every part.
- **PostgreSQL** as the single database, including queue state. Add a cache or message broker only when measurements show it is needed.
- **Channels as API modules**, not separate services, until load or team size justifies splitting.
- **Hosting** with a provider that keeps data in Rwanda (provider to be chosen).

## Consequences
Simple to run and deploy for a small team. Revisit if the team grows past ~8 developers or channels need independent scaling.
