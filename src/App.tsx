/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  onAuthStateChanged, 
  signInAnonymously, 
  GoogleAuthProvider, 
  signInWithPopup, 
  signOut, 
  User as FirebaseUser 
} from 'firebase/auth';
import { auth, db, handleFirestoreError, OperationType, collection, onSnapshot } from './firebase';
import { Student, Transaction, Event, StudentBill } from './types';
import { seedDemoData, formatIDR, getAcademicYearFromPeriod, getAcademicYearFromDate } from './utils';
import { motion, AnimatePresence } from 'motion/react';

// Subcomponents
import StudentManager from './components/StudentManager';
import StudentBillsManager from './components/StudentBillsManager';
import CashFlowTracker from './components/CashFlowTracker';
import EventManager from './components/EventManager';
import NotificationsSim from './components/NotificationsSim';
import Reports from './components/Reports';

// Icons
import { 
  LayoutDashboard, GraduationCap, Coins, Target, Bell, 
  FileSpreadsheet, LogOut, Sparkles, BookOpen, AlertCircle, 
  UserCheck, ShieldCheck, HelpCircle, Building2, CheckCircle2, 
  ArrowDownLeft, ArrowUpRight, TrendingUp, Landmark, Plus, ClipboardList
} from 'lucide-react';

export default function App() {
  // Authentication & Loading States
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isDemo, setIsDemo] = useState<boolean>(() => {
    return localStorage.getItem('isDemo') === 'true';
  });
  const [isOfflineMode, setIsOfflineMode] = useState<boolean>(() => {
    return localStorage.getItem('isOfflineMode') === 'true';
  });
  
  // Role selection
  const [userRole, setUserRole] = useState<'admin' | 'operator'>(() => {
    return (localStorage.getItem('userRole') as 'admin' | 'operator') || 'admin';
  });
  const [operatorUser, setOperatorUser] = useState('');
  const [operatorPass, setOperatorPass] = useState('');

  // Auto synchronise state to localStorage to prevent refresh reverts
  useEffect(() => {
    localStorage.setItem('userRole', userRole);
  }, [userRole]);

  useEffect(() => {
    localStorage.setItem('isDemo', isDemo ? 'true' : 'false');
  }, [isDemo]);

  useEffect(() => {
    localStorage.setItem('isOfflineMode', isOfflineMode ? 'true' : 'false');
  }, [isOfflineMode]);

  // Firestore Collections States
  const [students, setStudents] = useState<Student[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [bills, setBills] = useState<StudentBill[]>([]);
  const [collectionsLoading, setCollectionsLoading] = useState(true);

  // Global Academic Year State
  const [selectedAcademicYear, setSelectedAcademicYear] = useState<string>(() => {
    return localStorage.getItem('selectedAcademicYear') || '2025/2026';
  });

  const [availableAcademicYears, setAvailableAcademicYears] = useState<string[]>(() => {
    const saved = localStorage.getItem('availableAcademicYears');
    return saved ? JSON.parse(saved) : ['2024/2025', '2025/2026', '2026/2027'];
  });

  useEffect(() => {
    localStorage.setItem('selectedAcademicYear', selectedAcademicYear);
  }, [selectedAcademicYear]);

  useEffect(() => {
    localStorage.setItem('availableAcademicYears', JSON.stringify(availableAcademicYears));
  }, [availableAcademicYears]);

  const handleAddAcademicYear = () => {
    const year = window.prompt("Masukkan Tahun Ajaran Baru (Format: YYYY/YYYY, cth: 2027/2028):");
    if (year) {
      const match = year.trim().match(/^(\d{4})\/(\d{4})$/);
      if (!match) {
        alert("Format salah! Gunakan format YYYY/YYYY (contoh: 2027/2028).");
        return;
      }
      const val = year.trim();
      if (availableAcademicYears.includes(val)) {
        alert("Tahun ajaran ini sudah terdaftar!");
        return;
      }
      const sorted = [...availableAcademicYears, val].sort((a, b) => a.localeCompare(b));
      setAvailableAcademicYears(sorted);
      setSelectedAcademicYear(val);
      alert(`Tahun Ajaran "${val}" sukses ditambahkan dan diaktifkan!`);
    }
  };

  // UI Active Navigation Tab
  const [activeTab, setActiveTab] = useState<'dashboard' | 'students' | 'iuran' | 'cashflow' | 'events' | 'notifications' | 'reports'>('dashboard');

  // Static list of classes fallback
  const classesFallback = ['Kelas 7-A', 'Kelas 7-B', 'Kelas 8-A', 'Kelas 8-B', 'Kelas 9-A', 'Kelas 9-B', 'Kelas 9-C'];
  const [dynamicClasses, setDynamicClasses] = useState<string[]>(classesFallback);

  // 1. Listen for Authentication Changes
  useEffect(() => {
    const savedOffline = localStorage.getItem('isOfflineMode') === 'true';
    if (savedOffline) {
      setIsOfflineMode(true);
      const savedRole = localStorage.getItem('userRole') as 'admin' | 'operator' || 'admin';
      setUserRole(savedRole);
      setIsDemo(true);
      setUser({
        uid: savedRole === 'operator' ? 'simulated-operator-id' : 'simulated-admin-id',
        email: savedRole === 'operator' ? 'operator@komite.id' : 'demo.bendahara@komite.id',
        displayName: savedRole === 'operator' ? 'Operator Komite' : 'Treasurer Admin',
        emailVerified: true,
        isAnonymous: true,
        providerId: 'firebase',
      } as any);
      setAuthLoading(false);
      return;
    }

    const unsubscribe = onAuthStateChanged(auth, (authUser) => {
      setUser(authUser);
      setAuthLoading(false);
      
      if (!authUser) {
        setIsDemo(false);
        setUserRole('admin');
        setIsOfflineMode(false);
        // Clear data on logout
        setStudents([]);
        setTransactions([]);
        setEvents([]);
        setBills([]);
        setCollectionsLoading(false);
      }
    });
    return unsubscribe;
  }, []);

  // 2. Attach Live Firestore Listeners once user is authenticated
  useEffect(() => {
    if (!user) return;

    setCollectionsLoading(true);

    // Live listening students collection
    const unStudents = onSnapshot(collection(db, 'students'), (snap) => {
      const items = snap.docs.map(doc => doc.data() as Student);
      setStudents(items);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'students'));

    // Live listening transactions collection
    const unTransactions = onSnapshot(collection(db, 'transactions'), (snap) => {
      const items = snap.docs.map(doc => doc.data() as Transaction);
      setTransactions(items);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'transactions'));

    // Live listening events collection
    const unEvents = onSnapshot(collection(db, 'events'), (snap) => {
      const items = snap.docs.map(doc => doc.data() as Event);
      setEvents(items);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'events'));

    // Live listening student bills
    const unBills = onSnapshot(collection(db, 'student_bills'), (snap) => {
      const items = snap.docs.map(doc => doc.data() as StudentBill);
      setBills(items);
      setCollectionsLoading(false);
    }, (err) => handleFirestoreError(err, OperationType.LIST, 'student_bills'));

    // Live listening custom classes
    const unClasses = onSnapshot(collection(db, 'classes'), (snap) => {
      if (!snap.empty) {
        const items = snap.docs.map(doc => doc.id);
        const blended = Array.from(new Set([...classesFallback, ...items]));
        setDynamicClasses(blended);
      } else {
        setDynamicClasses(classesFallback);
      }
    }, (err) => {
      console.warn("Classes sync issues:", err);
      setDynamicClasses(classesFallback);
    });

    return () => {
      unStudents();
      unTransactions();
      unEvents();
      unBills();
      unClasses();
    };
  }, [user]);

  // Handle Standard Google Sign-In Popup
  const handleGoogleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error("Google Sign-in failed:", err);
      alert("Gagal login Google. Silakan coba masuk via Demo Account.");
    }
  };

  // Handle Sandboxed Anonymous Login (Completely avoids Popup Blockages)
  const handleDemoLogin = async () => {
    try {
      setIsDemo(true);
      setUserRole('admin');
      setIsOfflineMode(false);
      localStorage.setItem('isOfflineMode', 'false');
      await signInAnonymously(auth);
    } catch (err) {
      console.warn("Firebase Anonymous Sign-in is restricted on this project. Falling back to secure Simulated mode:", err);
      localStorage.setItem('isOfflineMode', 'true');
      setIsOfflineMode(true);
      setUserRole('admin');
      setIsDemo(true);
      
      setUser({
        uid: 'simulated-admin-id',
        email: 'demo.bendahara@komite.id',
        displayName: 'Treasurer Admin',
        emailVerified: true,
        isAnonymous: true,
        providerId: 'firebase',
      } as any);
    }
  };

  // Special operator authentication logic
  const handleOperatorLogin = async () => {
    if (operatorUser.trim() === 'komite-op' && operatorPass === 'operator123') {
      try {
        setAuthLoading(true);
        setIsDemo(true);
        setUserRole('operator');
        setIsOfflineMode(false);
        localStorage.setItem('isOfflineMode', 'false');
        
        // Log in anonymously to get reads/writes session privileges
        await signInAnonymously(auth);
        
        // Clean up password
        setOperatorUser('');
        setOperatorPass('');
      } catch (err) {
        console.warn("Firebase Anonymous Sign-in is restricted on this project. Falling back to secure Simulated mode:", err);
        localStorage.setItem('isOfflineMode', 'true');
        setIsOfflineMode(true);
        setUserRole('operator');
        setIsDemo(true);
        
        // Mock a user session
        setUser({
          uid: 'simulated-operator-id',
          email: 'operator@komite.id',
          displayName: 'Operator Komite',
          emailVerified: true,
          isAnonymous: true,
          providerId: 'firebase',
        } as any);
        
        // Clean up password
        setOperatorUser('');
        setOperatorPass('');
      } finally {
        setAuthLoading(false);
      }
    } else {
      alert("Kredensial Operator Salah! Harap masukkan username 'komite-op' dan password 'operator123' .");
    }
  };

  // Register class dynamic generator doc
  const handleAddClass = async (newClassName: string) => {
    try {
      const { doc: localDoc, setDoc: localSetDoc } = await import('./firebase');
      await localSetDoc(localDoc(db, 'classes', newClassName), {
        name: newClassName,
        createdAt: new Date().toISOString()
      });
    } catch (err) {
      console.error("Gagal mendaftarkan kelas baru ke Firestore:", err);
      // Local fallback
      setDynamicClasses(prev => Array.from(new Set([...prev, newClassName])));
    }
  };

  // Handle Sign-Out
  const handleLogOut = async () => {
    try {
      localStorage.removeItem('isOfflineMode');
      localStorage.removeItem('userRole');
      localStorage.removeItem('isDemo');
      setIsOfflineMode(false);
      setIsDemo(false);
      setUserRole('admin');
      setUser(null);
      await signOut(auth);
    } catch (err) {
      console.error("Logout failed:", err);
    }
  };

  // Trigger Seeding of Mock Data for instant review
  const handleTriggerSeed = async () => {
    const adminEmail = user?.email || 'demo.bendahara@komite.id';
    const success = await seedDemoData(adminEmail);
    if (success) {
      alert("Database sukses diisi dengan Data Percontohan! (6 Siswa Roster, 3 Acara dan Estimasi RAB, beserta Mutasi Kas).");
    } else {
      alert("Database sudah terisi atau terjadi kendala sinkronisasi.");
    }
  };

  // Dynamic Year-dependent filtered collections
  const filteredStudents = React.useMemo(() => {
    return students.filter(s => (s.academicYear || '2025/2026') === selectedAcademicYear);
  }, [students, selectedAcademicYear]);
  
  const filteredBills = React.useMemo(() => {
    return bills.filter(b => getAcademicYearFromPeriod(b.period) === selectedAcademicYear);
  }, [bills, selectedAcademicYear]);
  
  const filteredTransactions = React.useMemo(() => {
    return transactions.filter(t => {
      const year = t.period ? getAcademicYearFromPeriod(t.period) : getAcademicYearFromDate(t.date);
      return year === selectedAcademicYear;
    });
  }, [transactions, selectedAcademicYear]);

  const filteredEvents = React.useMemo(() => {
    return events.filter(e => getAcademicYearFromDate(e.date) === selectedAcademicYear);
  }, [events, selectedAcademicYear]);

  // Calculate high-level stats for the Dashboard UI
  const systemDashboardStats = React.useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    filteredTransactions.forEach(t => {
      if (t.type === 'income') totalIncome += t.amount;
      else totalExpense += t.amount;
    });

    const netCash = totalIncome - totalExpense;

    const totalStudentsRegistered = filteredStudents.length;
    const totalPendingBillsCount = filteredBills.filter(b => b.status !== 'paid').length;
    const unpaidSum = filteredBills.filter(b => b.status !== 'paid').reduce((acc, b) => acc + (b.amountRequired - b.amountPaid), 0);

    return {
      totalIncome,
      totalExpense,
      netCash,
      totalStudentsRegistered,
      totalPendingBillsCount,
      unpaidSum
    };
  }, [filteredTransactions, filteredStudents, filteredBills]);

  // Format logged-in user label
  const getUserLabel = () => {
    if (userRole === 'operator') {
      return "Operator Komite Sekolah";
    }
    if (isDemo || !user?.email) {
      return "Bendahara Komite (Demo)";
    }
    return user.email;
  };

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col font-sans text-slate-950 antialiased">
      
      {/* 1. AUTHENTICATION PROTECTION PORTAL */}
      <AnimatePresence mode="wait">
        {authLoading ? (
          <motion.div 
            key="auth-loading"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-white z-50 flex flex-col items-center justify-center p-6 text-center"
          >
            <div className="animate-spin h-8 w-8 text-indigo-600 border-4 border-indigo-100 border-t-indigo-600 rounded-full mb-3" />
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Memulai Keuangan Komite...</span>
          </motion.div>
        ) : !user ? (
          <motion.div 
            key="auth-gate"
            initial={{ opacity: 0, y: 15 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="min-h-screen flex items-center justify-center p-4 bg-slate-50 overflow-hidden relative"
          >
            <div className="bg-white rounded-2xl p-8 max-w-md w-full border border-slate-200 shadow-sm space-y-7 relative z-10 text-center">
              
              {/* Branding Header Area */}
              <div className="space-y-3 flex flex-col items-center">
                <div className="h-14 w-14 bg-indigo-50 text-indigo-600 rounded-2xl flex items-center justify-center">
                  <Landmark className="h-7 w-7" />
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Keuangan Komite</h1>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Sekolah Mandiri Indonesia</p>
                </div>
                <p className="text-sm text-slate-500 leading-relaxed">
                  Platform pembukuan iuran siswa, transparansi cash flow, pengelolaan budgeting rancangan anggaran kegiatan (RAB) serta pengingat otomatis bagi wali murid.
                </p>
              </div>

              {/* Secure Login Triggers */}
              <div className="space-y-3">
                <button
                  id="btn-login-google"
                  onClick={handleGoogleLogin}
                  className="w-full bg-white hover:bg-slate-50 text-slate-800 border border-slate-200 font-bold text-sm py-3 px-4 rounded-xl transition-all shadow-xs flex items-center justify-center gap-3 cursor-pointer"
                >
                  <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24">
                    <path fill="#ea4335" d="M12.24 10.285V14.4h6.887c-.648 2.41-2.519 4.114-5.136 4.114-3.41 0-6.19-2.78-6.19-6.19s2.78-6.19 6.19-6.19c1.7 0 3.25.69 4.39 1.8l3.14-3.14C19.125 2.14 15.89 1 12.24 1 6.04 1 12.24 6.04 12.24 12.24S6.04 23.48 12.24 23.48c6.04 0 11.24-4.88 11.24-11.24 0-.69-.07-1.37-.2-1.95H12.24z"/>
                  </svg>
                  Masuk via Akun Google
                </button>

                <div className="relative flex py-1 items-center">
                  <div className="flex-grow border-t border-slate-200"></div>
                  <span className="flex-shrink mx-4 text-slate-400 text-[9px] font-bold uppercase tracking-widest">Bypass Sandbox</span>
                  <div className="flex-grow border-t border-slate-200"></div>
                </div>

                <button
                  id="btn-login-demo"
                  onClick={handleDemoLogin}
                  className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-sm py-3 px-4 rounded-xl transition-all shadow-xs flex items-center justify-center gap-2 cursor-pointer"
                >
                  <UserCheck className="h-4 w-4" />
                  Masuk Cepat (Bendahara / Admin)
                </button>

                <div className="relative flex py-1 items-center">
                  <div className="flex-grow border-t border-slate-200"></div>
                  <span className="flex-shrink mx-4 text-slate-400 text-[9px] font-bold uppercase tracking-widest">Akses Operator Khusus</span>
                  <div className="flex-grow border-t border-slate-200"></div>
                </div>

                <form
                  onSubmit={(e) => { e.preventDefault(); handleOperatorLogin(); }}
                  className="bg-slate-50 border border-slate-200 rounded-2xl p-4.5 text-left space-y-3.5"
                >
                  <div className="text-[10px] font-bold text-slate-500 uppercase tracking-widest text-center">Login Sesi Operator</div>
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Username Khusus *</label>
                    <input
                      type="text"
                      id="operator-user"
                      placeholder="Username (e.g., komite-op)"
                      value={operatorUser}
                      onChange={(e) => setOperatorUser(e.target.value)}
                      className="w-full bg-white border border-slate-200 focus:border-indigo-500 rounded-lg px-3 py-2 text-xs outline-none transition-all font-medium"
                      required
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-wider">Kata Sandi Rahasia *</label>
                    <input
                      type="password"
                      id="operator-pass"
                      placeholder="••••••••"
                      value={operatorPass}
                      onChange={(e) => setOperatorPass(e.target.value)}
                      className="w-full bg-white border border-slate-200 focus:border-indigo-500 rounded-lg px-3 py-2 text-xs outline-none transition-all"
                      required
                    />
                  </div>
                  <button
                    type="submit"
                    id="btn-login-operator"
                    className="w-full bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2 px-3 rounded-lg transition-all cursor-pointer text-center block"
                  >
                    Masuk Sebagai Operator
                  </button>
                </form>
              </div>

              {/* Informative Security Badge */}
              <div className="bg-slate-50 p-4 rounded-xl flex items-start gap-3 border border-slate-200/60 text-left">
                <ShieldCheck className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
                <div className="space-y-0.5">
                  <span className="text-xs font-bold text-slate-900 block">Sistem Terkoneksi Aman</span>
                  <span className="text-[11px] text-slate-505 block leading-relaxed">
                    Setiap penulisan log diverifikasi oleh aturan otorisasi Access Control Firestore (ABAC).
                  </span>
                </div>
              </div>

            </div>

            {/* Subtle background glow */}
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[450px] h-[450px] bg-indigo-500/5 rounded-full blur-3xl -z-0"></div>
          </motion.div>
        ) : (
          
          /* 2. CORE WORKSPACE APPLICATION */
          <div key="core-app" className="flex-1 flex flex-col">
            
            {/* STICKY WORKSPACE HEADER */}
            <header className="bg-white border-b border-slate-200 text-slate-900 z-30 no-print">
              <div className="max-w-7xl mx-auto px-4 lg:px-6 h-16 flex items-center justify-between">
                
                {/* Branding */}
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 bg-indigo-600 rounded-xl flex items-center justify-center text-white font-bold">
                    <Landmark className="h-5 w-5" />
                  </div>
                  <div>
                    <h1 className="text-sm font-bold tracking-tight text-slate-900 flex items-center gap-1.5">
                      Keuangan Komite
                      <span className="text-[9px] bg-emerald-50 text-emerald-700 border border-emerald-200 px-2 py-0.5 rounded-full font-bold uppercase tracking-wider flex items-center gap-1">
                        <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
                        NeonDb PostgreSQL
                      </span>
                    </h1>
                    <p className="text-[9px] text-slate-400 font-bold uppercase tracking-widest">Sekolah Mandiri Indonesia</p>
                  </div>
                </div>

                {/* Academic Year Switcher Dropdown */}
                <div className="flex items-center gap-1.5 bg-slate-100/90 border border-slate-200 px-2.5 py-1.5 rounded-xl text-[10px] font-bold text-slate-500 uppercase tracking-wider shrink-0 shadow-2xs">
                  <GraduationCap className="h-4 w-4 text-indigo-600 shrink-0" />
                  <span className="hidden md:inline text-slate-500">Tahun Ajaran</span>
                  <select
                    id="select-academic-year"
                    value={selectedAcademicYear}
                    onChange={(e) => setSelectedAcademicYear(e.target.value)}
                    className="bg-transparent text-slate-900 border-none outline-none font-extrabold text-xs cursor-pointer focus:ring-0 uppercase py-0 pl-1 py-0.5"
                  >
                    {availableAcademicYears.map(yr => (
                      <option key={yr} value={yr}>TA {yr}</option>
                    ))}
                  </select>
                  {userRole === 'admin' && (
                    <button
                      id="btn-add-academic-year"
                      onClick={handleAddAcademicYear}
                      title="Tambah Tahun Ajaran Baru"
                      className="ml-1 text-slate-400 hover:text-indigo-600 font-bold transition-colors cursor-pointer"
                    >
                      <Plus className="h-4 w-4 bg-white hover:bg-indigo-50 hover:text-indigo-600 border border-slate-200 hover:border-indigo-200 p-0.5 rounded-md transition-all shrink-0" />
                    </button>
                  )}
                </div>

                {/* User Info & log out */}
                <div className="flex items-center gap-4 text-xs font-semibold">
                  <span className="text-slate-500 hidden sm:inline flex items-center gap-1.5">
                    <span className="h-2 w-2 bg-emerald-500 rounded-full inline-block animate-pulse"></span>
                    Bendahara: <strong className="text-slate-900 font-bold">{getUserLabel()}</strong>
                  </span>
                  
                  <button
                    id="btn-logout"
                    onClick={handleLogOut}
                    className="flex items-center gap-1.5 border border-slate-200 hover:bg-slate-50 text-slate-600 hover:text-slate-900 px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Keluar Sesi
                  </button>
                </div>

              </div>
            </header>

            {/* MAIN APP CONTAINER */}
            <main className="flex-1 max-w-7xl w-full mx-auto px-4 lg:px-6 py-6 flex flex-col lg:flex-row gap-6">
              
              {/* PRIMARY NAVIGATION PANELS (LEFT) */}
              <aside className="lg:w-64 shrink-0 flex flex-col gap-2 no-print">
                <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest pl-3 pb-1 block">Menu Navigasi</span>
                
                <nav className="space-y-1">
                  {/* Tab Dashboard */}
                  <button
                    id="nav-dashboard"
                    onClick={() => setActiveTab('dashboard')}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'dashboard' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/50'}`}
                  >
                    <LayoutDashboard className="h-4 w-4" />
                    Ringkasan Beranda
                  </button>

                  {/* Tab Student Manager */}
                  <button
                    id="nav-students"
                    onClick={() => setActiveTab('students')}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'students' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/50'}`}
                  >
                    <GraduationCap className="h-4 w-4" />
                    Master Data Siswa
                  </button>

                  {/* Tab Student Bills Manager */}
                  <button
                    id="nav-iuran"
                    onClick={() => setActiveTab('iuran')}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'iuran' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/50'}`}
                  >
                    <ClipboardList className="h-4 w-4" />
                    Kelola Iuran & SPP Siswa
                  </button>

                  {/* Tab Cashflow Ledger */}
                  <button
                    id="nav-cashflow"
                    onClick={() => setActiveTab('cashflow')}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'cashflow' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/50'}`}
                  >
                    <Coins className="h-4 w-4" />
                    Buku Kas (Arus Kas)
                  </button>

                  {/* Tab Events planner */}
                  <button
                    id="nav-events"
                    onClick={() => setActiveTab('events')}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'events' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/50'}`}
                  >
                    <Target className="h-4 w-4" />
                    Program & RAB Acara
                  </button>

                  {/* Tab Notifications */}
                  <button
                    id="nav-notifications"
                    onClick={() => setActiveTab('notifications')}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'notifications' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/50'}`}
                  >
                    <Bell className="h-4 w-4" />
                    Layanan Notifikasi Wali
                  </button>

                  {/* Tab Reports */}
                  <button
                    id="nav-reports"
                    onClick={() => setActiveTab('reports')}
                    className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${activeTab === 'reports' ? 'bg-indigo-600 text-white shadow-xs' : 'text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/50'}`}
                  >
                    <FileSpreadsheet className="h-4 w-4" />
                    Laporan Cetak (PDF)
                  </button>
                </nav>

                {/* DB seeder module panel */}
                <div className="mt-8 border border-slate-200 bg-white rounded-2xl p-4.5 space-y-3 shadow-xs">
                  <div className="flex items-start gap-2.5">
                    <Sparkles className="h-5 w-5 text-indigo-600 shrink-0 mt-0.5" />
                    <div className="space-y-0.5">
                      <span className="text-xs font-bold text-slate-950 block">Isi Database Mandiri</span>
                      <span className="text-[10px] text-slate-500 block leading-relaxed">
                        Jika database Anda masih baru dan kosong, silakan memicu data percontohan siap saji.
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={handleTriggerSeed}
                    className="w-full bg-indigo-50 hover:bg-indigo-100 text-indigo-700 font-bold text-[10px] py-2 px-3 rounded-lg border border-indigo-100 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
                  >
                    Isi Data Percontohan
                  </button>
                </div>
              </aside>

              {/* DYNAMIC COMPONENT PANEL CANVAS (RIGHT) */}
              <section className="flex-1 min-w-0">
                {collectionsLoading ? (
                  <div className="bg-white border border-gray-100 p-16 rounded-3xl text-center space-y-4">
                    <div className="animate-spin h-7 w-7 text-emerald-600 border-4 border-emerald-100 border-t-emerald-600 rounded-full mx-auto" />
                    <span className="text-xs font-bold text-gray-400 uppercase tracking-wider block">Menyinkronkan Data Real-time Dari Firestore...</span>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Panel Switching Conditions */}

                    {/* DASHBOARD RINGKASAN */}
                    {activeTab === 'dashboard' && (
                      <div className="space-y-6">
                        
                        {/* Welcome Bento Card */}
                        <div className="bg-white border border-slate-100 text-slate-900 p-6 rounded-2xl relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-2xs">
                          <div className="space-y-1 z-10 max-w-xl text-left">
                            <span className="text-[10px] font-bold text-indigo-600 uppercase tracking-wider block">Dashboard Bendahara</span>
                            <h2 className="text-xl font-bold tracking-tight text-slate-900 block">Selamat Datang di Portal Keuangan Komite!</h2>
                            <p className="text-xs text-slate-500 leading-relaxed">
                              Pantau mutasi pemasukan iuran siswa jajaran Kelas 7, 8, & 9 serta pengeluaran operasional sekolah. Sinkronisasi multi-admin real-time aktif.
                            </p>
                          </div>
                          
                          <div className="shrink-0 flex gap-2 z-10">
                            {students.length === 0 && (
                              <button
                                onClick={handleTriggerSeed}
                                className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs px-4 py-2.5 rounded-xl transition-all shadow-xs cursor-pointer"
                              >
                                Muat Contoh Data Awal
                              </button>
                            )}
                          </div>
                          {/* ambient background blur */}
                          <div className="absolute right-0 bottom-0 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl"></div>
                        </div>

                        {/* Top stat indicator bars */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
                          {/* Saldo Kas */}
                          <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-2xs flex items-center justify-between">
                            <div className="space-y-0.5 text-left">
                              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest block">Sisa Saldo Kas</span>
                              <span className="text-lg font-bold text-slate-900 block">{formatIDR(systemDashboardStats.netCash)}</span>
                            </div>
                            <div className="h-10 w-10 bg-indigo-50 rounded-lg flex items-center justify-center text-indigo-600">
                              <Coins className="h-5 w-5" />
                            </div>
                          </div>

                          {/* Pemasukan */}
                          <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-2xs flex items-center justify-between">
                            <div className="space-y-0.5 text-left">
                              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest block">Total Penerimaan</span>
                              <span className="text-lg font-bold text-emerald-600 block">+{formatIDR(systemDashboardStats.totalIncome)}</span>
                            </div>
                            <div className="h-10 w-10 bg-emerald-50 rounded-lg flex items-center justify-center text-emerald-600">
                              <ArrowDownLeft className="h-5 w-5" />
                            </div>
                          </div>

                          {/* Pengeluaran */}
                          <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-2xs flex items-center justify-between">
                            <div className="space-y-0.5 text-left">
                              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest block">Total Pengeluaran</span>
                              <span className="text-lg font-bold text-rose-600 block">-{formatIDR(systemDashboardStats.totalExpense)}</span>
                            </div>
                            <div className="h-10 w-10 bg-rose-50 rounded-lg flex items-center justify-center text-rose-600">
                              <ArrowUpRight className="h-5 w-5" />
                            </div>
                          </div>

                          {/* Piutang Outstanding */}
                          <div className="bg-white border border-slate-200 p-5 rounded-2xl shadow-2xs flex items-center justify-between">
                            <div className="space-y-0.5 text-left">
                              <span className="text-[9px] text-slate-400 font-bold uppercase tracking-widest block">Piutang Outstanding</span>
                              <span className="text-lg font-bold text-amber-700 block">{formatIDR(systemDashboardStats.unpaidSum)}</span>
                            </div>
                            <div className="h-10 w-10 bg-amber-50 rounded-lg flex items-center justify-center text-amber-600">
                              <Bell className="h-5 w-5 animate-bounce" />
                            </div>
                          </div>
                        </div>

                        {/* Bento visual lists & analytics links */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                          {/* Active events panel queue */}
                          <div className="lg:col-span-7 bg-white p-6 border border-slate-200 rounded-2xl space-y-4 shadow-2xs text-left">
                            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">Status 3 Anggaran Kegiatan Komite</h3>
                              <button onClick={() => setActiveTab('events')} className="text-xs text-indigo-600 font-bold hover:text-indigo-700">Semua Event</button>
                            </div>

                            <div className="space-y-3">
                              {filteredEvents.slice(0, 3).map(evt => {
                                const spendRate = evt.budgetTarget > 0 
                                  ? Math.min(100, Math.round((evt.actualExpense / evt.budgetTarget) * 100))
                                  : 0;

                                return (
                                  <div key={evt.id} className="bg-slate-50/50 hover:bg-slate-50 p-3.5 border border-slate-200/60 rounded-xl transition-all space-y-2">
                                    <div className="flex justify-between items-center">
                                      <span className="text-xs font-bold text-slate-800">{evt.title}</span>
                                      <span className="text-[10px] bg-slate-100 border border-slate-200 font-bold px-1.5 py-0.5 rounded uppercase text-slate-600">{evt.status}</span>
                                    </div>
                                    <div className="space-y-1">
                                      <div className="w-full bg-slate-200/60 h-1.5 rounded-full overflow-hidden">
                                        <div className="bg-indigo-600 h-full rounded-full animate-pulse" style={{ width: `${spendRate}%` }}></div>
                                      </div>
                                      <div className="flex justify-between text-[9px] text-slate-400 font-bold uppercase tracking-wider">
                                        <span>RAB: {formatIDR(evt.budgetTarget)}</span>
                                        <span>{spendRate}% Terpakai</span>
                                      </div>
                                    </div>
                                  </div>
                                );
                              })}
                              {filteredEvents.length === 0 && (
                                <p className="text-xs text-center text-slate-400 py-10 italic">Belum ada data event dicanangkan.</p>
                              )}
                            </div>
                          </div>

                          {/* Dynamic transaction log shortcuts */}
                          <div className="lg:col-span-5 bg-white p-6 border border-slate-200 rounded-2xl space-y-4 shadow-2xs text-left">
                            <div className="flex justify-between items-center pb-2 border-b border-slate-100">
                              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-800">Mutasi Keuangan Terkini</h3>
                              <button onClick={() => setActiveTab('cashflow')} className="text-xs text-indigo-600 font-bold hover:text-indigo-700">Detail Buku Kas</button>
                            </div>

                            <div className="space-y-3 max-h-56 overflow-y-auto">
                              {filteredTransactions.slice(0, 4).map(tx => (
                                <div key={tx.id} className="flex justify-between items-center text-xs">
                                  <div>
                                    <span className="font-bold text-slate-800 block truncate max-w-[150px]">{tx.category}</span>
                                    <span className="text-[10px] text-slate-400">{tx.date} • {tx.paymentMethod}</span>
                                  </div>
                                  <span className={`font-bold ${tx.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    {tx.type === 'income' ? '+' : '-'} {formatIDR(tx.amount)}
                                  </span>
                                </div>
                              ))}
                              {filteredTransactions.length === 0 && (
                                <p className="text-xs text-center text-slate-400 py-10 italic">Belum ada mutasi dicatatkan.</p>
                              )}
                            </div>
                          </div>
                        </div>

                      </div>
                    )}

                    {/* MANAJEMEN SISWA */}
                    {activeTab === 'students' && (
                      <StudentManager 
                        students={filteredStudents} 
                        allStudents={students}
                        bills={filteredBills} 
                        allBills={bills}
                        classes={dynamicClasses} 
                        selectedAcademicYear={selectedAcademicYear}
                        onAddClass={handleAddClass}
                        userRole={userRole}
                      />
                    )}

                    {/* MANAJEMEN IURAN SISWA */}
                    {activeTab === 'iuran' && (
                      <StudentBillsManager 
                        bills={filteredBills} 
                        allBills={bills}
                        students={filteredStudents} 
                        allStudents={students}
                        classes={dynamicClasses} 
                        selectedAcademicYear={selectedAcademicYear}
                        userRole={userRole}
                        userEmail={user?.email || 'demo.bendahara@komite.id'}
                      />
                    )}

                    {/* BUKU KAS (CASH FLOW) */}
                    {activeTab === 'cashflow' && (
                      <CashFlowTracker 
                        transactions={filteredTransactions} 
                        students={filteredStudents} 
                        bills={filteredBills} 
                        events={filteredEvents}
                        adminEmail={user.email || 'Demo Treasurer'}
                        userRole={userRole}
                      />
                    )}

                    {/* MANAJEMEN ANGGARAN EVENT (RAB) */}
                    {activeTab === 'events' && (
                      <EventManager 
                        events={filteredEvents} 
                        userRole={userRole}
                      />
                    )}

                    {/* NOTIFIKASI REMINDER */}
                    {activeTab === 'notifications' && (
                      <NotificationsSim 
                        bills={filteredBills} 
                      />
                    )}

                    {/* PELAPORAN TRANSPARAN */}
                    {activeTab === 'reports' && (
                      <Reports 
                        transactions={filteredTransactions} 
                        students={filteredStudents} 
                        bills={filteredBills} 
                        classes={dynamicClasses}
                      />
                    )}

                  </div>
                )}
              </section>

            </main>

            {/* PLATFORM APP FOOTER */}
            <footer className="bg-white border-t border-slate-200 text-slate-500 py-6 text-center text-xs space-y-1 mt-12 no-print">
              <p className="font-bold">Keuangan Komite © {new Date().getFullYear()} • Sekolah Mandiri Indonesia</p>
              <p className="text-[10px] text-slate-400 font-medium">Transparan - Akuntabel - Sinkron Real-time - PDF-Friendly</p>
            </footer>

          </div>
        )}
      </AnimatePresence>

    </div>
  );
}
