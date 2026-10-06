import { AuthUser, UserRole } from '../types';
import { verifyTeacherAccount, getTeacherAccount } from './teacherAccounts';
import { INITIAL_ACCOUNTS, AccountCredential } from '../accounts/credentials';
import { verifyTeacherPassword, setTeacherPasswordOnCloud, fetchTeacherAuth } from './teacherAuth';

const CURRENT_USER_KEY = 'mrs_dung_auth_current_user';
const CUSTOM_ACCOUNTS_KEY = 'mrs_dung_custom_accounts';
export const TEACHER_CREDENTIALS_KEY = 'mrs_dung_teacher_custom_credentials';
export const SAVED_TEACHER_LOGIN_KEY = 'mrs_dung_saved_teacher_login';

export interface TeacherCredentials {
  username: string; // default: 'Legend X5'
  password: string; // KHÔNG còn mật khẩu mặc định — mật khẩu kiểm tra qua hệ thống (teacherAuth)
  displayName?: string; // default: 'Thầy cô Legend X5'
  updatedAt?: string;
}

export const DEFAULT_TEACHER_CREDENTIALS: TeacherCredentials = {
  username: 'Legend X5',
  password: '',
  displayName: 'Thầy cô Legend X5'
};

/**
 * Tên đăng nhập / tên hiển thị giáo viên đã dùng trên máy này (không chứa mật khẩu)
 */
export const getTeacherCredentials = (): TeacherCredentials => {
  if (typeof window === 'undefined') return DEFAULT_TEACHER_CREDENTIALS;
  try {
    const raw = localStorage.getItem(TEACHER_CREDENTIALS_KEY);
    if (!raw) return DEFAULT_TEACHER_CREDENTIALS;
    const parsed = JSON.parse(raw);
    return {
      username: parsed.username?.trim() || DEFAULT_TEACHER_CREDENTIALS.username,
      password: '',
      displayName: parsed.displayName?.trim() || DEFAULT_TEACHER_CREDENTIALS.displayName,
      updatedAt: parsed.updatedAt
    };
  } catch {
    return DEFAULT_TEACHER_CREDENTIALS;
  }
};

/** Đăng nhập giáo viên: kiểm tra mật khẩu trên hệ thống (dùng chung mọi máy). */
export const loginTeacher = async (
  usernameInput: string,
  passwordInput: string
): Promise<{ success: boolean; user?: AuthUser; error?: string }> => {
  if (!usernameInput.trim()) return { success: false, error: 'Vui lòng nhập tên đăng nhập!' };
  if (!passwordInput.trim()) return { success: false, error: 'Vui lòng nhập mật khẩu!' };
  const res = await verifyTeacherPassword(passwordInput, usernameInput);
  if (!res.ok || !res.record) {
    // Không phải tài khoản quản trị → thử tài khoản giáo viên do quản trị tạo
    const sub = await verifyTeacherAccount(usernameInput, passwordInput);
    if (sub.ok && sub.account) {
      const teacherUser: AuthUser = {
        id: `teacher_${sub.account.id}`,
        username: sub.account.username,
        role: 'teacher',
        name: sub.account.displayName || sub.account.username,
        avatar: '🧑‍🏫',
        authStamp: sub.account.updatedAt,
        teacherAccountId: sub.account.id
      };
      setCurrentUser(teacherUser);
      return { success: true, user: teacherUser };
    }
    // Chưa cài mật khẩu quản trị / mất kết nối → giữ nguyên thông báo gốc
    return { success: false, error: sub.error || res.error };
  }
  const authUser: AuthUser = {
    id: 'teacher_dung',
    username: res.record.username,
    role: 'teacher',
    name: res.record.displayName || 'Thầy cô Legend X5',
    avatar: '👩‍🏫',
    authStamp: res.record.updatedAt
  };
  try {
    localStorage.setItem(TEACHER_CREDENTIALS_KEY, JSON.stringify({ username: res.record.username, displayName: res.record.displayName }));
  } catch {}
  setCurrentUser(authUser);
  return { success: true, user: authUser };
};

