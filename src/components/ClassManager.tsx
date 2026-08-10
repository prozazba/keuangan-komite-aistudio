import React, { useState, useMemo } from 'react';
import { db, handleFirestoreError, OperationType, doc, setDoc, deleteDoc, writeBatch } from '../firebase';
import { Student, StudentBill, SchoolClass } from '../types';
import { 
  Plus, Search, Edit2, Trash2, Users, GraduationCap, 
  Building2, CheckCircle2, AlertCircle, X, ChevronRight, 
  ArrowUpDown, Filter, User, Layers, ShieldCheck, DollarSign,
  UserPlus, Upload, Clipboard, FileText, FileCode, LayoutGrid, List, CreditCard
} from 'lucide-react';
import { formatIDR, getPeriodsForAcademicYear, getDueDateForPeriod } from '../utils';

interface ClassManagerProps {
  classes: string[];
  students: Student[];
  bills: StudentBill[];
  selectedAcademicYear: string;
  onAddClass?: (newClassName: string) => Promise<void>;
  onEditClass?: (oldClassName: string, newClassName: string) => Promise<void>;
  onDeleteClass?: (className: string) => Promise<void>;
  userRole?: 'admin' | 'operator';
}

export default function ClassManager({
  classes,
  students,
  bills,
  selectedAcademicYear,
  onAddClass,
  onEditClass,
  onDeleteClass,
  userRole = 'admin'
}: ClassManagerProps) {
  // Local state for class metadata (stored in localStorage or state for extended info like homeroom teacher & Korlas)
  const [classDetailsMap, setClassDetailsMap] = useState<Record<string, { teacher?: string; korlas?: string }>>(() => {
    const saved = localStorage.getItem('classDetailsMap');
    return saved ? JSON.parse(saved) : {
      'Kelas 7-A': { teacher: 'Dra. Endang Rahayu', korlas: 'Ibu Anita S. (Orang Tua)' },
      'Kelas 7-B': { teacher: 'Drs. Supriyadi M.Pd.', korlas: 'Ibu Maya R. (Orang Tua)' },
      'Kelas 8-A': { teacher: 'Hj. Siti Nurbaya S.Pd.', korlas: 'Bpk. Hendra K. (Orang Tua)' },
      'Kelas 8-B': { teacher: 'Bpk. Bambang Sutrisno', korlas: 'Ibu Dewi P. (Orang Tua)' },
      'Kelas 9-A': { teacher: 'Ibu Ratna Juwita M.Si.', korlas: 'Ibu Rina S. (Orang Tua)' },
      'Kelas 9-B': { teacher: 'Bpk. Agus Hermawan S.Pd.', korlas: 'Bpk. Farhan T. (Orang Tua)' },
      'Kelas 9-C': { teacher: 'Ibu Sri Wahyuni S.Si.', korlas: 'Ibu Lina M. (Orang Tua)' },
    };
  });

  // Save class details
  const updateClassDetails = (className: string, teacher: string, korlas: string) => {
    const updated = { ...classDetailsMap, [className]: { teacher, korlas } };
    setClassDetailsMap(updated);
    localStorage.setItem('classDetailsMap', JSON.stringify(updated));
  };

  // UI Filter & Search
  const [searchQuery, setSearchQuery] = useState('');
  const [gradeFilter, setGradeFilter] = useState<string>('All');
  const [viewMode, setViewMode] = useState<'grid' | 'table'>('grid');

  // Modal States
  const [showAddModal, setShowAddModal] = useState(false);
  const [showEditModal, setShowEditModal] = useState(false);
  const [selectedClassForRoster, setSelectedClassForRoster] = useState<string | null>(null);

  // Payment Form Trigger State from Roster "Belum Lunas"
  const [selectedPaymentStudent, setSelectedPaymentStudent] = useState<{ student: Student; bill?: StudentBill } | null>(null);
  const [payAmount, setPayAmount] = useState<number>(150000);
  const [payMethod, setPayMethod] = useState<'Cash' | 'Transfer Bank' | 'E-Wallet'>('Transfer Bank');
  const [payDate, setPayDate] = useState<string>(() => new Date().toISOString().substring(0, 10));
  const [payNote, setPayNote] = useState<string>('');
  const [isSubmittingPayment, setIsSubmittingPayment] = useState<boolean>(false);

  const handleOpenPaymentModal = (student: Student, bill?: StudentBill) => {
    const targetBill = bill || bills.find(b => b.studentId === student.id || b.studentId === student.studentId);
    const reqAmount = targetBill ? targetBill.amountRequired : 150000;
    const paidAmount = targetBill ? targetBill.amountPaid : 0;
    const sisa = reqAmount - paidAmount > 0 ? reqAmount - paidAmount : reqAmount;

    setSelectedPaymentStudent({ student, bill: targetBill });
    setPayAmount(sisa);
    setPayMethod('Transfer Bank');
    setPayDate(new Date().toISOString().substring(0, 10));
    setPayNote('');
  };

  const handleProcessPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedPaymentStudent) return;
    if (payAmount <= 0) {
      alert("Masukkan nominal pembayaran yang valid!");
      return;
    }

    setIsSubmittingPayment(true);
    try {
      const { student, bill } = selectedPaymentStudent;
      const batch = writeBatch(db);
      const period = bill?.period || (getPeriodsForAcademicYear(selectedAcademicYear)[0] || 'Mei 2026');
      const billId = bill?.id || `bill_${student.id}_${period.replace(/\s+/g, '_')}`;
      const amountReq = bill?.amountRequired || 150000;
      const previousPaid = bill?.amountPaid || 0;
      const newPaidAmount = previousPaid + payAmount;
      const remains = amountReq - newPaidAmount;
      const newStatus = remains <= 0 ? 'paid' : (newPaidAmount > 0 ? 'partially_paid' : 'unpaid');

      // 1. Update/set student_bills record
      const billRef = doc(db, 'student_bills', billId);
      batch.set(billRef, {
        id: billId,
        studentId: student.id,
        studentName: student.name,
        studentClass: student.classId,
        parentsName: student.parentsName || 'Wali Murid',
        parentsPhone: student.parentsPhone || '',
        parentsEmail: student.parentsEmail || '',
        period: period,
        amountRequired: amountReq,
        amountPaid: Math.min(newPaidAmount, amountReq),
        status: newStatus,
        dueDate: bill?.dueDate || getDueDateForPeriod(period),
        updatedAt: new Date().toISOString()
      }, { merge: true });

      // 2. Add ledger transaction
      const txId = `tx_iuran_${Date.now()}`;
      const txRef = doc(db, 'transactions', txId);
      batch.set(txRef, {
        id: txId,
        date: payDate,
        type: 'income',
        category: 'Iuran Bulanan',
        amount: payAmount,
        description: `Iuran ${period} - ${student.name} (${student.classId}) ${payNote ? `• [${payNote}]` : ''}`,
        studentId: student.id,
        studentName: student.name,
        classId: student.classId,
        period: period,
        paymentMethod: payMethod,
        recordedBy: 'admin@komite.id',
        createdAt: new Date().toISOString()
      });

      await batch.commit();
      alert(`Pembayaran iuran ${formatIDR(payAmount)} untuk ${student.name} berhasil disimpan!`);
      setSelectedPaymentStudent(null);
    } catch (err) {
      console.error("Gagal memproses pembayaran:", err);
      alert("Gagal memproses pembayaran. Silakan coba lagi.");
    } finally {
      setIsSubmittingPayment(false);
    }
  };

  // Quick Add Student in Roster Modal state
  const [showQuickAddStudent, setShowQuickAddStudent] = useState(false);
  const [addStudentTab, setAddStudentTab] = useState<'single' | 'file' | 'paste'>('single');
  const [qStudentId, setQStudentId] = useState('');
  const [qName, setQName] = useState('');
  const [qParentsName, setQParentsName] = useState('');
  const [qParentsPhone, setQParentsPhone] = useState('');
  const [qParentsEmail, setQParentsEmail] = useState('');
  const [qPasteText, setQPasteText] = useState('');

  const resetQuickAddForm = () => {
    setQStudentId('');
    setQName('');
    setQParentsName('');
    setQParentsPhone('');
    setQParentsEmail('');
    setQPasteText('');
    setShowQuickAddStudent(false);
  };

  const handleQuickAddSingleStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedClassForRoster) return;
    if (!qStudentId.trim() || !qName.trim()) {
      alert("NISN dan Nama Siswa wajib diisi!");
      return;
    }

    try {
      const generatedId = `std_${Date.now()}`;
      const payload: Student = {
        id: generatedId,
        studentId: qStudentId.trim(),
        name: qName.trim(),
        classId: selectedClassForRoster,
        parentsName: qParentsName.trim() || 'Wali Murid',
        parentsEmail: qParentsEmail.trim() || `${qStudentId.trim()}@sekh.id`,
        parentsPhone: qParentsPhone.trim() || '081200000000',
        status: 'active',
        academicYear: selectedAcademicYear,
      };

      await setDoc(doc(db, 'students', generatedId), payload);

      const currentPeriods = getPeriodsForAcademicYear(selectedAcademicYear);
      const batch = writeBatch(db);
      currentPeriods.forEach(period => {
        const billId = `${generatedId}_${period.replace(' ', '_')}`;
        const newBill: StudentBill = {
          id: billId,
          studentId: generatedId,
          studentName: payload.name,
          studentClass: payload.classId,
          parentsName: payload.parentsName,
          parentsPhone: payload.parentsPhone,
          parentsEmail: payload.parentsEmail,
          period,
          amountRequired: 150000,
          amountPaid: 0,
          status: 'unpaid',
          dueDate: getDueDateForPeriod(period),
          updatedAt: new Date().toISOString()
        };
        batch.set(doc(db, 'student_bills', billId), newBill);
      });
      await batch.commit();

      alert(`Siswa "${payload.name}" berhasil ditambahkan ke ${selectedClassForRoster}!`);
      resetQuickAddForm();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'students');
    }
  };

  const handleQuickImportStudents = async (studentList: Array<{ studentId: string; name: string; parentsName: string; parentsPhone: string; parentsEmail: string }>) => {
    if (!selectedClassForRoster) return;
    const validList = studentList.filter(s => (s.name && s.name.trim().length > 0) || (s.studentId && s.studentId.trim().length > 0));
    if (validList.length === 0) {
      alert("Tidak ada data siswa yang valid untuk diimpor!");
      return;
    }

    try {
      const batch = writeBatch(db);
      const currentPeriods = getPeriodsForAcademicYear(selectedAcademicYear);
      const existingClassStudents = students.filter(s => s.classId === selectedClassForRoster);

      let importedCount = 0;
      let updatedCount = 0;

      validList.forEach((item, index) => {
        const studentIdVal = item.studentId?.trim() || `1092${Math.floor(1000 + Math.random() * 9000)}`;
        const nameVal = item.name?.trim() || `Siswa ${index + 1}`;

        // Check if student already exists in this class (by studentId or name)
        const existing = existingClassStudents.find(
          s => (s.studentId && s.studentId.trim().toLowerCase() === studentIdVal.toLowerCase()) ||
               (s.name && s.name.trim().toLowerCase() === nameVal.toLowerCase())
        );

        const generatedId = existing ? existing.id : `std_bulk_${Date.now()}_${index}_${Math.random().toString(36).substr(2, 5)}`;

        if (existing) {
          updatedCount++;
        } else {
          importedCount++;
        }

        const payload: Student = {
          id: generatedId,
          studentId: studentIdVal,
          name: nameVal,
          classId: selectedClassForRoster,
          parentsName: item.parentsName?.trim() || existing?.parentsName || 'Wali Murid',
          parentsEmail: item.parentsEmail?.trim() || existing?.parentsEmail || `${studentIdVal}@sekh.id`,
          parentsPhone: item.parentsPhone?.trim() || existing?.parentsPhone || '081200000000',
          status: 'active',
          academicYear: selectedAcademicYear,
        };

        batch.set(doc(db, 'students', generatedId), payload);

        currentPeriods.forEach(period => {
          const billId = `${generatedId}_${period.replace(/\s+/g, '_')}`;
          const existingBill = bills.find(b => b.id === billId);
          const newBill: StudentBill = {
            id: billId,
            studentId: generatedId,
            studentName: payload.name,
            studentClass: payload.classId,
            parentsName: payload.parentsName,
            parentsPhone: payload.parentsPhone,
            parentsEmail: payload.parentsEmail,
            period,
            amountRequired: existingBill ? existingBill.amountRequired : 150000,
            amountPaid: existingBill ? existingBill.amountPaid : 0,
            status: existingBill ? existingBill.status : 'unpaid',
            dueDate: existingBill ? existingBill.dueDate : getDueDateForPeriod(period),
            updatedAt: new Date().toISOString()
          };
          batch.set(doc(db, 'student_bills', billId), newBill);
        });
      });

      await batch.commit();
      
      let msg = `Proses impor selesai! `;
      if (importedCount > 0) msg += `${importedCount} siswa baru ditambahkan. `;
      if (updatedCount > 0) msg += `${updatedCount} data siswa diperbarui (mencegah duplikasi).`;
      alert(msg);
      resetQuickAddForm();
    } catch (err: any) {
      console.error("Gagal mengimpor siswa:", err);
      alert(`Gagal mengimpor siswa: ${err?.message || "Terjadi kesalahan saat menyimpan ke database."}`);
    }
  };

  const handleCleanupDuplicates = async () => {
    if (!selectedClassForRoster) return;
    const classStudents = students.filter(s => s.classId === selectedClassForRoster);
    if (classStudents.length === 0) {
      alert("Tidak ada siswa di kelas ini.");
      return;
    }

    const seen = new Map<string, Student>();
    const duplicateIds: string[] = [];

    classStudents.forEach(student => {
      const key = (student.studentId?.trim() || student.name?.trim() || '').toLowerCase();
      if (key) {
        if (seen.has(key)) {
          duplicateIds.push(student.id);
        } else {
          seen.set(key, student);
        }
      }
    });

    if (duplicateIds.length === 0) {
      alert("Tidak ditemukan data siswa duplikat di kelas ini.");
      return;
    }

    if (!confirm(`Ditemukan ${duplicateIds.length} data siswa duplikat di ${selectedClassForRoster}. Hapus semua data duplikat tersebut?`)) {
      return;
    }

    try {
      const batch = writeBatch(db);
      duplicateIds.forEach(id => {
        batch.delete(doc(db, 'students', id));
        const studentBills = bills.filter(b => b.studentId === id);
        studentBills.forEach(b => {
          batch.delete(doc(db, 'student_bills', b.id));
        });
      });

      await batch.commit();
      alert(`Berhasil menghapus ${duplicateIds.length} data siswa duplikat dari ${selectedClassForRoster}!`);
    } catch (err: any) {
      console.error("Gagal menghapus duplikat:", err);
      alert(`Gagal menghapus data duplikat: ${err?.message || "Terjadi kesalahan saat menghapus."}`);
    }
  };

  const downloadCSVTemplate = () => {
    const csvContent = "NISN,Nama Siswa,Nama Wali,No HP Wali,Email Wali\n" +
      "10928301,Ahmad Fauzi,Budi Fauzi,081234567890,budi@example.com\n" +
      "10928302,Siti Nurhaliza,Rahmat Hidayat,081298765432,rahmat@example.com";
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'template_siswa_komite.csv');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const downloadJSONTemplate = () => {
    const jsonContent = JSON.stringify([
      {
        "studentId": "10928301",
        "name": "Ahmad Fauzi",
        "parentsName": "Budi Fauzi",
        "parentsPhone": "081234567890",
        "parentsEmail": "budi@example.com"
      },
      {
        "studentId": "10928302",
        "name": "Siti Nurhaliza",
        "parentsName": "Rahmat Hidayat",
        "parentsPhone": "081298765432",
        "parentsEmail": "rahmat@example.com"
      }
    ], null, 2);
    const blob = new Blob([jsonContent], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', 'template_siswa_komite.json');
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const handleQuickFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const reader = new FileReader();

    reader.onload = async (event) => {
      try {
        const content = event.target?.result as string;
        if (!content) return;

        let parsedData: Array<{
          studentId: string;
          name: string;
          parentsName: string;
          parentsPhone: string;
          parentsEmail: string;
        }> = [];

        if (fileName.endsWith('.json')) {
          const jsonData = JSON.parse(content);
          const list = Array.isArray(jsonData) 
            ? jsonData 
            : (jsonData.students || jsonData.data || jsonData.siswa || []);

          parsedData = list.map((item: any) => ({
            studentId: String(item.studentId || item.nisn || item.id || '').trim(),
            name: String(item.name || item.nama || item.studentName || item.namaSiswa || '').trim(),
            parentsName: String(item.parentsName || item.namaWali || item.wali || item.orangTua || '').trim(),
            parentsPhone: String(item.parentsPhone || item.noHp || item.phone || item.hp || item.telepon || item.no_hp || '').trim(),
            parentsEmail: String(item.parentsEmail || item.email || item.emailWali || '').trim(),
          })).filter((x: any) => x.studentId || x.name);
        } else {
          const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          let startIndex = 0;
          if (lines.length > 0) {
            const firstLower = lines[0].toLowerCase();
            if (firstLower.includes('nisn') || firstLower.includes('nama') || firstLower.includes('student') || firstLower.includes('wali')) {
              startIndex = 1;
            }
          }

          for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i];
            let parts: string[] = [];
            if (line.includes(';')) parts = line.split(';');
            else if (line.includes('\t')) parts = line.split('\t');
            else parts = line.split(',');

            const cleanParts = parts.map(p => p.replace(/^["']|["']$/g, '').trim());
            if (cleanParts.some(p => p.length > 0)) {
              parsedData.push({
                studentId: cleanParts[0] || '',
                name: cleanParts[1] || '',
                parentsName: cleanParts[2] || '',
                parentsPhone: cleanParts[3] || '',
                parentsEmail: cleanParts[4] || '',
              });
            }
          }
        }

        if (parsedData.length === 0) {
          alert("Tidak ada data siswa valid dalam file.");
          return;
        }

        await handleQuickImportStudents(parsedData);
      } catch (err) {
        console.error("Error file upload:", err);
        alert("Gagal membaca file. Pastikan format CSV / JSON valid.");
      }
    };

    reader.readAsText(file);
    e.target.value = '';
  };

  const handleQuickPasteImport = async () => {
    if (!qPasteText.trim()) {
      alert("Silakan tempel data terlebih dahulu.");
      return;
    }

    const lines = qPasteText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const parsedData = lines.map(line => {
      let parts: string[] = [];
      if (line.includes('\t')) parts = line.split('\t');
      else if (line.includes(';')) parts = line.split(';');
      else parts = line.split(',');

      const p = parts.map(x => x.trim());
      return {
        studentId: p[0] || '',
        name: p[1] || '',
        parentsName: p[2] || '',
        parentsPhone: p[3] || '',
        parentsEmail: p[4] || '',
      };
    }).filter(x => x.studentId || x.name);

    if (parsedData.length === 0) {
      alert("Format teks tidak terbaca.");
      return;
    }

    await handleQuickImportStudents(parsedData);
  };

  // Form State
  const [inputClassName, setInputClassName] = useState('');
  const [inputGradeLevel, setInputGradeLevel] = useState('7');
  const [inputTeacher, setInputTeacher] = useState('');
  const [inputKorlas, setInputKorlas] = useState('');

  // Editing state
  const [editingClassName, setEditingClassName] = useState<string | null>(null);

  // Dynamically derive unique grade levels from class names
  const availableGradeLevels = useMemo(() => {
    const levelsSet = new Set<string>();
    classes.forEach(c => {
      const match = c.match(/^(Kelas\s+\d+|Tingkat\s+\d+|\d+)/i);
      if (match) {
        levelsSet.add(match[1]);
      } else {
        const firstWord = c.split(/[\s-]+/)[0];
        if (firstWord) levelsSet.add(firstWord);
      }
    });
    return Array.from(levelsSet).sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
  }, [classes]);

  // Filtered list of classes
  const filteredClasses = classes.filter(cls => {
    const details = classDetailsMap[cls] || {};
    const matchesSearch = cls.toLowerCase().includes(searchQuery.toLowerCase()) ||
      (details.teacher || '').toLowerCase().includes(searchQuery.toLowerCase()) ||
      (details.korlas || '').toLowerCase().includes(searchQuery.toLowerCase());
    
    if (gradeFilter === 'All') return matchesSearch;
    return matchesSearch && cls.toLowerCase().includes(gradeFilter.toLowerCase());
  });

  // Calculate statistics per class
  const getClassStats = (className: string) => {
    const classStudents = students.filter(s => s.classId === className);
    const classBills = bills.filter(b => b.studentClass === className);
    
    const totalBillsRequired = classBills.reduce((acc, b) => acc + (b.amountRequired || 0), 0);
    const totalBillsPaid = classBills.reduce((acc, b) => acc + (b.amountPaid || 0), 0);
    const paidCount = classBills.filter(b => b.status === 'paid').length;
    const unpaidCount = classBills.filter(b => b.status === 'unpaid').length;
    
    const percentagePaid = totalBillsRequired > 0 
      ? Math.round((totalBillsPaid / totalBillsRequired) * 100) 
      : 0;

    return {
      studentCount: classStudents.length,
      totalBillsRequired,
      totalBillsPaid,
      paidCount,
      unpaidCount,
      percentagePaid,
      students: classStudents,
      bills: classBills
    };
  };

  // Handle Submit New Class
  const handleCreateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputClassName.trim()) {
      alert("Nama kelas tidak boleh kosong!");
      return;
    }
    const cleanName = inputClassName.trim();
    if (classes.includes(cleanName)) {
      alert("Nama kelas ini sudah terdaftar!");
      return;
    }

    try {
      if (onAddClass) {
        await onAddClass(cleanName);
      } else {
        await setDoc(doc(db, 'classes', cleanName), {
          name: cleanName,
          createdAt: new Date().toISOString()
        });
      }

      if (inputTeacher || inputKorlas) {
        updateClassDetails(cleanName, inputTeacher.trim(), inputKorlas.trim());
      }

      alert(`Kelas "${cleanName}" berhasil ditambahkan!`);
      setInputClassName('');
      setInputTeacher('');
      setInputKorlas('');
      setShowAddModal(false);
    } catch (err) {
      console.error("Gagal menambahkan kelas:", err);
      alert("Terjadi kesalahan saat menambahkan kelas.");
    }
  };

  // Handle Edit Class Details
  const handleOpenEditModal = (cls: string) => {
    setEditingClassName(cls);
    setInputClassName(cls);
    setInputTeacher(classDetailsMap[cls]?.teacher || '');
    setInputKorlas(classDetailsMap[cls]?.korlas || '');
    setShowEditModal(true);
  };

  const handleUpdateClass = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingClassName) return;

    const newName = inputClassName.trim();
    if (!newName) {
      alert("Nama kelas tidak boleh kosong!");
      return;
    }

    try {
      // 1. Update metadata locally
      updateClassDetails(newName, inputTeacher.trim(), inputKorlas.trim());

      // 2. If class name changed
      if (newName !== editingClassName) {
        if (classes.includes(newName)) {
          alert("Nama kelas tujuan sudah ada!");
          return;
        }

        try {
          const batch = writeBatch(db);
          
          // Delete old doc & create new doc
          batch.delete(doc(db, 'classes', editingClassName));
          batch.set(doc(db, 'classes', newName), {
            name: newName,
            teacher: inputTeacher.trim(),
            korlas: inputKorlas.trim(),
            updatedAt: new Date().toISOString()
          });

          // Update enrolled students
          const enrolledStudents = students.filter(s => s.classId === editingClassName);
          enrolledStudents.forEach(s => {
            batch.update(doc(db, 'students', s.id), { classId: newName });
          });

          // Update student bills
          const enrolledBills = bills.filter(b => b.studentClass === editingClassName);
          enrolledBills.forEach(b => {
            batch.update(doc(db, 'student_bills', b.id), { studentClass: newName });
          });

          await batch.commit();
        } catch (fErr) {
          console.warn("Firestore batch edit class warning:", fErr);
        }

        // Clean up old metadata key if name changed
        const updatedDetails = { ...classDetailsMap };
        delete updatedDetails[editingClassName];
        updatedDetails[newName] = { teacher: inputTeacher.trim(), korlas: inputKorlas.trim() };
        setClassDetailsMap(updatedDetails);
        localStorage.setItem('classDetailsMap', JSON.stringify(updatedDetails));

        if (onEditClass) {
          await onEditClass(editingClassName, newName);
        }

        alert(`Kelas "${editingClassName}" berhasil diubah menjadi "${newName}"!`);
      } else {
        // Name didn't change, update teacher / korlas in Firestore
        try {
          await setDoc(doc(db, 'classes', newName), {
            name: newName,
            teacher: inputTeacher.trim(),
            korlas: inputKorlas.trim(),
            updatedAt: new Date().toISOString()
          }, { merge: true });
        } catch (fErr) {
          console.warn("Firestore setDoc update class warning:", fErr);
        }

        alert(`Detail kelas "${newName}" berhasil diperbarui!`);
      }

      setShowEditModal(false);
      setEditingClassName(null);
    } catch (err) {
      console.error("Gagal memperbarui kelas:", err);
      alert("Gagal memperbarui data kelas.");
    }
  };

  // Handle Delete Class
  const handleDeleteClass = async (className: string) => {
    const stats = getClassStats(className);
    if (stats.studentCount > 0) {
      const confirmDelete = window.confirm(
        `Kelas "${className}" saat ini memiliki ${stats.studentCount} siswa terdaftar.\n\nApakah Anda yakin ingin menghapus kelas ini? Siswa yang terdaftar akan dilepas status kelasnya.`
      );
      if (!confirmDelete) return;
    } else {
      if (!window.confirm(`Apakah Anda yakin ingin menghapus kelas "${className}"?`)) {
        return;
      }
    }

    try {
      // 1. Delete class doc from Firestore
      try {
        await deleteDoc(doc(db, 'classes', className));
      } catch (fErr) {
        console.warn("Firestore deleteDoc class warning:", fErr);
      }

      // 2. Unassign students if any
      if (stats.studentCount > 0) {
        try {
          const batch = writeBatch(db);
          const enrolledStudents = students.filter(s => s.classId === className);
          enrolledStudents.forEach(s => {
            batch.update(doc(db, 'students', s.id), { classId: 'Tanpa Kelas' });
          });
          await batch.commit();
        } catch (sErr) {
          console.warn("Firestore unassign students warning:", sErr);
        }
      }

      // 3. Clean up metadata
      const updatedDetails = { ...classDetailsMap };
      delete updatedDetails[className];
      setClassDetailsMap(updatedDetails);
      localStorage.setItem('classDetailsMap', JSON.stringify(updatedDetails));

      // 4. Trigger parent callback
      if (onDeleteClass) {
        await onDeleteClass(className);
      }

      alert(`Kelas "${className}" berhasil dihapus.`);
    } catch (err) {
      console.error("Gagal menghapus kelas:", err);
      alert("Gagal menghapus kelas.");
    }
  };

  // Total Summary Stats
  const totalStudentsInYear = students.length;
  const totalClassesCount = classes.length;
  const avgStudentsPerClass = totalClassesCount > 0 ? Math.round(totalStudentsInYear / totalClassesCount) : 0;

  return (
    <div className="space-y-6">
      
      {/* HEADER BAR */}
      <div className="bg-white/90 backdrop-blur-xs rounded-3xl p-6 shadow-xs flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div className="space-y-1 text-left">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-extrabold text-[#003049] uppercase tracking-widest bg-[#fdf0d5] px-2.5 py-1 rounded-full shadow-2xs">
              TA {selectedAcademicYear}
            </span>
            <span className="text-xs font-bold text-slate-500">• Pemetaan Organisasi Komite Sekolah</span>
          </div>
          <h2 className="text-xl font-black text-[#003049] tracking-tight flex items-center gap-2">
            <Building2 className="h-6 w-6 text-[#003049]" />
            Pemetaan Kelas & Korlas Komite
          </h2>
          <p className="text-xs text-slate-500 leading-relaxed max-w-xl font-medium">
            Atur tingkat kelas binaan, perwakilan Koordinator Kelas (Korlas) orang tua, serta pantau distribusi siswa dan persentase realisasi iuran gotong royong per kelas untuk keberlangsungan program Komite.
          </p>
        </div>

        {userRole === 'admin' && (
          <button
            onClick={() => {
              setInputClassName('');
              setInputTeacher('');
              setInputKorlas('');
              setShowAddModal(true);
            }}
            className="bg-gradient-to-r from-[#003049] to-[#669bbc] text-white font-extrabold text-xs px-4 py-2.5 rounded-2xl transition-all shadow-xs flex items-center gap-2 cursor-pointer shrink-0 hover:opacity-95"
          >
            <Plus className="h-4 w-4" />
            Tambah Kelas Baru
          </button>
        )}
      </div>

      {/* SUMMARY STAT CARDS */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-white via-[#f7fafc] to-[#e6f0f6] rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-xs flex items-center justify-between transition-all hover:shadow-sm">
          <div className="space-y-0.5 text-left flex-1 min-w-0 pr-2">
            <span className="text-xs font-semibold text-[#003049]/70 tracking-wide block truncate">Total Roster Kelas</span>
            <span className="text-xl sm:text-2xl font-black text-[#003049] block font-mono truncate">{totalClassesCount} <span className="text-xs font-semibold text-slate-400">Kelas</span></span>
          </div>
          <div className="h-10 w-10 sm:h-11 sm:w-11 bg-[#003049]/10 rounded-2xl flex items-center justify-center text-[#003049] shrink-0 shadow-2xs">
            <Building2 className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-white via-[#fdf0d5]/30 to-[#f0fdf4] rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-xs flex items-center justify-between transition-all hover:shadow-sm">
          <div className="space-y-0.5 text-left flex-1 min-w-0 pr-2">
            <span className="text-xs font-semibold text-emerald-800/80 tracking-wide block truncate">Siswa Terdaftar (TA)</span>
            <span className="text-xl sm:text-2xl font-black text-emerald-700 block font-mono truncate">{totalStudentsInYear} <span className="text-xs font-semibold text-slate-400">Anak</span></span>
          </div>
          <div className="h-10 w-10 sm:h-11 sm:w-11 bg-emerald-100/80 rounded-2xl flex items-center justify-center text-emerald-700 shrink-0 shadow-2xs">
            <Users className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-2xs flex items-center justify-between transition-all hover:shadow-sm">
          <div className="space-y-0.5 text-left flex-1 min-w-0 pr-2">
            <span className="text-xs font-semibold text-slate-500 tracking-wide block truncate">Rata-Rata per Kelas</span>
            <span className="text-xl sm:text-2xl font-black text-slate-900 block font-mono truncate">~{avgStudentsPerClass} <span className="text-xs font-semibold text-slate-400">Siswa</span></span>
          </div>
          <div className="h-10 w-10 sm:h-11 sm:w-11 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 shrink-0">
            <GraduationCap className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl sm:rounded-3xl p-4 sm:p-5 shadow-2xs flex items-center justify-between transition-all hover:shadow-sm">
          <div className="space-y-0.5 text-left flex-1 min-w-0 pr-2">
            <span className="text-xs font-semibold text-slate-500 tracking-wide block truncate">Total Piutang Iuran</span>
            <span 
              className="text-base sm:text-lg lg:text-xl font-black text-purple-700 block font-mono truncate"
              title={formatIDR(bills.reduce((acc, b) => acc + (b.amountRequired - b.amountPaid), 0))}
            >
              {formatIDR(bills.reduce((acc, b) => acc + (b.amountRequired - b.amountPaid), 0))}
            </span>
          </div>
          <div className="h-10 w-10 sm:h-11 sm:w-11 bg-purple-50 rounded-2xl flex items-center justify-center text-purple-600 shrink-0">
            <DollarSign className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* FILTER & SEARCH CONTROL BAR */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
          
          {/* Search Bar */}
          <div className="relative flex-1 min-w-[200px] max-w-md">
            <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400 pointer-events-none">
              <Search className="h-4 w-4" />
            </span>
            <input
              type="text"
              placeholder="Cari nama kelas, wali kelas, atau korlas..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-slate-50 border border-slate-200/80 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 rounded-xl pl-10 pr-8 py-2 text-xs transition-all outline-none text-slate-800 placeholder:text-slate-400 font-medium"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-600 cursor-pointer"
                title="Hapus pencarian"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            )}
          </div>

          {/* Controls: View Mode Toggle */}
          <div className="flex items-center gap-2.5 shrink-0">
            {/* View Mode Toggle */}
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0">
              <button
                type="button"
                onClick={() => setViewMode('grid')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center ${
                  viewMode === 'grid' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Tampilan Kartu Grid"
              >
                <LayoutGrid className="h-4 w-4" />
              </button>
              <button
                type="button"
                onClick={() => setViewMode('table')}
                className={`p-1.5 rounded-lg transition-all cursor-pointer flex items-center justify-center ${
                  viewMode === 'table' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
                }`}
                title="Tampilan Tabel Rincian"
              >
                <List className="h-4 w-4" />
              </button>
            </div>
          </div>
        </div>

        {/* Quick Pills for Grade Level */}
        {availableGradeLevels.length > 0 && (
          <div className="flex items-center gap-1.5 pt-1 overflow-x-auto scrollbar-none text-xs border-t border-slate-100/80">
            <span className="text-[11px] font-bold text-slate-400 shrink-0">Akses Cepat:</span>
            <button
              type="button"
              onClick={() => setGradeFilter('All')}
              className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer shrink-0 ${
                gradeFilter === 'All'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Semua
            </button>
            {availableGradeLevels.map(grade => (
              <button
                key={grade}
                type="button"
                onClick={() => setGradeFilter(grade)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-bold transition-all cursor-pointer shrink-0 ${
                  gradeFilter === grade
                    ? 'bg-indigo-600 text-white shadow-2xs'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {grade}
              </button>
            ))}
          </div>
        )}

        {/* Active Filter Banner & Reset */}
        {(searchQuery || gradeFilter !== 'All') && (
          <div className="flex items-center justify-between text-xs text-indigo-900 bg-indigo-50/70 px-3.5 py-2 rounded-xl border border-indigo-100 font-medium">
            <div className="flex items-center gap-2 min-w-0">
              <span className="h-2 w-2 rounded-full bg-indigo-600 animate-pulse shrink-0"></span>
              <span className="truncate">
                Menampilkan <strong>{filteredClasses.length}</strong> dari {classes.length} kelas
                {searchQuery && <> dengan kata kunci "<strong>{searchQuery}</strong>"</>}
                {gradeFilter !== 'All' && <> di <strong>{gradeFilter}</strong></>}
              </span>
            </div>
            <button
              type="button"
              onClick={() => { setSearchQuery(''); setGradeFilter('All'); }}
              className="text-xs font-bold text-indigo-700 hover:text-indigo-900 hover:underline cursor-pointer shrink-0 ml-2"
            >
              Reset Filter
            </button>
          </div>
        )}
      </div>

      {/* CLASS GRID OR TABLE VIEW */}
      {filteredClasses.length === 0 ? (
        <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center space-y-3">
          <Building2 className="h-10 w-10 text-slate-300 mx-auto" />
          <h3 className="text-sm font-bold text-slate-700">Tidak Ada Kelas Ditemukan</h3>
          <p className="text-xs text-slate-400">Coba ubah kata kunci pencarian atau tambahkan kelas baru.</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {filteredClasses.map(cls => {
            const stats = getClassStats(cls);
            const teacher = classDetailsMap[cls]?.teacher || 'Belum diatur';
            const korlas = classDetailsMap[cls]?.korlas || 'Belum ditunjuk';

            return (
              <div 
                key={cls}
                className="bg-white border border-slate-200 rounded-2xl p-5 sm:p-6 shadow-2xs hover:shadow-md transition-all flex flex-col justify-between space-y-5 min-w-0"
              >
                {/* Card Top Header */}
                <div className="space-y-3 min-w-0">
                  <div className="flex items-start justify-between gap-3 min-w-0">
                    <div className="space-y-1 text-left min-w-0 flex-1">
                      <span className="text-xs font-black text-indigo-700 uppercase tracking-wider bg-indigo-50 px-3 py-1 rounded-lg border border-indigo-100 inline-flex items-center whitespace-nowrap shrink-0">
                        {cls}
                      </span>
                      <h3 className="text-lg font-extrabold text-slate-900 truncate" title={cls}>{cls}</h3>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
                      {userRole === 'admin' && (
                        <>
                          <button
                            onClick={() => handleOpenEditModal(cls)}
                            title="Edit Detail Kelas & Korlas"
                            aria-label={`Edit ${cls}`}
                            className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-xl transition-all cursor-pointer shadow-3xs hover:scale-105 active:scale-95"
                          >
                            <Edit2 className="h-3.5 w-3.5" />
                          </button>
                          <button
                            onClick={() => handleDeleteClass(cls)}
                            title="Hapus Kelas"
                            aria-label={`Hapus ${cls}`}
                            className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-xl transition-all cursor-pointer shadow-3xs hover:scale-105 active:scale-95"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Teacher & Korlas Meta */}
                  <div className="text-left space-y-2 pt-1 text-xs text-slate-600 bg-slate-50/80 p-3 rounded-xl border border-slate-200/70">
                    <div className="flex items-center gap-2 min-w-0">
                      <User className="h-4 w-4 text-slate-400 shrink-0" />
                      <span className="text-slate-500 font-medium shrink-0">Wali:</span>
                      <strong className="text-slate-800 font-bold truncate" title={teacher}>{teacher}</strong>
                    </div>
                    <div className="flex items-center gap-2 pt-1.5 border-t border-slate-200/60 min-w-0">
                      <Users className="h-4 w-4 text-indigo-500 shrink-0" />
                      <span className="text-slate-500 font-medium shrink-0">Korlas:</span>
                      <strong className="text-slate-800 font-bold truncate" title={korlas}>{korlas}</strong>
                    </div>
                  </div>
                </div>

                {/* Progress Bar & Collection Stats */}
                <div className="bg-slate-50/90 border border-slate-200/80 p-4 rounded-xl space-y-3.5 text-left min-w-0">
                  <div className="flex items-center justify-between gap-2 min-w-0">
                    <span className="font-extrabold text-slate-800 text-xs sm:text-sm flex items-center gap-1.5 shrink-0">
                      <Users className="h-4 w-4 text-indigo-600" />
                      {stats.studentCount} Siswa
                    </span>
                    <span className={`text-xs font-black px-3 py-1 rounded-full shrink-0 border shadow-3xs ${
                      stats.percentagePaid >= 80 ? 'bg-emerald-100 text-emerald-800 border-emerald-300' :
                      stats.percentagePaid >= 50 ? 'bg-amber-100 text-amber-800 border-amber-300' : 'bg-rose-100 text-rose-800 border-rose-300'
                    }`}>
                      {stats.percentagePaid}% Terkumpul
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-slate-200/80 h-2.5 rounded-full overflow-hidden p-0.5 border border-slate-200/40">
                    <div 
                      className={`h-full rounded-full transition-all duration-500 ${
                        stats.percentagePaid >= 80 ? 'bg-emerald-500' :
                        stats.percentagePaid >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                      }`}
                      style={{ width: `${Math.min(100, stats.percentagePaid)}%` }}
                    />
                  </div>

                  {/* Financial Metrics in Full-Width Stacked Rows (NO TRUNCATION) */}
                  <div className="pt-2 border-t border-slate-200/70 space-y-2 text-xs">
                    <div className="flex items-center justify-between gap-3 bg-white px-3.5 py-2.5 rounded-xl border border-slate-200/80 shadow-3xs">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider shrink-0">Iuran Masuk</span>
                      <span className="font-black font-mono text-emerald-700 text-xs sm:text-sm text-right shrink-0">
                        {formatIDR(stats.totalBillsPaid)}
                      </span>
                    </div>
                    <div className="flex items-center justify-between gap-3 bg-white px-3.5 py-2.5 rounded-xl border border-slate-200/80 shadow-3xs">
                      <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider shrink-0">Target Total</span>
                      <span className="font-extrabold font-mono text-slate-700 text-xs sm:text-sm text-right shrink-0">
                        {formatIDR(stats.totalBillsRequired)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Card Action Footer */}
                <button
                  onClick={() => setSelectedClassForRoster(cls)}
                  className="w-full py-3 px-4 bg-indigo-50/80 hover:bg-indigo-100 border border-indigo-200/80 text-indigo-700 font-extrabold text-xs rounded-xl transition-all flex items-center justify-between gap-2 cursor-pointer shadow-3xs hover:shadow-2xs active:scale-[0.99]"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <Users className="h-4 w-4 text-indigo-600 shrink-0" />
                    <span>Lihat Daftar Siswa ({stats.studentCount})</span>
                  </div>
                  <ChevronRight className="h-4 w-4 text-indigo-500 shrink-0" />
                </button>

              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="bg-white rounded-2xl overflow-hidden shadow-2xs">
          <div className="w-full overflow-x-auto">
            <table className="w-full text-xs text-left text-slate-600">
              <thead className="bg-[#f8fafc] text-[10px] text-slate-500 uppercase tracking-widest font-extrabold">
                <tr>
                  <th className="py-3 px-4">Nama Kelas</th>
                  <th className="py-3 px-4">Wali Kelas</th>
                  <th className="py-3 px-4">Korlas</th>
                  <th className="py-3 px-4 text-center">Jumlah Siswa</th>
                  <th className="py-3 px-4">Capaian Iuran</th>
                  <th className="py-3 px-4 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="bg-white">
                {filteredClasses.map(cls => {
                  const stats = getClassStats(cls);
                  const teacher = classDetailsMap[cls]?.teacher || '-';
                  const korlas = classDetailsMap[cls]?.korlas || '-';

                  return (
                    <tr key={cls} className="hover:bg-slate-50/80 border-b border-slate-100/80 transition-colors">
                      <td className="py-3 px-4 font-extrabold text-slate-900">
                        {cls}
                      </td>
                      <td className="py-3 px-4 text-slate-700 font-medium">
                        {teacher}
                      </td>
                      <td className="py-3 px-4 text-slate-700 font-medium">
                        {korlas}
                      </td>
                      <td className="py-3 px-4 text-center font-bold font-mono text-slate-900">
                        {stats.studentCount} Siswa
                      </td>
                      <td className="py-3 px-4">
                        <div className="space-y-1 max-w-xs">
                          <div className="flex justify-between text-[10px] font-bold">
                            <span className="text-slate-600">{formatIDR(stats.totalBillsPaid)}</span>
                            <span className="text-indigo-600">{stats.percentagePaid}%</span>
                          </div>
                          <div className="w-full bg-slate-100 h-1.5 rounded-full overflow-hidden">
                            <div 
                              className="bg-indigo-600 h-full rounded-full" 
                              style={{ width: `${Math.min(100, stats.percentagePaid)}%` }}
                            />
                          </div>
                        </div>
                      </td>
                      <td className="py-4 px-6 text-center">
                        <div className="flex items-center justify-center gap-2">
                          <button
                            onClick={() => setSelectedClassForRoster(cls)}
                            title="Lihat Roster & Status Siswa"
                            className="px-3 py-1.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/80 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 shadow-3xs hover:shadow-2xs hover:scale-102 active:scale-95"
                          >
                            <Users className="h-3.5 w-3.5 shrink-0" />
                            <span>Roster Siswa</span>
                          </button>
                          {userRole === 'admin' && (
                            <>
                              <button
                                onClick={() => handleOpenEditModal(cls)}
                                title="Edit Detail Kelas & Korlas"
                                aria-label={`Edit ${cls}`}
                                className="p-1.5 text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 rounded-xl transition-all cursor-pointer shadow-3xs hover:scale-105 active:scale-95"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                              </button>
                              <button
                                onClick={() => handleDeleteClass(cls)}
                                title="Hapus Kelas"
                                aria-label={`Hapus ${cls}`}
                                className="p-1.5 text-slate-500 hover:text-rose-600 hover:bg-rose-50 border border-slate-200 hover:border-rose-200 rounded-xl transition-all cursor-pointer shadow-3xs hover:scale-105 active:scale-95"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* MODAL: TAMBAH KELAS BARU */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-5 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Building2 className="h-5 w-5 text-indigo-600" />
                Tambah Kelas Baru
              </h3>
              <button
                onClick={() => setShowAddModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateClass} className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Nama Kelas *
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Kelas 7-C, Kelas 8-D, Kelas 9-E..."
                  value={inputClassName}
                  onChange={(e) => setInputClassName(e.target.value)}
                  required
                  className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Nama Wali Kelas (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Dra. Endang Rahayu M.Pd."
                  value={inputTeacher}
                  onChange={(e) => setInputTeacher(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 rounded-xl px-3.5 py-2.5 text-xs outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Koordinator Kelas (Korlas) Orang Tua (Opsional)
                </label>
                <input
                  type="text"
                  placeholder="Contoh: Ibu Anita S. (Perwakilan Wali Murid)"
                  value={inputKorlas}
                  onChange={(e) => setInputKorlas(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 rounded-xl px-3.5 py-2.5 text-xs outline-none"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-xl font-bold text-xs cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs cursor-pointer shadow-xs"
                >
                  Simpan Kelas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: EDIT KELAS */}
      {showEditModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 space-y-5 shadow-xl border border-slate-100 animate-in fade-in zoom-in-95 duration-200">
            <div className="flex items-center justify-between border-b border-slate-100 pb-3">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Edit2 className="h-5 w-5 text-indigo-600" />
                Edit Detail Kelas
              </h3>
              <button
                onClick={() => setShowEditModal(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg hover:bg-slate-100"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleUpdateClass} className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Nama Kelas
                </label>
                <input
                  type="text"
                  value={inputClassName}
                  onChange={(e) => setInputClassName(e.target.value)}
                  required
                  className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 rounded-xl px-3.5 py-2.5 text-xs font-bold outline-none"
                />
                <span className="text-[10px] text-slate-400 mt-1 block">
                  Mengubah nama kelas akan memperbarui data seluruh siswa terdaftar secara otomatis.
                </span>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Wali Kelas
                </label>
                <input
                  type="text"
                  placeholder="Nama Wali Kelas..."
                  value={inputTeacher}
                  onChange={(e) => setInputTeacher(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 rounded-xl px-3.5 py-2.5 text-xs outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                  Koordinator Kelas (Korlas)
                </label>
                <input
                  type="text"
                  placeholder="Nama Koordinator Kelas (Perwakilan Wali Murid)..."
                  value={inputKorlas}
                  onChange={(e) => setInputKorlas(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 rounded-xl px-3.5 py-2.5 text-xs outline-none"
                />
              </div>

              <div className="pt-3 flex justify-end gap-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className="px-4 py-2 border border-slate-200 text-slate-600 bg-white hover:bg-slate-50 rounded-xl font-bold text-xs cursor-pointer"
                >
                  Batal
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-xs cursor-pointer shadow-xs"
                >
                  Perbarui Kelas
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL / DRAWER: DAFTAR SISWA DALAM KELAS */}
      {selectedClassForRoster && (() => {
        const activeClassStudents = students.filter(s => s.classId === selectedClassForRoster);
        const keysSeen = new Set<string>();
        let currentDupCount = 0;
        activeClassStudents.forEach(s => {
          const k = (s.studentId?.trim() || s.name?.trim() || '').toLowerCase();
          if (k) {
            if (keysSeen.has(k)) currentDupCount++;
            else keysSeen.add(k);
          }
        });

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
            <div className="bg-white rounded-3xl max-w-3xl w-full p-6 sm:p-8 shadow-2xl max-h-[90vh] flex flex-col animate-in fade-in zoom-in-95 duration-200 my-auto">
              
              {/* Modal Header */}
              <div className="flex items-center justify-between pb-4 shrink-0 border-b border-slate-100/80">
                <div className="space-y-1 text-left">
                  <span className="text-[10px] font-extrabold text-indigo-700 uppercase tracking-widest bg-indigo-50/80 px-3 py-1 rounded-full shadow-2xs">
                    Roster Siswa • TA {selectedAcademicYear}
                  </span>
                  <h3 className="text-xl font-black text-slate-900 flex items-center gap-2 pt-1">
                    <Users className="h-5 w-5 text-indigo-600" />
                    Daftar Siswa {selectedClassForRoster}
                  </h3>
                </div>
                
                <div className="flex items-center gap-2">
                  {currentDupCount > 0 && (
                    <button
                      type="button"
                      onClick={handleCleanupDuplicates}
                      className="px-3.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-md shadow-amber-200 cursor-pointer animate-pulse"
                      title="Hapus data siswa ganda/duplikat"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Hapus {currentDupCount} Duplikat
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => setShowQuickAddStudent(!showQuickAddStudent)}
                    className="px-3.5 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 shadow-sm shadow-indigo-100 cursor-pointer"
                  >
                    <UserPlus className="h-4 w-4" />
                    {showQuickAddStudent ? 'Tutup Form' : '+ Tambah Siswa'}
                  </button>

                  <button
                    onClick={() => { setSelectedClassForRoster(null); resetQuickAddForm(); }}
                    className="text-slate-400 hover:text-slate-700 p-2 rounded-2xl hover:bg-slate-100/80 transition-all cursor-pointer"
                  >
                    <X className="h-5 w-5" />
                  </button>
                </div>
              </div>

              {/* Scrollable Modal Content */}
              <div className="flex-1 overflow-y-auto space-y-4 my-2 pr-1 min-h-0 text-left">
                {/* Duplicate Alert Banner */}
                {currentDupCount > 0 && (
                  <div className="bg-amber-50/90 rounded-2xl p-4 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-amber-900 shrink-0 shadow-xs">
                    <div className="flex items-center gap-2.5">
                      <AlertCircle className="h-5 w-5 text-amber-600 shrink-0" />
                      <div>
                        <p className="font-bold text-amber-900">Terdeteksi {currentDupCount} Data Siswa Duplikat!</p>
                        <p className="text-[11px] text-amber-700">Disebabkan re-upload file data. Klik tombol di kanan untuk membersihkannya secara otomatis.</p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={handleCleanupDuplicates}
                      className="px-3.5 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl font-bold text-xs shrink-0 cursor-pointer transition-all shadow-sm flex items-center gap-1.5 self-end sm:self-auto"
                    >
                      <Trash2 className="h-4 w-4" />
                      Bersihkan Duplikat Sekarang
                    </button>
                  </div>
                )}
              {/* Slide Down Quick Add Form */}
              {showQuickAddStudent && (
                <div className="bg-slate-50/80 rounded-2xl p-4 space-y-4 shrink-0 transition-all text-left shadow-xs">
                  <div className="flex items-center justify-between border-b border-slate-200/80 pb-3">
                    <div className="flex items-center gap-1.5">
                      <button
                        type="button"
                        onClick={() => setAddStudentTab('single')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                          addStudentTab === 'single'
                            ? 'bg-indigo-600 text-white shadow-3xs'
                            : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                        }`}
                      >
                        Input 1-per-1
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddStudentTab('file')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                          addStudentTab === 'file'
                            ? 'bg-emerald-600 text-white shadow-3xs'
                            : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                        }`}
                      >
                        <Upload className="h-3.5 w-3.5" />
                        Upload File (CSV / JSON)
                      </button>
                      <button
                        type="button"
                        onClick={() => setAddStudentTab('paste')}
                        className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1 ${
                          addStudentTab === 'paste'
                            ? 'bg-emerald-600 text-white shadow-3xs'
                            : 'bg-white text-slate-600 hover:bg-slate-100 border border-slate-200'
                        }`}
                      >
                        <Clipboard className="h-3.5 w-3.5" />
                        Tempel Teks Spreadsheet
                      </button>
                    </div>
                    <span className="text-[11px] font-semibold text-indigo-700">
                      Kelas Target: <strong>{selectedClassForRoster}</strong>
                    </span>
                  </div>

                  {/* TAB 1: SINGLE INPUT */}
                  {addStudentTab === 'single' && (
                    <form onSubmit={handleQuickAddSingleStudent} className="space-y-3">
                      <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">NISN Siswa *</label>
                          <input
                            type="text"
                            placeholder="Contoh: 10928301"
                            value={qStudentId}
                            onChange={(e) => setQStudentId(e.target.value)}
                            className="w-full bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3 py-2 text-xs outline-none"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">Nama Lengkap Siswa *</label>
                          <input
                            type="text"
                            placeholder="Contoh: Ahmad Fauzi"
                            value={qName}
                            onChange={(e) => setQName(e.target.value)}
                            className="w-full bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3 py-2 text-xs outline-none"
                            required
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">Nama Wali Murid</label>
                          <input
                            type="text"
                            placeholder="Contoh: Budi Fauzi"
                            value={qParentsName}
                            onChange={(e) => setQParentsName(e.target.value)}
                            className="w-full bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3 py-2 text-xs outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">No. HP / WhatsApp Wali</label>
                          <input
                            type="tel"
                            placeholder="Contoh: 081234567890"
                            value={qParentsPhone}
                            onChange={(e) => setQParentsPhone(e.target.value)}
                            className="w-full bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3 py-2 text-xs outline-none"
                          />
                        </div>
                        <div>
                          <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1">Email Wali</label>
                          <input
                            type="email"
                            placeholder="Contoh: budi@example.com"
                            value={qParentsEmail}
                            onChange={(e) => setQParentsEmail(e.target.value)}
                            className="w-full bg-white border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3 py-2 text-xs outline-none"
                          />
                        </div>
                        <div className="flex items-end justify-end">
                          <button
                            type="submit"
                            className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-2 px-4 rounded-xl shadow-xs transition-all cursor-pointer"
                          >
                            Simpan Siswa Baru
                          </button>
                        </div>
                      </div>
                    </form>
                  )}

                  {/* TAB 2: FILE UPLOAD (CSV / JSON) */}
                  {addStudentTab === 'file' && (
                    <div className="space-y-3">
                      <p className="text-xs text-slate-600">
                        Pilih file format <strong>.CSV</strong> atau <strong>.JSON</strong> dari komputer Anda untuk mengimpor banyak siswa sekaligus ke dalam kelas <strong>{selectedClassForRoster}</strong>.
                      </p>
                      
                      <div className="flex flex-wrap items-center gap-2.5">
                        <input
                          type="file"
                          id="quick-file-input"
                          accept=".csv,.json,text/csv,application/json"
                          onChange={handleQuickFileUpload}
                          className="hidden"
                        />
                        <label
                          htmlFor="quick-file-input"
                          className="px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs flex items-center gap-2 cursor-pointer transition-all"
                        >
                          <Upload className="h-4 w-4" />
                          Pilih File CSV / JSON
                        </label>

                        <button
                          type="button"
                          onClick={downloadCSVTemplate}
                          className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all"
                        >
                          <FileText className="h-3.5 w-3.5 text-emerald-600" />
                          Unduh Template CSV
                        </button>

                        <button
                          type="button"
                          onClick={downloadJSONTemplate}
                          className="px-3.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer transition-all"
                        >
                          <FileCode className="h-3.5 w-3.5 text-amber-600" />
                          Unduh Template JSON
                        </button>
                      </div>

                      {/* JSON Structure Preview Box */}
                      <div className="bg-slate-900 text-slate-100 rounded-xl p-3 text-[11px] font-mono space-y-1.5 overflow-x-auto border border-slate-800 max-h-48 overflow-y-auto">
                        <div className="flex items-center justify-between text-slate-400 border-b border-slate-800 pb-1 text-[10px] uppercase font-sans font-semibold">
                          <span>Contoh Format Struktur File JSON:</span>
                          <span className="text-amber-400">JSON Array</span>
                        </div>
                        <pre className="text-slate-300 leading-relaxed">
{`[
  {
    "studentId": "10928301",
    "name": "Ahmad Fauzi",
    "parentsName": "Budi Fauzi",
    "parentsPhone": "081234567890",
    "parentsEmail": "budi@example.com"
  },
  {
    "studentId": "10928302",
    "name": "Siti Nurhaliza",
    "parentsName": "Rahmat Hidayat",
    "parentsPhone": "081298765432",
    "parentsEmail": "rahmat@example.com"
  }
]`}
                        </pre>
                      </div>
                    </div>
                  )}

                  {/* TAB 3: PASTE TEXT */}
                  {addStudentTab === 'paste' && (
                    <div className="space-y-2">
                      <p className="text-xs text-slate-600">
                        Tempelkan baris data dari Excel / Google Sheets di bawah ini (Format: NISN [Tab] Nama [Tab] Wali [Tab] No HP [Tab] Email):
                      </p>
                      <textarea
                        rows={4}
                        value={qPasteText}
                        onChange={(e) => setQPasteText(e.target.value)}
                        placeholder="10928301	Andi Wijaya	Budi Wijaya	08123456789	andi@example.com"
                        className="w-full bg-white border border-slate-200 rounded-xl p-3 text-xs outline-none font-mono"
                      />
                      <div className="flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={handleQuickPasteImport}
                          className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs cursor-pointer"
                        >
                          Proses & Impor Siswa
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Roster Table */}
              <div className="bg-slate-50/50 rounded-2xl overflow-x-auto scrollbar-thin pb-1 min-h-[200px] shadow-xs">
                {(() => {
                  const classStudents = students.filter(s => s.classId === selectedClassForRoster);
                  if (classStudents.length === 0) {
                    return (
                      <div className="p-10 text-center space-y-3">
                        <Users className="h-8 w-8 text-slate-300 mx-auto" />
                        <div className="space-y-1">
                          <p className="text-xs font-bold text-slate-600">Belum Ada Siswa Terdaftar di {selectedClassForRoster}</p>
                          <p className="text-[11px] text-slate-400">Tambahkan siswa secara langsung atau upload file CSV/JSON di bawah ini.</p>
                        </div>
                        <button
                          type="button"
                          onClick={() => setShowQuickAddStudent(true)}
                          className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs inline-flex items-center gap-1.5 cursor-pointer transition-all"
                        >
                          <UserPlus className="h-4 w-4" />
                          + Tambah Siswa ke {selectedClassForRoster}
                        </button>
                      </div>
                    );
                  }

                  return (
                    <table className="w-full text-xs text-left text-slate-600 min-w-[650px]">
                      <thead className="bg-slate-50 text-[10px] text-slate-500 uppercase tracking-wider font-extrabold sticky top-0">
                        <tr>
                          <th className="py-3 px-4">No</th>
                          <th className="py-3 px-4">NISN</th>
                          <th className="py-3 px-4">Nama Siswa</th>
                          <th className="py-3 px-4">Wali Murid</th>
                          <th className="py-3 px-4">No. Telepon / WA</th>
                          <th className="py-3 px-4 text-center">Status Iuran (Bulan Ini)</th>
                        </tr>
                      </thead>
                      <tbody className="bg-white">
                        {classStudents.map((s, idx) => {
                          const currentMonthBill = bills.find(b => b.studentId === s.id);
                          const isPaid = currentMonthBill?.status === 'paid';

                          return (
                            <tr key={s.id} className="hover:bg-slate-50 border-b border-slate-100/80 transition-colors">
                              <td className="py-3 px-4 text-slate-400 font-mono font-bold">{idx + 1}</td>
                              <td className="py-3 px-4 font-mono font-bold text-slate-800">{s.studentId}</td>
                              <td className="py-3 px-4 font-extrabold text-slate-900">{s.name}</td>
                              <td className="py-3 px-4 text-slate-700">{s.parentsName || '-'}</td>
                              <td className="py-3 px-4 font-mono text-slate-600">{s.parentsPhone || '-'}</td>
                              <td className="py-3 px-4 text-center">
                                {isPaid ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200 whitespace-nowrap shrink-0">
                                    <CheckCircle2 className="h-3 w-3" />
                                    Lunas
                                  </span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => handleOpenPaymentModal(s, currentMonthBill)}
                                    className="inline-flex items-center gap-1 text-[10px] font-bold px-2.5 py-1 rounded-full bg-rose-50 text-rose-700 border border-rose-200 hover:bg-rose-100 hover:border-rose-300 hover:shadow-xs transition-all cursor-pointer active:scale-95 whitespace-nowrap shrink-0"
                                    title="Klik untuk membuka form pembayaran siswa ini"
                                  >
                                    <CheckCircle2 className="h-3 w-3 text-rose-600" />
                                    Belum Lunas
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  );
                })()}
              </div>
            </div>

            {/* Modal Footer */}
            <div className="pt-3 border-t border-slate-100 flex justify-between items-center shrink-0">
              <span className="text-xs text-slate-400">
                Total: <strong className="text-slate-800">{students.filter(s => s.classId === selectedClassForRoster).length} Siswa</strong>
              </span>
              <button
                onClick={() => setSelectedClassForRoster(null)}
                className="px-5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl transition-all cursor-pointer"
              >
                Tutup
              </button>
            </div>

          </div>
        </div>
      );
      })()}

    {/* Modal Form Pembayaran (Triggered from Belum Lunas) */}
    {selectedPaymentStudent && (
      <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-[70] animate-fade-in">
        <div className="bg-white rounded-3xl max-w-md w-full p-6 shadow-2xl space-y-5 border border-slate-100">
          <div className="flex items-center justify-between pb-3 border-b border-slate-100">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 bg-rose-50 text-rose-600 rounded-2xl">
                <CreditCard className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-extrabold text-base text-slate-800">Form Pembayaran Iuran</h3>
                <p className="text-xs text-slate-500 font-medium">Proses pembayaran untuk siswa bersangkutan</p>
              </div>
            </div>
            <button
              onClick={() => setSelectedPaymentStudent(null)}
              className="p-2 text-slate-400 hover:text-slate-600 hover:bg-slate-100 rounded-xl transition-all cursor-pointer"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Student Profile Card */}
          <div className="bg-slate-50 rounded-2xl p-4 space-y-2 border border-slate-200/60">
            <div className="flex justify-between items-start">
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-slate-400 block">Siswa</span>
                <span className="text-sm font-black text-slate-800 block">{selectedPaymentStudent.student.name}</span>
                <span className="text-xs font-mono font-bold text-slate-500">NISN: {selectedPaymentStudent.student.studentId} • {selectedPaymentStudent.student.classId}</span>
              </div>
              <span className="px-2.5 py-1 bg-rose-100 text-rose-800 font-bold text-[10px] rounded-full border border-rose-200">
                Belum Lunas
              </span>
            </div>
            <div className="pt-2 border-t border-slate-200/60 flex justify-between text-xs font-medium text-slate-600">
              <span>Periode: <strong>{selectedPaymentStudent.bill?.period || (getPeriodsForAcademicYear(selectedAcademicYear)[0] || 'Mei 2026')}</strong></span>
              <span>Nominal: <strong className="text-indigo-600">{formatIDR(selectedPaymentStudent.bill?.amountRequired || 150000)}</strong></span>
            </div>
          </div>

          {/* Form Input */}
          <form onSubmit={handleProcessPayment} className="space-y-4">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                Nominal Pembayaran (Rp) <span className="text-rose-500">*</span>
              </label>
              <div className="relative">
                <span className="absolute left-3.5 top-1/2 -translate-y-1/2 font-bold text-xs text-slate-400">Rp</span>
                <input
                  type="number"
                  min="1000"
                  required
                  value={payAmount}
                  onChange={(e) => setPayAmount(Number(e.target.value))}
                  className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 focus:ring-2 focus:ring-indigo-100 rounded-xl pl-10 pr-3 py-2.5 text-sm font-bold text-slate-800 outline-none transition-all"
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Metode Bayar</label>
                <select
                  value={payMethod}
                  onChange={(e) => setPayMethod(e.target.value as any)}
                  className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 outline-none cursor-pointer"
                >
                  <option value="Transfer Bank">Transfer Bank</option>
                  <option value="Cash">Tunai / Cash</option>
                  <option value="E-Wallet">E-Wallet (QRIS/GoPay)</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Tanggal Bayar</label>
                <input
                  type="date"
                  required
                  value={payDate}
                  onChange={(e) => setPayDate(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-xl px-3 py-2.5 text-xs font-bold text-slate-800 outline-none cursor-pointer"
                />
              </div>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">Catatan / Keterangan (Opsional)</label>
              <input
                type="text"
                placeholder="Cth: Lunas via Transfer BCA"
                value={payNote}
                onChange={(e) => setPayNote(e.target.value)}
                className="w-full bg-slate-50 border border-slate-200 focus:bg-white focus:border-indigo-500 rounded-xl px-3.5 py-2 text-xs outline-none text-slate-800"
              />
            </div>

            <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setSelectedPaymentStudent(null)}
                className="px-4 py-2.5 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold text-xs rounded-xl cursor-pointer transition-all"
              >
                Batal
              </button>
              <button
                type="submit"
                disabled={isSubmittingPayment}
                className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl shadow-xs inline-flex items-center gap-2 cursor-pointer transition-all"
              >
                <CheckCircle2 className="h-4 w-4" />
                {isSubmittingPayment ? 'Memproses...' : 'Simpan Pembayaran'}
              </button>
            </div>
          </form>
        </div>
      </div>
    )}

    </div>
  );
}
