# Bàn giao vận hành và phát triển

Bản bàn giao ngày **23/10/2026**, gồm mã nguồn ứng dụng, Rules, cấu hình Firebase/Vercel, dữ liệu mẫu và kiểm thử tự động. Đây là một bản chụp mã nguồn có lịch sử Git mới; không chứa lịch sử repo riêng, dữ liệu đặt cơm, danh sách người dùng, QR thật, môi trường triển khai hoặc thông tin truy cập hệ thống đang chạy.

## 1. Chọn cách tiếp nhận

### Tiếp tục vận hành hệ thống đang chạy

Chủ hệ thống cần mời người nhận vào Firebase/Google Cloud và Vercel bằng tài khoản riêng, cấp quyền phù hợp với công việc. Quyền **quản trị trên web** và quyền **vận hành Firebase/Vercel** là hai việc riêng. Không dùng chung mật khẩu hoặc gửi service account key.

Chủ hệ thống bàn giao riêng các thông tin sau; không ghi vào repo public:

| Thông tin cần nhận | Nơi sử dụng |
| --- | --- |
| Firebase Project ID và Web app config | `.env.local`, biến môi trường Vercel |
| Database ID, hiện ứng dụng dùng `(default)` Standard | `NEXT_PUBLIC_FIRESTORE_DATABASE_ID` |
| UID quản trị chính hiện hành | `lib/user-model.ts` và `firestore.rules` |
| Vercel project, domain và quyền truy cập | Deploy, theo dõi lỗi, khôi phục bản phát hành |
| Các biến môi trường đang dùng, phân biệt Preview/Production | Vercel Settings |
| Nguồn Sheets và năm bắt đầu, nếu còn dùng | `MEAL_SPREADSHEET_ID`, `MEAL_SHEETS_START_YEAR` |
| Thông tin thanh toán và chính sách sao lưu | Firestore `settings/payment`, quy trình nội bộ |

Repo public không tự kết nối hoặc thay thế repo đang deploy. Nếu chuyển nguồn Git của Vercel sang repo này, hãy cấu hình đầy đủ, chạy kiểm thử và thử Preview trước. Giữ nguyên UID quản trị chính và Firebase project/database của hệ thống cũ khi tiếp quản để giữ dữ liệu và quyền hiện tại. Không thay UID bằng tài khoản mới chỉ vì đổi người phát triển; việc đổi quản trị chính phải do chủ hệ thống thống nhất, cập nhật đồng thời hai file và bản ghi `admins`.

Không sao chép dữ liệu người dùng vào issue, log CI, fixture hay commit public. Nếu cần dữ liệu để tái hiện lỗi, tạo dữ liệu mẫu đã ẩn danh.

### Dựng hệ thống độc lập

Tạo Firebase project riêng, bật Firestore Standard, Anonymous và Google. Dùng Vercel project riêng. Làm theo [hướng dẫn triển khai](deploy-vercel.md). Dữ liệu của bản cũ không tự được nhập sang bản mới.

## 2. Chạy trên máy

Yêu cầu Node.js **22**, npm và Java **21** để chạy Firebase Emulator. `package-lock.json` khóa phiên bản thư viện.

```text
git clone https://github.com/devoralabsapp/datcom-public.git
cd datcom-public
npm ci --include=dev --include=optional
```

Sao chép `.env.example` thành `.env.local`, điền Firebase Web config của môi trường phát triển, sau đó:

```text
npm run dev
```

Mở `http://localhost:5173`. Nếu chưa điền Firebase config, web sẽ báo chưa cấu hình; đây không phải dữ liệu bị mất. Có thể chạy bộ kiểm thử mà không có `.env.local` hoặc tài khoản cloud:

```text
npm run build
npm run typecheck
npm test
```

`npm test` chạy Auth/Firestore Emulator ở project `demo-datcom-tests` trên cổng cục bộ được chọn tự động. Lần đầu công cụ có thể tải bộ giả lập. Không trỏ kiểm thử vào database thật. GitHub Actions chạy cùng chuỗi kiểm tra trên mỗi PR và khi cập nhật `main`.

## 3. Cấu hình cần hoàn tất trước khi dùng thật

