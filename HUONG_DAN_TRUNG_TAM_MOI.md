# Hướng dẫn cài đặt English Legend X5

> LEGEND X5 - CONNECT THE WORLD

Bản code này **không chứa cơ sở dữ liệu của trung tâm nào**. Mỗi trung tâm phải gắn cơ sở dữ liệu Firebase của riêng mình.
Chưa gắn thì trang web chỉ hiện màn hình hướng dẫn, không kết nối đi đâu cả.

## 1. Tạo cơ sở dữ liệu Firebase (miễn phí)
1. Vào https://console.firebase.google.com → **Add project** → đặt tên (vd: `trung-tam-abc`).
2. Menu trái **Build → Realtime Database → Create Database** → chọn vùng **Singapore (asia-southeast1)** → **Start in locked mode**.
3. Tab **Rules**: xóa hết, dán toàn bộ nội dung file `database.rules.json` trong thư mục code này → **Publish**.
4. Chép địa chỉ ở đầu trang Data, dạng `https://trung-tam-abc-default-rtdb.asia-southeast1.firebasedatabase.app`.
5. (Tùy chọn) **Project settings → General → Web API Key**.

## 2. Gắn cơ sở dữ liệu vào code + đặt mật khẩu quản trị
Cần cài Node.js (https://nodejs.org). Mở cửa sổ lệnh trong thư mục code:
```
npm install
npm run setup
```
Nhập địa chỉ Firebase ở bước 1, rồi đặt **tên đăng nhập và mật khẩu giáo viên** (không có mật khẩu mặc định).
Thông tin được lưu vào `config/center.config.json`.

Chạy thử trên máy: `npm run dev` → mở địa chỉ hiện ra.

## 3. Đưa lên web (GitHub + Vercel)
1. Tạo kho GitHub **mới** cho trung tâm, tải toàn bộ code lên (kể cả `config/center.config.json`).
2. Vercel → **Add New → Project** → chọn kho vừa tạo → **Deploy**.

**Cách khác (không sửa file json):** trên Vercel → Project → **Settings → Environment Variables**, thêm:
- `VITE_FIREBASE_DATABASE_URL` = địa chỉ Firebase
- `VITE_FIREBASE_API_KEY` = Web API Key (nếu có)

rồi **Redeploy**. Biến môi trường được ưu tiên hơn file json. Khi dùng cách này vẫn cần chạy `npm run setup` một lần
(với cùng địa chỉ) để đặt mật khẩu quản trị.

## Lưu ý
- Mỗi trung tâm một Firebase riêng, một kho GitHub riêng, một dự án Vercel riêng.
- Gửi kết quả sang Google Sheets đang **tắt**. Muốn bật: dán URL Web App của trung tâm vào `services/googleSheetsService.ts` (xem `google-apps-script.js`).
- Logo, ảnh bìa và ảnh thành viên nằm trong `public/brand/`. Slogan, danh sách đội ngũ sửa trong `components/Brand.tsx`.
- Chạy thử trên máy với Firebase Emulator: đặt `VITE_FIREBASE_DATABASE_URL=http://localhost:9000` (chỉ chấp nhận `http://` với localhost).

## 4. Bật tạo bài bằng AI (Gemini)
1. Lấy key miễn phí tại https://aistudio.google.com/apikey (đăng nhập Google → **Create API key**).
2. Đăng nhập app vai giáo viên → **⚙️ Cài đặt → 🤖 Dịch Vụ AI** → chọn **Gemini API** → dán key.
3. Bấm **⚡ Kiểm tra key & tự tìm model dùng được**: app hỏi Google danh sách model của key, tạo thử 1 câu,
   tự chọn model tốt nhất. Thấy ✅ thì bấm **LƯU CẤU HÌNH**.
- Key lưu trên trình duyệt của từng máy (không lưu lên cơ sở dữ liệu để tránh lộ key) → mỗi máy giáo viên nhập 1 lần.
- Khi một model hết lượt miễn phí, app tự chuyển sang model khác của cùng key.
- Nếu giới hạn key trên Google Cloud, dùng **API restrictions → Generative Language API**.
  **Không** dùng giới hạn theo website (HTTP referrer): app gửi yêu cầu không kèm referrer nên sẽ bị chặn.

## 5. Thêm giáo viên
- Tài khoản tạo bằng `npm run setup` là **quản trị** (chủ trung tâm).
- Quản trị vào **⚙️ Cài đặt → 👥 Giáo Viên** → nhập tên hiển thị, tên đăng nhập, mật khẩu → **Tạo tài khoản giáo viên**.
- Giáo viên đăng nhập ở mục **Giáo Viên** trên màn hình đăng nhập, dùng được mọi chức năng dạy học.
- Chỉ quản trị mới thêm / khóa / xóa / đặt lại mật khẩu giáo viên, đổi mật khẩu quản trị và xác nhận xóa lớp.
- Giáo viên tự đổi mật khẩu ở **⚙️ Cài đặt → 🔐 Tài Khoản Của Tôi**.
