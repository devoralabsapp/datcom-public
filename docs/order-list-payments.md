# Order list totals and grouped payment

- Order-list tabs and search total the meal amounts of the rows currently displayed. Cancelled rows contribute zero meal value; refund and credit figures remain attached to their original orders.
- **My orders / Đơn của tôi** has one payment summary and one button below the list. It shows meal total, confirmed amount applied, estimated saved-credit offset, cash still due and any pending refund. It pays only the owner's displayed unpaid rows for the selected day. Search narrows both the total and payment selection. Clear search to include all of your rows that day.
- Payment buttons are removed from individual order rows in every order-list tab. Administrator receive/refund/reversal controls remain. Statistics payment actions are unchanged.
- A single Firebase identity can group its own orders even if different names were entered. Ownership is verified for each row in Rules; matching a person's display name grants no ownership. Other-owner administration groups retain their existing name scope.
- **Summary & payment / Tổng hợp & thanh toán** shows regular visitors “You have N orders to pay”, based only on their own active rows with a remaining balance, and opens My orders. Administrators see “View N unpaid orders”, counting the whole group's active unpaid rows for the selected day, and open the Unpaid tab. Counts represent dish rows, not portions; rows fully paid or cancelled are excluded. Zero-count links are disabled.
- Manual reconciliation history is visible and readable only to the current order owner and verified Google administrators. Firestore checks the parent order's current owner for both document reads and scoped history queries. Shared meal/order visibility is otherwise unchanged.
- Publish the full updated `firestore.rules` before releasing this version. It changes the history read boundary and permits grouping different names only for rows owned by the requester. Existing reconciliation events stay immutable; no data migration is required.

## Tiếng Việt

- Tổng cuối bảng khớp với bộ lọc và tìm kiếm. “Đơn của tôi” có một nút thanh toán gộp, trừ khoản đã trả và số dư dự kiến; không thu lại tiền của đơn đã thanh toán hoặc đã hủy.
- Khi tìm kiếm trong “Đơn của tôi”, chỉ những đơn đang hiện được cộng và thanh toán. Xóa tìm kiếm để thanh toán toàn bộ đơn của mình trong ngày đang chọn.
- Thông báo số đơn ở “Tổng hợp & thanh toán” theo chủ đơn với người dùng thường, theo cả nhóm với quản trị. Mỗi dòng món là một đơn, số suất không làm tăng số đơn.
- Lịch sử đối soát thủ công chỉ chủ đơn và quản trị xem được, kể cả khi truy cập trực tiếp Firebase. Số liệu đơn cơm chung vẫn xem được như trước.
