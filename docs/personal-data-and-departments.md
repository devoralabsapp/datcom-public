# Personal profiles, departments and personal backups

Vietnamese remains the default language. Click the account card at the bottom of the desktop sidebar, or the initials button in the header on a phone, to open **Personal information / Thông tin cá nhân**. Guests and Google users have the same profile tools for their current Firebase identity.

Profiles include a preferred lunch-order name, optional phone number and job title, company and department. Google email is read-only and comes from the authenticated identity. Updating a name does not rename previous orders or transfer ownership. Preferred names are remembered for subsequent orders on that browser. Clearing an anonymous session still loses that identity; a JSON backup is not an authentication credential.

## Companies and departments

Only administrators see **Administration / Quản trị**, with **Departments / Phòng ban** and **User management / Quản trị người dùng** submenus. Administrators can initialize a company/department pair, add entries, rename them, deactivate/reactivate them, and choose defaults suggested to new profiles. Clicking Edit toggles the same item button to Cancel and resets unsaved changes on cancellation. Set as default appears only while editing a saved department; the separate defaults form has been removed. Existing members and historical records are retained when an entry is deactivated. A department keeps its company; create a new department to represent a move. People select their own active affiliation in their profiles.

In **User management**, company and department selectors sit beside the account-status tabs and combine with those tabs and the name/email/UID search. Selecting a company resets the department selector; selecting a department also selects its company. Inactive entries and unassigned accounts remain filterable. These are administrator directory filters, not access-control or meal visibility filters.

**Delete** requires an explicit confirmation and is available only to administrators. The application refuses deletion if any `personalDetails` record links an account, including anonymous visitors and blocked accounts. Users must move/clear their affiliation first; no account is automatically moved. A company must have no child departments either. Orders, payments, personal details and backups are never deleted. Deleting a default clears both default selections atomically. An audit entry records the deleted item's ID/name.

The deletion transaction first locks the catalog entry with a bounded token and server timestamp. Rules prevent new affiliations/defaults/child departments while locked; server-only equality queries then check membership. A rejected attempt releases its lock. If the browser disconnects, an administrator can retry after two minutes or edit the entry to release the stale lock. Concurrent attempts must retain their own token before deletion. Firestore Rules cannot prove a collection query is empty: the membership check is enforced by this trusted administrator-client protocol. Administrators with custom SDK access could bypass that protocol; server-only enforcement would require a privileged backend. Regular users cannot lock or delete catalog items.

`lib/organization-defaults.ts` contains suggestions for the administrator's explicit initial setup; the public source uses sample names. Actual catalog data lives in Firestore. Department membership is descriptive: it does not introduce separate workspaces, tenant isolation, or change the existing shared visibility of meal orders/statistics. Administrators can see affiliations in the user directory.

## Export

**Export my data** downloads a UTF-8 JSON file with format `lunch-together.personal-data`, version `2`. The server creates the file from actual data and registers its exact SHA-256 before downloading. See [export integrity and compatibility](personal-backup-integrity.md). It includes the current identity's profile and affiliation, all owned orders (including cancellations), their manual financial events, own credit sources/transfers, and actor-scoped activity entries. Order payment/credit state is retained as reference data. Bank webhook diagnostic logs performed by another identity are not personal activity. Authentication secrets, passwords, session/refresh tokens, administrator roles, integration credentials and receiving-bank configuration are excluded.

Exports require the existing restricted server integration and Firebase configuration, with no new service-account key or OIDC. The file contains personal information and should be stored privately. Maximum import size is 10 MB of UTF-8 JSON; the format also limits record counts. If the data exceeds the supported size, export fails explicitly rather than silently truncating history.

## Import and recovery

Choose an original v2 file. Only its export ID, SHA-256, size and source UID are sent for verification at selection time. Changed, unknown or old unregistered files are blocked with a warning. Inspect the verified counts and confirm **Import and restore**. The complete file is not sent before that confirmation. The complete file is then archived privately for the current owner and administrators, in immutable chunks, with a SHA-256 manifest and integrity checks when reading it. The manifest ID is derived from the current UID and the file hash. Reusing the same file resumes the same import; concurrent chunk creation uses transactions.

Recovery applies the preferred name/contact fields and valid active affiliation. It never imports Google identity/email/provider or administrator access. An affiliation missing from the current catalog is cleared so that the person can select a valid one. A backup from another identity can supply profile/order content but cannot authorize access to that identity or take over existing orders.

