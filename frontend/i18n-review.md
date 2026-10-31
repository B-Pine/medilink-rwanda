# Kinyarwanda strings: native-speaker review

Keys: 2215.

Status: **every Kinyarwanda string below is a draft that needs native-speaker review.** None of
them is final (docs/design/research/10-accessibility-and-localization.md §3, NFR-UX-01). Medical
terms must also be checked with clinicians. Review with real users (elderly patients, reception
staff) before the pilot.

How to review: correct the text in the `rw.json` file named in each section, then run
`pnpm i18n:review` to regenerate this list. Change a row's status only in the review tracker
agreed with the team; this file is generated.

Also to confirm:

- The emergency number shown to patients (`emergency.body`, currently **912**).
- Facility type and role names (`facility.types.*`, `facility.roles.*`).
- The mock API messages in `packages/api-client/src/mocks/messages.ts` (development only).

## Shared components (namespace ui)

File: `packages/ui/src/i18n/locales/rw.json`

| Key | Kinyarwanda (draft) | English source | Status |
|---|---|---|---|
| `skipLink` | Simbuka ujye ku bikubiyemo by’ingenzi | Skip to main content | needs native-speaker review |
| `loading` | Birimo gufunguka… | Loading… | needs native-speaker review |
| `close` | Funga | Close | needs native-speaker review |
| `errorSummary.title` | Hari ikibazo | There is a problem | needs native-speaker review |
| `field.optional` | (si ngombwa) | (optional) | needs native-speaker review |
| `field.errorPrefix` | Ikosa: | Error: | needs native-speaker review |
| `password.show` | Erekana | Show | needs native-speaker review |
| `password.hide` | Hisha | Hide | needs native-speaker review |
| `password.showLabel` | Erekana ijambo ry’ibanga | Show password | needs native-speaker review |
| `password.hideLabel` | Hisha ijambo ry’ibanga | Hide password | needs native-speaker review |
| `language.label` | Ururimi | Language | needs native-speaker review |
| `language.names.rw` | Ikinyarwanda | Ikinyarwanda | needs native-speaker review |
| `language.names.en` | English | English | needs native-speaker review |
| `language.names.fr` | Français | Français | needs native-speaker review |
| `theme.label` | Imigaragarire | Theme | needs native-speaker review |
| `theme.light` | Urumuri | Light | needs native-speaker review |
| `theme.dark` | Umwijima | Dark | needs native-speaker review |
| `theme.system` | Nk’igikoresho | System | needs native-speaker review |
| `logo.alt` | MediLink Rwanda | MediLink Rwanda | needs native-speaker review |
| `alert.info` | Amakuru: | Information: | needs native-speaker review |
| `alert.success` | Byagenze neza: | Success: | needs native-speaker review |
| `alert.warning` | Icyitonderwa: | Warning: | needs native-speaker review |
| `alert.danger` | Ikosa: | Error: | needs native-speaker review |
| `textSize.label` | Ingano y’inyandiko | Text size | needs native-speaker review |
| `textSize.normal` | Isanzwe | Normal | needs native-speaker review |
| `textSize.large` | Nini | Large | needs native-speaker review |
| `textSize.xlarge` | Nini cyane | Extra large | needs native-speaker review |

## Staff app

File: `apps/staff-web/src/i18n/locales/rw.json`

| Key | Kinyarwanda (draft) | English source | Status |
|---|---|---|---|
| `app.name` | MediLink Abakozi | MediLink Staff | needs native-speaker review |
| `app.titleSuffix` | MediLink Abakozi | MediLink Staff | needs native-speaker review |
| `common.back` | Subira inyuma | Back | needs native-speaker review |
| `common.continue` | Komeza | Continue | needs native-speaker review |
| `common.retry` | Ongera ugerageze | Try again | needs native-speaker review |
| `common.logout` | Sohoka | Log out | needs native-speaker review |
| `common.copy` | Koporora | Copy | needs native-speaker review |
| `common.copied` | Byakoporowe | Copied | needs native-speaker review |
| `errors.generic` | Hari ikitagenze neza. Ongera ugerageze. | Something went wrong. Try again. | needs native-speaker review |
| `errors.network` | Ntitwashoboye kugera kuri MediLink. Reba niba murandasi ikora, wongere ugerageze. | We could not reach MediLink. Check your connection and try again. | needs native-speaker review |
| `errors.rateLimited` | Wagerageje inshuro nyinshi. Tegereza amasegonda {{seconds}}, wongere ugerageze. | Too many attempts. Wait {{seconds}} seconds, then try again. | needs native-speaker review |
| `errors.rateLimitedNoTime` | Wagerageje inshuro nyinshi. Tegereza umunota umwe, wongere ugerageze. | Too many attempts. Wait a minute, then try again. | needs native-speaker review |
| `errors.sessionExpired` | Igihe cyawe cyarangiye. Ongera winjire kugira ngo ukomeze. | Your session ended. Log in again to continue. | needs native-speaker review |
| `errors.loadFailed` | Ntitwashoboye gufungura konti yawe. | We could not load your account. | needs native-speaker review |
| `validation.emailRequired` | Andika imeyili yawe | Enter your email address | needs native-speaker review |
| `validation.emailInvalid` | Andika imeyili yanditse neza, urugero: izina@example.rw | Enter an email address in the correct format, like name@example.rw | needs native-speaker review |
| `validation.passwordRequired` | Andika ijambo ry’ibanga | Enter your password | needs native-speaker review |
| `validation.newPasswordLength` | Koresha nibura inyuguti 12 | Use at least 12 characters | needs native-speaker review |
| `validation.codeRequired` | Andika kode y’imibare 6 iri muri porogaramu yawe yo kwemeza | Enter the 6-digit code from your authenticator app | needs native-speaker review |
| `validation.codeFormat` | Kode igomba kuba imibare 6 | The code must be 6 digits | needs native-speaker review |
| `validation.recoveryCodeRequired` | Andika imwe muri kode zawe zo kugarura konti | Enter one of your recovery codes | needs native-speaker review |
| `validation.recoveryCodesSaved` | Emeza ko wabitse kode zawe zo kugarura konti | Confirm that you saved your recovery codes | needs native-speaker review |
| `brand.tagline` | Buri ruzinduko, ku gihe. | Every visit, on time. | needs native-speaker review |
| `brand.description` | Kwakira abarwayi, kwisuzumisha, farumasi no kwishyura mu kigo cyawe, ahantu hamwe hatuje. | Reception, consultations, pharmacy and billing for your facility, in one calm workspace. | needs native-speaker review |
| `brand.trust` | Byarinzwe · Amakuru abikwa mu Rwanda | Encrypted · Data stays in Rwanda | needs native-speaker review |
| `login.title` | Injira muri MediLink | Log in to MediLink | needs native-speaker review |
| `login.intro` | Ku bakozi b’ibigo by’ubuvuzi byemejwe. | For staff of verified health facilities. | needs native-speaker review |
| `login.email` | Imeyili | Email | needs native-speaker review |
| `login.password` | Ijambo ry’ibanga | Password | needs native-speaker review |
| `login.forgot` | Wibagiwe ijambo ry’ibanga? | Forgot password? | needs native-speaker review |
| `login.submit` | Injira | Log in | needs native-speaker review |
| `login.invalidCredentials` | Imeyili cyangwa ijambo ry’ibanga si byo. Bisuzume wongere ugerageze. | The email or password is not right. Check them and try again. | needs native-speaker review |
| `login.patientHint` | Urashaka kwivuza? Abarwayi bakoresha porogaramu ya MediLink. | Looking for care? Patients use the MediLink app instead. | needs native-speaker review |
| `mfaSetup.title` | Shyiraho kwinjira mu ntambwe ebyiri | Set up two-step login | needs native-speaker review |
| `mfaSetup.intro` | Konti z’abakozi zisaba intambwe ya kabiri mu kwinjira kugira ngo amakuru y’abarwayi arindwe. | Staff accounts need a second step at login to protect patient data. | needs native-speaker review |
| `mfaSetup.preparing` | Turimo gutegura… | Preparing your setup… | needs native-speaker review |
| `mfaSetup.setupFailed` | Ntitwashoboye gutangira. Ongera winjire. | We could not start the setup. Log in again. | needs native-speaker review |
| `mfaSetup.step1Title` | 1. Shyira porogaramu yo kwemeza muri telefoni | 1. Install an authenticator app | needs native-speaker review |
| `mfaSetup.step1Body` | Urugero Google Authenticator, Microsoft Authenticator cyangwa indi porogaramu ya TOTP, kuri telefoni ukoresha wenyine. | For example Google Authenticator, Microsoft Authenticator or another TOTP app, on a phone only you use. | needs native-speaker review |
| `mfaSetup.step2Title` | 2. Sikana iyi QR kode ukoresheje iyo porogaramu | 2. Scan this QR code with the app | needs native-speaker review |
| `mfaSetup.qrLabel` | QR kode yo kongera konti yawe ya MediLink muri porogaramu yo kwemeza | QR code to add your MediLink account to an authenticator app | needs native-speaker review |
| `mfaSetup.manualKeyLabel` | Ntushoboye gusikana? Andika uru rufunguzo muri porogaramu | Can’t scan? Enter this key in the app | needs native-speaker review |
| `mfaSetup.copyKey` | Koporora urufunguzo | Copy key | needs native-speaker review |
| `mfaSetup.step3Title` | 3. Andika kode y’imibare 6 porogaramu ikwereka | 3. Enter the 6-digit code the app shows | needs native-speaker review |
| `mfaSetup.code` | Kode y’imibare 6 | 6-digit code | needs native-speaker review |
| `mfaSetup.codeHint` | Kode ihinduka buri masegonda 30. | The code changes every 30 seconds. | needs native-speaker review |
| `mfaSetup.submit` | Emeza ukomeze | Confirm and continue | needs native-speaker review |
| `mfaSetup.codesTitle` | Bika kode zawe zo kugarura konti | Save your recovery codes | needs native-speaker review |
| `mfaSetup.codesIntro` | Niwatakaza telefoni, buri kode igufasha kwinjira rimwe. Zibike ahantu hizewe, kure ya telefoni yawe. Ntituzongera kuzikwereka. | If you lose your phone, each code lets you log in once. Keep them somewhere safe, away from your phone. We will not show them again. | needs native-speaker review |
| `mfaSetup.codesListLabel` | Kode zawe 10 zo kugarura konti | Your 10 recovery codes | needs native-speaker review |
| `mfaSetup.print` | Capa kode | Print codes | needs native-speaker review |
| `mfaSetup.copyCodes` | Koporora kode | Copy codes | needs native-speaker review |
| `mfaSetup.codesCopied` | Kode zakoporowe | Recovery codes copied | needs native-speaker review |
| `mfaSetup.savedConfirm` | Nabitse kode zanjye zo kugarura konti ahantu hizewe | I have saved my recovery codes in a safe place | needs native-speaker review |
| `mfaSetup.finish` | Komeza muri MediLink | Continue to MediLink | needs native-speaker review |
| `mfaSetup.printTitle` | Kode zo kugarura konti ya MediLink za {{email}} | MediLink recovery codes for {{email}} | needs native-speaker review |
| `mfaVerify.title` | Andika kode yo kwinjira | Enter your login code | needs native-speaker review |
| `mfaVerify.intro` | Fungura porogaramu yawe yo kwemeza, wandike kode y’imibare 6 ya MediLink. | Open your authenticator app and enter the 6-digit code for MediLink. | needs native-speaker review |
| `mfaVerify.code` | Kode y’imibare 6 | 6-digit code | needs native-speaker review |
| `mfaVerify.codeHint` | Shyiramo cyangwa wandike kode. Imyanya irimo nta kibazo. | Paste or type the code. Spaces are fine. | needs native-speaker review |
| `mfaVerify.submit` | Emeza winjire | Verify and log in | needs native-speaker review |
| `mfaVerify.useRecovery` | Koresha kode yo kugarura konti | Use a recovery code instead | needs native-speaker review |
| `mfaVerify.useApp` | Koresha kode iri muri porogaramu yanjye | Use the code from my app | needs native-speaker review |
| `mfaVerify.recoveryTitle` | Koresha kode yo kugarura konti | Use a recovery code | needs native-speaker review |
| `mfaVerify.recoveryIntro` | Andika imwe muri kode zo kugarura konti wabitse igihe washyiragaho kwinjira mu ntambwe ebyiri. | Enter one of the recovery codes you saved when you set up two-step login. | needs native-speaker review |
| `mfaVerify.recoveryCode` | Kode yo kugarura konti | Recovery code | needs native-speaker review |
| `mfaVerify.recoveryHint` | Urugero abcd-1234. Buri kode ikora rimwe gusa. | For example abcd-1234. Each code works once. | needs native-speaker review |
| `mfaVerify.backToLogin` | Subira ku kwinjira | Back to log in | needs native-speaker review |
| `facility.title` | Hitamo ikigo cyawe | Choose your facility | needs native-speaker review |
| `facility.intro` | Ukora mu bigo birenze kimwe. Hitamo aho ukorera ubu. Ushobora guhindura igihe icyo ari cyo cyose uhereye hejuru. | You work at more than one facility. Choose where you are working now. You can switch at any time from the top bar. | needs native-speaker review |
| `facility.choose` | Korera kuri {{name}} | Work at {{name}} | needs native-speaker review |
| `facility.rolesLabel` | Inshingano zawe | Your roles | needs native-speaker review |
| `facility.switcherLabel` | Ikigo urimo: {{name}}. Hindura ikigo | Current facility: {{name}}. Switch facility | needs native-speaker review |
| `facility.switchHeading` | Hindura ikigo | Switch facility | needs native-speaker review |
| `facility.current` | Ubu | Current | needs native-speaker review |
| `facility.switchFailed` | Ntitwashoboye guhindura ikigo. Ongera ugerageze. | We could not switch facility. Try again. | needs native-speaker review |
| `facility.noFacility` | Nta kigo cyatoranyijwe | No facility selected | needs native-speaker review |
| `facility.types.health_post` | Ivuriro ry’ibanze | Health post | needs native-speaker review |
| `facility.types.health_center` | Ikigo nderabuzima | Health center | needs native-speaker review |
| `facility.types.district_hospital` | Ibitaro by’akarere | District hospital | needs native-speaker review |
| `facility.types.provincial_hospital` | Ibitaro by’intara | Provincial hospital | needs native-speaker review |
| `facility.types.referral_hospital` | Ibitaro bikuru | Referral hospital | needs native-speaker review |
| `facility.types.private_clinic` | Ivuriro ryigenga | Private clinic | needs native-speaker review |
| `facility.types.polyclinic` | Polikilinike | Polyclinic | needs native-speaker review |
| `facility.types.private_hospital` | Ibitaro byigenga | Private hospital | needs native-speaker review |
| `facility.types.dental_clinic` | Ivuriro ry’amenyo | Dental clinic | needs native-speaker review |
| `facility.types.eye_clinic` | Ivuriro ry’amaso | Eye clinic | needs native-speaker review |
| `facility.types.diagnostic_center` | Ikigo cy’isuzuma | Diagnostic center | needs native-speaker review |
| `facility.types.other` | Ikigo cy’ubuvuzi | Health facility | needs native-speaker review |
| `facility.roles.facility_admin` | Umuyobozi w’ikigo | Facility admin | needs native-speaker review |
| `facility.roles.receptionist` | Ushinzwe kwakira abarwayi | Receptionist | needs native-speaker review |
| `facility.roles.doctor` | Muganga | Doctor | needs native-speaker review |
| `facility.roles.pharmacist` | Umufarumasiye | Pharmacist | needs native-speaker review |
| `shell.navLabel` | Menu nyamukuru | Main menu | needs native-speaker review |
| `shell.openMenu` | Fungura menu | Open menu | needs native-speaker review |
| `shell.closeMenu` | Funga menu | Close menu | needs native-speaker review |
| `shell.platformAdmin` | Umuyobozi w’urubuga | Platform admin | needs native-speaker review |
| `shell.nav.today` | Uyu munsi | Today | needs native-speaker review |
| `shell.nav.queue` | Umurongo | Queue | needs native-speaker review |
| `shell.nav.calendar` | Kalendari | Calendar | needs native-speaker review |
| `shell.nav.patients` | Abarwayi | Patients | needs native-speaker review |
| `shell.nav.pharmacy` | Farumasi | Pharmacy | needs native-speaker review |
| `shell.nav.payments` | Kwishyura | Payments | needs native-speaker review |
| `shell.nav.approvals` | Ibyemezo | Approvals | needs native-speaker review |
| `shell.nav.reports` | Raporo | Reports | needs native-speaker review |
| `shell.nav.staff` | Abakozi | Staff | needs native-speaker review |
| `shell.nav.settings` | Igenamiterere | Settings | needs native-speaker review |
| `shell.nav.audit` | Igitabo cy’ibikorwa | Audit log | needs native-speaker review |
| `shell.nav.platformFacilities` | Ubusabe bw’ibigo | Facility applications | needs native-speaker review |
| `shell.connection.label` | Murandasi | Connection | needs native-speaker review |
| `shell.connection.online` | Kuri murandasi | Online | needs native-speaker review |
| `shell.connection.offline` | Nta murandasi | Offline | needs native-speaker review |
| `shell.userMenu.label` | Menu ya konti | Account menu | needs native-speaker review |
| `shell.userMenu.signedInAs` | Winjiye nka | Signed in as | needs native-speaker review |
| `shell.userMenu.theme` | Imigaragarire | Theme | needs native-speaker review |
| `shell.userMenu.language` | Ururimi | Language | needs native-speaker review |
| `shell.userMenu.logout` | Sohoka | Log out | needs native-speaker review |
| `shell.userMenu.loggingOut` | Urasohoka… | Logging out… | needs native-speaker review |
| `shell.palette.title` | Shakisha cyangwa ujye kuri | Search or jump to | needs native-speaker review |
| `shell.palette.open` | Shakisha cyangwa ujye kuri… | Search or jump to… | needs native-speaker review |
| `shell.palette.placeholder` | Andika urupapuro, igikorwa cyangwa umurwayi | Type a page, an action or a patient | needs native-speaker review |
| `shell.palette.empty` | Nta kibonetse. Gerageza irindi jambo. | Nothing matches. Try another word. | needs native-speaker review |
| `shell.palette.hints` | ↑ ↓ kwimuka · Enter gufungura · Esc gufunga | ↑ ↓ to move · Enter to open · Esc to close | needs native-speaker review |
| `shell.palette.search` | Gushakisha | Search | needs native-speaker review |
| `shell.palette.actions` | Ibikorwa | Actions | needs native-speaker review |
| `shell.palette.pages` | Jya kuri | Go to | needs native-speaker review |
| `shell.palette.noResults` | Nta murwayi uhuye na byo kuri iki kigo | No match at this facility | needs native-speaker review |
| `shell.palette.searchFailed` | Gushakisha ntibyakunze. Ongera ugerageze. | The search did not work. Try again. | needs native-speaker review |
| `shell.palette.shortcut` | Ctrl K | Ctrl K | needs native-speaker review |
| `shell.collapse` | Gabanya menyu | Collapse menu | needs native-speaker review |
| `shell.expand` | Agura menyu | Expand menu | needs native-speaker review |
| `today.title` | Uyu munsi | Today | needs native-speaker review |
| `today.greeting` | Muraho, {{name}} | Hello, {{name}} | needs native-speaker review |
| `today.facility` | Ukorera kuri {{facility}}. | You are working at {{facility}}. | needs native-speaker review |
| `today.platform` | Winjiye nk’umuyobozi w’urubuga. | You are signed in as a platform admin. | needs native-speaker review |
| `today.rolesLabel` | Inshingano zawe hano | Your roles here | needs native-speaker review |
| `today.greeting_morning` | Mwaramutse, {{name}} | Good morning, {{name}} | needs native-speaker review |
| `today.greeting_afternoon` | Mwiriwe, {{name}} | Good afternoon, {{name}} | needs native-speaker review |
| `today.greeting_evening` | Muraho, {{name}} | Good evening, {{name}} | needs native-speaker review |
| `today.quickActions` | Ibikorwa byihuse | Quick actions | needs native-speaker review |
| `placeholder.title` | {{section}} | {{section}} | needs native-speaker review |
| `placeholder.body` | Iki gice kizakorwa mu cyiciro gikurikira. | This workspace is planned for a later sprint. | needs native-speaker review |
| `placeholder.back` | Subira ku Uyu munsi | Back to Today | needs native-speaker review |
| `placeholder.heading` | {{section}} biraje vuba | {{section}} is on its way | needs native-speaker review |
| `notFound.title` | Iyi paji ntibonetse | Page not found | needs native-speaker review |
| `notFound.body` | Reba aderesi, cyangwa usubire kuri paji y’Uyu munsi. | Check the address, or go back to your Today page. | needs native-speaker review |
| `notFound.home` | Jya ku Uyu munsi | Go to Today | needs native-speaker review |
| `forgot.title` | Hindura ijambo ry’ibanga | Reset your password | needs native-speaker review |
| `forgot.intro` | Andika imeyili y’akazi. Niba ifite konti, tuzakoherereza ihuriro ryo gushyiraho ijambo ry’ibanga rishya. | Enter your work email. If it belongs to an account, we will send a link to set a new password. | needs native-speaker review |
| `forgot.email` | Imeyili | Email | needs native-speaker review |
| `forgot.submit` | Ohereza ihuriro | Send reset link | needs native-speaker review |
| `forgot.sentTitle` | Reba imeyili yawe | Check your email | needs native-speaker review |
| `forgot.sentBody` | Niba hari konti ya {{email}}, ihuriro ryo guhindura riroherejwe. Rikora iminota 30. | If an account exists for {{email}}, a reset link is on its way. The link works for 30 minutes. | needs native-speaker review |
| `forgot.back` | Subira ku kwinjira | Back to log in | needs native-speaker review |
| `reset.title` | Shyiraho ijambo ry’ibanga rishya | Set a new password | needs native-speaker review |
| `reset.newPassword` | Ijambo ry’ibanga rishya | New password | needs native-speaker review |
| `reset.hint` | Nibura inyuguti 12. Interuro ngufi yoroshye kwibuka kandi igoye gukeka. | At least 12 characters. A short phrase is easy to remember and hard to guess. | needs native-speaker review |
| `reset.submit` | Bika ijambo ry’ibanga rishya | Save new password | needs native-speaker review |
| `reset.doneTitle` | Ijambo ry’ibanga ryahinduwe | Password changed | needs native-speaker review |
| `reset.doneBody` | Ijambo ry’ibanga ryahinduwe kandi wasohowe ahantu hose. Injira ukoresheje ijambo ry’ibanga rishya. | Your password was changed and you were logged out everywhere. Log in with your new password. | needs native-speaker review |
| `reset.invalidLink` | Iri huriro ntiryuzuye. Ongera ufungure ihuriro riri muri imeyili, cyangwa usabe irindi. | This link is incomplete. Open the link from the email again, or ask for a new one. | needs native-speaker review |
| `reset.toLogin` | Jya ku kwinjira | Go to log in | needs native-speaker review |

## Patient app

File: `apps/patient-web/src/i18n/locales/rw.json`