- `.env.example`: toàn bộ giá trị Firebase được để trống. `NEXT_PUBLIC_*` được nhúng lúc build; đổi biến cần build/deploy lại.
- `.firebaserc`: không chọn sẵn project. Khi dùng Firebase CLI, luôn chỉ rõ `--project YOUR_FIREBASE_PROJECT_ID`.
- `PRIMARY_ADMIN_UID_HERE`: thay tất cả trong **`lib/user-model.ts` và `firestore.rules`** bằng cùng UID Google quản trị chính. Không cần thay trong tài liệu hoặc test; test đọc hằng số từ code và vẫn chạy được với UID đặt chỗ.
- `admins/{uid}`: tạo qua Firebase Console với `enabled` kiểu boolean bằng `true` để cấp quyền quản trị đầu tiên. UID trong tên document phải khớp cấu hình quản trị chính.
- Publish toàn bộ Rules đã cấu hình vào đúng database. Khách dùng phiên Firebase ẩn danh, không cần tự bấm đăng nhập Google.
- Google Sheets không có nguồn mặc định. Nếu bỏ trống `MEAL_SPREADSHEET_ID`, dùng thống kê **Web**; chọn Sheets sẽ báo chưa cấu hình. Chỉ thêm nguồn được phép cho người dùng ứng dụng xem.
- QR thanh toán nằm trong `settings/payment`; không có QR ngân hàng thật trong mã nguồn.

## 4. Vị trí mã nguồn

| Phần | File/thư mục |
| --- | --- |
| Giao diện đặt cơm, điều hướng, quản trị thực đơn | `app/rice-app.tsx`, `app/rice.css`, `app/interface.css` |
| Thống kê trên web và Sheets tùy chọn | `app/statistics-panel.tsx`, `lib/statistics.ts`, `lib/sheets-statistics.ts`, `app/api/statistics/sheets/route.ts` |
| Vòng quay và cân bằng lượt theo tuần | `app/pickup-panel.tsx`, `lib/pickup.ts`, `lib/pickup-client.ts` |
| Quản trị người dùng | `app/users-panel.tsx`, `lib/user-management.ts`, `lib/user-model.ts` |
| Đăng nhập, phiên khách và chuyển quyền đơn | `lib/firebase-client.ts`, `lib/client-auth.ts`, `components/google-login.tsx` |
| Đọc/ghi đơn và mô hình dữ liệu | `lib/meal-client.ts`, `lib/meal-client-model.ts`, `lib/types.ts` |
| Ngày hiện tại và nhớ tên khách | `lib/meal-day-clock.ts`, `lib/order-name.ts` |
| Phân quyền và kiểm thử | `firestore.rules`, `tests/`, `docs/firestore-rules-review.json` |
| Deploy và CI | `vercel.json`, `firebase.json`, `.github/workflows/checks.yml` |

Firebase Web SDK đọc/ghi trực tiếp theo Rules. Không có Firebase Admin SDK, OIDC hay private key. API máy chủ chỉ phục vụ phần đọc Sheets tùy chọn; endpoint QR cục bộ cũ trả 410. Menu mẫu trong `data/source.example.json` không có người đặt; `data/source.json` riêng bị loại khỏi Git và deploy.

## 5. Dữ liệu và công việc hằng ngày

| Đường dẫn Firestore | Nội dung |
| --- | --- |
| `days/{id}` | Ngày, trạng thái nhận đơn, giờ chốt, số món |
| `days/{id}/dishes/{hash}` | Thực đơn, giá và trạng thái món |
| `days/{id}/orders/{hash}` | Chủ đơn, tên, món, số lượng, ghi chú, đã trả/hủy |
| `pickupDraws/{YYYY-MM-DD}` | Kết quả vòng quay đã lưu, không sửa/xóa từ web |
| `admins/{uid}` | Vai trò quản trị |
| `userProfiles/{uid}` | Hồ sơ riêng cho chính chủ/quản trị |
| `userAccess/{uid}` | Trạng thái khóa đặt cơm |
| `accountLinks/{uid}` | Vé chuyển quyền đơn từ phiên khách sang Google |
| `settings/payment` | QR thanh toán |

Quản trị đăng nhập Google, tạo ngày/lưu thực đơn, theo dõi đơn, chốt cơm và xác nhận thanh toán. Mọi người có thể xem đơn và thống kê chung; chỉ chủ đơn/quản trị được sửa theo Rules. Giờ chốt tự động mặc định **09:30**, múi giờ Việt Nam. Nút vòng quay chốt danh sách và lưu một kết quả cho mỗi ngày; thuật toán ưu tiên người có ít lượt trong tuần, mặc định chọn hai người.

