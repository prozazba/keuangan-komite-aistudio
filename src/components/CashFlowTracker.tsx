import React, { useState, useMemo } from 'react';
import { db, handleFirestoreError, OperationType, collection, doc, deleteDoc, writeBatch } from '../firebase';
import { Transaction, Student, StudentBill, Event } from '../types';
import { formatIDR, exportToCSV } from '../utils';
import { 
  Plus, ArrowDownLeft, ArrowUpRight, Search, Filter, 
  Download, Calendar, Trash2, CheckCircle2, AlertCircle, 
  Layers, CreditCard, ChevronDown, RefreshCw, X
} from 'lucide-react';

interface CashFlowTrackerProps {
  transactions: Transaction[];
  students: Student[];
  bills: StudentBill[];
  events: Event[];
  adminEmail: string;
  userRole?: 'admin' | 'operator';
  selectedAcademicYear?: string;
}

export default function CashFlowTracker({ 
  transactions, 
  students, 
  bills, 
  events, 
  adminEmail, 
  userRole,
  selectedAcademicYear = '2025/2026'
}: CashFlowTrackerProps) {
  // UI State
  const [showAddForm, setShowAddForm] = useState(false);
  
  // Form State
  const [type, setType] = useState<'income' | 'expense'>('income');
  const [date, setDate] = useState(() => new Date().toISOString().substring(0, 10));
  const [category, setCategory] = useState('Iuran Bulanan');
  const [amount, setAmount] = useState<number>(0);
  const [description, setDescription] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<'Cash' | 'Transfer Bank' | 'E-Wallet'>('Transfer Bank');
  
  // Relations State
  const [linkToBill, setLinkToBill] = useState(false);
  const [selectedBillId, setSelectedBillId] = useState('');
  const [linkToEvent, setLinkToEvent] = useState(false);
  const [selectedEventId, setSelectedEventId] = useState('');

  // Filtering State
  const [searchQuery, setSearchQuery] = useState('');
  const [filterType, setFilterType] = useState<'All' | 'income' | 'expense'>('All');
  const [filterCategory, setFilterCategory] = useState('All');

  // List of active unpaid/partially paid bills for select dropdown
  const outstandingBills = useMemo(() => {
    return bills.filter(b => b.status !== 'paid');
  }, [bills]);

  // Categories helper
  const categoriesList = type === 'income' 
    ? ['Iuran Bulanan', 'Sumbangan', 'Sponsorship', 'Hibah / Bantuan', 'Lain-lain']
    : ['Operasional Kantor', 'Sewa Inventaris', 'Kegiatan Acara', 'Aset Prasarana', 'Gaji & Insentif', 'Lain-lain'];

  // Handle setting Type state and auto-reset dependencies
  const handleTypeChange = (newType: 'income' | 'expense') => {
    setType(newType);
    setCategory(newType === 'income' ? 'Iuran Bulanan' : 'Operasional Kantor');
    setLinkToBill(false);
    setLinkToEvent(false);
    setSelectedBillId('');
    setSelectedEventId('');
  };

  // Handle Link to Bill Selection
  const handleBillSelect = (billId: string) => {
    setSelectedBillId(billId);
    if (!billId) return;
    const targetBill = bills.find(b => b.id === billId);
    if (targetBill) {
      const remainingAmount = targetBill.amountRequired - targetBill.amountPaid;
      setAmount(remainingAmount);
      setDescription(`Pembayaran iuran bulanan ${targetBill.period} - ${targetBill.studentName} (${targetBill.studentClass})`);
      setCategory('Iuran Bulanan');
    }
  };

  // Handle Link to Event Selection
  const handleEventSelect = (eventId: string) => {
    setSelectedEventId(eventId);
    if (!eventId) return;
    const targetEvent = events.find(e => e.id === eventId);
    if (targetEvent) {
      setDescription(`${type === 'income' ? 'Pemasukan' : 'Pengeluaran'} untuk kegiatan: ${targetEvent.title}`);
    }
  };

  // Submit Handler
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userRole === 'operator') {
      alert("Akses Terbatas: Hanya Bendahara (Admin) yang dapat mencatatkan mutasi kas baru.");
      return;
    }
    if (amount <= 0) {
      alert("Jumlah uang harus bernilai positif!");
      return;
    }

    try {
      const txId = `tx_${Date.now()}`;
      const batch = writeBatch(db);

      let studentId = '';
      let studentName = '';
      let classId = '';
      let period = '';

      // Prepare custom related transaction metadata
      if (type === 'income' && linkToBill && selectedBillId) {
        const selectedBill = bills.find(b => b.id === selectedBillId);
        if (selectedBill) {
          studentId = selectedBill.studentId;
          studentName = selectedBill.studentName;
          classId = selectedBill.studentClass;
          period = selectedBill.period;

          // Compute new Paid Amounts on the Student Bill
          const newAmountPaid = selectedBill.amountPaid + amount;
          const outstanding = selectedBill.amountRequired - newAmountPaid;
          const newStatus = outstanding <= 0 ? 'paid' : (newAmountPaid > 0 ? 'partially_paid' : 'unpaid');

          // Update Bill Doc status in batch
          const billRef = doc(db, 'student_bills', selectedBill.id);
          batch.update(billRef, {
            amountPaid: Math.min(newAmountPaid, selectedBill.amountRequired),
            status: newStatus,
            updatedAt: new Date().toISOString()
          });
        }
      }

      // If tied to an Event, increment event actual balance
      if (linkToEvent && selectedEventId) {
        const targetEvent = events.find(e => e.id === selectedEventId);
        if (targetEvent) {
          const eventRef = doc(db, 'events', selectedEventId);
          if (type === 'income') {
            batch.update(eventRef, {
              actualIncome: targetEvent.actualIncome + amount
            });
          } else {
            batch.update(eventRef, {
              actualExpense: targetEvent.actualExpense + amount
            });
          }
        }
      }

      // 1. Transaction Payload creation
      const txPayload: Transaction = {
        id: txId,
        date,
        type,
        category,
        amount,
        description: description.trim(),
        paymentMethod,
        recordedBy: adminEmail || 'Bendahara Komite',
        createdAt: new Date().toISOString()
      };

      if (studentId) txPayload.studentId = studentId;
      if (studentName) txPayload.studentName = studentName;
      if (classId) txPayload.classId = classId;
      if (period) txPayload.period = period;
      if (linkToEvent && selectedEventId) txPayload.eventId = selectedEventId;

      const txRef = doc(db, 'transactions', txId);
      batch.set(txRef, txPayload);

      // Execute atomic batch commits!
      await batch.commit();

      // Reset forms
      resetForm();
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'transactions');
    }
  };

  // Reset form helper
  const resetForm = () => {
    setShowAddForm(false);
    setType('income');
    setDate(new Date().toISOString().substring(0, 10));
    setCategory('Iuran Bulanan');
    setAmount(0);
    setDescription('');
    setPaymentMethod('Transfer Bank');
    setLinkToBill(false);
    setLinkToEvent(false);
    setSelectedBillId('');
    setSelectedEventId('');
  };

  // Revert/Delete Transaction
  const handleDelete = async (tx: Transaction) => {
    if (userRole === 'operator') {
      alert("Akses Terbatas: Hanya Bendahara (Admin) yang dapat menghapus/membatalkan mutasi kas.");
      return;
    }
    if (!window.confirm("Apakah Anda yakin ingin membatalkan/menghapus transaksi ini?")) {
      return;
    }

    try {
      const batch = writeBatch(db);

      // If it corrected a Student's Bill, we must restore the bill status back (un-pay the dues)!
      if (tx.type === 'income' && tx.studentId && tx.period) {
        const targetBillId = `${tx.studentId}_${tx.period.replace(' ', '_')}`;
        const targetBill = bills.find(b => b.id === targetBillId);
        if (targetBill) {
          const restoredAmountPaid = Math.max(0, targetBill.amountPaid - tx.amount);
          const restoredStatus = restoredAmountPaid <= 0 ? 'unpaid' : (restoredAmountPaid < targetBill.amountRequired ? 'partially_paid' : 'paid');
          
          const billRef = doc(db, 'student_bills', targetBillId);
          batch.update(billRef, {
            amountPaid: restoredAmountPaid,
            status: restoredStatus,
            updatedAt: new Date().toISOString()
          });
        }
      }

      // If it corrected an Event actual, deduct from the aggregate balance
      if (tx.eventId) {
        const targetEvent = events.find(e => e.id === tx.eventId);
        if (targetEvent) {
          const eventRef = doc(db, 'events', tx.eventId);
          if (tx.type === 'income') {
            batch.update(eventRef, {
              actualIncome: Math.max(0, targetEvent.actualIncome - tx.amount)
            });
          } else {
            batch.update(eventRef, {
              actualExpense: Math.max(0, targetEvent.actualExpense - tx.amount)
            });
          }
        }
      }

      // Delete the main transaction doc
      batch.delete(doc(db, 'transactions', tx.id));
      await batch.commit();
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'transactions');
    }
  };

  // Filter Transaction Logic
  const filteredTransactions = useMemo(() => {
    return transactions.filter(tx => {
      const matchesSearch = tx.description.toLowerCase().includes(searchQuery.toLowerCase()) || 
                            tx.category.toLowerCase().includes(searchQuery.toLowerCase()) ||
                            (tx.studentName && tx.studentName.toLowerCase().includes(searchQuery.toLowerCase()));
      const matchesType = filterType === 'All' || tx.type === filterType;
      const matchesCategory = filterCategory === 'All' || tx.category === filterCategory;
      return matchesSearch && matchesType && matchesCategory;
    }).sort((a,b) => b.date.localeCompare(a.date)); // Sort latest first
  }, [transactions, searchQuery, filterType, filterCategory]);

  // Aggregate stats
  const aggregateStats = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    
    transactions.forEach(t => {
      if (t.type === 'income') {
        totalIncome += t.amount;
      } else {
        totalExpense += t.amount;
      }
    });

    const netBalance = totalIncome - totalExpense;
    return { totalIncome, totalExpense, netBalance };
  }, [transactions]);

  // Unique Categories computed dynamically for filtration list
  const uniqueCategories = useMemo(() => {
    const categoriesSet = new Set<string>();
    transactions.forEach(t => categoriesSet.add(t.category));
    return Array.from(categoriesSet);
  }, [transactions]);

  // Handle Export CSV Action
  const handleExportCSV = () => {
    const headers = ["Tanggal", "ID Transaksi", "Tipe", "Kategori", "Jumlah Uang", "Deskripsi", "Siswa Assosiasi", "Tingkat Kelas", "Metode Pembayaran", "Pencatat"];
    const rows = filteredTransactions.map(t => [
      t.date,
      t.id,
      t.type === 'income' ? 'Pemasukan' : 'Pengeluaran',
      t.category,
      t.amount,
      t.description,
      t.studentName || '-',
      t.classId || '-',
      t.paymentMethod,
      t.recordedBy
    ]);
    exportToCSV(`Keuangan_Komite_Arus_Kas_${new Date().toISOString().substring(0, 10)}.csv`, headers, rows);
  };

  return (
    <div id="cash-flow-tracker-section" className="space-y-6">
      
      {/* 3-Bento Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-left">
        {/* Total Incoming */}
        <div className="bg-gradient-to-br from-white via-[#fdf0d5]/30 to-[#f0fdf4] rounded-3xl p-5 flex items-center justify-between shadow-xs">
          <div className="space-y-0.5 text-left">
            <span className="text-[10px] font-extrabold text-emerald-800/80 uppercase tracking-widest block">Total Pendapatan Komite</span>
            <span className="text-xl font-black text-emerald-700 block font-mono">{formatIDR(aggregateStats.totalIncome)}</span>
            <p className="text-[11px] text-slate-500 font-medium">Dari iuran wali murid & sumbangan</p>
          </div>
          <div className="h-11 w-11 bg-emerald-100/80 rounded-2xl flex items-center justify-center text-emerald-700 shadow-2xs">
            <ArrowDownLeft className="h-5 w-5" />
          </div>
        </div>

        {/* Total Outgoing */}
        <div className="bg-gradient-to-br from-white via-[#fff5f5] to-[#fde8e8] rounded-3xl p-5 flex items-center justify-between shadow-xs">
          <div className="space-y-0.5 text-left">
            <span className="text-[10px] font-extrabold text-[#780000]/80 uppercase tracking-widest block">Total Pengeluaran</span>
            <span className="text-xl font-black text-[#c1121f] block font-mono">{formatIDR(aggregateStats.totalExpense)}</span>
            <p className="text-[11px] text-slate-500 font-medium">Pembiayaan fasilitasi & acara</p>
          </div>
          <div className="h-11 w-11 bg-[#c1121f]/10 rounded-2xl flex items-center justify-center text-[#c1121f] shadow-2xs">
            <ArrowUpRight className="h-5 w-5" />
          </div>
        </div>

        {/* Balance Current */}
        <div className="bg-gradient-to-br from-white via-[#f7fafc] to-[#e6f0f6] rounded-3xl p-5 flex items-center justify-between shadow-xs">
          <div className="space-y-0.5 text-left">
            <span className="text-[10px] font-extrabold text-[#003049]/70 uppercase tracking-widest block">Sisa Saldo Kas Komite</span>
            <span className="text-xl font-black text-[#003049] block font-mono">{formatIDR(aggregateStats.netBalance)}</span>
            <p className="text-[11px] text-[#003049]/80 font-bold whitespace-nowrap">Buku Kas Transparan & Aktif</p>
          </div>
          <div className="h-11 w-11 bg-[#003049]/10 rounded-2xl flex items-center justify-center text-[#003049] shadow-2xs">
            <CreditCard className="h-5 w-5" />
          </div>
        </div>
      </div>

      {/* Main Bar actions */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/90 backdrop-blur-xs p-6 rounded-3xl shadow-xs">
        <div className="text-left">
          <h2 className="text-lg font-black text-[#003049] tracking-tight flex items-center gap-2">
            <Layers className="h-5 w-5 text-[#003049]" />
            Buku Transaksi Kas Komite Sekolah
          </h2>
          <p className="text-xs text-slate-500 mt-1 font-medium">
            Catat iuran gotong royong, sumbangan, serta pengeluaran program kerja Komite Sekolah secara transparan & akuntabel.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          <button
            onClick={handleExportCSV}
            className="flex items-center gap-2 border-none bg-slate-100 hover:bg-slate-200 text-[#003049] px-4 py-2.5 rounded-2xl text-xs font-bold transition-all cursor-pointer shadow-2xs"
          >
            <Download className="h-4 w-4" />
            Ekspor CSV
          </button>
          {userRole === 'operator' ? (
            <div className="text-xs bg-amber-50 text-amber-800 py-2 px-3.5 rounded-2xl font-bold flex items-center gap-1.5 shadow-2xs">
              <AlertCircle className="h-4 w-4 shrink-0 text-amber-600" />
              <span>Akses Terbatas: Sesi Operator</span>
            </div>
          ) : (
            <button
              id="btn-add-transaction"
              onClick={() => { resetForm(); setShowAddForm(!showAddForm); }}
              className="flex items-center gap-2 bg-gradient-to-r from-[#003049] to-[#669bbc] text-white px-4 py-2.5 rounded-2xl font-bold text-xs transition-all shadow-xs cursor-pointer hover:opacity-95"
            >
              {showAddForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
              {showAddForm ? 'Batal' : 'Catat Transaksi Baru'}
            </button>
          )}
        </div>
      </div>

      {/* Slide-out Transaction Entry Form */}
      {showAddForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-gray-150 rounded-2xl p-6 shadow-md transition-all duration-300 space-y-5">
          <div className="border-b border-gray-100 pb-4 flex justify-between items-center">
            <h3 className="text-base font-bold text-gray-900">Form Transaksi Kas Bendahara Komite</h3>
            <div className="flex gap-1.5 p-0.5 bg-gray-100 rounded-lg">
              <button
                type="button"
                onClick={() => handleTypeChange('income')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${type === 'income' ? 'bg-white text-emerald-700 shadow-xs' : 'text-gray-500 hover:text-gray-800'}`}
              >
                Pemasukan (+)
              </button>
              <button
                type="button"
                onClick={() => handleTypeChange('expense')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer ${type === 'expense' ? 'bg-white text-rose-700 shadow-xs' : 'text-gray-500 hover:text-gray-800'}`}
              >
                Pengeluaran (-)
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-5 text-left">
            {/* Date Input */}
            <div>
              <label className="block text-xs font-bold text-slate-705 uppercase tracking-wider mb-2">Tanggal Transaksi *</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-2.5 text-xs transition-all outline-none"
                required
              />
            </div>

            {/* Category Dropdown */}
            <div>
              <label className="block text-xs font-bold text-slate-705 uppercase tracking-wider mb-2">Pilih Kategori *</label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 focus:border-indigo-500 focus:bg-white rounded-xl px-4 py-2.5 text-xs outline-none cursor-pointer"
                required
              >
                {categoriesList.map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Amount Number Input */}
            <div>
              <label className="block text-xs font-bold text-slate-705 uppercase tracking-wider mb-2">Jumlah Uang (Rupiah) *</label>
              <input
                type="number"
                placeholder="Contoh: 150000"
                value={amount || ''}
                onChange={(e) => setAmount(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-100 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-2.5 text-xs transition-all outline-none"
                required
                min={1}
              />
            </div>

            {/* Payment Method */}
            <div>
              <label className="block text-xs font-bold text-slate-755 uppercase tracking-wider mb-2">Metode Pembayaran *</label>
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-100 focus:border-indigo-500 focus:bg-white rounded-xl px-4 py-2.5 text-xs outline-none cursor-pointer"
                required
              >
                <option value="Transfer Bank">Transfer Bank</option>
                <option value="Cash">Tunai / Cash</option>
                <option value="E-Wallet">E-Wallet (Dana/LinkAja)</option>
              </select>
            </div>
          </div>

          {/* Conditional relationship panels */}
          {type === 'income' && (
            <div className="bg-indigo-50/20 hover:bg-indigo-50/40 border border-indigo-150/50 rounded-xl p-4 transition-all space-y-2 text-left">
              <div className="flex items-center gap-2">
                <input
                  type="checkbox"
                  id="link-to-bill-checkbox"
                  checked={linkToBill}
                  onChange={(e) => {
                    setLinkToBill(e.target.checked);
                    if (!e.target.checked) setSelectedBillId('');
                  }}
                  className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer h-4 w-4"
                />
                <label htmlFor="link-to-bill-checkbox" className="text-xs font-bold text-indigo-900 cursor-pointer">
                  Hubungkan dengan Pembayaran Tagihan / Iuran Siswa
                </label>
              </div>

              {linkToBill && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                  <div>
                    <label className="block text-[11px] font-semibold text-indigo-800 mb-1.5">Pilih Daftar Tagihan Outstanding Siswa</label>
                    <select
                      value={selectedBillId}
                      onChange={(e) => handleBillSelect(e.target.value)}
                      className="w-full bg-white border border-slate-100 rounded-lg px-3 py-2 text-xs outline-none cursor-pointer text-slate-700 font-medium"
                      required={linkToBill}
                    >
                      <option value="">-- Pilih Tagihan Outstanding --</option>
                      {outstandingBills.map(bill => (
                        <option key={bill.id} value={bill.id}>
                          {bill.studentName} ({bill.studentClass}) - {bill.period} (Tagihan: {formatIDR(bill.amountRequired - bill.amountPaid)})
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-indigo-800 mb-1.5">Wali Murid Terpaut</label>
                    <div className="bg-white/85 border border-slate-100 rounded-lg px-3 py-2 text-xs text-slate-500 italic">
                      {selectedBillId 
                        ? `${bills.find(b => b.id === selectedBillId)?.parentsName} • ${bills.find(b => b.id === selectedBillId)?.parentsPhone}`
                        : 'Pilih tagihan siswa di kiri'
                      }
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Connects Expense to active Scheduled Event */}
          <div className="bg-indigo-50/20 hover:bg-indigo-50/40 border border-indigo-150/50 rounded-xl p-4 transition-all space-y-2 text-left">
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="link-to-event-checkbox"
                checked={linkToEvent}
                onChange={(e) => {
                  setLinkToEvent(e.target.checked);
                  if (!e.target.checked) setSelectedEventId('');
                }}
                className="rounded text-indigo-600 focus:ring-indigo-500 cursor-pointer h-4 w-4"
              />
              <label htmlFor="link-to-event-checkbox" className="text-xs font-bold text-indigo-900 cursor-pointer">
                Hubungkan transaksi ini ke Event / Program Kegiatan Komite
              </label>
            </div>

            {linkToEvent && (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-2">
                <div>
                  <label className="block text-[11px] font-semibold text-indigo-800 mb-1.5">Pilih Event Rujukan Budgeting</label>
                  <select
                    value={selectedEventId}
                    onChange={(e) => handleEventSelect(e.target.value)}
                    className="w-full bg-white border border-slate-100 rounded-lg px-3 py-2 text-xs outline-none cursor-pointer text-slate-700 font-medium"
                    required={linkToEvent}
                  >
                    <option value="">-- Pilih Kegiatan Aktif --</option>
                    {events.map(evt => (
                      <option key={evt.id} value={evt.id}>
                        {evt.title} (RAB: {formatIDR(evt.budgetTarget)} • Status: {evt.status})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-[11px] font-semibold text-indigo-800 mb-1.5">Keterangan Anggaran</label>
                  <div className="bg-white/80 border border-slate-100 rounded-lg px-3 py-2 text-xs text-slate-500 italic">
                    {selectedEventId
                      ? `RAB: ${formatIDR(events.find(e => e.id === selectedEventId)?.budgetTarget || 0)} | Sisa Budget Terpakai: ${formatIDR((events.find(e => e.id === selectedEventId)?.actualExpense || 0))}`
                      : 'Pilih event komite di kiri'
                    }
                  </div>
                </div>
              </div>
            )}
          </div>

          {/* Description area */}
          <div className="text-left">
            <label className="block text-xs font-bold text-slate-705 uppercase tracking-wider mb-2">Deskripsi Rincian Transaksi *</label>
            <textarea
              placeholder="Contoh: Pembelian lemari arsip, konsumsi rapat..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-slate-50 border border-slate-100 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-2.5 text-xs transition-all outline-none"
              rows={2}
              required
            />
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 rounded-xl text-slate-505 hover:text-slate-705 hover:bg-slate-100 text-xs font-bold transition-all cursor-pointer"
            >
              Reset
            </button>
            <button
              id="btn-submit-transaction"
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              Simpan Transaksi Kas
            </button>
          </div>
        </form>
      )}

      {/* List Search & Filter segment */}
      <div className="bg-white border border-slate-200 rounded-2xl p-4 shadow-2xs flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="relative w-full md:max-w-md">
          <span className="absolute inset-y-0 left-0 flex items-center pl-3.5 text-slate-400">
            <Search className="h-4 w-4" />
          </span>
          <input
            type="text"
            placeholder="Cari kata kunci, nama siswa, iuran..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full bg-slate-50 border border-slate-100/80 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 rounded-xl pl-10 pr-4 py-2 text-xs transition-all outline-none"
          />
        </div>

        <div className="flex flex-col sm:flex-row gap-3 items-center w-full md:w-auto">
          {/* Filter Type */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto text-xs">
            <span className="text-slate-505 hidden sm:inline">Tipe:</span>
            <select
              value={filterType}
              onChange={(e) => setFilterType(e.target.value as any)}
              className="w-full sm:w-32 bg-slate-50 border border-slate-100 focus:border-indigo-500 focus:bg-white rounded-xl px-2.5 py-2 text-xs outline-none text-slate-700 font-medium font-bold"
            >
              <option value="All">Semua Aliran</option>
              <option value="income">Pemasukan (+)</option>
              <option value="expense">Pengeluaran (-)</option>
            </select>
          </div>

          {/* Filter Category */}
          <div className="flex items-center gap-1.5 w-full sm:w-auto text-xs">
            <span className="text-slate-505 hidden sm:inline">Kategori:</span>
            <select
              value={filterCategory}
              onChange={(e) => setFilterCategory(e.target.value)}
              className="w-full sm:w-44 bg-slate-50 border border-slate-100 focus:border-indigo-500 focus:bg-white rounded-xl px-2.5 py-2 text-xs outline-none text-slate-700 font-medium font-bold"
            >
              <option value="All">Semua Kategori</option>
              {uniqueCategories.map(c => (
                <option key={c} value={c}>{c}</option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Ledger Table Section */}
      <div className="bg-white rounded-2xl border border-gray-150 shadow-xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-200 text-xs font-bold text-gray-500 uppercase tracking-wider">
                <th className="px-6 py-4">Tanggal / Waktu</th>
                <th className="px-6 py-4">Kategori & Bukti</th>
                <th className="px-6 py-4">Keterangan Transaksi</th>
                <th className="px-6 py-4">Pencatat (Admin)</th>
                <th className="px-6 py-4 text-right">Nominal Uang (RUPIAH)</th>
                <th className="px-6 py-4 text-center">Batalkan</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-100 text-sm text-gray-700">
              {filteredTransactions.length > 0 ? (
                filteredTransactions.map((tx) => (
                  <tr key={tx.id} className="hover:bg-gray-50/50 transition-colors">
                    {/* Date details */}
                    <td className="px-6 py-4 whitespace-nowrap">
                      <div className="font-semibold text-gray-800 flex items-center gap-1.5">
                        <Calendar className="h-3.5 w-3.5 text-gray-400" />
                        {tx.date}
                      </div>
                      <span className="text-xs text-gray-400 font-mono mt-0.5 block">{tx.id}</span>
                    </td>

                    {/* Category details */}
                    <td className="px-6 py-4">
                      <div className="font-semibold text-gray-900">{tx.category}</div>
                      <span className="text-xs text-indigo-600 font-bold bg-indigo-50 border border-indigo-100/50 px-2 py-0.5 rounded mt-1 inline-block">
                        {tx.paymentMethod}
                      </span>
                    </td>

                    {/* Description details */}
                    <td className="px-6 py-4 max-w-sm">
                      <p className="text-gray-800 leading-relaxed font-medium">{tx.description}</p>
                      {/* Sub relations tag in transaction row */}
                      {tx.studentId && (
                        <div className="flex gap-1.5 mt-1.5">
                          <span className="text-[10px] bg-emerald-100 text-emerald-800 font-bold px-1.5 py-0.5 rounded">
                            Iuran: {tx.period}
                          </span>
                          <span className="text-[10px] bg-gray-100 text-gray-800 font-bold px-1.5 py-0.5 rounded">
                            ID: {tx.studentId}
                          </span>
                        </div>
                      )}
                      {tx.eventId && (
                        <span className="text-[10px] bg-indigo-100 text-indigo-800 font-extrabold px-1.5 py-0.5 rounded mt-1.5 inline-block">
                          Event Terkait: {events.find(e => e.id === tx.eventId)?.title || 'Program Komite'}
                        </span>
                      )}
                    </td>

                    {/* Author email setter */}
                    <td className="px-6 py-4 whitespace-nowrap text-xs text-gray-600 font-medium">
                      {tx.recordedBy}
                    </td>

                    {/* Amount styled by direction */}
                    <td className="px-6 py-4 whitespace-nowrap text-right font-bold text-base">
                      <span className={tx.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}>
                        {tx.type === 'income' ? '+' : '-'} {formatIDR(tx.amount)}
                      </span>
                    </td>

                    {/* Delete action */}
                    <td className="px-6 py-4 whitespace-nowrap text-center">
                      {userRole === 'operator' ? (
                        <span className="text-[10px] text-slate-400 font-extrabold tracking-wider" title="Khusus Bendahara">TERBATAS</span>
                      ) : (
                        <button
                          onClick={() => handleDelete(tx)}
                          className="p-1 px-2 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                          title="Batalkan transaksi ini"
                        >
                          <Trash2 className="h-4 w-4 mx-auto" />
                        </button>
                      )}
                    </td>
                  </tr>
                ))
              ) : (
                <tr>
                  <td colSpan={6} className="px-6 py-12 text-center text-gray-400 font-medium">
                    <AlertCircle className="h-10 w-10 mx-auto opacity-40 mb-3 text-gray-500" />
                    Belum ada transaksi terekam pada kriteria pilihan ini.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        {/* Aggregate summary counts */}
        <div className="bg-gray-50/50 p-4 border-t border-gray-200 flex flex-col sm:flex-row justify-between text-xs text-gray-500 gap-2 font-medium">
          <div>Menampilkan {filteredTransactions.length} baris transaksi terbaru.</div>
          <div className="flex gap-4">
            <span>Pemasukan Terfilter: <span className="text-emerald-600 font-bold">{formatIDR(filteredTransactions.filter(t => t.type==='income').reduce((cur, t)=> cur + t.amount,0))}</span></span>
            <span>Pengeluaran Terfilter: <span className="text-rose-600 font-bold">{formatIDR(filteredTransactions.filter(t => t.type==='expense').reduce((cur, t)=> cur + t.amount,0))}</span></span>
          </div>
        </div>
      </div>
    </div>
  );
}