| Key | Kinyarwanda (draft) | English source | Status |
|---|---|---|---|
| `app.name` | MediLink | MediLink | needs native-speaker review |
| `app.titleSuffix` | MediLink Rwanda | MediLink Rwanda | needs native-speaker review |
| `common.back` | Subira inyuma | Back | needs native-speaker review |
| `common.continue` | Komeza | Continue | needs native-speaker review |
| `common.retry` | Ongera ugerageze | Try again | needs native-speaker review |
| `common.logout` | Sohoka | Log out | needs native-speaker review |
| `common.loggingOut` | Urasohoka… | Logging out… | needs native-speaker review |
| `common.opensInNewTab` | (bifungukira mu idirishya rishya) | (opens in a new tab) | needs native-speaker review |
| `common.comingSoon` | Biraza vuba | Coming soon | needs native-speaker review |
| `errors.generic` | Hari ikitagenze neza. Ongera ugerageze. | Something went wrong. Try again. | needs native-speaker review |
| `errors.network` | Ntitwashoboye kugera kuri MediLink. Reba niba murandasi ikora, wongere ugerageze. | We could not reach MediLink. Check your connection and try again. | needs native-speaker review |
| `errors.rateLimited` | Wagerageje inshuro nyinshi. Tegereza amasegonda {{seconds}}, wongere ugerageze. | Too many attempts. Wait {{seconds}} seconds, then try again. | needs native-speaker review |
| `errors.rateLimitedNoTime` | Wagerageje inshuro nyinshi. Tegereza umunota umwe, wongere ugerageze. | Too many attempts. Wait a minute, then try again. | needs native-speaker review |
| `errors.sessionExpired` | Wasohowe. Ongera winjire kugira ngo ukomeze. | You were logged out. Log in again to continue. | needs native-speaker review |
| `errors.loadFailed` | Ntitwashoboye gufungura konti yawe. | We could not load your account. | needs native-speaker review |
| `validation.emailRequired` | Andika imeyili yawe | Enter your email address | needs native-speaker review |
| `validation.emailInvalid` | Andika imeyili yanditse neza, urugero: izina@example.rw | Enter an email address in the correct format, like name@example.rw | needs native-speaker review |
| `validation.passwordRequired` | Andika ijambo ry’ibanga | Enter your password | needs native-speaker review |
| `validation.passwordLength` | Koresha nibura inyuguti 15 | Use at least 15 characters | needs native-speaker review |
| `validation.nameRequired` | Andika amazina yawe | Enter your names | needs native-speaker review |
| `validation.termsRequired` | Emera amabwiriza yo gukoresha kugira ngo ufungure konti | Accept the terms of use to create an account | needs native-speaker review |
| `validation.privacyRequired` | Emera itangazo ry’ibanga kugira ngo ufungure konti | Accept the privacy notice to create an account | needs native-speaker review |
| `nav.label` | Ibikubiyemo | Main | needs native-speaker review |
| `nav.findCare` | Shaka ubuvuzi | Find care | needs native-speaker review |
| `nav.howItWorks` | Uko bikora | How it works | needs native-speaker review |
| `nav.forFacilities` | Ku bigo by’ubuvuzi | For facilities | needs native-speaker review |
| `nav.login` | Injira | Log in | needs native-speaker review |
| `nav.home` | Ahabanza | Home | needs native-speaker review |
| `landing.title` | Shaka ubuvuzi mu Rwanda | Find care in Rwanda | needs native-speaker review |
| `landing.heroTitle` | Menya mbere yo kugenda. | Know before you go. | needs native-speaker review |
| `landing.heroBody` | Shaka ikigo cy’ubuvuzi cyemera ubwishingizi bwawe, ufate igihe, maze uhagere igihe cyawe kigeze. | Find a health facility that accepts your insurance, book, and arrive when it is your turn. | needs native-speaker review |
| `landing.search.title` | Shaka ubuvuzi | Find care | needs native-speaker review |
| `landing.search.service` | Ukeneye iki? | What do you need? | needs native-speaker review |
| `landing.search.serviceAny` | Serivisi zose | Any service | needs native-speaker review |
| `landing.search.location` | Hehe? | Where? | needs native-speaker review |
| `landing.search.locationAny` | Ahantu hose mu Rwanda | Anywhere in Rwanda | needs native-speaker review |
| `landing.search.insurance` | Ubwishingizi bwawe | Your insurance | needs native-speaker review |
| `landing.search.insuranceAny` | Ubwishingizi bwose | Any insurance | needs native-speaker review |
| `landing.search.submit` | Shakisha | Search | needs native-speaker review |
| `landing.search.popular` | Bikunzwe | Popular | needs native-speaker review |
| `landing.services.general` | Kwisuzumisha muri rusange | General consultation | needs native-speaker review |
| `landing.services.pediatrics` | Ubuvuzi bw’abana | Pediatrics | needs native-speaker review |
| `landing.services.dental` | Ubuvuzi bw’amenyo | Dental care | needs native-speaker review |
| `landing.services.antenatal` | Kwipimisha utwite | Antenatal care | needs native-speaker review |
| `landing.services.eye` | Ubuvuzi bw’amaso | Eye care | needs native-speaker review |
| `landing.districts.gasabo` | Gasabo | Gasabo | needs native-speaker review |
| `landing.districts.kicukiro` | Kicukiro | Kicukiro | needs native-speaker review |
| `landing.districts.nyarugenge` | Nyarugenge | Nyarugenge | needs native-speaker review |
| `landing.districts.musanze` | Musanze | Musanze | needs native-speaker review |
| `landing.districts.huye` | Huye | Huye | needs native-speaker review |
| `landing.districts.rubavu` | Rubavu | Rubavu | needs native-speaker review |
| `landing.insurers.mutuelle` | Mituweli (Mutuelle de Santé) | Mutuelle de Santé (CBHI) | needs native-speaker review |
| `landing.insurers.rama` | RAMA (RSSB) | RAMA (RSSB) | needs native-speaker review |
| `landing.insurers.mmi` | MMI | MMI | needs native-speaker review |
| `landing.insurers.private` | Ubwishingizi bwigenga | Private insurance | needs native-speaker review |
| `landing.insurers.none` | Nta bwishingizi (ndiyishyurira) | No insurance (I pay) | needs native-speaker review |
| `landing.how.title` | Uko bikora | How it works | needs native-speaker review |
| `landing.how.step1Title` | Shaka | Find | needs native-speaker review |
| `landing.how.step1Body` | Shakisha ukurikije serivisi, aho uri n’ubwishingizi. Reba ibigo byemera ubwishingizi bwawe. | Search by service, place and insurance. See which facilities accept your insurance. | needs native-speaker review |
| `landing.how.step2Title` | Fata igihe cyangwa ujye ku murongo | Book or join the queue | needs native-speaker review |
| `landing.how.step2Body` | Hitamo isaha, cyangwa ujye ku murongo w’uyu munsi ukoresheje telefoni yawe. | Choose a time, or join today’s queue from your phone. | needs native-speaker review |
| `landing.how.step3Title` | Hagera ku gihe | Arrive on time | needs native-speaker review |
| `landing.how.step3Body` | Kurikirana umwanya wawe ku murongo. Tukubwira igihe cyo kuva mu rugo. | Follow your place in the queue. We tell you when to leave home. | needs native-speaker review |
| `landing.trust.title` | Amakuru yawe aguma mu Rwanda | Your data stays in Rwanda | needs native-speaker review |
| `landing.trust.body` | Amakuru yawe arinzwe, abikwa mu Rwanda, kandi asangizwa gusa ibigo bikuvura. | Your information is encrypted, stored in Rwanda, and shared only with the facilities that care for you. | needs native-speaker review |
| `landing.trust.points.rwanda.title` | Bibikwa mu Rwanda | Stored in Rwanda | needs native-speaker review |
| `landing.trust.points.rwanda.body` | Amakuru yawe ntasohoka mu gihugu. | Your information never leaves the country. | needs native-speaker review |
| `landing.trust.points.encrypted.title` | Birinzwe | Encrypted | needs native-speaker review |
| `landing.trust.points.encrypted.body` | Abakuvura gusa ni bo bafungura dosiye yawe, kandi ubona uwayifunguye. | Only the staff caring for you can open your record, and you see who did. | needs native-speaker review |
| `landing.trust.points.verified.title` | Ibigo byagenzuwe gusa | Verified facilities only | needs native-speaker review |
| `landing.trust.points.verified.body` | Buri kigo kigenzurwa hakurikijwe uruhushya rwa Minisiteri y’Ubuzima. | Every facility is checked against its Ministry of Health licence. | needs native-speaker review |
| `landing.facilities.title` | Ku bigo by’ubuvuzi | For health facilities | needs native-speaker review |
| `landing.facilities.body` | Cunga umurongo, amadosiye n’inyemezabwishyu ahantu hamwe, kandi abarwayi bakubone byoroshye. | Run your queue, records and billing in one place, and let patients find you. | needs native-speaker review |
| `landing.facilities.cta` | Andikisha ikigo cyawe | Register your facility | needs native-speaker review |
| `landing.tracker.title` | Tegerereza mu rugo, si mu nzira | Wait at home, not in the corridor | needs native-speaker review |
| `landing.tracker.body` | Nyuma yo gufata igihe cyangwa kujya ku murongo, telefoni yawe ikwereka umwanya wawe n’igihe cyo kuva mu rugo. Ikora no kuri interineti nke. | After you book or join the queue, your phone shows your place and when to leave. It keeps working on a weak network. | needs native-speaker review |
| `landing.tracker.points.ahead` | Umubare w’abakuri imbere, uhinduka ako kanya | How many people are ahead of you, updated live | needs native-speaker review |
| `landing.tracker.points.leave` | Igihe cyo kuva mu rugo, ukurikije urugendo rwawe | When to leave home, from your travel time | needs native-speaker review |
| `landing.tracker.points.called` | Ubutumwa busobanutse n’ijwi iyo ari wowe | A clear alert with sound when it is your turn | needs native-speaker review |
| `landing.tracker.mockFacility` | Kigali Clinic · Rusange | Kigali Clinic · General | needs native-speaker review |
| `landing.tracker.mockTicket` | Nimero ya tike yawe | Your ticket number | needs native-speaker review |
| `landing.tracker.mockAhead` | Abantu 4 bakuri imbere | 4 people ahead | needs native-speaker review |
| `landing.tracker.mockWait` | Hafi iminota 25–35 | About 25–35 min | needs native-speaker review |
| `landing.tracker.mockLeave` | Va mu rugo saa 09:20 | Leave home by 09:20 | needs native-speaker review |
| `landing.tracker.mockCheckIn` | Nahageze – kwiyandikisha | I’m here – check in | needs native-speaker review |
| `landing.tracker.caption` | Urugero rwo gukurikirana umurongo kuri telefoni: tike G-023, abantu 4 imbere, hafi iminota 25 kugeza 35. | Example of the queue tracker on a phone: ticket G-023, 4 people ahead, about 25 to 35 minutes. | needs native-speaker review |
| `landing.records.title` | Amadosiye yawe ahantu hamwe | Your records in one place | needs native-speaker review |
| `landing.records.body` | Ibyavuye mu kwivuza kwawe byose bigumana nawe, kuri wowe n’abo mu muryango witaho. | Everything from your visits stays with you, for you and the family members you care for. | needs native-speaker review |
| `landing.records.items.prescriptions.title` | Impapuro z’imiti | Prescriptions | needs native-speaker review |
| `landing.records.items.prescriptions.body` | Zerekane kuri farumasi iyo ari yo yose, n’ize ku rupapuro. | Show them at any pharmacy, even on paper. | needs native-speaker review |
| `landing.records.items.receipts.title` | Inyemezabwishyu | Receipts | needs native-speaker review |
| `landing.records.items.receipts.body` | Ibyo wishyuye n’ibyo ubwishingizi bwishyuye. | What you paid and what insurance covered. | needs native-speaker review |
| `landing.records.items.notes.title` | Ibyemezo n’ibisubizo | Sick notes and results | needs native-speaker review |
| `landing.records.items.notes.body` | Byiteguye gusangizwa umukoresha cyangwa ishuri. | Ready to share with your employer or school. | needs native-speaker review |
| `landing.records.items.qr.title` | Bigenzurwa na QR | Checkable by QR | needs native-speaker review |
| `landing.records.items.qr.body` | Umuntu wese yagenzura ko inyandiko ari iy’ukuri atabonye amakuru y’ubuzima bwawe. | Anyone can check a document is real, without seeing your health data. | needs native-speaker review |
| `landing.faq.title` | Ibibazo | Questions | needs native-speaker review |
| `landing.faq.items.insurance.q` | Bikorana na Mutuelle de Santé? | Does it work with Mutuelle de Santé? | needs native-speaker review |
| `landing.faq.items.insurance.a` | Yego. Shakisha ukoresheje ubwishingizi bwawe urebe ibigo bubwemera n’ibyo uzishyura. | Yes. Search by your insurance to see which facilities accept it and what you will pay. | needs native-speaker review |
| `landing.faq.items.cost.q` | MediLink hari icyo yishyuza abarwayi? | Does MediLink cost anything for patients? | needs native-speaker review |
| `landing.faq.items.cost.a` | Oya. Gufata igihe, gukurikirana umurongo n’amadosiye yawe ni ubuntu ku barwayi. | No. Booking, the queue tracker and your records are free for patients. | needs native-speaker review |
| `landing.faq.items.privacy.q` | Ni nde ubona amakuru y’ubuzima bwanjye? | Who can see my health information? | needs native-speaker review |
| `landing.faq.items.privacy.a` | Abakuvura gusa. Ubona igihe cyose dosiye yawe yafunguwe. | Only the staff caring for you. You can see every time your record was opened. | needs native-speaker review |
| `landing.faq.items.smartphone.q` | Nta smartphone mfite. Nshobora kubikoresha? | I don’t have a smartphone. Can I still use it? | needs native-speaker review |
| `landing.faq.items.smartphone.a` | Yego. Baza ku kwakira: bakwandika bakaguha tike, kandi ugumana nimero yawe ya MediLink. | Yes. Ask at reception: they can register you and give you a ticket, and you keep your MediLink number. | needs native-speaker review |
| `emergency.title` | Ubutabazi bwihuse? | Emergency? | needs native-speaker review |
| `emergency.body` | Jya ku ishami ry’ubutabazi bwihuse rikwegereye cyangwa uhamagare 912. MediLink si iy’ubutabazi bwihuse. | Go to the nearest emergency department or call 912. MediLink is not for emergencies. | needs native-speaker review |
| `footer.label` | Amahuza y’urubuga | Site links | needs native-speaker review |
| `footer.privacy` | Itangazo ry’ibanga | Privacy notice | needs native-speaker review |
| `footer.terms` | Amabwiriza yo gukoresha | Terms of use | needs native-speaker review |
| `footer.verify` | Genzura inyandiko | Verify a document | needs native-speaker review |
| `footer.forFacilities` | Ku bigo by’ubuvuzi | For facilities | needs native-speaker review |
| `footer.help` | Ubufasha | Help | needs native-speaker review |
| `footer.copyright` | © {{year}} MediLink Rwanda | © {{year}} MediLink Rwanda | needs native-speaker review |
| `login.title` | Injira cyangwa ufungure konti | Log in or create an account | needs native-speaker review |
| `login.intro` | Fata igihe cyo kwivuza wirinde gutegereza igihe kirekire. | Book care and skip the long wait. | needs native-speaker review |
| `login.email` | Imeyili | Email | needs native-speaker review |
| `login.continue` | Komeza | Continue | needs native-speaker review |
| `login.passwordTitle` | Andika ijambo ry’ibanga | Enter your password | needs native-speaker review |
| `login.loggingInAs` | Winjira nka {{email}} | Logging in as {{email}} | needs native-speaker review |
| `login.changeEmail` | Hindura imeyili | Change email | needs native-speaker review |
| `login.password` | Ijambo ry’ibanga | Password | needs native-speaker review |
| `login.forgot` | Wibagiwe ijambo ry’ibanga? | Forgot password? | needs native-speaker review |
| `login.submit` | Injira | Log in | needs native-speaker review |
| `login.newHere` | Ni ubwa mbere ukoresha MediLink? | First time on MediLink? | needs native-speaker review |
| `login.createAccount` | Fungura konti ukoresheje iyi meyili | Create an account with this email | needs native-speaker review |
| `login.invalidCredentials` | Imeyili cyangwa ijambo ry’ibanga si byo. Bisuzume wongere ugerageze. | The email or password is not right. Check them and try again. | needs native-speaker review |
| `login.guest` | Shaka ubuvuzi nta konti | Find care without an account | needs native-speaker review |
| `signup.title` | Fungura konti yawe | Create your account | needs native-speaker review |
| `signup.intro` | Bifata nk’umunota umwe. Ubwishingizi n’abagize umuryango wabyongeraho nyuma. | It takes about a minute. You can add insurance and family members later. | needs native-speaker review |
| `signup.step` | Intambwe ya {{current}} kuri {{total}} | Step {{current}} of {{total}} | needs native-speaker review |
| `signup.fullName` | Amazina yawe | Your names | needs native-speaker review |
| `signup.fullNameHint` | Nk’uko yanditse ku ndangamuntu yawe. | As written on your ID. | needs native-speaker review |
| `signup.email` | Imeyili | Email | needs native-speaker review |
| `signup.password` | Ijambo ry’ibanga | Password | needs native-speaker review |
| `signup.passwordHint` | Koresha nibura inyuguti 15. Interuro ngufi yoroshye kwibuka kandi igoye gukeka. | Use at least 15 characters. A short sentence is easy to remember and hard to guess. | needs native-speaker review |
| `signup.passwordRule` | Nibura inyuguti 15 | At least 15 characters | needs native-speaker review |
| `signup.passwordRuleMet` | byuzuye | done | needs native-speaker review |
| `signup.passwordRuleNotMet` | ntibiruzura | not yet | needs native-speaker review |
| `signup.language` | Ururimi rw’ubutumwa | Language for messages | needs native-speaker review |
| `signup.languageHint` | Twohereza ubutumwa n’ibyibutsa muri uru rurimi. | We send reminders and messages in this language. | needs native-speaker review |
| `signup.continue` | Komeza | Continue | needs native-speaker review |
| `signup.consentTitle` | Ibanga ryawe n’uburenganzira utanga | Your privacy and consent | needs native-speaker review |
| `signup.consentIntro` | Mbere yo gufungura konti yawe, soma ibi: | Before we create your account, please read this: | needs native-speaker review |
| `signup.consentPoint1` | Amakuru y’ubuzima bwawe arinzwe kandi abikwa mu Rwanda. | Your health information is encrypted and stored in Rwanda. | needs native-speaker review |
| `signup.consentPoint2` | Ibigo bikuvura gusa ni byo bishobora kubona amadosiye yawe. | Only the facilities that care for you can see your records. | needs native-speaker review |
| `signup.consentPoint3` | Ushobora gukuramo amakuru yawe cyangwa gusiba konti yawe igihe icyo ari cyo cyose. | You can download your data or delete your account at any time. | needs native-speaker review |
| `signup.readPrivacy` | Soma itangazo ry’ibanga ryose | Read the full privacy notice | needs native-speaker review |
| `signup.readTerms` | Soma amabwiriza yo gukoresha | Read the terms of use | needs native-speaker review |
| `signup.terms` | Nemeye amabwiriza yo gukoresha | I accept the terms of use | needs native-speaker review |
| `signup.privacy` | Nasomye itangazo ry’ibanga kandi nemeye uko MediLink ikoresha amakuru yanjye | I have read the privacy notice and agree to how MediLink uses my information | needs native-speaker review |
| `signup.research` | Nemeye ko amakuru yanjye atagaragaza uwo ndi we yakoreshwa mu bushakashatsi ku buzima | I agree that my anonymised data may be used for health research | needs native-speaker review |
| `signup.researchHint` | Si ngombwa. Kwanga nta cyo bihindura ku buvuzi bwawe. Ushobora kubihindura nyuma. | Optional. Saying no changes nothing about your care. You can change this later. | needs native-speaker review |
| `signup.submit` | Fungura konti | Create account | needs native-speaker review |
| `signup.haveAccount` | Usanzwe ufite konti? | Already have an account? | needs native-speaker review |
| `signup.login` | Injira | Log in | needs native-speaker review |
| `home.title` | Ahabanza | Home | needs native-speaker review |
| `home.findCare` | Shaka ubuvuzi | Find care | needs native-speaker review |
| `home.nextVisitTitle` | Uruzinduko rwawe rukurikira | Your next visit | needs native-speaker review |
| `home.nextVisitEmpty` | Nta ruzinduko ruraba. Niwafata igihe cyangwa ukajya ku murongo, bizagaragara hano. | No visits yet. When you book or join a queue, it will show here. | needs native-speaker review |
| `home.verifyEmailTitle` | Emeza imeyili yawe | Confirm your email | needs native-speaker review |
| `home.verifyEmailBody` | Twohereje ihuriro kuri {{email}}. Emeza imeyili yawe mbere yo kubona amadosiye y’ubuzima bwawe. | We sent a link to {{email}}. Confirm your email before you can see your health records. | needs native-speaker review |
| `home.greeting_morning` | Mwaramutse, {{name}} | Good morning, {{name}} | needs native-speaker review |
| `home.greeting_afternoon` | Mwiriwe, {{name}} | Good afternoon, {{name}} | needs native-speaker review |
| `home.greeting_evening` | Mwiriwe, {{name}} | Good evening, {{name}} | needs native-speaker review |
| `home.findCareTitle` | Ukeneye kubonana na muganga? | Need to see a doctor? | needs native-speaker review |
| `home.findCareBody` | Jya ku murongo w’uyu munsi ku kigo gikoresha MediLink ukurikirane igihe cyawe uri hano, utegereze igihe gito mu cyumba cyo gutegereza. | Join today's queue at a MediLink facility and follow your turn from here, so you wait less in the waiting room. | needs native-speaker review |
| `home.notSure` | Ntubizi neza? Sobanura uko wiyumva | Not sure? Describe your symptoms | needs native-speaker review |
| `home.nextVisitEmptyTitle` | Nta gahunda iri imbere | No upcoming visits | needs native-speaker review |
| `home.shortcuts` | Inzira z’ihuse | Shortcuts | needs native-speaker review |
| `home.links.profile` | Umwirondoro n’ubwishingizi | My profile and insurance | needs native-speaker review |
| `home.links.family` | Abagize umuryango | Family members | needs native-speaker review |
| `home.links.privacy` | Ibanga n’abarebye dosiye yanjye | Privacy and who saw my records | needs native-speaker review |
| `home.links.settings` | Ingano y’inyandiko, ururimi n’ibara | Text size, language and theme | needs native-speaker review |
| `info.back` | Subira ahabanza | Back to the home page | needs native-speaker review |
| `info.verify.title` | Genzura inyandiko | Verify a document | needs native-speaker review |
| `info.verify.body` | Vuba aha, farumasi n’abakoresha bazashobora kugenzura hano urupapuro rwa muganga, inyemezabwishyu cyangwa icyemezo cy’uburwayi bakoresheje kode cyangwa QR. | Soon pharmacies and employers can check a prescription, receipt or sick note here with its code or QR. | needs native-speaker review |
| `info.forFacilities.title` | MediLink ku bigo by’ubuvuzi | MediLink for health facilities | needs native-speaker review |
| `info.forFacilities.body` | Kwiyandikisha kw’ibigo kuzatangira mu gice gikurikira. Muzashobora gusaba kuri interineti mugatangira nyuma yo kugenzurwa. | Facility registration opens in the next release. You will be able to apply online and go live after verification. | needs native-speaker review |
| `info.terms.title` | Amabwiriza yo gukoresha | Terms of use | needs native-speaker review |
| `info.terms.body` | Amabwiriza yose yo gukoresha azashyirwa hano mbere yo gutangira, mu Kinyarwanda, Icyongereza n’Igifaransa. | The full terms of use will be published here before launch, in Kinyarwanda, English and French. | needs native-speaker review |
| `info.privacy.title` | Itangazo ry’ibanga | Privacy notice | needs native-speaker review |
| `info.privacy.body` | Itangazo ry’ibanga ryose rizashyirwa hano mbere yo gutangira, mu Kinyarwanda, Icyongereza n’Igifaransa. | The full privacy notice will be published here before launch, in Kinyarwanda, English and French. | needs native-speaker review |
| `info.help.title` | Ubufasha | Help | needs native-speaker review |
| `info.help.body` | Inyobora z’abarwayi n’ababitaho ziraza. Nta telefoni igezweho ufite? Baza ku kwakira abarwayi. | Guides for patients and caregivers are coming. No smartphone? Ask at reception. | needs native-speaker review |
| `notFound.title` | Iyi paji ntibonetse | Page not found | needs native-speaker review |
| `notFound.body` | Reba aderesi, cyangwa usubire ahabanza. | Check the address, or go back to the home page. | needs native-speaker review |
| `notFound.home` | Jya ahabanza | Go to the home page | needs native-speaker review |
| `forgot.title` | Hindura ijambo ry’ibanga | Reset your password | needs native-speaker review |
| `forgot.intro` | Andika imeyili yawe. Niba ifite konti, tuzakoherereza ihuriro ryo gushyiraho ijambo ry’ibanga rishya. | Enter your email. If it belongs to an account, we will send a link to set a new password. | needs native-speaker review |
| `forgot.email` | Imeyili | Email | needs native-speaker review |
| `forgot.submit` | Ohereza ihuriro | Send reset link | needs native-speaker review |
| `forgot.sentTitle` | Reba imeyili yawe | Check your email | needs native-speaker review |
| `forgot.sentBody` | Niba hari konti ya {{email}}, ihuriro ryo guhindura riroherejwe. Rikora iminota 30. | If an account exists for {{email}}, a reset link is on its way. The link works for 30 minutes. | needs native-speaker review |
| `forgot.back` | Subira ku kwinjira | Back to log in | needs native-speaker review |
| `reset.title` | Shyiraho ijambo ry’ibanga rishya | Set a new password | needs native-speaker review |
| `reset.newPassword` | Ijambo ry’ibanga rishya | New password | needs native-speaker review |
| `reset.hint` | Nibura inyuguti 15. Interuro ngufi yoroshye kwibuka kandi igoye gukeka. | At least 15 characters. A short sentence is easy to remember and hard to guess. | needs native-speaker review |
| `reset.submit` | Bika ijambo ry’ibanga rishya | Save new password | needs native-speaker review |
| `reset.doneTitle` | Ijambo ry’ibanga ryahinduwe | Password changed | needs native-speaker review |
| `reset.doneBody` | Ijambo ry’ibanga ryahinduwe kandi wasohowe ahantu hose. Injira ukoresheje ijambo ry’ibanga rishya. | Your password was changed and you were logged out everywhere. Log in with your new password. | needs native-speaker review |
| `reset.invalidLink` | Iri huriro ntiryuzuye. Ongera ufungure ihuriro riri muri imeyili, cyangwa usabe irindi. | This link is incomplete. Open the link from the email again, or ask for a new one. | needs native-speaker review |
| `reset.toLogin` | Jya ku kwinjira | Go to log in | needs native-speaker review |
| `shell.nav` | Menyu nyamukuru | Main menu | needs native-speaker review |
| `shell.items.home` | Ahabanza | Home | needs native-speaker review |
| `shell.items.findCare` | Shaka ubuvuzi | Find care | needs native-speaker review |
| `shell.items.visits` | Gahunda zanjye | My visits | needs native-speaker review |
| `shell.items.help` | Ubufasha | Help | needs native-speaker review |
| `shell.offline` | Nta murandasi ufite. Urabona ibyabitswe bwa nyuma kuri iyi telefoni. | You're offline. You're seeing what was last saved on this phone. | needs native-speaker review |
| `shell.account.label` | Menyu ya konti ya {{name}} | Account menu for {{name}} | needs native-speaker review |
| `shell.account.signedIn` | Winjiye nka {{name}} | Signed in as {{name}} | needs native-speaker review |
| `shell.account.profile` | Umwirondoro wanjye | My profile | needs native-speaker review |
| `shell.account.family` | Umuryango | Family | needs native-speaker review |
| `shell.account.privacy` | Ibanga | Privacy | needs native-speaker review |
| `shell.account.settings` | Igenamiterere | Settings | needs native-speaker review |
| `findCare.title` | Shaka ubuvuzi | Find care | needs native-speaker review |
| `findCare.intro` | Uko wabonana na muganga ukoresheje MediLink uyu munsi. | How you can see a doctor with MediLink today. | needs native-speaker review |
| `findCare.walkIn.title` | Ngwino uyu munsi | Visit today | needs native-speaker review |
| `findCare.walkIn.body` | Jya ku kigo gikoresha MediLink mu masaha y’akazi. Ntukeneye gufata gahunda mbere. | Go to a MediLink facility during opening hours. You don't need an appointment. | needs native-speaker review |
| `findCare.walkIn.steps.reception` | Bwira abakira abarwayi izina ryawe cyangwa nimero ya MediLink. | Tell reception your name or MediLink number. | needs native-speaker review |
| `findCare.walkIn.steps.ticket` | Uhabwa nimero ya tike, urugero G-023. | You get a ticket number, for example G-023. | needs native-speaker review |
| `findCare.walkIn.steps.track` | Kurikirana igihe cyawe muri Gahunda zanjye. Tukumenyesha igihe ugiye kugerwaho. | Follow your turn on My visits. We tell you when you're next. | needs native-speaker review |
| `findCare.walkIn.note` | Tike yawe igaragara no kuri ecran yo mu cyumba cyo gutegereza. | Your ticket also shows on the screen in the waiting room. | needs native-speaker review |
| `findCare.book.title` | Fata gahunda | Book a time | needs native-speaker review |
| `findCare.book.body` | Hitamo ikigo, umunsi n’isaha, urebe n’uruhare rwawe ku kiguzi mbere yo gufata gahunda. | Choose a facility, a day and a time, and see your share of the cost before you book. | needs native-speaker review |
| `findCare.book.action` | Shaka ikigo | Find a facility | needs native-speaker review |
| `findCare.symptoms.title` | Ntuzi icyo ukeneye? | Not sure what you need? | needs native-speaker review |
| `findCare.symptoms.body` | Vuba uzashobora gusobanura uko wiyumva tukakwereka serivisi ikwiye. Ibi ntibizasimbura muganga. | Soon you can describe your symptoms and we'll suggest the right service. This will never replace a doctor. | needs native-speaker review |
| `support.title` | Ubufasha | Help | needs native-speaker review |
| `support.faqTitle` | Ibibazo bikunze kubazwa | Common questions | needs native-speaker review |
| `support.faq.ticket.q` | Nakurikirana nte igihe cyanjye? | How do I follow my turn? | needs native-speaker review |
| `support.faq.ticket.a` | Abakira abarwayi bamaze kukwandika, fungura Gahunda zanjye. Uhabona nimero ya tike, umubare w’abakuri imbere n’igihe uzategereza. Tukumenyesha igihe ugiye kugerwaho. | After reception checks you in, open My visits. Your ticket number, how many people are ahead and the expected wait are there. We tell you when you're next. | needs native-speaker review |
| `support.faq.family.q` | Nshobora gucunga gahunda z’umwana wanjye? | Can I manage my child's visits? | needs native-speaker review |
| `support.faq.family.a` | Yego. Ongeraho umwana wawe muri Umuryango. Uzajya uhinduranya ujya ku mwirondoro we hejuru kuri ecran. | Yes. Add your child under Family. You can then switch to their profile from the top of the screen. | needs native-speaker review |
| `support.faq.language.q` | Nahindura nte ururimi cyangwa nkongera ingano y’inyandiko? | How do I change the language or make the text bigger? | needs native-speaker review |
| `support.faq.language.a` | Fungura Igenamiterere muri menyu ya konti. Ushobora guhitamo Ikinyarwanda, Icyongereza cyangwa Igifaransa n’inyandiko nini. | Open Settings from the account menu. You can choose Kinyarwanda, English or French and a larger text size. | needs native-speaker review |
| `support.faq.data.q` | Ni nde ushobora kubona dosiye yanjye y’ubuzima? | Who can see my health records? | needs native-speaker review |
| `support.faq.data.a` | Abakozi b’ikigo kikuvura gusa. Buri gihe umuntu afunguye dosiye yawe birandikwa, kandi ushobora kubona urutonde muri Ibanga. | Only staff at a facility where you are being cared for. Every time someone opens your record it is logged, and you can see the list under Privacy. | needs native-speaker review |
| `support.deskTitle` | Baza abakira abarwayi | Ask at reception | needs native-speaker review |
| `support.deskBody` | Nta telefoni igezweho ufite cyangwa wagize ikibazo? Abakira abarwayi ku kigo cyose gikoresha MediLink bashobora kukwandika no gusubiza ibibazo byawe. | No smartphone, or stuck? Reception staff at any MediLink facility can check you in and answer questions. | needs native-speaker review |
| `support.reportTitle` | Tanga ikibazo | Report a problem | needs native-speaker review |
| `support.reportBody` | Vuba uzashobora gutangira hano ikibazo ku isura kwa muganga, ku kwishyura cyangwa ku nyandiko ukakurikirana. | Soon you can report a problem with a visit, a payment or a document here and follow what happens. | needs native-speaker review |
| `support.more` | Ubundi bufasha | More help | needs native-speaker review |
| `support.guides` | Amabwiriza y’abarwayi n’ababitaho | Guides for patients and caregivers | needs native-speaker review |
| `support.privacy` | Itangazo ry’ibanga | Privacy notice | needs native-speaker review |
| `support.terms` | Amabwiriza yo gukoresha | Terms of use | needs native-speaker review |
| `settings.title` | Igenamiterere | Settings | needs native-speaker review |
| `settings.intro` | Ibyo uhisemo bihita bikora kandi bibikwa kuri iki gikoresho. | These choices apply right away and are kept on this device. | needs native-speaker review |
| `settings.display` | Imigaragarire | Display | needs native-speaker review |
| `settings.textSizeHint` | Inyandiko nini zituma buri ecran isomeka byoroshye. Utubuto natwo turakura. | Larger text makes every screen easier to read. Buttons grow with it. | needs native-speaker review |
| `settings.travelTitle` | Igihe cy’urugendo | Travel time | needs native-speaker review |
| `settings.travelBody` | Iyo ufite tike, tubwire igihe bigutwara kugera ku kigo. Tukifashisha tukubwira igihe cyo kuva mu rugo. | When you have a ticket, tell us how long it takes you to reach the facility. We use it to tell you when to leave home. | needs native-speaker review |
| `settings.alertsTitle` | Imenyesha | Alerts | needs native-speaker review |
| `settings.alertsBody` | Vuba uzashobora guhitamo uko tukugeraho: kuri iyi telefoni, kuri SMS cyangwa kuri imeri. | Soon you can choose how we reach you: on this phone, by SMS or by email. | needs native-speaker review |

## staff-web feature: lock (namespace lock)

File: `apps/staff-web/src/features/lock/locales/rw.json`

| Key | Kinyarwanda (draft) | English source | Status |
|---|---|---|---|
| `close` | Funga | Close | needs native-speaker review |
| `cancel` | Reka | Cancel | needs native-speaker review |
| `lockNow` | Funga ubu | Lock now | needs native-speaker review |
| `menuLock` | Funga ecran | Lock screen | needs native-speaker review |
| `menuSecurity` | Umutekano | Security | needs native-speaker review |
| `warning.title` | Uracyahari? | Are you still there? | needs native-speaker review |
| `warning.body` | Kubera ibanga ry'abarwayi, ecran yawe irafunga mu masegonda {{seconds}}. | For patients' privacy, your screen locks in {{seconds}} seconds. | needs native-speaker review |
| `warning.stay` | Komeza winjiye | Stay signed in | needs native-speaker review |
| `screen.title` | Ecran irafunze | Screen locked | needs native-speaker review |
| `screen.who` | Winjiye nka {{name}} | Signed in as {{name}} | needs native-speaker review |
| `screen.pin` | PIN | PIN | needs native-speaker review |
| `screen.password` | Ijambo ry'ibanga | Password | needs native-speaker review |
| `screen.unlock` | Fungura | Unlock | needs native-speaker review |
| `screen.usePassword` | Koresha ijambo ry'ibanga | Use password instead | needs native-speaker review |
| `screen.usePin` | Koresha PIN | Use PIN instead | needs native-speaker review |
| `screen.switchUser` | Si wowe? Hindura ukoresha | Not you? Switch user | needs native-speaker review |
| `screen.pinRequired` | Andika PIN yawe. | Enter your PIN. | needs native-speaker review |
| `screen.passwordRequired` | Andika ijambo ry'ibanga. | Enter your password. | needs native-speaker review |
| `screen.attempts_one` | Hasigaye igerageza {{count}} mbere y'uko usohoka. | {{count}} attempt left before you are signed out. | needs native-speaker review |
| `screen.attempts_other` | Hasigaye amagerageza {{count}} mbere y'uko usohoka. | {{count}} attempts left before you are signed out. | needs native-speaker review |
| `stepUp.title` | Emeza ko ari wowe | Confirm it's you | needs native-speaker review |
| `stepUp.description` | Iki gikorwa gisaba ijambo ry'ibanga na kode iva muri porogaramu yawe y'umutekano. | This action needs your password and a code from your authenticator app. | needs native-speaker review |
| `stepUp.password` | Ijambo ry'ibanga | Password | needs native-speaker review |
| `stepUp.code` | Kode y'umutekano | Authenticator code | needs native-speaker review |
| `stepUp.codeHint` | Imibare 6 iva muri porogaramu yawe y'umutekano | 6 digits from your authenticator app | needs native-speaker review |
| `stepUp.confirm` | Emeza | Confirm | needs native-speaker review |
| `stepUp.required` | Andika ijambo ry'ibanga na kode. | Enter your password and the code. | needs native-speaker review |
| `security.title` | Umutekano | Security | needs native-speaker review |
| `security.pinTitle` | PIN yo gufungura | Unlock PIN | needs native-speaker review |
| `security.pinIsSet` | Ufite PIN. Yikoreshe ufungure ecran vuba. | You have a PIN. Use it to unlock your screen quickly. | needs native-speaker review |
| `security.pinNotSet` | Shyiraho PIN y'imibare 4 kugeza kuri 6 kugira ngo ufungure ecran vuba. Ijambo ry'ibanga rihora rikora. | Set a 4 to 6 digit PIN to unlock your screen quickly. Your password always works too. | needs native-speaker review |
| `security.pin` | PIN | PIN | needs native-speaker review |
| `security.newPin` | PIN nshya | New PIN | needs native-speaker review |
| `security.pinHint` | Imibare 4 kugeza kuri 6. Irinde imibare isubiramo cyangwa ikurikiranye nka 1234. | 4 to 6 digits. Avoid repeated digits and sequences such as 1234. | needs native-speaker review |
| `security.setPin` | Shyiraho PIN | Set PIN | needs native-speaker review |
| `security.changePin` | Hindura PIN | Change PIN | needs native-speaker review |
| `security.removePin` | Kuraho PIN | Remove PIN | needs native-speaker review |
| `security.pinFormat` | Koresha imibare 4 kugeza kuri 6. | Use 4 to 6 digits. | needs native-speaker review |
| `security.pinSaved` | PIN yawe yabitswe. | Your PIN is saved. | needs native-speaker review |
| `security.pinRemoved` | PIN yawe yakuweho. | Your PIN is removed. | needs native-speaker review |
| `security.lockTitle` | Gufunga ecran | Screen lock | needs native-speaker review |
| `security.lockBody` | Ecran yawe irafunga nyuma y'iminota {{minutes}} udakoresha. Yifunge ubwawe igihe ugiye. | Your screen locks after {{minutes}} minutes without activity. Lock it yourself when you step away. | needs native-speaker review |

