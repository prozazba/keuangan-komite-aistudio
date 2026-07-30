import React, { useState } from 'react';
import { db, handleFirestoreError, OperationType, collection, doc, deleteDoc, setDoc, updateDoc, writeBatch } from '../firebase';
import { Student, StudentBill, Transaction, Event } from '../types';
import { Plus, Trash2, Edit2, UserPlus, CheckCircle2, Search, Filter, RefreshCw, GraduationCap, X, Mail, Phone, User, Clipboard, AlertCircle, Upload, Download, FileText, FileCode, Eye, CreditCard, Coins, Target, ShieldCheck } from 'lucide-react';
import { getPeriodsForAcademicYear, getDueDateForPeriod, formatIDR } from '../utils';

interface StudentManagerProps {
  students: Student[];
  allStudents: Student[];
  bills: StudentBill[];
  allBills: StudentBill[];
  transactions?: Transaction[];
  events?: Event[];
  classes: string[];
  selectedAcademicYear: string;
  onAddClass?: (newClassName: string) => Promise<void>;
  userRole?: 'admin' | 'operator';
}

export default function StudentManager({ 
  students, 
  allStudents, 
  bills, 
  allBills, 
  transactions = [],
  events = [],
  classes, 
  selectedAcademicYear, 
  onAddClass, 
  userRole 
}: StudentManagerProps) {
  // Detail Modal State
  const [selectedStudentDetail, setSelectedStudentDetail] = useState<Student | null>(null);

  // Form State
  const [showAddForm, setShowAddForm] = useState(false);
  const [showAddClassForm, setShowAddClassForm] = useState(false);
  const [showBulkForm, setShowBulkForm] = useState(false);
  const [newClassName, setNewClassName] = useState('');
  const [isEditing, setIsEditing] = useState<Student | null>(null);
  
  const [name, setName] = useState('');
  const [studentId, setStudentId] = useState('');
  const [classId, setClassId] = useState('Kelas 7-A');
  const [parentsName, setParentsName] = useState('');
  const [parentsEmail, setParentsEmail] = useState('');
  const [parentsPhone, setParentsPhone] = useState('');

  // Bulk Input State
  const [bulkClassId, setBulkClassId] = useState(classes[0] || 'Kelas 7-A');
  const [bulkRows, setBulkRows] = useState<Array<{
    studentId: string;
    name: string;
    parentsName: string;
    parentsPhone: string;
    parentsEmail: string;
  }>>([
    { studentId: '', name: '', parentsName: '', parentsPhone: '', parentsEmail: '' },
    { studentId: '', name: '', parentsName: '', parentsPhone: '', parentsEmail: '' },
    { studentId: '', name: '', parentsName: '', parentsPhone: '', parentsEmail: '' },
    { studentId: '', name: '', parentsName: '', parentsPhone: '', parentsEmail: '' },
    { studentId: '', name: '', parentsName: '', parentsPhone: '', parentsEmail: '' },
  ]);
  const [showPasteModal, setShowPasteModal] = useState(false);
  const [pasteText, setPasteText] = useState('');
  
  // Search & Filter
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedClass, setSelectedClass] = useState<string>('All');
  
  // Synchronize bulk class selection
  React.useEffect(() => {
    if (classes.length > 0 && !classes.includes(bulkClassId)) {
      setBulkClassId(classes[0]);
    }
  }, [classes, bulkClassId]);

  // Promotion / Year to Year student transition state
  const [showPromotionForm, setShowPromotionForm] = useState(false);
  const [promoSourceYear, setPromoSourceYear] = useState('2024/2025');
  const [promoSourceClass, setPromoSourceClass] = useState(classes[0] || 'Kelas 7-A');
  const [promoDestYear, setPromoDestYear] = useState(selectedAcademicYear);
  const [promoDestClass, setPromoDestClass] = useState(classes[0] || 'Kelas 8-A');
  const [promoSelectedStudents, setPromoSelectedStudents] = useState<string[]>([]);

  React.useEffect(() => {
    setPromoDestYear(selectedAcademicYear);
  }, [selectedAcademicYear]);

  // Reset Form
  const resetForm = () => {
    setName('');
    setStudentId('');
    setClassId(classes[0] || 'Kelas 7-A');
    setParentsName('');
    setParentsEmail('');
    setParentsPhone('');
    setIsEditing(null);
    setShowAddForm(false);
    setShowBulkForm(false);
    setShowPromotionForm(false);
    setBulkRows([
      { studentId: '', name: '', parentsName: '', parentsPhone: '', parentsEmail: '' },
      { studentId: '', name: '', parentsName: '', parentsPhone: '', parentsEmail: '' },
      { studentId: '', name: '', parentsName: '', parentsPhone: '', parentsEmail: '' },
      { studentId: '', name: '', parentsName: '', parentsPhone: '', parentsEmail: '' },
      { studentId: '', name: '', parentsName: '', parentsPhone: '', parentsEmail: '' },
    ]);
    setShowPasteModal(false);
    setPasteText('');
    setPromoSelectedStudents([]);
  };

  const handleClassSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newClassName.trim()) {
      alert("Nama kelas tidak boleh kosong!");
      return;
    }
    const cleanName = newClassName.trim();
    if (classes.includes(cleanName)) {
      alert("Kelas ini sudah terdaftar!");
      return;
    }
    if (onAddClass) {
      await onAddClass(cleanName);
      alert(`Kelas "${cleanName}" sukses ditambahkan!`);
      setNewClassName('');
      setShowAddClassForm(false);
    }
  };

  const togglePromoStudent = (id: string) => {
    setPromoSelectedStudents(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const toggleAllPromoStudents = (studentIds: string[]) => {
    if (promoSelectedStudents.length === studentIds.length) {
      setPromoSelectedStudents([]);
    } else {
      setPromoSelectedStudents(studentIds);
    }
  };

  // Promotion / Year to Year student transition runner
  const handleProcessPromotion = async () => {
    if (promoSelectedStudents.length === 0) {
      alert("Pilih minimal satu siswa untuk dipromosikan!");
      return;
    }
    
    if (promoSourceYear === promoDestYear) {
      if (!window.confirm("Peringatan: Tahun Ajaran asal dan tujuan sama. Apakah Anda tetap ingin mendaftarkan ulang siswa terpilih di Tahun Ajaran yang sama?")) {
        return;
      }
    }

    try {
      const batch = writeBatch(db);
      const destPeriods = getPeriodsForAcademicYear(promoDestYear);
      
      const studentsToPromote = allStudents.filter(s => promoSelectedStudents.includes(s.id));
      const alreadyNisns = students.map(s => s.studentId);
      
      // Let's filter out ones that are already registered in the destination year to avoid duplication
      const duplicatesInDest = studentsToPromote.filter(s => alreadyNisns.includes(s.studentId));
      let finalToPromote = [...studentsToPromote];
      
      if (duplicatesInDest.length > 0) {
        const confirmMsg = `Peringatan: Ada ${duplicatesInDest.length} siswa dengan NISN berikut yang sudah terdaftar di database untuk Tahun Ajaran ${promoDestYear}:\n` +
          `${duplicatesInDest.map(d => `${d.studentId} (${d.name})`).join(', ')}\n\n` +
          `Apakah Anda ingin abaikan siswa-siswa tersebut dan lanjut memproses ${studentsToPromote.length - duplicatesInDest.length} siswa sisanya?`;
          
        if (!window.confirm(confirmMsg)) {
          return;
        }
        finalToPromote = studentsToPromote.filter(s => !alreadyNisns.includes(s.studentId));
      }
      
      if (finalToPromote.length === 0) {
        alert("Tidak ada siswa yang dipromosikan (semua sudah terdaftar di Tahun Ajaran tujuan).");
        return;
      }

      finalToPromote.forEach(student => {
        const newStudentId = `std_promo_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        
        const newStudentPayload: Student = {
          id: newStudentId,
          studentId: student.studentId,
          name: student.name,
          classId: promoDestClass,
          parentsName: student.parentsName,
          parentsEmail: student.parentsEmail,
          parentsPhone: student.parentsPhone,
          status: 'active',
          academicYear: promoDestYear
        };
        
        batch.set(doc(db, 'students', newStudentId), newStudentPayload);
        
        // Auto create standard outstanding bills
        destPeriods.forEach(period => {
          const billId = `${newStudentId}_${period.replace(' ', '_')}`;
          const newBill: StudentBill = {
            id: billId,
            studentId: newStudentId,
            studentName: student.name,
            studentClass: promoDestClass,
            parentsName: student.parentsName,
            parentsPhone: student.parentsPhone,
            parentsEmail: student.parentsEmail,
            period,
            amountRequired: 150000,
            amountPaid: 0,
            status: 'unpaid',
            dueDate: getDueDateForPeriod(period),
            updatedAt: new Date().toISOString()
          };
          batch.set(doc(db, 'student_bills', billId), newBill);
        });
      });
      
      await batch.commit();
      alert(`Sukses mempromosikan / mendaftarkan ${finalToPromote.length} siswa ke Kelas ${promoDestClass} (${promoDestYear})!`);
      setPromoSelectedStudents([]);
      setShowPromotionForm(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'promote_students');
    }
  };

  // Submit Handler (Create/Update Student)
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isEditing && userRole === 'operator') {
      alert("Akses Terbatas: Sesi Operator tidak dapat mengubah data siswa terdaftar.");
      return;
    }
    if (!name || !studentId || !classId) {
      alert("Nama, NISN, dan Kelas wajib diisi!");
      return;
    }

    try {
      const generatedId = isEditing ? isEditing.id : `std_${Date.now()}`;
      const payload: Student = {
        id: generatedId,
        studentId: studentId.trim(),
        name: name.trim(),
        classId,
        parentsName: parentsName.trim() || 'Wali Murid',
        parentsEmail: parentsEmail.trim() || `${studentId}@sekh.id`,
        parentsPhone: parentsPhone.trim() || '081200000000',
        status: isEditing ? isEditing.status : 'active',
        academicYear: isEditing ? (isEditing.academicYear || selectedAcademicYear) : selectedAcademicYear,
      };

      if (isEditing) {
        // Update Student
        const ref = doc(db, 'students', generatedId);
        await updateDoc(ref, {
          studentId: payload.studentId,
          name: payload.name,
          classId: payload.classId,
          parentsName: payload.parentsName,
          parentsEmail: payload.parentsEmail,
          parentsPhone: payload.parentsPhone,
          academicYear: payload.academicYear
        });

        // Batch update bills if student name or class changes
        const batch = writeBatch(db);
        const studentBills = bills.filter(b => b.studentId === generatedId);
        studentBills.forEach(bill => {
          const billRef = doc(db, 'student_bills', bill.id);
          batch.update(billRef, {
            studentName: payload.name,
            studentClass: payload.classId,
            parentsName: payload.parentsName,
            parentsPhone: payload.parentsPhone,
            parentsEmail: payload.parentsEmail
          });
        });
        await batch.commit();
      } else {
        // Create student & generate default outstanding bills
        await setDoc(doc(db, 'students', generatedId), payload);

        // Auto Create Student Bills for the 12 periods of the selected Academic Year
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
      }

      resetForm();
    } catch (err) {
      handleFirestoreError(err, isEditing ? OperationType.UPDATE : OperationType.CREATE, 'students');
    }
  };

  // Start Editing
  const handleEdit = (student: Student) => {
    setIsEditing(student);
    setName(student.name);
    setStudentId(student.studentId);
    setClassId(student.classId);
    setParentsName(student.parentsName);
    setParentsEmail(student.parentsEmail);
    setParentsPhone(student.parentsPhone);
    setShowAddForm(true);
  };

  // Toggle Enrollment Status
  const toggleStatus = async (student: Student) => {
    if (userRole === 'operator') {
      alert("Akses Terbatas: Hanya Bendahara (Admin) yang dapat mengubah status keaktifan siswa.");
      return;
    }
    try {
      const ref = doc(db, 'students', student.id);
      await updateDoc(ref, {
        status: student.status === 'active' ? 'inactive' : 'active'
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'students');
    }
  };

  // Delete Student
  const handleDelete = async (studentId: string) => {
    if (userRole === 'operator') {
      alert("Akses Terbatas: Hanya Bendahara (Admin) yang dapat menghapus data siswa.");
      return;
    }
    if (!window.confirm("Apakah Anda yakin ingin menghapus data siswa ini? Ini juga akan menghapus tagihan milik siswa.")) {
      return;
    }

    try {
      // Delete student
      await deleteDoc(doc(db, 'students', studentId));
      
      // Batch delete associated bills
      const batch = writeBatch(db);
      const studentBills = bills.filter(b => b.studentId === studentId);
      studentBills.forEach(bill => {
        batch.delete(doc(db, 'student_bills', bill.id));
      });
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'students');
    }
  };

  // Realtime Parsing & Validation of bulkRows grid
  const validatedBulkRows = React.useMemo(() => {
    return bulkRows.map((row, idx) => {
      const stId = row.studentId.trim();
      const stName = row.name.trim();
      const pName = row.parentsName.trim();
      const pPhone = row.parentsPhone.trim();
      const pEmail = row.parentsEmail.trim();

      // Row is blank if all cells are completely empty
      const isEmpty = !stId && !stName && !pName && !pPhone && !pEmail;

      let isValid = true;
      let error = '';

      if (!isEmpty) {
        if (!stId) {
          isValid = false;
          error = 'NISN wajib diisi';
        } else if (!/^\d+$/.test(stId)) {
          isValid = false;
          error = 'NISN harus berisi angka saja';
        } else if (stId.length < 4) {
          isValid = false;
          error = 'NISN terlalu pendek (min 4 angka)';
        } else if (!stName) {
          isValid = false;
          error = 'Nama Siswa wajib diisi';
        } else if (stName.length < 2) {
          isValid = false;
          error = 'Nama terlalu pendek (min 2 huruf)';
        }
      }

      return {
        ...row,
        lineNum: idx + 1,
        isEmpty,
        isValid,
        error,
        // Apply smart defaults for blank entries when actually importing
        finalStudentId: stId,
        finalName: stName,
        finalParentsName: pName || 'Wali Murid',
        finalParentsPhone: pPhone || '081200000000',
        finalParentsEmail: pEmail || `${stId || 'siswa'}@komite.id`
      };
    });
  }, [bulkRows]);

  // Bulk grid action helpers
  const updateBulkRowCell = (index: number, field: 'studentId' | 'name' | 'parentsName' | 'parentsPhone' | 'parentsEmail', value: string) => {
    setBulkRows(prev => {
      const updated = [...prev];
      if (updated[index]) {
        updated[index] = { ...updated[index], [field]: value };
      }
      return updated;
    });
  };

  const handleAddBulkRow = () => {
    setBulkRows(prev => [
      ...prev,
      { studentId: '', name: '', parentsName: '', parentsPhone: '', parentsEmail: '' }
    ]);
  };

  const handleRemoveBulkRow = (indexToRemove: number) => {
    setBulkRows(prev => prev.filter((_, idx) => idx !== indexToRemove));
  };

  const handleClearBulkGrid = () => {
    if (window.confirm("Apakah Anda yakin ingin mengosongkan tabel input ini?")) {
      setBulkRows([
        { studentId: '', name: '', parentsName: '', parentsPhone: '', parentsEmail: '' },
        { studentId: '', name: '', parentsName: '', parentsPhone: '', parentsEmail: '' },
        { studentId: '', name: '', parentsName: '', parentsPhone: '', parentsEmail: '' },
        { studentId: '', name: '', parentsName: '', parentsPhone: '', parentsEmail: '' },
        { studentId: '', name: '', parentsName: '', parentsPhone: '', parentsEmail: '' },
      ]);
    }
  };

  const handlePasteSpreadsheet = () => {
    if (!pasteText.trim()) {
      alert("Silakan tempel data terlebih dahulu.");
      return;
    }

    const lines = pasteText.split(/\r?\n/);
    const parsedRowsData = lines.map(line => {
      const cleanLine = line.trim();
      if (!cleanLine) return null;

      let parts: string[] = [];
      if (cleanLine.includes('\t')) {
        parts = cleanLine.split('\t');
      } else if (cleanLine.includes(';')) {
        parts = cleanLine.split(';');
      } else {
        parts = cleanLine.split(',');
      }

      const p = parts.map(x => x.trim());
      return {
        studentId: p[0] || '',
        name: p[1] || '',
        parentsName: p[2] || '',
        parentsPhone: p[3] || '',
        parentsEmail: p[4] || '',
      };
    }).filter(Boolean) as Array<{
      studentId: string;
      name: string;
      parentsName: string;
      parentsPhone: string;
      parentsEmail: string;
    }>;

    if (parsedRowsData.length === 0) {
      alert("Gagal membaca baris data. Pastikan format sesuai contoh.");
      return;
    }

    // Filter out existing empty rows in the state to build the next batch
    const activeCurrentRows = bulkRows.filter(r => r.studentId || r.name || r.parentsName || r.parentsPhone || r.parentsEmail);
    
    setBulkRows([...activeCurrentRows, ...parsedRowsData]);
    setPasteText('');
    setShowPasteModal(false);
    alert(`Berhasil mengimpor ${parsedRowsData.length} baris ke dalam tabel edit!`);
  };

  // Download Templates
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

  // Upload File Handler (CSV & JSON)
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const fileName = file.name.toLowerCase();
    const reader = new FileReader();

    reader.onload = (event) => {
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
          // CSV or plain text lines parsing
          const lines = content.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
          if (lines.length === 0) {
            alert("File CSV kosong!");
            return;
          }

          let startIndex = 0;
          const firstLineLower = lines[0].toLowerCase();
          // Check if first line contains headers
          if (firstLineLower.includes('nisn') || firstLineLower.includes('nama') || firstLineLower.includes('student') || firstLineLower.includes('wali')) {
            startIndex = 1;
          }

          for (let i = startIndex; i < lines.length; i++) {
            const line = lines[i];
            let parts: string[] = [];
            if (line.includes(';')) {
              parts = line.split(';');
            } else if (line.includes('\t')) {
              parts = line.split('\t');
            } else {
              parts = line.split(',');
            }

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
          alert("Tidak ada data siswa yang valid ditemukan dalam file.");
          return;
        }

        const activeCurrentRows = bulkRows.filter(r => r.studentId || r.name || r.parentsName || r.parentsPhone || r.parentsEmail);
        setBulkRows([...activeCurrentRows, ...parsedData]);
        alert(`Berhasil mengunggah file! ${parsedData.length} data siswa telah dimasukkan ke dalam tabel input.`);
      } catch (err) {
        console.error("Error parsing file:", err);
        alert("Gagal membaca file. Pastikan format file CSV atau JSON sesuai petunjuk.");
      }
    };

    reader.readAsText(file);
    e.target.value = ''; // Reset input
  };

  // Handle Bulk Submit
  const handleBulkSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userRole === 'operator') {
      alert("Akses Terbatas: Sesi Operator tidak dapat menginput data siswa.");
      return;
    }
    
    // Get all valid AND active (non-empty) rows
    const nonEmptys = validatedBulkRows.filter(row => !row.isEmpty);
    if (nonEmptys.length === 0) {
      alert("Tidak ada data siswa yang diisi di tabel ini. Isilah minimal 1 baris siswa.");
      return;
    }

    const invalidRows = nonEmptys.filter(row => !row.isValid);
    if (invalidRows.length > 0) {
      alert(`Format Bermasalah: Terdapat ${invalidRows.length} baris yang tidak valid (berwarna merah). Mohon diperbaiki terlebih dahulu.`);
      return;
    }
    
    // Check for local duplicates in input
    const duplicateNisns = nonEmptys.filter((item, index) => {
      return nonEmptys.findIndex(x => x.studentId === item.studentId) !== index;
    });
    
    if (duplicateNisns.length > 0) {
      alert(`Format Bermasalah: Ada NISN ganda dalam data input Anda: ${Array.from(new Set(duplicateNisns.map(d => d.studentId))).join(', ')}`);
      return;
    }

    // Check for existences in db
    const existingNisns = students.map(s => s.studentId);
    const duplicatesInDb = nonEmptys.filter(row => existingNisns.includes(row.studentId));
    
    let rowsToImport = [...nonEmptys];
    if (duplicatesInDb.length > 0) {
      const confirmMsg = `Peringatan: Ada ${duplicatesInDb.length} siswa dengan NISN berikut yang sudah terdaftar di database:\n` +
        `${duplicatesInDb.map(d => `${d.studentId} (${d.name})`).join(', ')}\n\n` +
        `Apakah Anda ingin abaikan siswa-siswa tersebut dan lanjut mengimpor ${nonEmptys.length - duplicatesInDb.length} siswa sisanya?`;
        
      if (!window.confirm(confirmMsg)) {
        return;
      }
      rowsToImport = nonEmptys.filter(row => !existingNisns.includes(row.studentId));
    }
    
    if (rowsToImport.length === 0) {
      alert("Tidak ada siswa baru yang perlu diimpor (semua NISN sudah terdaftar).");
      return;
    }

    try {
      const batch = writeBatch(db);
      const currentPeriods = getPeriodsForAcademicYear(selectedAcademicYear);
      
      rowsToImport.forEach(row => {
         const generatedId = `std_bulk_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
         const payload: Student = {
           id: generatedId,
           studentId: row.finalStudentId,
           name: row.finalName,
           classId: bulkClassId,
           parentsName: row.finalParentsName,
           parentsEmail: row.finalParentsEmail,
           parentsPhone: row.finalParentsPhone,
           status: 'active',
           academicYear: selectedAcademicYear
         };
         
         batch.set(doc(db, 'students', generatedId), payload);
         
         // Auto create standard outstanding bills
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
       });
      
      await batch.commit();
      alert(`Sukses mengimpor ${rowsToImport.length} siswa baru ke dalam ${bulkClassId}!`);
      
      // Clear bulk state
      setBulkRows([
        { studentId: '', name: '', parentsName: '', parentsPhone: '', parentsEmail: '' },
        { studentId: '', name: '', parentsName: '', parentsPhone: '', parentsEmail: '' },
        { studentId: '', name: '', parentsName: '', parentsPhone: '', parentsEmail: '' },
        { studentId: '', name: '', parentsName: '', parentsPhone: '', parentsEmail: '' },
        { studentId: '', name: '', parentsName: '', parentsPhone: '', parentsEmail: '' },
      ]);
      setShowBulkForm(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'students_bulk');
    }
  };

  // Filter & Search computation
  const filteredStudents = students.filter(student => {
    const matchesSearch = student.name.toLowerCase().includes(searchQuery.toLowerCase()) || 
                          student.studentId.includes(searchQuery) ||
                          student.parentsName.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesClass = selectedClass === 'All' || student.classId === selectedClass;
    return matchesSearch && matchesClass;
  });

  return (
    <div id="student-manager-section" className="space-y-6">
      
      {/* Header Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-gray-100 shadow-xs">
        <div className="text-left">
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <GraduationCap className="h-5 w-5 text-indigo-600" />
            Database Siswa Binaan Komite
          </h2>
          <p className="text-sm text-gray-500 mt-1">
            Pendataan siswa binaan & kontak wali murid sebagai konstituen Komite Sekolah untuk penyampaian informasi program, advokasi hak siswa, serta iuran gotong royong.
          </p>
        </div>
        <div className="flex gap-2 flex-wrap w-full md:w-auto">
          <button
            id="btn-add-class"
            onClick={() => { setShowAddClassForm(!showAddClassForm); setShowAddForm(false); setShowBulkForm(false); }}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-900 text-white px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer shadow-xs"
          >
            {showAddClassForm ? <X className="h-3.5 w-3.5 text-white" /> : <Plus className="h-3.5 w-3.5 text-white" />}
            {showAddClassForm ? 'Batal' : 'Tambah Kelas'}
          </button>

          <button
            id="btn-promotion-students"
            onClick={() => { setShowPromotionForm(!showPromotionForm); setShowAddForm(false); setShowAddClassForm(false); setShowBulkForm(false); }}
            className="flex items-center gap-2 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 border border-indigo-200/60 px-3.5 py-2 rounded-xl font-bold text-xs transition-all cursor-pointer shadow-xs"
          >
            {showPromotionForm ? <X className="h-3.5 w-3.5" /> : <GraduationCap className="h-3.5 w-3.5" />}
            {showPromotionForm ? 'Batal' : 'Promosi / Kenaikan Kelas'}
          </button>

          <button
            id="btn-bulk-add-student"
            onClick={() => { setShowBulkForm(!showBulkForm); setShowAddForm(false); setShowAddClassForm(false); setShowPromotionForm(false); }}
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-700 text-white px-3.5 py-2 rounded-xl font-bold text-xs transition-all focus:ring-4 focus:ring-emerald-100 cursor-pointer shadow-xs"
          >
            {showBulkForm ? <X className="h-3.5 w-3.5" /> : <UserPlus className="h-3.5 w-3.5" />}
            {showBulkForm ? 'Batal' : 'Input Siswa Bulk / Masal'}
          </button>
          
          <button
            id="btn-add-student"
            onClick={() => { resetForm(); setShowAddForm(!showAddForm); setShowAddClassForm(false); setShowBulkForm(false); setShowPromotionForm(false); }}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-3.5 py-2 rounded-xl font-bold text-xs transition-all focus:ring-4 focus:ring-indigo-100 cursor-pointer shadow-xs"
          >
            {showAddForm ? <X className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
            {showAddForm ? 'Batal' : 'Tambah Siswa'}
          </button>
        </div>
      </div>

      {/* Slide down Add Class Form */}
      {showAddClassForm && (
        <form onSubmit={handleClassSubmit} className="bg-white border border-slate-100 rounded-2xl p-6 shadow-sm transition-all text-left space-y-4">
          <div className="border-b border-slate-100 pb-3">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wide">Buat & Daftarkan Kelas Baru</h3>
            <p className="text-xs text-slate-400 mt-1">Masukkan nama jenjang/kelas baru yang ingin ditambahkan ke master database komite sekolah.</p>
          </div>
          <div className="flex flex-col sm:flex-row gap-3 items-end">
            <div className="flex-1">
              <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-widest mb-1.5">Nama Kelas *</label>
              <input
                type="text"
                placeholder="Contoh: Kelas 9-D"
                value={newClassName}
                onChange={(e) => setNewClassName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-2 text-xs transition-all outline-none"
                required
              />
            </div>
            <button
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs whitespace-nowrap"
            >
              Simpan & Daftarkan Kelas
            </button>
          </div>
        </form>
      )}

      {/* Slide down Add/Edit form */}
      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-gray-100 rounded-2xl p-6 shadow-md transition-all duration-300">
          <div className="border-b border-gray-100 pb-4 mb-5">
            <h3 className="text-base font-bold text-gray-900">
              {isEditing ? 'Edit Data Siswa' : 'Tambah Calon Wajib Iuran (Siswa) Baru'}
            </h3>
            <p className="text-xs text-indigo-600 mt-1 font-semibold">
              *Siswa baru akan otomatis dibuatkan 12 bulan tagihan iuran untuk Tahun Ajaran {selectedAcademicYear} senilai Rp 150.000/bulan.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5">
            {/* Student ID / NISN */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">NISN Siswa *</label>
              <input
                type="text"
                placeholder="Contoh: 10928371"
                value={studentId}
                onChange={(e) => setStudentId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-2.5 text-xs transition-all outline-none"
                required
              />
            </div>

            {/* Student Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Nama Lengkap Siswa *</label>
              <input
                type="text"
                placeholder="Contoh: Ahmad Fauzi"
                value={name}
                onChange={(e) => setName(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-2.5 text-xs transition-all outline-none"
                required
              />
            </div>

            {/* Class Dropdown */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Pilih Kelas *</label>
              <select
                value={classId}
                onChange={(e) => setClassId(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-2.5 text-xs transition-all outline-none"
                required
              >
                {classes.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            {/* Parents Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Nama Wali Murid (Orang Tua)</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                  <User className="h-4 w-4" />
                </span>
                <input
                  type="text"
                  placeholder="Contoh: Budi Fauzi"
                  value={parentsName}
                  onChange={(e) => setParentsName(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-100 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 rounded-xl pl-10 pr-4 py-2.5 text-xs transition-all outline-none"
                />
              </div>
            </div>

            {/* Parents Phone */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">No. Telp / WhatsApp Wali Murid</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                  <Phone className="h-4 w-4" />
                </span>
                <input
                  type="tel"
                  placeholder="Contoh: 081234567890"
                  value={parentsPhone}
                  onChange={(e) => setParentsPhone(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-100 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 rounded-xl pl-10 pr-4 py-2.5 text-xs transition-all outline-none"
                />
              </div>
            </div>

            {/* Parents Email */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Email Wali Murid</label>
              <div className="relative">
                <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
                  <Mail className="h-4 w-4" />
                </span>
                <input
                  type="email"
                  placeholder="Contoh: budi.fauzi@example.com"
                  value={parentsEmail}
                  onChange={(e) => setParentsEmail(e.target.value)}
                  className="w-full bg-slate-50 border border-slate-100 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 rounded-xl pl-10 pr-4 py-2.5 text-xs transition-all outline-none"
                />
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-3 mt-6 pt-4 border-t border-gray-100">
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 rounded-xl text-gray-500 hover:text-gray-700 hover:bg-gray-50 text-sm font-semibold transition-all"
            >
              Reset
            </button>
            <button
              id="btn-submit-student"
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-xs font-bold transition-all focus:ring-4 focus:ring-indigo-100 cursor-pointer"
            >
              {isEditing ? 'Simpan Perubahan' : 'Masukkan Data Siswa'}
            </button>
          </div>
        </form>
      )}

      {/* Slide down Bulk Add Form */}
      {showBulkForm && (
        <div className="bg-white border border-slate-100 rounded-2xl p-6 shadow-md transition-all duration-300 space-y-6">
          {/* Header area */}
          <div className="border-b border-gray-100 pb-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <h3 className="text-base font-bold text-gray-900 flex items-center gap-2">
                <UserPlus className="h-5 w-5 text-emerald-600" />
                Lembar Input Massal / Tabel Siswa Baru
              </h3>
              <p className="text-xs text-gray-400 mt-1">
                Ketik langsung pada tabel layaknya Excel atau tempel data banyak dari file spreadsheet Anda.
              </p>
            </div>
            
            <div className="flex flex-wrap items-center gap-2">
              {/* Hidden file input */}
              <input
                type="file"
                id="bulk-file-upload-input"
                accept=".csv,.json,text/csv,application/json"
                onChange={handleFileUpload}
                className="hidden"
              />

              <label
                htmlFor="bulk-file-upload-input"
                className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-xs"
              >
                <Upload className="h-4 w-4" />
                Upload File (CSV / JSON)
              </label>

              <button
                type="button"
                onClick={() => setShowPasteModal(true)}
                className="px-3.5 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-emerald-200/80"
              >
                <Clipboard className="h-4 w-4" />
                Tempel Teks Spreadsheet
              </button>

              <button
                type="button"
                onClick={downloadCSVTemplate}
                title="Download Contoh File Template CSV"
                className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer border border-slate-200"
              >
                <FileText className="h-3.5 w-3.5 text-emerald-600" />
                Template CSV
              </button>

              <button
                type="button"
                onClick={downloadJSONTemplate}
                title="Download Contoh File Template JSON"
                className="px-3 py-2 bg-slate-50 hover:bg-slate-100 text-slate-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1 cursor-pointer border border-slate-200"
              >
                <FileCode className="h-3.5 w-3.5 text-amber-600" />
                Template JSON
              </button>
              
              <button
                type="button"
                onClick={handleClearBulkGrid}
                className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer border border-rose-200/55"
              >
                <Trash2 className="h-4 w-4" />
                Kosongkan
              </button>
            </div>
          </div>

          {/* Quick instructions and Target Class Selector */}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-center bg-slate-50 p-4 rounded-xl border border-slate-100/60 text-xs text-slate-600">
            <div className="md:col-span-1">
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">Kelas Target Utama *</label>
              <select
                value={bulkClassId}
                onChange={(e) => setBulkClassId(e.target.value)}
                className="w-full bg-white border border-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg px-3 py-2 text-xs transition-all outline-none font-semibold text-slate-800"
                required
              >
                {classes.map((c) => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
            
            <div className="md:col-span-3 leading-relaxed text-slate-500 space-y-1">
              <p className="font-semibold text-slate-700">💡 Tips input tabel:</p>
              <ul className="list-disc pl-4 space-y-0.5 text-[11px]">
                <li>Baris yang kosong akan otomatis <span className="font-medium text-slate-600">diabaikan</span> saat mengimpor data.</li>
                <li>Gunakan tombol <span className="font-semibold">"Tambah Baris Baru"</span> di bawah jika membutuhkan slot masukan ekstra.</li>
                <li>Setelah disimpan, siswa baru otomatis dibuatkan 12 bulan tagihan iuran untuk Tahun Ajaran <span className="font-semibold font-mono text-indigo-600">{selectedAcademicYear}</span> senilai Rp 150.000/bulan.</li>
              </ul>
            </div>
          </div>

          {/* Excel Clipboard Paste Overlay Modal / Form Section */}
          {showPasteModal && (
            <div className="bg-emerald-50/40 border border-emerald-150 p-5 rounded-2xl relative space-y-4 transition-all duration-300">
              <button
                type="button"
                onClick={() => setShowPasteModal(false)}
                className="absolute top-4 right-4 text-slate-400 hover:text-slate-600 bg-white p-1 rounded-full border border-slate-100"
              >
                <X className="h-4 w-4" />
              </button>
              
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h4 className="text-xs font-bold text-emerald-800 flex items-center gap-1.5 uppercase tracking-wider">
                    <Clipboard className="h-4 w-4" />
                    Tempel Data Massal dari Spreadsheet (Excel / Google Sheets)
                  </h4>
                  <p className="text-[11px] text-emerald-600 mt-0.5">
                    Salin (Copy) tabel peserta didik Anda di Excel lalu tempelkan (Paste) di dalam kolom di bawah:
                  </p>
                </div>
                
                <button
                  type="button"
                  onClick={() => setPasteText(
                    "10928301\tDedy Cahyono\tGunawan Cahyono\t08123112233\tdedy@example.com\n" +
                    "10928302\tEka Rahmawati\tBambang Rahma\t08571122334\teka@example.com\n" +
                    "10928303\tFajar Pratama\tAhmad Pratama\t08785566778\tfajar@example.com"
                  )}
                  className="px-2.5 py-1 bg-white hover:bg-emerald-50 text-emerald-800 rounded-lg text-[10px] font-bold transition-all border border-emerald-200/80 cursor-pointer self-start sm:self-center"
                >
                  Gunakan Contoh Data
                </button>
              </div>

              <div className="space-y-2">
                <textarea
                  rows={6}
                  value={pasteText}
                  onChange={(e) => setPasteText(e.target.value)}
                  placeholder="NISN [Tab / Koma] Nama Siswa [Tab] Nama Wali [Tab] No. HP Wali [Tab] Email Wali&#10;Contoh:&#10;10928301	Andi Wijaya	Budi Wijaya	08123456789	andi@example.com&#10;10928302	Cici Melia	Dwi Melia	08139876543	cici@example.com"
                  className="w-full bg-white border border-emerald-200 focus:border-emerald-600 focus:ring-1 focus:ring-emerald-600 rounded-xl p-3 text-xs transition-all outline-none font-mono placeholder:text-slate-400"
                />
                <div className="flex justify-end gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => { setPasteText(''); }}
                    className="px-3.5 py-1.5 bg-white hover:bg-slate-100 text-slate-600 rounded-lg font-semibold border border-slate-100"
                  >
                    Hapus
                  </button>
                  <button
                    type="button"
                    onClick={handlePasteSpreadsheet}
                    className="px-4 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg font-bold shadow-xs cursor-pointer"
                  >
                    Proses & Impor ke Tabel
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Interactive Spreadsheet Grid Table */}
          <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-2xs">
            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left text-xs text-slate-700 table-fixed min-w-[900px]">
                <thead className="bg-slate-100 font-bold text-slate-700 border-b border-slate-100">
                  <tr>
                    <th className="w-12 px-3 py-3 text-center">Row</th>
                    <th className="w-40 px-3 py-3">NISN (Wajib)*</th>
                    <th className="w-56 px-3 py-3">Nama Lengkap Siswa (Wajib)*</th>
                    <th className="w-44 px-3 py-3">Nama Wali Murid</th>
                    <th className="w-44 px-3 py-3">No. HP Wali (WhatsApp)</th>
                    <th className="w-44 px-3 py-3">Email Wali</th>
                    <th className="w-24 px-3 py-3 text-center">Aksi / Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-150 bg-white">
                  {validatedBulkRows.map((row, idx) => {
                    // Check if row has error or is active
                    const isError = !row.isEmpty && !row.isValid;
                    const isActive = !row.isEmpty;

                    return (
                      <tr
                        key={row.lineNum}
                        className={`transition-colors duration-150 ${
                          isError 
                            ? 'bg-rose-50/30' 
                            : isActive 
                            ? 'bg-slate-50/10' 
                            : 'hover:bg-slate-50/40'
                        }`}
                      >
                        {/* Number Indicator */}
                        <td className="px-3 py-2 text-center text-slate-400 font-semibold border-r border-slate-100">
                          #{row.lineNum}
                        </td>

                        {/* Student ID (NISN) */}
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            value={row.studentId}
                            onChange={(e) => updateBulkRowCell(idx, 'studentId', e.target.value)}
                            placeholder="Contoh: 10928391"
                            maxLength={16}
                            className={`w-full bg-white border rounded-lg px-2.5 py-1.5 text-xs transition-all outline-none font-mono focus:ring-2 focus:ring-indigo-400 ${
                              isError && !row.studentId.trim()
                                ? 'border-rose-400 bg-rose-50/50' 
                                : isError && !/^\d+$/.test(row.studentId.trim())
                                ? 'border-amber-400 bg-amber-50/30 text-amber-900'
                                : 'border-slate-100 hover:border-slate-300'
                            }`}
                          />
                        </td>

                        {/* Student Name */}
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            value={row.name}
                            onChange={(e) => updateBulkRowCell(idx, 'name', e.target.value)}
                            placeholder="Contoh: Gibran Mahesa"
                            maxLength={80}
                            className={`w-full bg-white border rounded-lg px-2.5 py-1.5 text-xs font-bold transition-all outline-none focus:ring-2 focus:ring-indigo-400 ${
                              isError && !row.name.trim()
                                ? 'border-rose-400 bg-rose-50/50'
                                : 'border-slate-100 hover:border-slate-300'
                            }`}
                          />
                        </td>

                        {/* Parents Name */}
                        <td className="px-2 py-2">
                          <input
                            type="text"
                            value={row.parentsName}
                            onChange={(e) => updateBulkRowCell(idx, 'parentsName', e.target.value)}
                            placeholder="Kosong = Wali Murid"
                            maxLength={60}
                            className="w-full bg-white border border-slate-100 hover:border-slate-300 focus:ring-2 focus:ring-indigo-400 rounded-lg px-2.5 py-1.5 text-xs transition-all outline-none"
                          />
                        </td>

                        {/* Parents Phone */}
                        <td className="px-2 py-2">
                          <input
                            type="tel"
                            value={row.parentsPhone}
                            onChange={(e) => updateBulkRowCell(idx, 'parentsPhone', e.target.value)}
                            placeholder="Kosong = 081200000000"
                            maxLength={15}
                            className="w-full bg-white border border-slate-100 hover:border-slate-300 focus:ring-2 focus:ring-indigo-400 rounded-lg px-2.5 py-1.5 text-xs transition-all font-mono outline-none"
                          />
                        </td>

                        {/* Parents Email */}
                        <td className="px-2 py-2">
                          <input
                            type="email"
                            value={row.parentsEmail}
                            onChange={(e) => updateBulkRowCell(idx, 'parentsEmail', e.target.value)}
                            placeholder="Kosong = nisn@komite.id"
                            className="w-full bg-white border border-slate-100 hover:border-slate-300 focus:ring-2 focus:ring-indigo-400 rounded-lg px-2.5 py-1.5 text-xs transition-all font-mono outline-none"
                          />
                        </td>

                        {/* Row Action / Status Trigger */}
                        <td className="px-3 py-2 text-center text-slate-500">
                          <div className="flex items-center justify-center gap-2">
                            {isError ? (
                              <span 
                                className="inline-flex text-rose-600" 
                                title={row.error}
                              >
                                <AlertCircle className="h-4.5 w-4.5 text-rose-500 animate-pulse" />
                              </span>
                            ) : isActive ? (
                              <span className="inline-flex text-emerald-600" title="Valid">
                                <CheckCircle2 className="h-4.5 w-4.5 text-emerald-500" />
                              </span>
                            ) : null}

                            <button
                              type="button"
                              onClick={() => handleRemoveBulkRow(idx)}
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md transition-all cursor-pointer"
                              title="Hapus baris ini"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Error messaging inline bar */}
            {validatedBulkRows.some(row => !row.isEmpty && !row.isValid) && (
              <div className="bg-rose-50 px-4 py-2 text-xs text-rose-700 font-semibold border-t border-rose-200 flex items-center gap-2">
                <AlertCircle className="h-4 w-4 shrink-0 text-rose-600" />
                <span>
                  Perhatian: Terdapat sel input bermasalah pada baris bertanda merah:{" "}
                  {validatedBulkRows
                    .filter(r => !r.isEmpty && !r.isValid)
                    .map(r => `#${r.lineNum} (${r.error})`)
                    .join(", ")}
                </span>
              </div>
            )}

            {/* Add row bar link */}
            <div className="bg-slate-50 p-3 border-t border-slate-100 text-center">
              <button
                type="button"
                onClick={handleAddBulkRow}
                className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-xl bg-white hover:bg-indigo-50 border border-slate-100 hover:border-indigo-300 text-indigo-700 text-xs font-bold transition-all shadow-3xs cursor-pointer focus:ring-2 focus:ring-indigo-200"
              >
                <Plus className="h-3.5 w-3.5 text-indigo-600" />
                Tambah Baris Baru
              </button>
            </div>
          </div>

          {/* Form Save & Status Summary Section */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-4 border-t border-slate-100">
            <div className="text-xs text-slate-500">
              <span className="font-semibold text-slate-700">Ikhtisar Data:</span>{" "}
              {validatedBulkRows.filter(r => !r.isEmpty).length} baris diisi •{" "}
              <span className="text-emerald-700 font-bold">{validatedBulkRows.filter(r => !r.isEmpty && r.isValid).length} baris siap diimpor</span>
              {" "}•{" "}
              <span className="text-rose-600 font-bold">{validatedBulkRows.filter(r => !r.isEmpty && !r.isValid).length} baris error</span>
            </div>

            <div className="flex items-center gap-2.5 w-full sm:w-auto justify-end">
              <button
                type="button"
                onClick={() => {
                  if (window.confirm("Batalkan semua isian massal ini?")) {
                    resetForm();
                  }
                }}
                className="px-4 py-2 rounded-xl text-slate-500 hover:text-slate-755 hover:bg-slate-50 text-xs font-semibold transition-all cursor-pointer"
              >
                Batal
              </button>
              
              <button
                id="btn-submit-bulk-students"
                type="button"
                onClick={handleBulkSubmit}
                disabled={validatedBulkRows.filter(r => !r.isEmpty && r.isValid).length === 0}
                className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer hover:shadow-xs focus:ring-4 ${
                  validatedBulkRows.filter(r => !r.isEmpty && r.isValid).length > 0 && !validatedBulkRows.some(r => !r.isEmpty && !r.isValid)
                    ? 'bg-emerald-600 hover:bg-emerald-700 text-white focus:ring-emerald-100' 
                    : 'bg-slate-150 text-slate-400 border border-slate-100 cursor-not-allowed'
                }`}
              >
                <UserPlus className="h-4 w-4" />
                Simpan & Impor {validatedBulkRows.filter(r => !r.isEmpty && r.isValid).length} Siswa Baru
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Slide down Promotion / Class transition Form */}
      {showPromotionForm && (
        <div className="bg-white border border-indigo-150 rounded-2xl p-6 shadow-md transition-all duration-300 space-y-6">
          <div className="border-b border-gray-100 pb-4">
            <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
              <GraduationCap className="h-5 w-5 text-indigo-600" />
              Kelola Kenaikan Kelas & Promosi Tahun Ajaran
            </h3>
            <p className="text-xs text-slate-500 mt-1">
              Pindahkan atau naikkan kelas rombongan siswa dari Tahun Ajaran sebelumnya ke Tahun Ajaran aktif ({selectedAcademicYear}). Sistem otomatis mendaftarkan data siswa baru dan menghasilkan 12 bulan tagihan iuran barunya.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 bg-slate-50 p-4 rounded-xl border border-slate-100/60 text-xs text-slate-600">
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">1. Tahun Ajaran Asal *</label>
              <select
                value={promoSourceYear}
                onChange={(e) => { setPromoSourceYear(e.target.value); setPromoSelectedStudents([]); }}
                className="w-full bg-white border border-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg px-3 py-2 text-xs transition-all outline-none font-semibold text-slate-800"
              >
                {['2024/2025', '2025/2026', '2026/2027'].map(yr => (
                  <option key={yr} value={yr}>Tahun Ajaran {yr}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">2. Kelas Asal *</label>
              <select
                value={promoSourceClass}
                onChange={(e) => { setPromoSourceClass(e.target.value); setPromoSelectedStudents([]); }}
                className="w-full bg-white border border-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg px-3 py-2 text-xs transition-all outline-none font-semibold text-slate-800"
              >
                {classes.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">3. Tahun Ajaran Tujuan (Aktif)</label>
              <input
                type="text"
                value={`TA ${promoDestYear}`}
                disabled
                className="w-full bg-slate-100 border border-slate-100 rounded-lg px-3 py-2 text-xs font-bold text-slate-500 cursor-not-allowed"
              />
            </div>

            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">4. Kelas Tujuan *</label>
              <select
                value={promoDestClass}
                onChange={(e) => setPromoDestClass(e.target.value)}
                className="w-full bg-white border border-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg px-3 py-2 text-xs transition-all outline-none font-semibold text-slate-800"
              >
                {classes.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>
          </div>

          {/* Student selection table */}
          <div>
            <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-3 flex items-center justify-between">
              <span>Daftar Siswa di {promoSourceClass} (TA {promoSourceYear})</span>
              <span className="text-[10px] text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full font-bold">
                {allStudents.filter(s => (s.academicYear || '2025/2026') === promoSourceYear && s.classId === promoSourceClass).length} Siswa Ditemukan
              </span>
            </h4>

            {allStudents.filter(s => (s.academicYear || '2025/2026') === promoSourceYear && s.classId === promoSourceClass).length > 0 ? (
              <div className="border border-slate-100 rounded-xl overflow-hidden shadow-2xs">
                <div className="max-h-64 overflow-y-auto">
                  <table className="w-full text-xs text-left text-slate-600">
                    <thead className="bg-slate-50 border-b border-slate-100 text-[10px] text-slate-500 uppercase tracking-wider font-bold">
                      <tr>
                        <th className="py-2.5 px-4 w-12 text-center">
                          <input
                            type="checkbox"
                            checked={
                              promoSelectedStudents.length > 0 &&
                              promoSelectedStudents.length === allStudents.filter(s => (s.academicYear || '2025/2026') === promoSourceYear && s.classId === promoSourceClass).map(s => s.id).length
                            }
                            onChange={() => {
                              const sourceIds = allStudents.filter(s => (s.academicYear || '2025/2026') === promoSourceYear && s.classId === promoSourceClass).map(s => s.id);
                              toggleAllPromoStudents(sourceIds);
                            }}
                            className="h-3.5 w-3.5 text-indigo-600 border-slate-300 rounded-md"
                          />
                        </th>
                        <th className="py-2.5 px-2 w-32">NISN</th>
                        <th className="py-2.5 px-3">Nama Siswa</th>
                        <th className="py-2.5 px-3">Nama Wali</th>
                        <th className="py-2.5 px-3 text-right">Status di TA {promoDestYear}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 font-medium">
                      {allStudents
                        .filter(s => (s.academicYear || '2025/2026') === promoSourceYear && s.classId === promoSourceClass)
                        .map((s) => {
                          const isAlreadyInDest = students.some(ds => ds.studentId === s.studentId);
                          return (
                            <tr key={s.id} className={`hover:bg-slate-50 transition-colors ${isAlreadyInDest ? 'bg-slate-50/50 text-slate-400' : ''}`}>
                              <td className="py-2.5 px-4 text-center">
                                <input
                                  type="checkbox"
                                  checked={promoSelectedStudents.includes(s.id)}
                                  disabled={isAlreadyInDest}
                                  onChange={() => togglePromoStudent(s.id)}
                                  className="h-3.5 w-3.5 text-indigo-600 border-slate-300 rounded-md disabled:opacity-50"
                                />
                              </td>
                              <td className="py-2.5 px-2 font-mono text-slate-755 font-medium">{s.studentId}</td>
                              <td className="py-2.5 px-3 font-semibold text-slate-800">{s.name}</td>
                              <td className="py-2.5 px-3 text-slate-520">{s.parentsName}</td>
                              <td className="py-2.5 px-3 text-right pr-4 font-bold">
                                {isAlreadyInDest ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-50 text-emerald-700 border border-emerald-100 px-2 py-0.5 rounded-full font-bold">
                                    <CheckCircle2 className="h-3 w-3" /> Terdaftar
                                  </span>
                                ) : (
                                  <span className="text-[10px] text-slate-400 font-medium select-none">Siap Dipromosikan</span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                    </tbody>
                  </table>
                </div>
              </div>
            ) : (
              <div className="bg-slate-50 border border-slate-150 rounded-xl p-8 text-center text-slate-400 flex flex-col items-center justify-center gap-2">
                <AlertCircle className="h-6 w-6 text-slate-350" />
                <p className="text-xs font-semibold">Tidak ditemukan data siswa aktif untuk {promoSourceClass} pada {promoSourceYear}.</p>
                <p className="text-[10px] text-slate-400">Silakan ubah rombongan kelas asal atau tahun ajaran asal pada dropdown di atas.</p>
              </div>
            )}
          </div>

          {/* Table actions */}
          <div className="flex justify-between items-center pt-4 border-t border-slate-100 text-xs">
            <span className="text-slate-500 font-semibold">
              Terpilih: <strong className="text-indigo-600">{promoSelectedStudents.length} siswa</strong> untuk dinaikkan ke Kelas <strong className="text-slate-800">{promoDestClass} ({promoDestYear})</strong>.
            </span>
            
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => { setPromoSelectedStudents([]); setShowPromotionForm(false); }}
                className="px-4 py-2 border border-slate-100 text-slate-600 bg-white hover:bg-slate-50 rounded-xl font-bold text-xs cursor-pointer transition-all"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleProcessPromotion}
                disabled={promoSelectedStudents.length === 0}
                className={`flex items-center gap-1.5 px-5 py-2 rounded-xl text-xs font-bold transition-all ${
                  promoSelectedStudents.length > 0
                    ? 'bg-indigo-600 hover:bg-indigo-700 text-white cursor-pointer shadow-xs focus:ring-4 focus:ring-indigo-100'
                    : 'bg-slate-150 text-slate-400 border border-slate-100 cursor-not-allowed'
                }`}
              >
                <GraduationCap className="h-4 w-4" />
                Proses Kenaikan Kelas ({promoSelectedStudents.length})
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Container */}
      <div className="bg-white/90 backdrop-blur-xs rounded-3xl p-4 shadow-xs flex flex-col md:flex-row gap-4 items-center justify-between text-left">
        <div className="relative w-full md:max-w-md">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
            <Search className="h-4 w-4" />
          </span>
          <input
            type="text"
            placeholder="Cari nama, NISN, atau nama wali..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50/80 focus:bg-white focus:ring-2 focus:ring-[#003049]/20 rounded-2xl pl-10 pr-4 py-2.5 text-xs transition-all outline-none border-none shadow-2xs font-medium"
          />
        </div>

        <div className="flex gap-2 items-center w-full md:w-auto">
          <Filter className="h-4 w-4 text-[#003049] hidden md:inline" />
          <select
            value={selectedClass}
            onChange={(e) => setSelectedClass(e.target.value)}
            className="w-full md:w-48 bg-slate-50/80 focus:bg-white rounded-2xl px-3 py-2.5 text-xs outline-none border-none shadow-2xs font-extrabold text-slate-800"
          >
            <option value="All">Semua Tingkat Kelas</option>
            {classes.map(c => (
              <option key={c} value={c}>{c}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Roster Table Layout */}
      <div className="bg-white/90 backdrop-blur-xs rounded-3xl shadow-sm overflow-hidden text-left">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-gradient-to-r from-[#f7fafc] to-[#e6f0f6] text-xs font-extrabold text-[#003049] uppercase tracking-wider">
                <th className="px-6 py-4">Data Siswa / NISN</th>
                <th className="px-6 py-4">Tingkat Kelas</th>
                <th className="px-6 py-4">Hubungan Orang Tua / Wali</th>
                <th className="px-6 py-4">Email & WhatsApp</th>
                <th className="px-6 py-4">Status Roster</th>
                <th className="px-6 py-4 text-center">Aksi / Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100/60 text-sm text-slate-700">
              {filteredStudents.length > 0 ? (
                filteredStudents.map((student) => {
                  const studentOutstandingDues = bills
                    .filter(b => b.studentId === student.id && b.status !== 'paid')
                    .reduce((acc, b) => acc + (b.amountRequired - b.amountPaid), 0);

                  return (
                    <tr key={student.id} className="hover:bg-gray-50/50 transition-colors">
                      <td className="px-6 py-4.5">
                        <div className="font-semibold text-gray-900">{student.name}</div>
                        <div className="text-xs font-mono text-gray-500 mt-0.5">NISN: {student.studentId}</div>
                      </td>
                      <td className="px-6 py-4.5">
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold bg-indigo-50 text-indigo-700 border border-indigo-100/60">
                          {student.classId}
                        </span>
                      </td>
                      <td className="px-6 py-4.5">
                        <div className="text-gray-800">{student.parentsName}</div>
                        <span className="text-xs text-gray-400">Status: Wali Sah</span>
                      </td>
                      <td className="px-6 py-4.5">
                        <div className="flex flex-col gap-0.5">
                          <span className="text-xs text-gray-600 flex items-center gap-1">
                            <Mail className="h-3 w-3 text-gray-400" />
                            {student.parentsEmail}
                          </span>
                          <span className="text-xs text-gray-600 flex items-center gap-1">
                            <span className="h-1.5 w-1.5 bg-emerald-500 rounded-full inline-block"></span>
                            WA: {student.parentsPhone}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-4.5">
                        <button
                          onClick={() => toggleStatus(student)}
                          className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-xs font-bold cursor-pointer transition-colors ${
                            student.status === 'active'
                              ? 'bg-indigo-50 text-indigo-700 hover:bg-indigo-100 border border-indigo-100/60'
                              : 'bg-slate-100 text-slate-600 hover:bg-slate-200 border border-slate-250/20'
                          }`}
                        >
                          <span className={`h-1.5 w-1.5 rounded-full ${student.status === 'active' ? 'bg-indigo-600' : 'bg-slate-500'}`}></span>
                          {student.status === 'active' ? 'Aktif' : 'Nonaktif'}
                        </button>
                      </td>
                      <td className="px-6 py-4.5">
                        <div className="flex items-center justify-center gap-1.5">
                          <button
                            onClick={() => setSelectedStudentDetail(student)}
                            className="p-1 px-2.5 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 rounded-lg transition-colors flex items-center gap-1 text-xs font-bold border border-indigo-100/80 cursor-pointer"
                            title="Lihat Detail Profil, Tunggakan, & Transaksi Siswa"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Detail
                          </button>
                          
                          {userRole !== 'operator' && (
                            <>
                              <button
                                onClick={() => handleEdit(student)}
                                className="p-1 px-2 hover:bg-gray-100 rounded-md text-gray-600 hover:text-indigo-600 transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer"
                                title="Edit data siswa"
                              >
                                <Edit2 className="h-3.5 w-3.5" />
                                Edit
                              </button>
                              <button
                                onClick={() => handleDelete(student.id)}
                                className="p-1 px-2 hover:bg-red-50 rounded-md text-gray-600 hover:text-red-600 transition-colors flex items-center gap-1 text-xs font-bold cursor-pointer"
                                title="Hapus data siswa"
                              >
                                <Trash2 className="h-3.5 w-3.5" />
                                Hapus
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400">
                    <UserPlus className="h-10 w-10 mx-auto opacity-40 mb-3 text-gray-500" />
                    Belum ada data siswa ditemukan. Silakan tambahkan siswa atau load data percontohan jika kosong.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Sum Footer Banner */}
        <div className="bg-gray-50/50 p-4 border-t border-gray-150 flex flex-col sm:flex-row justify-between text-xs text-gray-500 gap-2 font-medium">
          <div>Menampilkan {filteredStudents.length} dari total {students.length} siswa terdaftar.</div>
          <div>Unit Admin Komite Sekolah • Real-time Sync Data Pasif</div>
        </div>
      </div>

      {/* MODAL / DRAWER: DETAIL LENGKAP SISWA (PROFIL, TUNGGAKAN, TRANSAKSI, PROGRAM) */}
      {selectedStudentDetail && (() => {
        const studentBills = bills.filter(b => b.studentId === selectedStudentDetail.id);
        const totalRequired = studentBills.reduce((acc, b) => acc + b.amountRequired, 0);
        const totalPaid = studentBills.reduce((acc, b) => acc + b.amountPaid, 0);
        const totalArrears = totalRequired - totalPaid;

        const studentTransactions = transactions.filter(t => 
          t.studentId === selectedStudentDetail.id ||
          (selectedStudentDetail.name && t.description?.toLowerCase().includes(selectedStudentDetail.name.toLowerCase())) ||
          (selectedStudentDetail.studentId && t.description?.includes(selectedStudentDetail.studentId))
        );

        return (
          <div className="fixed inset-0 z-50 bg-slate-900/40 backdrop-blur-sm flex items-center justify-center p-3 sm:p-5 overflow-y-auto">
            <div className="bg-white rounded-3xl max-w-4xl w-full p-6 sm:p-8 shadow-2xl max-h-[92vh] flex flex-col animate-in fade-in zoom-in-95 duration-200 my-auto text-left">
              
              {/* Modal Header */}
              <div className="flex items-start justify-between pb-4 shrink-0 gap-4 border-b border-slate-100/80">
                <div className="space-y-1.5">
                  <div className="flex items-center gap-2">
                    <span className="text-[10px] font-extrabold text-indigo-700 uppercase tracking-widest bg-indigo-50/80 px-3 py-1 rounded-full shadow-2xs">
                      Rincian Siswa • TA {selectedAcademicYear}
                    </span>
                    <span className={`text-[10px] font-bold px-3 py-1 rounded-full shadow-2xs ${
                      selectedStudentDetail.status === 'active' ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'
                    }`}>
                      {selectedStudentDetail.status === 'active' ? 'Status: Aktif' : 'Status: Nonaktif'}
                    </span>
                  </div>
                  <h3 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
                    <User className="h-6 w-6 text-indigo-600 shrink-0" />
                    {selectedStudentDetail.name}
                  </h3>
                  <div className="flex flex-wrap items-center gap-x-5 gap-y-1 text-xs text-slate-500 font-medium">
                    <span>NISN: <strong className="text-slate-800 font-mono font-bold">{selectedStudentDetail.studentId}</strong></span>
                    <span>Kelas: <strong className="text-indigo-600 font-bold">{selectedStudentDetail.classId}</strong></span>
                    <span>Wali: <strong className="text-slate-800">{selectedStudentDetail.parentsName}</strong></span>
                    <span>No. HP: <strong className="text-slate-800">{selectedStudentDetail.parentsPhone}</strong></span>
                  </div>
                </div>

                <button
                  onClick={() => setSelectedStudentDetail(null)}
                  className="text-slate-400 hover:text-slate-700 p-2 rounded-2xl hover:bg-slate-100/80 transition-all cursor-pointer shrink-0"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {/* Financial Overview Cards - Borderless Elevated */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 my-5 shrink-0">
                <div className="bg-slate-50/90 rounded-2xl p-4 shadow-sm space-y-1">
                  <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider block">Total Kewajiban Iuran</span>
                  <div className="text-xl font-black text-slate-900">{formatIDR(totalRequired)}</div>
                  <span className="text-[11px] text-slate-400 font-medium block">{studentBills.length} Periode / Bulan Tagihan</span>
                </div>

                <div className="bg-emerald-50/70 rounded-2xl p-4 shadow-sm space-y-1">
                  <span className="text-[10px] font-extrabold text-emerald-800 uppercase tracking-wider block">Total Iuran Terbayar</span>
                  <div className="text-xl font-black text-emerald-700">{formatIDR(totalPaid)}</div>
                  <span className="text-[11px] text-emerald-600 font-medium block">{studentBills.filter(b => b.status === 'paid').length} Bulan Lunas</span>
                </div>

                <div className="bg-rose-50/70 rounded-2xl p-4 shadow-sm space-y-1">
                  <span className="text-[10px] font-extrabold text-rose-800 uppercase tracking-wider block">Sisa Tunggakan Belum Bayar</span>
                  <div className="text-xl font-black text-rose-700">{formatIDR(totalArrears)}</div>
                  <span className="text-[11px] text-rose-600 font-medium block">
                    {studentBills.filter(b => b.status !== 'paid').length} Bulan Belum Lunas
                  </span>
                </div>
              </div>

              {/* Scrollable Content Sections */}
              <div className="flex-1 overflow-y-auto space-y-6 my-1 pr-1.5 min-h-0">
                
                {/* SECTION 1: RIWAYAT & STATUS TUNGGAKAN IURAN */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                      <Clipboard className="h-4 w-4 text-indigo-600" />
                      Status Iuran & Tunggakan Siswa
                    </h4>
                    <span className="text-[11px] text-slate-400 font-medium">Total {studentBills.length} Bulan Tagihan</span>
                  </div>

                  {studentBills.length > 0 ? (
                    <div className="bg-slate-50/50 rounded-2xl overflow-hidden shadow-xs">
                      <table className="w-full text-xs text-left text-slate-600">
                        <thead className="bg-slate-100/70 text-[10px] text-slate-500 uppercase tracking-wider font-extrabold">
                          <tr>
                            <th className="py-3 px-4">Periode Bulan</th>
                            <th className="py-3 px-4">Nominal Tagihan</th>
                            <th className="py-3 px-4">Sudah Dibayar</th>
                            <th className="py-3 px-4">Jatuh Tempo</th>
                            <th className="py-3 px-4 text-right">Status</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100/70 font-medium bg-white">
                          {studentBills.map(bill => (
                            <tr key={bill.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3 px-4 font-bold text-slate-800">{bill.period}</td>
                              <td className="py-3 px-4 font-medium">{formatIDR(bill.amountRequired)}</td>
                              <td className="py-3 px-4 text-emerald-700 font-bold">{formatIDR(bill.amountPaid)}</td>
                              <td className="py-3 px-4 text-slate-400 font-mono text-[11px]">{bill.dueDate || '-'}</td>
                              <td className="py-3 px-4 text-right">
                                {bill.status === 'paid' ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-100/80 text-emerald-800 px-2.5 py-1 rounded-full font-extrabold shadow-2xs">
                                    <CheckCircle2 className="h-3 w-3" /> Lunas
                                  </span>
                                ) : bill.status === 'partially_paid' ? (
                                  <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100/80 text-amber-800 px-2.5 py-1 rounded-full font-extrabold shadow-2xs">
                                    <AlertCircle className="h-3 w-3" /> Cicilan
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1 text-[10px] bg-rose-100/80 text-rose-800 px-2.5 py-1 rounded-full font-extrabold shadow-2xs">
                                    <AlertCircle className="h-3 w-3" /> Belum Lunas
                                  </span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="bg-slate-50/70 rounded-2xl p-5 text-center text-slate-400 text-xs shadow-2xs">
                      Belum ada data tagihan iuran untuk siswa ini.
                    </div>
                  )}
                </div>

                {/* SECTION 2: RIWAYAT TRANSAKSI KAS & BUKTI BAYAR */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                      <CreditCard className="h-4 w-4 text-indigo-600" />
                      Riwayat Transaksi & Pembayaran Siswa
                    </h4>
                    <span className="text-[11px] text-slate-400 font-medium">{studentTransactions.length} Transaksi Tercatat</span>
                  </div>

                  {studentTransactions.length > 0 ? (
                    <div className="bg-slate-50/50 rounded-2xl overflow-hidden shadow-xs">
                      <table className="w-full text-xs text-left text-slate-600">
                        <thead className="bg-slate-100/70 text-[10px] text-slate-500 uppercase tracking-wider font-extrabold">
                          <tr>
                            <th className="py-3 px-4">Tanggal</th>
                            <th className="py-3 px-4">Keterangan / Deskripsi</th>
                            <th className="py-3 px-4">Metode Bayar</th>
                            <th className="py-3 px-4 text-right">Nominal</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100/70 font-medium bg-white">
                          {studentTransactions.map(trx => (
                            <tr key={trx.id} className="hover:bg-slate-50/80 transition-colors">
                              <td className="py-3 px-4 font-mono text-slate-500 text-[11px]">{trx.date}</td>
                              <td className="py-3 px-4 font-bold text-slate-800">{trx.description}</td>
                              <td className="py-3 px-4">
                                <span className="inline-block bg-slate-100 text-slate-700 px-2.5 py-0.5 rounded-full text-[10px] font-bold">
                                  {trx.paymentMethod || 'Kas Komite'}
                                </span>
                              </td>
                              <td className="py-3 px-4 text-right text-emerald-700 font-bold">{formatIDR(trx.amount)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="bg-slate-50/70 rounded-2xl p-5 text-center text-slate-400 text-xs shadow-2xs">
                      Belum ada riwayat transaksi masuk yang tercatat atas nama siswa ini.
                    </div>
                  )}
                </div>

                {/* SECTION 3: PROGRAM KERJA KOMITE & KONTRIBUSI */}
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-xs font-extrabold text-slate-800 uppercase tracking-wider flex items-center gap-2">
                      <Target className="h-4 w-4 text-indigo-600" />
                      Program Kerja Komite Yang Didukung Iuran Siswa
                    </h4>
                    <span className="text-[11px] text-slate-400 font-medium">{events.length} Program Kerja Terdaftar</span>
                  </div>

                  {events.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                      {events.map(evt => (
                        <div key={evt.id} className="bg-slate-50/80 rounded-2xl p-4 shadow-xs space-y-2 hover:shadow-sm transition-all">
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-extrabold text-xs text-slate-900">{evt.title}</span>
                            <span className={`text-[9px] font-extrabold px-2.5 py-0.5 rounded-full uppercase shrink-0 ${
                              evt.status === 'completed' ? 'bg-emerald-100 text-emerald-800' :
                              evt.status === 'active' ? 'bg-indigo-100 text-indigo-800' : 'bg-slate-200 text-slate-700'
                            }`}>
                              {evt.status === 'completed' ? 'Selesai' : evt.status === 'active' ? 'Berjalan' : 'Rencana'}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-500 line-clamp-2 leading-relaxed">{evt.description}</p>
                          <div className="text-[10px] text-indigo-600 font-bold pt-2 flex justify-between items-center border-t border-slate-200/50">
                            <span>Anggaran RAB: {formatIDR(evt.budgetTarget)}</span>
                            <span className="text-slate-400">{evt.date}</span>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="bg-slate-50/70 rounded-2xl p-5 text-center text-slate-400 text-xs shadow-2xs">
                      Belum ada program kerja komite terdaftar pada periode ini.
                    </div>
                  )}
                </div>

              </div>

              {/* Modal Footer */}
              <div className="pt-4 flex justify-end shrink-0">
                <button
                  onClick={() => setSelectedStudentDetail(null)}
                  className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs rounded-xl cursor-pointer transition-all shadow-md shadow-indigo-200 hover:shadow-lg"
                >
                  Tutup Rincian Siswa
                </button>
              </div>

            </div>
          </div>
        );
      })()}

    </div>
  );
}
