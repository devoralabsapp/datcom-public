# Firebase Web SDK + Vercel

Bản này không cần cấu hình OIDC, service account, private key hay IAM cho web. Chỉ dùng Firebase Web config và Firestore Rules.

## 1. Bật đăng nhập trong Firebase

Mở [Firebase Console](https://console.firebase.google.com/) và chọn project cần triển khai → Authentication → Sign-in method:

- Bật **Google**, chọn email hỗ trợ và lưu.
- Bật **Anonymous / Ẩn danh** và lưu. Khách không thấy màn hình đăng nhập; Firebase tự cấp UID để bảo vệ đơn của họ.
- Authentication → Settings → Authorized domains: thêm tên miền Vercel thật và `localhost` khi phát triển. Không thêm giao thức hoặc cổng vào danh sách domain.

## 2. Đặt UID quản trị chính và Publish Firestore Rules

Dùng Firestore **Standard**, database `(default)`. Nếu dựng bản mới, tạo database trước. Nếu tiếp quản hệ thống hiện tại, dùng đúng project/database đã được bàn giao.

Sau khi đăng nhập Google lần đầu, lấy UID trong Authentication → Users. Thay **tất cả** chuỗi `PRIMARY_ADMIN_UID_HERE` trong `lib/user-model.ts` và `firestore.rules` bằng cùng UID đó trước khi dùng thật. `.firebaserc` không trỏ sẵn project; mọi lệnh deploy cần chỉ rõ `--project`.

Mở Firestore Database → Rules, thay toàn bộ nội dung bằng [firestore.rules](../firestore.rules), bấm **Publish**. Rules có thể cần một khoảng thời gian ngắn để áp dụng. Nếu database dùng chung với app khác, xem xét các collection của app đó trước khi thay Rules; schema không được nêu trong file bị từ chối.

Nếu đã đăng nhập Firebase CLI ở máy, có thể dùng lệnh sau thay thao tác Console:

```text
npx firebase-tools deploy --only firestore:rules --project YOUR_FIREBASE_PROJECT_ID
```

Các truy vấn chỉ dùng index đơn tự động; không cần tạo composite index cho các màn hình hiện tại.

## 3. Cấu hình Vercel

Import repo `datcom-public` của bạn, Framework Next.js, Node.js 22, Root Directory mặc định. Các lệnh install/build đã có trong `vercel.json`.

Thêm các biến sau vào Vercel → Settings → Environment Variables từ Firebase Project settings → Your apps → Web config:

| Biến | Giá trị |
| --- | --- |
| `NEXT_PUBLIC_FIREBASE_API_KEY` | `apiKey` |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | `YOUR_FIREBASE_PROJECT_ID.firebaseapp.com` |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `YOUR_FIREBASE_PROJECT_ID` |
| `NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET` | `storageBucket` |
| `NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID` | `messagingSenderId` |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | `appId` |
| `NEXT_PUBLIC_FIRESTORE_DATABASE_ID` | `(default)` |

Redeploy sau khi thay biến `NEXT_PUBLIC_*`, vì chúng được nhúng lúc build. Các biến GCP/OIDC, `FIREBASE_SERVICE_ACCOUNT_KEY`, `AUTH_SECRET`, `AUTH_URL`, `ADMIN_EMAILS` cũ không còn được code sử dụng; có thể xóa khỏi Vercel. Không cần bật OIDC để chạy bản này.

## 4. Cấp quyền quản trị lần đầu

1. Mở web, đăng nhập Google bằng email quản trị bạn đã chọn.
2. Trong Firebase Console → Authentication → Users, tìm đúng email Google đó và sao chép **User UID**.
3. Firestore Database → Data → Start collection: nhập `admins`.
4. Document ID: dán UID vừa sao chép. Thêm field `enabled`, chọn kiểu **boolean**, giá trị **true**, rồi Save.
5. Tải lại web. Nút Chỉnh thực đơn/Tạo ngày mới xuất hiện.
6. Chọn Chỉnh thực đơn rồi Lưu để đăng thực đơn đầu tiên, hoặc tạo ngày mới.

Việc được đặt làm quản trị viên web không cấp quyền IAM. Sau khi bootstrap UID chính `PRIMARY_ADMIN_UID_HERE` tại Console, tài khoản này có thể cấp/thu hồi quyền quản trị của người khác ở **Quản trị người dùng**; người nhận cần đăng nhập Google vào web trước. Không cho tự cấp quyền, tự thu hồi vai trò chính hoặc khóa tài khoản đang quản trị. Quản trị viên khác được xem danh sách và khóa/mở đặt cơm của người dùng thông thường.

Khách sau đó chỉ cần mở web, nhập tên và chọn món. Nếu chưa Publish Rules hoặc chưa bật Anonymous, web sẽ báo chưa được cấp quyền/chưa khởi tạo được phiên.

Mọi khách đều xem được danh sách đặt cơm, món, ghi chú, thanh toán và thống kê của cả nhóm. Firebase vẫn tự tạo phiên ẩn danh, không yêu cầu đăng nhập Google. Mỗi khách chỉ sửa/hủy được đơn do phiên của mình tạo; quản trị viên quản lý thực đơn, chốt cơm và xác nhận thanh toán. Sau khi cập nhật từ bản chỉ xem đơn cá nhân, cần Publish `firestore.rules` mới trước khi dùng bản web xem chung. Các collection `admins` và `accountLinks` vẫn không được mở đọc chung.

Bản có vòng quay cần thêm quyền cho `pickupDraws/{YYYY-MM-DD}` trong file Rules mới nhất. Khách được đọc; chỉ quản trị viên tạo kết quả của hôm nay sau khi chốt danh sách. Kết quả không được sửa/xóa từ ứng dụng. Không cần tạo collection bằng tay, index tổng hợp, OIDC hay khóa riêng; ứng dụng tạo bản ghi sau lần quay đầu tiên.

Bản quản trị người dùng cần Publish **toàn bộ file Rules mới nhất**, gồm `userProfiles`, `userAccess` và quyền cập nhật `admins`. Đây là quyền riêng cho chính chủ/quản trị, không mở danh sách hồ sơ/email cho khách. Profile tự tạo khi ghé web; trạng thái tự tạo sau thao tác của quản trị. Các chủ đơn cũ xuất hiện từ lịch sử kể cả chưa có profile. Khi Rules chưa Publish, tên khách vẫn được nhớ cục bộ và đặt cơm bình thường; mục quản trị hiển thị hướng dẫn cập nhật quyền, không hiển thị danh sách giả rỗng. Khóa áp dụng cho quyền đặt/sửa đơn, không phải thao tác disable/delete Firebase Authentication. Không cần thêm khóa riêng hoặc OIDC.

## 5. QR thanh toán (tùy chọn)

Quản trị mở **Thông tin chuyển khoản → Cài đặt tài khoản nhận tiền**, chọn ngân hàng, nhập số tài khoản/tên người nhận và lưu. Cần Publish Rules mới nhất trước khi lưu schema tài khoản. Mỗi đơn chưa trả có QR và mã `COM` riêng, số tiền khớp đơn; khách chỉ tạo QR đơn của mình, quản trị có thể tạo hộ. QR được dựng ngay trên trình duyệt.

Để tự tích đã trả từ thông báo BIDV, xem [hướng dẫn QR và API Shortcut](bank-payments.md). Quản trị chính tạo kết nối trong cùng cửa sổ, sau đó đặt **`PAYMENT_WEBHOOK_SECRET` và `PAYMENT_FIREBASE_REFRESH_TOKEN` ở môi trường máy chủ Production của Vercel** rồi redeploy. Hai biến không có tiền tố `NEXT_PUBLIC_`; không dùng refresh token của tài khoản quản trị. Nếu chưa cấu hình API, chuyển khoản/QR và xác nhận thủ công vẫn dùng được. Parser hiện hỗ trợ thông báo BIDV theo mẫu đã kiểm thử; không tự coi thông báo ngân hàng khác là hợp lệ.

Tương thích QR ảnh cũ: document `settings/payment` với `qrUrl` là URL HTTPS của ảnh QR (tối đa 2.000 ký tự) hoặc data URL `data:image/png;base64,...` / JPEG (tối đa 200.000 ký tự) và `updatedAt` kiểu Timestamp vẫn được đọc. Khi lưu tài khoản mới, schema này được thay bằng `bankBin`, `bankName`, `accountNumber`, `accountName`, `updatedAt`. Chỉ quản trị qua Rules mới được ghi từ web; người dùng Firebase đã xác thực, gồm phiên khách, được đọc thông tin nhận tiền.

Không tự đưa QR ngân hàng thật vào Git. Nếu chưa cấu hình, web hiển thị thông báo liên hệ người gom cơm.

## Dữ liệu từ bản cũ

Ứng dụng mới dùng `days/{id}/orders/{hash}`, không ghi đè `mealDays` hoặc `mealOrders` cũ. Các bản ghi đó được giữ nguyên và bị chặn truy cập từ Web SDK. Cookie khách cũ không chứng minh được Firebase UID, vì vậy cần quản trị viên mapping dữ liệu nếu muốn nhập lại lịch sử. File Sheets/QR thật ở máy vẫn không được đưa lên GitHub/Vercel.

## Kiểm thử và phát triển

```text
npm run build
npm run typecheck
npm test
```

Kiểm thử dùng Auth/Firestore Emulator cục bộ và Web SDK thật, không cần tài khoản cloud. Dành project Firebase riêng cho Preview nếu cần thử dữ liệu; không dùng chung quyền quản trị/dữ liệu Production cho một nhánh chưa được xem xét.

Rules là bản mẫu đã được kiểm thử theo [báo cáo](firestore-rules-review.json); cần xem xét và xác minh trên môi trường thật trước khi chia sẻ rộng rãi.

Tài liệu: [Firebase Anonymous Auth](https://firebase.google.com/docs/auth/web/anonymous-auth), [Google liên kết tài khoản](https://firebase.google.com/docs/auth/web/account-linking), [Firestore Security Rules](https://firebase.google.com/docs/firestore/security/rules-conditions).
