# 12 · Patient dashboard

Status: Implemented (frontend) · 2026-11-02 · Owner: product + engineering

The product owner's brief for the signed-in patient experience (2026-11-02). Where it differs from [04 · Patient app](04-patient-app.md), this document wins for layout, navigation and addresses. Data and safety rules from 04, [01](01-product-direction.md) and the security baseline still apply.

## 1. Goal

A calm, premium personal health app: a patient always knows **where they are**, **whose information is on screen**, **what is happening with their care** and **what to do next**. It is not an admin template: no stat tiles for their own sake, no cards inside cards, one accent colour per meaning.

## 2. Addresses and shell

Every signed-in page lives under `/dashboard` and shares one shell (`layout/PatientShell.tsx`). Builders for every address are in `app/paths.ts`; links never hand-write paths.

| Address | Page |
|---|---|
| `/dashboard` | Overview |
| `/dashboard/find-care`, `/dashboard/facilities`, `/dashboard/facilities/:slug`, `/dashboard/book/:slug` | Discovery and booking, the public pages rendered inside the shell |
| `/dashboard/appointments`, `/dashboard/appointments/:id` | My appointments, appointment detail |
| `/dashboard/queue`, `/dashboard/queue/:visitId` | My queue, live tracker |
| `/dashboard/family`, `/dashboard/family/:patientId` | My family, a member's profile |
| `/dashboard/profile/:patientId/…`, `/dashboard/privacy`, `/dashboard/claim` | Profile sections, privacy and consent, claim a record |
| `/dashboard/records/:id?`, `/dashboard/medications/:id?`, `/dashboard/documents/:id?` | Medical records, medications, documents |
| `/dashboard/notifications/…`, `/dashboard/help/…`, `/dashboard/settings` | Notifications, help and support requests, settings |

**Backend links.** Patient notifications point straight at these pages (bookings at their appointment, tickets at the live queue, prescriptions and documents at their detail), and email and push open `/dashboard/notifications/<id>`. The push worker accepts both inbox paths.

**Old addresses keep working.** `/home`, `/visits`, `/book`, `/records`, `/medicines`, `/documents`, `/family`, `/profile`, `/privacy/settings`, `/claim`, `/notifications`, `/support` and `/settings` redirect (path tail and query kept), because emails, push messages, calendar files and bookmarks carry them.

**Shell by width.**

| Width | Navigation |
|---|---|
| ≥ 1024 px | Fixed sidebar (248 px): logo and "Patient portal"; Overview, Find care, Appointments, My queue, My family, Medical records, Medications, Documents; then Notifications (unread count), Help & support, Settings; the account block with its menu; a collapse control (remembered on the device). |
| 768–1023 px | Icon rail (76 px); the collapse control opens the full sidebar over the page. |
| < 768 px | Compact header (logo, search, bell, avatar) and a bottom tab bar: Home, Find care, Visits, Records, **More**. More opens a drawer with the profile, the profile switcher, My queue, My family, Medications, Documents, Notifications, Help, Settings, language and sign out. |

The top bar (≥ 768 px) holds the breadcrumb, the profile switcher (once the account cares for someone else), search, the notification bell, language and the avatar menu. Public discovery pages reused inside the shell drop their own header and footer (`InDashboardContext`), and their links to `/find-care` and `/facilities/…` open the in-shell copies.

**Search** (Ctrl/Cmd + K, or `/`): pages, the patient's own appointments and documents, then public facilities and doctors; one "Find care for …" row opens discovery with the words typed.

**Bell**: a menu with the five latest notifications, "Mark all as read" and "View all"; choosing one marks it read and opens what it is about.

## 3. Overview (`/dashboard`)

