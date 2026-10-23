# Multiple dishes, payment balances, and restaurant handoff

[English](#english) · [Tiếng Việt](#tiếng-việt)

## English

People can add several different dishes to the cart, change each quantity, and submit them together. Each checkout accepts up to 10 different dishes, with 1–30 servings per line; a person can have up to 30 new dish lines per day in addition to a legacy order. Paid portions stay separate when adding more food. An unpaid line merges only when the dish and unit price still match. Edits and cancellations remain subject to the day's closing time.

An unpaid order shows **Payment** in every lunch-list filter where it appears. In Statistics, each person's row offers one QR for eligible unpaid web orders in the chosen Today / This week / This month / All period. A visitor pays only their own orders; administrators can help others. Legacy spreadsheet rows cannot be paid from this feature. Clearing guest browser data loses the anonymous editing/payment identity; Google sign-in links it across devices.

### Money after an edit or cancellation

The order keeps cumulative `receivedAmount`, `refundedAmount`, and `voidedAmount`. Current money held is received minus refunded minus reversed confirmations. The amount still due and any refund are calculated per order, without offsetting other orders.

| Change after receiving 50,000 VND | Result |
| --- | --- |
| New total 60,000 VND | QR collects only 10,000 VND |
| New total 40,000 VND | Fully paid; 10,000 VND refund due |
| Cancel the order | Meal total becomes zero; 50,000 VND refund due |
| Administrator confirms an actual refund | Refunded amount increases; received amount and history remain |

**Confirm receipt** records the current shortfall. **Confirm refund** requires a second confirmation of the current refund amount after an operator returns the money. It does not initiate a bank transfer. **Reverse confirmation** corrects an erroneous manual confirmation, preserves cumulative received totals, and records a separate reversal; it is not a refund. Manual changes require an immutable, paired `financialEvents` entry. Bank receipts and settlement markers also remain immutable.

Old orders with only `paid: true` use their stored price × quantity as an opening paid balance. The first subsequent edit persists that balance. If an older application version already cleared `paid` and discarded the amount, the app cannot reconstruct it from the checkbox alone; reconcile existing bank receipts or records manually. Cancelled orders remain available in the Cancelled and Refund due filters, while they are excluded from meals sent to the restaurant. Statistics show paid amounts applied to current meals and a separate Refund due column.

### Grouped QR and notification processing

Groups support up to 1,000 dish lines and 30,000,000 VND. Each item snapshots the current amount still due. Rules verify additions incrementally, then seal the group before a QR is shown. Changing an order, its owner, a manual payment or its current QR invalidates an outstanding group. A bank-confirmed group freezes unfinished lines until settlement completes.

The existing notification API and server environment variables are retained. A matching notification writes an immutable group receipt, then settles order/marker pairs in small atomic commits. Retries resume unfinished pairs; markers prevent an old notification from paying an order again after later edits. The owner's authenticated `POST /api/payments/groups/{reference}/resume` can finish an already accepted receipt; it cannot supply or confirm bank facts. Group creation is incremental and may take time for large selections. Closing the dialog aborts a build; reopen to retry. An operator should retain/retry the same notification if the API reports a temporary failure.

### PDF, JPG and restaurant links

**Summary & payments** exports an A4 PDF or JPG containing dish, quantity, unit price, notes and totals. Multi-page JPG exports are bundled as a ZIP. Rendering happens locally in the browser; PDF pages contain images, so text is not selectable. Lunch-list CSV remains available separately.

Administrators can create a random `/share/{token}` link lasting seven days or revoke it early. Anyone holding the link can view/export its snapshot without signing in. The snapshot omits orderer names, account IDs and payment state. Notes are included: avoid entering private personal details in restaurant notes. Changed orders do not update old links; create a new snapshot. Revocation prevents future reads; it cannot retract a previously downloaded or opened copy. Links are excluded from search indexing and listing is administrator-only.

### Release order

Publish the complete updated `firestore.rules` **before** deploying the new UI. No service-account key or OIDC setup is needed. Refresh older open browser tabs after deployment. Run `npm test`, `npm run typecheck`, and `npm run build`; tests use local Auth/Firestore emulators, including direct SDK permission attacks and partial-payment/refund scenarios. The Rules review in `firestore-rules-review.json` is a prototype assessment, not an independent security certification.

## Tiếng Việt

- Chọn nhiều món trong giỏ, chỉnh số suất riêng cho từng món rồi đặt cùng lúc. Mỗi lượt tối đa 10 món khác nhau, mỗi dòng 1–30 suất. Có thể thêm lượt đặt khác trong ngày; phần đã trả được giữ riêng.
- Nút **Thanh toán** xuất hiện cho đơn chưa trả của mình ở mọi bộ lọc danh sách; quản trị có thể làm hộ. Ở Thống kê, chọn Hôm nay / Tuần này / Tháng này / Tất cả để tạo một QR cho các khoản của mình trong kỳ. Chỉ lấy đơn trên web.
- Đã nhận 50.000đ rồi sửa lên 60.000đ thì chỉ thu thêm 10.000đ. Sửa xuống 40.000đ thì ghi cần hoàn 10.000đ. Hủy đơn thì ghi cần hoàn số còn giữ. Tiền cần hoàn không tự trừ vào đơn khác.
- Quản trị bấm **Xác nhận đã hoàn** sau khi hoàn tiền thực tế. Ứng dụng ghi số đã hoàn và giữ lịch sử, không tự chuyển tiền ngân hàng. **Bỏ xác nhận** dùng để sửa việc xác nhận nhầm, không phải hoàn tiền. Đơn đã hủy vẫn có thể xem ở tab **Đã hủy** và **Cần hoàn**.
- Đơn cũ còn tích đã trả được giữ số tiền theo đơn giá và số lượng đang lưu. Nếu phiên bản cũ đã bỏ tích và mất số tiền trước đó, cần đối chiếu biên nhận/giao dịch để ghi nhận lại thủ công.
- **Tổng hợp & thanh toán** có Xuất PDF, Xuất JPG và tạo link gửi nhà hàng. JPG nhiều trang tải thành ZIP. Chỉ quản trị tạo/thu hồi link; link dùng 7 ngày, không cần đăng nhập. Chỉ chia sẻ món, số lượng, ghi chú, giá và tổng tiền. Tránh ghi thông tin cá nhân vào ghi chú vì nhà hàng sẽ nhìn thấy.
- Link giữ nguyên bản chụp lúc tạo, thay đổi đơn cần tạo link mới. Thu hồi ngăn lần truy cập tiếp theo nhưng không xóa được bản đã tải. Publish toàn bộ Rules trước khi deploy, sau đó tải lại các tab web cũ. Không cần khóa dịch vụ hay OIDC.