## staff-web feature: patients (namespace patients)

File: `apps/staff-web/src/features/patients/locales/rw.json`

| Key | Kinyarwanda (draft) | English source | Status |
|---|---|---|---|
| `notFound` | Iyi paji ntibonetse | Page not found | needs native-speaker review |
| `nav.merges` | Ubusabe bwo guhuza | Merge requests | needs native-speaker review |
| `nav.platformMerges` | Guhuza abarwayi | Patient merges | needs native-speaker review |
| `close` | Funga | Close | needs native-speaker review |
| `cancel` | Reka | Cancel | needs native-speaker review |
| `save` | Bika | Save | needs native-speaker review |
| `required` | Ibi birakenewe. | This is required. | needs native-speaker review |
| `age_one` | Umwaka {{count}} | {{count}} year | needs native-speaker review |
| `age_other` | Imyaka {{count}} | {{count}} years | needs native-speaker review |
| `ageEstimated_one` | Hafi umwaka {{count}} | about {{count}} year | needs native-speaker review |
| `ageEstimated_other` | Hafi imyaka {{count}} | about {{count}} years | needs native-speaker review |
| `sex.female` | Gore | Female | needs native-speaker review |
| `sex.male` | Gabo | Male | needs native-speaker review |
| `sex.other` | Ikindi | Other | needs native-speaker review |
| `identifierKinds.national_id` | Indangamuntu | National ID | needs native-speaker review |
| `identifierKinds.passport` | Pasiporo | Passport | needs native-speaker review |
| `identifierKinds.refugee_id` | Ikarita y'impunzi | Refugee ID | needs native-speaker review |
| `identifierKinds.birth_certificate` | Icyemezo cy'amavuko | Birth certificate | needs native-speaker review |
| `insurers.mutuelle` | Mituweli | Mutuelle de Santé | needs native-speaker review |
| `insurers.rssb` | RSSB (RAMA) | RSSB (RAMA) | needs native-speaker review |
| `insurers.mmi` | MMI | MMI | needs native-speaker review |
| `insurers.radiant` | Radiant | Radiant | needs native-speaker review |
| `fields.name` | Amazina | Names | needs native-speaker review |
| `fields.age` | Imyaka | Age | needs native-speaker review |
| `fields.sex` | Igitsina | Sex | needs native-speaker review |
| `fields.dateOfBirth` | Itariki y'amavuko | Date of birth | needs native-speaker review |
| `fields.phone` | Telefoni | Phone | needs native-speaker review |
| `fields.newPhone` | Nimero nshya ya telefoni | New phone number | needs native-speaker review |
| `fields.email` | Imeyili | Email | needs native-speaker review |
| `fields.address` | Aderesi | Address | needs native-speaker review |
| `fields.nationalId` | Indangamuntu | National ID | needs native-speaker review |
| `fields.fileNumber` | Nomero ya dosiye | File no. | needs native-speaker review |
| `fields.medilinkNumber` | Nomero ya MediLink | MediLink number | needs native-speaker review |
| `fields.insurance` | Ubwishingizi | Insurance | needs native-speaker review |
| `fields.insurer` | Umwishingizi | Insurer | needs native-speaker review |
| `fields.memberNumber` | Nomero y'umunyamuryango | Member number | needs native-speaker review |
| `fields.document` | Icyangombwa | Identity document | needs native-speaker review |
| `fields.documentNumber` | Nomero y'icyangombwa | Document number | needs native-speaker review |
| `fields.country` | Igihugu cyagitanze | Issuing country | needs native-speaker review |
| `fields.preferredName` | Izina akunda | Preferred name | needs native-speaker review |
| `fields.emergencyContact` | Uwo guhamagara mu byihutirwa | Emergency contact | needs native-speaker review |
| `fields.notes` | Ibisobanuro by'iyakira | Reception notes | needs native-speaker review |
| `search.title` | Abarwayi | Patients | needs native-speaker review |
| `search.label` | Shakisha umurwayi | Find a patient | needs native-speaker review |
| `search.placeholder` | Izina, telefoni, indangamuntu, dosiye cyangwa nomero ya MediLink | Name, phone, national ID, file or MediLink number | needs native-speaker review |
| `search.types.medilink_number` | Nomero ya MediLink | MediLink no. | needs native-speaker review |
| `search.types.national_id` | Indangamuntu | National ID | needs native-speaker review |
| `search.types.phone` | Telefoni | Phone | needs native-speaker review |
| `search.types.file_number` | Nomero ya dosiye | File no. | needs native-speaker review |
| `search.types.name` | Izina | Name | needs native-speaker review |
| `search.resultCount_one` | Umurwayi {{count}} wabonetse | {{count}} patient found | needs native-speaker review |
| `search.resultCount_other` | Abarwayi {{count}} babonetse | {{count}} patients found | needs native-speaker review |
| `search.results` | Ibyavuye mu ishakisha | Search results | needs native-speaker review |
| `search.noResults` | Nta murwayi wo muri iki kigo uhuye n'ibi. Reba uko wanditse, cyangwa ushakishe ukoresheje telefoni cyangwa indangamuntu. | No patient at this facility matches. Check the spelling, or search by phone or ID. | needs native-speaker review |
| `search.register` | Andika umurwayi mushya | Register walk-in | needs native-speaker review |
| `search.shortcuts` | Kanda / ushakishe, na N wandike umurwayi mushya. | Press / to search and N for a new walk-in. | needs native-speaker review |
| `search.button` | Shakisha | Search | needs native-speaker review |
| `search.noResultsTitle` | Nta murwayi wabonetse | No patient found | needs native-speaker review |
| `external.title` | Asanzwe kuri MediLink | Already on MediLink | needs native-speaker review |
| `external.hint` | Uyu muntu yanditswe mu kindi kigo. Musabe nomero ye ya MediLink kugira ngo umwongere hano. | This person is registered at another facility. Ask for their MediLink number to add them here. | needs native-speaker review |
| `external.add` | Mwongere kuri iki kigo | Add to this facility | needs native-speaker review |
| `external.dialogTitle` | Ongera {{name}} kuri iki kigo | Add {{name}} to this facility | needs native-speaker review |
| `external.proofHint` | Emeza nomero ya MediLink iri ku ikarita cyangwa kuri telefoni y'umurwayi. | Confirm the MediLink number from the patient's card or phone. | needs native-speaker review |
| `register.title` | Andika umurwayi utabanje gufata gahunda | Register a walk-in | needs native-speaker review |
| `register.nameHint` | Amazina yose, nk'uko umurwayi ayavuga. | All names, as the patient says them. | needs native-speaker review |
| `register.ageMode` | Itariki y'amavuko cyangwa imyaka | Birth date or age | needs native-speaker review |
| `register.ageModes.dob` | Itariki y'amavuko | Date of birth | needs native-speaker review |
| `register.ageModes.years` | Imyaka | Age in years | needs native-speaker review |
| `register.ageModes.months` | Amezi | Age in months | needs native-speaker review |
| `register.phoneInvalid` | Andika nimero ya telefoni yo mu Rwanda nka 0788 123 456. | Enter a Rwandan mobile number like 0788 123 456. | needs native-speaker review |
| `register.noInsurance` | Nta bwishingizi | No insurance | needs native-speaker review |
| `register.more` | Ibindi bisobanuro (indangamuntu, dosiye) | More details (ID, file number) | needs native-speaker review |
| `register.less` | Ibisobanuro bike | Fewer details | needs native-speaker review |
| `register.countryHint` | Inyuguti ebyiri, urugero UG | Two letters, e.g. UG | needs native-speaker review |
| `register.consentScript` | Soma mu ijwi riranguruye: "MediLink ibika amakuru y'ubuzima bwawe kugira ngo ibigo ujyamo bigufashe. Abakozi bakuvura ni bo bonyine bayabona, kandi ushobora kureba uwayafunguye." | Read aloud: "MediLink keeps your health records so the facilities you visit can care for you. Only staff caring for you can see them, and you can see who opened them." | needs native-speaker review |
| `register.consent` | Umurwayi yemeye kuvurwa | The patient agreed to care consent | needs native-speaker review |
| `register.possibleDuplicate` | Uyu murwayi ashobora kuba asanzwe yanditswe hano. | This patient may already be registered here. | needs native-speaker review |
| `register.confirmNotDuplicate` | Nagenzuye abasa na we: ni undi muntu | I checked the matches: this is a different person | needs native-speaker review |
| `register.findThem` | Mushakire mu ishakisha | Find them in search | needs native-speaker review |
| `register.submit` | Andika | Register | needs native-speaker review |
| `register.suggestions` | Abashobora kuba ari we | Possible matches | needs native-speaker review |
| `register.suggestionsHint` | Abasa na we bagaragara hano iyo amazina n'imyaka, cyangwa telefoni, byujujwe. | Matches appear here once names and an age, or a phone number, are filled in. | needs native-speaker review |
| `register.noMatches` | Nta murwayi usa na we uri hano. | No similar patients here. | needs native-speaker review |
| `register.levels.exact_identifier` | Icyangombwa kimwe | Same document | needs native-speaker review |
| `register.levels.strong` | Birashoboka cyane ko ari we | Very likely the same person | needs native-speaker review |
| `register.levels.possible` | Ashobora kuba ari we | Possibly the same person | needs native-speaker review |
| `register.elsewhere_one` | Umurwayi {{count}} usa na we ari mu kindi kigo. Saba indangamuntu cyangwa nomero ya MediLink. | {{count}} similar patient at another facility. Ask for an ID or MediLink number. | needs native-speaker review |
| `register.elsewhere_other` | Abarwayi {{count}} basa na we bari mu bindi bigo. Saba indangamuntu cyangwa nomero ya MediLink. | {{count}} similar patients at other facilities. Ask for an ID or MediLink number. | needs native-speaker review |
| `register.strongHint` | Fungura uwo usa na we ugenzure mbere yo kongera kwandika. | Open the match to check before registering again. | needs native-speaker review |
| `register.done` | {{name}} yanditswe | {{name}} is registered | needs native-speaker review |
| `register.number` | Nomero ya MediLink: | MediLink number: | needs native-speaker review |
| `register.openRecord` | Fungura dosiye | Open record | needs native-speaker review |
| `register.another` | Andika undi | Register another | needs native-speaker review |
| `register.sections.person` | Umuntu | Person | needs native-speaker review |
| `register.sections.contact` | Aho abarizwa n'ubwishingizi | Contact and insurance | needs native-speaker review |
| `record.merged` | Yahujwe | Merged | needs native-speaker review |
| `record.staffMember` | Umukozi | Staff member | needs native-speaker review |
| `record.hasAccount` | Afite konti ya MediLink | Has a MediLink account | needs native-speaker review |
| `record.openSurvivor` | Iyi dosiye yahujwe. Fungura dosiye isigaye. | This record was merged. Open the remaining record. | needs native-speaker review |
| `record.sections` | Ibice bya dosiye y'umurwayi | Patient record sections | needs native-speaker review |
| `record.tabs.details` | Amakuru | Details | needs native-speaker review |
| `record.tabs.identifiers` | Ibyangombwa | Identifiers | needs native-speaker review |
| `record.tabs.insurance` | Ubwishingizi | Insurance | needs native-speaker review |
| `record.tabs.health` | Ubuzima | Health profile | needs native-speaker review |
| `record.tabs.consents` | Uruhushya | Consents | needs native-speaker review |
| `record.edit` | Hindura amakuru | Edit details | needs native-speaker review |
| `record.reportDuplicate` | Menyesha dosiye ebyiri | Report duplicate | needs native-speaker review |
| `reveal.show` | Erekana | Show | needs native-speaker review |
| `reveal.hide` | Hisha | Hide | needs native-speaker review |
| `reveal.showing` | Birerekanwa… | Showing… | needs native-speaker review |
| `reveal.description` | Agaciro kose kandikwa mu mateka y'abafunguye dosiye y'umurwayi hamwe n'impamvu yawe. | The full value is recorded in the patient's access history with your reason. | needs native-speaker review |
| `reveal.reason` | Impamvu | Reason | needs native-speaker review |
| `reveal.reasonText` | Sobanura impamvu | Explain the reason | needs native-speaker review |
| `reveal.reasons.identity_check` | Kugenzura umwirondoro | Identity check | needs native-speaker review |
| `reveal.reasons.insurance_claim` | Ubwishingizi | Insurance claim | needs native-speaker review |
| `reveal.reasons.patient_request` | Umurwayi yabisabye | The patient asked | needs native-speaker review |
| `reveal.reasons.other` | Ikindi | Other | needs native-speaker review |
| `reveal.titlePhone` | Erekana nimero ya telefoni | Show phone number | needs native-speaker review |
| `reveal.titleIdentifier` | Erekana icyangombwa | Show identity document | needs native-speaker review |
| `identifiers.none` | Nta cyangombwa kirandikwa. | No identity document yet. | needs native-speaker review |
| `identifiers.checked` | Cyagenzuwe | Checked | needs native-speaker review |
| `identifiers.add` | Ongeraho icyangombwa | Add a document | needs native-speaker review |
| `identifiers.seen` | Nabonye icyangombwa | I saw the document | needs native-speaker review |
| `insurance.status.unverified` | Ntiragenzurwa | Not checked | needs native-speaker review |
| `insurance.status.verified` | Yagenzuwe | Verified | needs native-speaker review |
| `insurance.status.rejected` | Yanzwe | Rejected | needs native-speaker review |
| `insurance.expired` | Yarangiye | Expired | needs native-speaker review |
| `insurance.inactive` | Ntikoreshwa | Not in use | needs native-speaker review |
| `insurance.none` | Nta karita y'ubwishingizi. | No insurance card. | needs native-speaker review |
| `insurance.lastVerified` | Yagenzuwe kuri {{facility}} ku wa {{date}} | Checked at {{facility}} on {{date}} | needs native-speaker review |
| `insurance.verify` | Emeza ko yagenzuwe | Mark verified | needs native-speaker review |
| `insurance.reject` | Yanga | Reject | needs native-speaker review |
| `insurance.rejectTitle` | Yanga iyi karita | Reject this card | needs native-speaker review |
| `insurance.rejectConsequences` | Ikarita izagaragara nk'iyanzwe kugeza yongeye kugenzurwa. | The card will show as rejected until someone checks it again. | needs native-speaker review |
| `insurance.reason` | Impamvu | Reason | needs native-speaker review |
| `insurance.add` | Ongeraho ikarita | Add a card | needs native-speaker review |
| `health.noKnownAllergies` | Nta allergie izwi | No known allergies | needs native-speaker review |
| `health.allergies` | Allergie | Allergies | needs native-speaker review |
| `health.conditions` | Indwara | Conditions | needs native-speaker review |
| `health.medications` | Imiti | Medicines | needs native-speaker review |
| `health.none` | Nta na kimwe cyanditswe. | None recorded. | needs native-speaker review |
| `health.status.unverified` | Ntiragenzurwa | Unverified | needs native-speaker review |
| `health.status.verified` | Yagenzuwe | Verified | needs native-speaker review |
| `health.status.refuted` | Yahakanywe | Refuted | needs native-speaker review |
| `health.confirm` | Emeza | Confirm | needs native-speaker review |
| `health.add.allergies` | Ongeraho allergie | Add an allergy | needs native-speaker review |
| `health.add.conditions` | Ongeraho indwara | Add a condition | needs native-speaker review |
| `health.add.medications` | Ongeraho umuti | Add a medicine | needs native-speaker review |
| `health.addButton` | Ongeraho | Add | needs native-speaker review |
| `consents.hasCare` | Uruhushya rwo kuvurwa rwanditswe. | Care consent recorded. | needs native-speaker review |
| `consents.noCare` | Nta ruhushya rwo kuvurwa ruranditswe. | No care consent yet. | needs native-speaker review |
| `consents.scriptRead` | Nasomye inyandiko y'uruhushya kandi umurwayi yarwemeye | I read the consent text and the patient agreed | needs native-speaker review |
| `consents.record` | Andika uruhushya | Record consent | needs native-speaker review |
| `claims.title` | Gusaba dosiye | Record claim | needs native-speaker review |
| `claims.hint` | Umurwayi arashaka guhuza iyi dosiye na konti ye ya MediLink. Banza ugenzure icyangombwa. | The patient wants to link this record to their MediLink account. Check an identity document first. | needs native-speaker review |
| `claims.reference` | Nomero y'ubusabe | Claim reference | needs native-speaker review |
| `claims.documentMatches` | Icyangombwa gihuye n'iyi dosiye | The identity document matches this record | needs native-speaker review |
| `claims.confirm` | Emeza ubusabe | Confirm claim | needs native-speaker review |
| `claims.done` | Dosiye ubu ihujwe na konti y'umurwayi. | The record is now linked to the patient's account. | needs native-speaker review |
| `merges.filter` | Shungura ukurikije uko bihagaze | Filter by status | needs native-speaker review |
| `merges.all` | Byose | All | needs native-speaker review |
| `merges.none` | Nta busabe bwo guhuza. | No merge requests. | needs native-speaker review |
| `merges.status.requested` | Birategereje | Waiting | needs native-speaker review |
| `merges.status.executed` | Byahujwe | Merged | needs native-speaker review |
| `merges.status.rejected` | Byanzwe | Rejected | needs native-speaker review |
| `merges.status.cancelled` | Byahagaritswe | Cancelled | needs native-speaker review |
| `merges.status.undone` | Byasubijwe inyuma | Undone | needs native-speaker review |
| `merges.scope.facility` | Iki kigo | This facility | needs native-speaker review |
| `merges.scope.cross_facility` | Ibigo byinshi | Several facilities | needs native-speaker review |
| `merges.scope.claim` | Gusaba dosiye | Claim | needs native-speaker review |
| `merges.escalated` | byoherejwe ku itsinda rya platform | sent to the platform team | needs native-speaker review |
| `merges.panelTitle` | Ubusabe bwo guhuza | Merge request | needs native-speaker review |
| `merges.surviving` | Igumaho | Keep | needs native-speaker review |
| `merges.merged` | Ihuzwa nayo | Merge into it | needs native-speaker review |
| `merges.preview.identifiers` | Ibyangombwa | Identity documents | needs native-speaker review |
| `merges.preview.insurance_profiles` | Amakarita y'ubwishingizi | Insurance cards | needs native-speaker review |
| `merges.preview.health_items` | Amakuru y'ubuzima | Health items | needs native-speaker review |
| `merges.preview.account_links` | Konti zihujwe | Account links | needs native-speaker review |
| `merges.preview.other_facilities` | Ibindi bigo | Other facilities | needs native-speaker review |
| `merges.conflicts` | Ibyangombwa bitandukanye by'ubwoko bumwe: {{kinds}}. Izi dosiye ntizishobora guhuzwa. | Different documents of the same kind: {{kinds}}. These records can't be merged. | needs native-speaker review |
| `merges.reason` | Impamvu | Reason | needs native-speaker review |
| `merges.approve` | Emeza uhuze | Approve and merge | needs native-speaker review |
| `merges.reject` | Yanga | Reject | needs native-speaker review |
| `merges.cancel` | Hagarika ubusabe | Cancel request | needs native-speaker review |
| `merges.escalate` | Ohereza ku itsinda rya platform | Send to platform team | needs native-speaker review |
| `merges.undo` | Subiza inyuma | Undo merge | needs native-speaker review |
| `merges.request` | Saba guhuza | Request merge | needs native-speaker review |
| `merges.requestHint` | Hitamo indi dosiye ya {{name}}. Undi muntu ni we uzafata icyemezo. | Choose the other record of {{name}}. Another approver decides. | needs native-speaker review |
| `merges.findOther` | Shakisha indi dosiye | Find the other record | needs native-speaker review |
| `merges.duplicateRecord` | Dosiye yikubye | Duplicate record | needs native-speaker review |
| `merges.confirm.approve.title` | Guhuza izi dosiye? | Merge these records? | needs native-speaker review |
| `merges.confirm.approve.consequences` | Ibyangombwa, ubwishingizi, amakuru y'ubuzima na nomero ya dosiye bijya kuri dosiye isigaye. Ushobora kubisubiza inyuma nyuma. | Documents, insurance, health items and the file number move to the kept record. You can undo it later. | needs native-speaker review |
| `merges.confirm.reject.title` | Kwanga ubu busabe? | Reject this request? | needs native-speaker review |
| `merges.confirm.reject.consequences` | Dosiye zikomeza gutandukana. | The records stay separate. | needs native-speaker review |
| `merges.confirm.cancel.title` | Guhagarika ubusabe bwawe? | Cancel your request? | needs native-speaker review |
| `merges.confirm.cancel.consequences` | Ubusabe burafungwa nta cyemezo gifashwe. | The request is closed without a decision. | needs native-speaker review |
| `merges.confirm.escalate.title` | Kohereza ku itsinda rya platform? | Send to the platform team? | needs native-speaker review |
| `merges.confirm.escalate.consequences` | Nta wundi hano ushobora kubwemeza, itsinda rya platform ni ryo rizafata icyemezo. | No one else here can approve it, so the platform team will decide. | needs native-speaker review |
| `merges.confirm.undo.title` | Gusubiza inyuma uku guhuza? | Undo this merge? | needs native-speaker review |
| `merges.confirm.undo.consequences` | Ibyimuwe bisubira muri dosiye za mbere, keretse niba byarahindutse. | Moved items go back to the original records, unless they changed since. | needs native-speaker review |
| `palette.searchFor` | Shakisha abarwayi “{{query}}” | Search patients for “{{query}}” | needs native-speaker review |
| `palette.results` | Abarwayi | Patients | needs native-speaker review |
| `palette.file` | Dosiye {{number}} | File {{number}} | needs native-speaker review |
| `picker.mode` | Shakisha cyangwa wandike umurwayi | Find or register the patient | needs native-speaker review |
| `picker.find` | Shakisha umurwayi | Find a patient | needs native-speaker review |
| `picker.new` | Umurwayi mushya | New patient | needs native-speaker review |
| `picker.noMatch` | Nta murwayi wabonetse. Mwandike nk’umurwayi mushya. | No patient found. Register them as a new patient. | needs native-speaker review |
| `picker.choose` | Hitamo | Choose | needs native-speaker review |

## staff-web feature: platform (namespace platform)

File: `apps/staff-web/src/features/platform/locales/rw.json`

