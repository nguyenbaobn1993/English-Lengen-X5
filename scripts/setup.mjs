// Cài đặt cho trung tâm mới: gắn cơ sở dữ liệu Firebase RIÊNG của trung tâm và đặt mật khẩu quản trị.
// Chạy: npm run setup
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import readline from 'readline';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const configFile = path.join(root, 'config', 'center.config.json');
const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
const ask = q => new Promise(r => rl.question(q, a => r(a.trim())));

const current = (() => { try { return JSON.parse(fs.readFileSync(configFile, 'utf8')); } catch { return {}; } })();

console.log('\n=== CÀI ĐẶT CƠ SỞ DỮ LIỆU CHO TRUNG TÂM ===');
console.log('Lấy địa chỉ tại: Firebase Console → dự án của trung tâm → Realtime Database (ô đầu trang).');
console.log('Dạng: https://<ma-du-an>-default-rtdb.<vung>.firebasedatabase.app\n');

let url = (await ask(`Địa chỉ Realtime Database${current.firebaseDatabaseURL ? ` [${current.firebaseDatabaseURL}]` : ''}: `)) || current.firebaseDatabaseURL || '';
url = url.replace(/\/+$/, '');
if (!/^https:\/\/.+\.(firebasedatabase\.app|firebaseio\.com)$/i.test(url)) {
  console.log('❌ Địa chỉ không đúng dạng. Chạy lại `npm run setup`.');
  rl.close();
  process.exit(1);
}
const apiKey = (await ask(`Web API Key (Project settings → General; Enter để bỏ qua)${current.firebaseApiKey ? ' [giữ khóa cũ]' : ''}: `)) || current.firebaseApiKey || '';
const q = apiKey ? `?auth=${apiKey}` : '';

process.stdout.write('Đang kiểm tra kết nối... ');
try {
  const res = await fetch(`${url}/_ping/test.json${q}`, { method: 'PUT', body: JSON.stringify({ timestamp: Date.now(), client: 'setup' }) });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${await res.text()}`);
  console.log('✅ OK');
} catch (e) {
  console.log('\n❌ Không ghi được vào cơ sở dữ liệu:', e.message);
  console.log('   Kiểm tra: đã tạo Realtime Database chưa, đã dán quy tắc database.rules.json chưa (xem HUONG_DAN_TRUNG_TAM_MOI.md).');
  rl.close();
  process.exit(1);
}

fs.writeFileSync(configFile, JSON.stringify({ firebaseDatabaseURL: url, firebaseApiKey: apiKey }, null, 2) + '\n');
console.log(`✅ Đã lưu vào config/center.config.json`);

// Mật khẩu quản trị (giáo viên): lưu mã hóa trên cơ sở dữ liệu của trung tâm, không có mật khẩu mặc định
let existing = null;
try { existing = await (await fetch(`${url}/_ping/teacher_auth.json${q}`)).json(); } catch {}
const want = existing && existing.hash
  ? (await ask('\nTrung tâm đã có mật khẩu quản trị. Đặt lại mật khẩu mới? (c/K): ')).toLowerCase() === 'c'
  : true;
if (want) {
  console.log('\n=== ĐẶT MẬT KHẨU QUẢN TRỊ (giáo viên) ===');
  const username = (await ask('Tên đăng nhập giáo viên [Legend X5]: ')) || 'Legend X5';
  const password = await ask('Mật khẩu (ít nhất 6 ký tự): ');
  const again = await ask('Nhập lại mật khẩu: ');
  console.clear();
  if (password.length < 6 || password !== again) {
    console.log('❌ Mật khẩu quá ngắn hoặc hai lần nhập không khớp. Cơ sở dữ liệu đã lưu; chạy lại `npm run setup` để đặt mật khẩu.');
  } else {
    const ITER = 120000;
    const salt = crypto.randomBytes(16).toString('hex');
    const hash = crypto.pbkdf2Sync(password, Buffer.from(salt, 'hex'), ITER, 32, 'sha256').toString('hex');
    const res = await fetch(`${url}/_ping/teacher_auth.json${q}`, {
      method: 'PUT',
      body: JSON.stringify({ username, displayName: username, salt, hash, iterations: ITER, updatedAt: new Date().toISOString() })
    });
    console.log(res.ok ? `✅ Đã đặt mật khẩu quản trị cho "${username}".` : `❌ Không lưu được mật khẩu (HTTP ${res.status}).`);
  }
}

rl.close();
console.log('\nXong. Tiếp theo: `npm run build` để thử, rồi đưa code lên GitHub / Vercel (xem HUONG_DAN_TRUNG_TAM_MOI.md).\n');