1. Greeting with the first name, the date, "Here's your healthcare overview."
2. **Active journey**, chosen from server data only: a live ticket (Current visit: ticket number largest, people ahead, the facility's estimate or its status, "Updated hh:mm", arrival status) beats the next appointment (date block, time in ochre, facility, doctor, booking reference, View details, directions when the facility has a verified location, Reschedule and Cancel in a menu); otherwise a welcome with Find care and Explore facilities.
3. Quick actions: Find care, Book appointment, My records, My family, Documents (white tiles, one icon each).
4. Upcoming appointments (next three) and Recent activity (the patient's notification feed, already authorised by the server).
5. Beside them: Reminders, only when there is something real to act on (a proposed new time to answer, an appointment within 24 h, a remote ticket still waiting for "I'm here"); the push-alerts banner; Family; the emergency notice.

## 4. Surfaces

One set, in `features/dashboard/kit.tsx` and `visits.tsx`:

| Surface | Rules |
|---|---|
| Panel | White, 1 px border, 16 px radius, 20–24 px padding, no heavy shadow |
| Visit panel / ticket | 20 px radius; the ticket has a soft green stub, a perforated edge and the number in display size |
| Row list | Related rows split by hairlines inside one surface (date block or icon · text · status · action), never a card per row |
| Quick action tile | Same size everywhere, white, one icon, title and one line |
| Status badge | Icon + word, tinted, small: confirmed green, needs answer ochre, cancelled red, missed neutral, rescheduled blue-grey |
| Segmented switch | For list views (Upcoming / Past / Cancelled, Active / Past, document types) |

Toasts (`layout/Toasts.tsx`) confirm actions the server accepted (cancelled, rescheduled) and never appear before the response. Motion: 150–300 ms, opacity and transform only, off under reduced motion.

## 5. Pages

| Page | Behaviour |
|---|---|
| Appointments | Upcoming, Past, Cancelled; each row opens the detail; the row menu adds to calendar, opens the facility, reschedules or cancels |
| Appointment detail | Two columns ≥ 1024 px: appointment, facility (address, today's hours, phone), timeline, what to bring; beside: booking reference, change deadline, directions, calendar, reschedule, cancel |
| Reschedule | The facility's free times for the same service, week by week; a chosen time is **held** with a visible countdown; the old time is released only when the server confirms the new one |
| Cancel | Confirmation that states the consequence (late cancellation after the deadline); the badge changes only after the server agrees |
| My queue | Today's tickets as tickets; a note that joining remotely is not check-in; Join a queue opens discovery filtered to remote join |
| Family | Profile rows (initials, name, relationship, age, MediLink number, access); a member's page opens with "You're viewing …'s profile" and links to their care |
| Records | Search by facility, doctor or diagnosis; whose records; signed records as rows with a "Signed" badge |
| Medications | Active / Past; rows with status |
| Documents | Type switch built from the types the person actually has; download all; rows with status |
| Settings | Section list beside the page ≥ 1024 px: personal information, language and display, privacy and consent, security, notification preferences, account |

## 6. Data and safety rules

- Nothing clinical is invented: no made-up waits, positions, availability, reminders or instructions. Where the server has no value, the screen says so.
- Every list is the server's authorised list for this account; dependants' items appear only through the server's links.
- Signed records stay read-only; the dashboard never shows AI suggestions as diagnoses.
- No prices anywhere in discovery or booking (U-01).

## 7. Open items (need backend or a decision)

| Item | Why it is not built | Shown instead |
|---|---|---|
| Previous queue tickets | No patient ticket-history endpoint (only `patient/visits/active/`) | A note pointing to Medical records |
| Booking QR code | Bookings carry a code, no QR payload | The booking code, large |
| Medication reminders (taken / missed) | No reminder model or endpoint | Not shown; reminders panel uses booking and queue data only |
| Change password while signed in, signed-in devices, two-step sign-in for patients | No patient endpoints | Change password uses the emailed reset link; the rest is marked "coming soon" |
| Close account | No self-service endpoint | Opens a support request |
| Records categories (labs, referrals) | Records are visit records; labs and referrals are not separate lists yet | One list with search |
| Join queue from the dashboard | Uses the existing booking flow (`/dashboard/book/:slug?today=1`) | — |

**Deviations from the brief.** Icons stay Phosphor (the repository's icon set) instead of Lucide, so every screen keeps one icon family. The fifth phone tab is **More** (profile at its top) instead of Profile, so all eleven places stay reachable.