| Key | Kinyarwanda (draft) | English source | Status |
|---|---|---|---|
| `notFound` | Paji ntiyabonetse | Page not found | needs native-speaker review |
| `nav.platformOverview` | Incamake ya sisitemu | Platform overview | needs native-speaker review |
| `nav.platformApplications` | Gusuzuma ubusabe | Review applications | needs native-speaker review |
| `nav.platformMasterData` | Amakuru shingiro | Master data | needs native-speaker review |
| `nav.platformFeatureFlags` | Imikorere | Feature flags | needs native-speaker review |
| `table.search` | Shakisha | Search | needs native-speaker review |
| `table.clearAll` | Siba byose | Clear all | needs native-speaker review |
| `table.removeFilter` | Kuraho akayunguruzo | Remove filter | needs native-speaker review |
| `table.results_one` | Igisubizo {{count}} | {{count}} result | needs native-speaker review |
| `table.results_other` | Ibisubizo {{count}} | {{count}} results | needs native-speaker review |
| `table.rowsPerPage` | Imirongo kuri paji | Rows per page | needs native-speaker review |
| `table.previous` | Ibibanza | Previous | needs native-speaker review |
| `table.next` | Ibikurikira | Next | needs native-speaker review |
| `table.page` | Paji {{page}} kuri {{pages}} | Page {{page}} of {{pages}} | needs native-speaker review |
| `table.density` | Uburebure bw'imirongo | Row height | needs native-speaker review |
| `table.compact` | Ngufi | Compact | needs native-speaker review |
| `table.default` | Isanzwe | Default | needs native-speaker review |
| `table.comfortable` | Ndende | Comfortable | needs native-speaker review |
| `table.open` | Fungura | Open | needs native-speaker review |
| `table.empty` | Nta {{noun}} biraboneka. | No {{noun}} yet. | needs native-speaker review |
| `table.noResults` | Nta kibonetse. Kuraho akayunguruzo cyangwa uhindure ibyo ushakisha. | Nothing matches these filters. Remove a filter or change the search. | needs native-speaker review |
| `table.error` | Ntibyashobotse gufunguka. Reba interineti wongere ugerageze. | We couldn't load this. Check your connection and try again. | needs native-speaker review |
| `table.retry` | Ongera ugerageze | Try again | needs native-speaker review |
| `status.application.draft` | Bitarangiye | Draft | needs native-speaker review |
| `status.application.submitted` | Byoherejwe | Submitted | needs native-speaker review |
| `status.application.under_review` | Birimo gusuzumwa | Under review | needs native-speaker review |
| `status.application.changes_requested` | Hasabwe impinduka | Changes requested | needs native-speaker review |
| `status.application.approved` | Byemewe | Approved | needs native-speaker review |
| `status.application.rejected` | Byanzwe | Rejected | needs native-speaker review |
| `status.facility.approved` | Cyemewe | Approved | needs native-speaker review |
| `status.facility.setup` | Gitegurwa | Setup | needs native-speaker review |
| `status.facility.live` | Kirakora | Live | needs native-speaker review |
| `status.facility.suspended` | Cyahagaritswe | Suspended | needs native-speaker review |
| `status.facility.deactivated` | Cyafunzwe | Deactivated | needs native-speaker review |
| `status.licence.valid` | Rurakora | Valid | needs native-speaker review |
| `status.licence.expiring` | Rugiye kurangira | Expiring | needs native-speaker review |
| `status.licence.expired` | Rwarangiye | Expired | needs native-speaker review |
| `status.licence.missing` | Ntiruhari | Missing | needs native-speaker review |
| `ownership.public` | Icya Leta | Public | needs native-speaker review |
| `ownership.private` | Icyigenga | Private | needs native-speaker review |
| `ownership.faith_based` | Icy'idini | Faith-based | needs native-speaker review |
| `ownership.ngo` | Umuryango utegamiye kuri Leta | NGO | needs native-speaker review |
| `documentKind.moh_licence` | Uruhushya rwa MINISANTE | MoH operating licence | needs native-speaker review |
| `documentKind.rdb_registration` | Icyemezo cya RDB | RDB registration | needs native-speaker review |
| `documentKind.tin_certificate` | Icyemezo cya TIN | TIN certificate | needs native-speaker review |
| `documentKind.accreditation` | Icyemezo cy'ubuziranenge | Accreditation | needs native-speaker review |
| `documentKind.insurer_contract` | Amasezerano n'ubwishingizi | Insurer contract | needs native-speaker review |
| `documentKind.other` | Indi nyandiko | Other document | needs native-speaker review |
| `overview.title` | Incamake ya sisitemu | Platform overview | needs native-speaker review |
| `overview.oldestTitle` | Ubutegereje igihe kirekire | Waiting longest | needs native-speaker review |
| `overview.oldest` | Hari ubusabe butegereje kuva ku wa {{date}}. Bufungure. | An application has been waiting since {{date}}. Open it. | needs native-speaker review |
| `overview.applications` | Ubusabe | Applications | needs native-speaker review |
| `overview.licences` | Impushya | Licences | needs native-speaker review |
| `overview.expiring60` | Zirangira mu minsi 60 | Expiring within 60 days | needs native-speaker review |
| `overview.expiring30` | Zirangira mu minsi 30 | Expiring within 30 days | needs native-speaker review |
| `overview.expired` | Zarangiye | Expired | needs native-speaker review |
| `overview.facilities` | Ibigo | Facilities | needs native-speaker review |
| `overview.network` | Ibigo by’ubuvuzi ku karere | Facilities by district | needs native-speaker review |
| `overview.networkEmpty` | Nta kigo kirabaho. Uturere tuzagaragara hano uko ubusabe bwemezwa. | No facilities yet. Districts appear here as applications are approved. | needs native-speaker review |
| `overview.facilityCount_one` | Ikigo {{count}} | {{count}} facility | needs native-speaker review |
| `overview.facilityCount_other` | Ibigo {{count}} | {{count}} facilities | needs native-speaker review |
| `applications.title` | Ubusabe bw'ibigo | Facility applications | needs native-speaker review |
| `applications.noun` | busabe | applications | needs native-speaker review |
| `applications.all` | Byose | All | needs native-speaker review |
| `applications.facility` | Ikigo | Facility | needs native-speaker review |
| `applications.status` | Aho bigeze | Status | needs native-speaker review |
| `applications.applicant` | Usaba | Applicant | needs native-speaker review |
| `applications.applicantEmail` | Imeyili y'usaba | Applicant's email | needs native-speaker review |
| `applications.submitted` | Byoherejwe | Submitted | needs native-speaker review |
| `applications.lastActivity` | Igikorwa giheruka | Last activity | needs native-speaker review |
| `applications.reviewer` | Usuzuma | Reviewer | needs native-speaker review |
| `applications.review` | Suzuma | Review | needs native-speaker review |
| `applications.back` | Subira ku busabe | Back to applications | needs native-speaker review |
| `applications.byPlatform` | Byakozwe na sisitemu | Created by the platform | needs native-speaker review |
| `applications.create` | Kora mu izina ry'ikigo | Create on behalf | needs native-speaker review |
| `applications.createHint` | Ku bigo byasabye kuri telefoni cyangwa imbonankubone. Babwuzuza bakoresheje link iboherezwa kuri imeyili. | For facilities that applied by phone or in person. They complete it with the emailed link. | needs native-speaker review |
| `applications.createSubmit` | Kora ubusabe | Create the application | needs native-speaker review |
| `applications.createRequired` | Andika izina ry'ikigo, izina ry'usaba n'imeyili yemewe. | Enter the facility name, the applicant's name and a valid email. | needs native-speaker review |
| `applications.sendLink` | Oherereza usaba link yo kubwuzuza | Email the applicant a link to complete it | needs native-speaker review |
| `review.start` | Tangira gusuzuma | Start review | needs native-speaker review |
| `review.requestChanges` | Saba impinduka | Request changes | needs native-speaker review |
| `review.requestChangesHint` | Andika igitekerezo kimwe kuri buri kintu usaba kigomba gukosora. Akibona ku gice kireba. | Write one comment per item the applicant must fix. They see them on the matching fields. | needs native-speaker review |
| `review.sendRequest` | Ohereza | Send the request | needs native-speaker review |
| `review.approve` | Emeza | Approve | needs native-speaker review |
| `review.reject` | Anga | Reject | needs native-speaker review |
| `review.acceptAllFirst` | Emera buri nyandiko mbere yo kwemeza. | Accept every document before approving. | needs native-speaker review |
| `review.details` | Ibisobanuro | Details | needs native-speaker review |
| `review.type` | Ubwoko | Type | needs native-speaker review |
| `review.ownership` | Nyir'ikigo | Ownership | needs native-speaker review |
| `review.organization` | Ikigo cyemewe n'amategeko | Organisation | needs native-speaker review |
| `review.contacts` | Aho babarizwa | Contacts | needs native-speaker review |
| `review.location` | Aho giherereye | Location | needs native-speaker review |
| `review.proposedAdmin` | Umuyobozi watanzwe | Proposed administrator | needs native-speaker review |
| `review.insurers` | Ubwishingizi bavuze | Insurers claimed | needs native-speaker review |
| `review.documents` | Inyandiko | Documents | needs native-speaker review |
| `review.noDocuments` | Nta nyandiko ziraboneka. | No documents yet. | needs native-speaker review |
| `review.expires` | rurangira ku wa {{date}} | expires {{date}} | needs native-speaker review |
| `review.view` | Reba | View | needs native-speaker review |
| `review.accept` | Emera | Accept | needs native-speaker review |
| `review.needsChange` | Ikeneye gukosorwa | Needs change | needs native-speaker review |
| `review.verdict.pending` | Ntiyasuzumwe | Not reviewed | needs native-speaker review |
| `review.verdict.accepted` | Yemewe | Accepted | needs native-speaker review |
| `review.verdict.needs_change` | Ikeneye gukosorwa | Needs change | needs native-speaker review |
| `review.duplicatesTitle` | Bishobora kuba byisubiramo | Possible duplicates | needs native-speaker review |
| `review.duplicate.same_licence_number` | Hari ubundi busabe cyangwa ikigo gifite nimero y'uruhushya imwe. | Another application or facility has the same licence number. | needs native-speaker review |
| `review.duplicate.same_applicant_email` | Usaba afite ubundi busabe butarangiye. | The applicant has another open application. | needs native-speaker review |
| `review.duplicate.same_name_in_district` | Hari ikigo gifite izina rimwe muri aka karere. | A facility with the same name exists in this district. | needs native-speaker review |
| `review.openOther` | Bufungure | Open it | needs native-speaker review |
| `review.notes` | Inyandiko z'imbere | Internal notes | needs native-speaker review |
| `review.notesHint` | Telefoni, gusura n'igenzura. Ntibigaragarira usaba. | Calls, visits and checks. Never shown to the applicant. | needs native-speaker review |
| `review.noNotes` | Nta nyandiko ziraboneka. | No notes yet. | needs native-speaker review |
| `review.noteType` | Ubwoko | Type | needs native-speaker review |
| `review.note` | Inyandiko | Note | needs native-speaker review |
| `review.addNote` | Ongeraho | Add note | needs native-speaker review |
| `review.noteKind.call` | Telefoni | Call | needs native-speaker review |
| `review.noteKind.visit` | Gusura | Visit | needs native-speaker review |
| `review.noteKind.document_check` | Kugenzura inyandiko | Document check | needs native-speaker review |
| `review.noteKind.other` | Ibindi | Other | needs native-speaker review |
| `review.history` | Amateka | History | needs native-speaker review |
| `review.event.status_change` | Aho bigeze byahindutse | Status changed | needs native-speaker review |
| `review.event.note` | Inyandiko | Note | needs native-speaker review |
| `review.event.item_comments` | Ibitekerezo | Comments | needs native-speaker review |
| `review.event.document_review` | Inyandiko yasuzumwe | Document reviewed | needs native-speaker review |
| `review.event.link_sent` | Link yoherejwe | Resume link sent | needs native-speaker review |
| `review.event.platform_edit` | Byahinduwe na sisitemu | Edited by the platform | needs native-speaker review |
| `review.actor.applicant` | Usaba | Applicant | needs native-speaker review |
| `review.actor.platform_admin` | Umuyobozi mukuru | Super admin | needs native-speaker review |
| `review.actor.system` | Sisitemu | System | needs native-speaker review |
| `review.generalComment` | Igitekerezo rusange | General comment | needs native-speaker review |
| `review.item` | Ikintu {{n}} | Item {{n}} | needs native-speaker review |
| `review.itemTarget` | Igikeneye guhinduka | What needs changing | needs native-speaker review |
| `review.itemComment` | Igitekerezo | Comment | needs native-speaker review |
| `review.addItem` | Ongeraho ikindi | Add another item | needs native-speaker review |
| `review.itemRequired` | Ongeraho nibura igitekerezo kimwe. | Add at least one comment. | needs native-speaker review |
| `review.target.facility.name` | Izina ry'ikigo | Facility name | needs native-speaker review |
| `review.target.facility.facility_type` | Ubwoko bw'ikigo | Type of facility | needs native-speaker review |
| `review.target.facility.ownership` | Nyir'ikigo | Ownership | needs native-speaker review |
| `review.target.facility.phone` | Telefoni y'ikigo | Facility phone | needs native-speaker review |
| `review.target.facility.email` | Imeyili y'ikigo | Facility email | needs native-speaker review |
| `review.target.location.village_code` | Umudugudu | Village | needs native-speaker review |
| `review.target.location.address` | Aderesi | Address | needs native-speaker review |
| `review.target.proposed_admin.name` | Amazina y'umuyobozi | Administrator's name | needs native-speaker review |
| `review.target.proposed_admin.email` | Imeyili y'umuyobozi | Administrator's email | needs native-speaker review |
| `review.target.documents.moh_licence` | Uruhushya rwa MINISANTE | MoH operating licence | needs native-speaker review |
| `review.target.documents.rdb_registration` | Icyemezo cya RDB | RDB registration | needs native-speaker review |
| `review.target.documents.tin_certificate` | Icyemezo cya TIN | TIN certificate | needs native-speaker review |
| `review.approveTitle` | Emeza iki kigo | Approve this facility | needs native-speaker review |
| `review.approveConsequences` | Ibi birema ikigo (kiri ku rwego Cyemewe) bikandika uruhushya rwacyo. Umuyobozi w'ikigo azatumirwa kugitegura. | This creates the organisation and the facility (status Approved) and records its licence. The facility administrator is invited to set it up. | needs native-speaker review |
| `review.approveRequired` | Andika aderesi, nimero y'uruhushya n'itariki rurangiriraho. | Enter the address, the licence number and its expiry date. | needs native-speaker review |
| `review.slug` | Aderesi kuri interineti | Web address | needs native-speaker review |
| `review.slugHint` | Inyuguti nto, imibare n'utuhuza, urugero clinique-ubuzima. | Lowercase letters, numbers and hyphens, e.g. clinique-ubuzima. | needs native-speaker review |
| `review.licenceNumber` | Nimero y'uruhushya rwa MINISANTE | MoH licence number | needs native-speaker review |
| `review.licenceExpiry` | Itariki uruhushya rurangiriraho | Licence expiry date | needs native-speaker review |
| `review.rejectTitle` | Anga ubu busabe | Reject this application | needs native-speaker review |
| `review.rejectConsequences` | Usaba amenyeshwa impamvu. Ntibisubirwaho; ashobora kongera gusaba. | The applicant is told the reason. This can't be undone; they can apply again. | needs native-speaker review |
| `reason.code` | Impamvu | Reason | needs native-speaker review |
| `reason.choose` | Hitamo impamvu… | Choose a reason… | needs native-speaker review |
| `reason.text` | Ibisobanuro | Explanation | needs native-speaker review |
| `reason.required` | Hitamo impamvu. | Choose a reason. | needs native-speaker review |
| `reason.textRequired` | Sobanura impamvu. | Explain the reason. | needs native-speaker review |
| `viewer.zoomIn` | Ongera ubunini | Zoom in | needs native-speaker review |
| `viewer.zoomOut` | Gabanya ubunini | Zoom out | needs native-speaker review |
| `viewer.rotate` | Hindukiza | Rotate | needs native-speaker review |
| `viewer.previousPage` | Paji ibanza | Previous page | needs native-speaker review |
| `viewer.nextPage` | Paji ikurikira | Next page | needs native-speaker review |
| `viewer.page` | Paji {{page}} kuri {{pages}} | Page {{page}} of {{pages}} | needs native-speaker review |
| `viewer.download` | Kuramo | Download | needs native-speaker review |
| `viewer.loading` | Inyandiko irafunguka… | Opening the document… | needs native-speaker review |
| `viewer.error` | Ntibyashobotse gufungura iyi nyandiko. | We couldn't open this document. | needs native-speaker review |
| `facilities.title` | Ibigo | Facilities | needs native-speaker review |
| `facilities.noun` | bigo | facilities | needs native-speaker review |
| `facilities.name` | Izina | Name | needs native-speaker review |
| `facilities.district` | Akarere | District | needs native-speaker review |
| `facilities.licence` | Uruhushya | Licence | needs native-speaker review |
| `facilities.nextExpiry` | Kurangira gukurikira | Next expiry | needs native-speaker review |
| `facilities.back` | Subira ku bigo | Back to facilities | needs native-speaker review |
| `facilities.address` | Aderesi kuri interineti | Web address | needs native-speaker review |
| `facilities.application` | Ubusabe | Application | needs native-speaker review |
| `facilities.confirmSlug` | Andika {{slug}} kugira ngo wemeze | Type {{slug}} to confirm | needs native-speaker review |
| `facilities.tabs.overview` | Incamake | Overview | needs native-speaker review |
| `facilities.tabs.licences` | Impushya | Licences | needs native-speaker review |
| `facilities.tabs.history` | Amateka | History | needs native-speaker review |
| `facilities.tabs.flags` | Imikorere | Feature flags | needs native-speaker review |
| `facilities.actions.start-setup` | Tangira gutegura | Start setup | needs native-speaker review |
| `facilities.actions.go-live` | Tangira gukora | Go live | needs native-speaker review |
| `facilities.actions.suspend` | Hagarika | Suspend | needs native-speaker review |
| `facilities.actions.reactivate` | Ongera ukoreshe | Reactivate | needs native-speaker review |
| `facilities.actions.deactivate` | Funga burundu | Deactivate | needs native-speaker review |
| `facilities.consequences.start-setup` | {{name}} kijya mu gutegurwa kugira ngo umuyobozi wacyo agitegure. | {{name}} moves to setup so its administrator can configure it. | needs native-speaker review |
| `facilities.consequences.go-live` | {{name}} kigaragarira abarwayi kandi cyakira gahunda. Gikeneye uruhushya rwa MINISANTE rukora. | {{name}} becomes visible to patients and accepts bookings. It needs a valid MoH licence. | needs native-speaker review |
| `facilities.consequences.suspend` | {{name}} kiva mu bushakashatsi kandi ntikigakira gahunda nshya. Akazi k'uyu munsi gakomeza. | {{name}} disappears from search and stops taking new bookings. Today's work continues. | needs native-speaker review |
| `facilities.consequences.reactivate` | {{name}} kongera kugaragara kandi cyakira gahunda. | {{name}} is visible again and accepts bookings. | needs native-speaker review |
| `facilities.consequences.deactivate` | {{name}} gisigara gisomwa gusa. Ni burundu. | {{name}} becomes read-only. This is final. | needs native-speaker review |
| `licences.add` | Ongeraho uruhushya | Add licence | needs native-speaker review |
| `licences.renew` | Vugurura | Renew | needs native-speaker review |
| `licences.correct` | Kosora | Correct | needs native-speaker review |
| `licences.save` | Bika | Save | needs native-speaker review |
| `licences.superseded` | rwavuguruwe | renewed | needs native-speaker review |
| `licences.kindLabel` | Ubwoko | Type | needs native-speaker review |
| `licences.kind.moh_operating` | Uruhushya rwa MINISANTE | MoH operating licence | needs native-speaker review |
| `licences.kind.pharmacy` | Uruhushya rwa farumasi | Pharmacy licence | needs native-speaker review |
| `licences.kind.rdb_registration` | Icyemezo cya RDB | RDB registration | needs native-speaker review |
| `licences.kind.accreditation` | Icyemezo cy'ubuziranenge | Accreditation | needs native-speaker review |
| `licences.kind.other` | Ibindi | Other | needs native-speaker review |
| `flags.title` | Imikorere | Feature flags | needs native-speaker review |
| `flags.intro` | Agaciro gasanzwe gakora ku bigo byose keretse ikigo gifite icyo cyihariye. | Defaults apply to every facility unless a facility has its own setting. | needs native-speaker review |
| `flags.names.security.pin_unlock` | Gufungura ukoresheje PIN | PIN unlock | needs native-speaker review |
| `flags.on` | Irakora | On | needs native-speaker review |
| `flags.off` | Ntikora | Off | needs native-speaker review |
| `flags.onByDefault` | Ikora bisanzwe | On by default | needs native-speaker review |
| `flags.offByDefault` | Ntikora bisanzwe | Off by default | needs native-speaker review |
| `flags.usingDefault` | Ikoresha agaciro gasanzwe ka sisitemu. | Uses the platform default. | needs native-speaker review |
| `flags.overridden` | Yashyiriweho iki kigo. | Set for this facility. | needs native-speaker review |
| `flags.useDefault` | Koresha agaciro gasanzwe | Use the default | needs native-speaker review |
| `flags.overrides_one` | Ikigo {{count}} gifite icyo cyihariye | {{count}} facility has its own setting | needs native-speaker review |
| `flags.overrides_other` | Ibigo {{count}} bifite icyo byihariye | {{count}} facilities have their own setting | needs native-speaker review |
| `masterData.title` | Amakuru shingiro | Master data | needs native-speaker review |
| `masterData.back` | Subira ku makuru shingiro | Back to master data | needs native-speaker review |
| `masterData.count_one` | Ikintu {{count}} | {{count}} item | needs native-speaker review |
| `masterData.count_other` | Ibintu {{count}} | {{count}} items | needs native-speaker review |
| `masterData.missingRw_one` | {{count}} kidafite Ikinyarwanda | {{count}} without Kinyarwanda | needs native-speaker review |
| `masterData.missingRw_other` | {{count}} bidafite Ikinyarwanda | {{count}} without Kinyarwanda | needs native-speaker review |
| `masterData.kinds.locations` | Ahantu | Locations | needs native-speaker review |
| `masterData.kinds.facility-types` | Ubwoko bw'ibigo | Facility types | needs native-speaker review |
| `masterData.kinds.service-catalogue-items` | Serivisi | Services | needs native-speaker review |
| `masterData.kinds.insurers` | Ubwishingizi | Insurers | needs native-speaker review |
| `masterData.kinds.drugs` | Imiti | Drugs | needs native-speaker review |
| `masterData.kinds.diagnosis-codes` | Kode z'indwara (ICD-10) | Diagnosis codes (ICD-10) | needs native-speaker review |
| `masterData.kinds.symptoms` | Ibimenyetso | Symptoms | needs native-speaker review |
| `masterData.kinds.public-holidays` | Iminsi y'ikiruhuko | Public holidays | needs native-speaker review |
| `masterData.kinds.reason-codes` | Kode z'impamvu | Reason codes | needs native-speaker review |
| `masterData.code` | Kode | Code | needs native-speaker review |
| `masterData.name` | Izina | Name | needs native-speaker review |
| `masterData.active` | Kirakoreshwa | Active | needs native-speaker review |
| `masterData.retired` | Cyakuweho | Retired | needs native-speaker review |
| `masterData.translations` | Indimi | Translations | needs native-speaker review |
| `masterData.missing` | Birabura: {{langs}} | Missing: {{langs}} | needs native-speaker review |
| `masterData.missingLanguage` | Ururimi rubura | Missing translation | needs native-speaker review |
| `masterData.add` | Ongeraho | Add | needs native-speaker review |
| `masterData.edit` | Hindura | Edit | needs native-speaker review |
| `masterData.retire` | Kuraho | Retire | needs native-speaker review |
| `masterData.restore` | Garura | Restore | needs native-speaker review |
| `masterData.immutable` | Ntibishobora guhindurwa nyuma yo kurema. | Can't be changed after creation. | needs native-speaker review |
| `masterData.history` | Amateka y'impinduka | Change history | needs native-speaker review |
| `masterData.action.create` | Byaremwe | Created | needs native-speaker review |
| `masterData.action.update` | Byahinduwe | Updated | needs native-speaker review |
| `masterData.action.retire` | Byakuweho | Retired | needs native-speaker review |
| `masterData.action.restore` | Byagaruwe | Restored | needs native-speaker review |
| `masterData.action.import` | Byinjijwe | Imported | needs native-speaker review |
| `masterData.action.unchanged` | Ntibyahindutse | Unchanged | needs native-speaker review |
| `masterData.fields.name_i18n` | Izina | Name | needs native-speaker review |
| `masterData.fields.title_i18n` | Umutwe | Title | needs native-speaker review |
| `masterData.fields.label_i18n` | Inyito | Label | needs native-speaker review |
| `masterData.fields.plain_language_i18n` | Izina ryumvikana | Plain-language name | needs native-speaker review |
| `masterData.fields.code` | Kode | Code | needs native-speaker review |
| `masterData.fields.name` | Izina | Name | needs native-speaker review |
| `masterData.fields.level` | Urwego | Level | needs native-speaker review |
| `masterData.fields.parent_code` | Kode y'ababyeyi | Parent code | needs native-speaker review |
| `masterData.fields.scheme` | Ubwoko bw'ubwishingizi | Scheme | needs native-speaker review |
| `masterData.fields.follows_referral_pathway` | Ikurikiza inzira yo kohereza abarwayi | Follows the referral pathway | needs native-speaker review |
| `masterData.fields.generic_name` | Izina rusange | Generic name | needs native-speaker review |
| `masterData.fields.strength` | Ingano | Strength | needs native-speaker review |
| `masterData.fields.form` | Ishusho | Form | needs native-speaker review |
| `masterData.fields.default_route` | Inzira isanzwe | Default route | needs native-speaker review |
| `masterData.fields.drug_class` | Icyiciro | Drug class | needs native-speaker review |
| `masterData.fields.is_controlled` | Umuti ugenzurwa | Controlled drug | needs native-speaker review |
| `masterData.fields.is_essential_list` | Uri ku rutonde rw'imiti y'ingenzi | On the essential medicines list | needs native-speaker review |
| `masterData.fields.max_usual_quantity` | Ingano ntarengwa isanzwe | Usual maximum quantity | needs native-speaker review |
| `masterData.fields.is_sensitive` | Indwara y'ibanga | Sensitive diagnosis | needs native-speaker review |
| `masterData.fields.body_system` | Igice cy'umubiri | Body system | needs native-speaker review |
| `masterData.fields.icd_code` | Kode ya ICD-10 | ICD-10 code | needs native-speaker review |
| `masterData.fields.holiday_date` | Itariki | Date | needs native-speaker review |
| `masterData.fields.is_provisional` | Itariki itaratangazwa | Date not yet announced | needs native-speaker review |
| `masterData.fields.kind` | Icyiciro | Kind | needs native-speaker review |
| `masterData.fields.requires_text` | Bisaba ibisobanuro | Needs an explanation | needs native-speaker review |
| `masterData.fields.level_of_care` | Urwego rw'ubuvuzi | Level of care | needs native-speaker review |
| `masterData.fields.min_age_months` | Imyaka ntoya (amezi) | Minimum age (months) | needs native-speaker review |
| `masterData.fields.max_age_months` | Imyaka nini (amezi) | Maximum age (months) | needs native-speaker review |
| `masterData.fields.sex_restriction` | Igitsina | Sex restriction | needs native-speaker review |
| `masterData.fields.code_system` | Uburyo bwa kode | Code system | needs native-speaker review |
| `masterData.import` | Injiza CSV | Import CSV | needs native-speaker review |
| `masterData.importHint` | Ohereza CSV ya UTF-8. Ubona impinduka mbere y'uko zikorwa. | Upload a UTF-8 CSV. You see a preview of the changes before anything is applied. | needs native-speaker review |
| `masterData.importTitle` | Igenzura ry'iyinjizwa | Import preview | needs native-speaker review |
| `masterData.mode` | Icyo gukorera imirongo isanzwe | What to do with existing rows | needs native-speaker review |
| `masterData.modes.upsert` | Ongeraho imirongo mishya, uvugurure isanzwe | Add new rows and update existing ones | needs native-speaker review |
| `masterData.modes.upsert_and_retire_missing` | Kandi ukureho imirongo idari muri dosiye | Also retire active rows that aren't in the file | needs native-speaker review |
| `masterData.csvFile` | Dosiye ya CSV | CSV file | needs native-speaker review |
| `masterData.csvHint` | CSV ya UTF-8, kugeza kuri MB 5. | UTF-8 CSV, up to 5 MB. | needs native-speaker review |
| `masterData.csvTooLarge` | Iyi dosiye irenze MB 5. | This file is larger than 5 MB. | needs native-speaker review |
| `masterData.csvType` | Ohereza dosiye ya .csv. | Upload a .csv file. | needs native-speaker review |
| `masterData.importStatus.validating` | Dosiye irimo kugenzurwa… | Checking the file… | needs native-speaker review |
| `masterData.importStatus.previewed` | Byiteguye gukoreshwa | Ready to apply | needs native-speaker review |
| `masterData.importStatus.invalid` | Dosiye ifite amakosa | The file has errors | needs native-speaker review |
| `masterData.importStatus.applying` | Birimo gukorwa… | Applying… | needs native-speaker review |
| `masterData.importStatus.applied` | Byakozwe | Applied | needs native-speaker review |
| `masterData.importStatus.failed` | Byanze | Failed | needs native-speaker review |
| `masterData.importStatus.expired` | Igenzura ryarashaje: ongera wohereze dosiye | Preview expired: upload the file again | needs native-speaker review |
| `masterData.summary.rows` | Imirongo | Rows | needs native-speaker review |
| `masterData.summary.create` | Mishya | New | needs native-speaker review |
| `masterData.summary.update` | Yahinduwe | Updated | needs native-speaker review |
| `masterData.summary.retire` | Yakuweho | Retired | needs native-speaker review |
| `masterData.summary.unchanged` | Itahindutse | Unchanged | needs native-speaker review |
| `masterData.summary.errors` | Amakosa | Errors | needs native-speaker review |
| `masterData.errorsTitle` | Kosora iyi mirongo wongere wohereze dosiye | Fix these lines and upload the file again | needs native-speaker review |
| `masterData.errorLine` | Umurongo {{line}} ({{field}}): {{message}} | Line {{line}} ({{field}}): {{message}} | needs native-speaker review |
| `masterData.samples` | Ingero z'impinduka | Examples of changes | needs native-speaker review |
| `masterData.confirm` | Kora impinduka | Apply the changes | needs native-speaker review |
| `upload.drop` | Kurura dosiye hano, cyangwa | Drag a file here, or | needs native-speaker review |
| `upload.browse` | Hitamo dosiye | Choose a file | needs native-speaker review |
| `upload.remove` | Kuraho | Remove | needs native-speaker review |
| `upload.uploading` | Biroherezwa… | Uploading… | needs native-speaker review |

## staff-web feature: queue (namespace queue)

File: `apps/staff-web/src/features/queue/locales/rw.json`

