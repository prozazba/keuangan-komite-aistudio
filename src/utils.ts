import { doc, writeBatch, collection, getDocs } from 'firebase/firestore';
import { db } from './firebase';
import { Student, Transaction, Event, StudentBill } from './types';

/**
 * Formats a number into Indonesian Rupiah (IDR)
 */
export function formatIDR(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0
  }).format(amount);
}

/**
 * Downloads data as a CSV file compatible with Excel
 */
export function exportToCSV(filename: string, headers: string[], rows: any[][]) {
  const csvContent = [headers.join(",")].concat(
    rows.map(row => 
      row.map(val => {
        const text = val === null || val === undefined ? '' : String(val);
        // Escape standard double quotes
        return `"${text.replace(/"/g, '""')}"`;
      }).join(",")
    )
  ).join("\n");
  
  const blob = new Blob(["\ufeff" + csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  if (link.download !== undefined) {
    link.setAttribute("href", url);
    link.setAttribute("download", filename);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }
}

/**
 * Generates initial demo data to Firestore ifcollections are empty
 */
export async function seedDemoData(adminEmail: string): Promise<boolean> {
  try {
    const studentsSnap = await getDocs(collection(db, 'students'));
    if (!studentsSnap.empty) {
      return false; // Already populated
    }

    const batch = writeBatch(db);

    // 1. Core Students
    const sampleStudents: Student[] = [
      { id: 'std_01', studentId: '10928371', name: 'Ahmad Fauzi', classId: 'Kelas 7-A', parentsName: 'Budi Fauzi', parentsEmail: 'budi.fauzi@example.com', parentsPhone: '081234567890', status: 'active' },
      { id: 'std_02', studentId: '10928372', name: 'Siti Aminah', classId: 'Kelas 7-A', parentsName: 'Yusuf Amin', parentsEmail: 'yusuf.a@example.com', parentsPhone: '081298765432', status: 'active' },
      { id: 'std_03', studentId: '10928373', name: 'Dewi Lestari', classId: 'Kelas 8-B', parentsName: 'Eko Lestari', parentsEmail: 'eko.l@example.com', parentsPhone: '085711223344', status: 'active' },
      { id: 'std_04', studentId: '10928374', name: 'Rian Hidayat', classId: 'Kelas 8-B', parentsName: 'Aris Hidayat', parentsEmail: 'aris.h@example.com', parentsPhone: '087855667788', status: 'active' },
      { id: 'std_05', studentId: '10928375', name: 'Sarah Wijaya', classId: 'Kelas 9-C', parentsName: 'Hendra Wijaya', parentsEmail: 'hendra.w@example.com', parentsPhone: '081399001122', status: 'active' },
      { id: 'std_06', studentId: '10928376', name: 'Bagus Pratama', classId: 'Kelas 9-C', parentsName: 'Rudi Pratama', parentsEmail: 'rudi.p@example.com', parentsPhone: '081122334455', status: 'active' }
    ];

    sampleStudents.forEach(student => {
      const docRef = doc(db, 'students', student.id);
      batch.set(docRef, student);
    });

    // 2. Core Events & Budgets
    const sampleEvents: Event[] = [
      {
        id: 'evt_01',
        title: 'Pentas Seni & Kebudayaan Sekolah',
        description: 'Pentas seni tahunan komite sekolah untuk menumbuhkan minat seni siswa.',
        date: '2026-06-15',
        budgetTarget: 15000000,
        actualIncome: 12500000,
        actualExpense: 8500000,
        status: 'active',
        createdAt: new Date().toISOString()
      },
      {
        id: 'evt_02',
        title: 'Peringatan Hari Guru Nasional',
        description: 'Pemberian apresiasi kepada guru serta syukuran komite sekolah.',
        date: '2026-11-25',
        budgetTarget: 5000000,
        actualIncome: 3500000,
        actualExpense: 0,
        status: 'planning',
        createdAt: new Date().toISOString()
      },
      {
        id: 'evt_03',
        title: 'Renovasi Sanitasi & Toilet Kelas 7',
        description: 'Bantuan komite untuk perbaikan toilet dan fasilitas sanitasi kelas 7.',
        date: '2026-04-10',
        budgetTarget: 20000000,
        actualIncome: 20000000,
        actualExpense: 19500000,
        status: 'completed',
        createdAt: new Date().toISOString()
      }
    ];

    sampleEvents.forEach(event => {
      const docRef = doc(db, 'events', event.id);
      batch.set(docRef, event);
    });

    // 3. Transactions List
    const sampleTransactions: Transaction[] = [
      // Incomes
      {
        id: 'tx_01',
        date: '2026-05-02',
        type: 'income',
        category: 'Iuran Bulanan',
        amount: 150000,
        description: 'Pembayaran iuran bulanan Mei 2026 - Ahmad Fauzi (Kelas 7-A)',
        studentId: 'std_01',
        studentName: 'Ahmad Fauzi',
        classId: 'Kelas 7-A',
        period: 'Mei 2026',
        paymentMethod: 'Transfer Bank',
        recordedBy: adminEmail,
        createdAt: new Date().toISOString()
      },
      {
        id: 'tx_02',
        date: '2026-05-03',
        type: 'income',
        category: 'Iuran Bulanan',
        amount: 150000,
        description: 'Pembayaran iuran bulanan Mei 2026 - Siti Aminah (Kelas 7-A)',
        studentId: 'std_02',
        studentName: 'Siti Aminah',
        classId: 'Kelas 7-A',
        period: 'Mei 2026',
        paymentMethod: 'E-Wallet',
        recordedBy: adminEmail,
        createdAt: new Date().toISOString()
      },
      {
        id: 'tx_03',
        date: '2026-05-04',
        type: 'income',
        category: 'Sumbangan Acara',
        amount: 5000000,
        description: 'Sumbangan acara Pentas Seni dari Donatur Wali Murid',
        eventId: 'evt_01',
        paymentMethod: 'Transfer Bank',
        recordedBy: adminEmail,
        createdAt: new Date().toISOString()
      },
      {
        id: 'tx_04',
        date: '2026-05-08',
        type: 'income',
        category: 'Iuran Bulanan',
        amount: 150000,
        description: 'Pembayaran iuran bulanan Mei 2026 - Dewi Lestari (Kelas 8-B)',
        studentId: 'std_03',
        studentName: 'Dewi Lestari',
        classId: 'Kelas 8-B',
        period: 'Mei 2026',
        paymentMethod: 'Cash',
        recordedBy: adminEmail,
        createdAt: new Date().toISOString()
      },
      // Expenses
      {
        id: 'tx_05',
        date: '2026-05-10',
        type: 'expense',
        category: 'Operasional',
        amount: 450000,
        description: 'Pembelian kertas kado, konsumsi rapat panitia bulanan',
        paymentMethod: 'Cash',
        recordedBy: adminEmail,
        createdAt: new Date().toISOString()
      },
      {
        id: 'tx_06',
        date: '2026-05-12',
        type: 'expense',
        category: 'Acara Sekolah',
        amount: 2500000,
        description: 'Uang muka (DP) sewa panggung Pentas Seni',
        eventId: 'evt_01',
        paymentMethod: 'Transfer Bank',
        recordedBy: adminEmail,
        createdAt: new Date().toISOString()
      },
      {
        id: 'tx_07',
        date: '2026-05-14',
        type: 'expense',
        category: 'Prasarana',
        amount: 19500000,
        description: 'Pembayaran borongan renovasi toilet kelas 7',
        eventId: 'evt_03',
        paymentMethod: 'Transfer Bank',
        recordedBy: adminEmail,
        createdAt: new Date().toISOString()
      }
    ];

    sampleTransactions.forEach(tx => {
      const docRef = doc(db, 'transactions', tx.id);
      batch.set(docRef, tx);
    });

    // 4. Student Bills (Iuran Mei 2026 & April 2026)
    const periods = ['April 2026', 'Mei 2026'];
    let idx = 1;
    
    sampleStudents.forEach(student => {
      periods.forEach(period => {
        const isPaidInMayTx = (student.id === 'std_01' || student.id === 'std_02' || student.id === 'std_03') && period === 'Mei 2026';
        const isAlreadyPaidInApril = student.id !== 'std_04'; // Rian Hidayat is outstanding in April

        const id = `${student.id}_${period.replace(' ', '_')}`;
        const amountRequired = 150000;
        let amountPaid = 0;
        let status: 'unpaid' | 'partially_paid' | 'paid' = 'unpaid';

        if (period === 'Mei 2026' && isPaidInMayTx) {
          amountPaid = 150000;
          status = 'paid';
        } else if (period === 'April 2026' && isAlreadyPaidInApril) {
          amountPaid = 150000;
          status = 'paid';
        }

        const bill: StudentBill = {
          id,
          studentId: student.id,
          studentName: student.name,
          studentClass: student.classId,
          parentsName: student.parentsName,
          parentsPhone: student.parentsPhone,
          parentsEmail: student.parentsEmail,
          period,
          amountRequired,
          amountPaid,
          status,
          dueDate: period === 'Mei 2026' ? '2026-05-20' : '2026-04-20',
          updatedAt: new Date().toISOString()
        };

        const docRef = doc(db, 'student_bills', id);
        batch.set(docRef, bill);
      });
    });

    await batch.commit();
    return true;
  } catch (err) {
    console.error("Failed to seed database:", err);
    return false;
  }
}

/**
 * Maps a period string (e.g. "Mei 2026") or a date (e.g. "2026-05-25") to an Indonesian Academic Year (e.g. "2025/2026").
 */
export function getAcademicYearFromPeriod(period: string): string {
  if (!period) return '2025/2026';
  const parts = period.trim().split(' ');
  if (parts.length < 2) return '2025/2026';
  
  const monthName = parts[0]?.toLowerCase();
  const year = parseInt(parts[1], 10);
  if (isNaN(year)) return '2025/2026';
  
  const monthsMap: Record<string, number> = {
    'januari': 1, 'februari': 2, 'maret': 3, 'april': 4, 'mei': 5, 'juni': 6,
    'juli': 7, 'agustus': 8, 'september': 9, 'oktober': 10, 'november': 11, 'desember': 12,
    'jan': 1, 'feb': 2, 'mar': 3, 'apr': 4, 'may': 5, 'jun': 6,
    'jul': 7, 'aug': 8, 'sep': 9, 'oct': 10, 'nov': 11, 'dec': 12
  };
  
  const monthNum = monthsMap[monthName] || 1;
  if (monthNum >= 7) {
    return `${year}/${year + 1}`;
  } else {
    return `${year - 1}/${year}`;
  }
}

export function getAcademicYearFromDate(dateStr: string): string {
  if (!dateStr) return '2025/2026';
  const parts = dateStr.split('-');
  if (parts.length < 2) return '2025/2026';
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10);
  if (isNaN(year) || isNaN(month)) return '2025/2026';
  
  if (month >= 7) {
    return `${year}/${year + 1}`;
  } else {
    return `${year - 1}/${year}`;
  }
}

/**
 * Returns a list of 12 periods (months) for a given academic year.
 * E.g., for "2025/2026" returns ["Juli 2025", ..., "Juni 2026"]
 */
export function getPeriodsForAcademicYear(academicYear: string): string[] {
  const parts = academicYear.split('/');
  if (parts.length !== 2) return ['April 2026', 'Mei 2026'];
  const startYear = parseInt(parts[0], 10);
  const endYear = parseInt(parts[1], 10);
  if (isNaN(startYear) || isNaN(endYear)) return ['April 2026', 'Mei 2026'];
  
  return [
    `Juli ${startYear}`,
    `Agustus ${startYear}`,
    `September ${startYear}`,
    `Oktober ${startYear}`,
    `November ${startYear}`,
    `Desember ${startYear}`,
    `Januari ${endYear}`,
    `Februari ${endYear}`,
    `Maret ${endYear}`,
    `April ${endYear}`,
    `Mei ${endYear}`,
    `Juni ${endYear}`
  ];
}

export function getDueDateForPeriod(period: string): string {
  const parts = period.split(' ');
  if (parts.length !== 2) return '2026-05-20';
  const monthName = parts[0]?.toLowerCase();
  const year = parts[1];
  
  const monthsMap: Record<string, string> = {
    'januari': '01', 'februari': '02', 'maret': '03', 'april': '04', 'mei': '05', 'juni': '06',
    'juli': '07', 'agustus': '08', 'september': '09', 'oktober': '10', 'november': '11', 'desember': '12'
  };
  
  const monthNum = monthsMap[monthName] || '05';
  return `${year}-${monthNum}-20`;
}

