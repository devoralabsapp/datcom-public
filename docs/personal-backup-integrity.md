# Verified personal exports

New downloads use `lunch-together.personal-data` version `2` and a random 32-hex `exportId`. The authenticated export API constructs the JSON from actual Firestore data using the caller's verified Firebase ID token. It accepts no uploaded file, source UID override or user-provided hash to register. Private reads remain owner-scoped under Security Rules, even for administrators exporting their own data.

Before returning the download, the server computes SHA-256 over the exact UTF-8 JSON bytes and creates an immutable `personalExports/{exportId}` receipt with owner ID, hash, byte length, file version, export time and order count. The existing restricted server integration identity creates this receipt; users and administrators cannot create, replace or delete receipts. There is no signing secret in the browser or JSON. Receipt reads are owner/admin/service only; listing is denied.

The API uses the operator's existing `PAYMENT_FIREBASE_REFRESH_TOKEN` integration together with the existing Firebase project/API-key settings. This identity receives only the additional receipt get/create capability. It cannot read other users' private profiles or contact details; export reads use the caller's separate token. It gains no administrator role. A revoked/missing service identity makes export/verification fail closed. Public installations must configure the restricted integration described in the payment setup; no service-account key or OIDC is introduced. Rotating the integration identity does not invalidate existing immutable receipt hashes.

`POST /api/personal-backups/export` takes a Firebase bearer token and an empty body. The response is a streamed JSON download with private/no-store caching. Streaming preserves the existing 10 MB file limit without returning a buffered response; see [Vercel's streaming guidance for large responses](https://vercel.com/kb/guide/how-to-bypass-vercel-body-size-limit-serverless-functions). Record/request/response-reading bounds fail explicitly instead of silently truncating data. Export audit is best effort after the mandatory receipt commit; raw files and tokens are not logged.

On file selection, the browser calculates the exact SHA-256 again and sends only `exportId`, `fileHash`, `bytes` and `sourceUserId` to `POST /api/personal-backups/verify`. The API validates the current app session, reads the receipt as the restricted service and returns a boolean match, never the source profile or payment data. An original file can therefore be verified by another current identity for the existing recovery flow; it does not authenticate that identity as the original owner or transfer existing orders.

The UI blocks import of changed, unknown or legacy/unregistered files and shows an alert. Even changing whitespace or line endings changes the hash. Export the original again if an editor has reformatted it. The import helper repeats verification before any profile/archive/order write. New import manifests must reference a matching server receipt, and `exportId` stays immutable. Existing archival chunks still have their checksum validated; v2 archives are reverified before administrator review. Older v1 archives remain readable with a clear unverified warning, but v1 files cannot start a new import.

Integrity means that a file is unchanged since this export, not that a historical manual payment entry is independently proven by a bank. Existing payment/credit/refund review remains unchanged, with no automatic money replay. A receipt is not a full account migration credential. Backup verification depends on retaining the project's receipt data; a file from a different Firebase project is unrecognized rather than silently trusted.

## Tiếng Việt

- Tải bản xuất mới từ ứng dụng. Server tự tạo file và lưu SHA-256 của lần xuất; người dùng không thể tự thay hash.
- Khi chọn file nhập, ứng dụng đối chiếu hash trước, chỉ hiện nút khôi phục khi hợp lệ. File đã sửa hoặc không có bản ghi xuất bị chặn và cảnh báo.
- File cũ chưa đăng ký hash cần xuất lại. Các bản đã lưu trong lịch sử từ trước vẫn xem được nhưng có cảnh báo chưa xác minh.
- Hash kiểm tra file có bị thay đổi sau khi xuất; dữ liệu tiền vẫn phải đối chiếu giao dịch thực tế, không tự cộng lại số dư.
- Dùng kết nối server hiện có, không thêm khóa dịch vụ/OIDC/chỉ mục. Cần Publish toàn bộ Rules mới.
