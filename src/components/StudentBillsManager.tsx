import React, { useState, useMemo } from 'react';
import { db, handleFirestoreError, OperationType, collection, doc, deleteDoc, updateDoc, setDoc, writeBatch } from '../firebase';
import { Student, StudentBill, Transaction } from '../types';
import { 
  Plus, Search, Filter, RefreshCw, X, CheckCircle2, AlertCircle, 
  CreditCard, ChevronDown, Check, Edit2, Trash2, Sliders, DollarSign,
  GraduationCap, ClipboardList, Send, Sparkles, CheckSquare, Square, 
  NotebookPen, ShieldCheck, Landmark, Tag
} from 'lucide-react';
import { getPeriodsForAcademicYear, getDueDateForPeriod, formatIDR } from '../utils';

interface StudentBillsManagerProps {
  bills: StudentBill[];             // Active bills filtered by active Academic Year in App.tsx
  allBills: StudentBill[];          // All bills in db
  students: Student[];             // Active students filtered by Academic Year
  allStudents: Student[];          // All students in db
  classes: string[];               // All classes in current system
  selectedAcademicYear: string;
  userRole?: 'admin' | 'operator';
  userEmail?: string;
}

export default function StudentBillsManager({
  bills,
  allBills,
  students,
  allStudents,
  classes,
  selectedAcademicYear,
  userRole,
  userEmail = 'demo.bendahara@komite.id'
}: StudentBillsManagerProps) {
  // Navigation & UI States
  const [showBulkPanel, setShowBulkPanel] = useState(false);
  const [showCustomBillForm, setShowCustomBillForm] = useState(false);

  // Table Filters
  const [searchQuery, setSearchQuery] = useState('');
  const [classFilter, setClassFilter] = useState('All');
  const [periodFilter, setPeriodFilter] = useState('All');
  const [statusFilter, setStatusFilter] = useState<'All' | 'paid' | 'partially_paid' | 'unpaid'>('All');

  // Modals / Interactive Form Actions Selection
  const [selectedBillForPayment, setSelectedBillForPayment] = useState<StudentBill | null>(null);
  const [selectedBillForEdit, setSelectedBillForEdit] = useState<StudentBill | null>(null);

  // Multi-select Checkboxes for Bulk Payment
  const [selectedBillIds, setSelectedBillIds] = useState<string[]>([]);

  // Individual Payment Form States
  const [payAmount, setPayAmount] = useState<number>(0);
  const [payMethod, setPayMethod] = useState<'Cash' | 'Transfer Bank' | 'E-Wallet'>('Transfer Bank');
  const [payDate, setPayDate] = useState(() => new Date().toISOString().substring(0, 10));
  const [payNote, setPayNote] = useState('');

  // Individual Adjusted Bill Form States
  const [editAmountRequired, setEditAmountRequired] = useState<number>(150000);
  const [editDueDate, setEditDueDate] = useState('');

  // Bulk Target Amount Settings States
  const [bulkClassTarget, setBulkClassTarget] = useState('All');
  const [bulkPeriodTarget, setBulkPeriodTarget] = useState('');
  const [bulkNewNominal, setBulkNewNominal] = useState<number>(150000);

  // Custom/Extra One-off Bill Generation States
  const [customBillStudentId, setCustomBillStudentId] = useState('');
  const [customBillPeriod, setCustomBillPeriod] = useState('');
  const [customBillPurpose, setCustomBillPurpose] = useState('Uang Gedung');
  const [customBillAmount, setCustomBillAmount] = useState<number>(200000);
  const [customBillDueDate, setCustomBillDueDate] = useState(() => new Date().toISOString().substring(0, 10));

  // Academic year period list from helper
  const academicYearPeriods = useMemo(() => {
    return getPeriodsForAcademicYear(selectedAcademicYear);
  }, [selectedAcademicYear]);

  // Set default period target for bulk operations
  React.useEffect(() => {
    if (academicYearPeriods.length > 0) {
      setBulkPeriodTarget(academicYearPeriods[0]);
      setCustomBillPeriod(academicYearPeriods[0]);
    }
  }, [academicYearPeriods]);

  // Filter bills list dynamically
  const filteredBills = useMemo(() => {
    return bills.filter(bill => {
      const matchesSearch = 
        bill.studentName.toLowerCase().includes(searchQuery.toLowerCase()) ||
        bill.studentId.includes(searchQuery) ||
        bill.parentsName.toLowerCase().includes(searchQuery.toLowerCase());
      
      const matchesClass = classFilter === 'All' || bill.studentClass === classFilter;
      const matchesPeriod = periodFilter === 'All' || bill.period === periodFilter;
      const matchesStatus = statusFilter === 'All' || bill.status === statusFilter;

      return matchesSearch && matchesClass && matchesPeriod && matchesStatus;
    });
  }, [bills, searchQuery, classFilter, periodFilter, statusFilter]);

  // High-level statistics calculation
  const billsStats = useMemo(() => {
    let totalTarget = 0;
    let totalPaid = 0;
    let paidCount = 0;
    let partialCount = 0;
    let unpaidCount = 0;

    // We calculate over the context of active bills in current view (filtered by selected year)
    bills.forEach(b => {
      totalTarget += b.amountRequired;
      totalPaid += b.amountPaid;
      if (b.status === 'paid') paidCount++;
      else if (b.status === 'partially_paid') partialCount++;
      else unpaidCount++;
    });

    const totalOutstanding = totalTarget - totalPaid;
    const collectionPercentage = totalTarget > 0 ? Math.round((totalPaid / totalTarget) * 100) : 0;

    return {
      totalTarget,
      totalPaid,
      totalOutstanding,
      collectionPercentage,
      paidCount,
      partialCount,
      unpaidCount,
      totalCount: bills.length
    };
  }, [bills]);

  // Checkbox multi-select helpers
  const handleToggleBillSelect = (id: string, isPaid: boolean) => {
    if (isPaid) return; // Ignore already fully paid bills
    setSelectedBillIds(prev => 
      prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]
    );
  };

  const handleToggleSelectAll = () => {
    const activeUnpaidIds = filteredBills
      .filter(b => b.status !== 'paid')
      .map(b => b.id);

    if (selectedBillIds.length === activeUnpaidIds.length && activeUnpaidIds.length > 0) {
      setSelectedBillIds([]);
    } else {
      setSelectedBillIds(activeUnpaidIds);
    }
  };

  // 1. INDIVIDUAL PAYMENT ACTION TRIGGER
  const handleOpenPayment = (bill: StudentBill) => {
    setSelectedBillForPayment(bill);
    setPayAmount(bill.amountRequired - bill.amountPaid);
    setPayMethod('Transfer Bank');
    setPayDate(new Date().toISOString().substring(0, 10));
    setPayNote('');
  };

  const handleProcessPayment = async () => {
    if (!selectedBillForPayment) return;
    if (payAmount <= 0) {
      alert("Masukkan nilai pembayaran yang valid!");
      return;
    }

    const maxDeficit = selectedBillForPayment.amountRequired - selectedBillForPayment.amountPaid;
    if (payAmount > maxDeficit) {
      const prompConfirmation = window.confirm(`Peringatan: Jumlah bayar (Rp ${payAmount.toLocaleString()}) melebihi sisa tagihan (Rp ${maxDeficit.toLocaleString()}). Apakah Anda tetap ingin menyimpan kelebihan pembayaran ini?`);
      if (!prompConfirmation) return;
    }

    try {
      const batch = writeBatch(db);
      const newPaidAmount = selectedBillForPayment.amountPaid + payAmount;
      const remains = selectedBillForPayment.amountRequired - newPaidAmount;
      const newStatus = remains <= 0 ? 'paid' : (newPaidAmount > 0 ? 'partially_paid' : 'unpaid');

      // 1. Update Student bill state
      const billRef = doc(db, 'student_bills', selectedBillForPayment.id);
      batch.update(billRef, {
        amountPaid: Math.min(newPaidAmount, selectedBillForPayment.amountRequired), // cap visually or keep excess
        status: newStatus,
        updatedAt: new Date().toISOString()
      });

      // 2. Create Ledger Transaction mapping to keep accounting coherent
      const txId = `tx_iuran_${Date.now()}`;
      const newTx: Transaction = {
        id: txId,
        date: payDate,
        type: 'income',
        category: 'Iuran Bulanan',
        amount: payAmount,
        description: `Iuran ${selectedBillForPayment.period} - ${selectedBillForPayment.studentName} (${selectedBillForPayment.studentClass}) ${payNote ? `• [${payNote}]` : ''}`,
        studentId: selectedBillForPayment.studentId,
        studentName: selectedBillForPayment.studentName,
        classId: selectedBillForPayment.studentClass,
        period: selectedBillForPayment.period,
        paymentMethod: payMethod,
        recordedBy: userEmail,
        createdAt: new Date().toISOString()
      };

      const txRef = doc(db, 'transactions', txId);
      batch.set(txRef, newTx);

      await batch.commit();
      alert(`Pembayaran senilai Rp ${payAmount.toLocaleString()} sukses dicatatkan untuk ${selectedBillForPayment.studentName}!`);
      
      setSelectedBillForPayment(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `student_bills/${selectedBillForPayment?.id}`);
    }
  };

  // 2. INDIVIDUAL ADJUSTMENT / EDIT BILL TARGET Action
  const handleOpenEdit = (bill: StudentBill) => {
    if (userRole === 'operator') {
      alert("Akses Terbatas: Hanya Administrator/Bendahara yang dapat menyesuaikan struktur tagihan siswa.");
      return;
    }
    setSelectedBillForEdit(bill);
    setEditAmountRequired(bill.amountRequired);
    setEditDueDate(bill.dueDate);
  };

  const handleProcessAdjustment = async () => {
    if (!selectedBillForEdit) return;
    if (editAmountRequired < 0) {
      alert("Nominal tagihan tidak boleh bernilai negatif!");
      return;
    }

    try {
      const remains = editAmountRequired - selectedBillForEdit.amountPaid;
      const newStatus = remains <= 0 ? 'paid' : (selectedBillForEdit.amountPaid > 0 ? 'partially_paid' : 'unpaid');

      const billRef = doc(db, 'student_bills', selectedBillForEdit.id);
      await updateDoc(billRef, {
        amountRequired: editAmountRequired,
        status: newStatus,
        dueDate: editDueDate,
        updatedAt: new Date().toISOString()
      });

      alert(`Struktur tagihan ${selectedBillForEdit.studentName} periode ${selectedBillForEdit.period} sukses disesuaikan!`);
      setSelectedBillForEdit(null);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `student_bills/${selectedBillForEdit?.id}`);
    }
  };

  // 3. INDIVIDUAL BILL DELETION Action (Admin only)
  const handleDeleteBill = async (bill: StudentBill) => {
    if (userRole === 'operator') {
      alert("Akses Terbatas: Sesi Operator tidak berhak menghapus berkas tagihan.");
      return;
    }

    if (!window.confirm(`Apakah Anda yakin ingin menghapus tagihan iuran periode ${bill.period} untuk ${bill.studentName}?\nTindakan ini permanen.`)) {
      return;
    }

    try {
      const billRef = doc(db, 'student_bills', bill.id);
      await deleteDoc(billRef);
      alert(`Berkas tagihan ${bill.studentName} (${bill.period}) sukses dihapus.`);
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, `student_bills/${bill.id}`);
    }
  };

  // 4. BULK ADJUST PAYMENT NOMINAL BY CLASS AND PERIOD
  const handleBulkUpdateNominal = async () => {
    if (userRole === 'operator') {
      alert("Akses Terbatas: Hanya Bendahara yang dapat mengubah aturan nominal massal.");
      return;
    }

    if (!bulkPeriodTarget) {
      alert("Pilih periode sasaran!");
      return;
    }

    if (bulkNewNominal < 0) {
      alert("Nominal iuran baru tidak boleh bernilai negatif!");
      return;
    }

    const confirmMsg = `Peringatan: Anda akan mengubah nominal wajib iuran periode "${bulkPeriodTarget}" untuk ` +
      `${bulkClassTarget === 'All' ? 'SEMUA Kelas' : `Kelas ${bulkClassTarget}`} menjadi ` +
      `Rp ${bulkNewNominal.toLocaleString()}/bulan.\n` +
      `Sistem otomatis menyelaraskan sisa pencatatan status tagihan siswa yang bersangkutan.\n\n` +
      `Apakah Anda yakin ingin memproses perubahan massal ini?`;

    if (!window.confirm(confirmMsg)) {
      return;
    }

    try {
      const batch = writeBatch(db);
      
      // Select bills matching conditions
      const targetBillsToUpdate = bills.filter(b => {
        const matchesClass = bulkClassTarget === 'All' || b.studentClass === bulkClassTarget;
        const matchesPeriod = b.period === bulkPeriodTarget;
        return matchesClass && matchesPeriod;
      });

      if (targetBillsToUpdate.length === 0) {
        alert("Tidak ditemukan berkas data tagihan siswa yang cocok dengan kriteria filter perpindahan tersebut.");
        return;
      }

      targetBillsToUpdate.forEach(b => {
        const newRemains = bulkNewNominal - b.amountPaid;
        const newStatus = newRemains <= 0 ? 'paid' : (b.amountPaid > 0 ? 'partially_paid' : 'unpaid');

        const billRef = doc(db, 'student_bills', b.id);
        batch.update(billRef, {
          amountRequired: bulkNewNominal,
          status: newStatus,
          updatedAt: new Date().toISOString()
        });
      });

      await batch.commit();
      alert(`Sukses memperbarui nominal kontribusi periode "${bulkPeriodTarget}" untuk ${targetBillsToUpdate.length} tagihan siswa senilai Rp ${bulkNewNominal.toLocaleString()}/bulan!`);
      setShowBulkPanel(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'bulk_student_bills_adjustment');
    }
  };

  // 5. BULK COLLECTIVE PAYMENT ON MULTIPLE SELECTED BILLS
  const handleBulkCollectivePayment = async () => {
    if (selectedBillIds.length === 0) {
      alert("Silakan centang tagihan siswa yang ingin dilunasi terlebih dahulu!");
      return;
    }

    const confirmation = window.confirm(`Apakah Anda yakin ingin melunasi SECARA MASSAL ${selectedBillIds.length} tagihan iuran terpilih menggunakan metode pembayaran lunas tunai?`);
    if (!confirmation) return;

    try {
      const batch = writeBatch(db);
      const paymentDate = new Date().toISOString().substring(0, 10);

      selectedBillIds.forEach(id => {
        const activeBillObj = bills.find(b => b.id === id);
        if (activeBillObj) {
          const outstandingDebt = activeBillObj.amountRequired - activeBillObj.amountPaid;
          if (outstandingDebt > 0) {
            // Update Bill status
            const billRef = doc(db, 'student_bills', activeBillObj.id);
            batch.update(billRef, {
              amountPaid: activeBillObj.amountRequired, // Mark wholly paid
              status: 'paid',
              updatedAt: new Date().toISOString()
            });

            // Create appropriate bookkeeping Cash Flow Transaction record in batch
            const txId = `tx_bulk_pay_${activeBillObj.id}_${Date.now()}`;
            const newTxObj: Transaction = {
              id: txId,
              date: paymentDate,
              type: 'income',
              category: 'Iuran Bulanan',
              amount: outstandingDebt,
              description: `Pelunasan Kolektif Bulanan - ${activeBillObj.studentName} (${activeBillObj.studentClass}) [TA ${selectedAcademicYear}]`,
              studentId: activeBillObj.studentId,
              studentName: activeBillObj.studentName,
              classId: activeBillObj.studentClass,
              period: activeBillObj.period,
              paymentMethod: 'Cash',
              recordedBy: userEmail,
              createdAt: new Date().toISOString()
            };
            const txRef = doc(db, 'transactions', txId);
            batch.set(txRef, newTxObj);
          }
        }
      });

      await batch.commit();
      alert(`Berhasil melunasi ${selectedBillIds.length} tagihan siswa secara kolektif.`);
      setSelectedBillIds([]);
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, 'bulk_collective_billing_liquidation');
    }
  };

  // 6. GENERATE ONE-OFF EXTRA CUSTOM BILL FOR A STUDENT
  const handleGenerateCustomBill = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userRole === 'operator') {
      alert("Akses Terbatas: Operator tidak diizinkan menciptakan pos pungutan kustom.");
      return;
    }

    if (!customBillStudentId) {
      alert("Pilih siswa tujuan terlebih dahulu!");
      return;
    }

    if (!customBillPurpose.trim()) {
      alert("Isikan keperluan/nama iuran kustom!");
      return;
    }

    if (customBillAmount <= 0) {
      alert("Nominal iuran kustom harus bernilai positif!");
      return;
    }

    // Lookup student objects
    const targetStudent = students.find(s => s.id === customBillStudentId);
    if (!targetStudent) {
      alert("Siswa tujuan tidak valid atau tidak aktif!");
      return;
    }

    const uniqueBillId = `bill_custom_${targetStudent.id}_${customBillPurpose.replace(/\s+/g, '_')}_${Date.now()}`;

    try {
      const payload: StudentBill = {
        id: uniqueBillId,
        studentId: targetStudent.id,
        studentName: targetStudent.name,
        studentClass: targetStudent.classId,
        parentsName: targetStudent.parentsName,
        parentsPhone: targetStudent.parentsPhone,
        parentsEmail: targetStudent.parentsEmail,
        period: `${customBillPeriod} (${customBillPurpose})`,
        amountRequired: customBillAmount,
        amountPaid: 0,
        status: 'unpaid',
        dueDate: customBillDueDate,
        updatedAt: new Date().toISOString()
      };

      await setDoc(doc(db, 'student_bills', uniqueBillId), payload);
      alert(`Sukses menambahkan pos tagihan kustom "${customBillPurpose}" senilai Rp ${customBillAmount.toLocaleString()} untuk ${targetStudent.name}!`);
      
      // Reset forms
      setCustomBillPurpose('Uang Gedung');
      setCustomBillAmount(200000);
      setShowCustomBillForm(false);
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, `student_bills/${uniqueBillId}`);
    }
  };

  return (
    <div id="student-bills-manager-module font-sans" className="space-y-6">
      
      {/* 1. VISUAL STATISTICS DASHBOARD HEADER */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        
        {/* Total Target Card */}
        <div className="bg-gradient-to-br from-white via-[#f7fafc] to-[#e6f0f6] rounded-3xl p-5 shadow-xs flex items-center justify-between text-left">
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold text-[#003049]/70 uppercase tracking-widest block font-sans">Kebutuhan Anggaran Iuran</span>
            <span className="text-lg font-black text-[#003049] block font-mono">{formatIDR(billsStats.totalTarget)}</span>
            <span className="text-[10px] text-slate-500 font-semibold block">Dari total {billsStats.totalCount} berkas tertagih</span>
          </div>
          <div className="h-11 w-11 bg-[#003049]/10 rounded-2xl flex items-center justify-center text-[#003049] shadow-2xs">
            <ClipboardList className="h-5 w-5" />
          </div>
        </div>

        {/* Total Collected Card */}
        <div className="bg-gradient-to-br from-white via-[#fdf0d5]/30 to-[#f0fdf4] rounded-3xl p-5 shadow-xs text-left">
          <div className="flex items-center justify-between mb-2">
            <div className="space-y-0.5">
              <span className="text-[10px] font-extrabold text-emerald-800/80 uppercase tracking-widest block font-sans">Iuran Telah Diterima</span>
              <span className="text-lg font-black text-emerald-700 block font-mono">+{formatIDR(billsStats.totalPaid)}</span>
            </div>
            <div className="h-10 w-10 bg-emerald-100/80 rounded-2xl flex items-center justify-center text-emerald-700 shadow-2xs">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
          {/* Progress bar info */}
          <div className="space-y-1.5 pt-1.5 border-t border-emerald-100/60">
            <div className="flex justify-between text-[10px] text-slate-600 font-bold">
              <span>Rasio Likuiditas Tagihan</span>
              <span className="text-emerald-700 font-extrabold">{billsStats.collectionPercentage}%</span>
            </div>
            <div className="w-full bg-slate-200/70 h-2 rounded-full overflow-hidden">
              <div 
                className="bg-emerald-600 h-full rounded-full transition-all duration-500" 
                style={{ width: `${billsStats.collectionPercentage}%` }}
              ></div>
            </div>
          </div>
        </div>

        {/* Remaining Dues Outstanding Card */}
        <div className="bg-gradient-to-br from-white via-[#fff5f5] to-[#fde8e8] rounded-3xl p-5 shadow-xs flex items-center justify-between text-left">
          <div className="space-y-1">
            <span className="text-[10px] font-extrabold text-[#780000]/80 uppercase tracking-widest block font-sans">Sisa Piutang Berjalan</span>
            <span className="text-lg font-black text-[#c1121f] block font-mono">{formatIDR(billsStats.totalOutstanding)}</span>
            <span className="text-[10px] text-slate-500 font-semibold block">Wajib ditagih & direkonsiliasi</span>
          </div>
          <div className="h-11 w-11 bg-[#c1121f]/10 rounded-2xl flex items-center justify-center text-[#c1121f] shadow-2xs">
            <AlertCircle className="h-5 w-5" />
          </div>
        </div>

        {/* Distribution Indicator */}
        <div className="bg-gradient-to-br from-white via-[#fffbeb] to-[#fdf0d5]/60 rounded-3xl p-5 shadow-xs flex items-center justify-between text-left">
          <div className="space-y-1.5 w-full">
            <span className="text-[10px] font-extrabold text-amber-900/80 uppercase tracking-widest block font-sans">Distribusi Status Tagihan</span>
            <div className="flex gap-2 text-[10px] font-bold">
              <div className="flex-1 bg-emerald-100/80 text-emerald-800 p-1.5 rounded-xl text-center shadow-2xs">
                <span className="block font-black">{billsStats.paidCount}</span> Lunas
              </div>
              <div className="flex-1 bg-amber-100/80 text-amber-900 p-1.5 rounded-xl text-center shadow-2xs">
                <span className="block font-black">{billsStats.partialCount}</span> Partial
              </div>
              <div className="flex-1 bg-rose-100/80 text-rose-900 p-1.5 rounded-xl text-center shadow-2xs">
                <span className="block font-black">{billsStats.unpaidCount}</span> Belum
              </div>
            </div>
          </div>
        </div>

      </div>

      {/* 2. ADMIN CORE OPERATIONS QUICK ACCESS BAR */}
      <div className="flex flex-wrap items-center gap-3 no-print">
        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-widest block mr-1">Aksi Khusus Bendahara:</span>
        
        <button
          id="btn-toggle-bulk-panel"
          onClick={() => { setShowBulkPanel(!showBulkPanel); setShowCustomBillForm(false); }}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs border ${
            showBulkPanel 
              ? 'bg-indigo-600 text-white border-indigo-700' 
              : 'bg-indigo-50 border-indigo-150 hover:bg-indigo-100 text-indigo-700'
          }`}
        >
          <Sliders className="h-3.5 w-3.5" />
          {showBulkPanel ? 'Tutup Atur Kontribusi Massal' : 'Atur Nominal Kontribusi Massal'}
        </button>

        <button
          id="btn-toggle-custom-bill"
          onClick={() => { setShowCustomBillForm(!showCustomBillForm); setShowBulkPanel(false); }}
          className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer shadow-xs border ${
            showCustomBillForm 
              ? 'bg-teal-600 text-white border-teal-700' 
              : 'bg-teal-50 border-teal-150 hover:bg-teal-100 text-teal-700'
          }`}
        >
          <Plus className="h-3.5 w-3.5" />
          {showCustomBillForm ? 'Batal Tagihan Tambahan' : 'Buat Tagihan Tambahan / Kustom'}
        </button>
      </div>

      {/* 3. COLLAPSIBLE ACTIONS PANELS */}
      
      {/* A. Mass Setup Nominal Fee Panel */}
      {showBulkPanel && (
        <div className="bg-white border border-indigo-150 rounded-2xl p-6 shadow-md space-y-4 text-left">
          <div className="border-b border-gray-100 pb-3">
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <Sparkles className="h-4.5 w-4.5 text-indigo-600" />
              Atur Ulang Nominal Kontribusi Wajib Masal (Mass Update)
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Berguna jika kontribusi atau biaya iuran untuk kelas tertentu dalam bulan sasaran tidak sama dengan nominal standar iuran (misal: pemberian kompensasi, beasiswa, kebijakan khusus, dlsb).
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 items-end text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1 uppercase tracking-wider">1. Pilih Kelas Sasaran *</label>
              <select
                value={bulkClassTarget}
                onChange={(e) => setBulkClassTarget(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg px-3 py-2 font-semibold text-slate-800"
              >
                <option value="All">Semua Rombongan Kelas</option>
                {classes.map(c => (
                  <option key={c} value={c}>{c}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1 uppercase tracking-wider">2. Pilih Bulan Sasaran *</label>
              <select
                value={bulkPeriodTarget}
                onChange={(e) => setBulkPeriodTarget(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg px-3 py-2 font-semibold text-slate-800"
              >
                {academicYearPeriods.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1 uppercase tracking-wider">3. Nominal Tagihan Baru (IDR) *</label>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-[10px] font-black text-slate-400">Rp</span>
                <input
                  type="number"
                  placeholder="150000"
                  value={bulkNewNominal || ''}
                  onChange={(e) => setBulkNewNominal(Math.max(0, parseInt(e.target.value, 10) || 0))}
                  className="w-full pl-8 pr-3 py-2 bg-slate-50 border border-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-lg font-black text-slate-800"
                />
              </div>
            </div>

            <div>
              <button
                type="button"
                onClick={handleBulkUpdateNominal}
                className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-2 rounded-lg transition-all cursor-pointer shadow-2xs flex items-center justify-center gap-1.5"
              >
                <Check className="h-4 w-4" />
                Daftarkan & Terapkan Perubahan
              </button>
            </div>
          </div>
        </div>
      )}

      {/* B. Generate One-off Custom Extra Bill Panel */}
      {showCustomBillForm && (
        <form onSubmit={handleGenerateCustomBill} className="bg-white border border-teal-150 rounded-2xl p-6 shadow-md space-y-4 text-left">
          <div className="border-b border-gray-100 pb-3">
            <h3 className="text-sm font-black text-slate-900 flex items-center gap-2">
              <Tag className="h-4.5 w-4.5 text-teal-600" />
              Buat Tagihan Tambahan / Custom untuk Siswa Tertentu
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Gunakan formulir ini untuk menambahkan tagihan khusus di luar iuran iuran bulanan rutin (misal: Uang Pangkal Gedung, Biaya Kegiatan Wisata Edukasi, Buku Panduan, seragam serakah, dll.).
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-5 gap-4 text-xs">
            <div>
              <label className="block font-bold text-slate-700 mb-1 uppercase tracking-wider">1. Pilih Siswa Penerima *</label>
              <select
                value={customBillStudentId}
                onChange={(e) => setCustomBillStudentId(e.target.value)}
                required
                className="w-full bg-slate-50 border border-slate-100 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-lg px-3 py-2 font-bold text-slate-800"
              >
                <option value="">-- Pilih Siswa Penerima --</option>
                {students.map(s => (
                  <option key={s.id} value={s.id}>{s.name} ({s.classId}) - {s.studentId}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1 uppercase tracking-wider">2. Label Tagihan Kustom *</label>
              <input
                type="text"
                placeholder="cth: Sumbangan Gotong Royong / Support Sarana Belajar"
                value={customBillPurpose}
                onChange={(e) => setCustomBillPurpose(e.target.value)}
                required
                className="w-full bg-slate-50 border border-slate-100 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-lg px-3 py-2 font-bold text-slate-800"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1 uppercase tracking-wider">3. Periode Atribusi *</label>
              <select
                value={customBillPeriod}
                onChange={(e) => setCustomBillPeriod(e.target.value)}
                required
                className="w-full bg-slate-50 border border-slate-100 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-lg px-3 py-2 font-bold text-slate-800"
              >
                {academicYearPeriods.map(p => (
                  <option key={p} value={p}>{p}</option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1 uppercase tracking-wider">4. Nominal Tagihan Kustom *</label>
              <input
                type="number"
                placeholder="200000"
                value={customBillAmount || ''}
                onChange={(e) => setCustomBillAmount(Math.max(1, parseInt(e.target.value, 10) || 0))}
                required
                className="w-full bg-slate-50 border border-slate-100 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-lg px-3 py-2 font-black text-slate-800"
              />
            </div>

            <div>
              <label className="block font-bold text-slate-700 mb-1 uppercase tracking-wider">5. Tanggal Jatuh Tempo *</label>
              <input
                type="date"
                value={customBillDueDate}
                onChange={(e) => setCustomBillDueDate(e.target.value)}
                required
                className="w-full bg-slate-50 border border-slate-100 focus:border-teal-500 focus:ring-1 focus:ring-teal-500 rounded-lg px-3 py-2 font-bold text-slate-800"
              />
            </div>
          </div>

          <div className="flex justify-end pt-2">
            <button
              type="submit"
              className="bg-teal-600 hover:bg-teal-700 text-white font-bold py-2 px-5 rounded-lg transition-all text-xs cursor-pointer shadow-2xs flex items-center gap-1.5"
            >
              <Plus className="h-4 w-4" />
              Menerbitkan Tagihan Tambahan Baru
            </button>
          </div>
        </form>
      )}

      {/* 4. MAIN INTERACTIVE FILTER & SEARCH CAPABILITIES */}
      <div className="bg-white border border-slate-100 rounded-2xl p-4 shadow-2xs flex flex-col md:flex-row gap-4 items-center justify-between">
        
        {/* Search Bar text */}
        <div className="relative w-full md:max-w-xs">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            placeholder="Cari siswa, NISN, atau orang tua..."
            value={searchQuery}
            onChange={(e) => { setSearchQuery(e.target.value); setSelectedBillIds([]); }}
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl text-xs font-semibold placeholder:text-slate-400 outline-none transition-all text-slate-800"
          />
        </div>

        {/* Dropdowns Filters block */}
        <div className="w-full md:w-auto flex flex-wrap md:flex-nowrap gap-3 text-xs">
          
          {/* Class selection filter */}
          <div className="flex-1 md:flex-initial flex items-center bg-slate-50 border border-slate-100 rounded-xl px-2.5 py-1.5 gap-1.5 shadow-3xs">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={classFilter}
              onChange={(e) => { setClassFilter(e.target.value); setSelectedBillIds([]); }}
              className="bg-transparent border-none outline-none font-bold text-slate-800 focus:ring-0 text-[11px] cursor-pointer"
            >
              <option value="All">Semua Rombel</option>
              {classes.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>

          {/* Monthly Period selector */}
          <div className="flex-1 md:flex-initial flex items-center bg-slate-50 border border-slate-100 rounded-xl px-2.5 py-1.5 gap-1.5 shadow-3xs">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={periodFilter}
              onChange={(e) => { setPeriodFilter(e.target.value); setSelectedBillIds([]); }}
              className="bg-transparent border-none outline-none font-bold text-slate-800 focus:ring-0 text-[11px] cursor-pointer"
            >
              <option value="All">Semua Bulan</option>
              {academicYearPeriods.map(p => (
                <option key={p} value={p}>{p}</option>
              ))}
            </select>
          </div>

          {/* Payment Status Dropdown selector */}
          <div className="flex-1 md:flex-initial flex items-center bg-slate-50 border border-slate-100 rounded-xl px-2.5 py-1.5 gap-1.5 shadow-3xs">
            <Filter className="h-3.5 w-3.5 text-slate-400" />
            <select
              value={statusFilter}
              onChange={(e) => { setStatusFilter(e.target.value as any); setSelectedBillIds([]); }}
              className="bg-transparent border-none outline-none font-bold text-slate-800 focus:ring-0 text-[11px] cursor-pointer"
            >
              <option value="All">Semua Status</option>
              <option value="paid">Lunas (Paid)</option>
              <option value="partially_paid">Kurang Bayar (Partial)</option>
              <option value="unpaid">Belum Lunas (Unpaid)</option>
            </select>
          </div>

          {/* Reset Filters action */}
          {(searchQuery || classFilter !== 'All' || periodFilter !== 'All' || statusFilter !== 'All') && (
            <button
              onClick={() => {
                setSearchQuery('');
                setClassFilter('All');
                setPeriodFilter('All');
                setStatusFilter('All');
                setSelectedBillIds([]);
              }}
              title="Bersihkan Semua Filter"
              className="p-1 px-2.5 rounded-lg border border-slate-100 text-slate-500 hover:text-slate-800 bg-white hover:bg-slate-50 transition-all font-bold tracking-tight text-[11px] flex items-center gap-1 cursor-pointer"
            >
              <RefreshCw className="h-3 w-3 animate-spin duration-1000" /> Reset
            </button>
          )}

        </div>
      </div>

      {/* 5. MULTI-SELECT COLLECTIVE BATCH PAYMENT BANNER */}
      {selectedBillIds.length > 0 && (
        <div className="bg-amber-500 text-amber-950 px-5 py-3 rounded-2xl flex flex-col sm:flex-row items-center justify-between gap-4 font-bold text-xs shadow-md border border-amber-400">
          <div className="flex items-center gap-2">
            <CheckSquare className="h-5 w-5 text-amber-950 shrink-0" />
            <span>
              Ketuk untuk memproses <strong className="text-sm font-black underline">{selectedBillIds.length} tagihan siswa</strong> secara kolektif dengan Status Lunas Tunai.
            </span>
          </div>

          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => setSelectedBillIds([])}
              className="bg-amber-650 hover:bg-amber-700 bg-opacity-20 text-amber-950 border border-amber-950 border-opacity-20 py-2 px-4 rounded-xl font-bold hover:bg-opacity-30 cursor-pointer text-[11px] transition-all"
            >
              Batalkan Pilihan
            </button>
            <button
              type="button"
              onClick={handleBulkCollectivePayment}
              className="bg-amber-950 hover:bg-black text-white shrink-0 py-2 px-4.5 rounded-xl font-extrabold cursor-pointer border-none shadow-sm flex items-center gap-1.5 transition-all text-[11px]"
            >
              <CreditCard className="h-4 w-4" />
              Proses Bayar Kolektif ({selectedBillIds.length} Siswa)
            </button>
          </div>
        </div>
      )}

      {/* 6. PRIMARY BILLING RECORDS GRID TABLE */}
      <div className="bg-white border border-slate-100 rounded-2xl overflow-hidden shadow-2xs text-left">
        <div className="overflow-x-auto min-h-[300px]">
          <table className="w-full text-xs text-left text-slate-600">
            <thead className="bg-[#f8fafc] border-b border-slate-100 text-[10px] text-slate-500 uppercase tracking-widest font-extrabold font-sans">
              <tr>
                <th className="py-3 px-4 w-12 text-center no-print border-r border-slate-100">
                  <input
                    type="checkbox"
                    checked={
                      filteredBills.length > 0 && 
                      selectedBillIds.length === filteredBills.filter(b => b.status !== 'paid').map(b => b.id).length
                    }
                    onChange={handleToggleSelectAll}
                    className="h-4 w-4 text-indigo-600 border-slate-300 rounded focus:ring-indigo-500"
                  />
                </th>
                <th className="py-3.5 px-3">NISN / Siswa</th>
                <th className="py-3.5 px-3">Kelas</th>
                <th className="py-3.5 px-3">Bulan Atribusi</th>
                <th className="py-3.5 px-3">Batas Tempo</th>
                <th className="py-3.5 px-3 text-right">Nilai Tagihan</th>
                <th className="py-3.5 px-3 text-right bg-[#fcfdfd]">Jumlah Terbayar</th>
                <th className="py-3.5 px-3 text-right">Sisa Piutang</th>
                <th className="py-3.5 px-4 text-center">Status</th>
                <th className="py-3.5 px-4 text-center no-print">Tindakan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 font-medium">
              {filteredBills.length > 0 ? (
                filteredBills.map((bill) => {
                  const sisa = bill.amountRequired - bill.amountPaid;
                  const isPaid = bill.status === 'paid';
                  
                  return (
                    <tr 
                      key={bill.id} 
                      className={`hover:bg-slate-50/70 border-b border-slate-100 transition-colors ${
                        isPaid ? 'bg-emerald-50/10 text-slate-430' : 'bg-white'
                      } ${selectedBillIds.includes(bill.id) ? 'bg-amber-50/30' : ''}`}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-4 text-center no-print border-r border-slate-100">
                        <input
                          type="checkbox"
                          checked={selectedBillIds.includes(bill.id)}
                          disabled={isPaid}
                          onChange={() => handleToggleBillSelect(bill.id, isPaid)}
                          className="h-3.5 w-3.5 text-indigo-600 border-slate-300 rounded disabled:opacity-20 cursor-pointer"
                        />
                      </td>

                      {/* Student info */}
                      <td className="py-3 px-3">
                        <div className="space-y-0.5">
                          <span className="font-extrabold text-slate-900 block font-sans">{bill.studentName}</span>
                          <span className="font-mono text-[10px] text-slate-400 block font-bold block">{bill.studentId}</span>
                        </div>
                      </td>

                      {/* Class */}
                      <td className="py-3 px-3 font-semibold text-slate-700">{bill.studentClass}</td>

                      {/* Period */}
                      <td className="py-3 px-3 font-bold text-indigo-600">{bill.period}</td>

                      {/* Due Date */}
                      <td className="py-3 px-3 font-bold text-slate-520 font-mono text-[11px]">{bill.dueDate}</td>

                      {/* Amount Required */}
                      <td className="py-3 px-3 text-right font-black text-slate-900 font-mono">{formatIDR(bill.amountRequired)}</td>

                      {/* Amount Paid */}
                      <td className="py-3 px-3 text-right font-black text-emerald-600 font-mono bg-[#fcfdfd]/60">
                        {bill.amountPaid > 0 ? `+${formatIDR(bill.amountPaid)}` : formatIDR(0)}
                      </td>

                      {/* Sisa */}
                      <td className={`py-3 px-3 text-right font-black font-mono ${sisa <= 0 ? 'text-slate-400' : 'text-rose-600'}`}>
                        {formatIDR(sisa)}
                      </td>

                      {/* Status Badges */}
                      <td className="py-3 px-4 text-center">
                        {bill.status === 'paid' && (
                          <span className="inline-flex items-center gap-1 text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-150 px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider">
                            <Check className="h-2.5 w-2.5" /> Lunas
                          </span>
                        )}
                        {bill.status === 'partially_paid' && (
                          <span className="inline-flex items-center gap-1 text-[9px] bg-amber-50 text-amber-700 border border-amber-150 px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider">
                            Partial
                          </span>
                        )}
                        {bill.status === 'unpaid' && (
                          <span className="inline-flex items-center gap-1 text-[9px] bg-rose-50 text-rose-700 border border-rose-150 px-2.5 py-0.5 rounded-full font-black uppercase tracking-wider">
                            Belum Lunas
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-center no-print">
                        <div className="flex items-center justify-center gap-1">
                          
                          {/* Bayar Cepat button */}
                          <button
                            type="button"
                            onClick={() => handleOpenPayment(bill)}
                            disabled={isPaid}
                            title="Proses Pembayaran / Rekonsiliasi"
                            className={`p-1.5 rounded-lg transition-all border ${
                              isPaid
                                ? 'bg-slate-50 border-slate-100 text-slate-300 cursor-not-allowed'
                                : 'bg-indigo-50 border-indigo-100 hover:bg-indigo-100 text-indigo-700 cursor-pointer hover:shadow-3xs'
                            }`}
                          >
                            <CreditCard className="h-3.5 w-3.5" />
                          </button>

                          {/* Penyesuaian tagihan (Edit) */}
                          {userRole === 'admin' && (
                            <button
                              type="button"
                              onClick={() => handleOpenEdit(bill)}
                              title="Asosiasi Ulang Nominal / Format Jatuh Tempo"
                              className="p-1.5 rounded-lg border border-slate-100 bg-white hover:bg-slate-50 text-slate-500 hover:text-slate-800 transition-all cursor-pointer hover:shadow-3xs"
                            >
                              <Edit2 className="h-3.5 w-3.5" />
                            </button>
                          )}

                          {/* Hapus Bill */}
                          {userRole === 'admin' && (
                            <button
                              type="button"
                              onClick={() => handleDeleteBill(bill)}
                              title="Hapus Tagihan Permanen"
                              className="p-1.5 rounded-lg border border-red-100 bg-red-20/10 hover:bg-red-50 text-red-500 hover:text-red-700 transition-all cursor-pointer"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}

                        </div>
                      </td>
                    </tr>
                  );
                })
              ) : (
                <tr>
                  <td colSpan={10} className="py-12 text-center text-slate-400 bg-slate-50/30">
                    <div className="flex flex-col items-center justify-center gap-1.5 max-w-sm mx-auto">
                      <AlertCircle className="h-7 w-7 text-slate-300" />
                      <p className="font-bold text-xs">Pencatatan Tagihan Tidak Ditemukan</p>
                      <p className="text-[10px] text-slate-400 font-medium">
                        Tidak ada catatan rincian tagihan iuran siswa yang cocok dengan keyword pencarian, status, kelas, atau periode terpilih.
                      </p>
                    </div>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        
        {/* Table footer count metadata */}
        <div className="p-4 border-t border-slate-100 text-[10px] text-slate-500 font-bold bg-[#fafcfd] flex justify-between items-center">
          <span>Menampilkan {filteredBills.length} dari total {bills.length} data tagihan ({selectedAcademicYear}).</span>
          <span className="text-indigo-600 block">Aturan Otoritas Enforcing: Firestore Security Rules Secured (ABAC)</span>
        </div>
      </div>

      {/* 7. QUICK PAY DIALOG MODAL */}
      {selectedBillForPayment && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-100 shadow-2xl rounded-2xl w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-200 text-left">
            
            {/* Modal Header */}
            <div className="bg-[#f8fafc] border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <CreditCard className="h-4.5 w-4.5 text-indigo-600" />
                <h3 className="text-sm font-black text-slate-900 leading-none">Pembayaran & Rekonsiliasi Iuran</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBillForPayment(null)}
                className="text-slate-400 hover:text-slate-700 rounded-lg p-1 hover:bg-slate-50 outline-none cursor-pointer"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 text-xs">
              
              {/* Target info card */}
              <div className="bg-indigo-50/50 border border-indigo-100/50 rounded-xl p-4 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-[10px] font-extrabold text-[#798eb4] uppercase tracking-wider block">Wajib Iuran (Siswa)</span>
                  <span className="text-[10px] font-bold text-indigo-600 bg-indigo-50 px-2 py-0.2 rounded font-mono">{selectedBillForPayment.studentClass}</span>
                </div>
                <h4 className="text-sm font-black text-slate-900 leading-tight">{selectedBillForPayment.studentName}</h4>
                <div className="grid grid-cols-2 pt-2 gap-2 text-[10.5px] border-t border-indigo-100/30">
                  <div className="text-slate-500">
                    Siswa NISN: <strong className="text-slate-800 font-mono font-bold block">{selectedBillForPayment.studentId}</strong>
                  </div>
                  <div className="text-slate-500 text-right">
                    Periode / Bulan: <strong className="text-indigo-700 font-bold block">{selectedBillForPayment.period}</strong>
                  </div>
                </div>
              </div>

              {/* Outstanding ledger values */}
              <div className="grid grid-cols-3 gap-2 text-[10px] font-bold text-center">
                <div className="bg-slate-50 border border-slate-150 p-2 rounded-lg">
                  <span className="text-slate-400 uppercase tracking-wide block mb-0.5">Rencana Tagihan</span>
                  <span className="font-mono font-black text-slate-800 block leading-none">{formatIDR(selectedBillForPayment.amountRequired)}</span>
                </div>
                <div className="bg-slate-50 border border-slate-150 p-2 rounded-lg">
                  <span className="text-slate-400 uppercase tracking-wide block mb-0.5">Telah Bayar</span>
                  <span className="font-mono font-black text-emerald-600 block leading-none">{formatIDR(selectedBillForPayment.amountPaid)}</span>
                </div>
                <div className="bg-[#fffbeb] border border-[#fef3c7] p-2 rounded-lg">
                  <span className="text-amber-500 uppercase tracking-wide block mb-0.5">Sisa Tagihan</span>
                  <span className="font-mono font-black text-amber-700 block leading-none">{formatIDR(selectedBillForPayment.amountRequired - selectedBillForPayment.amountPaid)}</span>
                </div>
              </div>

              {/* Form entries */}
              <div className="space-y-3.5 pt-2">
                
                {/* 1. Pay input amount */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1 uppercase tracking-wider">Jumlah yang Dibayarkan (IDR) *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-slate-400">Rp</span>
                    <input
                      type="number"
                      required
                      value={payAmount || ''}
                      onChange={(e) => setPayAmount(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="w-full pl-8 pr-3.5 py-2.5 bg-slate-50 border border-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl font-black text-slate-800 text-sm outline-none"
                    />
                  </div>
                  {/* Quick toggle choices */}
                  <div className="flex gap-1.5 mt-1.5 font-bold text-[10px]">
                    <button
                      type="button"
                      onClick={() => setPayAmount(selectedBillForPayment.amountRequired - selectedBillForPayment.amountPaid)}
                      className="bg-[#fafbfd] border border-slate-100 hover:border-indigo-500 hover:bg-indigo-50/10 text-slate-600 p-1 px-2.5 rounded-lg font-bold"
                    >
                      Bayar Lunas (Sisa)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPayAmount(50000)}
                      className="bg-[#fafbfd] border border-slate-100 hover:border-indigo-500 hover:bg-indigo-50/10 text-slate-600 p-1 px-2.5 rounded-lg font-bold"
                    >
                      Rp 50.000
                    </button>
                    <button
                      type="button"
                      onClick={() => setPayAmount(100000)}
                      className="bg-[#fafbfd] border border-slate-100 hover:border-indigo-500 hover:bg-indigo-50/10 text-slate-600 p-1 px-2.5 rounded-lg font-bold"
                    >
                      Rp 100.000
                    </button>
                  </div>
                </div>

                {/* 2. Payment methods & Date */}
                <div className="grid grid-cols-2 gap-3.5">
                  <div>
                    <label className="block font-bold text-slate-700 mb-1 uppercase tracking-wider">Metode Bayar *</label>
                    <select
                      value={payMethod}
                      onChange={(e) => setPayMethod(e.target.value as any)}
                      className="w-full bg-slate-50 border border-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3 py-2.5 font-bold text-slate-800 cursor-pointer"
                    >
                      <option value="Transfer Bank">Transfer Bank</option>
                      <option value="Cash">Cash (Tunai)</option>
                      <option value="E-Wallet">E-Wallet (QRIS)</option>
                    </select>
                  </div>
                  <div>
                    <label className="block font-bold text-slate-700 mb-1 uppercase tracking-wider">Tanggal Bayar *</label>
                    <input
                      type="date"
                      value={payDate}
                      onChange={(e) => setPayDate(e.target.value)}
                      required
                      className="w-full bg-slate-50 border border-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-2.5 py-2 font-bold text-slate-800 cursor-pointer"
                    />
                  </div>
                </div>

                {/* 3. Payment notes description */}
                <div>
                  <label className="block font-bold text-slate-700 mb-1 uppercase tracking-wider">Catatan Opsional (Notes)</label>
                  <input
                    type="text"
                    placeholder="cth: Referensi no. transfer, cicilan pertama..."
                    value={payNote}
                    onChange={(e) => setPayNote(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3.5 py-2 font-semibold text-slate-800"
                  />
                </div>

              </div>

            </div>

            {/* Modal Action Buttons Footer */}
            <div className="bg-[#f8fafc] border-t border-slate-100 px-6 py-4 flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setSelectedBillForPayment(null)}
                className="px-4 py-2 border border-slate-100 text-slate-600 bg-white hover:bg-slate-50 rounded-xl font-bold cursor-pointer"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleProcessPayment}
                className="bg-indigo-600 hover:bg-indigo-700 text-white font-extrabold py-2 px-5 rounded-xl cursor-pointer shadow-xs flex items-center gap-1"
              >
                <Check className="h-4 w-4" />
                Konfirmasi & Cetak Mutasi Kas
              </button>
            </div>

          </div>
        </div>
      )}

      {/* 8. ADJUST/EDIT TARGET MODAL */}
      {selectedBillForEdit && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center z-50 p-4">
          <div className="bg-white border border-slate-100 shadow-2xl rounded-2xl w-full max-w-sm overflow-hidden animate-in fade-in zoom-in-95 duration-200 text-left">
            
            {/* Modal Header */}
            <div className="bg-[#f8fafc] border-b border-slate-100 px-6 py-4 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <NotebookPen className="h-4.5 w-4.5 text-indigo-600" />
                <h3 className="text-sm font-black text-slate-900 leading-none">Sesuaikan Tagihan Siswa</h3>
              </div>
              <button
                type="button"
                onClick={() => setSelectedBillForEdit(null)}
                className="text-slate-400 hover:text-slate-700 rounded-lg p-1 hover:bg-slate-50 outline-none"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4 text-xs">
              
              <div className="bg-slate-50 border border-slate-100/80 p-4.5 rounded-xl space-y-1 text-[11px]">
                <div className="text-slate-400 font-extrabold uppercase">Siswa / Donatur Wajib</div>
                <div className="text-xs font-black text-slate-900 leading-none">{selectedBillForEdit.studentName}</div>
                <div className="pt-1.5 font-bold text-slate-500">
                  Tagihan untuk periode <strong className="text-indigo-600">{selectedBillForEdit.period}</strong>
                </div>
              </div>

              <div className="space-y-3.5">
                
                <div>
                  <label className="block font-bold text-slate-700 mb-1 uppercase tracking-wider">Nominal Wajib Iuran (IDR) *</label>
                  <div className="relative">
                    <span className="absolute left-3 top-1/2 -translate-y-1/2 font-black text-slate-400">Rp</span>
                    <input
                      type="number"
                      required
                      value={editAmountRequired || ''}
                      onChange={(e) => setEditAmountRequired(Math.max(0, parseInt(e.target.value, 10) || 0))}
                      className="w-full pl-8 pr-3.5 py-2.5 bg-slate-50 border border-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl font-black text-slate-800 tracking-tight"
                    />
                  </div>
                  <span className="text-[10px] text-slate-450 mt-1 block">Telah dibayarkan oleh siswa: <strong className="text-emerald-600 font-mono font-bold leading-normal">{formatIDR(selectedBillForEdit.amountPaid)}</strong></span>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 mb-1 uppercase tracking-wider">Batas Tanggal Jatuh Tempo *</label>
                  <input
                    type="date"
                    required
                    value={editDueDate}
                    onChange={(e) => setEditDueDate(e.target.value)}
                    className="w-full bg-slate-50 border border-slate-100 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3 py-2 font-bold text-slate-800"
                  />
                </div>

              </div>

            </div>

            {/* Modal Footer Actions */}
            <div className="bg-[#f8fafc] border-t border-slate-100 px-6 py-4 flex justify-end gap-2 text-xs">
              <button
                type="button"
                onClick={() => setSelectedBillForEdit(null)}
                className="px-4 py-2 border border-slate-100 text-slate-600 bg-white hover:bg-slate-50 rounded-xl font-bold"
              >
                Batal
              </button>
              <button
                type="button"
                onClick={handleProcessAdjustment}
                className="bg-[#2563eb] hover:bg-[#1d4ed8] text-white font-extrabold py-2 px-5 rounded-xl transition-all shadow-xs"
              >
                Simpan Penyesuaian
              </button>
            </div>

          </div>
        </div>
      )}

    </div>
  );
}
