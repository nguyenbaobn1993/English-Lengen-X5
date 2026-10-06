// ============================================================
// 📊 Google Sheets Service - Gửi dữ liệu học sinh vào Google Sheets
// ============================================================

// ⚠️ QUAN TRỌNG: Sau khi deploy Google Apps Script, hãy dán URL Web App vào đây
const GOOGLE_SCRIPT_URL = ''; // Trung tâm tự dán URL Web App Google Apps Script của mình (để trống = tắt gửi Google Sheets)

export interface SheetData {
  thoiGian: string;
  hoTen: string;
  lopHoc: string;
  tenBaiHoc: string;
  diemSo: number;
  soCauDung: number;
  tongSoCau: number;
}

/**
 * Format thời gian theo định dạng dd/MM/yyyy HH:mm:ss
 */
function formatDateTime(date: Date): string {
  const dd = String(date.getDate()).padStart(2, '0');
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const yyyy = date.getFullYear();
  const hh = String(date.getHours()).padStart(2, '0');
  const min = String(date.getMinutes()).padStart(2, '0');
  const ss = String(date.getSeconds()).padStart(2, '0');
  return `${dd}/${mm}/${yyyy} ${hh}:${min}:${ss}`;
}

/**
 * Gửi dữ liệu học sinh vào Google Sheets
 * Chạy ngầm, không block UI nếu thất bại
 */
export async function sendToGoogleSheets(data: {
  studentName: string;
  studentClass: string;
  topic: string;
  score: number;
  totalCorrect: number;
  totalQuestions: number;
}): Promise<boolean> {
  // Kiểm tra URL đã được cấu hình chưa
  if (!GOOGLE_SCRIPT_URL || (GOOGLE_SCRIPT_URL as string) === 'PASTE_YOUR_WEB_APP_URL_HERE') {
    console.warn('⚠️ Google Sheets URL chưa được cấu hình. Bỏ qua gửi dữ liệu.');
    return false;
  }

  const payload: SheetData = {
    thoiGian: formatDateTime(new Date()),
    hoTen: data.studentName || 'Ẩn danh',
    lopHoc: data.studentClass || 'Chưa nhập',
    tenBaiHoc: data.topic,
    diemSo: data.score,
    soCauDung: data.totalCorrect,
    tongSoCau: data.totalQuestions,
  };

  try {
    const response = await fetch(GOOGLE_SCRIPT_URL, {
      method: 'POST',
      mode: 'no-cors', // Google Apps Script yêu cầu no-cors từ browser
      headers: {
        'Content-Type': 'text/plain', // no-cors chỉ cho phép text/plain
      },
      body: JSON.stringify(payload),
    });

    // Với mode no-cors, response luôn là opaque (status = 0)
    // Nên ta coi như thành công nếu không có lỗi network
    console.log('✅ Đã gửi dữ liệu vào Google Sheets');
    return true;
  } catch (error) {
    console.error('❌ Lỗi gửi dữ liệu Google Sheets:', error);
    return false;
  }
}
