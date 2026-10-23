# Log thanh toán vào channel Telegram

API `POST /api/payments/bank-notification` có thể gửi log vào một channel Telegram đã cấu hình. Log gồm kết quả đã xác nhận, gửi trùng, không khớp, thông báo chưa đọc được (`422`), JSON sai (`400`), yêu cầu quá lớn (`413`), kiểu nội dung sai (`415`) và lỗi dịch vụ/cấu hình Firebase (`503`). Chỉ request đã qua kiểm tra khóa webhook mới tạo log; request sai khóa và thiếu cấu hình xác thực không gửi Telegram. Việc quản trị đánh dấu thanh toán thủ công trên giao diện không đi qua API này, nên không tạo các log này.

## Cấu hình

1. Tạo bot bằng **@BotFather** và giữ token riêng.
2. Thêm bot vào channel private, cấp quyền **quản trị → đăng bài**. Link mời `t.me/+...` không phải Chat ID và không tự thêm bot vào channel.
3. Đăng một tin mới, ví dụ `test log`, trong channel.
4. Gọi `https://api.telegram.org/bot<TOKEN_BOT>/getUpdates` bằng token của chính bot trên máy của bạn. Trong kết quả, tìm `channel_post.chat.id` của đúng channel hoặc `my_chat_member.chat.id` của sự kiện thêm bot. Chat ID thường có dạng `-100…`. Nếu `result` trống, kiểm tra bot đã là quản trị rồi đăng một tin mới. Không gửi URL đã điền token cho người khác. Nếu bot đang dùng webhook cho ứng dụng khác, `getUpdates` không dùng đồng thời được; lấy Chat ID từ cập nhật webhook hiện có, không xóa webhook đang vận hành.
5. Trong **Vercel → project ứng dụng → Settings → Environment Variables**, thêm hai biến **Production**:

   ```text
   PAYMENT_TELEGRAM_BOT_TOKEN=<token-bot>
   PAYMENT_TELEGRAM_CHAT_ID=<chat-id-channel>
   ```

6. Triển khai lại ứng dụng. Không dùng tiền tố `NEXT_PUBLIC_`, không lưu token trong Firestore hay GitHub. `.env.example` chỉ khai báo tên biến, không có giá trị thật. Để tắt gửi log, xóa cả hai biến rồi triển khai lại. Preview của Vercel không gửi vào channel thật, kể cả khi cấu hình bị sao chép nhầm.

## Nội dung log

Ví dụ dưới đây là dữ liệu giả:

```text
CƠM NHÀ · CHƯA XÁC NHẬN THANH TOÁN
Lúc nhận: 14:00:00 23/10/26 (Việt Nam)
HTTP: 422
Yêu cầu: <id-ngẫu-nhiên>
Kết quả: Chưa đọc được thông báo
Chi tiết: Không tìm thấy một mã đơn duy nhất trong thông báo.
Dấu thông báo: <16-ký-tự-hash>
Độ dài: <số-ký-tự>
Nội dung đã che:
Account ***8901
Amount: + 30,000
Balance: [đã che số dư]
NGUYEN VAN MAU transfer
```

Khi đọc được thông báo, log có thêm ngân hàng, số tiền và mã COM. Phần xem trước tối đa 1.200 ký tự: che tài khoản chỉ còn bốn ký tự cuối, bỏ số dư ở các nhãn BIDV/Techcombank đã hỗ trợ (gồm `Balance: VND 52,000` và dạng tiền đứng trước/sau VND), che khóa đã cấu hình và chuỗi Bearer. Không gửi header Authorization, token Firebase, raw JSON sai định dạng hoặc dữ liệu đơn khác. Nội dung chuyển khoản/tên trong thông báo vẫn có thể xuất hiện trong channel riêng. Telegram được tắt xem trước liên kết; tin log được bật bảo vệ nội dung và log gửi trùng không phát âm thanh.

Tin được gửi sau khi API đã trả kết quả bằng `after()` của Next.js, timeout 5 giây. Telegram lỗi không sửa trạng thái đơn và không đổi phản hồi API. Có thể thấy cảnh báo `[payment-telegram]` trong Vercel Logs; cảnh báo chỉ ghi loại lỗi/trạng thái HTTP, không ghi URL chứa token. Đây là log hỗ trợ vận hành theo kiểu best effort, không phải hàng đợi đảm bảo giao tin hay sổ đối soát ngân hàng. Không tự thử gửi lại khi Telegram lỗi để tránh đăng lặp nếu tin đã tới nhưng phản hồi bị mất. Biên nhận Firestore vẫn là dữ liệu xác nhận thanh toán của ứng dụng.

## Kiểm tra

Sau khi cấu hình, gửi một thông báo thử **không có mã COM** qua Shortcut với khóa webhook hợp lệ. API trả `422`, không tích thanh toán, và channel nhận log giải thích thiếu mã. Đối chiếu mã yêu cầu, giờ nhận và dấu thông báo giữa các lần kiểm tra. Nếu không nhận log, kiểm tra hai biến Production, deployment mới nhất, Chat ID và quyền đăng bài của bot. Không cần Publish lại Firestore Rules để bật Telegram.

Kiểm thử tự động dùng giả lập Telegram để kiểm tra che tài khoản/số dư/khóa, giới hạn độ dài, phản hồi Telegram lỗi/429, chặn cấu hình sai, bỏ qua Preview, không log request sai khóa và giữ nguyên phản hồi API khi bộ ghi log lỗi. Bộ kiểm thử không đăng tin vào channel thật.

Tham khảo: [Telegram sendMessage](https://core.telegram.org/bots/api#sendmessage), [Telegram getUpdates](https://core.telegram.org/bots/api#getupdates), [Next.js after](https://nextjs.org/docs/app/api-reference/functions/after).
