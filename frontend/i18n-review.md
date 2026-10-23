# Kinyarwanda strings: native-speaker review

Keys: 844.

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