/** Đổi tên đăng nhập / mật khẩu giáo viên trên hệ thống → các máy khác đang đăng nhập quản trị bị đăng xuất. */
export const changeTeacherCredentials = async (
  currentPassword: string,
  newUsername: string,
  newPassword: string,
  displayName?: string
): Promise<{ success: boolean; error?: string }> => {
  const username = newUsername.trim();
  const password = newPassword.trim();
  if (!username) return { success: false, error: 'Tên đăng nhập không được để trống!' };
  if (password.length < 6) return { success: false, error: 'Mật khẩu mới phải có ít nhất 6 ký tự!' };
  const check = await verifyTeacherPassword(currentPassword);
  if (!check.ok) return { success: false, error: check.error === undefined ? 'Mật khẩu hiện tại không chính xác!' : check.error.replace('Tên đăng nhập hoặc mật khẩu giáo viên', 'Mật khẩu hiện tại') };
  const saved = await setTeacherPasswordOnCloud(username, password, displayName || check.record?.displayName);
  if (!saved.ok || !saved.record) return { success: false, error: saved.error };
  const user = getCurrentUser();
  if (user && user.role === 'teacher') setCurrentUser({ ...user, username, authStamp: saved.record.updatedAt });
  try {
    localStorage.setItem(TEACHER_CREDENTIALS_KEY, JSON.stringify({ username, displayName: saved.record.displayName }));
  } catch {}
  const savedLogin = getSavedTeacherLogin();
  if (savedLogin && savedLogin.remember) setSavedTeacherLogin(username, password, true);
  return { success: true };
};

/**
 * Phiên quản trị còn hợp lệ không: mật khẩu trên hệ thống phải đúng là bản lúc đăng nhập.
 * Trả về false khi chắc chắn không hợp lệ (đăng nhập bằng mật khẩu cũ / mật khẩu đã đổi). Mất mạng → coi như hợp lệ.
 */
export const isTeacherSessionValid = async (): Promise<boolean> => {
  const user = getCurrentUser();
  if (!user || user.role !== 'teacher') return true;
  if (!user.authStamp) return false;
  if (user.teacherAccountId) {
    // Giáo viên do quản trị tạo: bị khóa / xóa / đặt lại mật khẩu → hết phiên
    const acc = await getTeacherAccount(user.teacherAccountId);
    if (acc === 'error') return true;
    return !!acc && !acc.disabled && acc.updatedAt === user.authStamp;
  }
  const record = await fetchTeacherAuth();
  if (record === 'error') return true;
  if (!record) return false;
  return record.updatedAt === user.authStamp;
};

/**
 * Save customized teacher credentials (username, password, display name)
 */
export const saveTeacherCredentials = (
  creds: { username: string; password: string; displayName?: string }
): { success: boolean; error?: string } => {
  if (typeof window === 'undefined') return { success: false, error: 'Môi trường không hỗ trợ' };
  const username = creds.username.trim();
  const password = creds.password.trim();
  const displayName = (creds.displayName || 'Thầy cô Legend X5').trim();

  if (!username) {
    return { success: false, error: 'Tên đăng nhập không được để trống!' };
  }
  if (!password) {
    return { success: false, error: 'Mật khẩu không được để trống!' };
  }
  if (password.length < 4) {
    return { success: false, error: 'Mật khẩu phải có ít nhất 4 ký tự!' };
  }

  const payload: TeacherCredentials = {
    username,
    password,
    displayName,
    updatedAt: new Date().toISOString()
  };

  localStorage.setItem(TEACHER_CREDENTIALS_KEY, JSON.stringify(payload));

  // If saved login exists on this device, automatically update it with new credentials
  const savedLogin = getSavedTeacherLogin();
  if (savedLogin && savedLogin.remember) {
    setSavedTeacherLogin(username, password, true);
  }

  return { success: true };
};

export interface SavedTeacherLogin {
  username: string;
  password: string;
  remember: boolean;
}

/**
 * Get credentials saved on this device for one-touch login
 */
export const getSavedTeacherLogin = (): SavedTeacherLogin | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SAVED_TEACHER_LOGIN_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed && parsed.remember && parsed.username) {
      return parsed as SavedTeacherLogin;
    }
    return null;
  } catch {
    return null;
  }
};

/**
 * Save teacher credentials on this device
 */
export const setSavedTeacherLogin = (username: string, password: string, remember: boolean): void => {
  if (typeof window === 'undefined') return;
  if (remember) {
    localStorage.setItem(SAVED_TEACHER_LOGIN_KEY, JSON.stringify({
      username: username.trim(),
      password: password.trim(),
      remember: true
    }));
  } else {
    localStorage.removeItem(SAVED_TEACHER_LOGIN_KEY);
  }
};

