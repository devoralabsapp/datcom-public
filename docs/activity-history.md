# Personal activity history and responsive navigation

Regular users, including anonymous guests, can open **My activity / Nhật ký của tôi**. They read only entries whose `actorId` equals their current Firebase UID. Administrators retain access to all entries. Names do not grant access. Entries remain append-only; current schema and bank-event protections are unchanged.

Personal history shows actions performed by that identity. It does not make another person's actions visible merely because they mention the same order or display name. Linking Google while preserving the UID preserves history; transferring orders into an existing Google identity does not rewrite the old activity actors. Administrators can still inspect the full history.

Pages contain up to 50 entries, newest first, with a document cursor. Search and category filters operate on loaded entries; search includes resolved names. Regular users fetch only their own profile, while administrators can resolve the directory. Expanding an entry uses a full-width detail row so long names, notes, references and nested changes wrap inside the panel. Mobile entries use cards. Sidebar spacing is tighter and the existing Be Vietnam Pro font is used for the larger Lunch corner label; short desktop windows hide the decorative reminder.

## Firebase deployment

1. Publish the complete updated `firestore.rules`.
2. Deploy `firestore.indexes.json`, or create its composite index in Firebase Console → Firestore Database → Indexes → Add index:

| Setting | Value |
| --- | --- |
| Collection ID | `activityLogs` |
| Field 1 | `actorId` — Ascending |
| Field 2 | `createdAt` — Descending |
| Query scope | Collection |

Wait until the index is enabled before releasing personal history. Firebase adds document-name ordering automatically. No new environment variables, privileged server keys, or historical-data migration are required. Standard emulators validate Rules but do not verify a production composite index has finished building.

The Rules remain a prototype with emulator coverage, not an independent security certification. Client activity remains best-effort telemetry; immutable financial ledgers remain the authority for money.

## Tiếng Việt

- Người dùng thường mở **Nhật ký của tôi**, chỉ xem hoạt động do tài khoản/phiên khách hiện tại thực hiện. Quản trị xem toàn bộ. Không cấp quyền dựa vào tên.
- Chi tiết mở xuống một hàng rộng, không kéo giãn bảng. Trên điện thoại, mỗi bản ghi hiển thị thành thẻ.
- Trước khi phát hành, Publish toàn bộ Rules và tạo chỉ mục trong bảng trên, chờ trạng thái Enabled. Chỉ mục này phục vụ việc lọc đúng tài khoản và sắp xếp bản ghi mới nhất trước.
- Máy chủ/người dùng không tự sửa hoặc xóa log cũ; lịch sử đã có vẫn giữ nguyên người thực hiện. Dữ liệu được lọc và phân quyền tại Firestore, không chỉ ẩn trên giao diện.

Index configuration follows the [official Firebase index guide](https://firebase.google.com/docs/firestore/query-data/indexing) and [JSON index definition reference](https://firebase.google.com/docs/reference/firestore/indexes).