| Key | Kinyarwanda (draft) | English source | Status |
|---|---|---|---|
| `nav.reorders` | Igenzura ry’umurongo | Queue reviews | needs native-speaker review |
| `loading` | Umurongo urafunguka… | Loading the queue… | needs native-speaker review |
| `loadFailed` | Umurongo ntiwafungutse. Burongera kugerageza. | The queue could not load. It retries by itself. | needs native-speaker review |
| `failed` | Ntibyakunze. Reba interineti wongere ugerageze. | That did not work. Check your connection and try again. | needs native-speaker review |
| `close` | Funga | Close | needs native-speaker review |
| `cancel` | Reka | Cancel | needs native-speaker review |
| `confirm` | Emeza | Confirm | needs native-speaker review |
| `reason` | Impamvu | Reason | needs native-speaker review |
| `reasonText` | Sobanura | Explain | needs native-speaker review |
| `unknownService` | Serivisi | Service | needs native-speaker review |
| `age_one` | Umwaka {{count}} | {{count}} year | needs native-speaker review |
| `age_other` | Imyaka {{count}} | {{count}} years | needs native-speaker review |
| `minutes_one` | Iminota {{count}} | {{count}} min | needs native-speaker review |
| `minutes_other` | Iminota {{count}} | {{count}} min | needs native-speaker review |
| `minutesAgo_one` | Hashize iminota {{count}} | {{count}} min ago | needs native-speaker review |
| `minutesAgo_other` | Hashize iminota {{count}} | {{count}} min ago | needs native-speaker review |
| `sex.female` | Gore | Female | needs native-speaker review |
| `sex.male` | Gabo | Male | needs native-speaker review |
| `sex.other` | Ikindi | Other | needs native-speaker review |
| `states.waiting` | Arategereje | Waiting | needs native-speaker review |
| `states.called` | Yahamagawe | Called | needs native-speaker review |
| `states.in_service` | Ari kwa muganga | In consultation | needs native-speaker review |
| `states.no_response` | Ntiyitabye | No response | needs native-speaker review |
| `states.on_hold` | Ategereje ibisubizo | On hold | needs native-speaker review |
| `states.moved_to_next_stage` | Yakomeje | Moved on | needs native-speaker review |
| `states.transferred` | Yimuriwe | Transferred | needs native-speaker review |
| `states.cancelled` | Byahagaritswe | Cancelled | needs native-speaker review |
| `states.left_without_service` | Yagiye | Left | needs native-speaker review |
| `states.completed` | Byarangiye | Completed | needs native-speaker review |
| `stages.reception` | Kwakira | Reception | needs native-speaker review |
| `stages.payment` | Kwishyura | Payment | needs native-speaker review |
| `stages.consultation` | Kwa muganga | Consultation | needs native-speaker review |
| `stages.pharmacy` | Farumasi | Pharmacy | needs native-speaker review |
| `flags.emergency` | Byihutirwa | Emergency | needs native-speaker review |
| `flags.priority` | Yihutishwa | Priority | needs native-speaker review |
| `flags.return` | Avuye mu bizamini | Back from tests | needs native-speaker review |
| `flags.stepped_out` | Yasohotse gato | Stepped out | needs native-speaker review |
| `flags.no_response` | Ntiyitabye | Missed call | needs native-speaker review |
| `priority.elderly` | Umusaza/Umukecuru | Elderly | needs native-speaker review |
| `priority.pregnant` | Atwite | Pregnant | needs native-speaker review |
| `priority.disability` | Ufite ubumuga | Disability | needs native-speaker review |
| `priority.very_sick` | Arembye | Very sick | needs native-speaker review |
| `duty.on_duty` | Ari mu kazi | On duty | needs native-speaker review |
| `duty.break` | Ari mu kiruhuko | On break | needs native-speaker review |
| `duty.emergency` | Ari mu byihutirwa | At an emergency | needs native-speaker review |
| `duty.off` | Ntari mu kazi | Off duty | needs native-speaker review |
| `status.break` | Muganga ari mu kiruhuko | Doctor on break | needs native-speaker review |
| `status.emergency` | Muganga ari mu byihutirwa | Doctor at an emergency | needs native-speaker review |
| `status.none_on_duty` | Nta muganga uri mu kazi | No doctor on duty | needs native-speaker review |
| `reasons.clinical_urgency` | Bikeneye kwihutishwa | Clinical urgency | needs native-speaker review |
| `reasons.staff_error` | Gukosora ikosa | Correcting a mistake | needs native-speaker review |
| `reasons.patient_request` | Umurwayi yabisabye | Patient's request | needs native-speaker review |
| `reasons.patient_left` | Umurwayi yagiye | Patient left | needs native-speaker review |
| `reasons.duplicate` | Tike ebyiri | Duplicate ticket | needs native-speaker review |
| `reasons.patient_was_present` | Umurwayi yari ahari | The patient was here | needs native-speaker review |
| `reasons.facility_delay` | Gutinda kw’ivuriro | Delay at the facility | needs native-speaker review |
| `reasons.other` | Ibindi | Other | needs native-speaker review |
| `actions.check_in` | Yanditswe | Checked in | needs native-speaker review |
| `actions.call` | Yahamagawe | Called | needs native-speaker review |
| `actions.recall` | Yongeye guhamagarwa | Called again | needs native-speaker review |
| `actions.start` | Yatangiye kwa muganga | Consultation started | needs native-speaker review |
| `actions.no_response` | Ntiyitabye | No response | needs native-speaker review |
| `actions.hold` | Ategereje ibisubizo | On hold | needs native-speaker review |
| `actions.return` | Yagarutse ku murongo | Back in the queue | needs native-speaker review |
| `actions.complete` | Byarangiye | Completed | needs native-speaker review |
| `actions.next_stage` | Yakomeje ku ntambwe ikurikira | Moved to the next stage | needs native-speaker review |
| `actions.opened` | Tike nshya | New ticket | needs native-speaker review |
| `actions.transfer` | Yimuriwe | Transferred | needs native-speaker review |
| `actions.cancel` | Byahagaritswe | Cancelled | needs native-speaker review |
| `actions.left` | Yagiye | Left | needs native-speaker review |
| `actions.step_out` | Yasohotse gato | Stepped out | needs native-speaker review |
| `actions.step_out_expired` | Yagarutse | Back from stepping out | needs native-speaker review |
| `actions.priority` | Kwihutishwa byahinduwe | Priority changed | needs native-speaker review |
| `actions.reorder` | Yimuwe ku murongo | Moved in the queue | needs native-speaker review |
| `actions.end_of_day` | Byafunzwe umunsi urangiye | Closed at end of day | needs native-speaker review |
| `columns.ticket` | Tike | Ticket | needs native-speaker review |
| `columns.patient` | Umurwayi | Patient | needs native-speaker review |
| `columns.flags` | Ibimenyetso | Flags | needs native-speaker review |
| `columns.waiting` | Ategereje | Waiting | needs native-speaker review |
| `live.live` | Ako kanya · hashize amasegonda {{seconds}} | Live · {{seconds}} s ago | needs native-speaker review |
| `live.reconnecting` | Birongera guhuzwa | Reconnecting | needs native-speaker review |
| `live.offline_one` | Nta interineti · igikorwa {{count}} gitegereje | Offline · {{count}} action waiting | needs native-speaker review |
| `live.offline_other` | Nta interineti · ibikorwa {{count}} bitegereje | Offline · {{count}} actions waiting | needs native-speaker review |
| `board.title` | Umurongo | Queue | needs native-speaker review |
| `board.intro` | Abari hano bose, uko bazahamagarwa. Hitamo tike ngo ukore igikorwa. | Everyone on site, in calling order. Select a ticket for actions. | needs native-speaker review |
| `board.checkIn` | Andika umurwayi | Check in patient | needs native-speaker review |
| `board.services` | Serivisi | Services | needs native-speaker review |
| `board.allServices` | Serivisi zose | All services | needs native-speaker review |
| `board.nowServing` | Abari kwakirwa | Now serving | needs native-speaker review |
| `board.expected` | Abategerejwe | Expected | needs native-speaker review |
| `board.expectedEmptyTitle` | Nta gahunda zirahari | No bookings yet | needs native-speaker review |
| `board.expectedEmpty` | Abafashe gahunda y’uyu munsi bagaragara hano kugeza bageze. | Patients booked for today appear here until they arrive. | needs native-speaker review |
| `board.onSite` | Bari hano | On site | needs native-speaker review |
| `board.emptyTitle` | Nta wutegereje | Nobody is waiting | needs native-speaker review |
| `board.empty` | Andika umurwayi wa mbere w’uyu munsi. | Check in the first patient of the day. | needs native-speaker review |
| `board.nobodyWaiting` | Nta wutegereje hano. | Nobody waiting here. | needs native-speaker review |
| `board.waitingCount_one` | {{count}} arategereje | {{count}} waiting | needs native-speaker review |
| `board.waitingCount_other` | {{count}} barategereje | {{count}} waiting | needs native-speaker review |
| `board.newArrivalWait` | Ugeze ubu ategereza iminota {{min}}–{{max}} | New arrival waits {{min}}–{{max}} min | needs native-speaker review |
| `board.expectedCheckIn` | Andika ko yageze | Check in | needs native-speaker review |
| `board.expectedLate` | Yakererewe | Late | needs native-speaker review |
| `board.expectedAnyDoctor` | Muganga uwo ari we wese | Any doctor | needs native-speaker review |
| `board.expectedError` | Ntibyashobotse kubona gahunda z’uyu munsi. | Could not load today's bookings. | needs native-speaker review |
| `board.expectedCheckInError` | Ntibyashobotse kwandika ko uyu murwayi yageze. | Could not check in this booking. | needs native-speaker review |
| `board.expectedRetry` | Ongera ugerageze | Try again | needs native-speaker review |
| `board.missed` | Abatitabiriye uyu munsi | Missed today | needs native-speaker review |
| `board.missedHint` | Banditswe ko batitabiriye. Kuraho niba umurwayi yari ahari cyangwa gutinda kwaturutse kuri twe; igihano kivanwaho. | Marked as no-shows. Undo if the patient was here or the delay was ours; the strike is removed. | needs native-speaker review |
| `board.undoNoShow` | Kuraho ko atitabiriye | Undo no-show | needs native-speaker review |
| `board.undoNoShowHelp` | Gahunda irafungwa kandi igihano cy’umurwayi kikavanwaho. | The booking is closed and the patient's strike is removed. | needs native-speaker review |
| `board.undoNoShowError` | Ntibyashobotse gukuraho ko atitabiriye. | Could not undo this no-show. | needs native-speaker review |
| `panel.service` | Serivisi | Service | needs native-speaker review |
| `panel.stage` | Intambwe | Stage | needs native-speaker review |
| `panel.position` | Umwanya | Place | needs native-speaker review |
| `panel.arrived` | Yageze | Arrived | needs native-speaker review |
| `panel.ahead_one` | Umuntu {{count}} amuri imbere | {{count}} person ahead | needs native-speaker review |
| `panel.ahead_other` | Abantu {{count}} bamuri imbere | {{count}} people ahead | needs native-speaker review |
| `panel.priority` | Kwihutisha | Set priority | needs native-speaker review |
| `panel.priorityClass` | Impamvu yo kwihutisha | Priority | needs native-speaker review |
| `panel.reorder` | Kumwimura imbere | Move up | needs native-speaker review |
| `panel.reorderHint` | Buri kwimura kwandikwa ku izina ryawe kandi kugenzurwa n’umuyobozi. | Every move is recorded with your name and reviewed by the facility admin. | needs native-speaker review |
| `panel.moveBefore` | Mushyire imbere ya | Move in front of | needs native-speaker review |
| `panel.transfer` | Kwimurira | Transfer | needs native-speaker review |
| `panel.transferHint` | Umurwayi agumana isaha yageriyeho ku murongo mushya. | The patient keeps their arrival time in the new queue. | needs native-speaker review |
| `panel.stepOut` | Yasohotse iminota 15 | Stepped out 15 min | needs native-speaker review |
| `panel.left` | Yagiye | Mark as left | needs native-speaker review |
| `panel.timeline` | Ibyabaye | What happened | needs native-speaker review |
| `checkIn.title` | Andika umurwayi | Check in a patient | needs native-speaker review |
| `checkIn.back` | Subira inyuma | Back | needs native-speaker review |
| `checkIn.submit` | Andika | Check in | needs native-speaker review |
| `checkIn.emergency` | Byihutirwa | Emergency | needs native-speaker review |
| `checkIn.emergencyHint` | Ajya imbere ku murongo. Tanga impamvu. | Goes to the front of the queue. Give a reason. | needs native-speaker review |
| `checkIn.noPriority` | Nta kwihutishwa | No priority | needs native-speaker review |
| `checkIn.done` | Yanditswe | Checked in | needs native-speaker review |
| `checkIn.ticketFor` | Tike ya {{name}} | Ticket for {{name}} | needs native-speaker review |
| `checkIn.already` | {{name}} yamaze kwandikwa uyu munsi | {{name}} is already checked in today | needs native-speaker review |
| `checkIn.close` | Byarangiye | Done | needs native-speaker review |
| `mine.title` | Umurongo wanjye | My queue | needs native-speaker review |
| `mine.duty` | Uko meze | My status | needs native-speaker review |
| `mine.room` | Icyumba | Room | needs native-speaker review |
| `mine.breakUntil` | Agaruka saa {{time}} | Back at {{time}} | needs native-speaker review |
| `mine.current` | Umurwayi uriho | Current patient | needs native-speaker review |
| `mine.callNext` | Hamagara ukurikira | Call next | needs native-speaker review |
| `mine.spaceHint` | Cyangwa ukande Space. | Or press Space. | needs native-speaker review |
| `mine.setOnDuty` | Shyira ko uri mu kazi kugira ngo uhamagare abarwayi. | Set yourself on duty to call patients. | needs native-speaker review |
| `mine.nobodyTitle` | Nta wutegereje | Nobody waiting | needs native-speaker review |
| `mine.nobody` | Nta murwayi ukugutegereje ubu. | Nobody is waiting for you right now. | needs native-speaker review |
| `mine.start` | Tangira kumuvura | Start consultation | needs native-speaker review |
| `mine.recall` | Ongera umuhamagare | Call again | needs native-speaker review |
| `mine.noResponse` | Ntiyitabye | No response | needs native-speaker review |
| `mine.complete` | Soza | Complete visit | needs native-speaker review |
| `mine.toPharmacy` | Mwohereze kuri farumasi | Send to pharmacy | needs native-speaker review |
| `mine.toPayment` | Mwohereze kwishyura | Send to payment | needs native-speaker review |
| `mine.hold` | Ategereze ibisubizo | Wait for results | needs native-speaker review |
| `mine.waiting` | Abategereje | Waiting | needs native-speaker review |
| `reorders.title` | Igenzura ry’umurongo | Queue reviews | needs native-speaker review |
| `reorders.intro` | Igihe cyose umurwayi yimuwe imbere ku murongo, n’impamvu. Bigenzure kugira ngo umurongo ube uw’ukuri. | Every time someone moved a patient up the queue, with the reason. Review them to keep the queue fair. | needs native-speaker review |
| `reorders.onlyOpen` | Erekana gusa ibitaragenzurwa | Show only moves not yet reviewed | needs native-speaker review |
| `reorders.columns.when` | Ryari | When | needs native-speaker review |
| `reorders.columns.ticket` | Tike | Ticket | needs native-speaker review |
| `reorders.columns.who` | Uwamwimuye | Moved by | needs native-speaker review |
| `reorders.columns.reason` | Impamvu | Reason | needs native-speaker review |
| `reorders.columns.move` | Umwanya | Place | needs native-speaker review |
| `reorders.columns.review` | Igenzura | Review | needs native-speaker review |
| `reorders.positions` | {{from}} → {{to}} | {{from}} → {{to}} | needs native-speaker review |
| `reorders.reviewed` | Byagenzuwe | Reviewed | needs native-speaker review |
| `reorders.markReviewed` | Emeza ko byagenzuwe | Mark reviewed | needs native-speaker review |
| `reorders.emptyTitle` | Nta cyo kugenzura | Nothing to review | needs native-speaker review |
| `reorders.empty` | Kwimura kutubahirije uko bakurikirana kugaragara hano. | Moves that skip the normal order appear here. | needs native-speaker review |
| `displays.title` | Televiziyo z’aho bategerereza | Waiting-room screens | needs native-speaker review |
| `displays.intro` | Fungura link kuri televiziyo y’aho bategerereza. Yerekana nimero n’ibyumba gusa, nta mazina. | Open a link on the waiting-room TV. It shows ticket numbers and rooms, never names. | needs native-speaker review |
| `displays.add` | Ongeraho televiziyo | Add screen | needs native-speaker review |
| `displays.label` | Izina rya televiziyo | Screen name | needs native-speaker review |
| `displays.services` | Serivisi zigaragara | Services shown | needs native-speaker review |
| `displays.create` | Kora link | Create link | needs native-speaker review |
| `displays.created` | Link iriteguye | Screen link ready | needs native-speaker review |
| `displays.onceHint` | Yikoporore ubu: iyi link igaragara rimwe gusa. Yikureho niyo yamenyekana. | Copy it now: this link is shown only once. Revoke it if it leaks. | needs native-speaker review |
| `displays.copy` | Koporora link | Copy link | needs native-speaker review |
| `displays.copied` | Byakoporowe | Copied | needs native-speaker review |
| `displays.done` | Byarangiye | Done | needs native-speaker review |
| `displays.active` | Irakora | Active | needs native-speaker review |
| `displays.revoked` | Yakuweho | Revoked | needs native-speaker review |
| `displays.revoke` | Kuraho link | Revoke link | needs native-speaker review |
| `displays.lastSeen` | Yaherukaga kuboneka {{time}} | Last seen {{time}} | needs native-speaker review |
| `displays.neverSeen` | Ntirafungurwa | Not opened yet | needs native-speaker review |
| `displays.emptyTitle` | Nta televiziyo zirahari | No screens yet | needs native-speaker review |
| `displays.empty` | Ongeraho link kuri buri televiziyo. | Add a link for each waiting-room TV. | needs native-speaker review |
| `display.nowServing` | Ubu turi kwakira · Now serving | Now serving · Ubu turi kwakira | needs native-speaker review |
| `display.next` | Abakurikira · Next | Next · Abakurikira | needs native-speaker review |
| `display.enableSound` | Fungura ijwi | Turn on sound | needs native-speaker review |
| `display.invalid` | Iyi link ya televiziyo ntikora. Saba ikigo indi nshya. | This screen link is not valid. Ask the facility for a new one. | needs native-speaker review |
| `display.footer` | Tega amatwi nimero yawe. Fata gahunda kuri interineti: medilink.rw | Listen for your number. Book online: medilink.rw | needs native-speaker review |
| `today.title` | Bari hano ubu | On site now | needs native-speaker review |
| `today.summary` | {{waiting}} barategereje · {{serving}} bari kwa muganga | {{waiting}} waiting · {{serving}} with a doctor | needs native-speaker review |
| `today.open` | Fungura umurongo | Open queue | needs native-speaker review |
| `today.waiting` | barategereje | waiting | needs native-speaker review |
| `ops.title` | Ibikorwa by’uyu munsi | Operations today | needs native-speaker review |
| `ops.allReports` | Raporo zose | All reports | needs native-speaker review |
| `ops.vsLast` | ugereranyije na {{day}} ishize | vs last {{day}} | needs native-speaker review |
| `ops.patientsToday` | Abarwayi uyu munsi | Patients today | needs native-speaker review |
| `ops.medianWait` | Igihe cyo gutegereza muganga (hagati) | Median wait to be seen | needs native-speaker review |
| `ops.min` | min | min | needs native-speaker review |
| `ops.noShows` | Abatitabiriye gahunda | No-show rate | needs native-speaker review |
| `ops.noShowsLater` | Bizapimwa gufata gahunda kuri interineti nibitangira. | Measured once online booking opens. | needs native-speaker review |
| `ops.revenue` | Ayishyuwe uyu munsi | Collected today | needs native-speaker review |
| `ops.revenueLater` | Bizapimwa kwishyuza nibitangira. | Measured once billing is live. | needs native-speaker review |
| `ops.liveTitle` | Umutwaro w’umurongo kuri buri serivisi | Queue load by service | needs native-speaker review |
| `ops.quiet` | Nta muntu uri ku murongo ubu. | No one is in the queue right now. | needs native-speaker review |
| `ops.doctors_one` | Umuganga {{count}} uri mu kazi | {{count}} doctor on duty | needs native-speaker review |
| `ops.doctors_other` | Abaganga {{count}} bari mu kazi | {{count}} doctors on duty | needs native-speaker review |
| `ops.load.low` | Bigenda neza | Flowing | needs native-speaker review |
| `ops.load.medium` | Hari benshi | Busy | needs native-speaker review |
| `ops.load.high` | Huzuye cyane | Overloaded | needs native-speaker review |
| `ops.longest` | uwatinze cyane iminota {{min}} | longest {{min}} min | needs native-speaker review |
| `ops.waiting` | barategereje | waiting | needs native-speaker review |
| `ops.attention` | Bikeneye ko ubireba | Needs your attention | needs native-speaker review |
| `ops.allClear` | Byose ni byiza. Nta gitegereje icyemezo cyawe. | All clear. Nothing waits for your decision. | needs native-speaker review |
| `ops.reordersToReview_one` | Kwimura {{count}} gukeneye kugenzurwa | {{count}} queue move to review | needs native-speaker review |
| `ops.reordersToReview_other` | Kwimura {{count}} gukeneye kugenzurwa | {{count}} queue moves to review | needs native-speaker review |
| `ops.noDoctor_one` | Umurwayi {{count}} ategereje nta muganga uri mu kazi | {{count}} patient waiting with no doctor on duty | needs native-speaker review |
| `ops.noDoctor_other` | Abarwayi {{count}} bategereje nta muganga uri mu kazi | {{count}} patients waiting with no doctor on duty | needs native-speaker review |
| `ops.liveSummary_one` | {{waiting}} barategereje · umuganga {{count}} uri mu kazi | {{waiting}} waiting · {{count}} doctor on duty | needs native-speaker review |
| `ops.liveSummary_other` | {{waiting}} barategereje · abaganga {{count}} bari mu kazi | {{waiting}} waiting · {{count}} doctors on duty | needs native-speaker review |
| `reports.title` | Raporo | Reports | needs native-speaker review |
| `reports.intro` | Uko ikigo cyawe gihagaze: abarwayi, igihe cyo gutegereza n’igihe baza. Hakurikijwe ibisobanuro bya MediLink. | How your facility is doing: patients, waits and when people arrive. Figures follow the MediLink metric definitions. | needs native-speaker review |
| `reports.period` | Iminsi 14 ishize | Last 14 days | needs native-speaker review |
| `reports.patientsPerDay` | Abarwayi ku munsi | Patients per day | needs native-speaker review |
| `reports.patients` | Abarwayi | Patients | needs native-speaker review |
| `reports.waitToBeSeen` | Igihe cyo gutegereza muganga (iminota) | Wait to be seen (minutes) | needs native-speaker review |
| `reports.median` | Hagati | Median | needs native-speaker review |
| `reports.p90` | 9 kuri 10 babonye muganga mbere ya | 9 in 10 seen within | needs native-speaker review |
| `reports.arrivals` | Igihe abarwayi baza (ibyumweru 4 bishize) | When patients arrive (last 4 weeks) | needs native-speaker review |
| `reports.less` | Bake | Fewer | needs native-speaker review |
| `reports.more` | Benshi | More | needs native-speaker review |
| `reports.patients14` | Abarwayi, iminsi 14 | Patients, 14 days | needs native-speaker review |
| `reports.avgConsult` | Igihe cyo kuvurwa uyu munsi (hagati) | Average consultation today | needs native-speaker review |
| `reports.leftRate` | Abagiye batavuwe uyu munsi | Left without being seen today | needs native-speaker review |
| `reports.emergencies` | Ibyihutirwa, iminsi 14 | Emergencies, 14 days | needs native-speaker review |

## staff-web feature: setup (namespace setup)

File: `apps/staff-web/src/features/setup/locales/rw.json`

