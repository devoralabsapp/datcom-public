# Profile, organization and import Rules review

Scope: new catalog/profile/import paths and their interactions with existing identity, order, credit and activity Rules. This is maintainer testing of a prototype, not an independent security audit. Private contact information remains separate from shared order documents. Administrator access to personal data follows the existing operational role; selecting a company or department never grants privileges.

| Attack or failure case | Expected/result |
| --- | --- |
| Unauthenticated reads of company/defaults or personal data | Denied |
| Regular user creates/updates company or department | Denied by Rules; client rejects administration |
| Admin writes oversized name, wrong type, arbitrary field, spoofed updater or changes createdAt | Denied |
| Department references absent company or moves to another company | Denied |
| Invalid/inactive company-department default pair | Denied |
| Foreign UID reads/writes personal details or lists another person's imports | Denied; admin read remains deliberate |
| Owner injects role/email/provider into private details | Denied by strict schema; identity remains in existing validated profile |
| Admin edits someone else's personal contact details | Denied; administrator can read for operations |
| Missing fields, number-valued phone, excessive phone/job title, wrong department or fake timestamp | Denied on create/update validators |
| File with mixed-owner orders, credit records or activity; negative money; duplicate IDs; excessive size | Rejected by parser |
| File claims paid/refunded/voided/credit amounts | Retained for review, never replayed into financial ledgers |
| Import targets an existing/foreign-owned order or reserved name | Existing order preserved; conflict reported |
| Missing order on a closed day, changed price or unavailable dish | Restore rejected under current menu/closing checks |
| Reimport same original file or restore already-present line | Same manifest/order IDs, no quantity increase or duplicate slot |
| Concurrent import of same file | One immutable upload archive; transactional chunk creation, no extra order |
| Owner changes immutable manifest owner/source/hash/bytes/counts/createdAt or marks reviewed | Denied |
| Foreign/orphan/oversized/out-of-range chunk, changing/deleting an existing chunk | Denied |
| Incomplete or wrong-checksum archived file | Download/review rejected by integrity validation |
| Regular user invokes administrator review | Denied |
| Administrator acknowledges actual review | Note and explicit UI acknowledgment required; financial amounts remain unchanged |
| User's auth identity changes while a backup read is in flight | Return/download guarded against stale identity |

Coverage: `tests/personal-backup.test.ts`, `tests/user-filters.test.ts` and the organization/profile/import cases in `tests/web-firestore.test.ts`, alongside the existing order/payment/ownership suite. The complete suite has 77 tests. The emulator loads and compiles the entire Rules file and exercises actual modular Web SDK queries. The UI localization test includes all new components.

Empty-catalog deletion checks (Standard emulators): unauthenticated/member deletes and member-created locks are denied; admin deletes without a lock are denied; oversized/non-string/partial/backdated/polluted locks are denied. Default references prevent direct deletion until atomically cleared. Locked company/department prevents new personalDetails links and child departments. The actual admin operation rejects linked anonymous, verified Google and blocked accounts, releases the lock, and leaves orders/profile/payment fields unchanged. Company-with-departments deletion is rejected. Empty department/company deletion succeeds, clears defaults and records an audit log; cleanup also handles an inactive company. Directory membership IDs and combined status/company/department/search filters are exercised.

Explicit trust limitation: Rules cannot perform an emptiness query over personalDetails. A trusted administrator using a custom SDK could set the deletion lock and bypass the application's server membership query. This is not prevented by the Rules; the application protocol, including locking against concurrent joins, is the enforcement point for the no-linked-account business rule. A privileged backend would be required to protect against administrators bypassing their own client. This change grants no such power to ordinary/anonymous users. See the deletion protocol in the feature documentation.

Operational limits: imported JSON is user-supplied evidence, not bank authentication. Firestore validates manifest schemas and bounded immutable chunks; byte length, total records and checksum are validated by the app when reading the complete file. A malicious user can upload false personal reference data but gains no financial authority. As with existing client telemetry, app events are best-effort and not a replacement for immutable financial ledgers. Per-file bounds reduce individual document abuse; they are not a project-wide upload rate limit or billing cap. Catalog and backup reads have normal Firestore costs. No claim of tenant isolation is made.


Server export integrity: new API exports only actual caller-owned data; arbitrary file/UID registration requests, missing/invalid sessions and changed/unknown/legacy files are rejected. Immutable personalExports receipts are server-integration-only creates; owner/admin spoofing, lists, edits, deletes and malformed service receipts are denied. New import manifests require matching receipts. Tests check no profile/import writes for altered files, server hash/UTF-8 byte length, financial tampering rejection, disabled service failure and preserved cross-identity conflict checks. Older archives remain explicitly unverified reference data. See [integrity design and operational boundaries](personal-backup-integrity.md).
