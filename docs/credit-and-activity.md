# Carryover credit and administrator activity history

## Using surplus money

An owner or administrator can choose **Request refund / Hoàn lại** or **Keep for later / Để hôm sau** on any order with surplus funds, including cancelled meals. Refund remains the default. The existing administrator confirmation records an actual refund after the money is returned.

Keep for later makes the remaining surplus available to the **same Firebase UID** across days and order names. It does not match people by name. Anonymous guests retain ownership in the same browser; signing into Google links orders and unspent credit across devices. Clearing a guest browser's data loses that editing identity. The expiring guest-to-existing-Google transfer also moves credit-source pointers atomically with each order.

When creating or editing an order, available credit is applied after the meal write. QR creation retries credit allocation before calculating the exact cash shortfall. For example, 40,000 VND saved from one order plus a new 50,000 VND meal produces a 10,000 VND transfer QR. If credit covers every selected order, the dialog confirms that no bank transfer is needed. A failed allocation leaves the original credit intact and shows a notice; it can be retried during payment. The cart is not submitted twice to retry credit.

Credit is stored as funds remaining on source orders rather than a separate mutable money total. `creditSources/{dayId~orderId}` only locates those orders; displayed balances come from their current finance fields. Each use creates an immutable `creditTransfers/{id}` and atomically increases source `creditOutAmount` and target `creditInAmount`. Rules enforce the same owner, enough live source surplus, a live target shortfall, exact paired increments and unchanged unrelated fields. Concurrent spending/refunds re-read balances; accepted bank groups block pending order changes until settlement finishes.

Current held amount = received + credit in − credit out − refunded − reversed confirmations. Cumulative totals remain visible. A user can request a refund of credit still available on a source; amounts already applied to another meal are reconciled by editing/cancelling that meal. Administrators cannot reverse a confirmation on an order funded by incoming credit; edit/cancel/refund keeps its trail intact.

## Statistics

Today, week, month and all-time views subtract saved credit once per owner in the selected period, allocating to its oldest unpaid rows first. **Paid** remains the confirmed amount applied to meals; **Credit offset / Số dư trừ** is shown separately from **Unpaid**. The trend chart retains `total = paid + credit offset + unpaid`. Only web rows with an owner UID receive offsets; imported Sheet rows do not.

Statistics offsets are estimates, not reservations. They consider unspent credit from all dates, then apply it within the selected period. Overlapping period views can therefore show different allocations. Actual, immutable credit usage is committed when ordering or paying. A fully covered statistics row still offers **Use credit / Dùng số dư** to commit that allocation without a bank QR. Applied credits are already included in paid balances and are not deducted twice.

## Activity history

Only administrators see **Activity log / Nhật ký hoạt động** and can read `activityLogs`. Entries are append-only through app Rules. The screen loads 50 entries at a time, supports loading older entries, and filters/searches the entries already loaded. Names are resolved from administrator-visible user profiles; actor UID remains available to distinguish duplicate names.

Recorded application actions include visits, viewed sections, Google sign-in/out, cart orders, edits/cancellations with before/after dish/quantity/price/note/money details, manual payment/refund/reversal, credit choices and transfers, QR creation, menu changes, user role/access changes, pickup draws, restaurant link creation/revocation and exports. Critical application mutations include their event in the same batch/transaction. Accepted bank receipts create their bank event atomically; duplicate/unmatched/failed authenticated notifications attempt a separate safe event without changing the payment result.

Browser access telemetry is best effort and an application-visit event is deduplicated for 30 minutes in the same tab/session; section views are recorded when navigation changes or the app reloads. App-origin entries are client-reported and are **not forensic evidence**. Direct Console/SDK operations outside these application flows can bypass application logs; offline/blocked browser telemetry may be absent. The immutable bank receipts, financial adjustments and paired credit transfers remain the money ledger. Public restaurant snapshot visits are not tracked by creating anonymous visitor identities.

Logs omit passwords, authentication/webhook tokens, IP addresses, raw bank notices and balances. Existing redacted Telegram payment notifications remain separate. Activity history stays in Firestore for administrators and is not automatically purged. Restaurant share events include a bounded dish preview and row count. Logs start when this version is deployed; past app visits/edits cannot be reconstructed automatically.

## Deployment and validation

Publish the complete updated `firestore.rules` before deploying the new UI; refresh old open tabs. No service-account key, OIDC, Cloud Functions or additional composite indexes are required. The source directory uses `ownerId` single-field queries; history uses descending `createdAt` with a document cursor. Monitor Firestore reads as the credit-source history grows; this prototype reads its source pointers and current order balances rather than trusting cached money totals.

`npm test`, `npm run typecheck`, and `npm run build` validate the implementation. Emulator cases include cross-day credit, QR cash shortfalls, same-name foreign accounts, simultaneous spending, refund-choice races, forged money/paired writes, immutable ledgers, guest-to-Google ownership, administrator-only history, actor spoofing, and the ten-dish cart Rules access budget. Browser QA uses fictitious balances and local bank notifications only.

## Tóm tắt vận hành

- Khi có tiền thừa, chọn **Hoàn lại** hoặc **Để hôm sau**. Tiền chọn giữ lại tự trừ khi đặt món/QR tiếp theo, theo tài khoản hoặc phiên khách, không theo tên.
- Thống kê hiển thị riêng **Số dư trừ** và số **Chưa trả** đã khấu trừ. Đây là dự kiến theo kỳ; sổ sử dụng tiền được chốt khi đặt hoặc thanh toán.
- Quản trị mở **Nhật ký hoạt động** ở menu bên trái. Tải thêm để xem các bản ghi cũ hơn; tìm kiếm trong các bản đã tải. Dữ liệu món, số suất, giá, ghi chú và tiền trước/sau nằm trong **Xem chi tiết**.
- Log truy cập được gộp 30 phút/phiên; chỉ quản trị đọc được. Không lưu token, IP hoặc nguyên văn thông báo ngân hàng. Log thao tác ngoài ứng dụng và lịch sử trước bản triển khai này không tự xuất hiện.
