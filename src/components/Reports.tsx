import React, { useState, useMemo } from 'react';
import { Transaction, Student, StudentBill } from '../types';
import { formatIDR, exportToCSV } from '../utils';
import { 
  Printer, FileText, BarChart3, Users, 
  ArrowDownLeft, ArrowUpRight, CheckSquare, 
  Calendar, Layers, Filter 
} from 'lucide-react';

interface ReportsProps {
  transactions: Transaction[];
  students: Student[];
  bills: StudentBill[];
  classes: string[];
}

export default function Reports({ transactions, students, bills, classes }: ReportsProps) {
  // Report View Tabs
  const [activeReport, setActiveReport] = useState<'monthly' | 'bills' | 'class'>('monthly');
  
  // Selection/Filtering Parameter States
  const [selectedMonth, setSelectedMonth] = useState('2026-05'); // Defaults to local environment month
  const [billingStatusFilter, setBillingStatusFilter] = useState<'All' | 'unpaid' | 'paid' | 'partially_paid'>('All');
  
  // Computed dynamic month list from transaction logs
  const monthsList = useMemo(() => {
    const list = new Set<string>();
    // Prepopulate fallback
    list.add('2026-05');
    transactions.forEach(t => {
      if (t.date && t.date.length >= 7) {
        list.add(t.date.substring(0, 7));
      }
    });
    return Array.from(list).sort().reverse();
  }, [transactions]);

  // -- 1. DATA COMPUTATION FOR LAPORAN BULANAN (MONTHLY) --
  const monthlyData = useMemo(() => {
    // Starting balance (prior months aggregate)
    let bBalance = 0;
    // Current period values
    let periodIncome = 0;
    let periodExpense = 0;
    
    const periodIncomesList: Transaction[] = [];
    const periodExpensesList: Transaction[] = [];

    transactions.forEach(tx => {
      const txMonth = tx.date.substring(0, 7);
      if (txMonth < selectedMonth) {
        // Build rollover index
        if (tx.type === 'income') {
          bBalance += tx.amount;
        } else {
          bBalance -= tx.amount;
        }
      } else if (txMonth === selectedMonth) {
        if (tx.type === 'income') {
          periodIncome += tx.amount;
          periodIncomesList.push(tx);
        } else {
          periodExpense += tx.amount;
          periodExpensesList.push(tx);
        }
      }
    });

    const endingBalance = bBalance + periodIncome - periodExpense;

    return {
      beginningBalance: bBalance,
      incomeTotal: periodIncome,
      expenseTotal: periodExpense,
      endingBalance,
      incomeTransactions: periodIncomesList.sort((a,b)=>a.date.localeCompare(b.date)),
      expenseTransactions: periodExpensesList.sort((a,b)=>a.date.localeCompare(b.date))
    };
  }, [transactions, selectedMonth]);

  // -- 2. DATA COMPUTATION FOR BILLING AND STUDENT DUES REPORT --
  const billingReportData = useMemo(() => {
    let totalDuesRequired = 0;
    let totalDuesCollected = 0;
    
    const filteredRecordBills = bills.filter(b => {
      totalDuesRequired += b.amountRequired;
      totalDuesCollected += b.amountPaid;
      
      if (billingStatusFilter === 'All') return true;
      return b.status === billingStatusFilter;
    });

    const totalOutstandingDues = totalDuesRequired - totalDuesCollected;

    return {
      totalDuesRequired,
      totalDuesCollected,
      totalOutstandingDues,
      listOfBills: filteredRecordBills
    };
  }, [bills, billingStatusFilter]);

  // -- 3. DATA COMPUTATION FOR GLOBAL REPORT PER CLASS --
  const classReportData = useMemo(() => {
    const classMap: {
      [cls: string]: {
        classId: string;
        totalStudents: number;
        totalDuesRequired: number;
        totalDuesCollected: number;
      }
    } = {};

    // Prepopulate classes list
    classes.forEach(c => {
      classMap[c] = {
        classId: c,
        totalStudents: 0,
        totalDuesRequired: 0,
        totalDuesCollected: 0
      };
    });

    // Populate actual counts from Student Bills database
    bills.forEach(bill => {
      const cls = bill.studentClass;
      if (!classMap[cls]) {
        classMap[cls] = { classId: cls, totalStudents: 0, totalDuesRequired: 0, totalDuesCollected: 0 };
      }
      classMap[cls].totalDuesRequired += bill.amountRequired;
      classMap[cls].totalDuesCollected += bill.amountPaid;
    });

    // Count students per class
    students.forEach(std => {
      const cls = std.classId;
      if (classMap[cls]) {
        classMap[cls].totalStudents += 1;
      }
    });

    return Object.values(classMap);
  }, [bills, students, classes]);

  // -- PRINT REPORT ACTION HANDLER --
  const handlePrintReport = () => {
    window.print();
  };

  return (
    <div id="school-reports-section" className="space-y-6">
      
      {/* Tab Selectors & Print Trigger */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-2xs no-print">
        <div className="text-left">
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <FileText className="h-5 w-5 text-indigo-600" />
            Laporan Keuangan Komite
          </h2>
          <p className="text-xs text-slate-505 mt-1">
            Unduh laporan transparansi, audit iuran, dan kemajuan kas yang akuntabel dan siap cetak ke format PDF.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          {/* Visual Report selectors */}
          <div className="flex bg-slate-100 p-1 rounded-xl w-full sm:w-auto text-xs font-bold font-sans">
            <button
              onClick={() => setActiveReport('monthly')}
              className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer text-xs ${activeReport === 'monthly' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
            >
              <Calendar className="h-3 w-3" />
              Laporan Bulanan
            </button>
            <button
              onClick={() => setActiveReport('bills')}
              className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer text-xs ${activeReport === 'bills' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
            >
              <CheckSquare className="h-3 w-3" />
              Laporan Tagihan
            </button>
            <button
              onClick={() => setActiveReport('class')}
              className={`flex-1 sm:flex-initial px-4 py-1.5 rounded-lg transition-all flex items-center gap-1.5 cursor-pointer text-xs ${activeReport === 'class' ? 'bg-white text-indigo-700 shadow-2xs' : 'text-slate-500 hover:text-slate-800'}`}
            >
              <Users className="h-3 w-3" />
              Laporan Per Kelas
            </button>
          </div>

          <button
            onClick={handlePrintReport}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-1.5 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
          >
            <Printer className="h-3.5 w-3.5" />
            Cetak Laporan (PDF)
          </button>
        </div>
      </div>

      {/* NO-PRINT: Parameter Options Row */}
      <div className="bg-white border border-slate-100/85 rounded-2xl p-4 shadow-2xs flex flex-wrap gap-4 items-center justify-between no-print text-left">
        <div className="text-xs font-bold text-slate-800">
          Ubah Periode / Tapis Data Laporan
        </div>

        <div className="flex gap-3">
          {activeReport === 'monthly' && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-semibold">Pilih Periode:</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-xs outline-none cursor-pointer text-slate-700 font-bold"
              >
                {monthsList.map(m => (
                  <option key={m} value={m}>{new Date(m + "-01").toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</option>
                ))}
              </select>
            </div>
          )}

          {activeReport === 'bills' && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-semibold">Status Pembayaran:</span>
              <select
                value={billingStatusFilter}
                onChange={(e) => setBillingStatusFilter(e.target.value as any)}
                className="bg-slate-50 border border-slate-100 rounded-lg px-3 py-2 text-xs outline-none cursor-pointer text-slate-700 font-bold"
              >
                <option value="All">Semua Status</option>
                <option value="unpaid">Belum Lunas (Unpaid)</option>
                <option value="partially_paid">Bayar Sebagian (Partial)</option>
                <option value="paid">Lunas (Paid)</option>
              </select>
            </div>
          )}
        </div>
      </div>

      {/* ========================================================= */}
      {/* PRINT-ZONE CONTAINER (Fulfills exact professional styles) */}
      {/* ========================================================= */}
      <div className="print-report-container bg-white border border-gray-200 rounded-2xl shadow-sm p-8 space-y-8 min-h-screen">
        
        {/* PRINT HEADER: KOP SURAT RESMI KOMITE SEKOLAH */}
        <div className="kop-surat border-b-4 border-blue-100 pb-5 text-center relative flex flex-col items-center justify-center gap-1">
          <h1 className="text-xl font-black text-gray-900 tracking-wider uppercase">KOMITE SEKOLAH MANDIRI INDONESIA</h1>
          <p className="text-xs text-gray-500 font-semibold uppercase tracking-widest">NPSN: 10293847 • SK Kemenkumham RI No. AHU-0019283-05.2023</p>
          <p className="text-xs text-slate-500 leading-normal max-w-lg mt-0.5">Sekretariat: Jl. Pendidikan No. 74 Komplek Sekolah Mandiri, Jakarta, Indonesia. Telp: 021-99887766 • Email: komite@sekolahmandiri.sch.id</p>
          <div className="absolute right-0 top-0 text-[10px] text-gray-400 font-mono italic no-print">Tercetak Sistem: {new Date().toLocaleDateString('id-ID')}</div>
        </div>

        {/* ==================== SCREEN 1: LAPORAN BULANAN (MONTHLY CASH FLOW) ==================== */}
        {activeReport === 'monthly' && (
          <div className="space-y-6">
            <div className="text-center space-y-1">
              <h2 className="text-md font-bold text-gray-900 tracking-wider uppercase">LAPORAN MUTASI BULANAN & ARUS KAS KOMITE SEKOLAH</h2>
              <p className="text-xs text-indigo-700 font-extrabold tracking-wider uppercase">
                PERIODE BULAN: {new Date(selectedMonth + "-01").toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
              </p>
            </div>

            {/* Rollover balance summary ledger */}
            <div className="grid grid-cols-4 gap-4 text-xs font-semibold uppercase tracking-wider text-slate-700">
              <div className="border border-slate-100 p-4 rounded-xl text-center bg-slate-50/50">
                <span className="text-[9px] text-slate-400 block font-bold mb-1">Saldo Kas Awal</span>
                <span className="text-xs font-black text-slate-900">{formatIDR(monthlyData.beginningBalance)}</span>
              </div>
              <div className="border border-emerald-100 p-4 rounded-xl text-center bg-emerald-50/10">
                <span className="text-[9px] text-emerald-500 block font-bold mb-1">Mutasi Masuk</span>
                <span className="text-xs font-black text-emerald-700">+{formatIDR(monthlyData.incomeTotal)}</span>
              </div>
              <div className="border border-rose-100 p-4 rounded-xl text-center bg-rose-50/10">
                <span className="text-[9px] text-rose-500 block font-bold mb-1">Mutasi Keluar</span>
                <span className="text-xs font-black text-rose-700">-{formatIDR(monthlyData.expenseTotal)}</span>
              </div>
              <div className="border border-indigo-200 p-4 rounded-xl text-center bg-indigo-50/25">
                <span className="text-[9px] text-indigo-500 block font-bold mb-1">Saldo Akhir</span>
                <span className="text-xs font-black text-indigo-700">{formatIDR(monthlyData.endingBalance)}</span>
              </div>
            </div>

            {/* Deep Breakdown lists */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 pt-2">
              {/* Income Transactions Column */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-emerald-800 uppercase tracking-widest border-b-2 border-emerald-500 pb-1.5 flex items-center justify-between">
                  <span>I. Rincian Pemasukan Kas</span>
                  <span className="text-[11px] font-extrabold text-emerald-600">{formatIDR(monthlyData.incomeTotal)}</span>
                </h3>
                
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-gray-150 font-bold text-gray-500 bg-gray-50/50">
                      <th className="py-2 px-2">Tgl</th>
                      <th className="py-2 px-2">Deskripsi / Rujukan</th>
                      <th className="py-2 px-2 text-right">Nominal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-150/70">
                    {monthlyData.incomeTransactions.length > 0 ? (
                      monthlyData.incomeTransactions.map(tx => (
                        <tr key={tx.id} className="hover:bg-gray-55">
                          <td className="py-2 px-2 text-gray-500 font-medium whitespace-nowrap">{tx.date.substring(8, 10)}</td>
                          <td className="py-2 px-2 max-w-xs">{tx.description}</td>
                          <td className="py-2 px-2 text-right font-bold text-emerald-600">+{formatIDR(tx.amount)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="py-4 text-center text-gray-400 italic">Tidak ada transaksi pemasukan bulan ini</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>

              {/* Expense Transactions Column */}
              <div className="space-y-3">
                <h3 className="text-xs font-bold text-rose-800 uppercase tracking-widest border-b-2 border-rose-500 pb-1.5 flex items-center justify-between">
                  <span>II. Rincian Pengeluaran Kas</span>
                  <span className="text-[11px] font-extrabold text-rose-600">{formatIDR(monthlyData.expenseTotal)}</span>
                </h3>
                
                <table className="w-full text-xs text-left">
                  <thead>
                    <tr className="border-b border-gray-150 font-bold text-gray-500 bg-gray-50/50">
                      <th className="py-2 px-2">Tgl</th>
                      <th className="py-2 px-2">Deskripsi / Rujukan</th>
                      <th className="py-2 px-2 text-right">Nominal</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-gray-150/70">
                    {monthlyData.expenseTransactions.length > 0 ? (
                      monthlyData.expenseTransactions.map(tx => (
                        <tr key={tx.id} className="hover:bg-gray-55">
                          <td className="py-2 px-2 text-gray-500 font-medium whitespace-nowrap">{tx.date.substring(8, 10)}</td>
                          <td className="py-2 px-2 max-w-xs">{tx.description}</td>
                          <td className="py-2 px-2 text-right font-bold text-rose-600">-{formatIDR(tx.amount)}</td>
                        </tr>
                      ))
                    ) : (
                      <tr>
                        <td colSpan={3} className="py-4 text-center text-gray-400 italic">Tidak ada pengeluaran dilaporkan bulan ini</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        )}

        {/* ==================== SCREEN 2: LAPORAN PEMBAYARAN & TAGIHAN SISWA ==================== */}
        {activeReport === 'bills' && (
          <div className="space-y-6">
            <div className="text-center space-y-1">
              <h2 className="text-md font-bold text-gray-900 tracking-wider uppercase">LAPORAN MUTASI DAN PIUTANG TAGIHAN SIKLUS SISWA</h2>
              <p className="text-xs text-emerald-700 font-semibold tracking-wider uppercase">
                Filter Status Bayar Terlampir: {billingStatusFilter === 'All' ? 'SEMUA STATUS TAGIHAN' : billingStatusFilter.toUpperCase()}
              </p>
            </div>

            {/* Billing totalizer blocks */}
            <div className="grid grid-cols-3 gap-4 text-xs font-semibold uppercase tracking-wider text-slate-700">
              <div className="border border-slate-100 p-4 rounded-xl text-center">
                <span className="text-[9px] text-slate-400 block font-bold mb-1">Total Target Piutang Komite</span>
                <span className="text-xs font-bold text-slate-800">{formatIDR(billingReportData.totalDuesRequired)}</span>
              </div>
              <div className="border border-slate-100 p-4 rounded-xl text-center bg-emerald-50/10">
                <span className="text-[9px] text-emerald-600 block font-bold mb-1">Total Terbayarkan</span>
                <span className="text-xs font-bold text-emerald-700">{formatIDR(billingReportData.totalDuesCollected)}</span>
              </div>
              <div className="border border-slate-100 p-4 rounded-xl text-center bg-amber-50/10 border-amber-100">
                <span className="text-[9px] text-amber-600 block font-bold mb-1">Sisa Tunggakan Tertinggal</span>
                <span className="text-xs font-bold text-amber-800">{formatIDR(billingReportData.totalOutstandingDues)}</span>
              </div>
            </div>

            {/* List of Student Invoices */}
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest border-b border-gray-300 pb-1.5 flex justify-between">
                <span>Daftar Mutasi Tagihan Per Siswa</span>
                <span className="text-[10px] font-normal text-gray-400 italic font-sans uppercase">Terfilter: {billingReportData.listOfBills.length} tagihan</span>
              </h3>

              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-gray-100/70 border-b border-gray-200 font-bold text-gray-500 whitespace-nowrap">
                    <th className="px-4 py-3">Nama Siswa / Roster</th>
                    <th className="px-4 py-3">Tingkat Kelas</th>
                    <th className="px-4 py-3">Periode</th>
                    <th className="px-4 py-3 text-right">Target Tagihan</th>
                    <th className="px-4 py-3 text-right">Sudah Dibayar</th>
                    <th className="px-4 py-3 text-right">Sisa Tunggakan</th>
                    <th className="px-4 py-3 text-center">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-150 text-gray-700">
                  {billingReportData.listOfBills.length > 0 ? (
                    billingReportData.listOfBills.map(bill => {
                      const remain = bill.amountRequired - bill.amountPaid;
                      return (
                        <tr key={bill.id} className="hover:bg-gray-50/50">
                          <td className="px-4 py-3.5">
                            <div className="font-bold text-gray-900">{bill.studentName}</div>
                            <span className="text-[10px] text-gray-400 block mt-0.5">Wali: {bill.parentsName} / {bill.parentsPhone}</span>
                          </td>
                          <td className="px-4 py-3.5 whitespace-nowrap">{bill.studentClass}</td>
                          <td className="px-4 py-3.5 whitespace-nowrap font-semibold">{bill.period}</td>
                          <td className="px-4 py-3.5 text-right font-medium">{formatIDR(bill.amountRequired)}</td>
                          <td className="px-4 py-3.5 text-right text-emerald-600 font-semibold">{formatIDR(bill.amountPaid)}</td>
                          <td className="px-4 py-3.5 text-right font-extrabold text-amber-800">{formatIDR(remain)}</td>
                          <td className="px-4 py-3.5 text-center whitespace-nowrap">
                            <span className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                              bill.status === 'paid' ? 'bg-emerald-100 text-emerald-800' :
                              bill.status === 'partially_paid' ? 'bg-amber-100 text-amber-800' : 'bg-red-100 text-red-800'
                            }`}>
                              {bill.status === 'paid' ? 'LUNAS' : bill.status === 'partially_paid' ? 'SEBAGIAN' : 'NIL'}
                            </span>
                          </td>
                        </tr>
                      );
                    })
                  ) : (
                    <tr>
                      <td colSpan={7} className="px-4 py-12 text-center text-gray-400">Tidak ada rincian tagihan terfilter ditemukan.</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* ==================== SCREEN 3: LAPORAN GLOBAL PER KELAS ==================== */}
        {activeReport === 'class' && (
          <div className="space-y-6">
            <div className="text-center space-y-1">
              <h2 className="text-md font-bold text-gray-900 tracking-wider uppercase">LAPORAN KINERJA DAN PARTISIPASI IURAN GLOBAL PER KELAS</h2>
              <p className="text-xs text-indigo-700 font-semibold tracking-wider uppercase">KEDEPUTIAN BENDAHARA KOMITE SEKOLAH MANDIRI</p>
            </div>

            {/* Table of Class Rosters aggregated */}
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest border-b border-gray-300 pb-1.5">
                Rangkuman Partisipasi Cash Flow Unit Kelas Sederajat
              </h3>

              <table className="w-full text-xs text-left">
                <thead>
                  <tr className="bg-gray-100 border-b border-gray-200 font-bold text-slate-500 uppercase tracking-wider text-[11px]">
                    <th className="px-5 py-3">Nama Kelas Sederajat</th>
                    <th className="px-5 py-3 text-center">Jumlah Roster Siswa</th>
                    <th className="px-5 py-3 text-right font-sans">Target Iuran Komite</th>
                    <th className="px-5 py-3 text-right">Iuran Terealisasi (Inbound)</th>
                    <th className="px-5 py-3 text-right">Piutang Tertinggal</th>
                    <th className="px-5 py-3 text-center">% Partisipasi lunas</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-150 text-gray-700 text-[13px]">
                  {classReportData.map(clsData => {
                    const classOutstanding = clsData.totalDuesRequired - clsData.totalDuesCollected;
                    // percentage
                    const percentPaid = clsData.totalDuesRequired > 0 
                      ? Math.round((clsData.totalDuesCollected / clsData.totalDuesRequired) * 100)
                      : 0;

                    return (
                      <tr key={clsData.classId} className="hover:bg-gray-50/50">
                        <td className="px-5 py-4 font-black text-slate-900 text-sm whitespace-nowrap">{clsData.classId}</td>
                        <td className="px-5 py-4 text-center font-bold text-gray-800">{clsData.totalStudents} Siswa</td>
                        <td className="px-5 py-4 text-right font-medium">{formatIDR(clsData.totalDuesRequired)}</td>
                        <td className="px-5 py-4 text-right font-bold text-emerald-600">+{formatIDR(clsData.totalDuesCollected)}</td>
                        <td className="px-5 py-4 text-right font-bold text-amber-700">{formatIDR(classOutstanding)}</td>
                        <td className="px-5 py-4 text-center">
                          <div className="flex items-center justify-center gap-2">
                            <span className="font-extrabold text-slate-800">{percentPaid}%</span>
                            <div className="w-16 bg-gray-200 rounded-full h-1.5 overflow-hidden hidden sm:block">
                              <div className="bg-emerald-600 h-full" style={{ width: `${percentPaid}%` }}></div>
                            </div>
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

        {/* PRINT FOOTER: SIGN BOXES FOR ACCOUNTABILITY AND TRANSPARENCY */}
        <div className="pt-20 grid grid-cols-2 md:grid-cols-3 gap-6 text-xs text-center font-semibold text-gray-700 border-t border-gray-100 leading-normal">
          <div className="space-y-16">
            <span>Mengetahui,<br /><b>Ketua Komite Sekolah</b></span>
            <div className="block">
              <span className="border-t border-blue-100 pt-1.5 px-6 font-bold uppercase block max-w-xs mx-auto text-[11px]">
                Dr. H. Muhammad Ramli
              </span>
            </div>
          </div>
          <div className="hidden md:block space-y-16">
            <span>Menyetujui,<br /><b>Kepala Sekolah Mandiri</b></span>
            <div className="block">
              <span className="border-t border-blue-100 pt-1.5 px-6 font-bold uppercase block max-w-xs mx-auto text-[11px]">
                Drs. Heru Wijayanto, M.Pd
              </span>
            </div>
          </div>
          <div className="space-y-16">
            <span>Jakarta, {new Date().toLocaleDateString('id-ID', { day: 'numeric', month: 'long', year: 'numeric' })}<br /><b>Bendahara Komite</b></span>
            <div className="block">
              <span className="border-t border-blue-100 pt-1.5 px-6 font-bold uppercase block max-w-xs mx-auto text-[11px]">
                Sri Wahyuli, S.E
              </span>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
