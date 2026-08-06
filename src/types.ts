/**
 * Types definition for Keuangan Komite application
 */

export interface Student {
  id: string; // Unique ID (Firebase custom or generated)
  studentId: string; // NISN / Student ID
  name: string;
  classId: string; // e.g. "Kelas 1-A", "Kelas 2-B"
  parentsName: string;
  parentsEmail: string;
  parentsPhone: string;
  status: 'active' | 'inactive';
  academicYear?: string; // e.g. "2025/2026"
}

export interface Transaction {
  id: string;
  date: string; // YYYY-MM-DD
  type: 'income' | 'expense';
  category: string; // e.g., "Iuran Bulanan", "Sumbangan", "Sponsorship", "Operasional Kertas", "Bantuan Sosial"
  amount: number;
  description: string;
  studentId?: string; // Optional: reference to a student (if student payment)
  studentName?: string; // Cache student name
  classId?: string; // Cache class ID
  eventId?: string; // Optional: associated with a specific event
  period?: string; // Optional: billing period (e.g. "Mei 2026")
  paymentMethod: 'Cash' | 'Transfer Bank' | 'E-Wallet';
  recordedBy: string; // Email/Name of the recorder
  createdAt: string; // ISO string
}

export interface Event {
  id: string;
  title: string;
  description: string;
  date: string;
  budgetTarget: number; // Rencana Anggaran Biaya (RAB)
  actualIncome: number; // Aggergated from transactions categorized under this Event (income)
  actualExpense: number; // Aggregated from transactions categorized under this Event (expense)
  status: 'planning' | 'active' | 'completed' | 'cancelled';
  createdAt: string;
}

export interface StudentBill {
  id: string; // Format: studentId_period_category
  studentId: string;
  studentName: string;
  studentClass: string;
  parentsName: string;
  parentsPhone: string;
  parentsEmail: string;
  period: string; // e.g. "Mei 2026"
  amountRequired: number;
  amountPaid: number;
  status: 'unpaid' | 'partially_paid' | 'paid';
  dueDate: string; // YYYY-MM-DD
  updatedAt: string;
}

export interface SchoolClass {
  id: string;
  name: string;
  gradeLevel?: string;
  homeroomTeacher?: string;
  roomNumber?: string;
  createdAt?: string;
}

export interface TenantProfile {
  id: string;
  name: string;
  shortName?: string;
  schoolLevel: string; // SD, SMP, SMA, SMK
  academicYear: string; // e.g. "2025/2026"
  committeeChair?: string;
  treasurerName?: string;
  principalName?: string;
  address?: string;
  phone?: string;
  email?: string;
  monthlyDuesTarget: number;
  logoUrl?: string;
  logoIcon?: string; // Icon name e.g. "landmark", "school", "book-open", "award"
  themeColor?: string; // Theme color preset e.g. "navy", "emerald", "cyan", "purple", "maroon"
  bankAccount?: string;
}

export interface TenantUser {
  id: string;
  email: string;
  name: string;
  role: 'admin' | 'treasurer' | 'auditor' | 'parent';
  tenantId: string;
}

export interface NotificationLog {
  id: string;
  studentId: string;
  studentName: string;
  period: string;
  recipientPhone: string;
  recipientEmail: string;
  amount: number;
  status: 'sent' | 'pending' | 'failed';
  sentAt: string;
  message: string;
}