/**
 * Clear saved credentials from this device
 */
export const clearSavedTeacherLogin = (): void => {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(SAVED_TEACHER_LOGIN_KEY);
};

/**
 * Get all available accounts (combining file-based INITIAL_ACCOUNTS with any locally saved overrides)
 */
export const getAllAccounts = (): AccountCredential[] => {
  if (typeof window === 'undefined') return INITIAL_ACCOUNTS;
  try {
    const raw = localStorage.getItem(CUSTOM_ACCOUNTS_KEY);
    if (!raw) return INITIAL_ACCOUNTS;
    const customList = JSON.parse(raw) as AccountCredential[];
    if (!Array.isArray(customList) || customList.length === 0) return INITIAL_ACCOUNTS;

    // Merge: custom overrides file-based by username
    const map = new Map<string, AccountCredential>();
    INITIAL_ACCOUNTS.forEach(a => map.set(a.username.toLowerCase(), a));
    customList.forEach(a => map.set(a.username.toLowerCase(), a));
    return Array.from(map.values());
  } catch {
    return INITIAL_ACCOUNTS;
  }
};

/**
 * Save custom/updated accounts list
 */
export const saveAccounts = (accounts: AccountCredential[]): void => {
  if (typeof window === 'undefined') return;
  localStorage.setItem(CUSTOM_ACCOUNTS_KEY, JSON.stringify(accounts));
};

import { getStudents, getClasses, updateStudent, addStudent } from './assignmentService';

/**
 * Login verification (supports both teacher/admin accounts and student lookup)
 */
export const login = (
  usernameInput: string,
  passwordInput: string,
  expectedRole?: UserRole,
  classIdFilter?: string
): { success: boolean; user?: AuthUser; error?: string } => {
  const cleanUser = usernameInput.trim().toLowerCase();
  const cleanPass = passwordInput.trim();

  if (!cleanUser) {
    return { success: false, error: 'Vui lòng nhập tên đăng nhập hoặc họ tên học sinh!' };
  }
  if (!cleanPass) {
    return { success: false, error: 'Vui lòng nhập mật khẩu!' };
  }

  // Giáo viên KHÔNG đăng nhập qua hàm đồng bộ này nữa — phải dùng loginTeacher (kiểm tra mật khẩu trên hệ thống)
  const teacherCreds = getTeacherCredentials();
  const normalizedUser = cleanUser.replace(/[\.\s_-]/g, '');
  const isMatchTeacherUsername =
    normalizedUser === teacherCreds.username.toLowerCase().replace(/[\.\s_-]/g, '') || normalizedUser === 'legendx5';
  if (isMatchTeacherUsername || expectedRole === 'teacher') {
    return { success: false, error: 'Vui lòng đăng nhập giáo viên ở mục Giáo viên.' };
  }

  // If logging in as student, first check student records created by teacher
  if (expectedRole === 'student') {
    const students = getStudents(classIdFilter && classIdFilter !== 'ALL' ? classIdFilter : undefined);
    const matchedStudent = students.find(s => 
      s.name.toLowerCase() === cleanUser ||
      (s.englishName && s.englishName.toLowerCase() === cleanUser) ||
      (s.username && s.username.toLowerCase() === cleanUser) ||
      s.id.toLowerCase() === cleanUser
    );

    if (matchedStudent) {
      const studentPass = (matchedStudent.password || '123').trim();
      if (cleanPass !== studentPass) {
        return {
          success: false,
          error: 'Mật khẩu không chính xác! (Mật khẩu mặc định là 123. Nếu em đã đổi mật khẩu mà quên, hãy liên hệ Thầy Cô để cấp lại nhé).'
        };
      }
      const authUser: AuthUser = {
        id: matchedStudent.id,
        username: matchedStudent.username || matchedStudent.name,
        role: 'student',
        name: matchedStudent.name,
        avatar: matchedStudent.avatar || '🎒',
        classId: matchedStudent.classId,
        className: matchedStudent.className,
        phone: matchedStudent.phone
      };
      setCurrentUser(authUser);
      return { success: true, user: authUser };
    }
  }

  // Check file/localStorage based accounts
  const accounts = getAllAccounts();
  const matched = accounts.find(a => a.username.toLowerCase() === cleanUser || a.username.toLowerCase() === usernameInput.trim().toLowerCase());

  if (!matched) {
    // If student role and not found in accounts or students
    if (expectedRole === 'student') {
      return { success: false, error: 'Không tìm thấy học sinh với tên này! Vui lòng kiểm tra lại lớp và họ tên.' };
    }
    return { success: false, error: 'Tên đăng nhập không tồn tại trong hệ thống!' };
  }

  if (matched.role === 'teacher' || !matched.password || matched.password !== cleanPass) {
    return { success: false, error: 'Mật khẩu không chính xác. Vui lòng kiểm tra lại!' };
  }

  if (expectedRole && matched.role !== expectedRole) {
    const roleName = expectedRole === 'teacher' ? 'Giáo viên' : 'Học sinh';
    return {
      success: false,
      error: `Tài khoản này không thuộc vai trò ${roleName}!`
    };
  }

  const authUser: AuthUser = {
    id: matched.id,
    username: matched.username,
    role: matched.role,
    name: matched.name,
    avatar: matched.avatar || '🎒',
    classId: matched.classId,
    className: matched.className
  };

  setCurrentUser(authUser);
  return { success: true, user: authUser };
};