| Key | Kinyarwanda (draft) | English source | Status |
|---|---|---|---|
| `nav.setup` | Intambwe zo gutangira | Setup checklist | needs native-speaker review |
| `nav.schedules` | Gahunda z'abaganga | Doctor schedules | needs native-speaker review |
| `nav.mySchedule` | Gahunda yanjye | My schedule | needs native-speaker review |
| `save` | Bika impinduka | Save changes | needs native-speaker review |
| `saved` | Byabitswe. | Saved. | needs native-speaker review |
| `cancel` | Reka | Cancel | needs native-speaker review |
| `close` | Funga | Close | needs native-speaker review |
| `edit` | Hindura | Edit | needs native-speaker review |
| `remove` | Kuraho | Remove | needs native-speaker review |
| `retry` | Ongera ugerageze | Try again | needs native-speaker review |
| `reload` | Fungura verisiyo nshya | Load the latest version | needs native-speaker review |
| `previous` | Ibibanza | Previous | needs native-speaker review |
| `next` | Ibikurikira | Next | needs native-speaker review |
| `failed` | Ntibyakunze. Reba interineti wongere ugerageze. | That did not work. Check your connection and try again. | needs native-speaker review |
| `loadFailed` | Uru rupapuro ntirwafungutse. | This page could not load. | needs native-speaker review |
| `conflictTitle` | Undi muntu yabihinduye | Someone else changed this | needs native-speaker review |
| `conflictBody` | Fungura verisiyo nshya, hanyuma wongere uhindure. | Load the latest version, then make your change again. | needs native-speaker review |
| `languages.rw` | Ikinyarwanda | Kinyarwanda | needs native-speaker review |
| `languages.en` | Icyongereza | English | needs native-speaker review |
| `languages.fr` | Igifaransa | French | needs native-speaker review |
| `status.setup` | Kiri gutegurwa | Setting up | needs native-speaker review |
| `status.live` | Kirakora | Live | needs native-speaker review |
| `status.approved` | Cyemejwe | Approved | needs native-speaker review |
| `status.suspended` | Cyahagaritswe | Suspended | needs native-speaker review |
| `facilityTypes.hospital` | Ibitaro | Hospital | needs native-speaker review |
| `facilityTypes.health_centre` | Ikigo nderabuzima | Health centre | needs native-speaker review |
| `facilityTypes.clinic` | Ivuriro | Clinic | needs native-speaker review |
| `facilityTypes.private_clinic` | Ivuriro ryigenga | Private clinic | needs native-speaker review |
| `facilityTypes.polyclinic` | Polikilinike | Polyclinic | needs native-speaker review |
| `facilityTypes.pharmacy` | Farumasi | Pharmacy | needs native-speaker review |
| `councils.rmdc` | Urugaga rw'abaganga n'abaganga b'amenyo (RMDC) | Medical and Dental Council (RMDC) | needs native-speaker review |
| `councils.ncnm` | Urugaga rw'abaforomo n'ababyaza (NCNM) | Nursing and Midwifery Council (NCNM) | needs native-speaker review |
| `councils.npc` | Urugaga rw'abafarumasiye (NPC) | Pharmacy Council (NPC) | needs native-speaker review |
| `councils.other` | Urundi rugaga | Other council | needs native-speaker review |
| `today.title` | Rangiza gutegura ikigo cyawe | Finish setting up your facility | needs native-speaker review |
| `today.open` | Fungura intambwe | Open checklist | needs native-speaker review |
| `today.leaveTitle` | Gusaba ikiruhuko | Leave requests | needs native-speaker review |
| `today.leaveCount_one` | Ubusabe {{count}} butegereje icyemezo cyawe | {{count}} request waits for your decision | needs native-speaker review |
| `today.leaveCount_other` | Ubusabe {{count}} butegereje icyemezo cyawe | {{count}} requests wait for your decision | needs native-speaker review |
| `today.review` | Reba ubusabe | Review requests | needs native-speaker review |
| `checklist.title` | Intambwe zo gutangira | Setup checklist | needs native-speaker review |
| `checklist.intro` | Abarwayi bashobora gufata gahunda no kujya ku murongo iyo intambwe zose zarangiye ikigo kigatangira gukora. | Patients can book and join queues once every step is done and the facility goes live. | needs native-speaker review |
| `checklist.progress` | Intambwe {{done}} kuri {{total}} zarangiye | {{done}} of {{total}} steps done | needs native-speaker review |
| `checklist.nextStep` | Ikurikira: {{step}} | Next: {{step}} | needs native-speaker review |
| `checklist.allDone` | Intambwe zose zarangiye. Ushobora gutangira gukora. | Every step is done. You can go live. | needs native-speaker review |
| `checklist.continue` | Komeza | Continue setup | needs native-speaker review |
| `checklist.done` | Byarangiye | Done | needs native-speaker review |
| `checklist.todo` | Bitarakorwa | To do | needs native-speaker review |
| `checklist.setUp` | Tegura | Set up | needs native-speaker review |
| `checklist.review` | Reba | Review | needs native-speaker review |
| `checklist.goLiveTitle` | Tangira gukora | Go live | needs native-speaker review |
| `checklist.goLive` | Tangira gukora | Go live | needs native-speaker review |
| `checklist.readyBody` | Byose biteguye. Gutangira bituma abarwayi babona ikigo. | Everything is ready. Going live makes the facility visible to patients. | needs native-speaker review |
| `checklist.notReadyBody` | Banza urangize intambwe zanditse ngo “Bitarakorwa”. | Finish the steps marked “To do” first. | needs native-speaker review |
| `checklist.liveTitle` | Ikigo cyawe kirakora | Your facility is live | needs native-speaker review |
| `checklist.liveBody` | Abarwayi bashobora kukubona, gufata gahunda no kujya ku murongo. | Patients can find you, book visits and join queues. | needs native-speaker review |
| `checklist.items.profile` | Umwirondoro w'ikigo | Facility profile | needs native-speaker review |
| `checklist.items.departments` | Amashami | Departments | needs native-speaker review |
| `checklist.items.services` | Serivisi | Services | needs native-speaker review |
| `checklist.items.service_points` | Ibyumba n'ameza | Rooms and desks | needs native-speaker review |
| `checklist.items.opening_hours` | Amasaha yo gukora | Opening hours | needs native-speaker review |
| `checklist.items.staff` | Umuganga ufite uruhushya rwemejwe | A doctor with an attested licence | needs native-speaker review |
| `checklist.items.schedules` | Gahunda z'abaganga | Doctor schedules | needs native-speaker review |
| `checklist.items.tariff` | Ibiciro bya buri serivisi | Prices for every service | needs native-speaker review |
| `checklist.items.insurers` | Amabwiriza y'ubwishingizi | Insurer rules | needs native-speaker review |
| `checklist.items.licence` | Uruhushya rwo gukora rufite agaciro | Valid operating licence | needs native-speaker review |
| `checklist.hints.profile_one` | Aho mubarizwa, aderesi n'ahantu | Contact details, address and location | needs native-speaker review |
| `checklist.hints.profile_other` | Aho mubarizwa, aderesi n'ahantu | Contact details, address and location | needs native-speaker review |
| `checklist.hints.departments_one` | Ishami {{count}} | {{count}} department | needs native-speaker review |
| `checklist.hints.departments_other` | Amashami {{count}} | {{count}} departments | needs native-speaker review |
| `checklist.hints.services_one` | Serivisi {{count}} ikora | {{count}} active service | needs native-speaker review |
| `checklist.hints.services_other` | Serivisi {{count}} zikora | {{count}} active services | needs native-speaker review |
| `checklist.hints.service_points_one` | Icyumba cyangwa ameza {{count}} | {{count}} room or desk | needs native-speaker review |
| `checklist.hints.service_points_other` | Ibyumba n'ameza {{count}} | {{count}} rooms and desks | needs native-speaker review |
| `checklist.hints.opening_hours_one` | Hakora umunsi {{count}} mu cyumweru | Open {{count}} day a week | needs native-speaker review |
| `checklist.hints.opening_hours_other` | Hakora iminsi {{count}} mu cyumweru | Open {{count}} days a week | needs native-speaker review |
| `checklist.hints.staff_one` | Umuganga {{count}} wemejwe | {{count}} doctor attested | needs native-speaker review |
| `checklist.hints.staff_other` | Abaganga {{count}} bemejwe | {{count}} doctors attested | needs native-speaker review |
| `checklist.hints.schedules_one` | Buri serivisi ifatirwa gahunda ikenera igihe cy'icyumweru ({{count}} yateganyijwe) | Every bookable service needs a weekly session ({{count}} scheduled) | needs native-speaker review |
| `checklist.hints.schedules_other` | Buri serivisi ifatirwa gahunda ikenera igihe cy'icyumweru ({{count}} zateganyijwe) | Every bookable service needs a weekly session ({{count}} scheduled) | needs native-speaker review |
| `checklist.hints.tariff_one` | Serivisi {{count}} ifite igiciro | {{count}} service priced | needs native-speaker review |
| `checklist.hints.tariff_other` | Serivisi {{count}} zifite ibiciro | {{count}} services priced | needs native-speaker review |
| `checklist.hints.insurers_one` | Itegeko {{count}} ry'ubwishingizi, cyangwa “nta bwishingizi” mu kwishyuza | {{count}} insurer rule, or “no insurers” in billing rules | needs native-speaker review |
| `checklist.hints.insurers_other` | Amategeko {{count}} y'ubwishingizi, cyangwa “nta bwishingizi” mu kwishyuza | {{count}} insurer rules, or “no insurers” in billing rules | needs native-speaker review |
| `checklist.hints.licence_one` | Bigenzurwa ku ruhushya rwa MINISANTE | Checked from your MoH licence | needs native-speaker review |
| `checklist.hints.licence_other` | Bigenzurwa ku ruhushya rwa MINISANTE | Checked from your MoH licence | needs native-speaker review |
| `settings.title` | Igenamiterere | Settings | needs native-speaker review |
| `settings.intro` | Uko ikigo cyawe gikora: ibyo mutanga, igihe, ibiciro n'abakozi. | How your facility works: what you offer, when, at what price, and who works here. | needs native-speaker review |
| `settings.checklistLink` | Intambwe zo gutangira | Setup checklist | needs native-speaker review |
| `settings.sections.profile.title` | Umwirondoro w'ikigo | Facility profile | needs native-speaker review |
| `settings.sections.profile.description` | Aho mubarizwa, ahantu, amafoto n'ibisobanuro. | Contact details, location, photos and description. | needs native-speaker review |
| `settings.sections.services.title` | Serivisi n'ibyumba | Services and rooms | needs native-speaker review |
| `settings.sections.services.description` | Amashami, serivisi n'inyuguti za tike, ibyumba n'ameza. | Departments, services with ticket prefixes, rooms and desks. | needs native-speaker review |
| `settings.sections.hours.title` | Amasaha yo gukora | Opening hours | needs native-speaker review |
| `settings.sections.hours.description` | Amasaha y'icyumweru, iminsi ifunze na kalendari abarwayi babona. | Weekly hours, closures and the calendar patients see. | needs native-speaker review |
| `settings.sections.schedules.title` | Gahunda z'abaganga | Doctor schedules | needs native-speaker review |
| `settings.sections.schedules.description` | Ibihe bya buri muganga mu cyumweru n'ibiruhuko. | Each doctor's weekly sessions and leave. | needs native-speaker review |
| `settings.sections.tariffs.title` | Ibiciro | Prices | needs native-speaker review |
| `settings.sections.tariffs.description` | Urutonde rw'ibiciro, n'impinduka zitangira ku itariki. | The price list, with changes from a date. | needs native-speaker review |
| `settings.sections.insurers.title` | Ubwishingizi | Insurers | needs native-speaker review |
| `settings.sections.insurers.description` | Ibyo buri bwishingizi bwishyura n'uruhare rw'umurwayi. | What each insurer covers and the patient's share. | needs native-speaker review |
| `settings.sections.rules.title` | Amabwiriza | Rules | needs native-speaker review |
| `settings.sections.rules.description` | Umurongo, gahunda, kwishyuza, inyandiko n'ibibutsa. | Queue, booking, billing, documents and reminders. | needs native-speaker review |
| `settings.sections.history.title` | Amateka y'impinduka | Change history | needs native-speaker review |
| `settings.sections.history.description` | Uwahinduye igenamiterere, n'igihe. | Who changed which setting, and when. | needs native-speaker review |
| `settings.sections.displays.title` | Televiziyo z’aho bategerereza | Waiting-room screens | needs native-speaker review |
| `settings.sections.displays.description` | Link za televiziyo yerekana nimero za tike. | Links for the TV that shows ticket numbers. | needs native-speaker review |
| `profile.intro` | Abarwayi babona ibi ku rupapuro rwanyu rusange. | Patients see this on your public page. | needs native-speaker review |
| `profile.identity` | Iyandikwa | Registration | needs native-speaker review |
| `profile.name` | Izina | Name | needs native-speaker review |
| `profile.type` | Ubwoko | Type | needs native-speaker review |
| `profile.status` | Imiterere | Status | needs native-speaker review |
| `profile.platformManaged` | Izina n'ubwoko biva mu busabe bwemejwe. Saba ubufasha bwa MediLink kubihindura. | Name and type come from your approved application. Ask MediLink support to change them. | needs native-speaker review |
| `profile.contact` | Aho mubarizwa | Contact | needs native-speaker review |
| `profile.phone` | Telefoni | Phone | needs native-speaker review |
| `profile.email` | Imeyili | Email | needs native-speaker review |
| `profile.website` | Urubuga | Website | needs native-speaker review |
| `profile.address` | Aderesi | Street address | needs native-speaker review |
| `profile.location` | Ahantu ku ikarita | Location on the map | needs native-speaker review |
| `profile.latitude` | Latitude | Latitude | needs native-speaker review |
| `profile.longitude` | Longitude | Longitude | needs native-speaker review |
| `profile.useLocation` | Koresha aho ndi | Use my location | needs native-speaker review |
| `profile.locationUnavailable` | Aho uri ntihaboneka. Andika imibare y'ahantu. | Your location is not available. Type the coordinates instead. | needs native-speaker review |
| `profile.outsideRwanda` | Iyi mibare iri hanze y'u Rwanda. Yigenzure. | These coordinates are outside Rwanda. Check them. | needs native-speaker review |
| `profile.description` | Ibisobanuro | Description | needs native-speaker review |
| `profile.descriptionHint` | Interuro nke muri buri rurimi: ibyo muvura n'uko babageraho. | A few sentences in each language: what you treat and how to find you. | needs native-speaker review |
| `profile.photos` | Amafoto | Photos | needs native-speaker review |
| `profile.photosHint_one` | Ifoto {{count}} kuri 6. JPEG, PNG cyangwa WebP. | {{count}} of 6 photos. JPEG, PNG or WebP. | needs native-speaker review |
| `profile.photosHint_other` | Amafoto {{count}} kuri 6. JPEG, PNG cyangwa WebP. | {{count}} of 6 photos. JPEG, PNG or WebP. | needs native-speaker review |
| `profile.addPhoto` | Ongeraho ifoto | Add photo | needs native-speaker review |
| `profile.photoN` | Ifoto ya {{n}} | Photo {{n}} | needs native-speaker review |
| `profile.removePhotoN` | Kuraho ifoto ya {{n}} | Remove photo {{n}} | needs native-speaker review |
| `catalogue.intro` | Serivisi ni byo abarwayi bafatira gahunda cyangwa bategerereza. Buri imwe igira inyuguti ya tike, nka G kuri G-023. | Services are what patients book or queue for. Each has a ticket prefix, such as G for G-023. | needs native-speaker review |
| `catalogue.services` | Serivisi | Services | needs native-speaker review |
| `catalogue.departments` | Amashami | Departments | needs native-speaker review |
| `catalogue.points` | Ibyumba n'ameza | Rooms and desks | needs native-speaker review |
| `catalogue.serviceCount_one` | Serivisi {{count}} ikora | {{count}} active service | needs native-speaker review |
| `catalogue.serviceCount_other` | Serivisi {{count}} zikora | {{count}} active services | needs native-speaker review |
| `catalogue.departmentCount_one` | Ishami {{count}} | {{count}} department | needs native-speaker review |
| `catalogue.departmentCount_other` | Amashami {{count}} | {{count}} departments | needs native-speaker review |
| `catalogue.pointCount_one` | Icyumba cyangwa ameza {{count}} | {{count}} room or desk | needs native-speaker review |
| `catalogue.pointCount_other` | Ibyumba n'ameza {{count}} | {{count}} rooms and desks | needs native-speaker review |
| `catalogue.addService` | Ongeraho serivisi | Add service | needs native-speaker review |
| `catalogue.addDepartment` | Ongeraho ishami | Add department | needs native-speaker review |
| `catalogue.addPoint` | Ongeraho icyumba cyangwa ameza | Add room or desk | needs native-speaker review |
| `catalogue.names` | Izina muri buri rurimi | Name in each language | needs native-speaker review |
| `catalogue.department` | Ishami | Department | needs native-speaker review |
| `catalogue.prefix` | Inyuguti ya tike | Ticket prefix | needs native-speaker review |
| `catalogue.prefixHint` | Inyuguti 1 kugeza kuri 3 | 1 to 3 letters | needs native-speaker review |
| `catalogue.duration` | Iminota kuri buri murwayi | Minutes per patient | needs native-speaker review |
| `catalogue.minutes_one` | Umunota {{count}} | {{count}} minute | needs native-speaker review |
| `catalogue.minutes_other` | Iminota {{count}} | {{count}} minutes | needs native-speaker review |
| `catalogue.bookable` | Ifatirwa gahunda kuri interineti | Bookable online | needs native-speaker review |
| `catalogue.walkIn` | Abaje batafashe gahunda | Walk-ins | needs native-speaker review |
| `catalogue.remoteJoin` | Kujya ku murongo uri mu rugo | Join the queue from home | needs native-speaker review |
| `catalogue.retire` | Hagarika serivisi | Retire service | needs native-speaker review |
| `catalogue.retired` | Yahagaritswe | Retired | needs native-speaker review |
| `catalogue.active` | Irakora | Active | needs native-speaker review |
| `catalogue.retireDepartmentHint` | Banza uhagarike serivisi zaryo. | Retire its services first. | needs native-speaker review |
| `catalogue.templatesEnded_one` | Yahagaritswe. Igihe {{count}} cy'icyumweru cyarangijwe. | Retired. {{count}} weekly session was ended. | needs native-speaker review |
| `catalogue.templatesEnded_other` | Yahagaritswe. Ibihe {{count}} by'icyumweru byarangijwe. | Retired. {{count}} weekly sessions were ended. | needs native-speaker review |
| `catalogue.pointName` | Izina | Name | needs native-speaker review |
| `catalogue.kind` | Ubwoko | Kind | needs native-speaker review |
| `catalogue.kinds.room` | Icyumba cyo kuvuriramo | Consultation room | needs native-speaker review |
| `catalogue.kinds.desk` | Ameza | Desk | needs native-speaker review |
| `catalogue.kinds.window` | Idirishya | Window | needs native-speaker review |
| `catalogue.kinds.lab` | Laboratwari | Laboratory | needs native-speaker review |
| `catalogue.kinds.other` | Ibindi | Other | needs native-speaker review |
| `catalogue.linkedServices` | Serivisi zitangirwa hano | Services seen here | needs native-speaker review |
| `catalogue.noServicesLinked` | Nta serivisi irahuzwa | No service linked yet | needs native-speaker review |
| `catalogue.noServicesTitle` | Nta serivisi irahari | No services yet | needs native-speaker review |
| `catalogue.noServices` | Ongeraho serivisi ya mbere abarwayi bashobora gufatira gahunda. | Add the first service patients can book or queue for. | needs native-speaker review |
| `catalogue.noDepartmentsTitle` | Nta shami rirahari | No departments yet | needs native-speaker review |
| `catalogue.noDepartments` | Amashami ahuza serivisi zanyu, urugero Ubuvuzi rusange cyangwa Ubuvuzi bw'abana. | Departments group your services, for example General OPD or Pediatrics. | needs native-speaker review |
| `catalogue.noPointsTitle` | Nta byumba cyangwa ameza birahari | No rooms or desks yet | needs native-speaker review |
| `catalogue.noPoints` | Ongeraho ibyumba n'ameza abarwayi bakirirwamo. | Add the rooms and desks where patients are seen or served. | needs native-speaker review |
| `hours.intro` | Shyiraho amasaha y'icyumweru, hanyuma wongereho iminsi ifunze. Ishusho y'imbere yerekana ibyo abarwayi babona. | Set your weekly hours, then add closures. The preview shows what patients will see. | needs native-speaker review |
| `hours.scope` | Amasaha ya | Hours for | needs native-speaker review |
| `hours.wholeFacility` | Ikigo cyose | Whole facility | needs native-speaker review |
| `hours.week` | Amasaha y'icyumweru | Weekly hours | needs native-speaker review |
| `hours.copyMonday` | Koporora kuwa mbere ku minsi y'akazi | Copy Monday to weekdays | needs native-speaker review |
| `hours.inherits` | Iyi serivisi ikurikiza amasaha y'ikigo kugeza ubitse ayayo. | This service follows the facility hours until you save its own. | needs native-speaker review |
| `hours.opens` | Hafungura | Opens | needs native-speaker review |
| `hours.closes` | Hafunga | Closes | needs native-speaker review |
| `hours.order` | Isaha yo kurangiza igomba kuba nyuma yo gutangira. | The end must be after the start. | needs native-speaker review |
| `hours.breakStarts` | Ikiruhuko gitangira | Break starts | needs native-speaker review |
| `hours.breakEnds` | Ikiruhuko kirangira | Break ends | needs native-speaker review |
| `hours.breakOrder` | Ikiruhuko kigomba kurangira nyuma yo gutangira. | The break must end after it starts. | needs native-speaker review |
| `hours.breakInside` | Ikiruhuko kigomba kuba mu masaha yo gukora. | The break must sit inside opening hours. | needs native-speaker review |
| `hours.openingFor` | Amasaha yo gukora, {{day}} | Opening hours, {{day}} | needs native-speaker review |
| `hours.breakFor` | Ikiruhuko, {{day}} | Break, {{day}} | needs native-speaker review |
| `hours.addBreak` | Ongeraho ikiruhuko | Add break | needs native-speaker review |
| `hours.removeBreak` | Kuraho ikiruhuko, {{day}} | Remove break, {{day}} | needs native-speaker review |
| `hours.closed` | Harafunze | Closed | needs native-speaker review |
| `hours.save` | Bika amasaha | Save hours | needs native-speaker review |
| `hours.preview` | Ibyumweru bine biri imbere | Next four weeks | needs native-speaker review |
| `hours.previewHint` | Amasaha ukuyemo iminsi ifunze, iminsi mikuru n'Umuganda. | Hours minus closures, public holidays and Umuganda. | needs native-speaker review |
| `hours.legendOpen` | Harafunguye | Open | needs native-speaker review |
| `hours.umuganda` | Umuganda | Umuganda | needs native-speaker review |
| `hours.events` | Iminsi ifunze n'iminsi idasanzwe | Closures and special days | needs native-speaker review |
| `hours.eventsHint` | Impinduka z'igihe gito ku masaha y'icyumweru. | One-off changes to the weekly hours. | needs native-speaker review |
| `hours.addEvent` | Ongeraho umunsi ufunze cyangwa udasanzwe | Add closure or special day | needs native-speaker review |
| `hours.noEventsTitle` | Nta munsi ufunze uteganyijwe | No closures planned | needs native-speaker review |
| `hours.noEvents` | Ongeraho umunsi ufunze w'amahugurwa, w'ibarura cyangwa umunsi mukuru mudakora. | Add a closure for a training day, an inventory day or a holiday you do not open on. | needs native-speaker review |
| `hours.kind` | Ibiba | What happens | needs native-speaker review |
| `hours.kinds.closure` | Harafunze | Closed | needs native-speaker review |
| `hours.kinds.special_day` | Amasaha adasanzwe | Special hours | needs native-speaker review |
| `hours.kinds.holiday_override` | Hakora ku munsi mukuru | Open on a holiday | needs native-speaker review |
| `hours.from` | Kuva | From | needs native-speaker review |
| `hours.to` | Kugeza | To | needs native-speaker review |
| `hours.reason` | Impamvu | Reason | needs native-speaker review |
| `hours.dateOrder` | Itariki yo kurangiza igomba kuba ku itariki yo gutangira cyangwa nyuma yayo. | The end date must be on or after the start date. | needs native-speaker review |
| `schedules.intro` | Ibihe bya buri muganga mu cyumweru. Amasaha yo gufatirwaho gahunda ava muri ibi bihe. | Each doctor's weekly sessions. Bookable slots come from these sessions. | needs native-speaker review |
| `schedules.doctors` | Abaganga | Doctors | needs native-speaker review |
| `schedules.weeklyHours` | Amasaha mu cyumweru | Hours per week | needs native-speaker review |
| `schedules.sessions` | Ibihe by'icyumweru | Weekly sessions | needs native-speaker review |
| `schedules.leaveThisWeek` | Iminsi y'ikiruhuko muri iki cyumweru | Days off this week | needs native-speaker review |
| `schedules.weekOf` | Icyumweru cya {{name}} | Week of {{name}} | needs native-speaker review |
| `schedules.gridView` | Icyumweru | Week | needs native-speaker review |
| `schedules.tableView` | Urutonde | List | needs native-speaker review |
| `schedules.day` | Umunsi | Day | needs native-speaker review |
| `schedules.time` | Isaha | Time | needs native-speaker review |
| `schedules.session` | Igihe | Session | needs native-speaker review |
| `schedules.actions` | Ibikorwa | Actions | needs native-speaker review |
| `schedules.addOn` | Ongeraho igihe kuwa {{day}} | Add session on {{day}} | needs native-speaker review |
| `schedules.noSession` | Nta gihe | No session | needs native-speaker review |
| `schedules.newSession` | Igihe gishya cya {{name}} | New session for {{name}} | needs native-speaker review |
| `schedules.editSession` | Hindura igihe | Edit session | needs native-speaker review |
| `schedules.endSession` | Rangiza iki gihe | End this session | needs native-speaker review |
| `schedules.starts` | Gitangira | Starts | needs native-speaker review |
| `schedules.ends` | Kirangira | Ends | needs native-speaker review |
| `schedules.service` | Serivisi | Service | needs native-speaker review |
| `schedules.point` | Icyumba | Room | needs native-speaker review |
| `schedules.slot` | Iminota ya buri gahunda | Slot minutes | needs native-speaker review |
| `schedules.capacity` | Abarwayi kuri buri gahunda | Patients per slot | needs native-speaker review |
| `schedules.share` | Igice cya interineti % | Online share % | needs native-speaker review |
| `schedules.shareHint` | Igisigaye ni icy'abaje batafashe gahunda | The rest stays for walk-ins | needs native-speaker review |
| `schedules.overlap` | Ibi bihurirana n'ikindi gihe cy'uyu muganga. | This overlaps another session of the same doctor. | needs native-speaker review |
| `schedules.unattestedTitle` | Uruhushya ntirurahamywa | Licence not attested yet | needs native-speaker review |
| `schedules.unattested` | Banza uhamye uruhushya rw'uyu muganga mbere yo kongeraho ibihe. | Attest this doctor's licence before adding sessions. | needs native-speaker review |
| `schedules.goToStaff` | Jya ku bakozi | Go to Staff | needs native-speaker review |
| `schedules.busyElsewhereTitle` | Uyu muganga akora n'ahandi | This doctor also works elsewhere | needs native-speaker review |
| `schedules.busyElsewhere` | {{day}} {{start}}–{{end}} ku kindi kigo | {{day}} {{start}}–{{end}} at another facility | needs native-speaker review |
| `schedules.noDoctorsTitle` | Nta baganga barahari | No doctors yet | needs native-speaker review |
| `schedules.noDoctors` | Tumira umuganga, uhamye uruhushya rwe, hanyuma utegure ibihe bye. | Invite a doctor, then attest their licence to plan sessions. | needs native-speaker review |
| `schedules.inviteDoctor` | Tumira umuganga | Invite a doctor | needs native-speaker review |
| `schedules.exceptions` | Ibiruhuko n'ibihe by'inyongera | Leave and extra sessions | needs native-speaker review |
| `schedules.noExceptionsTitle` | Nta busabe bw'ikiruhuko | No leave requests | needs native-speaker review |
| `schedules.noExceptions` | Ubusabe bw'abaganga bugaragara hano ngo ubufatire icyemezo. | Requests from doctors appear here for your decision. | needs native-speaker review |
| `schedules.kinds.leave` | Ikiruhuko | Leave | needs native-speaker review |
| `schedules.kinds.training` | Amahugurwa | Training | needs native-speaker review |
| `schedules.kinds.extra_session` | Igihe cy'inyongera | Extra session | needs native-speaker review |
| `schedules.status.requested` | Birategereje | Waiting | needs native-speaker review |
| `schedules.status.approved` | Byemewe | Approved | needs native-speaker review |
| `schedules.status.rejected` | Byanzwe | Rejected | needs native-speaker review |
| `schedules.status.cancelled` | Byahagaritswe | Cancelled | needs native-speaker review |
| `schedules.approve` | Emeza | Approve | needs native-speaker review |
| `schedules.reject` | Anga | Reject | needs native-speaker review |
| `schedules.rejectTitle` | Kwanga ubusabe bw'ikiruhuko | Reject leave request | needs native-speaker review |
| `schedules.rejectReason` | Impamvu (umuganga arayibona) | Reason (the doctor sees it) | needs native-speaker review |
| `mine.title` | Gahunda yanjye | My schedule | needs native-speaker review |
| `mine.intro` | Ibihe byawe by'iki cyumweru n'ubusabe bwawe bw'ikiruhuko. | Your sessions this week and your leave requests. | needs native-speaker review |
| `mine.week` | Icyumweru cyanjye | My week | needs native-speaker review |
| `mine.requestLeave` | Saba ikiruhuko | Request leave | needs native-speaker review |
| `mine.requestHint` | Umuyobozi w'ikigo arabwemeza cyangwa akabwanga. | Your facility admin approves or rejects it. | needs native-speaker review |
| `mine.lastDay` | Umunsi wa nyuma w'ikiruhuko | Last day off | needs native-speaker review |
| `mine.send` | Ohereza ubusabe | Send request | needs native-speaker review |
| `mine.leave` | Ibiruhuko byanjye | My leave | needs native-speaker review |
| `mine.cancel` | Hagarika ubusabe | Cancel request | needs native-speaker review |
| `mine.noLeaveTitle` | Nta kiruhuko wasabye | No leave requested | needs native-speaker review |
| `mine.noLeave` | Ubusabe wohereje bugaragara hano hamwe n'icyemezo. | Requests you send appear here with their decision. | needs native-speaker review |
| `mine.noScheduleTitle` | Nta bihe birahari | No sessions yet | needs native-speaker review |
| `mine.noSchedule` | Umuyobozi ntarategura ibihe byawe. | Your facility admin has not planned your sessions yet. | needs native-speaker review |
| `tariffs.intro` | Ibiciro mu mafaranga y'u Rwanda. Impinduka itangira ku itariki uhitamo; ibyabaye mbere bigumana igiciro cya kera. | Prices in Rwandan francs. A change starts on a date you choose; earlier visits keep the old price. | needs native-speaker review |
| `tariffs.add` | Ongeraho igiciro | Add price | needs native-speaker review |
| `tariffs.all` | Byose | All | needs native-speaker review |
| `tariffs.item` | Ikintu | Item | needs native-speaker review |
| `tariffs.kind` | Ubwoko | Kind | needs native-speaker review |
| `tariffs.kinds.service` | Serivisi | Service | needs native-speaker review |
| `tariffs.kinds.procedure` | Igikorwa cy'ubuvuzi | Procedure | needs native-speaker review |
| `tariffs.kinds.medicine` | Umuti | Medicine | needs native-speaker review |
| `tariffs.kinds.other` | Ibindi | Other | needs native-speaker review |
| `tariffs.price` | Igiciro | Price | needs native-speaker review |
| `tariffs.since` | Kuva | Since | needs native-speaker review |
| `tariffs.change` | Hindura igiciro | Change price | needs native-speaker review |
| `tariffs.history` | Amateka y'ibiciro | Price history | needs native-speaker review |
| `tariffs.code` | Kode | Code | needs native-speaker review |
| `tariffs.codeHint` | Inyuguti, imibare, - . _ | Letters, numbers, - . _ | needs native-speaker review |
| `tariffs.name` | Izina | Name | needs native-speaker review |
| `tariffs.service` | Serivisi | Service | needs native-speaker review |
| `tariffs.validFrom` | Guhera | From | needs native-speaker review |
| `tariffs.changeTitle` | Hindura igiciro cya {{name}} | Change the price of {{name}} | needs native-speaker review |
| `tariffs.changeHint` | Igiciro kiriho: {{amount}} | Current price: {{amount}} | needs native-speaker review |
| `tariffs.newPrice` | Igiciro gishya | New price | needs native-speaker review |
| `tariffs.saveChange` | Bika igiciro gishya | Save new price | needs native-speaker review |
| `tariffs.historyTitle` | Amateka ya {{name}} | History of {{name}} | needs native-speaker review |
| `tariffs.current` | ubu | now | needs native-speaker review |
| `tariffs.emptyTitle` | Nta biciro birahari | No prices yet | needs native-speaker review |
| `tariffs.empty` | Ongeraho igiciro cya buri serivisi kugira ngo abarwayi babone ikiguzi mbere yo kuza. | Add a price for each service so patients see costs before they come. | needs native-speaker review |
| `insurers.intro` | Kuri buri bwishingizi: ibyo bwishyura hano n'ibyo umurwayi yishyura. | For each insurer: what it covers here and what the patient pays. | needs native-speaker review |
| `insurers.add` | Ongeraho itegeko ry'ubwishingizi | Add insurer rule | needs native-speaker review |
| `insurers.insurer` | Ubwishingizi | Insurer | needs native-speaker review |
| `insurers.since` | Guhera {{date}} | From {{date}} | needs native-speaker review |
| `insurers.patientPays` | umurwayi yishyura | patient pays | needs native-speaker review |
| `insurers.insurerPays` | ubwishingizi bwishyura | insurer pays | needs native-speaker review |
| `insurers.allServices` | Serivisi zose zirishyurwa | All services covered | needs native-speaker review |
| `insurers.someServices_one` | Serivisi {{count}} irishyurwa | {{count}} service covered | needs native-speaker review |
| `insurers.someServices_other` | Serivisi {{count}} zirishyurwa | {{count}} services covered | needs native-speaker review |
| `insurers.coveredServices` | Serivisi zishyurwa | Covered services | needs native-speaker review |
| `insurers.referral` | Bisaba transfert | Needs a referral | needs native-speaker review |
| `insurers.ceiling` | Kugeza kuri {{amount}} ku nshuro | Up to {{amount}} per visit | needs native-speaker review |
| `insurers.ceilingLabel` | Ntarengwa ku nshuro | Maximum per visit | needs native-speaker review |
| `insurers.exclusions_one` | Ikintu {{count}} kitishyurwa | {{count}} item excluded | needs native-speaker review |
| `insurers.exclusions_other` | Ibintu {{count}} bitishyurwa | {{count}} items excluded | needs native-speaker review |
| `insurers.excluded` | Ibyo ubwishingizi butishyura | Items the insurer does not pay | needs native-speaker review |
| `insurers.share` | Uruhare rw'umurwayi % | Patient share % | needs native-speaker review |
| `insurers.shareHint` | 0 kugeza 100 | 0 to 100 | needs native-speaker review |
| `insurers.shareRange` | Andika umubare kuva kuri 0 kugeza 100. | Use a number from 0 to 100. | needs native-speaker review |
| `insurers.emptyTitle` | Nta mategeko y'ubwishingizi arahari | No insurer rules yet | needs native-speaker review |
| `insurers.empty` | Ongeraho ubwishingizi mwakira, cyangwa ukoreshe “nta bwishingizi” mu mabwiriza yo kwishyuza. | Add the insurers you accept, or switch on “no insurers” in the billing rules. | needs native-speaker review |
| `rules.intro` | Hindura uko umurongo, gahunda, kwishyura, inyandiko n'ibibutsa bikora hano. | Fine-tune how queues, bookings, payments, documents and reminders work here. | needs native-speaker review |
| `rules.sections.queue` | Umurongo | Queue | needs native-speaker review |
| `rules.sections.booking` | Gahunda | Booking | needs native-speaker review |
| `rules.sections.billing` | Kwishyuza | Billing | needs native-speaker review |
| `rules.sections.documents` | Inyandiko | Documents | needs native-speaker review |
| `rules.sections.notifications` | Ibibutsa | Reminders | needs native-speaker review |
| `rules.sections.branding` | Umutwe w'impapuro | Letterhead | needs native-speaker review |
| `rules.range` | Kuva kuri {{min}} kugeza {{max}} | From {{min}} to {{max}} | needs native-speaker review |
| `rules.billingStepUp` | Impinduka zo kwishyuza zigusaba kwemeza ko ari wowe. | Billing changes ask you to confirm it is you. | needs native-speaker review |
| `rules.choices.daily` | Buri munsi | Every day | needs native-speaker review |
| `rules.choices.never` | Nta na rimwe | Never | needs native-speaker review |
| `rules.fields.queue.ticket_reset` | Gutangira nimero za tike bundi bushya | Restart ticket numbers | needs native-speaker review |
| `rules.fields.queue.show_names_on_display` | Kwerekana amazina kuri televiziyo y'aho bategerereza | Show names on the waiting-room screen | needs native-speaker review |
| `rules.fields.queue.call_repeat_seconds` | Gusubiramo guhamagara nyuma ya (amasegonda) | Repeat a call after (seconds) | needs native-speaker review |
| `rules.fields.queue.priority_elderly_age` | Kwihutishwa guhera ku myaka | Priority from age | needs native-speaker review |
| `rules.fields.booking.enabled` | Gufata gahunda kuri interineti | Online booking | needs native-speaker review |
| `rules.fields.booking.lead_time_hours` | Gufata gahunda nibura (amasaha mbere) | Book at least (hours ahead) | needs native-speaker review |
| `rules.fields.booking.horizon_days` | Gufata gahunda kugeza (iminsi mbere) | Book up to (days ahead) | needs native-speaker review |
| `rules.fields.booking.cancel_until_hours` | Guhagarika kugeza (amasaha mbere) | Cancel up to (hours before) | needs native-speaker review |
| `rules.fields.booking.no_show_strikes` | Inshuro zo kutaza mbere yo guhagarika gahunda | Missed visits before booking is paused | needs native-speaker review |
| `rules.fields.billing.no_insurers` | Ntitwakira ubwishingizi | We accept no insurer | needs native-speaker review |
| `rules.fields.billing.pay_before_consultation` | Kwishyura mbere yo kubonana na muganga | Pay before the consultation | needs native-speaker review |
| `rules.fields.billing.allow_exemptions` | Kwemera gusonerwa | Allow fee exemptions | needs native-speaker review |
| `rules.fields.billing.receipt_prefix` | Inyuguti zibanza z'inyemezabwishyu | Receipt number prefix | needs native-speaker review |
| `rules.fields.documents.prescription_valid_days` | Urupapuro rw'imiti rumara (iminsi) | Prescriptions valid for (days) | needs native-speaker review |
| `rules.fields.documents.show_licence_numbers` | Gucapa nimero z'uruhushya ku nyandiko | Print licence numbers on documents | needs native-speaker review |
| `rules.fields.notifications.reminder_hours_before` | Kwibutsa abarwayi (amasaha mbere) | Remind patients (hours before) | needs native-speaker review |
| `rules.fields.notifications.sms_enabled` | Kohereza SMS zibutsa | Send SMS reminders | needs native-speaker review |
| `rules.brandingHint` | Amagambo yo hasi acapwa ku nyemezabwishyu, impapuro z'imiti n'amabaruwa. | The footer printed on receipts, prescriptions and letters. | needs native-speaker review |
| `rules.footer` | Amagambo yo hasi | Footer text | needs native-speaker review |
| `history.intro` | Buri mpinduka y'igenamiterere, iya vuba mbere. Nta makuru bwite yandikwa hano. | Every configuration change, newest first. Personal data is never recorded here. | needs native-speaker review |
| `history.entity` | Erekana impinduka za | Show changes to | needs native-speaker review |
| `history.entities.all` | Byose | Everything | needs native-speaker review |
| `history.entities.facility` | Umwirondoro w'ikigo | Facility profile | needs native-speaker review |
| `history.entities.opening_hours` | Amasaha yo gukora | Opening hours | needs native-speaker review |
| `history.entities.settings` | Amabwiriza | Rules | needs native-speaker review |
| `history.entities.tariff` | Ibiciro | Prices | needs native-speaker review |
| `history.entities.service` | Serivisi | Services | needs native-speaker review |
| `history.columns.when` | Ryari | When | needs native-speaker review |
| `history.columns.who` | Nde | Who | needs native-speaker review |
| `history.columns.what` | Iki | What | needs native-speaker review |
| `history.columns.field` | Umwanya | Field | needs native-speaker review |
| `history.columns.before` | Mbere | Before | needs native-speaker review |
| `history.columns.after` | Nyuma | After | needs native-speaker review |
| `history.count_one` | Impinduka {{count}} | {{count}} change | needs native-speaker review |
| `history.count_other` | Impinduka {{count}} | {{count}} changes | needs native-speaker review |
| `history.emptyTitle` | Nta mpinduka irabaho | No changes yet | needs native-speaker review |
| `history.empty` | Impinduka zigaragara hano iyo hari ubitse igenamiterere. | Changes appear here as soon as someone saves a setting. | needs native-speaker review |
| `staff.title` | Abakozi | Staff | needs native-speaker review |
| `staff.intro` | Abakora hano, ibyo buri wese ashobora gukora, n'ubutumire butegereje. | Who works here, what they can do, and pending invitations. | needs native-speaker review |
| `staff.invite` | Tumira umukozi | Invite staff | needs native-speaker review |
| `staff.inviteHint` | Ahabwa link kuri imeyili imara iminsi 7. | They get an email link valid for 7 days. | needs native-speaker review |
| `staff.activeMembers` | Abakozi bakora | Active members | needs native-speaker review |
| `staff.doctorsAttested` | Abaganga bemejwe | Doctors attested | needs native-speaker review |
| `staff.withMfa` | Kwinjira mu ntambwe ebyiri | Two-step sign-in on | needs native-speaker review |
| `staff.pendingInvites` | Ubutumire butegereje | Pending invitations | needs native-speaker review |
| `staff.members` | Abakozi | Members | needs native-speaker review |
| `staff.invitations` | Ubutumire | Invitations | needs native-speaker review |
| `staff.search` | Shakisha ukoresheje izina cyangwa imeyili | Search by name or email | needs native-speaker review |
| `staff.roles` | Inshingano | Roles | needs native-speaker review |
| `staff.allRoles` | Inshingano zose | All roles | needs native-speaker review |
| `staff.points` | Ibyumba n'ameza | Rooms and desks | needs native-speaker review |
| `staff.columns.person` | Umuntu | Person | needs native-speaker review |
| `staff.columns.roles` | Inshingano | Roles | needs native-speaker review |
| `staff.columns.mfa` | Intambwe ebyiri | Two-step | needs native-speaker review |
| `staff.columns.licence` | Uruhushya | Licence | needs native-speaker review |
| `staff.columns.status` | Imiterere | Status | needs native-speaker review |
| `staff.mfaOn` | Irakora | On | needs native-speaker review |
| `staff.mfaOff` | Ntiraterwa | Not set up | needs native-speaker review |
| `staff.attested` | Rwemejwe | Attested | needs native-speaker review |
| `staff.notAttested` | Ntirwemejwe | Not attested | needs native-speaker review |
| `staff.active` | Arakora | Active | needs native-speaker review |
| `staff.deactivated` | Yahagaritswe | Deactivated | needs native-speaker review |
| `staff.noneTitle` | Nta muntu uhuye na byo | Nobody matches | needs native-speaker review |
| `staff.none` | Siba ibyo washakishije cyangwa akayunguruzo k'inshingano. | Clear the search or the role filter. | needs native-speaker review |
| `staff.noInvitesTitle` | Nta butumire | No invitations | needs native-speaker review |
| `staff.noInvites` | Tumira bagenzi bawe ukoresheje buto iri hejuru. | Invite colleagues with the button above. | needs native-speaker review |
| `staff.inviteStatus.pending` | Butegereje | Pending | needs native-speaker review |
| `staff.inviteStatus.accepted` | Bwemewe | Accepted | needs native-speaker review |
| `staff.inviteStatus.revoked` | Bwakuweho | Revoked | needs native-speaker review |
| `staff.inviteStatus.expired` | Bwarangiye | Expired | needs native-speaker review |
| `staff.expires` | burangira {{date}} | expires {{date}} | needs native-speaker review |
| `staff.resend` | Ongera wohereze | Resend | needs native-speaker review |
| `staff.revoke` | Kuraho | Revoke | needs native-speaker review |
| `staff.email` | Imeyili | Email | needs native-speaker review |
| `staff.send` | Ohereza ubutumire | Send invitation | needs native-speaker review |
| `staff.joined` | Yinjiye {{date}} | Joined {{date}} | needs native-speaker review |
| `staff.licence` | Uruhushya rw'umwuga | Professional licence | needs native-speaker review |
| `staff.attest` | Emeza uruhushya | Attest licence | needs native-speaker review |
| `staff.attestedOn` | Rwemejwe {{date}} | Attested on {{date}} | needs native-speaker review |
| `staff.account` | Konti | Account | needs native-speaker review |
| `staff.mfaReset` | Subiramo kwinjira mu ntambwe ebyiri | Reset two-step sign-in | needs native-speaker review |
| `staff.deactivate` | Hagarika | Deactivate | needs native-speaker review |
| `staff.reactivate` | Subizaho | Reactivate | needs native-speaker review |
| `staff.deactivateTitle` | Uhagarike {{name}}? | Deactivate {{name}}? | needs native-speaker review |
| `staff.deactivateHint` | Ahita asohorwa kandi ntaba agishobora gukora hano. Ushobora kumusubizaho nyuma. | They are signed out at once and can no longer work here. You can reactivate them later. | needs native-speaker review |
| `staff.reason` | Impamvu | Reason | needs native-speaker review |
| `staff.deactivatedBecause` | Yahagaritswe: {{reason}} | Deactivated: {{reason}} | needs native-speaker review |
| `staff.lastAdmin` | Ikigo gikenera nibura umuyobozi umwe. Banza uhe izo nshingano undi muntu. | The facility needs at least one admin. Give the role to someone else first. | needs native-speaker review |
| `staff.done.deactivate` | Yahagaritswe. | Deactivated. | needs native-speaker review |
| `staff.done.reactivate` | Yasubijweho. | Reactivated. | needs native-speaker review |
| `staff.done.attest-licence` | Uruhushya rwemejwe. | Licence attested. | needs native-speaker review |
| `staff.done.mfa-reset` | Kwinjira mu ntambwe ebyiri byasubiwemo. Azabitegura ubutaha yinjiye. | Two-step sign-in reset. They set it up again at their next login. | needs native-speaker review |
| `clinician.title` | Uruhushya rwanjye rw'umwuga | My professional licence | needs native-speaker review |
| `clinician.intro` | Urugaga rwawe na nimero y'uruhushya bigaragara ku mpapuro z'imiti n'amadosiye usinya. | Your council and licence number appear on prescriptions and records you sign. | needs native-speaker review |
| `clinician.council` | Urugaga | Council | needs native-speaker review |
| `clinician.licence` | Nimero y'uruhushya | Licence number | needs native-speaker review |
| `clinician.specialty` | Ubuhanga bwihariye | Specialty | needs native-speaker review |
| `clinician.reattest` | Guhindura urugaga cyangwa nimero y'uruhushya bisaba ko umuyobozi wawe arwemeza bundi bushya. | Changing your council or licence number means your facility admin attests it again. | needs native-speaker review |
| `invite.title` | Injira mu kigo kuri MediLink | Join a facility on MediLink | needs native-speaker review |
| `invite.invitedBy` | Watumiwe na {{name}} | Invited by {{name}} | needs native-speaker review |
| `invite.expires` | link irakora kugeza {{date}} | link valid until {{date}} | needs native-speaker review |
| `invite.invalidTitle` | Iyi link ntikora | This link does not work | needs native-speaker review |
| `invite.invalid` | Link y'ubutumire ntikora cyangwa yarangiye. Saba ikigo indi nshya. | The invitation link is not valid or has expired. Ask the facility for a new one. | needs native-speaker review |
| `invite.existingHint` | Usanzwe ufite konti y'umukozi kuri MediLink. Injira kugira ngo wemere. | You already have a MediLink staff account. Log in to accept. | needs native-speaker review |
| `invite.logInToAccept` | Injira wemere | Log in to accept | needs native-speaker review |
| `invite.accept` | Emera ubutumire | Accept invitation | needs native-speaker review |
| `invite.newHint` | Fungura konti yawe. Hanyuma utegure kwinjira mu ntambwe ebyiri. | Create your account. Next you set up two-step sign-in. | needs native-speaker review |
| `invite.fullName` | Amazina yose | Full name | needs native-speaker review |
| `invite.password` | Ijambobanga | Password | needs native-speaker review |
| `invite.passwordHint` | Nibura inyuguti 12 | At least 12 characters | needs native-speaker review |
| `invite.create` | Fungura konti | Create account | needs native-speaker review |

