# Patient mobile app (Android)

Status: Draft v0.1 · 2026-11-05 · Owner: product + engineering

The patient dashboard ([12](12-patient-dashboard.md)) as an Android app, built with Flutter in
`mobile/`. Same API, same features, fewer words. Decisions below were taken with the product
owner on 2026-11-05.

## 1. Product decisions

| Topic | Decision |
|---|---|
| Users | Patients only. Staff keep the web app (MFA, shared desks) |
| Stack | Flutter (Dart), Material 3, Android first; folder `mobile/` |
| Data | The Railway API only, never the database. The app calls the API host directly |
| Look | Like a banking app: one job per screen, icon + 1–2 word labels, no paragraphs, cards, bottom sheets |
| Colours | The existing palette only (below) |
| Background | **Forest band**: `#123d2b` top band with the website's faint zigzag (≈7 %), a soft curve at its foot; the main card overlaps it. Page grey below, white cards. Other tabs get a short band behind the title |
| Navigation | Bottom bar, 4 tabs: Home · Care · Visits · Me. No drawer. Tablets: a navigation rail |
| Icons | Phosphor (the web's set), its icon fonts bundled in `mobile/assets/fonts` (the `phosphor_flutter` package no longer compiles): Regular everywhere, Fill for the active tab and status |
| Unlock | PIN (4–6 digits) and fingerprint; auto-lock after 2 min in the background |
| Logo | The MediLink pin (brand/logo/source), on a white badge over the forest band; launcher icon on white |
| Languages | Kinyarwanda first, English |
| Oldest Android | 8.0 (API 26); APK under 25 MB |
| Distribution | Signed release APK shared as a download; Play Store later |

### Palette and type

| Token | Value | Use |
|---|---|---|
| forest | `#123d2b` | Bands, splash, sign-in |
| forest raised | `#1a4d37` | Skeletons and chips on the band |
| brand | `#17694d` | Primary buttons, active tab, links |
| brand hover/pressed | `#0f4f3a` | Pressed state |
| brand subtle | `#e7f3ed` | Active-tab pill, selected rows |
| on-forest muted | `#b9d6c4` | Secondary text on the band |
| on-forest accent | `#6ee7b7` | Splash cross, "Live" dot |
| accent / ochre | `#fbbf24` | Waits and "your turn" only |
| page | `#f6f8f7` | Screen background |
| danger | `#b42318` | Cancel, leave queue, emergency |

Figtree for titles and numbers, Inter for text; both bundled. Sizes follow the phone's text size.

## 2. Screens

| Tab | Content | Web equivalent |
|---|---|---|
| **Home** | Greeting and bell on the band; the main card (today's ticket: number, people ahead, wait; else the next appointment; else "Book"); quick tiles Book · Find care · Symptoms · Records; Emergency (calls 912) | `/dashboard` |
| **Care** | Facilities list with search and filters; facility page (building drawing, hours, services, doctors); booking in bottom sheets | find care, facilities, book |
| **Visits** | Today (live tickets) · Upcoming · Past, with sticky headers; ticket tracker; appointment detail | queue, appointments |
| **Me** | Profile header on the band; Records, Medications, Documents, Family; Privacy, Help, Settings; Sign out | records, medications, documents, family, privacy, help, settings |

Before the tabs: splash → sign in / create account → set PIN → fingerprint (optional). No intro
slides. A family switcher on Home acts for a dependent.

## 3. Interaction

- **Loading:** no spinners. Splash draws the cross; skeletons the size of the real content with a
  soft shine; pull to refresh draws a heartbeat line; buttons turn into three dots, then a tick
  with a light vibration; "Live" dot breathes; AI chat shows typing dots; after 8 s "Slow
  connection" + Retry; offline bar keeps saved data visible. Reduced motion: plain grey.
- **Scroll:** the band collapses into a bar and the ticket docks as a small pill; sticky section
  headers; the bottom bar hides on long lists and returns on scroll up; horizontal rows snap;
  re-tapping the active tab scrolls to the top.
- **Tabs and depth:** each tab keeps its own stack and scroll position; tab switches fade through
  (200 ms); drill-in slides from the right; shared elements (building drawing, ticket card);
  bottom sheets with half and full stops; Android predictive back.
- **Long press and swipe:** context menus on facilities, appointments, tickets, medications,
  documents and family members; swipe on appointments (calendar · reschedule · cancel). Every
  option also exists as a normal button; destructive ones are red and confirm.
- **App icon shortcuts:** My ticket · Book · Find care · Emergency 912.

## 4. Security

- Sign-in with email and password as on the web, then a PIN on that phone. The session is the
  normal patient session carried in a header ([security 03 §5](../security/03-identity-authentication-sessions.md)):
  `X-MediLink-Client: app` + `Authorization: Bearer <key>`; new key in `X-Session-Token`.
- The key is kept in the Android Keystore (`flutter_secure_storage`), never in plain storage.
- Records, medications and documents block screenshots and the app-switcher preview
  (`FLAG_SECURE`).
- Offline copies (last ticket, appointments, medications) are encrypted on the phone and wiped on
  sign-out.
- No analytics or crash reporting that sends health data to third parties.
- The release signing key is backed up by the product owner outside git; losing it means
  existing installs cannot be updated.

## 5. Versions

| Version | Scope |
|---|---|
| **v1** (built 2026-11-05) | Everything above. Live updates by polling (15 s while a ticket is open) |
| **v1.0.1** (2026-11-05) | Real logo; in-app notifications, symptom checker (chat, rules checklist fallback), family, privacy (choices, access history, notices), help and support, reset password; tab and back-button fixes |
| v1.1 | Update prompt (the app checks a version file and offers the new APK); profile editing in the app; bottom bar hiding on long lists |
| v2 | Push notifications (FCM; content-free messages), WebSocket live updates for the app, home-screen widget, QR ticket and check-in scanning by staff |

## 6. Build

- `mobile/`: Flutter project (`flutter analyze`, `flutter test` in CI).
- API base URL at build time: `--dart-define=API_BASE_URL=https://<api host>`.
- Release APK: `flutter build apk --release`, copied to `mobile/apk/` (ignored by git) and shared
  from there or from a GitHub release.