/**
 * Simple student login by Name and Class (NO PASSWORD REQUIRED)
 */
export const loginStudentSimple = (
  studentName: string,
  classIdOrName: string
): { success: boolean; user?: AuthUser; error?: string } => {
  const cleanName = (studentName || '').trim();
  const cleanClass = (classIdOrName || '').trim();

  if (!cleanClass) {
    return { success: false, error: 'Em ơi, vui lòng chọn lớp học của mình nhé!' };
  }
  if (!cleanName) {
    return { success: false, error: 'Em ơi, vui lòng chọn hoặc nhập họ và tên của mình nhé!' };
  }

  const norm = (s?: string) => (s || '').toLowerCase().replace(/^(lớp|lop)\s*/i, '').trim();
  const cleanNFC = (s?: string) => (s || '').trim().toLowerCase().normalize('NFC');

  const classes = getClasses();
  const targetClassNorm = norm(cleanClass);
  const matchedClass = classes.find(c => 
    c.id === cleanClass || 
    norm(c.name) === targetClassNorm ||
    cleanNFC(c.name) === cleanNFC(cleanClass)
  );

  const targetClassId = matchedClass ? matchedClass.id : cleanClass;
  const targetClassName = matchedClass ? matchedClass.name : cleanClass;

  // Check if student already exists in this class
  const students = getStudents(targetClassId);
  const targetNameNFC = cleanNFC(cleanName);

  const matchedStudent = students.find(s =>
    cleanNFC(s.name) === targetNameNFC ||
    (s.englishName && cleanNFC(s.englishName) === targetNameNFC) ||
    (s.id && s.id.toLowerCase() === targetNameNFC) ||
    (s.username && cleanNFC(s.username) === targetNameNFC)
  );

  const authUser: AuthUser = {
    id: matchedStudent ? matchedStudent.id : `std_${Date.now()}_${Math.random().toString(36).substring(2, 6)}`,
    username: matchedStudent?.username || cleanName,
    role: 'student',
    name: matchedStudent?.name || cleanName,
    avatar: matchedStudent?.avatar || '🎒',
    classId: targetClassId,
    className: targetClassName,
    phone: matchedStudent?.phone
  };

  setCurrentUser(authUser);
  return { success: true, user: authUser };
};

/**
 * Direct student login by Class ID and Student Name (No password required)
 */
export const loginStudentByClassAndName = (
  classId: string,
  studentNameOrId: string,
  _passwordInput?: string
): { success: boolean; user?: AuthUser; error?: string } => {
  return loginStudentSimple(studentNameOrId, classId);
};

/**
 * Get current logged in user
 */
export const getCurrentUser = (): AuthUser | null => {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(CURRENT_USER_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as AuthUser;
  } catch {
    return null;
  }
};

/**
 * Set current logged in user
 */
export const setCurrentUser = (user: AuthUser | null): void => {
  if (typeof window === 'undefined') return;
  if (user) {
    localStorage.setItem(CURRENT_USER_KEY, JSON.stringify(user));
    // Also sync mrs_dung_user_role for compatibility
    localStorage.setItem('mrs_dung_user_role', user.role);
  } else {
    localStorage.removeItem(CURRENT_USER_KEY);
  }
};

/**
 * Logout
 */
