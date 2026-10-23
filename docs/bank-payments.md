# QR theo đơn và nhận thông báo BIDV / Techcombank qua Shortcut

Để nhận kết quả và lý do lỗi của API trong channel Telegram private, xem [cấu hình log thanh toán Telegram](telegram-payment-logs.md).

## Tài khoản nhận tiền và QR

Quản trị mở **Thông tin chuyển khoản → Cài đặt tài khoản nhận tiền**, chọn ngân hàng, nhập số tài khoản và tên chủ tài khoản rồi lưu. Khách không có phần cài đặt này. Thông tin nhận tiền được lưu trong `settings/payment` và được dùng chung cho nhóm; chỉ quản trị được thay đổi.

Người đặt mở **Thông tin chuyển khoản**, chọn đơn chưa trả của mình. Quản trị có thể tạo QR hộ các đơn khác. QR có số tiền chính xác và nội dung dạng `COM0123456789ABCDEF0123` (23 ký tự), nằm trong giới hạn 25 ký tự của trường nội dung VietQR. Tên/ngày của đơn hiển thị riêng cạnh QR; mã `COM` là mã riêng của đơn, phải giữ nguyên khi chuyển tiền. Mã được tìm ở toàn bộ nội dung thông báo, gồm trường `Transaction Details`, `Nội dung` hoặc phần văn bản bao quanh.

