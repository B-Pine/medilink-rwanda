# 05 · Data protection and cryptography

Status: v0.1 · Addresses OWASP A04:2025 (Cryptographic Failures), ASVS 5.0 Cryptography / Data Protection / Secure Communication, Law 058/2021 security obligations.

## 1. Data classification

| Class | Examples | Handling |
|---|---|---|
| **C4 · Restricted clinical** | Restricted (sensitive) diagnoses, private clinical notes | Field-level encryption; strictest access; never in notifications, logs, exports by default |
| **C3 · Clinical / sensitive identity** | Consultations, prescriptions, results, national ID, insurance numbers, documents | Encrypted at rest (disk + object store); national ID field-encrypted; access logged |
| **C2 · Personal** | Names, phone, email, bookings, bills | Encrypted at rest (disk); access controlled; minimised |
| **C1 · Internal** | Facility configuration, tariffs, anonymised metrics | Access controlled |
| **C0 · Public** | Facility profiles, public pages | Integrity protected |

Every model field gets a class in code (a field option or metadata registry). Logging, exports and de-identification read it automatically.

## 2. In transit

| Link | Protection |
|---|---|
| Browser ↔ edge | TLS 1.3 preferred, TLS 1.2 minimum with modern ciphers (Mozilla "intermediate" profile); HSTS `max-age=31536000; includeSubDomains` (preload once stable); OCSP stapling; certificates auto-renewed (ACME) with expiry alerts |
| Edge ↔ app, app ↔ PostgreSQL / Redis / object storage | TLS inside the private network too (`sslmode=verify-full` for PostgreSQL; Redis TLS), because internal networks get compromised |
| Backups to the second site | Encrypted before leaving the host, over TLS / VPN |
| Email | TLS to the relay; SPF, DKIM, DMARC `p=reject` to stop spoofed "MediLink" emails |
| Web push | Payload encryption per the Web Push standard (RFC 8291); no clinical content |

## 3. At rest

| Layer | Protection |
|---|---|
| Disks (DB, object storage, backups, logs) | Full-disk / volume encryption (LUKS or provider-managed) |
| PostgreSQL | Volume encryption + **application-level encryption** for C4 fields and national ID |
| Object storage (documents, uploads) | Server-side encryption with keys we control (e.g. MinIO SSE with KMS); buckets private; access only through short-lived signed URLs |
| Backups | Encrypted by the backup tool (e.g. pgBackRest `repo-cipher-type=aes-256-cbc`) with keys stored separately from the backups |
| Redis | Holds only transient data (sessions, channel messages, task IDs). No clinical payloads in tasks or messages. |
| Devices (patients' phones, PWA) | Minimal offline cache ([06](06-application-and-api-security.md) §6). Clinical documents cached only when the user chooses "Save for offline". Caches cleared on logout. |

## 4. Field-level encryption

- **Algorithm:** AES-256-GCM (authenticated) via the Python `cryptography` library. Each value stores `key_version | nonce | ciphertext | tag`.
- **Envelope encryption:** data encryption keys (DEKs) are wrapped by a key-encryption key held in the key store (OpenBao/Vault, or an HSM if available), never in the database or the repository.
- **Searching encrypted national IDs:** a **blind index**: `HMAC-SHA256(index_key, normalized_id)` stored beside the ciphertext, with a separate key. Exact-match search works; the ID can't be read from the index.
- **Rotation:** new writes use the new key version; a background job re-encrypts old rows. Old versions are retired after re-encryption.

## 5. Key and secret management

| Secret | Storage | Rotation |
|---|---|---|
| Django `SECRET_KEY` | Key store → environment at start | Yearly or on suspicion (`SECRET_KEY_FALLBACKS` for zero-downtime rotation) |
| DB / Redis / object-store credentials | Key store; per-service accounts | 90 days; immediately when staff with access leave |
| Field-encryption KEK, blind-index key | Key store (OpenBao/Vault); access only from app servers | Yearly; documented procedure |
| TOTP secrets, WebAuthn data | DB, encrypted with an application key | — |
| VAPID keys (web push), DKIM keys | Key store | Yearly |
| Backup encryption keys | Offline copy in two sealed locations + key store | With restore test |
| TLS private keys | On the edge servers only, root-readable | Auto-renewal |

- **Never in git:** gitleaks in CI and GitHub push protection. `.env` files are already ignored. The repository holds only `.env.example`.
- For a small team without a key-store cluster at first: **SOPS + age**-encrypted config files, decrypted at deploy, with keys held by two named people. Move to OpenBao/Vault before go-live.
- Access to production secrets is limited to two named engineers. Every access is logged.

## 6. Integrity

| Item | Protection |
|---|---|
| **Signed clinical records** | SHA-256 of the canonical record content stored at signing; any change → new addendum, never an edit; integrity re-checked when displayed for disputes |
| **Generated documents** | SHA-256 of the PDF stored; the verification page compares; random verification code (≥ 10 characters, ~50 bits, unambiguous alphabet) |
| **Audit log** | Append-only table: `INSERT` only for the app role, `UPDATE`/`DELETE` revoked. **Hash chain**: each entry stores `hash(prev_hash + entry)`. The daily chain head is exported to a separate system (WORM storage or emailed to the security officer) so truncation is detectable. |
| **Receipts** | Gapless sequence per facility, generated in a locked transaction; voids keep the number |
| **Backups** | Checksums verified; restore tests compare row counts and hashes |

## 7. Data minimisation, retention, deletion

- **Collect less:** reception walk-in registration uses minimum fields; national ID is optional where the law allows.
- **Show less:**
  - masked identifiers in lists (`••••1234`), revealed on click (logged)
  - neutral wording in notifications
  - sick notes without a diagnosis by default
- **Retention jobs** run nightly per the retention table in [analysis 12](../analysis/12-security-privacy-and-compliance.md). Clinical data is never hard-deleted before the legal period. Deletions of non-clinical data are logged.
- **Account closure:** non-clinical data is deleted after 30 days. Clinical records stay with facilities; the patient is told this before closing.
- **De-identification for analytics and AI:**
  - remove direct identifiers
  - generalise dates to month and ages to bands
  - locations to district
  - drop free text
  - minimum group size of 10 in any published aggregate
  - re-identification review before release

## 8. Exports

- Exports (CSV, Excel, PDF, data portability) require step-up, are logged with row counts, are watermarked with the user and time, and expire (download links valid 15 minutes).
- Bulk exports above a threshold (e.g. 500 patients) need facility admin approval and trigger an alert.