## patient-web feature: booking (namespace booking)

File: `apps/patient-web/src/features/booking/locales/rw.json`

| Key | Kinyarwanda (draft) | English source | Status |
|---|---|---|---|
| `verified` | Cyemejwe | Verified | needs native-speaker review |
| `openNow` | Kirakora ubu | Open now | needs native-speaker review |
| `closedNow` | Gifunze ubu | Closed now | needs native-speaker review |
| `fee` | Igiciro | Fee | needs native-speaker review |
| `yourShare` | Wishyura | You pay | needs native-speaker review |
| `referralTitle` | Mituweli n’iyoherezwa | Mutuelle and referrals | needs native-speaker review |
| `referralHint` | Mituweli ishobora kutishyura isura hano utoherejwe n’ikigo nderabuzima. Ushobora gufata gahunda uko byagenda kose. | Mutuelle may not cover a visit here without a transfer from a health centre. You can still book. | needs native-speaker review |
| `load.low` | Gutegereza bike | Short wait | needs native-speaker review |
| `load.medium` | Hari benshi | Busy | needs native-speaker review |
| `load.high` | Hari benshi cyane | Very busy | needs native-speaker review |
| `types.health_post` | Poste de santé | Health post | needs native-speaker review |
| `types.health_center` | Ikigo nderabuzima | Health centre | needs native-speaker review |
| `types.private_clinic` | Ivuriro ryigenga | Private clinic | needs native-speaker review |
| `types.polyclinic` | Polikilinike | Polyclinic | needs native-speaker review |
| `types.district_hospital` | Ibitaro by’akarere | District hospital | needs native-speaker review |
| `types.provincial_hospital` | Ibitaro by’intara | Provincial hospital | needs native-speaker review |
| `types.referral_hospital` | Ibitaro bikuru | Referral hospital | needs native-speaker review |
| `insurerNames.mutuelle` | Mituweli | Mutuelle | needs native-speaker review |
| `insurerNames.rama` | RAMA | RAMA | needs native-speaker review |
| `insurerNames.mmi` | MMI | MMI | needs native-speaker review |
| `insurerNames.private_other` | Ubwishingizi bwigenga | Private insurance | needs native-speaker review |
| `search.title` | Shaka ikigo | Find a facility | needs native-speaker review |
| `search.accepts` | Cyakira {{insurer}} | Accepts {{insurer}} | needs native-speaker review |
| `search.notAccepted` | Ntikakira {{insurer}} | {{insurer}} not accepted | needs native-speaker review |
| `search.km` | km {{km}} | {{km}} km | needs native-speaker review |
| `search.next` | Ikurikira: {{day}}, {{time}} | Next: {{day}}, {{time}} | needs native-speaker review |
| `search.walkInOnly` | Ngwino mu masaha y’akazi | Walk in during opening hours | needs native-speaker review |
| `search.book` | Hitamo isaha | Choose a time | needs native-speaker review |
| `search.view` | Reba ikigo | View facility | needs native-speaker review |
| `search.filters.open_now` | Gikora ubu | Open now | needs native-speaker review |
| `search.filters.available_today` | Kiboneka uyu munsi | Available today | needs native-speaker review |
| `search.useLocation` | Koresha aho ndi | Use my location | needs native-speaker review |
| `search.locationDenied` | Ntitwabonye aho uri. Hitamo akarere. | We couldn't get your location. Choose a district instead. | needs native-speaker review |
| `search.nearMe` | Hafi yanjye | Near me | needs native-speaker review |
| `search.active` | Ibyo wahisemo | Active filters | needs native-speaker review |
| `search.remove` | Kuraho {{label}} | Remove {{label}} | needs native-speaker review |
| `search.count_one` | Ikigo {{count}} | {{count}} facility | needs native-speaker review |
| `search.count_other` | Ibigo {{count}} | {{count}} facilities | needs native-speaker review |
| `search.failed` | Ntitwashoboye kuzana ibigo. | We couldn't load facilities. | needs native-speaker review |
| `search.noneTitle` | Nta kigo gihuye n’ibyo byose | No facility matches all of this | needs native-speaker review |
| `search.noneBody` | Kuraho kimwe mu byo wahisemo cyangwa uhitemo akandi karere. | Remove a filter or choose another district. | needs native-speaker review |
| `search.clear` | Siba ishakisha | Clear the search | needs native-speaker review |
| `facility.insurers` | Ubwishingizi bwakirwa: {{list}} | Insurance accepted: {{list}} | needs native-speaker review |
| `facility.book` | Fata gahunda | Book a time | needs native-speaker review |
| `facility.join` | Jya ku murongo w’uyu munsi | Join today's queue | needs native-speaker review |
| `facility.notFound` | Ntitwabonye iki kigo | We couldn't find this facility | needs native-speaker review |
| `facility.notFoundBody` | Gishobora kuba kitaraza kuri MediLink. Shaka ikindi kiri hafi. | It may not be on MediLink yet. Search for another one nearby. | needs native-speaker review |
| `facility.backToSearch` | Garuka ku ishakisha | Back to search | needs native-speaker review |
| `facility.services` | Serivisi n’ibiciro | Services and prices | needs native-speaker review |
| `facility.doctors` | Abaganga | Doctors | needs native-speaker review |
| `facility.days` | Iminsi bahaba | Days present | needs native-speaker review |
| `facility.hours` | Amasaha y’iki cyumweru | Opening hours this week | needs native-speaker review |
| `facility.closed` | Gifunze | Closed | needs native-speaker review |
| `facility.closures` | Gifunze ku wa {{list}} | Closed on {{list}} | needs native-speaker review |
| `facility.contact` | Aderesi n’aho wahamagara | Address and contact | needs native-speaker review |
| `facility.directions` | Inzira | Directions | needs native-speaker review |
| `flow.title` | Fata gahunda | Book a visit | needs native-speaker review |
| `flow.step` | Intambwe {{step}} kuri {{total}} | Step {{step}} of {{total}} | needs native-speaker review |
| `flow.who` | Gahunda ni iy’uwuhe? | Who is the visit for? | needs native-speaker review |
| `flow.addPerson` | Ongeraho uwo mu muryango | Add a family member | needs native-speaker review |
| `flow.what` | Ukeneye iki? | What do you need? | needs native-speaker review |
| `flow.when` | Wifuza kuza ryari? | When would you like to come? | needs native-speaker review |
| `flow.reason` | Ni iki kikuzanye? | What brings you in? | needs native-speaker review |
| `flow.reasonHint` | Hitamo kugeza kuri 5. Bifasha muganga kwitegura; si isuzuma. | Choose up to 5. This helps the doctor prepare; it is not a diagnosis. | needs native-speaker review |
| `flow.symptoms` | Ibimenyetso | Symptoms | needs native-speaker review |
| `flow.more` | Hari ikindi? (si ngombwa) | Anything else? (optional) | needs native-speaker review |
| `flow.moreHint` | Abaganga bakuvura ni bo bonyine babibona. | Only the care team sees this. | needs native-speaker review |
| `flow.redFlagTitle` | Ibi bishobora kuba byihutirwa. | This can be an emergency. | needs native-speaker review |
| `flow.redFlagBody` | Niba bikomeye cyangwa birushaho kuba bibi, ntutegereze gahunda: jya ku bitaro bikwegereye cyangwa uhamagare 912. | If it is severe or getting worse, don't wait for a booking: go to the nearest emergency department or call 912. | needs native-speaker review |
| `flow.review` | Genzura ufate gahunda | Check and book | needs native-speaker review |
| `flow.forWho` | Ku wa | For | needs native-speaker review |
| `flow.where` | Aho | Where | needs native-speaker review |
| `flow.service` | Serivisi | Service | needs native-speaker review |
| `flow.whenLabel` | Ryari | When | needs native-speaker review |
| `flow.doctor` | Muganga | Doctor | needs native-speaker review |
| `flow.insurance` | Ubwishingizi | Insurance | needs native-speaker review |
| `flow.noInsurance` | Nziyishyurira | I'll pay myself | needs native-speaker review |
| `flow.notAccepted` | {{insurer}} ntiyakirwa hano. Ushobora gufata gahunda ukiyishyurira. | {{insurer}} is not accepted here. You can still book and pay yourself. | needs native-speaker review |
| `flow.estimate` | Uruhare rwawe ruteganyijwe | Your estimated share | needs native-speaker review |
| `flow.estimateHint` | Ikigo cyemeza amafaranga ku munsi w’isura. | The facility confirms the amount at the visit. | needs native-speaker review |
| `flow.cancelRule` | Ushobora gusiba cyangwa guhindura isaha ku buntu kugeza amasaha 2 mbere. | You can cancel or change the time for free until 2 hours before. | needs native-speaker review |
| `flow.confirm` | Emeza gahunda | Book this visit | needs native-speaker review |
| `flow.failed` | Ntitwashoboye gufata iyi gahunda. | We couldn't book this visit. | needs native-speaker review |
| `flow.joinTitle` | Ukeneye kuvurwa uyu munsi? | Need care today? | needs native-speaker review |
| `flow.joinBody` | Jya ku murongo w’uyu munsi uri hano ukurikirane igihe cyawe. Wiyandikishe ku bakira abarwayi nugera. | Join today's queue from here and follow your turn. Check in at reception when you arrive. | needs native-speaker review |
| `flow.takenTitle` | Undi muntu amaze gufata iyi saha | Someone just took this time | needs native-speaker review |
| `flow.takenBody` | Aya masaha ari hafi yayo aracyari ubusa: | These times close to it are still free: | needs native-speaker review |
| `flow.takenNone` | Hitamo indi saha hepfo. | Choose another time below. | needs native-speaker review |
| `flow.earlier` | Iminsi ibanza | Earlier days | needs native-speaker review |
| `flow.later` | Iminsi ikurikira | Later days | needs native-speaker review |
| `flow.days` | Iminsi | Days | needs native-speaker review |
| `flow.free_one` | {{count}} irahari | {{count}} free | needs native-speaker review |
| `flow.free_other` | {{count}} zirahari | {{count}} free | needs native-speaker review |
| `flow.noTimes` | Nta saha ihari uyu munsi. | No free times this day. | needs native-speaker review |
| `flow.morning` | Mu gitondo | Morning | needs native-speaker review |
| `flow.afternoon` | Nyuma ya saa sita | Afternoon | needs native-speaker review |
| `flow.holding` | Turakubikiye iyi saha mu gihe cya {{time}} | We're holding this time for {{time}} | needs native-speaker review |
| `flow.holdingMinutes_one` | Turakubikiye iyi saha mu gihe cy’umunota {{count}}. | We're holding this time for about {{count}} minute. | needs native-speaker review |
| `flow.holdingMinutes_other` | Turakubikiye iyi saha mu gihe cy’iminota {{count}}. | We're holding this time for {{count}} minutes. | needs native-speaker review |
| `flow.expiredTitle` | Isaha wari wahisemo yarekuwe. | The time you chose was released. | needs native-speaker review |
| `flow.chooseAgain` | Ongera uhitemo isaha | Choose a time again | needs native-speaker review |
| `flow.doneTitle` | Gahunda yawe yafashwe | Your visit is booked | needs native-speaker review |
| `flow.doneBody` | {{facility}}, {{day}} saa {{time}}. Erekana kode ya gahunda ku bakira abarwayi. | {{facility}}, {{day}} at {{time}}. Show your booking code at reception. | needs native-speaker review |
| `flow.code` | Kode ya gahunda | Booking code | needs native-speaker review |
| `flow.addToCalendar` | Shyira ku ngengabihe yanjye | Add to my calendar | needs native-speaker review |
| `flow.directions` | Ikigo n’inzira | Facility and directions | needs native-speaker review |
| `flow.toVisits` | Reba gahunda zanjye | See my visits | needs native-speaker review |
| `flow.with` | na {{doctor}} | with {{doctor}} | needs native-speaker review |
| `body.general` | Rusange | General | needs native-speaker review |
| `body.respiratory` | Guhumeka | Breathing | needs native-speaker review |
| `body.digestive` | Inda | Stomach | needs native-speaker review |
| `body.nervous` | Umutwe | Head | needs native-speaker review |
| `body.circulatory` | Umutima n’igituza | Heart and chest | needs native-speaker review |
| `body.skin` | Uruhu | Skin | needs native-speaker review |
| `body.musculoskeletal` | Ingingo n’umugongo | Joints and back | needs native-speaker review |
| `body.dental` | Amenyo | Teeth | needs native-speaker review |
| `body.eye` | Amaso | Eyes | needs native-speaker review |
| `body.urinary` | Inkari | Urine | needs native-speaker review |
| `upcoming.title` | Iziri imbere | Upcoming | needs native-speaker review |
| `upcoming.failed` | Ntitwashoboye kuzana gahunda zawe. | We couldn't load your bookings. | needs native-speaker review |
| `upcoming.none` | Nta gahunda iri imbere | No upcoming bookings | needs native-speaker review |
| `upcoming.noneBody` | Fata isaha ku kigo wirinde gutegereza igihe kirekire. | Book a time at a facility and skip the long wait. | needs native-speaker review |
| `upcoming.book` | Fata gahunda | Book a visit | needs native-speaker review |
| `upcoming.forWhom` | Ya {{name}} | For {{name}} | needs native-speaker review |
| `upcoming.facility` | Ikigo | Facility | needs native-speaker review |
| `upcoming.cancel` | Siba | Cancel | needs native-speaker review |
| `upcoming.cancelTitle` | Gusiba iyi gahunda? | Cancel this booking? | needs native-speaker review |
| `upcoming.cancelBody` | Gahunda {{code}} izasibwa, isaha ihabwe undi. | Booking {{code}} will be cancelled and the time freed for someone else. | needs native-speaker review |
| `upcoming.cancelLate` | Hasigaye amasaha ari munsi ya 2 (ku buntu kugeza {{time}}). Bizandikwa ko wasibye utinze. | It's less than 2 hours before the visit (free until {{time}}). It will be recorded as a late cancellation. | needs native-speaker review |
| `upcoming.keep` | Yigumishe | Keep it | needs native-speaker review |
| `upcoming.cancelConfirm` | Siba gahunda | Cancel booking | needs native-speaker review |

## patient-web feature: facilityApplication (namespace facilityApplication)

File: `apps/patient-web/src/features/facilityApplication/locales/rw.json`

| Key | Kinyarwanda (draft) | English source | Status |
|---|---|---|---|
| `public.title` | MediLink ku bigo by'ubuvuzi | MediLink for health facilities | needs native-speaker review |
| `public.problem` | Abarwayi bamara amasaha ku mirongo kandi bagatwara impapuro zabo bava ku kigo bajya ku kindi. MediLink iha ikigo cyawe gufata gahunda kuri interineti, umurongo ugaragara, amadosiye y'ikoranabuhanga n'ubwishingizi muri sisitemu imwe, mu Kinyarwanda, Icyongereza n'Igifaransa. | Patients waste hours in queues and carry paper records between facilities. MediLink gives your facility online booking, a live queue, digital records and insurance claims in one system, in Kinyarwanda, English and French. | needs native-speaker review |
| `public.register` | Andikisha ikigo cyawe | Register your facility | needs native-speaker review |
| `public.continue` | Komeza ubusabe | Continue an application | needs native-speaker review |
| `public.sessionEnded` | Ubusabe bwawe bwabitswe. Twakoherereje link yo kubukomeza nyuma. | Your application is saved. We emailed you a link to continue it later. | needs native-speaker review |
| `public.rolesTitle` | Icyo buri tsinda ryungukira | What each team gets | needs native-speaker review |
| `public.roles.admin.title` | Abayobozi b'ikigo | Facility administrators | needs native-speaker review |
| `public.roles.admin.body` | Shyiraho serivisi, gahunda n'konti z'abakozi, ukurikirane imikorere y'ikigo. | Set up services, schedules and staff accounts, and follow the facility's performance. | needs native-speaker review |
| `public.roles.reception.title` | Kwakira abarwayi | Reception | needs native-speaker review |
| `public.roles.reception.body` | Andika abaje, uyobore umurongo, wandike ubwishyu n'ubwishingizi. | Check patients in, run the queue and record payments and insurance. | needs native-speaker review |
| `public.roles.doctor.title` | Abaganga n'abaforomo | Doctors and nurses | needs native-speaker review |
| `public.roles.doctor.body` | Reba abarwayi b'uyu munsi n'amateka yabo, wandike isuzuma n'imiti. | See today's patients, their history and write consultations and prescriptions. | needs native-speaker review |
| `public.roles.pharmacy.title` | Farumasi | Pharmacy | needs native-speaker review |
| `public.roles.pharmacy.body` | Akira impapuro z'imiti z'ikoranabuhanga, wandike imiti yatanzwe. | Receive electronic prescriptions and record what was dispensed. | needs native-speaker review |
| `public.howTitle` | Uko kwiyandikisha bigenda | How onboarding works | needs native-speaker review |
| `public.phases.apply.title` | Gusaba | Apply | needs native-speaker review |
| `public.phases.apply.body` | Tubwire ibijyanye n'ikigo, wohereze uruhushya n'impapuro zo kwiyandikisha. | Tell us about the facility and upload its licence and registration documents. | needs native-speaker review |
| `public.phases.verify.title` | Kugenzura | Verification | needs native-speaker review |
| `public.phases.verify.body` | Itsinda ryacu rigenzura inyandiko kandi rishobora gusaba impinduka. | Our team checks the documents and may ask for changes. | needs native-speaker review |
| `public.phases.setup.title` | Gutegura | Setup | needs native-speaker review |
| `public.phases.setup.body` | Umuyobozi wawe ashyiraho serivisi, gahunda n'abakozi. | Your administrator adds services, schedules and staff. | needs native-speaker review |
| `public.phases.live.title` | Gutangira | Live | needs native-speaker review |
| `public.phases.live.body` | Abarwayi barakubona kandi bagafata gahunda kuri interineti. | Patients can find you and book online. | needs native-speaker review |
| `public.faqTitle` | Ibibazo | Questions | needs native-speaker review |
| `public.faq.cost.q` | Bisaba amafaranga angahe? | What does it cost? | needs native-speaker review |
| `public.faq.cost.a` | Kwiyandikisha ni ubuntu mu gihe cy'igerageza. Ifatabuguzi ryose rizumvikanwaho nawe mbere y'uko ritangira. | Onboarding is free during the pilot. We will agree any subscription with you before it applies. | needs native-speaker review |
| `public.faq.documents.q` | Nkeneye izihe nyandiko? | Which documents do I need? | needs native-speaker review |
| `public.faq.documents.a` | Uruhushya rwa Minisiteri y'Ubuzima. Ibigo byigenga bikenera kandi icyemezo cya RDB na TIN. | Your Ministry of Health operating licence. Private facilities also need their RDB registration and TIN certificate. | needs native-speaker review |
| `public.faq.time.q` | Kugenzura bitwara igihe kingana iki? | How long does verification take? | needs native-speaker review |
| `public.faq.time.a` | Akenshi iminsi mike y'akazi nyuma yo kohereza ubusabe bwuzuye. | Usually a few working days after you submit a complete application. | needs native-speaker review |
| `public.faq.data.q` | Ni nde ushobora kubona amakuru y'abarwayi bacu? | Who can see our patients' data? | needs native-speaker review |
| `public.faq.data.a` | Abakozi bawe gusa n'abarwayi ubwabo. Amakuru aguma mu Rwanda kandi buri gusura kurandikwa. | Only your staff, and the patients themselves. Data stays in Rwanda and access is logged. | needs native-speaker review |
| `start.title` | Andikisha ikigo cyawe | Register your facility | needs native-speaker review |
| `start.intro` | Tangira n'amakuru make. Ushobora kubika ugakomeza nyuma: tukoherereza link kuri imeyili. | Start with a few details. You can save and continue later: we email you a link. | needs native-speaker review |
| `start.emailHint` | Link yo gukomeza ubusabe tuyohereza kuri iyi meyili. | We send the link to continue your application to this address. | needs native-speaker review |
| `start.submit` | Tangira ubusabe | Start the application | needs native-speaker review |
| `start.honeypot` | Ntugire icyo wandika hano | Leave this empty | needs native-speaker review |
| `resume.title` | Komeza ubusabe bwawe | Continue your application | needs native-speaker review |
| `resume.opening` | Turafungura ubusabe bwawe… | Opening your application… | needs native-speaker review |
| `resume.invalid` | Iyi link ntikora cyangwa yarashaje. Saba indi hasi. | This link is invalid or has expired. Ask for a new link below. | needs native-speaker review |
| `resume.linkTitle` | Komeza ubusabe | Continue an application | needs native-speaker review |
| `resume.linkBody` | Andika imeyili wakoresheje usaba. Niba hari ubusabe butarangiye, tukoherereza link yo kubukomeza. | Enter the email you applied with. If there is an open application, we send you a link to continue it. | needs native-speaker review |
| `resume.send` | Nyoherereza link | Send me a link | needs native-speaker review |
| `resume.linkSent` | Niba hari ubusabe butarangiye kuri iyi meyili, link iri mu nzira. Reba imeyili yawe. | If there is an open application for this address, a link is on its way. Check your email. | needs native-speaker review |
| `submitted.title` | Ubusabe bwoherejwe | Application submitted | needs native-speaker review |
| `submitted.status` | Aho bugeze: {{status}} | Status: {{status}} | needs native-speaker review |
| `submitted.sessionOver` | Ubusabe bwawe bwoherejwe. Tuzakwandikira ku bikurikiraho. | Your application was submitted. We will email you about the next steps. | needs native-speaker review |
| `submitted.next1` | Tugenzura inyandiko zawe, akenshi mu minsi mike y'akazi. | We check your documents, usually within a few working days. | needs native-speaker review |
| `submitted.next2` | Niba hari ikibura, tukoherereza link yo gukosora. | If something is missing, we email you a link to make changes. | needs native-speaker review |
| `submitted.next3` | Nibwemerwa, tuzatumira umuyobozi w'ikigo cyawe gutegura MediLink. | Once approved, we invite your facility administrator to set up MediLink. | needs native-speaker review |
| `submitted.home` | Subira ahabanza | Back to the home page | needs native-speaker review |
| `status.draft` | Bitarangiye | Draft | needs native-speaker review |
| `status.submitted` | Byoherejwe | Submitted | needs native-speaker review |
| `status.under_review` | Birimo gusuzumwa | Under review | needs native-speaker review |
| `status.changes_requested` | Hasabwe impinduka | Changes requested | needs native-speaker review |
| `status.approved` | Byemewe | Approved | needs native-speaker review |
| `status.rejected` | Ntibyemewe | Not approved | needs native-speaker review |
| `steps.facility` | Ikigo | Facility | needs native-speaker review |
| `steps.location` | Aho giherereye | Location | needs native-speaker review |
| `steps.documents` | Inyandiko | Documents | needs native-speaker review |
| `steps.admin` | Umuyobozi | Administrator | needs native-speaker review |
| `steps.review` | Genzura wohereze | Review and submit | needs native-speaker review |
| `wizard.title` | Ubusabe bwo kwiyandikisha | Facility application | needs native-speaker review |
| `wizard.stepsLabel` | Intambwe z'ubusabe | Application steps | needs native-speaker review |
| `wizard.completed` | byarangiye | completed | needs native-speaker review |
| `wizard.needsAttention` | bikeneye gukosorwa | needs attention | needs native-speaker review |
| `wizard.back` | Subira inyuma | Back | needs native-speaker review |
| `wizard.next` | Komeza | Next | needs native-speaker review |
| `wizard.continueLater` | Komeza nyuma | Continue later | needs native-speaker review |
| `wizard.changesRequested` | Itsinda ryacu ryasabye impinduka | Our team asked for changes | needs native-speaker review |
| `wizard.sessionOver` | Igihe cyawe kuri ubu busabe cyarangiye. Saba link nshya kugira ngo ukomeze. | Your session for this application has ended. Ask for a new link to continue. | needs native-speaker review |
| `save.saving` | Birabikwa… | Saving… | needs native-speaker review |
| `save.saved` | Byabitswe saa {{time}} | Saved {{time}} | needs native-speaker review |
| `save.retrying` | Ntibyabitswe, turongera tugerageza… | Not saved, retrying… | needs native-speaker review |
| `save.conflict` | Ubu busabe bwahinduwe ahandi. Twafunguye verisiyo iheruka; reba impinduka yawe iheruka. | This application changed somewhere else. We reloaded the latest version; check your last change. | needs native-speaker review |
| `fields.facilityName` | Izina ry'ikigo | Facility name | needs native-speaker review |
| `fields.facilityType` | Ubwoko bw'ikigo | Type of facility | needs native-speaker review |
| `fields.ownership` | Nyir'ikigo | Ownership | needs native-speaker review |
| `fields.organization` | Ikigo cyemewe n'amategeko | Organisation (legal name) | needs native-speaker review |
| `fields.facilityPhone` | Telefoni y'ikigo | Facility phone | needs native-speaker review |
| `fields.facilityEmail` | Imeyili y'ikigo | Facility email | needs native-speaker review |
| `fields.yourName` | Amazina yawe yose | Your full name | needs native-speaker review |
| `fields.email` | Imeyili | Email | needs native-speaker review |
| `fields.phone` | Telefoni | Phone | needs native-speaker review |
| `fields.position` | Umwanya ukoraho | Your position | needs native-speaker review |
| `fields.choose` | Hitamo… | Choose… | needs native-speaker review |
| `fields.optionalSuffix` | (si ngombwa) | (optional) | needs native-speaker review |
| `fields.yourPhone` | Telefoni yawe | Your phone | needs native-speaker review |
| `ownership.public` | Icya Leta | Public | needs native-speaker review |
| `ownership.private` | Icyigenga | Private | needs native-speaker review |
| `ownership.faith_based` | Icy'idini | Faith-based | needs native-speaker review |
| `ownership.ngo` | Umuryango utegamiye kuri Leta | NGO | needs native-speaker review |
| `location.province` | Intara | Province | needs native-speaker review |
| `location.district` | Akarere | District | needs native-speaker review |
| `location.sector` | Umurenge | Sector | needs native-speaker review |
| `location.cell` | Akagari | Cell | needs native-speaker review |
| `location.village` | Umudugudu | Village | needs native-speaker review |
| `location.address` | Aderesi | Street address | needs native-speaker review |
| `location.addressHint` | Urugero: KG 11 Ave 5, iruhande rw'isoko. | For example: KG 11 Ave 5, next to the market. | needs native-speaker review |
| `location.useMine` | Koresha aho ndi | Use my location | needs native-speaker review |
| `location.coords` | Aho uri habitswe: {{lat}}, {{lng}} | Location saved: {{lat}}, {{lng}} | needs native-speaker review |
| `location.saved` | Aho uri habitswe. | Your location is saved. | needs native-speaker review |
| `location.outsideRwanda` | Aho hantu hari hanze y'u Rwanda. Ongera ugerageze uri ku kigo, cyangwa usimbuke iyi ntambwe. | That location is outside Rwanda. Stand at the facility and try again, or skip this. | needs native-speaker review |
| `location.geoDenied` | Ntitwashoboye kubona aho uri. Ushobora gusimbuka iyi ntambwe. | We couldn't get your location. You can skip this. | needs native-speaker review |
| `location.geoUnavailable` | Mushakisha yawe ntishobora gutanga aho uri. Ushobora gusimbuka iyi ntambwe. | Your browser can't share a location. You can skip this. | needs native-speaker review |
| `documents.intro` | Ohereza amafoto agaragara neza cyangwa PDF. Buri dosiye igenzurwamo virusi mbere y'uko itsinda ryacu riyifungura. | Upload clear photos or PDFs. Each file is checked for viruses before our team can open it. | needs native-speaker review |
| `documents.chooseOwnership` | Hitamo nyir'ikigo ku ntambwe y'Ikigo kugira ngo ubone inyandiko zikenewe. | Choose the ownership on the Facility step to see which documents you need. | needs native-speaker review |
| `documents.kinds.moh_licence` | Uruhushya rwa MINISANTE | MoH operating licence | needs native-speaker review |
| `documents.kinds.rdb_registration` | Icyemezo cya RDB | RDB registration | needs native-speaker review |
| `documents.kinds.tin_certificate` | Icyemezo cya TIN | TIN certificate | needs native-speaker review |
| `documents.kinds.accreditation` | Icyemezo cy'ubuziranenge | Accreditation | needs native-speaker review |
| `documents.kinds.insurer_contract` | Amasezerano n'ubwishingizi | Insurer contract | needs native-speaker review |
| `documents.kinds.other` | Indi nyandiko | Other document | needs native-speaker review |
| `documents.number` | Nimero y'uruhushya | Licence number | needs native-speaker review |
| `documents.expires` | Itariki rurangiriraho | Expiry date | needs native-speaker review |
| `documents.numberRequired` | Ongeraho nimero n'itariki rurangiriraho, hanyuma wongere wohereze uruhushya. | Add the licence number and expiry date, then upload the licence again. | needs native-speaker review |
| `documents.insurers` | Ibigo by'ubwishingizi mukorana | Insurers you work with | needs native-speaker review |
| `documents.insurersHint` | Si ngombwa. Ongeraho amasezerano ya buri kigo niba uyafite. | Optional. Add a contract for each insurer if you have one. | needs native-speaker review |
| `documents.insurerContract` | Amasezerano na {{insurer}} | Contract with {{insurer}} | needs native-speaker review |
| `upload.drop` | Kurura dosiye hano, cyangwa | Drag a file here, or | needs native-speaker review |
| `upload.browse` | Hitamo dosiye | Choose a file | needs native-speaker review |
| `upload.camera` | Fata ifoto | Take a photo | needs native-speaker review |
| `upload.hint` | PDF, JPEG, PNG cyangwa HEIC, kugeza kuri MB 10. | PDF, JPEG, PNG or HEIC, up to 10 MB. | needs native-speaker review |
| `upload.retry` | Ongera ugerageze | Try again | needs native-speaker review |
| `upload.remove` | Kuraho | Remove | needs native-speaker review |
| `upload.tooLarge` | Iyi dosiye irenze MB 10. | This file is larger than 10 MB. | needs native-speaker review |
| `upload.wrongType` | Ohereza dosiye ya PDF, JPEG, PNG cyangwa HEIC. | Upload a PDF, JPEG, PNG or HEIC file. | needs native-speaker review |
| `upload.status.uploading` | Biroherezwa | Uploading | needs native-speaker review |
| `upload.status.pending` | Birimo kugenzurwa | Checking for viruses | needs native-speaker review |
| `upload.status.clean` | Byiteguye | Ready | needs native-speaker review |
| `upload.status.infected` | Habonetse virusi: ohereza indi dosiye | Virus found: upload another file | needs native-speaker review |
| `upload.status.rejected` | Byanzwe: ohereza indi dosiye | Refused: upload another file | needs native-speaker review |
| `upload.status.failed` | Kugenzura byanze: ongera wohereze | Check failed: upload again | needs native-speaker review |
| `upload.status.error` | Ntibyoherejwe | Not uploaded | needs native-speaker review |
| `admin.intro` | Ni nde uzayobora MediLink ku kigo? Tuzamutumira ikigo nikimara kwemerwa. | Who will manage MediLink at the facility? We invite this person once the facility is approved. | needs native-speaker review |
| `admin.name` | Amazina y'umuyobozi | Administrator's full name | needs native-speaker review |
| `admin.email` | Imeyili y'umuyobozi | Administrator's email | needs native-speaker review |
| `admin.phone` | Telefoni y'umuyobozi | Administrator's phone | needs native-speaker review |
| `review.edit` | Hindura | Edit | needs native-speaker review |
| `review.agreements` | Amasezerano | Agreements | needs native-speaker review |
| `review.terms` | Nemera amabwiriza yo gukoresha MediLink ku bigo. | I accept the MediLink terms of use for facilities. | needs native-speaker review |
| `review.dpa` | Nemera amasezerano yo gutunganya amakuru mu izina ry'ikigo. | I accept the data processing agreement on behalf of the facility. | needs native-speaker review |
| `review.ncsa` | Nemeza ko ikigo cyiyandikishije muri NCSA nk'ugenzura amakuru, cyangwa kizabikora mbere yo gutangira. | I confirm the facility is registered with the National Cyber Security Authority as a data controller, or will be before going live. | needs native-speaker review |
| `review.termsRequired` | Emera amabwiriza yo gukoresha. | Accept the terms of use. | needs native-speaker review |
| `review.dpaRequired` | Emera amasezerano yo gutunganya amakuru. | Accept the data processing agreement. | needs native-speaker review |
| `review.ncsaRequired` | Emeza kwiyandikisha muri NCSA. | Confirm the NCSA registration. | needs native-speaker review |
| `review.submit` | Ohereza ubusabe | Submit the application | needs native-speaker review |
| `review.problemsTitle` | Mbere yo kohereza | Before you submit | needs native-speaker review |
| `review.stillMissing` | Biracyabura | Still missing | needs native-speaker review |
| `missing.facility.name` | izina ry'ikigo | facility name | needs native-speaker review |
| `missing.facility.facility_type` | ubwoko bw'ikigo | type of facility | needs native-speaker review |
| `missing.facility.ownership` | nyir'ikigo | ownership | needs native-speaker review |
| `missing.facility.phone` | telefoni y'ikigo | facility phone | needs native-speaker review |
| `missing.facility.email` | imeyili y'ikigo | facility email | needs native-speaker review |
| `missing.location.village_code` | umudugudu | village | needs native-speaker review |
| `missing.location.address` | aderesi | street address | needs native-speaker review |
| `missing.applicant.name` | amazina yawe | your name | needs native-speaker review |
| `missing.applicant.email` | imeyili yawe | your email | needs native-speaker review |
| `missing.applicant.phone` | telefoni yawe | your phone | needs native-speaker review |
| `missing.proposed_admin.name` | amazina y'umuyobozi | administrator's name | needs native-speaker review |
| `missing.proposed_admin.email` | imeyili y'umuyobozi | administrator's email | needs native-speaker review |
| `missing.proposed_admin.phone` | telefoni y'umuyobozi | administrator's phone | needs native-speaker review |
| `missing.documents.moh_licence` | uruhushya rwa MINISANTE rufite nimero n'itariki | MoH operating licence with number and expiry | needs native-speaker review |
| `missing.documents.rdb_registration` | icyemezo cya RDB | RDB registration | needs native-speaker review |
| `missing.documents.tin_certificate` | icyemezo cya TIN | TIN certificate | needs native-speaker review |
| `validation.required` | Iki gice kigomba kuzuzwa. | This is required. | needs native-speaker review |
| `validation.email` | Andika imeyili nka izina@urugero.com. | Enter an email address like name@example.com. | needs native-speaker review |

