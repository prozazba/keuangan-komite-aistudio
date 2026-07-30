import React, { useState } from 'react';
import { db, handleFirestoreError, OperationType, doc, setDoc, deleteDoc, writeBatch } from '../firebase';
import { Student, StudentBill, SchoolClass } from '../types';
import { 
  Plus, Search, Edit2, Trash2, Users, GraduationCap, 
  Building2, CheckCircle2, AlertCircle, X, ChevronRight, 
  ArrowUpDown, Filter, User, Layers, ShieldCheck, DollarSign,
  UserPlus, Upload, Clipboard, FileText, FileCode
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
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-gradient-to-br from-white via-[#f7fafc] to-[#e6f0f6] rounded-3xl p-5 shadow-xs flex items-center justify-between">
          <div className="space-y-0.5 text-left">
            <span className="text-[10px] font-extrabold text-[#003049]/70 uppercase tracking-widest block">Total Roster Kelas</span>
            <span className="text-2xl font-black text-[#003049] block font-mono">{totalClassesCount} <span className="text-xs font-semibold text-slate-400">Kelas</span></span>
          </div>
          <div className="h-11 w-11 bg-[#003049]/10 rounded-2xl flex items-center justify-center text-[#003049] shrink-0 shadow-2xs">
            <Building2 className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-gradient-to-br from-white via-[#fdf0d5]/30 to-[#f0fdf4] rounded-3xl p-5 shadow-xs flex items-center justify-between">
          <div className="space-y-0.5 text-left">
            <span className="text-[10px] font-extrabold text-emerald-800/80 uppercase tracking-widest block">Siswa Terdaftar (TA)</span>
            <span className="text-2xl font-black text-emerald-700 block font-mono">{totalStudentsInYear} <span className="text-xs font-semibold text-slate-400">Anak</span></span>
          </div>
          <div className="h-11 w-11 bg-emerald-100/80 rounded-2xl flex items-center justify-center text-emerald-700 shrink-0 shadow-2xs">
            <Users className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-2xs flex items-center justify-between">
          <div className="space-y-0.5 text-left">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block">Rata-Rata per Kelas</span>
            <span className="text-2xl font-black text-slate-900 block font-mono">~{avgStudentsPerClass} <span className="text-xs font-semibold text-slate-400">Siswa</span></span>
          </div>
          <div className="h-10 w-10 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600 shrink-0">
            <GraduationCap className="h-5 w-5" />
          </div>
        </div>

        <div className="bg-white border border-slate-100 rounded-2xl p-5 shadow-2xs flex items-center justify-between">
          <div className="space-y-0.5 text-left">
            <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block">Total Piutang Iuran</span>
            <span className="text-lg font-black text-slate-900 block font-mono">
              {formatIDR(bills.reduce((acc, b) => acc + (b.amountRequired - b.amountPaid), 0))}
            </span>
          </div>
          <div className="h-10 w-10 bg-purple-50 rounded-xl flex items-center justify-center text-purple-600 shrink-0">
            <DollarSign className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* FILTER & SEARCH CONTROL BAR */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-2xs flex flex-col md:flex-row gap-4 items-center justify-between">
        
        {/* Search Bar */}
        <div className="relative w-full md:max-w-xs">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
            <Search className="h-4 w-4" />
          </span>
          <input
            type="text"
            placeholder="Cari nama kelas atau wali kelas..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-100/80 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 rounded-xl pl-10 pr-4 py-2.5 text-xs transition-all outline-none"
          />
        </div>

        {/* Grade Filter Pills */}
        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto">
          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider hidden sm:inline">Filter Tingkat:</span>
          {['All', 'Kelas 7', 'Kelas 8', 'Kelas 9'].map(grade => (
            <button
              key={grade}
              onClick={() => setGradeFilter(grade)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                gradeFilter === grade 
                  ? 'bg-indigo-600 text-white shadow-xs' 
                  : 'bg-slate-50 hover:bg-slate-100 text-slate-600 border border-slate-100'
              }`}
            >
              {grade === 'All' ? 'Semua Tingkat' : grade}
            </button>
          ))}
        </div>

        {/* View mode toggle */}
        <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl shrink-0">
          <button
            onClick={() => setViewMode('grid')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'grid' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Kartu Grid
          </button>
          <button
            onClick={() => setViewMode('table')}
            className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
              viewMode === 'table' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500 hover:text-slate-900'
            }`}
          >
            Tabel Rincian
          </button>
        </div>

      </div>

      {/* CLASS GRID OR TABLE VIEW */}
      {filteredClasses.length === 0 ? (
        <div className="bg-white border border-slate-100 rounded-2xl p-12 text-center space-y-3">
          <Building2 className="h-10 w-10 text-slate-300 mx-auto" />
          <h3 className="text-sm font-bold text-slate-700">Tidak Ada Kelas Ditemukan</h3>
          <p className="text-xs text-slate-400">Coba ubah kata kunci pencarian atau tambahkan kelas baru.</p>
        </div>
      ) : viewMode === 'grid' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
          {filteredClasses.map(cls => {
            const stats = getClassStats(cls);
            const teacher = classDetailsMap[cls]?.teacher || 'Belum diatur';
            const korlas = classDetailsMap[cls]?.korlas || 'Belum ditunjuk';

            return (
              <div 
                key={cls}
                className="bg-white border border-slate-100 rounded-2xl p-5 shadow-2xs hover:shadow-md transition-all space-y-4 flex flex-col justify-between"
              >
                {/* Card Top Header */}
                <div className="space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="space-y-0.5 text-left">
                      <span className="text-[10px] font-extrabold text-indigo-600 uppercase tracking-widest bg-indigo-50 px-2.5 py-1 rounded-md border border-indigo-100/80">
                        {cls}
                      </span>
                      <h3 className="text-base font-extrabold text-slate-900 pt-1.5 block">{cls}</h3>
                    </div>

                    <div className="flex items-center gap-1.5">
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
                  <div className="text-left space-y-1.5 pt-1 text-xs text-slate-500">
                    <div className="flex items-center gap-1.5">
                      <User className="h-3.5 w-3.5 text-slate-400 shrink-0" />
                      <span className="truncate">Wali Kelas: <strong className="text-slate-700 font-semibold">{teacher}</strong></span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-indigo-500 shrink-0" />
                      <span className="truncate">Koordinator Kelas (Korlas): <strong className="text-slate-700 font-semibold">{korlas}</strong></span>
                    </div>
                  </div>
                </div>

                {/* Progress Bar & Collection Stats */}
                <div className="bg-slate-50 border border-slate-100 p-3.5 rounded-xl space-y-2.5 text-left">
                  <div className="flex justify-between items-center text-xs">
                    <span className="font-bold text-slate-600 flex items-center gap-1.5">
                      <Users className="h-3.5 w-3.5 text-indigo-600" />
                      {stats.studentCount} Siswa
                    </span>
                    <span className={`text-[11px] font-black font-mono px-2 py-0.5 rounded-md ${
                      stats.percentagePaid >= 80 ? 'bg-emerald-100 text-emerald-800' :
                      stats.percentagePaid >= 50 ? 'bg-amber-100 text-amber-800' : 'bg-rose-100 text-rose-800'
                    }`}>
                      {stats.percentagePaid}% Terkumpul
                    </span>
                  </div>

                  {/* Progress bar */}
                  <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                    <div 
                      className={`h-full transition-all duration-500 ${
                        stats.percentagePaid >= 80 ? 'bg-emerald-500' :
                        stats.percentagePaid >= 50 ? 'bg-amber-500' : 'bg-rose-500'
                      }`}
                      style={{ width: `${Math.min(100, stats.percentagePaid)}%` }}
                    />
                  </div>

                  <div className="flex justify-between items-center text-[10px] text-slate-500 pt-0.5 font-medium">
                    <span>Masuk: <strong className="text-slate-900 font-mono">{formatIDR(stats.totalBillsPaid)}</strong></span>
                    <span>Target: <strong className="text-slate-500 font-mono">{formatIDR(stats.totalBillsRequired)}</strong></span>
                  </div>
                </div>

                {/* Card Action Footer */}
                <button
                  onClick={() => setSelectedClassForRoster(cls)}
                  className="w-full py-2 px-3 bg-white hover:bg-indigo-50 border border-slate-200 hover:border-indigo-200 text-indigo-700 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-3xs"
                >
                  <Users className="h-3.5 w-3.5" />
                  Lihat Daftar Siswa Kelas ({stats.studentCount})
                  <ChevronRight className="h-3.5 w-3.5 ml-auto" />
                </button>

              </div>
            );
          })}
        </div>
      ) : (
        /* TABLE VIEW */
        <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-2xs">
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left text-slate-600">
              <thead className="bg-[#f8fafc] border-b border-slate-100 text-[10px] text-slate-500 uppercase tracking-widest font-extrabold">
                <tr>
                  <th className="py-3.5 px-6">Nama Kelas</th>
                  <th className="py-3.5 px-6">Wali Kelas</th>
                  <th className="py-3.5 px-6">Koordinator Kelas (Korlas)</th>
                  <th className="py-3.5 px-6 text-center">Jumlah Siswa</th>
                  <th className="py-3.5 px-6">Capaian Iuran</th>
                  <th className="py-3.5 px-6 text-center">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredClasses.map(cls => {
                  const stats = getClassStats(cls);
                  const teacher = classDetailsMap[cls]?.teacher || '-';
                  const korlas = classDetailsMap[cls]?.korlas || '-';

                  return (
                    <tr key={cls} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-4 px-6 font-extrabold text-slate-900">
                        {cls}
                      </td>
                      <td className="py-4 px-6 text-slate-700 font-medium">
                        {teacher}
                      </td>
                      <td className="py-4 px-6 text-slate-700 font-medium">
                        {korlas}
                      </td>
                      <td className="py-4 px-6 text-center font-bold font-mono text-slate-900">
                        {stats.studentCount} Siswa
                      </td>
                      <td className="py-4 px-6">
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
              <div className="bg-slate-50/50 rounded-2xl overflow-x-auto min-h-[200px] shadow-xs">
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
                    <table className="w-full text-xs text-left text-slate-600">
                      <thead className="bg-slate-50 border-b border-slate-100 text-[10px] text-slate-500 uppercase tracking-wider font-extrabold sticky top-0">
                        <tr>
                          <th className="py-3 px-4">No</th>
                          <th className="py-3 px-4">NISN</th>
                          <th className="py-3 px-4">Nama Siswa</th>
                          <th className="py-3 px-4">Wali Murid</th>
                          <th className="py-3 px-4">No. Telepon / WA</th>
                          <th className="py-3 px-4 text-center">Status Iuran (Bulan Ini)</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {classStudents.map((s, idx) => {
                          const currentMonthBill = bills.find(b => b.studentId === s.id);
                          const isPaid = currentMonthBill?.status === 'paid';

                          return (
                            <tr key={s.id} className="hover:bg-slate-50">
                              <td className="py-3 px-4 text-slate-400 font-mono font-bold">{idx + 1}</td>
                              <td className="py-3 px-4 font-mono font-bold text-slate-800">{s.studentId}</td>
                              <td className="py-3 px-4 font-extrabold text-slate-900">{s.name}</td>
                              <td className="py-3 px-4 text-slate-700">{s.parentsName || '-'}</td>
                              <td className="py-3 px-4 font-mono text-slate-600">{s.parentsPhone || '-'}</td>
                              <td className="py-3 px-4 text-center">
                                <span className={`inline-flex items-center gap-1 text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                  isPaid 
                                    ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' 
                                    : 'bg-rose-50 text-rose-700 border border-rose-200'
                                }`}>
                                  <CheckCircle2 className="h-3 w-3" />
                                  {isPaid ? 'Lunas' : 'Belum Lunas'}
                                </span>
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

    </div>
  );
}
