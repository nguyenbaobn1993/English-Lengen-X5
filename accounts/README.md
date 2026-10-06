# 🔐 Hướng dẫn Quản lý Tài khoản & Mật khẩu (User & Password)

Thư mục này chứa danh sách các tài khoản đăng nhập của **Giáo viên** và **Học sinh**.

---

## 📍 File cấu hình chính:
👉 **[`accounts/credentials.ts`](file:///e:/2026/App/5.%20english-mrs.-dung-verson-3%20-%20Copy/accounts/credentials.ts)**

---

## 🔑 Tài khoản mặc định sẵn có:

### 1. Tài khoản Giáo viên (Teacher)
- **Tên đăng nhập (Username)**: `Legend X5`
- **Mật khẩu (Password)**: KHÔNG có mật khẩu mặc định. Mật khẩu quản trị được mã hóa và lưu trên hệ thống (`_ping/teacher_auth`), đặt/đổi trong Cài đặt → Tài khoản (cần mật khẩu hiện tại), dùng chung cho mọi máy.
- **Quyền hạn**: Soạn bài tập AI, quản lý danh sách học sinh theo lớp, tổng hợp kết quả và xem Bảng Vàng vinh danh.

### 2. Tài khoản Học sinh (Student)
- **Tên đăng nhập (Username)**: `hocsinh`
- **Mật khẩu (Password)**: `123`
- Ngoài ra còn có tài khoản riêng mẫu:
  - `minhanh` / mật khẩu `123` (Học sinh Nguyễn Minh Anh - Lớp 6A1)
  - `baonam` / mật khẩu `123` (Học sinh Trần Bảo Nam - Lớp 6A1)

---

## 🛠️ Cách thay đổi hoặc thêm tài khoản mới:

1. Mở file `accounts/credentials.ts`.
2. Tìm đến mục tài khoản bạn muốn sửa:
   - Thay đổi `username`: Tên đăng nhập mới.
   - Thay đổi `password`: Mật khẩu mới.
   - Thay đổi `name`: Tên hiển thị của cô giáo hoặc học sinh.
3. Để **thêm tài khoản mới**, bạn chỉ cần copy 1 khối tài khoản và dán tiếp vào danh sách:
   ```typescript
   {
     id: 'student_lananh',
     username: 'lananh',
     password: '123',
     role: 'student',
     name: 'Đặng Lan Anh',
     avatar: '🌻',
     className: 'Lớp 6A1'
   },
   ```
4. Nhấn **Ctrl + S** để lưu lại file. Tải lại trang web là tài khoản mới sẽ có hiệu lực ngay lập tức!
