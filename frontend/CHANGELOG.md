# Changelog

All notable changes to the MediLink frontend (`frontend/`) are documented here.
The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Releases are tagged
`frontend-vX.Y.Z` ([ADR 0006](../docs/decisions/0006-separate-frontend-and-backend-hosting.md)).

## [Unreleased]

## [0.1.0] - 2026-10-17

Sprint 0 (Foundations), built against MSW mocks of the
[Sprint 0 contract](../docs/architecture/03-sprint-0-contract.md). Requires API `/api/v1` 0.1.0.

### Added

- pnpm workspace (`apps/*`, `packages/*`) with shared TypeScript (strict), ESLint and Prettier
  configuration; scripts `dev`, `dev:mock`, `build`, `build:mock`, `test`, `lint`, `typecheck`,
  `format`, `icons`, `i18n:review`, `generate-types`.
- `@medilink/ui`: design tokens from design research 02 (light and dark, system preference plus
  `data-theme` override), staff and patient density, Tailwind CSS v4 theme on the tokens,
  self-hosted Figtree and Inter, focus ring and reduced-motion base styles, and the components
  Button, Field, TextField, PasswordField, CheckboxField, SelectField, ErrorSummary, Alert, Badge,
  Card, Spinner, Skeleton, Logo, LanguageSwitcher, ThemeToggle, VisuallyHidden, SkipLink, Menu
  and an Imigongo-inspired pattern.
- i18n with i18next: Kinyarwanda (default), English and French; `<html lang>` follows the
  language; Kinyarwanda drafts listed for native-speaker review in `i18n-review.md`.
- `@medilink/api-client`: typed fetch client (credentials, CSRF bootstrap and refresh,
  `Accept-Language`, typed `ApiError`, 401 hook), typed functions for every Sprint 0 endpoint,
  `generate-types` stub for openapi-typescript.
- MSW handlers for the Sprint 0 contract, including the MFA flows and error cases, with
  documented mock accounts.
- Staff web: split-screen login, MFA setup (QR, manual key, recovery codes) and verify (code or
  recovery code), facility picker, app shell (sidebar by permissions, facility switcher,
  connection indicator, user menu with theme, language and logout), Today placeholder, section
  placeholders, password reset, 404, session route guard.
- Patient web: public landing skeleton, email-first login, sign-up with consent step, patient
  home placeholder, logout, password reset, placeholder public pages, 404, installable PWA that
  never caches `/api/`.
- Favicons, PWA icons and web logos generated from `brand/logo/source/` by `scripts/generate-icons.mjs`.
- Tests: Vitest + Testing Library + vitest-axe (flows against the mocks, accessibility on key
  pages, token values and contrast, i18n parity, security guards, lint rule).
- CI workflow `.github/workflows/ci-frontend.yml` (install, lint, format, typecheck, test, build).

### Security

- No tokens in browser storage; `dangerouslySetInnerHTML` and `innerHTML` banned by lint; no
  third-party scripts, fonts or CDNs; CSP meta tag in builds; mocks excluded from production
  builds; service worker never caches API responses; caches cleared on patient logout.

[Unreleased]: https://github.com/B-Pine/medilink-rwanda/compare/frontend-v0.1.0...HEAD
[0.1.0]: https://github.com/B-Pine/medilink-rwanda/releases/tag/frontend-v0.1.0
