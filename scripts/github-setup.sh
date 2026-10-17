#!/usr/bin/env bash
# Creates labels and milestones. Requires the GitHub CLI (gh) logged in.
# Usage: ./scripts/github-setup.sh <owner>/<repo>
set -euo pipefail
REPO="${1:?Usage: $0 <owner>/<repo>}"

label() { gh label create "$1" --color "$2" --description "$3" --repo "$REPO" --force; }

label "type:bug"            d73a4a "Something is broken"
label "type:feature"        0e8a16 "New capability"
label "type:chore"          cfd3d7 "Maintenance, tooling, CI"
label "type:docs"           0075ca "Documentation"
label "area:api"            5319e7 "Backend API (Django)"
label "area:patient-web"    1d76db "Patient web app (PWA)"
label "area:staff-web"      006b75 "Admin, reception, doctor, pharmacy web app"
label "area:patient-mobile" 0052cc "Patient mobile app (phase 3)"
label "area:onboarding"     c2e0c6 "Facility onboarding, verification, setup"
label "area:booking"        bfd4f2 "Discovery, calendars, scheduling, booking"
label "area:queue"          e99695 "Visits and live queue"
label "area:clinical"       f9d0c4 "Consultation records and documents"
label "area:pharmacy"       d4c5f9 "Prescriptions and dispensing"
label "area:billing"        fef2c0 "Billing, payments, receipts"
label "area:insurance"      b60205 "Insurance acceptance and verification"
label "area:notifications"  c5def5 "Notifications and announcements"
label "area:disputes"       f7c6c7 "Disputes, complaints, support"
label "area:reports"        bfdadc "Reports and analytics"
label "area:ai"             8250df "Symptom checker / ML"
label "area:sms"            c5def5 "SMS channel (phase 3)"
label "area:whatsapp"       25d366 "WhatsApp channel (phase 4)"
label "area:ussd"           fbca04 "USSD channel (phase 4)"
label "priority:high"       b60205 "Do next"
label "priority:low"        ededed "When time allows"
label "patient-data"        000000 "Touches patient data, extra review needed"

ms() { gh api "repos/$REPO/milestones" -f title="$1" -f description="$2" >/dev/null && echo "milestone: $1"; }

ms "M1 · Web MVP" "Onboarding, six roles, patient PWA, booking, live queue with walk-ins, clinical records, prescriptions, dispensing, documents, billing, notifications, disputes, audit"
ms "M2 · Pilot and growth" "Pilot facilities with impact measurement, referrals, sharing, waitlist, ratings, claims, subscriptions, rules-based triage"
ms "M3 · Mobile and SMS" "Android app, SMS alerts and OTP, mobile money, ML triage in shadow mode"
ms "M4 · Reach and intelligence" "WhatsApp, USSD, insurer integrations, EMR integration, patient-facing ML triage"