## patient-web feature: profile (namespace profile)

File: `apps/patient-web/src/features/profile/locales/rw.json`

| Key | Kinyarwanda (draft) | English source | Status |
|---|---|---|---|
| `title` | Umwirondoro wanjye | My profile | needs native-speaker review |
| `notFound` | Ntitwabonye uyu mwirondoro. | We couldn't find this profile. | needs native-speaker review |
| `switch` | Hindura umwirondoro | Switch profile | needs native-speaker review |
| `breadcrumb` | Aho uri | Where you are | needs native-speaker review |
| `home` | Ahabanza | Home | needs native-speaker review |
| `backToProfile` | Subira ku mwirondoro | Back to profile | needs native-speaker review |
| `save` | Bika | Save | needs native-speaker review |
| `saved` | Byabitswe. | Saved. | needs native-speaker review |
| `cancel` | Reka | Cancel | needs native-speaker review |
| `close` | Funga | Close | needs native-speaker review |
| `error` | Habaye ikibazo. Reba internet yawe wongere ugerageze. | Something went wrong. Check your connection and try again. | needs native-speaker review |
| `relationship.self` | Wowe | You | needs native-speaker review |
| `relationship.guardian` | Umwana wawe | Your child | needs native-speaker review |
| `relationship.delegate` | Wasangijwe | Shared with you | needs native-speaker review |
| `medilinkNumber` | Nomero yawe ya MediLink | Your MediLink number | needs native-speaker review |
| `sectionsLabel` | Ibice by'umwirondoro | Profile sections | needs native-speaker review |
| `sections.details` | Amakuru yanjye | My details | needs native-speaker review |
| `sections.identifiers` | Ibyangombwa | Identity documents | needs native-speaker review |
| `sections.insurance` | Ubwishingizi | Insurance | needs native-speaker review |
| `sections.health` | Allergie n'ubuzima | Allergies and health | needs native-speaker review |
| `sections.history` | Abafunguye dosiye yanjye | Who opened my record | needs native-speaker review |
| `completion.title` | Uzuza umwirondoro wawe | Complete your profile | needs native-speaker review |
| `completion.details` | Amazina, itariki y'amavuko n'igitsina | Name, birth date and sex | needs native-speaker review |
| `completion.identifier` | Icyangombwa | An identity document | needs native-speaker review |
| `completion.emergency_contact` | Uwo guhamagara mu byihutirwa | Someone to call in an emergency | needs native-speaker review |
| `completion.care_consent` | Uruhushya rwo kuvurwa | Consent to care | needs native-speaker review |
| `completion.insurance` | Ikarita y'ubwishingizi | Insurance card | needs native-speaker review |
| `completion.allergies_reviewed` | Allergie zagenzuwe | Allergies checked | needs native-speaker review |
| `completion.done` | byakozwe | done | needs native-speaker review |
| `completion.todo` | bigikenewe | to do | needs native-speaker review |
| `completion.next` | Igikurikira: {{step}} | Next: {{step}} | needs native-speaker review |
| `completion.progress` | {{done}} kuri {{total}} byakozwe | {{done}} of {{total}} done | needs native-speaker review |
| `fields.fullName` | Amazina | Names | needs native-speaker review |
| `fields.dateOfBirth` | Itariki y'amavuko | Date of birth | needs native-speaker review |
| `fields.sex` | Igitsina | Sex | needs native-speaker review |
| `fields.phone` | Telefoni | Phone | needs native-speaker review |
| `fields.email` | Imeyili | Email | needs native-speaker review |
| `fields.address` | Aderesi | Address | needs native-speaker review |
| `fields.emergencyContact` | Uwo guhamagara mu byihutirwa | Emergency contact | needs native-speaker review |
| `fields.ecName` | Amazina ye | Their names | needs native-speaker review |
| `fields.ecPhone` | Telefoni ye | Their phone | needs native-speaker review |
| `fields.ecRelationship` | Icyo mupfana | How you know them | needs native-speaker review |
| `sex.female` | Gore | Female | needs native-speaker review |
| `sex.male` | Gabo | Male | needs native-speaker review |
| `sex.other` | Ikindi | Other | needs native-speaker review |
| `details.delegateNote` | Nyir'umwirondoro cyangwa umurera ni bo bonyine bahindura amazina, itariki y'amavuko n'igitsina. | Only the person or their guardian can change names, birth date and sex. | needs native-speaker review |
| `identifierKinds.national_id` | Indangamuntu | National ID | needs native-speaker review |
| `identifierKinds.passport` | Pasiporo | Passport | needs native-speaker review |
| `identifierKinds.refugee_id` | Ikarita y'impunzi | Refugee ID | needs native-speaker review |
| `identifierKinds.birth_certificate` | Icyemezo cy'amavuko | Birth certificate | needs native-speaker review |
| `identifiers.none` | Nta cyangombwa kirashyirwamo. | No identity document yet. | needs native-speaker review |
| `identifiers.checked` | Cyagenzuwe mu kigo nderabuzima | Checked at a facility | needs native-speaker review |
| `identifiers.add` | Ongeramo icyangombwa | Add an identity document | needs native-speaker review |
| `identifiers.kind` | Icyangombwa | Document | needs native-speaker review |
| `identifiers.number` | Nomero y'icyangombwa | Document number | needs native-speaker review |
| `identifiers.country` | Igihugu cyagitanze (inyuguti ebyiri) | Issuing country (two letters) | needs native-speaker review |
| `identifiers.claim` | Saba iyi dosiye | Claim this record | needs native-speaker review |
| `reveal.show` | Erekana | Show | needs native-speaker review |
| `reveal.hide` | Hisha | Hide | needs native-speaker review |
| `reveal.showing` | Birerekanwa… | Showing… | needs native-speaker review |
| `insurers.mutuelle` | Mituweli | Mutuelle de Santé | needs native-speaker review |
| `insurers.rssb` | RSSB (RAMA) | RSSB (RAMA) | needs native-speaker review |
| `insurers.mmi` | MMI | MMI | needs native-speaker review |
| `insurers.radiant` | Radiant | Radiant | needs native-speaker review |
| `insurance.none` | Nta karita y'ubwishingizi irashyirwamo. | No insurance card yet. | needs native-speaker review |
| `insurance.expired` | Yarangiye | Expired | needs native-speaker review |
| `insurance.status.unverified` | Ntiragenzurwa | Not checked yet | needs native-speaker review |
| `insurance.status.verified` | Yagenzuwe | Verified | needs native-speaker review |
| `insurance.status.rejected` | Yanzwe | Rejected | needs native-speaker review |
| `insurance.inactive` | Ntikoreshwa | Not in use | needs native-speaker review |
| `insurance.lastVerified` | Yakoreshejwe kuri {{facility}} ku wa {{date}}, iragenzurwa | Used at {{facility}} on {{date}}, verified | needs native-speaker review |
| `insurance.deactivate` | Reka gukoresha iyi karita | Stop using this card | needs native-speaker review |
| `insurance.add` | Ongeramo ikarita y'ubwishingizi | Add an insurance card | needs native-speaker review |
| `insurance.insurer` | Umwishingizi | Insurer | needs native-speaker review |
| `insurance.memberNumber` | Nomero y'umunyamuryango | Member number | needs native-speaker review |
| `health.askAllergies` | Hari allergie ufite? | Do you have any allergies? | needs native-speaker review |
| `health.noKnownAllergies` | Nta allergie nzi mfite | I have no known allergies | needs native-speaker review |
| `health.noKnownAllergiesSet` | Nta allergie izwi | No known allergies | needs native-speaker review |
| `health.allergies` | Allergie | Allergies | needs native-speaker review |
| `health.conditions` | Indwara zidakira | Long-term conditions | needs native-speaker review |
| `health.medications` | Imiti mfata | Medicines I take | needs native-speaker review |
| `health.none` | Nta kirashyirwamo. | Nothing added. | needs native-speaker review |
| `health.unverified` | Ntiragenzurwa | Unverified | needs native-speaker review |
| `health.remove` | Kuramo | Remove | needs native-speaker review |
| `health.add.allergies` | Ongeramo allergie | Add an allergy | needs native-speaker review |
| `health.add.conditions` | Ongeramo indwara | Add a condition | needs native-speaker review |
| `health.add.medications` | Ongeramo umuti | Add a medicine | needs native-speaker review |
| `health.addButton` | Ongeramo | Add | needs native-speaker review |
| `history.intro` | Igihe cyose umuntu afunguye cyangwa ahinduye dosiye yawe, bigaragara hano. | Every time someone opens or changes your record, it appears here. | needs native-speaker review |
| `history.none` | Nta muntu urafungura dosiye yawe. | No one has opened your record yet. | needs native-speaker review |
| `history.roles.receptionist` | Umwakirizi | Receptionist | needs native-speaker review |
| `history.roles.doctor` | Muganga | Doctor | needs native-speaker review |
| `history.roles.facility_admin` | Umuyobozi w'ikigo | Facility administrator | needs native-speaker review |
| `history.roles.pharmacist` | Umufarumasiye | Pharmacist | needs native-speaker review |
| `history.actors.staff` | Umukozi | Staff | needs native-speaker review |
| `history.actors.self` | Wowe | You | needs native-speaker review |
| `history.actors.linked_account` | Uwo musangiye | Someone you share with | needs native-speaker review |
| `history.actors.platform` | Itsinda rya MediLink | MediLink team | needs native-speaker review |
| `history.actors.system` | MediLink | MediLink | needs native-speaker review |
| `history.actions.patients.walk_in.registered` | yakwanditse | registered you | needs native-speaker review |
| `history.actions.patients.existing.added` | yakongeye mu kigo cye | added you to their facility | needs native-speaker review |
| `history.actions.patients.record.viewed` | yarebye amakuru yawe | viewed your details | needs native-speaker review |
| `history.actions.patients.record.updated` | yahinduye amakuru yawe | changed your details | needs native-speaker review |
| `history.actions.patients.identifier.added` | yongeyemo icyangombwa | added an identity document | needs native-speaker review |
| `history.actions.patients.identifier.superseded` | yasimbuje icyangombwa | replaced an identity document | needs native-speaker review |
| `history.actions.patients.identifier.verified` | yagenzuye icyangombwa cyawe | checked your identity document | needs native-speaker review |
| `history.actions.patients.identifier.revealed` | yarebye nomero yawe yose y'indangamuntu | looked at your full ID number | needs native-speaker review |
| `history.actions.patients.phone.revealed` | yarebye nimero yawe ya telefoni | looked at your phone number | needs native-speaker review |
| `history.actions.patients.delegation.created` | yakoze kode yo gusangiza | created a sharing code | needs native-speaker review |
| `history.actions.patients.delegation.accepted` | yemeye kubona umwirondoro wawe | accepted access to your profile | needs native-speaker review |
| `history.actions.patients.delegation.revoked` | yahagaritse kubona umwirondoro wawe | ended access to your profile | needs native-speaker review |
| `history.actions.patients.insurance.added` | yongeyemo ikarita y'ubwishingizi | added an insurance card | needs native-speaker review |
| `history.actions.patients.insurance.updated` | yahinduye ikarita y'ubwishingizi | changed an insurance card | needs native-speaker review |
| `history.actions.patients.insurance.verified` | yagenzuye ikarita yawe y'ubwishingizi | verified your insurance card | needs native-speaker review |
| `history.actions.patients.insurance.rejected` | yanze ikarita yawe y'ubwishingizi | rejected your insurance card | needs native-speaker review |
| `history.actions.patients.insurance.deactivated` | yahagaritse ikarita y'ubwishingizi | stopped using an insurance card | needs native-speaker review |
| `history.actions.patients.health_profile.viewed` | yarebye allergie n'ubuzima bwawe | viewed your allergies and health | needs native-speaker review |
| `history.actions.patients.health_item.added` | yongeyemo amakuru y'ubuzima | added a health item | needs native-speaker review |
| `history.actions.patients.health_item.reviewed` | yagenzuye amakuru y'ubuzima | checked a health item | needs native-speaker review |
| `history.actions.patients.consent.recorded` | yanditse uruhushya | recorded a consent | needs native-speaker review |
| `history.actions.patients.claim.completed` | yahuje dosiye na konti yawe | linked a record to your account | needs native-speaker review |
| `history.actions.patients.merge.executed` | yahuje dosiye zawe ebyiri | joined two of your records | needs native-speaker review |
| `history.actions.patients.merge.undone` | yatandukanyije dosiye ebyiri | separated two records | needs native-speaker review |
| `history.actions.other` | yakoresheje dosiye yawe | used your record | needs native-speaker review |
| `family.title` | Umuryango no gusangiza | Family and sharing | needs native-speaker review |
| `family.profiles` | Imyirondoro ucunga | Profiles you manage | needs native-speaker review |
| `family.access` | Ubona iki | Who can see what | needs native-speaker review |
| `family.noAccess` | Nta mwirondoro urasangiza. | You haven't shared any profile. | needs native-speaker review |
| `family.grantedRow` | {{holder}} ashobora kubona {{profile}} | {{holder}} can see {{profile}} | needs native-speaker review |
| `family.receivedRow` | Ushobora kubona {{profile}} | You can see {{profile}} | needs native-speaker review |
| `family.pendingRow` | Kode ya {{profile}}, ikora kugeza ku wa {{date}} | Code for {{profile}}, valid until {{date}} | needs native-speaker review |
| `family.revoke` | Hagarika uburenganzira | End access | needs native-speaker review |
| `family.leave` | Va | Leave | needs native-speaker review |
| `family.cancelInvite` | Hagarika kode | Cancel code | needs native-speaker review |
| `family.revokeTitle` | Guhagarika ubu burenganzira? | End this access? | needs native-speaker review |
| `family.revokeConsequences` | {{name}} ntazongera kubona uyu mwirondoro. | {{name}} will no longer see this profile. | needs native-speaker review |
| `family.add` | Ongeramo umuntu wo mu muryango | Add a family member | needs native-speaker review |
| `family.who` | Uwo wongeramo ni nde? | Who are you adding? | needs native-speaker review |
| `family.child` | Umwana wanjye (munsi y'imyaka 18) | My child (under 18) | needs native-speaker review |
| `family.adult` | Umuntu mukuru wabyemeye | An adult who agreed | needs native-speaker review |
| `family.attest` | Uyu muntu mukuru yemeye ko ncunga umwirondoro we | This adult agreed that I manage their profile | needs native-speaker review |
| `family.inviteTitle` | Sangiza umwirondoro | Share a profile | needs native-speaker review |
| `family.inviteHint` | Kora kode ikoreshwa rimwe ku muntu wo mu muryango. Ayinjiza muri konti ye ya MediLink. | Create a one-time code for a family member. They enter it in their MediLink account. | needs native-speaker review |
| `family.profileToShare` | Umwirondoro wo gusangiza | Profile to share | needs native-speaker review |
| `family.password` | Ijambo ry'ibanga ryawe | Your password | needs native-speaker review |
| `family.createCode` | Kora kode | Create a code | needs native-speaker review |
| `family.codeOnce` | Iha uwo muntu iyi kode. Ikora rimwe, mu minsi 7, kandi ntizongera kugaragara. | Give this code to the person. It works once, for 7 days, and won't be shown again. | needs native-speaker review |
| `family.code` | Kode yo gusangiza | Sharing code | needs native-speaker review |
| `family.copy` | Koporora | Copy | needs native-speaker review |
| `family.copied` | Byakoporowe | Copied | needs native-speaker review |
| `family.done` | Birarangiye | Done | needs native-speaker review |
| `family.acceptTitle` | Injiza kode wahawe | Enter a code someone gave you | needs native-speaker review |
| `family.accept` | Emera | Accept | needs native-speaker review |
| `family.accepted` | Ubu ushobora kubona umwirondoro wa {{name}}. | You can now see {{name}}'s profile. | needs native-speaker review |
| `privacy.title` | Ibanga n'uruhushya | Privacy and consent | needs native-speaker review |
| `privacy.research` | Koresha amakuru yanjye mu bushakashatsi ku buzima | Use my data for health research | needs native-speaker review |
| `privacy.researchHint` | Amakuru atagaragaza uwo ari we gusa, ku bushakashatsi bwemewe. Ushobora guhindura igihe cyose. | Only anonymised data, and only for approved studies. You can change this any time. | needs native-speaker review |
| `privacy.on` | Birafunguye | On | needs native-speaker review |
| `privacy.off` | Birafunze | Off | needs native-speaker review |
| `privacy.care` | Uruhushya rwo kuvurwa | Consent to care | needs native-speaker review |
| `privacy.careHint` | Ibigo nderabuzima birukenera kugira ngo bibike dosiye yawe y'ubuzima. | Facilities need this to keep your health record. | needs native-speaker review |
| `privacy.history` | Reba abafunguye dosiye yanjye | See who opened my record | needs native-speaker review |
| `privacy.later` | Gukuramo cyangwa gusiba amakuru yawe bizaboneka nyuma. | Downloading or deleting your data will be available later. | needs native-speaker review |
| `claim.title` | Saba dosiye yanjye | Claim my record | needs native-speaker review |
| `claim.intro` | Niba ikigo nderabuzima cyarakwanditse utarafungura konti, huza iyo dosiye na konti yawe. | If a facility registered you before you had an account, link that record to your account. | needs native-speaker review |
| `claim.way` | Urashaka kuyishaka ute? | How do you want to find it? | needs native-speaker review |
| `claim.ways.medilink_number` | Nomero ya MediLink | MediLink number | needs native-speaker review |
| `claim.ways.national_id` | Indangamuntu | National ID | needs native-speaker review |
| `claim.ways.phone` | Telefoni n'amazina | Phone and names | needs native-speaker review |
| `claim.start` | Shaka dosiye yanjye | Find my record | needs native-speaker review |
| `claim.codeSent` | Twohereje kode y'imibare 6 kuri {{hint}}. | We sent a 6-digit code to {{hint}}. | needs native-speaker review |
| `claim.code` | Kode | Code | needs native-speaker review |
| `claim.confirm` | Emeza | Confirm | needs native-speaker review |
| `claim.receptionHint` | Erekana iyi nomero n'icyangombwa ku iyakira. Ikora iminsi 7. | Show this reference and an identity document at reception. It's valid for 7 days. | needs native-speaker review |
| `claim.reference` | Nomero y'ubusabe | Claim reference | needs native-speaker review |
| `claim.done` | Dosiye yawe ubu ihujwe na konti yawe. | Your record is now linked to your account. | needs native-speaker review |
| `claim.open` | Fungura umwirondoro wanjye | Open my profile | needs native-speaker review |
| `numberHint` | Erekana iyi nimero ku kigo icyo ari cyo cyose kugira ngo babone dosiye yawe vuba. | Show this number at any facility so staff find your record quickly. | needs native-speaker review |
| `sectionHints.details` | Amazina, itariki y’amavuko, telefoni, uwo guhamagara mu byihutirwa | Name, birth date, phone, emergency contact | needs native-speaker review |
| `sectionHints.identifiers` | Indangamuntu, pasiporo cyangwa ikarita y’impunzi | National ID, passport or refugee ID | needs native-speaker review |
| `sectionHints.insurance` | Amakarita yawe y’ubwishingizi | Your insurance cards | needs native-speaker review |
| `sectionHints.health` | Allergie, indwara, imiti y’igihe kirekire | Allergies, conditions, long-term medicines | needs native-speaker review |
| `sectionHints.history` | Igihe cyose abakozi bafunguye dosiye yawe | Every time staff opened your record | needs native-speaker review |
| `homeFamily.title` | Umuryango | Family | needs native-speaker review |
| `homeFamily.manage` | Gucunga | Manage | needs native-speaker review |
| `homeFamily.empty` | Ongeraho umwana cyangwa uwo witaho, kugira ngo ukurikirane gahunda ze. | Add a child or someone you care for, to follow their visits too. | needs native-speaker review |
| `homeFamily.add` | Ongeraho uwo mu muryango | Add a family member | needs native-speaker review |

## patient-web feature: tracker (namespace tracker)

File: `apps/patient-web/src/features/tracker/locales/rw.json`

| Key | Kinyarwanda (draft) | English source | Status |
|---|---|---|---|
| `title` | Umwanya wawe ku murongo | Your place in the queue | needs native-speaker review |
| `backHome` | Ahabanza | Home | needs native-speaker review |
| `loading` | Tike yawe irafunguka… | Loading your ticket… | needs native-speaker review |
| `offline` | Nta interineti ufite | You are offline | needs native-speaker review |
| `lastUpdated` | Byavuguruwe saa {{time}} | Last updated {{time}} | needs native-speaker review |
| `noVisitTitle` | Nta tike ufite uyu munsi | No ticket today | needs native-speaker review |
| `noVisit` | Uru ruzinduko rwarangiye cyangwa rwahagaritswe. | This visit has ended or was cancelled. | needs native-speaker review |
| `yourTicket` | Nimero ya tike yawe | Your ticket number | needs native-speaker review |
| `ahead_one` | Umuntu {{count}} akuri imbere | {{count}} person ahead of you | needs native-speaker review |
| `ahead_other` | Abantu {{count}} bakuri imbere | {{count}} people ahead of you | needs native-speaker review |
| `calledTo` | Jya muri {{room}} ubu | Go to {{room}} now | needs native-speaker review |
| `inService` | Uri kwa muganga | You are with the doctor | needs native-speaker review |
| `stagesTitle` | Uruzinduko rwawe | Your visit | needs native-speaker review |
| `stages.consultation` | Muganga | Doctor | needs native-speaker review |
| `stages.payment` | Kwishyura | Payment | needs native-speaker review |
| `stages.pharmacy` | Farumasi | Pharmacy | needs native-speaker review |
| `wait` | Hafi iminota {{min}}–{{max}} | About {{min}}–{{max}} min | needs native-speaker review |
| `leaveBy` | Va mu rugo saa {{time}} | Leave home by {{time}} | needs native-speaker review |
| `status.break` | Muganga ari mu kiruhuko kugeza saa {{time}} | The doctor is on a break until {{time}} | needs native-speaker review |
| `status.emergency` | Muganga ari mu byihutirwa. Bishobora gutinda. | The doctor is with an emergency. Delays are possible. | needs native-speaker review |
| `status.none_on_duty` | Nta muganga uratangira. | No doctor has started yet. | needs native-speaker review |
| `travelLabel` | Iminota kuva mu rugo ugera hano | Minutes from home to here | needs native-speaker review |
| `travelHint` | Tuzakubwira igihe cyo kuva mu rugo. | We tell you when to leave. | needs native-speaker review |
| `travelSave` | Bika | Save | needs native-speaker review |
| `cancel` | Reka umwanya wanjye | Cancel my place | needs native-speaker review |
| `cancelTitle` | Urareka umwanya wawe? | Cancel your place? | needs native-speaker review |
| `cancelBody` | Tike {{ticket}} izakurwa ku murongo. | Ticket {{ticket}} will be removed from the queue. | needs native-speaker review |
| `cancelConfirm` | Yego, reka | Yes, cancel | needs native-speaker review |
| `keep` | Guma ku murongo | Keep my place | needs native-speaker review |
| `close` | Funga | Close | needs native-speaker review |
| `failed` | Ntibyakunze. Ongera ugerageze. | That did not work. Try again. | needs native-speaker review |
| `called` | Ni wowe ugezweho | It's your turn | needs native-speaker review |
| `goTo` | Jya muri {{room}} | Go to {{room}} | needs native-speaker review |
| `coming` | Ndaje | I'm coming | needs native-speaker review |
| `homeTitle` | Uruzinduko rw'uyu munsi | Today's visit | needs native-speaker review |
| `open` | Fungura | Open | needs native-speaker review |
| `states.in_service` | Uri kwa muganga | With the doctor | needs native-speaker review |
| `states.on_hold` | Utegereje ibisubizo | Waiting for results | needs native-speaker review |
| `visits.title` | Gahunda zanjye | My visits | needs native-speaker review |
| `visits.today` | Uyu munsi | Today | needs native-speaker review |
| `visits.loadFailed` | Ntitwashoboye kuzana gahunda z’uyu munsi. | We couldn't load today's visits. | needs native-speaker review |
| `visits.noneToday` | Nta gahunda y’uyu munsi | No visit today | needs native-speaker review |
| `visits.noneTodayBody` | Abakira abarwayi bamaze kukwandika, tike yawe n’umwanya wawe ku murongo bigaragara hano. | When reception checks you in, your ticket and your place in the queue show here. | needs native-speaker review |
| `visits.findCare` | Shaka ubuvuzi | Find care | needs native-speaker review |
| `visits.history` | Gahunda zabanje | Earlier visits | needs native-speaker review |
| `visits.historyEmpty` | Amateka y’isura zawe atangirira hano | Your visit history starts here | needs native-speaker review |
| `visits.historyEmptyBody` | Nyuma ya buri sura, uzahasanga incamake, imiti yawe, inyandiko n’inyemezabwishyu. | After each visit you'll find the summary, your medicines, documents and the receipt here. | needs native-speaker review |