export const logout = (): void => {
  setCurrentUser(null);
};

/**
 * Check if logged in
 */
export const isAuthenticated = (): boolean => {
  return !!getCurrentUser();
};

/**
 * Normalize phone number for consistent matching (09xxx, +84xxx, 84xxx, strips spaces, dots, dashes)
 */
export const normalizePhoneNumber = (phone: string): string => {
  if (!phone) return '';
  let clean = phone.replace(/[\s\.\-\(\)]/g, '').trim();
  if (clean.startsWith('+84')) {
    clean = '0' + clean.slice(3);
  } else if (clean.startsWith('84') && clean.length >= 10) {
    clean = '0' + clean.slice(2);
  }
  return clean;
};

/**
 * Đăng nhập học sinh với Lớp, Họ và tên và Mật khẩu (mặc định: 123)
 */
export const loginStudentWithPassword = (
  classNameInput: string,
  studentNameInput: string,
  passwordInput: string
): { success: boolean; user?: AuthUser; error?: string } => {
  const cleanClass = (classNameInput || '').trim();
  const cleanName = (studentNameInput || '').trim();
  const cleanPass = (passwordInput || '').trim();

  if (!cleanClass) {
    return { success: false, error: 'Em ơi, vui lòng chọn lớp học của mình nhé!' };
  }
  if (!cleanName) {
    return { success: false, error: 'Em ơi, vui lòng chọn hoặc nhập họ và tên của mình nhé!' };
  }
  if (!cleanPass) {
    return { success: false, error: 'Em ơi, vui lòng nhập mật khẩu nhé! (Mật khẩu mặc định là 123)' };
  }

  const norm = (s?: string) => (s || '').toLowerCase().replace(/^(lớp|lop)\s*/i, '').trim();
  const cleanNFC = (s?: string) => (s || '').trim().toLowerCase().normalize('NFC');

  const classes = getClasses();
  const targetClassNorm = norm(cleanClass);
  const matchedClass = classes.find(c => 
    c.id === cleanClass || 
    norm(c.name) === targetClassNorm ||
    cleanNFC(c.name) === cleanNFC(cleanClass)
  );

  const targetClassId = matchedClass ? matchedClass.id : cleanClass;
  const targetClassName = matchedClass ? matchedClass.name : cleanClass;

  const students = getStudents(targetClassId);
  const targetNameNFC = cleanNFC(cleanName);

  const matchedStudent = students.find(s =>
    cleanNFC(s.name) === targetNameNFC ||
    (s.englishName && cleanNFC(s.englishName) === targetNameNFC) ||
    (s.id && s.id.toLowerCase() === targetNameNFC) ||
    (s.username && cleanNFC(s.username) === targetNameNFC)
  );

  if (!matchedStudent) {
    return {
      success: false,
      error: `Không tìm thấy học sinh "${cleanName}" trong lớp "${targetClassName}". Em kiểm tra lại họ tên hoặc bấm "Tạo tài khoản mới" nhé!`
    };
  }

  const expectedPass = (matchedStudent.password || '123').trim();
  if (cleanPass !== expectedPass) {
    return {
      success: false,
      error: 'Mật khẩu không chính xác! (Mật khẩu mặc định là 123. Nếu em đã đổi mật khẩu mà quên, hãy liên hệ Thầy Cô để được cấp lại nhé).'
    };
  }

  const authUser: AuthUser = {
    id: matchedStudent.id,
    username: matchedStudent.username || matchedStudent.name,
    role: 'student',
    name: matchedStudent.name,
    avatar: matchedStudent.avatar || '🎒',
    classId: targetClassId,
    className: targetClassName,
    phone: matchedStudent.phone
  };

  setCurrentUser(authUser);
  return { success: true, user: authUser };
};

/**
 * Tạo tài khoản học sinh mới: nhập Họ và tên, Lớp, mật khẩu mặc định là 123
 */