Quản trị chính cấp/thu hồi quyền quản trị cho người đã đăng nhập Google. Các quản trị khác có thể khóa/mở quyền đặt cơm của người dùng thông thường. Khóa áp dụng cho UID và quyền tạo/sửa đơn; không disable/xóa tài khoản Firebase Auth. Phiên khách có thể đổi UID nếu xóa dữ liệu trình duyệt. Tên khách được lưu trong cùng trình duyệt sau khi đặt thành công.

Không đổi schema hoặc sửa trực tiếp trạng thái thanh toán để thử tính năng trên Production. Việc đổi schema cần kế hoạch chuyển dữ liệu và cập nhật Rules/kiểm thử tương ứng. Các collection cũ `mealDays`/`mealOrders` không tự được di chuyển và bị Rules hiện tại từ chối.

## 6. Quy trình phát hành và xử lý sự cố

1. Tạo nhánh và PR; dùng dữ liệu mẫu hoặc Firebase project phát triển riêng.
2. Chạy build, typecheck, test; xem kết quả GitHub Actions và thử Preview bằng các vai trò khách/chính chủ/quản trị.
3. Nếu đổi Rules/schema, kiểm thử quyền đọc/ghi và đối chiếu với phiên bản web đang chạy trước khi Publish. Triển khai theo thứ tự tương thích giữa Rules và code; không mở rộng quyền để né lỗi.
4. Deploy Production sau khi đã cấu hình đúng môi trường; thử đặt/sửa/hủy, Google, thanh toán và quyền quản trị bằng dữ liệu kiểm tra đã thống nhất với chủ hệ thống.
5. Ghi lại phiên bản phát hành. Khi có lỗi, có thể khôi phục bản deploy trước trên Vercel; thao tác này **không** khôi phục Rules hoặc dữ liệu Firestore. Giữ bản Rules tương ứng và thực hiện sao lưu theo chính sách của đơn vị vận hành trước khi chuyển dữ liệu.

Lỗi “chưa cấu hình Firebase”: kiểm tra các biến Web config và build lại. Lỗi “permission-denied”: kiểm tra đúng project/database, Rules đã Publish, UID và `admins/{uid}`; không đổi thành cho phép đọc/ghi mọi thứ. Google không đăng nhập được: kiểm tra Google provider và Authorized domains. Không thấy vòng quay/quản trị: tải lại và xác minh quyền quản trị. Sheets lỗi không làm mất dữ liệu đặt trên web; chọn lại nguồn Web.

## 7. Giới hạn cần biết

Hồ sơ/người dùng được tổng hợp từ hoạt động web và lịch sử chủ đơn, không phải danh sách đầy đủ trong Firebase Authentication. Lượt vòng quay tính theo tên chuẩn hóa; hai tên khác nhau được coi là hai người. Rules kiểm tra quyền/cấu trúc kết quả nhưng không tính lại toàn bộ thuật toán ngẫu nhiên. Ảnh minh họa đang liên kết tới nguồn bên ngoài được ghi ở README; cần kiểm tra quyền sử dụng hoặc thay bằng ảnh của đơn vị khi phát hành dưới thương hiệu riêng.

I've set up prototype Security Rules to keep the data in Firestore safe. They are designed to be secure for owner/admin writes, private user profiles and primary-only role changes. However, you should review and verify them before broadly sharing your app. If you'd like, I can help you harden these rules.


## 8. QR theo đơn và API nhận thông báo BIDV

Quản trị có thể lưu ngân hàng/số tài khoản/tên nhận tiền ngay trên web, khách tạo QR cho đơn chưa trả của mình. [Hướng dẫn API Shortcut](bank-payments.md) có định dạng thông báo nguyên văn, các phản hồi và cách tạo/ngắt danh tính API giới hạn quyền. Cần Publish Rules mới và thêm hai biến máy chủ `PAYMENT_WEBHOOK_SECRET`, `PAYMENT_FIREBASE_REFRESH_TOKEN` trên đúng môi trường Vercel để tự đối chiếu; không cần OIDC hoặc service account. QR và xác nhận thủ công vẫn hoạt động khi API chưa được cấu hình. Bản hiện tại có 33 bài kiểm thử, gồm gửi trùng đồng thời, số dư so với tiền vào, sai tài khoản/giá, hết hạn và thu hồi kết nối.
