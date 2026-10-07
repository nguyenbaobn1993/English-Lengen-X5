/**
 * TRẠM TRUNG CHUYỂN GEMINI – AI CỦA TRUNG TÂM (Vercel Serverless Function, dùng cho bản thật & bản demo)
 *
 * - Key Gemini nằm ở biến môi trường GEMINI_API_KEY trên Vercel, KHÔNG bao giờ gửi xuống trình duyệt.
 * - Chỉ cho phép: liệt kê model (GET v1beta/models) và tạo nội dung chữ (POST v1beta/models/<gemini-...>:generateContent).
 * - Giới hạn lượt dùng theo IP để người lạ không dùng cạn hạn mức của trung tâm.
 *   (Giới hạn nằm trong bộ nhớ từng máy chủ Vercel nên chỉ mang tính "chặn bớt"; nên dùng key gói MIỄN PHÍ
 *    — không bật thanh toán — để trường hợp xấu nhất chỉ là hết lượt trong ngày, không mất tiền.)
 *
 * Biến môi trường (Vercel → Settings → Environment Variables):
 *   GEMINI_API_KEY        (bắt buộc)  key lấy ở https://aistudio.google.com/apikey
 *   DEMO_AI_PER_IP        (tùy chọn)  số lượt gọi tối đa mỗi IP trong 1 giờ, mặc định 30
 *   DEMO_AI_PER_HOUR      (tùy chọn)  tổng lượt gọi tối đa mỗi giờ trên một máy chủ, mặc định 300
 */

const GOOGLE = 'https://generativelanguage.googleapis.com';
const MAX_BODY = 4 * 1024 * 1024; // ảnh SGK gửi dạng base64 – Vercel giới hạn ~4.5MB
const HOUR = 60 * 60 * 1000;

const perIp = new Map(); // ip -> [timestamps]
let globalHits = [];

const json = (res, status, body) => {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.end(JSON.stringify(body));
};

const googleError = (res, status, statusText, message) =>
  json(res, status, { error: { code: status, status: statusText, message } });

const readBody = req =>
  new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    req.on('data', c => {
      size += c.length;
      if (size > MAX_BODY) { reject(new Error('TOO_LARGE')); req.destroy(); return; }
      chunks.push(c);
    });
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });

const clientIp = req =>
  String(req.headers['x-forwarded-for'] || req.socket?.remoteAddress || 'unknown').split(',')[0].trim();

const allow = ip => {
  const now = Date.now();
  const limitIp = Number(process.env.DEMO_AI_PER_IP || 30);
  const limitAll = Number(process.env.DEMO_AI_PER_HOUR || 300);
  globalHits = globalHits.filter(t => now - t < HOUR);
  const mine = (perIp.get(ip) || []).filter(t => now - t < HOUR);
  if (mine.length >= limitIp || globalHits.length >= limitAll) return false;
  mine.push(now);
  perIp.set(ip, mine);
  globalHits.push(now);
  if (perIp.size > 5000) perIp.clear();
  return true;
};

export default async function handler(req, res) {
  const url = new URL(req.url, 'http://localhost');
  // /api/gemini/v1beta/models/...  (Vercel chuyển thành ?path=...)
  const path = (url.searchParams.get('path') || url.pathname.replace(/^\/api\/gemini\/?/, '')).replace(/^\/+/, '');

  const key = (process.env.GEMINI_API_KEY || '').trim();
  if (!key) {
    return googleError(res, 403, 'PERMISSION_DENIED',
      'AI của trung tâm chưa được cấu hình (thiếu GEMINI_API_KEY trên Vercel). Bạn có thể tự nhập API key của mình trong Cài đặt.');
  }

  const isList = req.method === 'GET' && path === 'v1beta/models';
  const gen = path.match(/^v1beta\/models\/(gemini-[a-z0-9.\-]+):generateContent$/i);
  const textModel = gen && !/(tts|image|live|audio|embedding|veo|imagen)/i.test(gen[1]);
  if (!isList && !(req.method === 'POST' && textModel)) {
    return googleError(res, 403, 'PERMISSION_DENIED', 'AI của trung tâm chỉ hỗ trợ tạo nội dung chữ bằng Gemini.');
  }

  if (!isList && !allow(clientIp(req))) {
    return googleError(res, 429, 'RESOURCE_EXHAUSTED',
      'AI của trung tâm đã dùng hết lượt trong giờ này (quota). Vui lòng thử lại sau hoặc nhập API key riêng trong Cài đặt.');
  }

  let body;
  if (req.method === 'POST') {
    try { body = await readBody(req); } catch {
      return googleError(res, 400, 'INVALID_ARGUMENT', 'Dữ liệu gửi lên quá lớn (tối đa 4MB).');
    }
  }

  try {
    const target = `${GOOGLE}/${path}${isList ? '?pageSize=1000' : ''}`;
    const r = await fetch(target, {
      method: req.method,
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: req.method === 'POST' ? body : undefined
    });
    const text = await r.text();
    res.statusCode = r.status;
    res.setHeader('Content-Type', r.headers.get('content-type') || 'application/json');
    res.setHeader('Cache-Control', 'no-store');
    res.end(text);
  } catch (e) {
    return googleError(res, 503, 'UNAVAILABLE', `Không kết nối được tới Google: ${e?.message || e}`);
  }
}
