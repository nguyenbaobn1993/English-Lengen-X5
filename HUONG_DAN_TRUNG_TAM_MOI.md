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