export const createStudentAccount = (
  studentName: string,
  classIdOrName: string,
  englishName = '',
  phone = ''
): { success: boolean; student?: Student; error?: string } => {
  const cleanName = (studentName || '').trim();
  const cleanClass = (classIdOrName || '').trim();

  if (!cleanClass) {
    return { success: false, error: 'Vui lòng chọn lớp học của em!' };
  }
  if (!cleanName) {
    return { success: false, error: 'Vui lòng nhập họ và tên của em!' };
  }
  if (cleanName.length < 2) {
    return { success: false, error: 'Họ và tên học sinh phải có ít nhất 2 ký tự!' };
  }

  const norm = (s?: string) => (s || '').toLowerCase().replace(/^(lớp|lop)\s*/i, '').trim();
  const cleanNFC = (s?: string) => (s || '').trim().toLowerCase().normalize('NFC');

  const classes = getClasses();
  const matchedClass = classes.find(c => c.id === cleanClass || norm(c.name) === norm(cleanClass));

  if (!matchedClass) {
    return { success: false, error: `Không tìm thấy lớp học "${cleanClass}" trên hệ thống!` };
  }

  // Kiểm tra xem đã có học sinh này trong lớp chưa
  const existingStudents = getStudents(matchedClass.id);
  const targetNameNFC = cleanNFC(cleanName);
  const duplicate = existingStudents.find(s => cleanNFC(s.name) === targetNameNFC);

  if (duplicate) {
    return {
      success: false,
      error: `Học sinh "${cleanName}" đã có sẵn trong danh sách ${matchedClass.name} rồi! Em có thể đăng nhập ngay bằng mật khẩu (mặc định là 123).`
    };
  }

  // Thêm học sinh vào lớp với mật khẩu mặc định 123
  const newStudent = addStudent(
    cleanName,
    matchedClass.id,
    matchedClass.name,
    englishName,
    phone,
    'Tài khoản học sinh tự tạo',
    '123'
  );

  return { success: true, student: newStudent };
};

/**
 * Học sinh tự đổi mật khẩu: Chỉ cần nhập mật khẩu cũ và đổi mật khẩu mới
 */
export const changeStudentPasswordDirectly = (
  classIdOrName: string,
  studentNameOrId: string,
  oldPasswordInput: string,
  newPasswordInput: string
): { success: boolean; message?: string; error?: string } => {
  const cleanClass = (classIdOrName || '').trim();
  const cleanNameOrId = (studentNameOrId || '').trim();
  const cleanOldPass = (oldPasswordInput || '').trim();
  const cleanNewPass = (newPasswordInput || '').trim();

  if (!cleanClass) {
    return { success: false, error: 'Vui lòng chọn lớp học của em!' };
  }
  if (!cleanNameOrId) {
    return { success: false, error: 'Vui lòng chọn hoặc nhập họ và tên của em!' };
  }
  if (!cleanOldPass) {
    return { success: false, error: 'Vui lòng nhập mật khẩu cũ! (Mặc định ban đầu là 123)' };
  }
  if (!cleanNewPass) {
    return { success: false, error: 'Vui lòng nhập mật khẩu mới!' };
  }
  if (cleanNewPass.length < 1) {
    return { success: false, error: 'Mật khẩu mới không được để trống!' };
  }
  if (cleanNewPass === cleanOldPass) {
    return { success: false, error: 'Mật khẩu mới phải khác với mật khẩu cũ!' };
  }

  const norm = (s?: string) => (s || '').toLowerCase().replace(/^(lớp|lop)\s*/i, '').trim();
  const cleanNFC = (s?: string) => (s || '').trim().toLowerCase().normalize('NFC');

  const classes = getClasses();
  const matchedClass = classes.find(c => c.id === cleanClass || norm(c.name) === norm(cleanClass));
  const targetClassId = matchedClass ? matchedClass.id : cleanClass;

  const students = getStudents(targetClassId);
  const targetNameNFC = cleanNFC(cleanNameOrId);

  const matchedStudent = students.find(s =>
    s.id === cleanNameOrId ||
    cleanNFC(s.name) === targetNameNFC ||
    (s.englishName && cleanNFC(s.englishName) === targetNameNFC) ||
    (s.username && cleanNFC(s.username) === targetNameNFC)
  );

  if (!matchedStudent) {
    return {
      success: false,
      error: `Không tìm thấy học sinh "${cleanNameOrId}" trong lớp "${matchedClass?.name || cleanClass}"! Vui lòng kiểm tra lại.`
    };
  }

  const currentPassword = (matchedStudent.password || '123').trim();
  if (cleanOldPass !== currentPassword) {
    return {
      success: false,
      error: 'Mật khẩu cũ không chính xác! (Mật khẩu ban đầu là 123. Nếu em đã quên mật khẩu cũ, hãy liên hệ Thầy Cô để cấp lại mật khẩu nhé).'
    };
  }

  // Cập nhật mật khẩu mới cho học sinh
  updateStudent(matchedStudent.id, {
    password: cleanNewPass
  });

  return {
    success: true,
    message: `🎉 Chúc mừng ${matchedStudent.name}! Em đã đổi mật khẩu thành công. Mật khẩu mới là "${cleanNewPass}". Em hãy ghi nhớ để đăng nhập lần sau nhé!`
  };
};

