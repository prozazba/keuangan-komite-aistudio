import React, { useState, useMemo } from 'react';
import { Transaction, Student, StudentBill } from '../types';
import { formatIDR, getEducationalSemesters } from '../utils';
import { 
  Printer, FileText, Users, 
  CheckSquare, Calendar, Award, Landmark, CalendarDays
} from 'lucide-react';

interface ReportsProps {
  transactions: Transaction[];
  students: Student[];
  bills: StudentBill[];
  classes: string[];
  selectedAcademicYear?: string;
}

export default function Reports({ transactions, students, bills, classes, selectedAcademicYear = '2025/2026' }: ReportsProps) {
  // Report View Tabs
  const [activeReport, setActiveReport] = useState<'monthly' | 'lpj' | 'bills' | 'class'>('lpj');
  
  // Selection/Filtering Parameter States
  const [selectedMonth, setSelectedMonth] = useState('2026-05'); // Defaults to local environment month
  const [billingStatusFilter, setBillingStatusFilter] = useState<'All' | 'unpaid' | 'paid' | 'partially_paid'>('All');
  
  // Educational Calendar Semesters metadata
  const eduSemesters = useMemo(() => {
    return getEducationalSemesters(selectedAcademicYear);
  }, [selectedAcademicYear]);

  // Computed dynamic month list from transaction logs in Educational Calendar order
  const monthsList = useMemo(() => {
    const list = new Set<string>();
    // Prepopulate standard months from selected academic year
    eduSemesters.sem1Prefixes.forEach(p => list.add(p));
    eduSemesters.sem2Prefixes.forEach(p => list.add(p));
    transactions.forEach(t => {
      if (t.date && t.date.length >= 7) {
        list.add(t.date.substring(0, 7));
      }
    });
    return Array.from(list).sort().reverse();
  }, [transactions, eduSemesters]);

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

  // -- 2. DATA COMPUTATION FOR LPJ KALENDER PENDIDIKAN (FULL YEAR JULI - JUNI & SEMESTER BREAKDOWN) --
  const lpjData = useMemo(() => {
    let sem1Income = 0;
    let sem1Expense = 0;
    let sem2Income = 0;
    let sem2Expense = 0;

    const sem1Transactions: Transaction[] = [];
    const sem2Transactions: Transaction[] = [];

    transactions.forEach(tx => {
      const monthPrefix = tx.date.substring(0, 7);
      if (eduSemesters.sem1Prefixes.includes(monthPrefix)) {
        if (tx.type === 'income') sem1Income += tx.amount;
        else sem1Expense += tx.amount;
        sem1Transactions.push(tx);
      } else if (eduSemesters.sem2Prefixes.includes(monthPrefix)) {
        if (tx.type === 'income') sem2Income += tx.amount;
        else sem2Expense += tx.amount;
        sem2Transactions.push(tx);
      }
    });

    const totalYearIncome = sem1Income + sem2Income;
    const totalYearExpense = sem1Expense + sem2Expense;
    const netYearCash = totalYearIncome - totalYearExpense;

    // Student Bills breakdown per Semester
    let sem1BillsTarget = 0;
    let sem1BillsPaid = 0;
    let sem2BillsTarget = 0;
    let sem2BillsPaid = 0;

    bills.forEach(b => {
      const periodLower = b.period.toLowerCase();
      const isSem1 = eduSemesters.sem1Months.some(m => periodLower.includes(m.toLowerCase().split(' ')[0]));
      if (isSem1) {
        sem1BillsTarget += b.amountRequired;
        sem1BillsPaid += b.amountPaid;
      } else {
        sem2BillsTarget += b.amountRequired;
        sem2BillsPaid += b.amountPaid;
      }
    });

    return {
      sem1Income,
      sem1Expense,
      sem1Net: sem1Income - sem1Expense,
      sem2Income,
      sem2Expense,
      sem2Net: sem2Income - sem2Expense,
      totalYearIncome,
      totalYearExpense,
      netYearCash,
      sem1BillsTarget,
      sem1BillsPaid,
      sem2BillsTarget,
      sem2BillsPaid,
      totalBillsTarget: sem1BillsTarget + sem2BillsTarget,
      totalBillsPaid: sem1BillsPaid + sem2BillsPaid,
      totalBillsOutstanding: (sem1BillsTarget + sem2BillsTarget) - (sem1BillsPaid + sem2BillsPaid),
      sem1Transactions,
      sem2Transactions
    };
  }, [transactions, bills, eduSemesters]);

  // -- 3. DATA COMPUTATION FOR BILLING AND STUDENT DUES REPORT --
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

  // -- 4. DATA COMPUTATION FOR GLOBAL REPORT PER CLASS --
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
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white/90 backdrop-blur-xs p-6 rounded-3xl shadow-xs no-print">
        <div className="text-left space-y-1">
          <div className="flex items-center gap-2">
            <span className="text-[10px] font-extrabold text-[#003049] uppercase tracking-widest bg-[#fdf0d5] px-2.5 py-1 rounded-full shadow-2xs">
              Kalender Pendidikan TA {selectedAcademicYear}
            </span>
            <span className="text-xs font-bold text-slate-500">• Siklus Juli s.d. Juni</span>
          </div>
          <h2 className="text-lg font-black text-[#003049] tracking-tight flex items-center gap-2">
            <FileText className="h-5 w-5 text-[#003049]" />
            Laporan Keuangan & LPJ Pertanggungjawaban Komite
          </h2>
          <p className="text-xs text-slate-500 font-medium leading-relaxed">
            Sistem pelaporan resmi yang disesuaikan dengan kalender pendidikan (Juli s.d. Juni) untuk transparansi, pemeriksaan audit, dan pertanggungjawaban akhir tahun ajaran.
          </p>
        </div>

        <div className="flex flex-wrap gap-2 w-full md:w-auto">
          {/* Visual Report selectors */}
          <div className="flex bg-slate-100/80 p-1 rounded-2xl w-full sm:w-auto text-xs font-bold font-sans shadow-2xs">
            <button
              onClick={() => setActiveReport('lpj')}
              className={`flex-1 sm:flex-initial px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer text-xs font-extrabold ${activeReport === 'lpj' ? 'bg-[#003049] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <Award className="h-3.5 w-3.5" />
              LPJ Kalender Pendidikan
            </button>
            <button
              onClick={() => setActiveReport('monthly')}
              className={`flex-1 sm:flex-initial px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer text-xs font-extrabold ${activeReport === 'monthly' ? 'bg-[#003049] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <Calendar className="h-3.5 w-3.5" />
              Laporan Bulanan
            </button>
            <button
              onClick={() => setActiveReport('bills')}
              className={`flex-1 sm:flex-initial px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer text-xs font-extrabold ${activeReport === 'bills' ? 'bg-[#003049] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <CheckSquare className="h-3.5 w-3.5" />
              Audit Tagihan
            </button>
            <button
              onClick={() => setActiveReport('class')}
              className={`flex-1 sm:flex-initial px-3.5 py-2 rounded-xl transition-all flex items-center gap-1.5 cursor-pointer text-xs font-extrabold ${activeReport === 'class' ? 'bg-[#003049] text-white shadow-xs' : 'text-slate-600 hover:text-slate-900'}`}
            >
              <Users className="h-3.5 w-3.5" />
              Per Kelas
            </button>
          </div>

          <button
            onClick={handlePrintReport}
            className="w-full sm:w-auto flex items-center justify-center gap-2 bg-gradient-to-r from-[#003049] to-[#669bbc] text-white px-4 py-2 rounded-2xl text-xs font-extrabold transition-all shadow-xs cursor-pointer hover:opacity-95"
          >
            <Printer className="h-4 w-4" />
            Cetak PDF / Cetak Laporan
          </button>
        </div>
      </div>

      {/* NO-PRINT: Parameter Options Row */}
      <div className="bg-white/90 backdrop-blur-xs rounded-3xl p-4 shadow-xs flex flex-wrap gap-4 items-center justify-between no-print text-left">
        <div className="flex items-center gap-2 text-xs font-extrabold text-[#003049]">
          <CalendarDays className="h-4 w-4 text-[#669bbc]" />
          <span>Periodisasi Pendidikan: Juli {eduSemesters.startYear} – Juni {eduSemesters.endYear}</span>
        </div>

        <div className="flex gap-3">
          {activeReport === 'monthly' && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-bold">Pilih Bulan Kalender Pendidikan:</span>
              <select
                value={selectedMonth}
                onChange={(e) => setSelectedMonth(e.target.value)}
                className="bg-slate-50/80 border-none rounded-2xl px-3 py-2 text-xs outline-none cursor-pointer text-slate-800 font-extrabold shadow-2xs"
              >
                {monthsList.map(m => (
                  <option key={m} value={m}>{new Date(m + "-01").toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}</option>
                ))}
              </select>
            </div>
          )}

          {activeReport === 'bills' && (
            <div className="flex items-center gap-2 text-xs">
              <span className="text-slate-500 font-bold">Status Pembayaran:</span>
              <select
                value={billingStatusFilter}
                onChange={(e) => setBillingStatusFilter(e.target.value as any)}
                className="bg-slate-50/80 border-none rounded-2xl px-3 py-2 text-xs outline-none cursor-pointer text-slate-800 font-extrabold shadow-2xs"
              >
                <option value="All">Semua Status Tagihan</option>
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
      <div className="print-report-container bg-white border border-slate-200 rounded-3xl shadow-sm p-8 space-y-8 min-h-screen text-left">
        
        {/* PRINT HEADER: KOP SURAT RESMI KOMITE SEKOLAH */}
        <div className="kop-surat border-b-4 border-[#003049] pb-5 text-center relative flex flex-col items-center justify-center gap-1">
          <h1 className="text-xl font-black text-[#003049] tracking-wider uppercase">ORGANISASI KOMITE SEKOLAH MANDIRI</h1>
          <p className="text-xs text-[#003049] font-extrabold uppercase tracking-widest">Laporan Pertanggungjawaban Keuangan Berdasarkan Kalender Pendidikan</p>
          <p className="text-xs text-slate-500 leading-normal max-w-lg mt-0.5">Sekretariat Komite Sekolah • Jl. Pendidikan No. 74 Komplek Sekolah, Jakarta. Email: komite@sekolah.sch.id</p>
          <div className="mt-2 inline-flex items-center gap-2 bg-slate-100 px-3 py-1 rounded-full text-[11px] font-extrabold text-[#003049]">
            <Landmark className="h-3.5 w-3.5" />
            Tahun Ajaran {selectedAcademicYear} (Siklus Juli {eduSemesters.startYear} - Juni {eduSemesters.endYear})
          </div>
          <div className="absolute right-0 top-0 text-[10px] text-slate-400 font-mono italic no-print">Tercetak Sistem: {new Date().toLocaleDateString('id-ID')}</div>
        </div>

        {/* ==================== SCREEN 0: LPJ KALENDER PENDIDIKAN (FULL YEAR JULI - JUNI) ==================== */}
        {activeReport === 'lpj' && (
          <div className="space-y-8">
            <div className="text-center space-y-1">
              <h2 className="text-base font-black text-[#003049] tracking-wider uppercase">
                LAPORAN PERTANGGUNGJAWABAN (LPJ) KEUANGAN KOMITE SEKOLAH
              </h2>
              <p className="text-xs font-extrabold text-slate-600 uppercase tracking-wider">
                PERIODE KALENDER PENDIDIKAN TAHUN AJARAN {selectedAcademicYear}
              </p>
            </div>

            {/* High Level 12-Month Educational Calendar Overview */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="border border-slate-200 p-5 rounded-2xl bg-gradient-to-br from-[#f7fafc] to-[#e6f0f6] space-y-1">
                <span className="text-[10px] font-extrabold text-[#003049]/80 uppercase tracking-widest block">Total Pemasukan TA (Juli - Juni)</span>
                <span className="text-xl font-black text-emerald-700 font-mono block">+{formatIDR(lpjData.totalYearIncome)}</span>
                <p className="text-[10px] text-slate-500 font-medium">Iuran wali murid, sumbangan, & donasi acara</p>
              </div>

              <div className="border border-slate-200 p-5 rounded-2xl bg-gradient-to-br from-[#fff5f5] to-[#fde8e8] space-y-1">
                <span className="text-[10px] font-extrabold text-[#780000]/80 uppercase tracking-widest block">Total Pengeluaran Program (Juli - Juni)</span>
                <span className="text-xl font-black text-[#c1121f] font-mono block">-{formatIDR(lpjData.totalYearExpense)}</span>
                <p className="text-[10px] text-slate-500 font-medium">Realisasi program kerja, sarana, & giat sekolah</p>
              </div>

              <div className="border border-slate-200 p-5 rounded-2xl bg-gradient-to-br from-white to-[#fdf0d5]/60 space-y-1">
                <span className="text-[10px] font-extrabold text-[#003049]/80 uppercase tracking-widest block">Sisa Saldo Kas Bersih LPJ</span>
                <span className="text-xl font-black text-[#003049] font-mono block">{formatIDR(lpjData.netYearCash)}</span>
                <p className="text-[10px] text-slate-500 font-medium">Saldo siap dialihkan ke TA berikutnya</p>
              </div>
            </div>

            {/* Semester Breakdown Table */}
            <div className="space-y-3">
              <h3 className="text-xs font-black text-[#003049] uppercase tracking-wider border-b-2 border-[#003049] pb-2 flex justify-between items-center">
                <span>I. REKAPITULASI KEUANGAN PER SEMESTER (KALENDER PENDIDIKAN)</span>
                <span className="text-[10px] font-bold text-slate-500">TA {selectedAcademicYear}</span>
              </h3>

              <table className="w-full text-xs text-left border-collapse">
                <thead>
                  <tr className="bg-[#f7fafc] border-b border-slate-200 text-[#003049] font-black uppercase tracking-wider">
                    <th className="py-3 px-4">Semester & Rentang Bulan</th>
                    <th className="py-3 px-4 text-right">Target Iuran</th>
                    <th className="py-3 px-4 text-right">Pemasukan Realisasi</th>
                    <th className="py-3 px-4 text-right">Pengeluaran Realisasi</th>
                    <th className="py-3 px-4 text-right">Saldo Netto Semester</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  <tr>
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      <div>{eduSemesters.sem1Name}</div>
                      <span className="text-[10px] text-slate-400 font-medium">Bulan Ke-1 s.d. Ke-6</span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-medium">{formatIDR(lpjData.sem1BillsTarget)}</td>
                    <td className="py-3.5 px-4 text-right font-black text-emerald-700">+{formatIDR(lpjData.sem1Income)}</td>
                    <td className="py-3.5 px-4 text-right font-black text-[#c1121f]">-{formatIDR(lpjData.sem1Expense)}</td>
                    <td className="py-3.5 px-4 text-right font-black text-[#003049]">{formatIDR(lpjData.sem1Net)}</td>
                  </tr>
                  <tr>
                    <td className="py-3.5 px-4 font-bold text-slate-900">
                      <div>{eduSemesters.sem2Name}</div>
                      <span className="text-[10px] text-slate-400 font-medium">Bulan Ke-7 s.d. Ke-12</span>
                    </td>
                    <td className="py-3.5 px-4 text-right font-medium">{formatIDR(lpjData.sem2BillsTarget)}</td>
                    <td className="py-3.5 px-4 text-right font-black text-emerald-700">+{formatIDR(lpjData.sem2Income)}</td>
                    <td className="py-3.5 px-4 text-right font-black text-[#c1121f]">-{formatIDR(lpjData.sem2Expense)}</td>
                    <td className="py-3.5 px-4 text-right font-black text-[#003049]">{formatIDR(lpjData.sem2Net)}</td>
                  </tr>
                  <tr className="bg-[#f7fafc] font-black text-slate-900">
                    <td className="py-3.5 px-4 uppercase">TOTAL TAHUN AJARAN FULL (JULI – JUNI)</td>
                    <td className="py-3.5 px-4 text-right">{formatIDR(lpjData.totalBillsTarget)}</td>
                    <td className="py-3.5 px-4 text-right text-emerald-800">+{formatIDR(lpjData.totalYearIncome)}</td>
                    <td className="py-3.5 px-4 text-right text-[#c1121f]">-{formatIDR(lpjData.totalYearExpense)}</td>
                    <td className="py-3.5 px-4 text-right text-[#003049]">{formatIDR(lpjData.netYearCash)}</td>
                  </tr>
                </tbody>
              </table>
            </div>

            {/* Complete Audit Summary */}
            <div className="bg-slate-50/80 p-5 rounded-2xl border border-slate-200 text-xs space-y-2">
              <h4 className="font-black text-[#003049] uppercase tracking-wider">II. RINGKASAN AKUNTABILITAS & PIUTANG IURAN</h4>
              <p className="text-slate-600 leading-relaxed font-medium">
                Sesuai periodisasi Kalender Pendidikan TA {selectedAcademicYear}, total anggaran kebutuhan iuran gotong royong murid sebesar <b>{formatIDR(lpjData.totalBillsTarget)}</b> dengan total realisasi iuran terkumpul sebesar <b>{formatIDR(lpjData.totalBillsPaid)}</b>. Sisa piutang berjalan yang perlu ditagih/direkonsiliasi pada siklus berikutnya adalah sebesar <b>{formatIDR(lpjData.totalBillsOutstanding)}</b>.
              </p>
            </div>
          </div>
        )}

        {/* ==================== SCREEN 1: LAPORAN BULANAN (MONTHLY CASH FLOW) ==================== */}
        {activeReport === 'monthly' && (
          <div className="space-y-6">
            <div className="text-center space-y-1">
              <h2 className="text-md font-bold text-gray-900 tracking-wider uppercase">LAPORAN MUTASI BULANAN & ARUS KAS KOMITE SEKOLAH</h2>
              <p className="text-xs text-[#003049] font-extrabold tracking-wider uppercase">
                PERIODE BULAN: {new Date(selectedMonth + "-01").toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })} (TA {selectedAcademicYear})
              </p>
            </div>

            {/* Rollover balance summary ledger */}
            <div className="grid grid-cols-4 gap-4 text-xs font-semibold uppercase tracking-wider text-slate-700">
              <div className="border border-slate-200 p-4 rounded-2xl text-center bg-slate-50/50">
                <span className="text-[9px] text-slate-400 block font-bold mb-1">Saldo Kas Awal</span>
                <span className="text-xs font-black text-slate-900">{formatIDR(monthlyData.beginningBalance)}</span>
              </div>
              <div className="border border-emerald-100 p-4 rounded-2xl text-center bg-emerald-50/10">
                <span className="text-[9px] text-emerald-600 block font-bold mb-1">Mutasi Masuk</span>
                <span className="text-xs font-black text-emerald-700">+{formatIDR(monthlyData.incomeTotal)}</span>
              </div>
              <div className="border border-rose-100 p-4 rounded-2xl text-center bg-rose-50/10">
                <span className="text-[9px] text-rose-600 block font-bold mb-1">Mutasi Keluar</span>
                <span className="text-xs font-black text-[#c1121f]">-{formatIDR(monthlyData.expenseTotal)}</span>
              </div>
              <div className="border border-slate-200 p-4 rounded-2xl text-center bg-[#f7fafc]">
                <span className="text-[9px] text-[#003049] block font-bold mb-1">Saldo Akhir</span>
                <span className="text-xs font-black text-[#003049]">{formatIDR(monthlyData.endingBalance)}</span>
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
                <h3 className="text-xs font-bold text-[#780000] uppercase tracking-widest border-b-2 border-[#c1121f] pb-1.5 flex items-center justify-between">
                  <span>II. Rincian Pengeluaran Kas</span>
                  <span className="text-[11px] font-extrabold text-[#c1121f]">{formatIDR(monthlyData.expenseTotal)}</span>
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
                          <td className="py-2 px-2 text-right font-bold text-[#c1121f]">-{formatIDR(tx.amount)}</td>
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
                TA {selectedAcademicYear} • Filter: {billingStatusFilter === 'All' ? 'SEMUA STATUS TAGIHAN' : billingStatusFilter.toUpperCase()}
              </p>
            </div>

            {/* Billing totalizer blocks */}
            <div className="grid grid-cols-3 gap-4 text-xs font-semibold uppercase tracking-wider text-slate-700">
              <div className="border border-slate-200 p-4 rounded-2xl text-center">
                <span className="text-[9px] text-slate-400 block font-bold mb-1">Total Target Piutang Komite</span>
                <span className="text-xs font-bold text-slate-800">{formatIDR(billingReportData.totalDuesRequired)}</span>
              </div>
              <div className="border border-slate-200 p-4 rounded-2xl text-center bg-emerald-50/10">
                <span className="text-[9px] text-emerald-600 block font-bold mb-1">Total Terbayarkan</span>
                <span className="text-xs font-bold text-emerald-700">{formatIDR(billingReportData.totalDuesCollected)}</span>
              </div>
              <div className="border border-slate-200 p-4 rounded-2xl text-center bg-amber-50/10 border-amber-100">
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

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left min-w-[720px]">
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
          </div>
        )}

        {/* ==================== SCREEN 3: LAPORAN GLOBAL PER KELAS ==================== */}
        {activeReport === 'class' && (
          <div className="space-y-6">
            <div className="text-center space-y-1">
              <h2 className="text-md font-bold text-gray-900 tracking-wider uppercase">LAPORAN KINERJA DAN PARTISIPASI IURAN GLOBAL PER KELAS</h2>
              <p className="text-xs text-[#003049] font-semibold tracking-wider uppercase">KEDEPUTIAN BENDAHARA KOMITE SEKOLAH MANDIRI • TA {selectedAcademicYear}</p>
            </div>

            {/* Table of Class Rosters aggregated */}
            <div className="space-y-3 pt-2">
              <h3 className="text-xs font-bold text-slate-800 uppercase tracking-widest border-b border-gray-300 pb-1.5">
                Rangkuman Partisipasi Cash Flow Unit Kelas Sederajat
              </h3>

              <div className="overflow-x-auto">
                <table className="w-full text-xs text-left min-w-[650px]">
                  <thead>
                    <tr className="bg-gray-100 border-b border-gray-200 font-bold text-slate-500 uppercase tracking-wider text-[11px] whitespace-nowrap">
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
        </div>
      )}

        {/* PRINT FOOTER: SIGN BOXES FOR ACCOUNTABILITY AND TRANSPARENCY */}
        <div className="pt-16 grid grid-cols-2 md:grid-cols-3 gap-6 text-xs text-center font-semibold text-gray-700 border-t border-gray-200 leading-normal">
          <div className="space-y-16">
            <span>Mengetahui,<br /><b>Ketua Komite Sekolah</b></span>
            <div className="block">
              <span className="border-t border-[#003049] pt-1.5 px-6 font-bold uppercase block max-w-xs mx-auto text-[11px]">
                Dr. H. Muhammad Ramli
              </span>
            </div>
          </div>
          <div className="hidden md:block space-y-16">
            <span>Menyetujui,<br /><b>Kepala Sekolah Mandiri</b></span>
            <div className="block">
              <span className="border-t border-[#003049] pt-1.5 px-6 font-bold uppercase block max-w-xs mx-auto text-[11px]">
                Drs. Heru Wijayanto, M.Pd
              </span>
            </div>
          </div>
          <div className="space-y-16">
            <span>Jakarta, 30 Juni {eduSemesters.endYear}<br /><b>Bendahara Komite</b></span>
            <div className="block">
              <span className="border-t border-[#003049] pt-1.5 px-6 font-bold uppercase block max-w-xs mx-auto text-[11px]">
                Sri Wahyuli, S.E
              </span>
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
