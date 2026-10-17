# Kinyarwanda strings: native-speaker review

Keys: 328.

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
| `today.title` | Uyu munsi | Today | needs native-speaker review |
| `today.greeting` | Muraho, {{name}} | Hello, {{name}} | needs native-speaker review |
| `today.facility` | Ukorera kuri {{facility}}. | You are working at {{facility}}. | needs native-speaker review |
| `today.platform` | Winjiye nk’umuyobozi w’urubuga. | You are signed in as a platform admin. | needs native-speaker review |
| `today.rolesLabel` | Inshingano zawe hano | Your roles here | needs native-speaker review |
| `today.placeholderTitle` | Ikibaho cy’uyu munsi kiri hafi | Your Today board is on its way | needs native-speaker review |
| `today.placeholderBody` | Abarwayi bategerejwe, abari aho n’umurongo bizagaragara hano guhera kuri Sprint 4. Konti yawe, inshingano n’ikigo byiteguye. | Expected patients, people on site and the live queue will appear here from Sprint 4. Your account, roles and facility are ready. | needs native-speaker review |
| `placeholder.title` | {{section}} | {{section}} | needs native-speaker review |
| `placeholder.body` | Iki gice kizakorwa mu cyiciro gikurikira. | This workspace is planned for a later sprint. | needs native-speaker review |
| `placeholder.back` | Subira ku Uyu munsi | Back to Today | needs native-speaker review |
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
| `landing.search.comingSoon` | Gushakisha biraza vuba. Kugeza icyo gihe, baza ku kigo cy’ubuvuzi cyawe. | Search opens soon. Until then, ask at your health facility. | needs native-speaker review |
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
| `landing.facilities.title` | Ku bigo by’ubuvuzi | For health facilities | needs native-speaker review |
| `landing.facilities.body` | Cunga umurongo, amadosiye n’inyemezabwishyu ahantu hamwe, kandi abarwayi bakubone byoroshye. | Run your queue, records and billing in one place, and let patients find you. | needs native-speaker review |
| `landing.facilities.cta` | Andikisha ikigo cyawe | Register your facility | needs native-speaker review |
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
| `home.greeting` | Muraho, {{name}} | Hello, {{name}} | needs native-speaker review |
| `home.intro` | Urashaka gukora iki uyu munsi? | What would you like to do today? | needs native-speaker review |
| `home.findCare` | Shaka ubuvuzi | Find care | needs native-speaker review |
| `home.nextVisitTitle` | Uruzinduko rwawe rukurikira | Your next visit | needs native-speaker review |
| `home.nextVisitEmpty` | Nta ruzinduko ruraba. Niwafata igihe cyangwa ukajya ku murongo, bizagaragara hano. | No visits yet. When you book or join a queue, it will show here. | needs native-speaker review |
| `home.verifyEmailTitle` | Emeza imeyili yawe | Confirm your email | needs native-speaker review |
| `home.verifyEmailBody` | Twohereje ihuriro kuri {{email}}. Emeza imeyili yawe mbere yo kubona amadosiye y’ubuzima bwawe. | We sent a link to {{email}}. Confirm your email before you can see your health records. | needs native-speaker review |
| `home.settingsTitle` | Imigaragarire | Display | needs native-speaker review |
| `home.accountLabel` | Winjiye nka {{name}} | Signed in as {{name}} | needs native-speaker review |
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

