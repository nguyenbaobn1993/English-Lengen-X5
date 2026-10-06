// ============================================================
// 📋 GOOGLE APPS SCRIPT - GHI DỮ LIỆU HỌC SINH VÀO GOOGLE SHEETS
// ============================================================
//
// HƯỚNG DẪN CÀI ĐẶT:
// 
// BƯỚC 1: Tạo Script
//   1. Truy cập https://script.google.com/
//   2. Nhấn "New Project" (Dự án mới)
//   3. Đặt tên project: "English Legend X5 - Báo cáo"
//   4. Xóa hết code mặc định trong editor
//   5. Dán TOÀN BỘ code bên dưới vào
//   6. Nhấn Ctrl+S để lưu
//
// BƯỚC 2: Deploy Web App
//   1. Nhấn "Deploy" (Triển khai) → "New deployment" (Triển khai mới)
//   2. Nhấn biểu tượng ⚙️ → Chọn "Web app"
//   3. Cấu hình như sau:
//      - Description: "Báo cáo học sinh"
//      - Execute as (Thực thi với tư cách): "Me" (Tôi)
//      - Who has access (Ai có quyền truy cập): "Anyone" (Bất kỳ ai)
//   4. Nhấn "Deploy" (Triển khai)
//   5. Google sẽ yêu cầu cấp quyền → Nhấn "Authorize access"
//      - Chọn tài khoản Google của bạn
//      - Nếu thấy cảnh báo "This app isn't verified", nhấn "Advanced" → "Go to..."
//      - Nhấn "Allow" để cấp quyền
//   6. SAU KHI DEPLOY XONG → Copy URL Web App (dạng: https://script.google.com/macros/s/xxx/exec)
//
// BƯỚC 3: Dán URL vào project
//   Mở file services/googleSheetsService.ts
//   Thay 'PASTE_YOUR_WEB_APP_URL_HERE' bằng URL vừa copy
//
// LƯU Ý KHI CẬP NHẬT CODE:
//   Mỗi khi sửa code script, cần Deploy lại:
//   Deploy → Manage deployments → Chỉnh sửa (✏️) → Version: "New version" → Deploy
//
// ============================================================

var SHEET_ID = '1D_y9zYcWvIdgC78DzFy7T_QxItGAG90GtCNS-HYcn04';
var SHEET_NAME = 'Báo cáo ngày';

/**
 * Xử lý POST request từ ứng dụng web
 * Nhận dữ liệu JSON và ghi vào Google Sheet
 */
function doPost(e) {
  try {
    // Parse dữ liệu JSON từ request body
    var data = JSON.parse(e.postData.contents);

    // Mở Google Sheet
    var ss = SpreadsheetApp.openById(SHEET_ID);
    var sheet = ss.getSheetByName(SHEET_NAME);

    // Nếu sheet chưa tồn tại → Tạo mới + thêm header
    if (!sheet) {
      sheet = ss.insertSheet(SHEET_NAME);
      // Thêm header row
      sheet.appendRow([
        'STT',
        'Thời gian',
        'Họ và tên',
        'Lớp học',
        'Tên bài học',
        'Điểm số',
        'Số câu đúng',
        'Tổng số câu'
      ]);
      // Format header: in đậm, nền xanh, chữ trắng
      var headerRange = sheet.getRange(1, 1, 1, 8);
      headerRange.setFontWeight('bold');
      headerRange.setBackground('#16a34a');
      headerRange.setFontColor('#FFFFFF');
      headerRange.setHorizontalAlignment('center');
      headerRange.setFontSize(11);
      // Cố định hàng header
      sheet.setFrozenRows(1);
      // Set độ rộng cột
      sheet.setColumnWidth(1, 60);   // STT
      sheet.setColumnWidth(2, 180);  // Thời gian
      sheet.setColumnWidth(3, 200);  // Họ và tên
      sheet.setColumnWidth(4, 120);  // Lớp học
      sheet.setColumnWidth(5, 280);  // Tên bài học
      sheet.setColumnWidth(6, 100);  // Điểm số
      sheet.setColumnWidth(7, 120);  // Số câu đúng
      sheet.setColumnWidth(8, 120);  // Tổng số câu
    }

    // Tính STT = số hàng hiện có (trừ header)
    var lastRow = sheet.getLastRow();
    var stt = lastRow; // Hàng 1 = header → lastRow chính là STT tiếp theo

    // Ghi dữ liệu vào hàng mới
    sheet.appendRow([
      stt,                        // Cột A: STT
      data.thoiGian || '',        // Cột B: Thời gian
      data.hoTen || '',           // Cột C: Họ và tên
      data.lopHoc || '',          // Cột D: Lớp học
      data.tenBaiHoc || '',       // Cột E: Tên bài học
      data.diemSo || 0,           // Cột F: Điểm số
      data.soCauDung || 0,        // Cột G: Số câu đúng
      data.tongSoCau || 0         // Cột H: Tổng số câu
    ]);

    // Format hàng vừa ghi
    var newRow = lastRow + 1;
    sheet.getRange(newRow, 1, 1, 8).setHorizontalAlignment('center');
    sheet.getRange(newRow, 3).setHorizontalAlignment('left');  // Họ tên căn trái
    sheet.getRange(newRow, 5).setHorizontalAlignment('left');  // Tên bài học căn trái

    // Trả về kết quả thành công
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'success',
        message: 'Đã ghi dữ liệu thành công!',
        row: newRow
      }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    // Trả về lỗi
    return ContentService
      .createTextOutput(JSON.stringify({
        status: 'error',
        message: error.toString()
      }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * Xử lý GET request - dùng để test xem script có hoạt động không
 * Truy cập URL Web App trên trình duyệt để kiểm tra
 */
function doGet(e) {
  return ContentService
    .createTextOutput(JSON.stringify({
      status: 'ok',
      message: 'English Legend X5 - Google Apps Script đang hoạt động!'
    }))
    .setMimeType(ContentService.MimeType.JSON);
}