/**
 * Login student with Class Name and Student Name (Supports optional password)
 */
export const loginStudentWithClassAndPass = (
  classNameInput: string,
  studentNameInput: string,
  passwordInput?: string
): { success: boolean; user?: AuthUser; error?: string } => {
  if (passwordInput !== undefined && passwordInput.trim().length > 0) {
    return loginStudentWithPassword(classNameInput, studentNameInput, passwordInput);
  }
  return loginStudentSimple(studentNameInput, classNameInput);
};

/**
 * Verify student's registered phone number and update/reset password
 */
export const verifyStudentPhoneAndResetPassword = (
  classNameInput: string,
  studentNameInput: string,
  phoneInput: string,
  newPasswordInput: string
): { success: boolean; message?: string; error?: string } => {
  const cleanClass = (classNameInput || '').trim();
  const cleanName = (studentNameInput || '').trim();
  const cleanPhone = normalizePhoneNumber(phoneInput);
  const cleanNewPass = (newPasswordInput || '').trim();

  if (!cleanClass) {
    return { success: false, error: 'Vui lòng chọn lớp học của em!' };
  }
  if (!cleanName) {
    return { success: false, error: 'Vui lòng nhập hoặc chọn họ và tên của em!' };
  }
  if (!cleanPhone) {
    return { success: false, error: 'Vui lòng nhập số điện thoại phụ huynh để xác minh!' };
  }
  if (cleanPhone.length < 9 || cleanPhone.length > 11) {
    return { success: false, error: 'Số điện thoại không đúng định dạng (cần 10 số, ví dụ: 0912345678)!' };
  }
  if (!cleanNewPass) {
    return { success: false, error: 'Vui lòng nhập mật khẩu mới!' };
  }
  if (cleanNewPass.length < 1) {
    return { success: false, error: 'Mật khẩu mới không được để trống!' };
  }

  const norm = (s?: string) => (s || '').toLowerCase().replace(/^(lớp|lop)\s*/i, '').trim();
  const cleanNFC = (s?: string) => (s || '').trim().toLowerCase().normalize('NFC');

  const classes = getClasses();
  const matchedClass = classes.find(c => c.id === cleanClass || norm(c.name) === norm(cleanClass));
  const targetClassId = matchedClass ? matchedClass.id : cleanClass;

  const students = getStudents(targetClassId);
  const targetNameNFC = cleanNFC(cleanName);

  const matchedStudent = students.find(s =>
    cleanNFC(s.name) === targetNameNFC ||
    (s.englishName && cleanNFC(s.englishName) === targetNameNFC) ||
    (s.id && s.id.toLowerCase() === targetNameNFC)
  );

  if (!matchedStudent) {
    return {
      success: false,
      error: `Không tìm thấy học sinh "${cleanName}" trong lớp "${matchedClass?.name || cleanClass}"! Vui lòng kiểm tra lại họ tên.`
    };
  }

  const studentCurrentPhone = normalizePhoneNumber(matchedStudent.phone || '');

  // Case 1: Student already has a phone number registered with teacher
  if (studentCurrentPhone) {
    if (cleanPhone !== studentCurrentPhone) {
      return {
        success: false,
        error: `Số điện thoại "${phoneInput}" không khớp với số điện thoại phụ huynh đã đăng ký cho bạn ${matchedStudent.name}! Vui lòng kiểm tra lại hoặc liên hệ Thầy Cô để kiểm tra SĐT trên hệ thống.`
      };
    }
  }

  // Case 2: Match confirmed (or student has no phone on record yet, so we bind this official phone)
  updateStudent(matchedStudent.id, {
    password: cleanNewPass,
    phone: cleanPhone
  });

  return {
    success: true,
    message: `🎉 Chúc mừng ${matchedStudent.name}! Mật khẩu mới đã được cập nhật thành công. Em có thể dùng mật khẩu mới này để đăng nhập ngay bây giờ!`
  };
};