QR được dựng ngay trong trình duyệt bằng nội dung NAPAS/VietQR và thư viện QR, không gửi số tài khoản hoặc dữ liệu đơn đến dịch vụ ảnh QR. Giới hạn nội dung đối chiếu theo [VietQR Generate](https://vietqr.io/en/danh-sach-api/link-tao-ma-nhanh/api-tao-ma-qr/) và tài liệu [NAPAS VietQRInfo.AddInfo](https://developer.napas.com.vn/files/assets/files/Techspec_NapasCore_v1.1.pdf). Danh sách BIN ngân hàng trong `data/banks.json` lấy từ [VietQR Banks API](https://www.vietqr.io/api-bank), ngày 23/10/2026. Tên cấu hình hiển thị để đối chiếu; người dùng cần kiểm tra người nhận mà ứng dụng ngân hàng trả về khi quét, vì website không có dịch vụ xác minh chủ tài khoản.

Mỗi mã dùng cho một đơn chưa trả, có hiệu lực tối đa 23 giờ. Mở lại cùng đơn sẽ dùng lại mã còn phù hợp. Thay món/giá/số lượng, chuyển chủ đơn hoặc đổi tài khoản nhận sẽ khiến mã cũ không được tự xác nhận. Đơn đã hủy/đã trả không tạo QR mới. QR cũ dạng ảnh vẫn được hỗ trợ để chuyển khoản thủ công trong thời gian chuyển đổi.

## Bật API không cần OIDC/service account

1. Publish **toàn bộ `firestore.rules` mới nhất** vào đúng database. Các quyền đơn, hồ sơ và vai trò cũ được giữ; quyền mới gồm `paymentIntents`, `paymentLinks`, `paymentIntegrations`, `paymentReceipts`, `paymentTransactions`.
2. Đăng nhập Google bằng quản trị chính, mở **Thông tin chuyển khoản → Kết nối Shortcut nhận tiền → Tạo kết nối API**.
3. Website tạo một danh tính Firebase ẩn danh riêng cho API, cấp quyền thanh toán giới hạn trong Rules và hiển thị hai giá trị một lần trong cửa sổ này:

   ```text
   PAYMENT_WEBHOOK_SECRET=<khóa-ngẫu-nhiên>
   PAYMENT_FIREBASE_REFRESH_TOKEN=<token-của-kết-nối-api>
   ```

4. Thêm hai biến vào **Vercel → đúng project → Settings → Environment Variables → Production**. Đây là biến **máy chủ**, tuyệt đối không dùng tiền tố `NEXT_PUBLIC_`. Triển khai lại ứng dụng để áp dụng. Không đưa token vào GitHub, ảnh chụp màn hình hoặc nội dung Shortcut.
5. Shortcut chỉ dùng `PAYMENT_WEBHOOK_SECRET`. Refresh token dùng riêng ở máy chủ để lấy Firebase ID token; các thao tác Firestore vẫn chịu Security Rules. Không cấp vai trò `admins` cho danh tính API.

Mục **Xem kết nối → Ngắt** thu hồi quyền API ngay cả khi ID token còn thời hạn. Khi đổi kết nối, tạo kết nối mới, thay hai biến, redeploy rồi ngắt kết nối cũ. Nếu tài khoản API bị xóa hoặc token bị thu hồi, tạo lại kết nối thay vì dùng token đăng nhập của người quản trị. Nếu bật tự động xóa tài khoản ẩn danh ở cấp Firebase, cần cân nhắc vòng đời danh tính kết nối khi vận hành lâu dài.

API tin vào thông báo do thiết bị/Shortcut quản trị gửi với khóa hợp lệ; đây không phải webhook có chữ ký trực tiếp từ ngân hàng. Người giữ khóa có thể gửi thông báo giả. Chỉ cấu hình trên thiết bị quản trị và giữ riêng khóa. Rules giới hạn danh tính này vào việc xác nhận đúng mã/số tiền/tài khoản của đơn đã có; không được sửa thực đơn, vai trò, đảo trạng thái đã trả hoặc xóa lịch sử.

## API cho Shortcut

```text
POST https://<TEN-MIEN-WEB>/api/payments/bank-notification
Authorization: Bearer <PAYMENT_WEBHOOK_SECRET>
Content-Type: application/json
```

Body JSON chỉ có một trường, chứa **nguyên văn** thông báo (không cần trích xuất ở Shortcut):

```json
{
  "notification": "BIDV notice to customer\nTransaction Time: 12:20 23/10/2026\nAccount thanh toán: 000123456789\nTransaction Amount: +40,000 VND\nEnding Balance: 9,999,999 VND\nTransaction Details: COM0123456789ABCDEF0123\nTransaction Code: FAKE-BIDV-001"
}
```

Mọi dữ liệu trong ví dụ đều là mẫu; mã QR thực tế và thời gian thực tế phải do ứng dụng/giao dịch tạo ra. Có thể dùng `Content-Type: text/plain` với body là nguyên văn thông báo thay JSON. Giới hạn body 16 KB, văn bản thông báo tối đa 12.000 ký tự. Không gửi ảnh, OTP, mật khẩu hoặc chỉ số dư.

Trong Shortcut, thao tác gửi URL cần chọn **POST**, thêm header xác thực và dùng biến chứa văn bản thông báo cho `notification`. Nếu công cụ tự tạo JSON, gán trực tiếp biến văn bản vào trường này để tự escape xuống dòng/dấu ngoặc kép. Cách lấy thông báo phụ thuộc hệ điều hành/công cụ tự động hóa; API chỉ nhận văn bản đã được công cụ đó chuyển đến. Không giả định mọi điện thoại đều cho Shortcut đọc thông báo ứng dụng ngân hàng.

## Các trường được đọc

Định dạng tiền vào BIDV theo mẫu đã cung cấp:

| Trường | Ý nghĩa |
| --- | --- |
| `Transaction Time` / `Thời gian` | `HH:mm[:ss] DD/MM/YYYY`, múi giờ Việt Nam |
| `Account thanh toán` / `Tài khoản` | Số tài khoản nhận đầy đủ, không bị che |
| `Transaction Amount` / `Số tiền` | Bắt buộc dấu `+`, số nguyên VND; hỗ trợ phân tách nghìn bằng phẩy hoặc chấm |
| Toàn bộ văn bản | Phải có duy nhất một mã `COM` hợp lệ, không phân biệt hoa/thường |
| `Transaction Code` / `Mã giao dịch` | Mã giao dịch ổn định để chống gửi lại |
| `Ending Balance` | Bỏ qua, không dùng làm số tiền thanh toán |

Có thể giữ nhiều dòng hoặc gom thành một dòng; bộ đọc khôi phục ranh giới ở các nhãn đã biết. Trường bắt buộc bị trùng, thiếu, che số tài khoản, số tiền âm, USD, ngày sai hoặc có nhiều mã khác nhau đều bị từ chối. Bộ đọc BIDV dùng **BIN 970418** và các tên nhãn tương đương ở trên.

Thời điểm giao dịch phải từ lúc tạo mã (cho phép lệch/bo tròn 2 phút), không quá 5 phút trong tương lai và không sau thời hạn mã. Giao dịch gửi trễ sau khi mã hết hạn cần người quản trị xác nhận thủ công.

### Techcombank: mẫu thông báo ngắn

Chọn **Techcombank (BIN 970407)** trong cài đặt tài khoản nhận tiền. API cũng nhận nguyên văn mẫu sau; tất cả giá trị dưới đây là dữ liệu giả:

```text
Account 00012345678901
Amount: + 30,000
Balance: 39,184
NGUYEN VAN MAU transfer COM0123456789ABCDEF0123
```

API đọc tài khoản ở dòng `Account` (không có dấu hai chấm), đọc tiền vào từ `Amount`, và bỏ qua số dư `Balance`. Với mẫu này, tiền là VND; có thể không có chữ VND sau số tiền. Chấp nhận xuống dòng hoặc gom một dòng, dấu phân tách nghìn bằng phẩy/chấm; từ chối số âm, thiếu dấu `+`, ngoại tệ, trường trùng và nội dung trộn định dạng BIDV.

Mẫu Techcombank đặt tiền ở đầu thông báo cũng được hỗ trợ (dữ liệu giả):

```text
+ VND 50,000
Account: 00012345678901
Balance: VND 52,000
COM0123456789ABCDEF0123
```

Nếu Shortcut ghép nguyên thông báo kiểu `+ VND …` này nhiều lần, API gộp tối đa 8 bản **giống hệt toàn bộ nội dung** thành một trước khi đọc và tính dấu nhận diện; gửi một bản hoặc bốn bản giống nhau có cùng dấu nhận diện. Có thể xuống dòng giữa các bản hoặc ghép liền. Không bỏ qua trường trùng tùy ý: các đoạn khác số tiền, tài khoản, số dư, mã COM hay nội dung đều bị từ chối. Shortcut nên gửi nội dung của một thông báo duy nhất, tránh ghép danh sách thuộc tính lặp lại.

**Thông báo vẫn phải có một mã COM của QR**, số tiền chính xác và tài khoản nhận trùng cấu hình/đơn. Nội dung chỉ có tên người chuyển và chữ `transfer` sẽ trả `422`, không tự tích đã trả. Người chuyển giữ nguyên mã khi quét QR; không suy đoán đơn từ tên hay số tiền.

Mẫu ngắn không có mã giao dịch hoặc thời gian do ngân hàng cung cấp. API tạo `transactionId` dạng `TCBNOTICE-<SHA256>` từ nguyên văn thông báo sau khi chuẩn hóa khoảng trắng/hoa thường, và ghi thời điểm nhận tại máy chủ vào `occurredAt`. Đây là **dấu nhận diện thông báo và thời điểm nhận**, không phải mã/thời gian giao dịch ngân hàng. Không thể xác minh độc lập ngày giao dịch từ mẫu này; Shortcut nên chuyển thông báo ngay khi nhận, không dùng để nạp lịch sử. QR hết hạn, đã thay đổi hoặc đã xử lý vẫn bị chặn. Biên nhận bất biến theo mã COM ngăn gửi lại, kể cả khi quản trị đổi đơn về chưa trả. Không lưu nguyên văn hoặc số dư trong Firestore.

QR hỗ trợ các ngân hàng trong danh sách; tự đối chiếu hiện chỉ hỗ trợ hai mẫu BIDV và Techcombank trên. Thông báo ngân hàng khác cần bổ sung bộ đọc riêng.

## Phản hồi và chống xác nhận trùng

| HTTP / `status` | Hành vi |
| --- | --- |
| `200`, `paid` | Đã đối chiếu và tích đã trả; trả thêm `reference`, `amount` |
| `200`, `duplicate` | Mã đơn hoặc mã giao dịch đã xử lý; không tích lần hai |
| `200`, `unmatched` | Không khớp; `reason` cho biết số tiền/tài khoản/đơn/QR đã đổi, hết hạn, hủy hoặc đã trả |
| `422`, `unmatched` | Chưa đọc được thông báo hoặc không có một mã duy nhất; không sửa đơn |
| `401` | Thiếu hoặc sai khóa |
| `400` / `413` / `415` | JSON sai, nội dung quá dài hoặc kiểu nội dung không hỗ trợ |
| `503` | Thiếu cấu hình, quyền bị ngắt, Rules chưa Publish hoặc dịch vụ lỗi; có thể gửi lại **cùng** thông báo sau khi khắc phục |

Shortcut có thể bỏ qua `duplicate`, báo cho quản trị với `unmatched`/`422`, và thử lại có giới hạn với `503`. API trả `private, no-store`, không trả lại nguyên văn thông báo hoặc thông tin người đặt.

Sau khi đối chiếu, API ghi atomically ba thay đổi: `paid=true` trên đơn, biên nhận bất biến theo mã QR, và khóa chống trùng theo ngân hàng/tài khoản/mã giao dịch (hoặc dấu nhận diện thông báo Techcombank). Có điều kiện phiên bản `updateTime` trên đơn và điều kiện bản ghi chống trùng chưa tồn tại; Rules kiểm tra lại liên kết, tài khoản và giá trị đơn tại thời điểm ghi. Nếu một điều kiện thất bại, không ghi một phần. Hai lần gửi đồng thời vẫn chỉ có một lần thanh toán. Nếu quản trị đổi lại thành chưa trả sau đó, gửi lại thông báo cũ cũng không tích lại.

Không lưu nguyên văn thông báo/số dư trong Firestore. Biên nhận giữ số tiền, tài khoản nhận, mã giao dịch, thời gian, người xử lý và hash thông báo để tra cứu; chỉ chính chủ/quản trị/danh tính API đọc theo quyền cần thiết. Giao dịch không khớp không tự ghi vào danh sách thanh toán; lưu phản hồi lỗi trong công cụ quản trị nếu cần theo dõi.

## Kiểm thử trước khi bật thật

Chạy `npm run build`, `npm run typecheck`, `npm test`. Bộ kiểm thử dùng dữ liệu giả và Emulator, gồm cả Firebase Auth REST + Firestore REST commit, đồng thời gửi lặp và tấn công trực tiếp Rules. Khi cấu hình trên hệ thống thật, quét thử để kiểm tra đúng ngân hàng/người nhận, rồi dùng một đơn thử và một giao dịch nhận tiền đã thống nhất với quản trị; đối chiếu trên ứng dụng ngân hàng và website. Không tự tạo giao dịch tiền thật trong quá trình kiểm thử mã nguồn.

Rules là prototype đã kiểm thử, cần đối chiếu với chính sách và môi trường triển khai. I've set up prototype Security Rules to keep the data in Firestore safe. They are designed to be secure for exact-amount order settlements with paired immutable receipts, restricted integration identities and owner/admin payment requests. However, you should review and verify them before broadly sharing your app. If you'd like, I can help you harden these rules.

Tài liệu triển khai dùng [Firebase Auth REST](https://firebase.google.com/docs/reference/rest/auth/), [Firestore REST và Firebase ID tokens](https://firebase.google.com/docs/firestore/use-rest-api), [atomic Commit](https://firebase.google.com/docs/firestore/reference/rest/v1/projects.databases.documents/commit).