Only a **missing**, active, zero-money order can be recreated, with its original name-derived ID and fresh server timestamps. The day's ordering must be open, the dish must still be available, and its current price must match. The normal order Rules enforce ownership, active booking access, menu validation and closing time. Existing orders are preserved without changing quantities, payment or notes. A name belonging to another identity blocks recovery. Credit is not automatically spent by importing.

Paid, refunded, voided and credit-bearing orders, and those with financial events, are archived for administrator review. Cancelled, closed-day, missing-menu or conflicting rows are retained in the complete file and listed as skipped. An administrator may reopen a valid day and the user can retry the same file. Original activity and money histories remain in the archived JSON; they are not replayed as new live events or payments.

Under **User management → Review imported data**, an administrator can inspect/download a pending file, compare actual transactions and update payments through the existing payment workflow. **Mark as reviewed** requires a note and explicit acknowledgment; it records the review only. It does not add money, refund a payment, mint credit or claim that file contents are authentic. Never treat an editable JSON file as proof of a bank transaction.

The UI shows up to 100 loaded import manifests and up to 100 orders in an administrator's preview; downloading a complete import preserves all its records. Imports use equality queries and client-side ordering, so no new composite index is required. An interrupted upload stays resumable with the same original file. Financial ledgers and existing activity logs remain immutable.

## Firebase deployment and validation

Publish the complete updated `firestore.rules` before using these features. New collections are `companies`, `departments`, `personalDetails`, `personalExports`, `personalImports` and its `chunks` subcollection; catalog defaults use `settings/organization`. Personal details/backups are owner/admin readable; profile and backup content never grants roles or bypasses financial Rules. Company/department names contain no private profile fields. Existing Authentication, indexes and Vercel environment configuration remain unchanged.

Rules are a tested prototype, not an independent security certification. See [the review and attack cases](profile-organization-review.md). Standard Auth/Firestore emulators exercise app queries, schema limits, ownership, inactive/mismatched affiliation, duplicate/concurrent restore, privacy and financial non-replay. Run `npm test`, `npm run build` and `npm run typecheck` before a release. Browser verification uses only fictitious accounts and records in a `demo-` Firebase project.

## Tiếng Việt

- Bấm thẻ tài khoản bên trái, hoặc nút chữ viết tắt ở đầu trang trên điện thoại, để sửa hồ sơ. Email Google không thể sửa qua form này.
- Quản trị → Phòng ban: tạo danh mục ban đầu, thêm/đổi tên/ngừng sử dụng công ty và phòng ban. Bấm sửa chuyển nút thành Hủy; nút Đặt làm mặc định chỉ hiện khi đang sửa phòng ban. Người dùng tự chọn đơn vị trong hồ sơ. Danh mục không chia tách dữ liệu đặt cơm thành các hệ thống riêng.
- Quản trị người dùng: lọc theo công ty/phòng ban ngay cạnh tab Đang khóa; kết hợp với tab quyền/trạng thái và ô tìm kiếm. Có lựa chọn chưa thuộc công ty/phòng ban.
- Xóa danh mục cần xác nhận và chỉ thực hiện khi chưa có tài khoản liên kết, bao gồm khách/tài khoản khóa. Công ty phải xóa phòng ban trước. Không xóa tài khoản, đơn hay lịch sử tiền; mục đang mặc định được bỏ mặc định.
- Xuất dữ liệu của tôi tạo JSON đầy đủ dữ liệu thuộc UID hiện tại; giữ file riêng tư. Khi nhập, hồ sơ và đơn chưa có/chưa thanh toán còn hợp lệ được khôi phục. Không ghi đè đơn, không giành tên của người khác và không tự cộng lại tiền/số dư.
- Toàn bộ file, kể cả lịch sử và các đơn chưa khôi phục được, nằm trong Lịch sử nhập dữ liệu để chủ tài khoản/quản trị tải lại. Có thể mở lại ngày và nhập lại cùng file. Nhật ký cũ không được phát lại thành hành động mới.
- Quản trị người dùng → Đối soát dữ liệu nhập: kiểm tra giao dịch thật, cập nhật thanh toán bằng luồng hiện có, rồi ghi chú và đánh dấu đã đối soát. Nút đánh dấu chỉ lưu kết quả kiểm tra, không tự ghi tiền.
- Cần Publish toàn bộ Rules mới. Không cần tạo chỉ mục, OIDC, khóa dịch vụ hay biến môi trường mới.
