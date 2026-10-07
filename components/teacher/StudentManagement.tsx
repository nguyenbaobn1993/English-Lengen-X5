import React, { useState, useEffect, useRef } from 'react';
import * as XLSX from 'xlsx';
import { ClassRoom, Student, DeletedStudentRecord, Assignment, Submission } from '../../types';
import {
  getClasses,
  getStudents,
  getDeletedStudents,
  restoreDeletedStudent,
  restoreDeletedStudentsBulk,
  addClass,
  updateClass,
  deleteClass,
  addStudent,
  batchAddStudentsWithDetails,
  updateStudent,
  deleteStudent,
  subscribeToSync,
  getAssignments,
  getSubmissions,
  isStudentMatch,
  parseScheduleFromText,
  resetStudentPassword,
  batchResetClassPasswords, classGradeText } from '../../services/assignmentService';
import { guardDestructiveAction } from '../../services/teacherAuth';

export const StudentManagement: React.FC = () => {
  const [classes, setClasses] = useState<ClassRoom[]>([]);
  const [selectedClassId, setSelectedClassIdState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('mrs_dung_teacher_selected_class_id') || '';
    }
    return '';
  });

  const setSelectedClassId = (id: string) => {
    setSelectedClassIdState(id);
    if (typeof window !== 'undefined') {
      localStorage.setItem('mrs_dung_teacher_selected_class_id', id);
    }
  };

  const [students, setStudents] = useState<Student[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Class modals state
  const [showAddClass, setShowAddClass] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [newClassGrade, setNewClassGrade] = useState(6);
  const [newClassGradeCustom, setNewClassGradeCustom] = useState(false);
  const [newClassGradeLabel, setNewClassGradeLabel] = useState('');
  const [editGradeCustom, setEditGradeCustom] = useState(false);
  const [newClassDesc, setNewClassDesc] = useState('');

  const [editingClass, setEditingClass] = useState<ClassRoom | null>(null);
  // Mở hộp sửa lớp: lớp có khối tự nhập thì hiện ô tự nhập
  useEffect(() => { setEditGradeCustom(!!(editingClass && editingClass.gradeLabel && editingClass.gradeLabel.trim())); }, [editingClass?.id]);

  // Student single add state
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentEnglishName, setNewStudentEnglishName] = useState('');
  const [newStudentPhone, setNewStudentPhone] = useState('');
  const [newStudentNote, setNewStudentNote] = useState('');
  const [newStudentPassword, setNewStudentPassword] = useState('123');

  // Student batch paste state
  const [showBatchModal, setShowBatchModal] = useState(false);
  const [batchNamesText, setBatchNamesText] = useState('');

  // Excel import state
  const [showExcelModal, setShowExcelModal] = useState(false);
  const [excelPreviewList, setExcelPreviewList] = useState<Array<{ name: string; englishName: string; phone: string; notes: string; password?: string }>>([]);
  const [excelFileName, setExcelFileName] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Edit student state
  const [editingStudent, setEditingStudent] = useState<Student | null>(null);

  // Quick Issue / Reset Password Modal state
  const [passwordModalStudent, setPasswordModalStudent] = useState<Student | null>(null);
  const [quickNewPassword, setQuickNewPassword] = useState('123');

  // Permanent delete confirmation state (Học sinh nghỉ học / chuyển trường)
  const [studentToDelete, setStudentToDelete] = useState<Student | null>(null);
  const [deleteReason, setDeleteReason] = useState('Học sinh nghỉ học');

  // Deleted / Withdrawn students archive modal
  const [showDeletedModal, setShowDeletedModal] = useState(false);
  const [deletedStudents, setDeletedStudents] = useState<DeletedStudentRecord[]>([]);

  // Toast message state
  const [toastMessage, setToastMessage] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(prev => prev === msg ? null : prev);
    }, 4500);
  };


  // Homework completion tracking states
  const [assignments, setAssignments] = useState<Assignment[]>([]);
  const [submissions, setSubmissions] = useState<Submission[]>([]);
  const [selectedAssignmentId, setSelectedAssignmentIdState] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('mrs_dung_teacher_selected_assignment_id') || 'LATEST';
    }
    return 'LATEST';
  });

  const setSelectedAssignmentId = (id: string) => {
    setSelectedAssignmentIdState(id);
    if (typeof window !== 'undefined') {
      localStorage.setItem('mrs_dung_teacher_selected_assignment_id', id);
    }
  };

  const [homeworkStatusFilter, setHomeworkStatusFilterState] = useState<'ALL' | 'NOT_DONE' | 'DONE'>(() => {
    if (typeof window !== 'undefined') {
      const saved = localStorage.getItem('mrs_dung_teacher_hw_status_filter');
      if (saved === 'ALL' || saved === 'NOT_DONE' || saved === 'DONE') return saved;
    }
    return 'ALL';
  });

  const setHomeworkStatusFilter = (val: 'ALL' | 'NOT_DONE' | 'DONE') => {
    setHomeworkStatusFilterState(val);
    if (typeof window !== 'undefined') {
      localStorage.setItem('mrs_dung_teacher_hw_status_filter', val);
    }
  };
  const [copiedZaloMsg, setCopiedZaloMsg] = useState(false);

  const refresh = () => {
    const cls = getClasses();
    setClasses(cls);
    const savedClassId = typeof window !== 'undefined' ? (localStorage.getItem('mrs_dung_teacher_selected_class_id') || '') : '';
    let activeClassId = selectedClassId;
    if (!activeClassId || !cls.some(c => c.id === activeClassId)) {
      if (savedClassId && cls.some(c => c.id === savedClassId)) {
        activeClassId = savedClassId;
      } else {
        activeClassId = cls.length > 0 ? cls[0].id : '';
      }
    }
    if (activeClassId !== selectedClassId) {
      setSelectedClassId(activeClassId);
    }
    if (activeClassId) {
      setStudents(getStudents(activeClassId));
    } else {
      setStudents([]);
    }
    setAssignments(getAssignments());
    setSubmissions(getSubmissions());
    setDeletedStudents(getDeletedStudents());
  };

  useEffect(() => {
    refresh();
    const unsubscribe = subscribeToSync(() => {
      refresh();
    });
    return () => unsubscribe();
  }, [selectedClassId]);

  const currentClass = classes.find(c => c.id === selectedClassId) || classes[0];

  // 1. Tạo lớp mới
  const handleCreateClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim()) return;
    const parsed = parseScheduleFromText(newClassDesc);
    const created = addClass(newClassName, newClassGradeCustom ? 0 : newClassGrade, newClassDesc, parsed?.slots, newClassGradeCustom ? newClassGradeLabel : undefined);
    setNewClassName('');
    setNewClassGradeCustom(false);
    setNewClassGradeLabel('');
    setNewClassDesc('');
    setShowAddClass(false);
    setSelectedClassId(created.id);
    refresh();
    showToast(`✓ Đã tạo lớp "${created.name}" thành công!`);
  };

  // 2. Sửa lớp
  const handleUpdateClass = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClass || !editingClass.name.trim()) return;
    const desc = (editingClass.description || '').trim();
    const parsed = parseScheduleFromText(desc);
    const updatedName = editingClass.name.trim();
    updateClass(
      editingClass.id,
      {
        name: updatedName,
        grade: editingClass.grade,
        // Firebase không lưu undefined → dùng chuỗi rỗng để xoá khối tự nhập khi chuyển về Khối 1–12
        gradeLabel: editGradeCustom ? (editingClass.gradeLabel || '').trim() : '',
        description: desc
      },
      parsed?.slots
    );
    setEditingClass(null);
    refresh();
    showToast(`✓ Đã lưu thay đổi lớp "${updatedName}" thành công! Dữ liệu của cô luôn được ưu tiên lưu trữ cao nhất.`);
  };

  // 3. Xóa lớp
  const handleDeleteClass = async (id: string, name: string) => {
    if (confirm(`Cô có chắc chắn muốn xóa lớp "${name}" không? Toàn bộ danh sách học sinh thuộc lớp này cũng sẽ được dọn dẹp và lưu trữ vĩnh viễn.`)) {
      if (!(await guardDestructiveAction('class', name))) return;
      deleteClass(id);
      const remaining = classes.filter(c => c.id !== id);
      setSelectedClassId(remaining.length > 0 ? remaining[0].id : '');
      refresh();
      showToast(`🗑️ Đã xóa lớp "${name}" và toàn bộ học sinh liên quan thành công! Dữ liệu của cô luôn được ưu tiên lưu trữ cao nhất.`);
    }
  };

  // 5. Thêm 1 học sinh
  const handleAddSingleStudent = (e: React.FormEvent) => {
    e.preventDefault();
    if (!newStudentName.trim() || !currentClass) return;
    const stdName = newStudentName.trim();
    addStudent(
      stdName,
      currentClass.id,
      currentClass.name,
      newStudentEnglishName,
      newStudentPhone,
      newStudentNote,
      newStudentPassword
    );
    setNewStudentName('');
    setNewStudentEnglishName('');
    setNewStudentPhone('');
    setNewStudentNote('');
    setNewStudentPassword('123');
    setShowAddStudent(false);
    refresh();
    showToast(`✓ Đã thêm học sinh "${stdName}" vào lớp ${currentClass.name} thành công!`);
  };

  // 6. Dán danh sách hàng loạt (Hỗ trợ Tab, Phẩy, Gạch ngang)
  const handleBatchAdd = (e: React.FormEvent) => {
    e.preventDefault();
    if (!batchNamesText.trim() || !currentClass) return;

    const parsedItems: Array<{ name: string; englishName: string; phone: string; notes: string }> = [];

    const lines = batchNamesText.split('\n');
    lines.forEach(line => {
      let clean = line.trim().replace(/^[\d\.\-\)\s]+/, ''); // remove leading numbers
      if (!clean) return;

      let name = '';
      let englishName = '';
      let phone = '';

      if (clean.includes('\t')) {
        // Tab separated (direct copy from Excel)
        const parts = clean.split('\t').map(p => p.trim());
        name = parts[0] || '';
        englishName = parts[1] || '';
        phone = parts[2] || '';
      } else if (clean.includes(',')) {
        // Comma separated
        const parts = clean.split(',').map(p => p.trim());
        name = parts[0] || '';
        englishName = parts[1] || '';
        phone = parts[2] || '';
      } else if (clean.includes(' - ')) {
        // Hyphen separated
        const parts = clean.split(' - ').map(p => p.trim());
        name = parts[0] || '';
        englishName = parts[1] || '';
      } else {
        name = clean;
      }

      if (name) {
        parsedItems.push({ name, englishName, phone, notes: '' });
      }
    });

    if (parsedItems.length === 0) return;

    batchAddStudentsWithDetails(parsedItems, currentClass.id, currentClass.name);
    setBatchNamesText('');
    setShowBatchModal(false);
    refresh();
    showToast(`✓ Đã thêm ${parsedItems.length} học sinh vào lớp ${currentClass.name} thành công!`);
  };

  // 7. Tải file Excel mẫu
  const handleDownloadExcelTemplate = () => {
    const templateData = [
      { "Họ và tên": "Hoàng Sơn Tùng", "Tên tiếng Anh (E.Name)": "Arty", "Mật khẩu đăng nhập": "123", "Số điện thoại": "0987654321", "Ghi chú": "Học sinh chăm chỉ" },
      { "Họ và tên": "Nguyễn Minh Duy", "Tên tiếng Anh (E.Name)": "Batman", "Mật khẩu đăng nhập": "123", "Số điện thoại": "0912345678", "Ghi chú": "Phát âm tốt" },
      { "Họ và tên": "Trần Gia Phú", "Tên tiếng Anh (E.Name)": "Kelvin", "Mật khẩu đăng nhập": "123", "Số điện thoại": "0909888999", "Ghi chú": "Ngữ pháp vững" },
      { "Họ và tên": "Lê Tú Uyên", "Tên tiếng Anh (E.Name)": "Cherry", "Mật khẩu đăng nhập": "123", "Số điện thoại": "0933222111", "Ghi chú": "Từ vựng phong phú" },
      { "Họ và tên": "Nguyễn Ngọc Lam Phương", "Tên tiếng Anh (E.Name)": "Elsa", "Mật khẩu đăng nhập": "123", "Số điện thoại": "0977665544", "Ghi chú": "Học sinh giỏi" }
    ];

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Danh sách học sinh");
    XLSX.writeFile(wb, "Danh_sach_hoc_sinh_mau.xlsx");
  };

  // 8. Đọc file Excel tải lên
  const handleExcelFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setExcelFileName(file.name);

    const reader = new FileReader();
    reader.onload = (evt) => {
      try {
        const buffer = evt.target?.result;
        const wb = XLSX.read(buffer, { type: 'array' });
        const wsName = wb.SheetNames[0];
        const ws = wb.Sheets[wsName];
        const rawJson: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

        const mappedList: Array<{ name: string; englishName: string; phone: string; notes: string; password?: string }> = [];

        rawJson.forEach((row: any) => {
          // Normalize column keys
          const keys = Object.keys(row);
          let name = '';
          let englishName = '';
          let phone = '';
          let notes = '';
          let password = '123';

          keys.forEach(k => {
            const cleanKey = k.trim().toLowerCase();
            const val = String(row[k]).trim();
            if (cleanKey.includes('họ') || cleanKey.includes('tên') && !cleanKey.includes('anh') || cleanKey === 'name') {
              if (!name) name = val;
            }
            if (cleanKey.includes('e.name') || cleanKey.includes('ename') || cleanKey.includes('tiếng anh') || cleanKey.includes('english') || cleanKey.includes('nick')) {
              englishName = val;
            }
            if (cleanKey.includes('mật khẩu') || cleanKey.includes('mat khau') || cleanKey.includes('pass') || cleanKey.includes('mk')) {
              password = val;
            }
            if (cleanKey.includes('điện thoại') || cleanKey.includes('sđt') || cleanKey.includes('phone') || cleanKey.includes('tel')) {
              phone = val;
            }
            if (cleanKey.includes('ghi chú') || cleanKey.includes('note') || cleanKey.includes('nhận xét')) {
              notes = val;
            }
          });

          if (name) {
            mappedList.push({ name, englishName, phone, notes, password: password || '123' });
          }
        });

        setExcelPreviewList(mappedList);
      } catch (err) {
        alert('Không thể đọc file Excel này. Vui lòng kiểm tra lại định dạng file (.xlsx, .xls, .csv).');
      }
    };
    reader.readAsArrayBuffer(file);
  };

  // 9. Xác nhận nạp danh sách từ Excel
  const handleConfirmExcelImport = () => {
    if (excelPreviewList.length === 0 || !currentClass) return;
    const count = excelPreviewList.length;
    batchAddStudentsWithDetails(excelPreviewList, currentClass.id, currentClass.name);
    setShowExcelModal(false);
    setExcelPreviewList([]);
    setExcelFileName('');
    if (fileInputRef.current) fileInputRef.current.value = '';
    refresh();
    showToast(`✓ Đã thêm thành công ${count} học sinh vào ${currentClass.name}!`);
  };

  // 10. Xuất Danh Sách Tài Khoản Học Sinh (Excel)
  const handleExportStudentAccounts = () => {
    if (!currentClass || students.length === 0) {
      alert('Chưa có học sinh nào trong lớp để xuất danh sách tài khoản!');
      return;
    }
    const templateData = students.map((s, idx) => ({
      "STT": idx + 1,
      "Lớp": s.className,
      "Họ và tên": s.name,
      "Tên tiếng Anh (E.NAME)": s.englishName || '—',
      "Mật khẩu đăng nhập": s.password || '123',
      "Số điện thoại phụ huynh": s.phone || '—',
      "Ghi chú của cô": s.notes || '—'
    }));

    const ws = XLSX.utils.json_to_sheet(templateData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Tài khoản học sinh");
    XLSX.writeFile(wb, `Danh_sach_tai_khoan_${currentClass.name.replace(/\s+/g, '_')}.xlsx`);
  };

  // 10.1 Đặt lại tất cả mật khẩu trong lớp về 123
  const handleBatchResetPasswords = () => {
    if (!currentClass || students.length === 0) {
      alert('Chưa có học sinh nào trong lớp để đặt lại mật khẩu!');
      return;
    }
    const confirmed = confirm(
      `🔑 XÁC NHẬN ĐẶT LẠI MẬT KHẨU CẢ LỚP:\n\n` +
      `Cô có chắc chắn muốn đặt lại mật khẩu của toàn bộ ${students.length} học sinh trong lớp "${currentClass.name}" về mật khẩu mặc định "123" không?\n\n` +
      `Sau khi đặt lại, các em có thể đăng nhập bằng mật khẩu 123 và tự đổi mật khẩu mới.`
    );
    if (!confirmed) return;
    const count = batchResetClassPasswords(currentClass.id, '123');
    refresh();
    showToast(`✓ Đã đặt lại mật khẩu cho toàn bộ ${count} học sinh lớp ${currentClass.name} về "123" thành công!`);
  };

  // 11. Lưu chỉnh sửa học sinh (Ưu tiên tuyệt đối dữ liệu cô sửa)
  const handleSaveEditStudent = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!editingStudent || !editingStudent.name.trim()) {
      alert('Vui lòng nhập họ và tên của học sinh!');
      return;
    }

    const savedName = editingStudent.name.trim();
    updateStudent(editingStudent.id, {
      name: savedName,
      englishName: editingStudent.englishName?.trim() || '',
      phone: editingStudent.phone?.trim() || '',
      classId: editingStudent.classId,
      className: editingStudent.className,
      notes: editingStudent.notes?.trim() || '',
      password: editingStudent.password?.trim() || '123'
    });

    setEditingStudent(null);
    refresh();
    showToast(`✓ Đã lưu thay đổi thông tin học sinh "${savedName}" thành công! Dữ liệu của cô luôn được ưu tiên lưu trữ cao nhất.`);
  };

  // 12. Xác nhận xóa vĩnh viễn học sinh (trong trường hợp học sinh nghỉ học)
  const handleConfirmPermanentDelete = async () => {
    if (!studentToDelete) return;
    const stdName = studentToDelete.name;
    const stdId = studentToDelete.id;
    if (!(await guardDestructiveAction('student', stdName))) return;

    deleteStudent(stdId, deleteReason || 'Học sinh nghỉ học / chuyển trường');
    setStudentToDelete(null);
    refresh();
    showToast(`🗑️ Đã xóa vĩnh viễn học sinh "${stdName}". Hệ thống sẽ loại bỏ hoàn toàn và KHÔNG tự động cập nhật lại nữa.`);
  };

  // 13. Khôi phục học sinh đã nghỉ học
  const handleRestoreStudent = (id: string, name: string) => {
    restoreDeletedStudent(id);
    refresh();
    showToast(`🎉 Đã khôi phục thành công học sinh "${name}" trở lại lớp!`);
  };

  // 13b. Khôi phục hàng loạt về đúng lớp trước khi nghỉ
  const [deletedClassFilter, setDeletedClassFilter] = useState<string>('ALL');
  const deletedClassOptions = Array.from(new Set(deletedStudents.map(d => d.className || '(Không rõ lớp)'))).sort((a, b) =>
    a.localeCompare(b, 'vi', { numeric: true })
  );
  const visibleDeletedStudents = deletedClassFilter === 'ALL'
    ? deletedStudents
    : deletedStudents.filter(d => (d.className || '(Không rõ lớp)') === deletedClassFilter);

  const handleRestoreAllVisible = () => {
    const list = visibleDeletedStudents;
    if (list.length === 0) return;
    const scope = deletedClassFilter === 'ALL' ? 'TẤT CẢ các lớp' : `lớp ${deletedClassFilter}`;
    const ok = confirm(
      `🔄 KHÔI PHỤC HÀNG LOẠT\n\n` +
      `Khôi phục ${list.length} học sinh (${scope}) về đúng lớp trước khi nghỉ?\n\n` +
      `• Lớp nào đã bị xóa sẽ được khôi phục lại.\n` +
      `• Em nào đang có trong lớp rồi sẽ được bỏ qua (không tạo trùng).\n` +
      `• Mật khẩu cũ của các em được giữ nguyên (nếu không có thì là 123).`
    );
    if (!ok) return;
    const res = restoreDeletedStudentsBulk(list.map(d => d.id));
    setDeletedClassFilter('ALL');
    refresh();
    const parts = [`🎉 Đã khôi phục ${res.restored.length} học sinh về lớp cũ`];
    if (res.restoredClasses.length > 0) parts.push(`khôi phục lại ${res.restoredClasses.length} lớp (${res.restoredClasses.map(c => c.name).join(', ')})`);
    if (res.skippedAlreadyActive.length > 0) parts.push(`bỏ qua ${res.skippedAlreadyActive.length} em đã có trong lớp`);
    showToast(parts.join(', ') + '.');
  };

  // Class assignments for selected class
  const classAssignments = assignments.filter(a => {
    if (!currentClass) return false;
    if (a.targetClassId === 'ALL' || a.targetClassName === 'Tất cả các lớp') return true;
    if (a.targetClassId === currentClass.id) return true;
    if (a.targetClassName === currentClass.name) return true;
    if (Array.isArray(a.targetClassIds) && (a.targetClassIds.includes(currentClass.id) || a.targetClassIds.includes('ALL'))) return true;
    if (Array.isArray(a.targetClassNames) && a.targetClassNames.includes(currentClass.name)) return true;
    const normA = (a.targetClassName || '').toLowerCase().trim();
    const normC = currentClass.name.toLowerCase().trim();
    if (normA && normC && normA === normC) return true;
    return false;
  });

  // Active assignment being inspected
  const activeAssignment = (selectedAssignmentId !== 'LATEST' && classAssignments.some(a => a.id === selectedAssignmentId))
    ? classAssignments.find(a => a.id === selectedAssignmentId)
    : classAssignments[0];

  // Check if a student has submitted the active assignment (returns highest score attempt)
  const getStudentSubmission = (student: Student): Submission | undefined => {
    if (!activeAssignment) return undefined;
    const stdSubs = submissions.filter(s =>
      s.assignmentId === activeAssignment.id &&
      isStudentMatch(student, s)
    );
    if (stdSubs.length === 0) return undefined;
    return stdSubs.reduce((prev, curr) => (curr.score > prev.score ? curr : prev), stdSubs[0]);
  };

  const notDoneStudents = students.filter(s => !getStudentSubmission(s));
  const doneStudents = students.filter(s => !!getStudentSubmission(s));

  // Filtered students by search AND homework status
  const filteredStudents = students.filter(s => {
    const matchQuery =
      s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (s.englishName && s.englishName.toLowerCase().includes(searchQuery.toLowerCase())) ||
      (s.rollNumber && s.rollNumber.includes(searchQuery)) ||
      (s.phone && s.phone.includes(searchQuery));
    if (!matchQuery) return false;

    if (homeworkStatusFilter === 'NOT_DONE') {
      return !getStudentSubmission(s);
    }
    if (homeworkStatusFilter === 'DONE') {
      return !!getStudentSubmission(s);
    }
    return true;
  });

  // Action: Copy list of students who haven't done homework to send to Zalo
  const handleCopyNotDoneZaloList = () => {
    if (!activeAssignment) {
      alert('Chưa có bài tập nào được giao cho lớp này.');
      return;
    }
    if (notDoneStudents.length === 0) {
      alert('Tuyệt vời! 100% học sinh trong lớp đều đã nộp bài tập này.');
      return;
    }

    const title = activeAssignment.title || activeAssignment.topic;
    let text = `📢 THÔNG BÁO NHẮC NHỞ HOÀN THÀNH BÀI TẬP\n`;
    text += `🏫 Lớp: ${currentClass?.name || ''}\n`;
    text += `📝 Bài tập: ${title}\n`;
    text += `⏰ Hạn nộp: ${activeAssignment.dueDate ? new Date(activeAssignment.dueDate).toLocaleString('vi-VN') : 'Sớm nhất có thể'}\n\n`;
    text += `Danh sách các bạn chưa hoàn thành bài tập (${notDoneStudents.length} bạn):\n`;
    notDoneStudents.forEach((std, idx) => {
      text += `${idx + 1}. ${std.name} ${std.englishName ? `(${std.englishName})` : ''}\n`;
    });
    text += `\nKính nhờ quý phụ huynh nhắc nhở các em tranh thủ vào làm bài và nộp bài để thầy cô chấm điểm nhé! Cô cảm ơn phụ huynh ạ! ❤️`;

    navigator.clipboard.writeText(text);
    setCopiedZaloMsg(true);
    setTimeout(() => setCopiedZaloMsg(false), 3000);
  };

  // Action: Copy single student reminder
  const handleCopyIndividualReminder = (student: Student) => {
    if (!activeAssignment) return;
    const title = activeAssignment.title || activeAssignment.topic;
    let text = `Dạ Legend X5 xin gửi lời chào đến phụ huynh em ${student.name}${student.englishName ? ` (${student.englishName})` : ''} ạ!\n`;
    text += `Hiện tại con chưa hoàn thành bài tập "${title}". Nhờ phụ huynh nhắc con mở app làm bài và nộp bài sớm giúp cô nhé! Cô cảm ơn phụ huynh nhiều ạ! ❤️`;
    navigator.clipboard.writeText(text);
    alert(`Đã copy tin nhắn nhắc nhở cho phụ huynh em ${student.name}!\nCô có thể dán vào tin nhắn Zalo gửi ngay cho phụ huynh.`);
  };

  return (
    <div className="space-y-6 animate-fade-in font-sans">
      {/* Header Quản Lý Lớp */}
      <div className="bg-white rounded-3xl p-6 shadow-xl border border-brand-100 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-2xl">👥</span>
            <h2 className="text-xl sm:text-2xl font-black text-brand-900">Quản Lý Danh Sách Học Sinh Theo Lớp</h2>
          </div>
          <p className="text-sm text-slate-500 font-medium">
            Quản lý sĩ số, họ tên, tên tiếng Anh (E.NAME), nhập xuất Excel và theo dõi thông tin học tập của từng lớp.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Danh sách học sinh đã nghỉ học / xóa vĩnh viễn */}
          {deletedStudents.length > 0 && (
            <button
              onClick={() => setShowDeletedModal(true)}
              className="px-3.5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs sm:text-sm rounded-xl border border-slate-300 transition-all flex items-center gap-1.5 shadow-sm"
              title="Xem danh sách học sinh đã xóa vĩnh viễn (nghỉ học / chuyển trường) và khôi phục nếu cần"
            >
              <span>🚫</span>
              <span>Đã Nghỉ Học ({deletedStudents.length})</span>
            </button>
          )}


          {/* Sửa lớp đang chọn */}
          {currentClass && (
            <button
              onClick={() => setEditingClass(currentClass)}
              className="px-3.5 py-2.5 bg-amber-50 hover:bg-amber-100 text-amber-800 font-bold text-xs sm:text-sm rounded-xl border border-amber-200 transition-all flex items-center gap-1.5 shadow-sm"
              title="Chỉnh sửa thông tin lớp này"
            >
              <span>✏️</span>
              <span>Sửa Lớp Này</span>
            </button>
          )}

          {/* Thêm lớp mới */}
          <button
            onClick={() => setShowAddClass(true)}
            className="px-4 py-2.5 bg-brand-500 hover:bg-brand-600 text-white font-bold text-xs sm:text-sm rounded-xl shadow-md transition-all flex items-center gap-1.5"
          >
            <span>➕</span> Thêm Lớp Mới
          </button>
        </div>
      </div>

      {/* Class Selector Bar */}
      {classes.length === 0 ? (
        <div className="bg-amber-50 border-2 border-dashed border-amber-300 rounded-3xl p-8 text-center space-y-3">
          <span className="text-4xl">🏫</span>
          <h3 className="text-lg font-black text-amber-900">Chưa có lớp học nào</h3>
          <p className="text-sm text-amber-700 max-w-md mx-auto">
            Hệ thống đã được làm sạch để sử dụng thông tin thật. Cô hãy bấm nút <b>"Thêm Lớp Mới"</b> phía trên để tạo lớp đầu tiên nhé!
          </p>
          <button
            onClick={() => setShowAddClass(true)}
            className="px-5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-xl shadow-md text-sm"
          >
            ➕ Tạo Lớp Học Đầu Tiên
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-2 overflow-x-auto pb-2 scrollbar-none">
          {classes.map(c => {
            const isSelected = c.id === selectedClassId;
            const count = getStudents(c.id).length;
            return (
              <div
                key={c.id}
                onClick={() => {
                  setSelectedClassId(c.id);
                  setSelectedAssignmentId('LATEST');
                }}
                className={`cursor-pointer shrink-0 px-4 py-3 rounded-2xl border-2 transition-all flex items-center gap-3 ${
                  isSelected
                    ? 'bg-brand-500 border-brand-600 text-white shadow-lg scale-102'
                    : 'bg-white border-slate-200 text-slate-700 hover:border-brand-300'
                }`}
              >
                <div>
                  <h4 className="font-black text-base leading-tight">{c.name}</h4>
                  <span className={`text-xs font-semibold ${isSelected ? 'text-brand-100' : 'text-slate-400'}`}>
                    {classGradeText(c)} • {count} học sinh
                  </span>
                  {c.description && (
                    <p className={`text-[11px] font-medium truncate max-w-[200px] mt-0.5 ${isSelected ? 'text-white/90 font-bold' : 'text-teal-700'}`}>
                      🗓️ {c.description}
                    </p>
                  )}
                </div>
                {classes.length > 1 && (
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDeleteClass(c.id, c.name);
                    }}
                    title="Xóa lớp này"
                    className={`ml-1 w-6 h-6 rounded-lg flex items-center justify-center text-xs font-bold transition-all ${
                      isSelected ? 'hover:bg-white/20 text-white' : 'hover:bg-rose-100 text-slate-400 hover:text-rose-600'
                    }`}
                  >
                    ✕
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Student List Section for Selected Class */}
      {currentClass && (
        <div className="bg-white rounded-3xl p-6 shadow-xl border border-brand-100 space-y-4">
          {/* Action Bar */}
          <div className="flex flex-col lg:flex-row items-stretch lg:items-center justify-between gap-3 pb-3 border-b border-slate-100">
            <div className="relative flex-1 max-w-md">
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={`Tìm tên hoặc tên tiếng Anh trong ${currentClass.name}...`}
                className="w-full pl-9 pr-4 py-2.5 rounded-xl border border-slate-200 text-sm focus:border-brand-500 outline-none"
              />
              <span className="absolute left-3 top-2.5 text-slate-400 text-sm">🔍</span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <button
                onClick={() => setShowAddStudent(true)}
                className="px-3.5 py-2.5 bg-brand-500 hover:bg-brand-600 text-white rounded-xl font-bold text-xs sm:text-sm shadow-md transition-all flex items-center gap-1.5"
              >
                <span>➕</span> Thêm 1 Học Sinh
              </button>

              <button
                onClick={() => setShowExcelModal(true)}
                className="px-3.5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl font-bold text-xs sm:text-sm shadow-md transition-all flex items-center gap-1.5"
              >
                <span>📥</span> Nhập từ Excel
              </button>

              <button
                onClick={() => setShowBatchModal(true)}
                className="px-3.5 py-2.5 bg-sky-600 hover:bg-sky-700 text-white rounded-xl font-bold text-xs sm:text-sm shadow-md transition-all flex items-center gap-1.5"
              >
                <span>📋</span> Dán Hàng Loạt
              </button>

              <button
                onClick={handleExportStudentAccounts}
                className="px-3.5 py-2.5 bg-gradient-to-r from-sky-600 to-sky-600 hover:from-sky-700 hover:to-sky-700 text-white rounded-xl font-bold text-xs sm:text-sm shadow-md transition-all flex items-center gap-1.5"
                title="Tải file Excel danh sách tài khoản & mật khẩu để gửi cho phụ huynh"
              >
                <span>🔑</span> Xuất DS Tài Khoản (Excel)
              </button>

              <button
                onClick={handleBatchResetPasswords}
                className="px-3.5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs sm:text-sm shadow-md transition-all flex items-center gap-1.5 cursor-pointer"
                title="Đặt lại toàn bộ mật khẩu học sinh trong lớp về mặc định 123"
              >
                <span>⚡</span> Đặt lại tất cả MK về 123
              </button>
            </div>
          </div>

          {/* Homework Status Filter Bar for Selected Class */}
          <div className="p-4 bg-gradient-to-r from-amber-50/70 via-slate-50 to-blue-50/70 rounded-2xl border border-brand-100 space-y-3">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
              {/* Assignment selector */}
              <div className="flex items-center gap-2 flex-1">
                <span className="text-base">📝</span>
                <div className="flex-1 max-w-sm">
                  <label className="block text-[10px] font-black text-slate-500 uppercase tracking-wider mb-0.5">
                    Kiểm tra bài tập:
                  </label>
                  <select
                    value={selectedAssignmentId}
                    onChange={e => setSelectedAssignmentId(e.target.value)}
                    className="w-full px-3 py-1.5 rounded-xl border border-slate-200 text-xs font-bold bg-white text-slate-800 focus:border-brand-500 outline-none shadow-xs"
                  >
                    {classAssignments.length === 0 ? (
                      <option value="NONE">Chưa có bài tập nào giao cho lớp này</option>
                    ) : (
                      <>
                        <option value="LATEST">⚡ Bài mới nhất: {classAssignments[0].title || classAssignments[0].topic}</option>
                        {classAssignments.map(a => (
                          <option key={a.id} value={a.id}>
                            {a.title || a.topic} ({a.assignedDate})
                          </option>
                        ))}
                      </>
                    )}
                  </select>
                </div>
              </div>

              {/* Status Filter Buttons */}
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setHomeworkStatusFilter('ALL')}
                  className={`px-3 py-1.5 rounded-xl font-bold text-xs transition-all ${
                    homeworkStatusFilter === 'ALL'
                      ? 'bg-brand-600 text-white shadow-xs'
                      : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
                  }`}
                >
                  Tất cả ({students.length})
                </button>
                <button
                  type="button"
                  onClick={() => setHomeworkStatusFilter('NOT_DONE')}
                  className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 ${
                    homeworkStatusFilter === 'NOT_DONE'
                      ? 'bg-rose-600 text-white shadow-sm ring-2 ring-rose-200'
                      : 'bg-white text-rose-700 border border-rose-200 hover:bg-rose-50'
                  }`}
                >
                  <span>⚠️</span>
                  <span>Chưa làm bài tập</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    homeworkStatusFilter === 'NOT_DONE' ? 'bg-white/20 text-white' : 'bg-rose-100 text-rose-800'
                  }`}>
                    {notDoneStudents.length}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => setHomeworkStatusFilter('DONE')}
                  className={`px-3.5 py-1.5 rounded-xl font-bold text-xs transition-all flex items-center gap-1.5 ${
                    homeworkStatusFilter === 'DONE'
                      ? 'bg-emerald-600 text-white shadow-xs ring-2 ring-emerald-200'
                      : 'bg-white text-emerald-700 border border-emerald-200 hover:bg-emerald-50'
                  }`}
                >
                  <span>✅</span>
                  <span>Đã nộp bài</span>
                  <span className={`px-1.5 py-0.2 rounded-full text-[10px] font-black ${
                    homeworkStatusFilter === 'DONE' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                  }`}>
                    {doneStudents.length}
                  </span>
                </button>
              </div>

              {/* Copy Zalo Button */}
              {notDoneStudents.length > 0 && activeAssignment && (
                <button
                  type="button"
                  onClick={handleCopyNotDoneZaloList}
                  className="px-3.5 py-1.5 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white rounded-xl font-bold text-xs shadow-sm transition-all flex items-center gap-1.5 shrink-0"
                  title="Sao chép danh sách các bạn chưa làm để dán gửi vào nhóm Zalo lớp"
                >
                  <span>📋</span>
                  <span>{copiedZaloMsg ? '✓ Đã Copy Danh Sách!' : 'Copy DS Chưa Làm (Gửi Zalo)'}</span>
                </button>
              )}
            </div>

            {/* Quick alert if viewing NOT_DONE */}
            {homeworkStatusFilter === 'NOT_DONE' && (
              <div className="p-2.5 bg-rose-50/80 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-center justify-between">
                <span>
                  Đang lọc <b>{notDoneStudents.length}</b> bạn học sinh trong <b>{currentClass.name}</b> chưa hoàn thành bài tập <b>"{activeAssignment?.title || activeAssignment?.topic || 'này'}"</b>.
                </span>
                <button
                  type="button"
                  onClick={() => setHomeworkStatusFilter('ALL')}
                  className="text-rose-700 font-bold hover:underline ml-2 text-[11px]"
                >
                  Xem tất cả
                </button>
              </div>
            )}
          </div>

          {/* Student Table */}
          {filteredStudents.length === 0 ? (
            <div className="py-12 text-center text-slate-400">
              <div className="text-4xl mb-2">
                {homeworkStatusFilter === 'NOT_DONE' ? '🎉' : '🎒'}
              </div>
              <p className="font-bold text-base">
                {homeworkStatusFilter === 'NOT_DONE'
                  ? `Tuyệt vời! 100% học sinh ${currentClass.name} đã hoàn thành bài tập này!`
                  : homeworkStatusFilter === 'DONE'
                  ? `Chưa có học sinh nào trong ${currentClass.name} nộp bài tập này.`
                  : `Chưa có học sinh nào phù hợp trong ${currentClass.name}`}
              </p>
              <p className="text-xs text-slate-400 mt-1">
                {homeworkStatusFilter !== 'ALL' ? (
                  <button
                    onClick={() => setHomeworkStatusFilter('ALL')}
                    className="text-brand-600 hover:underline font-bold"
                  >
                    Bấm vào đây để xem toàn bộ danh sách lớp
                  </button>
                ) : (
                  'Cô có thể bấm "Nhập từ Excel", "Dán Hàng Loạt" hoặc "Thêm 1 Học Sinh" để nạp danh sách thật vào lớp nhé!'
                )}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="text-xs font-black text-slate-400 uppercase tracking-wider border-b border-slate-100">
                    <th className="py-3 px-3">STT</th>
                    <th className="py-3 px-4">Họ và Tên Học Sinh</th>
                    <th className="py-3 px-4">Tên Tiếng Anh (E.NAME)</th>
                    <th className="py-3 px-3">Lớp</th>
                    <th className="py-3 px-3">Mật Khẩu</th>
                    <th className="py-3 px-4">Số Điện Thoại Phụ Huynh</th>
                    <th className="py-3 px-4 text-center">Trạng Thái Bài Tập</th>
                    <th className="py-3 px-4">Ghi Chú của Cô</th>
                    <th className="py-3 px-4 text-right">Thao Tác</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredStudents.map((s, idx) => {
                    const sub = getStudentSubmission(s);
                    return (
                      <tr
                        key={s.id}
                        className={`transition-colors ${
                          homeworkStatusFilter === 'NOT_DONE'
                            ? 'hover:bg-rose-50/40 bg-rose-50/10'
                            : 'hover:bg-brand-50/40'
                        }`}
                      >
                        <td className="py-3.5 px-3 font-bold text-slate-400 text-xs">
                          {String(idx + 1).padStart(2, '0')}
                        </td>
                        <td className="py-3.5 px-4">
                          <div className="flex items-center gap-3">
                            <span className="w-9 h-9 rounded-xl bg-brand-50 border border-brand-100 flex items-center justify-center text-lg shadow-sm">
                              {s.avatar || '🎒'}
                            </span>
                            <span className="font-black text-slate-800 text-sm">{s.name}</span>
                          </div>
                        </td>
                        <td className="py-3.5 px-4">
                          {s.englishName ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-xs">
                              <span>⭐</span> {s.englishName}
                            </span>
                          ) : (
                            <span className="text-slate-300 text-xs italic">Chưa đặt</span>
                          )}
                        </td>
                        <td className="py-3.5 px-3">
                          <span className="inline-block px-2.5 py-1 rounded-lg bg-brand-50 text-brand-700 font-bold text-xs">
                            {s.className}
                          </span>
                        </td>
                        <td className="py-3.5 px-3">
                          <div className="flex items-center gap-1.5">
                            <span
                              onClick={() => {
                                navigator.clipboard.writeText(s.password || '123');
                                showToast(`📋 Đã copy mật khẩu của ${s.name}: ${s.password || '123'}`);
                              }}
                              className="inline-flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-mono font-bold text-xs cursor-pointer transition-all shadow-2xs"
                              title="Click để copy mật khẩu"
                            >
                              <span>🔑</span> {s.password || '123'}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setPasswordModalStudent(s);
                                setQuickNewPassword('123');
                              }}
                              className="px-1.5 py-1 bg-amber-100 hover:bg-amber-200 text-amber-900 rounded-lg text-[11px] font-bold border border-amber-300 transition-all cursor-pointer shadow-2xs whitespace-nowrap"
                              title="Cấp lại hoặc đổi mật khẩu cho học sinh này"
                            >
                              ✏️ Cấp/Đổi
                            </button>
                          </div>
                        </td>
                        <td className="py-3.5 px-4 text-xs font-semibold text-slate-600">
                          {s.phone ? (
                            <span className="text-slate-700 font-mono">📞 {s.phone}</span>
                          ) : (
                            <span className="text-slate-300 italic">—</span>
                          )}
                        </td>
                        {/* Trạng Thái Bài Tập */}
                        <td className="py-3.5 px-4 text-center">
                          {sub ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-emerald-50 text-emerald-800 border border-emerald-200 font-bold text-xs">
                              <span>✅</span> Đã nộp ({sub.score.toFixed(1)}đ)
                            </span>
                          ) : (
                            <div className="inline-flex items-center gap-1.5">
                              <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-rose-50 text-rose-700 border border-rose-200 font-bold text-xs">
                                <span>⚠️</span> Chưa làm
                              </span>
                              {s.phone && (
                                <button
                                  type="button"
                                  onClick={() => handleCopyIndividualReminder(s)}
                                  className="px-2 py-0.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-[11px] font-bold transition-all shadow-2xs"
                                  title={`Copy tin nhắn nhắc phụ huynh em ${s.name}`}
                                >
                                  📱 Nhắc
                                </button>
                              )}
                            </div>
                          )}
                        </td>
                        <td className="py-3.5 px-4 text-xs text-slate-600 italic">
                          {s.notes || <span className="text-slate-300">Chưa có ghi chú</span>}
                        </td>
                        <td className="py-3.5 px-4 text-right">
                          <div className="inline-flex items-center gap-2">
                            <button
                              onClick={() => setEditingStudent(s)}
                              className="p-1.5 hover:bg-slate-100 text-slate-600 rounded-lg text-xs font-bold transition-all"
                              title="Chỉnh sửa thông tin"
                            >
                              ✏️ Sửa
                            </button>
                            <button
                              onClick={() => {
                                setStudentToDelete(s);
                                setDeleteReason('Học sinh nghỉ học');
                              }}
                              className="p-1.5 hover:bg-rose-50 text-rose-600 rounded-lg text-xs font-bold transition-all"
                              title="Xóa vĩnh viễn học sinh này (trong trường hợp nghỉ học / chuyển trường)"
                            >
                              🗑️ Xóa
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* Modal: Thêm Lớp Mới */}
      {showAddClass && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-fade-in">
            <h3 className="text-lg font-black text-brand-900">➕ Thêm Lớp Học Mới</h3>
            <form onSubmit={handleCreateClass} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Tên Lớp (VD: Lớp A4 T4-T6, Lớp 6A1...)</label>
                <input
                  type="text"
                  required
                  value={newClassName}
                  onChange={e => setNewClassName(e.target.value)}
                  placeholder="Nhập tên lớp..."
                  className="w-full p-3 rounded-xl border border-slate-200 text-sm font-bold focus:border-brand-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Khối Lớp / Cấp Độ</label>
                <select
                  value={newClassGradeCustom ? 'custom' : String(newClassGrade)}
                  onChange={e => {
                    if (e.target.value === 'custom') { setNewClassGradeCustom(true); }
                    else { setNewClassGradeCustom(false); setNewClassGrade(Number(e.target.value)); }
                  }}
                  className="w-full p-3 rounded-xl border border-slate-200 text-sm font-bold focus:border-brand-500 outline-none bg-white"
                >
                  <option value={0}>Mầm non</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(g => (
                    <option key={g} value={g}>Khối {g}</option>
                  ))}
                  <option value="custom">✏️ Khác – tự nhập (Starters, IELTS, Người lớn...)</option>
                </select>
                {newClassGradeCustom && (
                  <input
                    type="text"
                    required
                    value={newClassGradeLabel}
                    onChange={e => setNewClassGradeLabel(e.target.value)}
                    placeholder="Nhập khối / cấp độ, VD: Starters, Movers, IELTS 5.0, Người lớn..."
                    className="w-full mt-2 p-3 rounded-xl border border-slate-200 text-sm font-bold focus:border-brand-500 outline-none"
                  />
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">🗓️ Sắp Lịch Học Cho Lớp</label>
                  <span className="text-[11px] text-teal-600 font-bold">Liên kết trực tiếp 8 buổi học</span>
                </div>
                {/* Mẫu lịch nhanh 1-Click */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {[
                    { label: 'T2 & T5', desc: 'Thứ 2 & Thứ 5 (17:30 - 19:00)' },
                    { label: 'T3 & T6', desc: 'Thứ 3 & Thứ 6 (17:30 - 19:00)' },
                    { label: 'T4 & T7', desc: 'Thứ 4 & Thứ 7 (18:00 - 19:30)' },
                    { label: 'T2-4-6', desc: 'Thứ 2 - 4 - 6 (17:30 - 19:00)' },
                    { label: 'T3-5-7', desc: 'Thứ 3 - 5 - 7 (17:30 - 19:00)' },
                    { label: 'T7 & CN', desc: 'Thứ 7 & Chủ Nhật (08:30 - 10:00)' }
                  ].map(tmpl => (
                    <button
                      key={tmpl.label}
                      type="button"
                      onClick={() => setNewClassDesc(tmpl.desc)}
                      className={`px-2.5 py-1 text-xs rounded-lg font-bold transition-all border ${
                        newClassDesc === tmpl.desc
                          ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                          : 'bg-teal-50 hover:bg-teal-100 text-teal-800 border-teal-200'
                      }`}
                    >
                      ⚡ {tmpl.label}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={newClassDesc}
                  onChange={e => setNewClassDesc(e.target.value)}
                  placeholder="VD: Thứ 4 & Thứ 6 (18:00 - 19:30)"
                  className="w-full p-3 rounded-xl border border-slate-200 text-sm font-semibold focus:border-brand-500 outline-none"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  💡 Chọn mẫu hoặc nhập thứ & giờ học: ngày 8 buổi học sẽ tự động được liên kết theo lịch này.
                </p>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddClass(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-xl text-sm shadow-md"
                >
                  Tạo Lớp
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Chỉnh Sửa Lớp */}
      {editingClass && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-fade-in">
            <h3 className="text-lg font-black text-brand-900">✏️ Chỉnh Sửa Thông Tin Lớp Học</h3>
            <form onSubmit={handleUpdateClass} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Tên Lớp</label>
                <input
                  type="text"
                  required
                  value={editingClass.name}
                  onChange={e => setEditingClass({ ...editingClass, name: e.target.value })}
                  className="w-full p-3 rounded-xl border border-slate-200 text-sm font-bold focus:border-brand-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Khối Lớp / Cấp Độ</label>
                <select
                  value={editGradeCustom ? 'custom' : String(editingClass.grade)}
                  onChange={e => {
                    if (e.target.value === 'custom') { setEditGradeCustom(true); setEditingClass({ ...editingClass, grade: 0 }); }
                    else { setEditGradeCustom(false); setEditingClass({ ...editingClass, grade: Number(e.target.value), gradeLabel: '' }); }
                  }}
                  className="w-full p-3 rounded-xl border border-slate-200 text-sm font-bold focus:border-brand-500 outline-none bg-white"
                >
                  <option value={0}>Mầm non</option>
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(g => (
                    <option key={g} value={g}>Khối {g}</option>
                  ))}
                  <option value="custom">✏️ Khác – tự nhập (Starters, IELTS, Người lớn...)</option>
                </select>
                {editGradeCustom && (
                  <input
                    type="text"
                    required
                    value={editingClass.gradeLabel || ''}
                    onChange={e => setEditingClass({ ...editingClass, gradeLabel: e.target.value })}
                    placeholder="Nhập khối / cấp độ, VD: Starters, Movers, IELTS 5.0, Người lớn..."
                    className="w-full mt-2 p-3 rounded-xl border border-slate-200 text-sm font-bold focus:border-brand-500 outline-none"
                  />
                )}
              </div>
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">🗓️ Sắp Lịch Học Cho Lớp</label>
                  <span className="text-[11px] text-teal-600 font-bold">Liên kết trực tiếp 8 buổi học</span>
                </div>
                {/* Mẫu lịch nhanh 1-Click */}
                <div className="flex flex-wrap gap-1.5 mb-2">
                  {[
                    { label: 'T2 & T5', desc: 'Thứ 2 & Thứ 5 (17:30 - 19:00)' },
                    { label: 'T3 & T6', desc: 'Thứ 3 & Thứ 6 (17:30 - 19:00)' },
                    { label: 'T4 & T7', desc: 'Thứ 4 & Thứ 7 (18:00 - 19:30)' },
                    { label: 'T2-4-6', desc: 'Thứ 2 - 4 - 6 (17:30 - 19:00)' },
                    { label: 'T3-5-7', desc: 'Thứ 3 - 5 - 7 (17:30 - 19:00)' },
                    { label: 'T7 & CN', desc: 'Thứ 7 & Chủ Nhật (08:30 - 10:00)' }
                  ].map(tmpl => (
                    <button
                      key={tmpl.label}
                      type="button"
                      onClick={() => setEditingClass({ ...editingClass, description: tmpl.desc })}
                      className={`px-2.5 py-1 text-xs rounded-lg font-bold transition-all border ${
                        (editingClass.description || '').trim() === tmpl.desc
                          ? 'bg-teal-600 text-white border-teal-600 shadow-xs'
                          : 'bg-teal-50 hover:bg-teal-100 text-teal-800 border-teal-200'
                      }`}
                    >
                      ⚡ {tmpl.label}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={editingClass.description || ''}
                  onChange={e => setEditingClass({ ...editingClass, description: e.target.value })}
                  placeholder="VD: Thứ 4 & Thứ 6 (18:00 - 19:30)"
                  className="w-full p-3 rounded-xl border border-slate-200 text-sm font-semibold focus:border-brand-500 outline-none"
                />
                <p className="text-[11px] text-slate-500 mt-1">
                  💡 Thay đổi lịch học sẽ tự động cập nhật ngay ngày 8 buổi học trong Báo Cáo Tháng & Báo Cáo Tuần.
                </p>
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setEditingClass(null)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl text-sm shadow-md"
                >
                  Lưu Thay Đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Thêm 1 Học Sinh */}
      {showAddStudent && currentClass && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-fade-in">
            <h3 className="text-lg font-black text-brand-900">➕ Thêm Học Sinh Vào {currentClass.name}</h3>
            <form onSubmit={handleAddSingleStudent} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Họ và Tên Học Sinh *</label>
                <input
                  type="text"
                  required
                  value={newStudentName}
                  onChange={e => setNewStudentName(e.target.value)}
                  placeholder="VD: Hoàng Sơn Tùng"
                  className="w-full p-3 rounded-xl border border-slate-200 text-sm font-bold focus:border-brand-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Tên Tiếng Anh / E.NAME (Tùy chọn)</label>
                <input
                  type="text"
                  value={newStudentEnglishName}
                  onChange={e => setNewStudentEnglishName(e.target.value)}
                  placeholder="VD: Arty, Batman, Kelvin, Elsa..."
                  className="w-full p-3 rounded-xl border border-slate-200 text-sm focus:border-brand-500 outline-none"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Số Điện Thoại Phụ Huynh (Tùy chọn)</label>
                <input
                  type="text"
                  value={newStudentPhone}
                  onChange={e => setNewStudentPhone(e.target.value)}
                  placeholder="VD: 0987654321"
                  className="w-full p-3 rounded-xl border border-slate-200 text-sm focus:border-brand-500 outline-none font-mono"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Mật khẩu đăng nhập (Mặc định: 123)</label>
                <input
                  type="text"
                  value={newStudentPassword}
                  onChange={e => setNewStudentPassword(e.target.value)}
                  placeholder="123"
                  className="w-full p-3 rounded-xl border border-slate-200 text-sm focus:border-brand-500 outline-none font-mono font-bold"
                />
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Ghi chú của cô (Tùy chọn)</label>
                <input
                  type="text"
                  value={newStudentNote}
                  onChange={e => setNewStudentNote(e.target.value)}
                  placeholder="VD: Chăm chỉ, phát âm tốt..."
                  className="w-full p-3 rounded-xl border border-slate-200 text-sm focus:border-brand-500 outline-none"
                />
              </div>
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowAddStudent(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-xl text-sm shadow-md"
                >
                  Thêm Học Sinh
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Nhập Học Sinh Từ File Excel */}
      {showExcelModal && currentClass && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-2xl w-full shadow-2xl space-y-5 animate-fade-in max-h-[90vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-2xl">📥</span>
                <div>
                  <h3 className="text-lg font-black text-brand-900">Nhập Danh Sách Học Sinh Từ File Excel</h3>
                  <p className="text-xs text-slate-500 font-medium">Áp dụng cho: <b>{currentClass.name}</b></p>
                </div>
              </div>
              <button onClick={() => setShowExcelModal(false)} className="text-slate-400 hover:text-slate-600 font-bold text-lg">✕</button>
            </div>

            {/* Template & Upload Controls */}
            <div className="space-y-4">
              <div className="p-4 bg-emerald-50 border border-emerald-200 rounded-2xl flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-emerald-900">💡 Chưa có file Excel đúng định dạng?</p>
                  <p className="text-[11px] text-emerald-700">Tải file mẫu về máy, điền tên học sinh và nạp lại vào hệ thống:</p>
                </div>
                <button
                  type="button"
                  onClick={handleDownloadExcelTemplate}
                  className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shrink-0 flex items-center gap-1 shadow-sm"
                >
                  <span>📄</span> Tải File Mẫu (.xlsx)
                </button>
              </div>

              {/* Upload Dropzone */}
              <div className="border-2 border-dashed border-slate-300 hover:border-brand-500 rounded-2xl p-6 text-center transition-all bg-slate-50 hover:bg-brand-50/20">
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleExcelFileUpload}
                  className="hidden"
                  id="excelFileInput"
                />
                <label htmlFor="excelFileInput" className="cursor-pointer space-y-2 block">
                  <span className="text-4xl block">📊</span>
                  <span className="font-bold text-sm text-slate-700 block">
                    {excelFileName ? `Đã chọn: ${excelFileName}` : 'Nhấn để chọn file Excel (.xlsx, .xls, .csv) từ máy tính'}
                  </span>
                  <span className="text-xs text-slate-400 block">Hệ thống hỗ trợ tự động nhận diện các cột: Họ tên, E.NAME, SĐT, Ghi chú</span>
                </label>
              </div>
            </div>

            {/* Preview Section */}
            {excelPreviewList.length > 0 && (
              <div className="flex-1 overflow-hidden flex flex-col space-y-2">
                <div className="flex items-center justify-between text-xs font-bold text-slate-700">
                  <span>Xem trước ({excelPreviewList.length} học sinh):</span>
                  <span className="text-emerald-600">✓ Đọc dữ liệu thành công</span>
                </div>
                <div className="overflow-y-auto max-h-48 border border-slate-200 rounded-xl">
                  <table className="w-full text-left text-xs border-collapse">
                    <thead className="bg-slate-100 sticky top-0">
                      <tr>
                        <th className="p-2">STT</th>
                        <th className="p-2">Họ và Tên</th>
                        <th className="p-2">E.NAME</th>
                        <th className="p-2">Số Điện Thoại</th>
                        <th className="p-2">Ghi Chú</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {excelPreviewList.map((item, i) => (
                        <tr key={i} className="hover:bg-slate-50">
                          <td className="p-2 font-bold text-slate-400">{i + 1}</td>
                          <td className="p-2 font-bold text-slate-800">{item.name}</td>
                          <td className="p-2 text-emerald-700 font-semibold">{item.englishName || '—'}</td>
                          <td className="p-2 font-mono text-slate-600">{item.phone || '—'}</td>
                          <td className="p-2 text-slate-500 italic">{item.notes || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* Footer Buttons */}
            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => {
                  setShowExcelModal(false);
                  setExcelPreviewList([]);
                  setExcelFileName('');
                }}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm"
              >
                Hủy
              </button>
              <button
                type="button"
                disabled={excelPreviewList.length === 0}
                onClick={handleConfirmExcelImport}
                className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-sm shadow-md disabled:opacity-50"
              >
                Xác Nhận Thêm ({excelPreviewList.length} Học Sinh)
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Dán Danh Sách Hàng Loạt */}
      {showBatchModal && currentClass && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-4 animate-fade-in">
            <div className="flex items-center justify-between">
              <h3 className="text-lg font-black text-brand-900">📋 Dán Danh Sách Học Sinh Vào {currentClass.name}</h3>
              <button onClick={() => setShowBatchModal(false)} className="text-slate-400 hover:text-slate-600 font-bold">✕</button>
            </div>
            <div className="text-xs text-slate-600 space-y-1 bg-slate-50 p-3 rounded-2xl border border-slate-200">
              <p className="font-bold text-slate-700">📌 Hỗ trợ các định dạng linh hoạt:</p>
              <ul className="list-disc pl-4 space-y-0.5 text-[11px] text-slate-500">
                <li>Copy trực tiếp từ bảng tính Excel (Họ tên [Tab] Tên tiếng Anh)</li>
                <li>Dạng ngăn cách dấu phẩy: <code className="bg-white px-1 rounded">Hoàng Sơn Tùng, Arty, 0987654321</code></li>
                <li>Dạng gạch ngang: <code className="bg-white px-1 rounded">1. Trần Gia Phú - Kelvin</code></li>
                <li>Hoặc chỉ cần danh sách họ tên mỗi bạn 1 dòng.</li>
              </ul>
            </div>
            <form onSubmit={handleBatchAdd} className="space-y-3">
              <textarea
                required
                rows={8}
                value={batchNamesText}
                onChange={e => setBatchNamesText(e.target.value)}
                placeholder={`Hoàng Sơn Tùng, Arty\nNguyễn Minh Duy, Batman\nTrần Gia Phú, Kelvin\nLê Tú Uyên, Cherry\nNguyễn Ngọc Lam Phương, Elsa`}
                className="w-full p-3 rounded-xl border border-slate-200 text-sm font-mono focus:border-brand-500 outline-none resize-none leading-relaxed"
              />
              <div className="flex gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setShowBatchModal(false)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-sky-600 hover:bg-sky-700 text-white font-bold rounded-xl text-sm shadow-md"
                >
                  Thêm Tất Cả
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Chỉnh Sửa Học Sinh */}
      {editingStudent && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 max-w-md w-full shadow-2xl space-y-4 animate-fade-in">
            <div className="flex items-center justify-between pb-2 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-2xl">✏️</span>
                <h3 className="text-lg font-black text-brand-900">Chỉnh Sửa Thông Tin Học Sinh</h3>
              </div>
              <button
                onClick={() => setEditingStudent(null)}
                className="text-slate-400 hover:text-slate-600 font-bold"
              >
                ✕
              </button>
            </div>

            {/* Banner: Ưu tiên lưu thông tin của cô */}
            <div className="p-3 bg-gradient-to-r from-brand-50 to-sky-50 border border-brand-200 rounded-2xl text-xs text-brand-900 flex items-start gap-2.5">
              <span className="text-base leading-none">⭐</span>
              <p className="leading-relaxed">
                <b>Ưu tiên tuyệt đối:</b> Mọi thông tin cô sửa trên website sẽ được hệ thống lưu lại và ưu tiên cao nhất, không bị dữ liệu cũ hoặc đồng bộ đám mây ghi đè.
              </p>
            </div>

            <form onSubmit={handleSaveEditStudent} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Họ và Tên Học Sinh *</label>
                <input
                  type="text"
                  required
                  value={editingStudent.name}
                  onChange={e => setEditingStudent({ ...editingStudent, name: e.target.value })}
                  className="w-full p-3 rounded-xl border border-slate-200 text-sm font-bold focus:border-brand-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Tên Tiếng Anh / E.NAME (Tùy chọn)</label>
                <input
                  type="text"
                  value={editingStudent.englishName || ''}
                  onChange={e => setEditingStudent({ ...editingStudent, englishName: e.target.value })}
                  placeholder="VD: Kelvin, Elsa, Harry..."
                  className="w-full p-3 rounded-xl border border-slate-200 text-sm focus:border-brand-500 outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Lớp Học (Chuyển lớp nếu cần)</label>
                <select
                  value={editingStudent.classId}
                  onChange={e => {
                    const newClassId = e.target.value;
                    const foundClass = classes.find(c => c.id === newClassId);
                    setEditingStudent({
                      ...editingStudent,
                      classId: newClassId,
                      className: foundClass ? foundClass.name : editingStudent.className
                    });
                  }}
                  className="w-full p-3 rounded-xl border border-slate-200 text-sm font-bold focus:border-brand-500 outline-none bg-white"
                >
                  {classes.map(c => (
                    <option key={c.id} value={c.id}>
                      {c.name} ({classGradeText(c)})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Số Điện Thoại Phụ Huynh</label>
                <input
                  type="text"
                  value={editingStudent.phone || ''}
                  onChange={e => setEditingStudent({ ...editingStudent, phone: e.target.value })}
                  placeholder="VD: 0987654321"
                  className="w-full p-3 rounded-xl border border-slate-200 text-sm focus:border-brand-500 outline-none font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Mật khẩu đăng nhập</label>
                <input
                  type="text"
                  value={editingStudent.password || '123'}
                  onChange={e => setEditingStudent({ ...editingStudent, password: e.target.value })}
                  placeholder="123"
                  className="w-full p-3 rounded-xl border border-slate-200 text-sm focus:border-brand-500 outline-none font-mono font-bold"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-600 mb-1">Ghi chú của cô</label>
                <input
                  type="text"
                  value={editingStudent.notes || ''}
                  onChange={e => setEditingStudent({ ...editingStudent, notes: e.target.value })}
                  placeholder="VD: Chăm chỉ, nghe tốt..."
                  className="w-full p-3 rounded-xl border border-slate-200 text-sm focus:border-brand-500 outline-none"
                />
              </div>

              <div className="flex gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setEditingStudent(null)}
                  className="flex-1 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="flex-1 py-2.5 bg-brand-500 hover:bg-brand-600 text-white font-bold rounded-xl text-sm shadow-md"
                >
                  Lưu Thay Đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Xác Nhận Xóa Vĩnh Viễn Học Sinh (Học sinh nghỉ học / chuyển trường) */}
      {studentToDelete && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-4 animate-fade-in border border-rose-100">
            {/* Header cảnh báo */}
            <div className="flex items-center gap-3 pb-3 border-b border-rose-100">
              <span className="w-12 h-12 rounded-2xl bg-rose-100 text-rose-600 flex items-center justify-center text-2xl shrink-0 shadow-xs">
                ⚠️
              </span>
              <div>
                <h3 className="text-lg font-black text-rose-900">Xác Nhận Xóa Vĩnh Viễn</h3>
                <span className="text-xs font-bold px-2 py-0.5 rounded-full bg-rose-50 text-rose-700 border border-rose-200">
                  Học sinh nghỉ học / Chuyển trường
                </span>
              </div>
            </div>

            {/* Thẻ học sinh chuẩn bị xóa */}
            <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-2xl flex items-center gap-3">
              <span className="w-12 h-12 rounded-xl bg-white border border-slate-200 flex items-center justify-center text-2xl shadow-xs">
                {studentToDelete.avatar || '🎒'}
              </span>
              <div className="flex-1 min-w-0">
                <h4 className="font-black text-slate-800 text-base truncate">{studentToDelete.name}</h4>
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-500">
                  <span>Lớp: <b>{studentToDelete.className}</b></span>
                  {studentToDelete.englishName && (
                    <span>• E.NAME: <b className="text-emerald-700">{studentToDelete.englishName}</b></span>
                  )}
                </div>
              </div>
            </div>

            {/* Cảnh báo không cập nhật lại */}
            <div className="p-3.5 bg-amber-50 border border-amber-200 rounded-2xl space-y-1.5 text-xs text-amber-900">
              <p className="font-bold flex items-center gap-1 text-amber-950">
                <span>📢</span> Cô có chắc chắn muốn xóa vĩnh viễn học sinh này không?
              </p>
              <p className="text-amber-800 leading-relaxed">
                Sau khi cô xác nhận, học sinh này sẽ bị <b>loại bỏ vĩnh viễn</b> khỏi danh sách lớp. Hệ thống cam kết <b>sẽ KHÔNG tự động cập nhật hoặc đồng bộ lại</b> bạn này nữa (kể cả khi đồng bộ đám mây Firebase hay mở từ máy khác).
              </p>
            </div>

            {/* Tùy chọn lý do xóa */}
            <div>
              <label className="block text-xs font-bold text-slate-600 mb-1">Lý do xóa / ghi chú:</label>
              <select
                value={deleteReason}
                onChange={e => setDeleteReason(e.target.value)}
                className="w-full p-2.5 rounded-xl border border-slate-200 text-xs font-bold focus:border-rose-500 outline-none bg-white text-slate-700"
              >
                <option value="Học sinh nghỉ học">Học sinh nghỉ học</option>
                <option value="Học sinh chuyển trường / đổi lớp">Học sinh chuyển trường / đổi lớp</option>
                <option value="Trùng lặp danh sách">Trùng lặp danh sách</option>
                <option value="Lý do khác">Lý do khác</option>
              </select>
            </div>

            {/* Nút hành động */}
            <div className="flex gap-2 pt-2 border-t border-slate-100">
              <button
                type="button"
                onClick={() => setStudentToDelete(null)}
                className="flex-1 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm transition-all"
              >
                Hủy Bỏ (Không Xóa)
              </button>
              <button
                type="button"
                onClick={handleConfirmPermanentDelete}
                className="flex-1 py-3 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl text-sm shadow-md transition-all flex items-center justify-center gap-1.5"
              >
                <span>🗑️</span>
                <span>Xóa Vĩnh Viễn</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Danh Sách Học Sinh Đã Nghỉ Học (Lưu trữ vĩnh viễn & Hỗ trợ khôi phục) */}
      {showDeletedModal && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-8 max-w-2xl w-full shadow-2xl space-y-4 animate-fade-in max-h-[85vh] flex flex-col">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🚫</span>
                <div>
                  <h3 className="text-lg font-black text-slate-900">Danh Sách Học Sinh Đã Nghỉ Học ({deletedStudents.length})</h3>
                  <p className="text-xs text-slate-500">Các bạn này đã được loại bỏ vĩnh viễn và không bị đồng bộ lại vào danh sách lớp.</p>
                </div>
              </div>
              <button
                onClick={() => setShowDeletedModal(false)}
                className="text-slate-400 hover:text-slate-600 font-bold text-lg"
              >
                ✕
              </button>
            </div>

            {deletedStudents.length > 0 && (
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 bg-brand-50 border border-brand-100 rounded-2xl p-3">
                <label className="text-xs font-bold text-slate-600 shrink-0">Lọc theo lớp cũ:</label>
                <select
                  value={deletedClassFilter}
                  onChange={e => setDeletedClassFilter(e.target.value)}
                  className="flex-1 min-w-0 px-3 py-2 border border-slate-200 rounded-xl text-xs font-semibold bg-white"
                >
                  <option value="ALL">Tất cả các lớp ({deletedStudents.length})</option>
                  {deletedClassOptions.map(c => (
                    <option key={c} value={c}>
                      {c} ({deletedStudents.filter(d => (d.className || '(Không rõ lớp)') === c).length})
                    </option>
                  ))}
                </select>
                <button
                  type="button"
                  onClick={handleRestoreAllVisible}
                  disabled={visibleDeletedStudents.length === 0}
                  className="px-4 py-2 bg-brand-600 hover:bg-brand-700 disabled:bg-slate-300 text-white font-black rounded-xl text-xs shadow-sm whitespace-nowrap"
                  title="Khôi phục tất cả học sinh đang hiển thị về đúng lớp trước khi nghỉ"
                >
                  🔄 Khôi phục tất cả ({visibleDeletedStudents.length})
                </button>
              </div>
            )}

            {deletedStudents.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-sm">
                Chưa có học sinh nào bị xóa hoặc nghỉ học.
              </div>
            ) : (
              <div className="flex-1 overflow-y-auto border border-slate-200 rounded-2xl">
                <table className="w-full text-left text-xs border-collapse">
                  <thead className="bg-slate-100 sticky top-0">
                    <tr>
                      <th className="p-3">STT</th>
                      <th className="p-3">Họ và Tên</th>
                      <th className="p-3">E.NAME</th>
                      <th className="p-3">Lớp Trước Đó</th>
                      <th className="p-3">Ngày Xóa</th>
                      <th className="p-3">Lý Do</th>
                      <th className="p-3 text-right">Khôi Phục</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {visibleDeletedStudents.map((d, i) => (
                      <tr key={d.id} className="hover:bg-slate-50">
                        <td className="p-3 font-bold text-slate-400">{i + 1}</td>
                        <td className="p-3 font-bold text-slate-800">{d.name}</td>
                        <td className="p-3 text-emerald-700 font-semibold">{d.englishName || '—'}</td>
                        <td className="p-3 font-semibold text-slate-600">{d.className}</td>
                        <td className="p-3 text-slate-400 font-mono">
                          {d.deletedAt ? new Date(d.deletedAt).toLocaleDateString('vi-VN') : '—'}
                        </td>
                        <td className="p-3 text-slate-500 italic">{d.reason || 'Nghỉ học'}</td>
                        <td className="p-3 text-right">
                          <button
                            onClick={() => handleRestoreStudent(d.id, d.name)}
                            className="px-2.5 py-1.5 bg-brand-50 hover:bg-brand-100 text-brand-700 border border-brand-200 font-bold rounded-lg text-xs transition-all"
                            title="Khôi phục lại học sinh này vào lớp"
                          >
                            🔄 Khôi Phục
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            <div className="pt-2 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => setShowDeletedModal(false)}
                className="px-5 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl text-sm"
              >
                Đóng
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Cấp / Đổi Mật Khẩu Nhanh Cho Học Sinh */}
      {passwordModalStudent && (
        <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-white rounded-3xl p-6 sm:p-7 max-w-md w-full shadow-2xl space-y-4 animate-fade-in border border-amber-100">
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <span className="text-2xl">🔑</span>
                <div>
                  <h3 className="text-base font-black text-slate-900">Cấp / Đổi Mật Khẩu Học Sinh</h3>
                  <p className="text-xs text-slate-500">Giáo viên quản lý & cấp mật khẩu</p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPasswordModalStudent(null)}
                className="text-slate-400 hover:text-slate-600 font-bold p-1 text-lg cursor-pointer"
              >
                ✕
              </button>
            </div>

            <div className="p-3.5 bg-amber-50/80 border border-amber-200 rounded-2xl flex items-center gap-3">
              <span className="text-2xl">{passwordModalStudent.avatar || '🎒'}</span>
              <div className="flex-1 min-w-0">
                <h4 className="font-black text-slate-800 text-sm truncate">{passwordModalStudent.name}</h4>
                <p className="text-xs text-slate-600 mt-0.5">
                  Lớp: <b>{passwordModalStudent.className}</b> • MK hiện tại: <b className="font-mono text-amber-900 bg-amber-100/80 px-1.5 py-0.5 rounded">{passwordModalStudent.password || '123'}</b>
                </p>
              </div>
            </div>

            <div className="space-y-3">
              {/* Nút đặt nhanh về 123 */}
              <button
                type="button"
                onClick={() => {
                  resetStudentPassword(passwordModalStudent.id, '123');
                  refresh();
                  showToast(`✓ Đã đặt lại mật khẩu của "${passwordModalStudent.name}" về 123 thành công!`);
                  setPasswordModalStudent(null);
                }}
                className="w-full py-2.5 px-4 bg-emerald-50 hover:bg-emerald-100 border border-emerald-300 text-emerald-800 font-bold rounded-xl text-xs flex items-center justify-center gap-2 transition-all shadow-2xs cursor-pointer"
              >
                <span>⚡</span>
                <span>Đặt Lại Về Mật Khẩu Mặc Định: <b>123</b></span>
              </button>

              <div className="relative flex py-1 items-center">
                <div className="flex-grow border-t border-slate-200"></div>
                <span className="flex-shrink mx-2 text-[10px] text-slate-400 font-bold uppercase tracking-wider">HOẶC CẤP MẬT KHẨU TỰ CHỌN</span>
                <div className="flex-grow border-t border-slate-200"></div>
              </div>

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!quickNewPassword.trim()) return;
                  resetStudentPassword(passwordModalStudent.id, quickNewPassword.trim());
                  refresh();
                  showToast(`✓ Đã cấp mật khẩu mới "${quickNewPassword.trim()}" cho học sinh "${passwordModalStudent.name}" thành công!`);
                  setPasswordModalStudent(null);
                }}
                className="space-y-3"
              >
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nhập mật khẩu mới muốn cấp cho em:
                  </label>
                  <input
                    type="text"
                    required
                    value={quickNewPassword}
                    onChange={e => setQuickNewPassword(e.target.value)}
                    placeholder="Nhập mật khẩu mới..."
                    className="w-full px-3.5 py-2.5 rounded-xl border border-slate-200 text-sm font-mono font-bold text-slate-900 outline-none focus:border-amber-500"
                    autoFocus
                  />
                </div>

                <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                  <button
                    type="button"
                    onClick={() => setPasswordModalStudent(null)}
                    className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-bold transition-all cursor-pointer"
                  >
                    Hủy
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-md transition-all cursor-pointer"
                  >
                    Lưu & Cấp Mật Khẩu
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-5 py-3.5 rounded-2xl shadow-2xl border border-slate-700 flex items-center gap-3 animate-fade-in max-w-md">
          <span className="text-emerald-400 text-lg">✓</span>
          <span className="text-xs sm:text-sm font-semibold leading-snug flex-1">{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="text-slate-400 hover:text-white font-bold text-sm ml-2"
          >
            ✕
          </button>
        </div>
      )}
    </div>
  );
};
