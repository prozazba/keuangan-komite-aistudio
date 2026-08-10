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
import { auth, db, handleFirestoreError, OperationType, collection, onSnapshot, getActiveTenantId, setActiveTenantId } from './firebase';
import { Student, Transaction, Event as SchoolEvent, StudentBill, TenantProfile, TenantUser } from './types';
import { seedDemoData, formatIDR, getAcademicYearFromPeriod, getAcademicYearFromDate } from './utils';
import { motion, AnimatePresence } from 'motion/react';

// Subcomponents
import StudentManager from './components/StudentManager';
import StudentBillsManager from './components/StudentBillsManager';
import CashFlowTracker from './components/CashFlowTracker';
import EventManager from './components/EventManager';
import NotificationsSim from './components/NotificationsSim';
import Reports from './components/Reports';
import ClassManager from './components/ClassManager';

// SaaS Multi-tenant Modals & Public Landing
import { LandingPage } from './components/LandingPage';
import { AuthModal } from './components/AuthModal';
import { TenantSetupModal } from './components/TenantSetupModal';
import { VersionManagerModal } from './components/VersionManagerModal';

// Icons
import { 
  LayoutDashboard, GraduationCap, Coins, Target, Bell, 
  FileSpreadsheet, LogOut, Sparkles, BookOpen, AlertCircle, 
  UserCheck, ShieldCheck, HelpCircle, Building2, CheckCircle2, 
  ArrowDownLeft, ArrowUpRight, TrendingUp, Landmark, Plus, ClipboardList,
  Settings2, History, Globe, LogIn, Smartphone, WifiOff, ChevronDown,
  ChevronLeft, ChevronRight, ChevronUp, PanelLeftClose, PanelLeftOpen,
  Menu, X
} from 'lucide-react';

export default function App() {
  const PWA_SESSION_KEY = 'komiteku_pwa_session_v1';

  // PWA & Network Offline Hooks
  const [deferredInstallPrompt, setDeferredInstallPrompt] = useState<any>(null);
  const [isPWAInstallable, setIsPWAInstallable] = useState(false);
  const [isPWAStandalone, setIsPWAStandalone] = useState<boolean>(() => {
    return window.matchMedia('(display-mode: standalone)').matches || (navigator as any).standalone === true;
  });
  const [isOnline, setIsOnline] = useState<boolean>(navigator.onLine);
  const [offlineNotification, setOfflineNotification] = useState<string>('');

  // Role & Demo States
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState(true);
  const [isDemo, setIsDemo] = useState<boolean>(() => {
    return localStorage.getItem('isDemo') === 'true';
  });
  const [isOfflineMode, setIsOfflineMode] = useState<boolean>(() => {
    return localStorage.getItem('isOfflineMode') === 'true';
  });
  const [userRole, setUserRole] = useState<'admin' | 'operator'>(() => {
    return (localStorage.getItem('userRole') as 'admin' | 'operator') || 'admin';
  });
  const [operatorUser, setOperatorUser] = useState('');
  const [operatorPass, setOperatorPass] = useState('');

  // Main SaaS Views - Restore from PWA session if available
  const [activeView, setActiveView] = useState<'landing' | 'app'>(() => {
    try {
      const saved = localStorage.getItem('komiteku_pwa_session_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.activeView === 'app') return 'app';
      }
    } catch (e) {}
    return 'landing';
  });

  // Tenant & SaaS User State
  const [activeTenant, setActiveTenant] = useState<TenantProfile | null>(() => {
    try {
      const saved = localStorage.getItem('komiteku_pwa_session_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.activeTenant) return parsed.activeTenant;
      }
    } catch (e) {}
    return null;
  });

  const [activeTenantUser, setActiveTenantUser] = useState<TenantUser | null>(() => {
    try {
      const saved = localStorage.getItem('komiteku_pwa_session_v1');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.activeTenantUser) return parsed.activeTenantUser;
      }
    } catch (e) {}
    return null;
  });

  // Modals state
  const [authModalOpen, setAuthModalOpen] = useState(false);
  const [authModalInitialMode, setAuthModalInitialMode] = useState<'login' | 'register'>('login');
  const [tenantSetupOpen, setTenantSetupOpen] = useState(false);
  const [versionModalOpen, setVersionModalOpen] = useState(false);

  // PWA beforeinstallprompt & Online/Offline listeners
  useEffect(() => {
    const handleBeforeInstall = (e: any) => {
      e.preventDefault();
      setDeferredInstallPrompt(e);
      setIsPWAInstallable(true);
    };

    const handleOnline = () => {
      setIsOnline(true);
      setOfflineNotification('Koneksi terhubung kembali. Sinkronisasi data...');
      setTimeout(() => setOfflineNotification(''), 4000);
      refreshTenantProfile();
    };

    const handleOffline = () => {
      setIsOnline(false);
      setOfflineNotification('Anda sedang offline. Mode PWA menggunakan data ter-cache.');
    };

    const handleVisibility = () => {
      if (document.visibilityState === 'visible' && activeTenant?.id) {
        refreshTenantProfile(activeTenant.id);
      }
    };

    window.addEventListener('beforeinstallprompt' as any, handleBeforeInstall);
    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);
    document.addEventListener('visibilitychange', handleVisibility);

    return () => {
      window.removeEventListener('beforeinstallprompt' as any, handleBeforeInstall);
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
      document.removeEventListener('visibilitychange', handleVisibility);
    };
  }, [activeTenant]);

  const handleInstallPWA = async () => {
    if (!deferredInstallPrompt) return;
    deferredInstallPrompt.prompt();
    const { outcome } = await deferredInstallPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsPWAInstallable(false);
      setDeferredInstallPrompt(null);
    }
  };

  // Fetch tenant info on startup or when tenantId changes
  const refreshTenantProfile = async (tId?: string) => {
    const idToUse = tId || getActiveTenantId();
    try {
      const res = await fetch(`/api/tenants/${encodeURIComponent(idToUse)}`);
      if (res.ok) {
        const tData = await res.json();
        setActiveTenant(tData);
      } else {
        // Fallback demo tenant
        setActiveTenant({
          id: 'demo_tenant',
          name: 'Sekolah Mandiri Komite',
          schoolLevel: 'SMP',
          academicYear: '2025/2026',
          committeeChair: 'Dr. H. Muhammad Ramli',
          treasurerName: 'Sri Wahyuli, S.E',
          principalName: 'Drs. Heru Wijayanto, M.Pd',
          address: 'Jl. Pendidikan No. 45, Jakarta',
          monthlyDuesTarget: 150000
        });
      }
    } catch (err) {
      console.warn("Failed fetching tenant profile:", err);
    }
  };

  useEffect(() => {
    refreshTenantProfile();
  }, []);

  // Synchronize PWA Session to localStorage
  useEffect(() => {
    if (activeView === 'app') {
      const sessionObj = {
        activeView: 'app',
        activeTenant,
        activeTenantUser,
        userRole,
        isDemo,
        isOfflineMode,
        timestamp: Date.now()
      };
      localStorage.setItem(PWA_SESSION_KEY, JSON.stringify(sessionObj));
    }
  }, [activeView, activeTenant, activeTenantUser, userRole, isDemo, isOfflineMode]);

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
  const [events, setEvents] = useState<SchoolEvent[]>([]);
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
  const [activeTab, setActiveTab] = useState<'dashboard' | 'classes' | 'students' | 'iuran' | 'cashflow' | 'events' | 'notifications' | 'reports'>('dashboard');
  const [isHeaderMenuOpen, setIsHeaderMenuOpen] = useState(false);
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState<boolean>(() => {
    return localStorage.getItem('isSidebarCollapsed') === 'true';
  });
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState<boolean>(false);

  // Static list of classes fallback
  const classesFallback = ['Kelas 7-A', 'Kelas 7-B', 'Kelas 8-A', 'Kelas 8-B', 'Kelas 9-A', 'Kelas 9-B', 'Kelas 9-C'];
  const [dynamicClasses, setDynamicClasses] = useState<string[]>(() => {
    const saved = localStorage.getItem('dynamicClasses');
    return saved ? JSON.parse(saved) : classesFallback;
  });

  useEffect(() => {
    localStorage.setItem('dynamicClasses', JSON.stringify(dynamicClasses));
  }, [dynamicClasses]);

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
        setDynamicClasses(items);
      }
    }, (err) => {
      console.warn("Classes sync issues:", err);
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
    }
    setDynamicClasses(prev => Array.from(new Set([...prev, newClassName])));
  };

  const handleEditClass = async (oldClassName: string, newClassName: string) => {
    setDynamicClasses(prev => prev.map(c => c === oldClassName ? newClassName : c));
  };

  const handleDeleteClass = async (classNameToDelete: string) => {
    setDynamicClasses(prev => prev.filter(c => c !== classNameToDelete));
  };

  // Handle Sign-Out
  const handleLogOut = async () => {
    try {
      localStorage.removeItem(PWA_SESSION_KEY);
      localStorage.removeItem('isOfflineMode');
      localStorage.removeItem('userRole');
      localStorage.removeItem('isDemo');
      setIsOfflineMode(false);
      setIsDemo(false);
      setUserRole('admin');
      setUser(null);
      setActiveTenant(null);
      setActiveTenantUser(null);
      setActiveView('landing');
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

  // 0. LANDING PAGE VIEW
  if (activeView === 'landing') {
    return (
      <>
        <LandingPage
          onOpenLogin={() => { setAuthModalInitialMode('login'); setAuthModalOpen(true); }}
          onOpenRegister={() => { setAuthModalInitialMode('register'); setAuthModalOpen(true); }}
          onOpenDemo={() => {
            setActiveTenantId('demo_tenant');
            refreshTenantProfile('demo_tenant');
            setActiveView('app');
          }}
          onInstallPWA={handleInstallPWA}
          isPWAInstallable={isPWAInstallable}
          isPWAStandalone={isPWAStandalone}
        />
        <AuthModal
          isOpen={authModalOpen}
          initialMode={authModalInitialMode}
          onClose={() => setAuthModalOpen(false)}
          onSuccess={(uObj, tObj) => {
            setActiveTenant(tObj);
            setActiveTenantUser(uObj);
            setActiveTenantId(tObj.id);
            setActiveView('app');
          }}
        />
        <VersionManagerModal
          isOpen={versionModalOpen}
          onClose={() => setVersionModalOpen(false)}
          onRefreshData={() => refreshTenantProfile()}
        />
      </>
    );
  }

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
                  <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Komite Sekolah</h1>
                  <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-1">Organisasi Independen Pengawasan & Kemitraan Sekolah</p>
                </div>
                <p className="text-sm text-slate-500 leading-relaxed">
                  Platform independen pengawasan kinerja KBM, transparansi iuran gotong royong, pengelolaan program kerja Komite, RAB kegiatan, serta pemenuhan hak-hak siswa.
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
          <div key="core-app" className="flex-1 flex flex-col bg-soft-canvas text-slate-900 min-h-screen">
            
            {/* PWA Network & Offline Sync Banner */}
            {(!isOnline || offlineNotification) && (
              <div className={`px-4 py-1.5 text-xs font-medium text-center flex items-center justify-center gap-2 transition-all z-40 ${!isOnline ? 'bg-amber-600 text-white' : 'bg-emerald-600 text-white'}`}>
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>{offlineNotification || '⚡ Mode Offline PWA: Menampilkan data tersimpan di perangkat.'}</span>
              </div>
            )}

            {/* MAIN APP CONTAINER */}
            <main className="flex-1 max-w-7xl w-full mx-auto p-4 py-4 flex flex-col lg:flex-row gap-4">
              
              {/* MOBILE & TABLET COLLAPSIBLE NAVIGATION BAR (LG:HIDDEN) */}
              <div className="lg:hidden w-full flex flex-col gap-2 no-print">
                <div className="flex items-center justify-between bg-white border border-slate-200/80 rounded-2xl p-2.5 px-3.5 text-slate-900 shadow-2xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <button
                      type="button"
                      onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
                      className="p-1.5 rounded-xl bg-slate-100 text-slate-700 hover:text-slate-900 border border-slate-200 shrink-0 cursor-pointer"
                      title="Buka / Sembunyikan Navigasi Menu"
                    >
                      {isMobileMenuOpen ? <X className="w-4 h-4 text-rose-600" /> : <Menu className="w-4 h-4 text-indigo-600" />}
                    </button>
                    
                    <div className="flex items-center gap-2 min-w-0">
                      <div className="h-8 w-8 bg-indigo-600 rounded-xl flex items-center justify-center text-white shrink-0 shadow-xs">
                        <Landmark className="h-4 w-4" />
                      </div>
                      <div className="flex flex-col min-w-0">
                        <span className="text-xs font-bold text-slate-900 truncate">
                          {activeTenant?.name || 'Komite Sekolah'}
                        </span>
                        <span className="text-[10px] text-slate-500 font-medium truncate">
                          {
                            activeTab === 'dashboard' ? 'Ringkasan Utama' :
                            activeTab === 'classes' ? 'Pemetaan Kelas' :
                            activeTab === 'students' ? 'Database Siswa' :
                            activeTab === 'iuran' ? 'Kelola Iuran' :
                            activeTab === 'cashflow' ? 'Buku Kas Komite' :
                            activeTab === 'events' ? 'RAB & Program' :
                            activeTab === 'notifications' ? 'Advokasi & WA' : 'Laporan LPJ'
                          }
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-1.5 shrink-0">
                    {/* Academic Year Switcher Dropdown */}
                    <div className="flex items-center gap-1 bg-slate-100 px-2 py-1 rounded-xl text-xs font-bold border border-slate-200/80">
                      <GraduationCap className="h-3.5 w-3.5 text-indigo-600 shrink-0" />
                      <select
                        id="select-academic-year-mobile"
                        value={selectedAcademicYear}
                        onChange={(e) => setSelectedAcademicYear(e.target.value)}
                        className="bg-transparent text-slate-800 border-none outline-none font-bold text-xs cursor-pointer focus:ring-0 uppercase py-0"
                      >
                        {availableAcademicYears.map(yr => (
                          <option key={yr} value={yr}>TA {yr}</option>
                        ))}
                      </select>
                    </div>

                    <button
                      type="button"
                      onClick={() => setTenantSetupOpen(true)}
                      className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200 shrink-0 cursor-pointer"
                      title="Pengaturan Komite"
                    >
                      <Settings2 className="w-4 h-4 text-indigo-600" />
                    </button>
                  </div>
                </div>

                {/* Collapsible Mobile Menu Grid */}
                {isMobileMenuOpen && (
                  <nav className="w-full grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-2 bg-white border border-slate-200/80 rounded-2xl shadow-lg text-slate-800 animate-in fade-in zoom-in-95 duration-200">
                    <button
                      onClick={() => { setActiveTab('dashboard'); setIsMobileMenuOpen(false); }}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer min-w-0 ${
                        activeTab === 'dashboard' 
                          ? 'bg-indigo-600 text-white shadow-xs' 
                          : 'text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200/60'
                      }`}
                    >
                      <LayoutDashboard className={`h-4 w-4 shrink-0 ${activeTab === 'dashboard' ? 'text-white' : 'text-indigo-600'}`} />
                      <span className="truncate">Ringkasan</span>
                    </button>

                    <button
                      onClick={() => { setActiveTab('classes'); setIsMobileMenuOpen(false); }}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer min-w-0 ${
                        activeTab === 'classes' 
                          ? 'bg-indigo-600 text-white shadow-xs' 
                          : 'text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200/60'
                      }`}
                    >
                      <Building2 className={`h-4 w-4 shrink-0 ${activeTab === 'classes' ? 'text-white' : 'text-cyan-600'}`} />
                      <span className="truncate">Pemetaan Kelas</span>
                    </button>

                    <button
                      onClick={() => { setActiveTab('students'); setIsMobileMenuOpen(false); }}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer min-w-0 ${
                        activeTab === 'students' 
                          ? 'bg-indigo-600 text-white shadow-xs' 
                          : 'text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200/60'
                      }`}
                    >
                      <GraduationCap className={`h-4 w-4 shrink-0 ${activeTab === 'students' ? 'text-white' : 'text-emerald-600'}`} />
                      <span className="truncate">Database Siswa</span>
                    </button>

                    <button
                      onClick={() => { setActiveTab('iuran'); setIsMobileMenuOpen(false); }}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer min-w-0 ${
                        activeTab === 'iuran' 
                          ? 'bg-indigo-600 text-white shadow-xs' 
                          : 'text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200/60'
                      }`}
                    >
                      <ClipboardList className={`h-4 w-4 shrink-0 ${activeTab === 'iuran' ? 'text-white' : 'text-amber-600'}`} />
                      <span className="truncate">Kelola Iuran</span>
                    </button>

                    <button
                      onClick={() => { setActiveTab('cashflow'); setIsMobileMenuOpen(false); }}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer min-w-0 ${
                        activeTab === 'cashflow' 
                          ? 'bg-indigo-600 text-white shadow-xs' 
                          : 'text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200/60'
                      }`}
                    >
                      <Coins className={`h-4 w-4 shrink-0 ${activeTab === 'cashflow' ? 'text-white' : 'text-emerald-600'}`} />
                      <span className="truncate">Buku Kas</span>
                    </button>

                    <button
                      onClick={() => { setActiveTab('events'); setIsMobileMenuOpen(false); }}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer min-w-0 ${
                        activeTab === 'events' 
                          ? 'bg-indigo-600 text-white shadow-xs' 
                          : 'text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200/60'
                      }`}
                    >
                      <Target className={`h-4 w-4 shrink-0 ${activeTab === 'events' ? 'text-white' : 'text-purple-600'}`} />
                      <span className="truncate">RAB & Program</span>
                    </button>

                    <button
                      onClick={() => { setActiveTab('notifications'); setIsMobileMenuOpen(false); }}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer min-w-0 ${
                        activeTab === 'notifications' 
                          ? 'bg-indigo-600 text-white shadow-xs' 
                          : 'text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200/60'
                      }`}
                    >
                      <Bell className={`h-4 w-4 shrink-0 ${activeTab === 'notifications' ? 'text-white' : 'text-sky-600'}`} />
                      <span className="truncate">Advokasi & WA</span>
                    </button>

                    <button
                      onClick={() => { setActiveTab('reports'); setIsMobileMenuOpen(false); }}
                      className={`flex items-center gap-2 px-3 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer min-w-0 ${
                        activeTab === 'reports' 
                          ? 'bg-indigo-600 text-white shadow-xs' 
                          : 'text-slate-600 hover:text-slate-900 bg-slate-50 hover:bg-slate-100 border border-slate-200/60'
                      }`}
                    >
                      <FileSpreadsheet className={`h-4 w-4 shrink-0 ${activeTab === 'reports' ? 'text-white' : 'text-teal-600'}`} />
                      <span className="truncate">Laporan LPJ</span>
                    </button>
                  </nav>
                )}
              </div>

              {/* PRIMARY NAVIGATION DESKTOP SIDEBAR (DESKTOP ONLY: LG:FLEX) */}
              <aside className={`hidden lg:flex lg:flex-col shrink-0 bg-white border border-slate-200/80 rounded-3xl p-4 shadow-2xs text-slate-800 justify-between gap-4 no-print transition-all duration-300 ${isSidebarCollapsed ? 'lg:w-20' : 'lg:w-64'}`}>
                
                <div className="space-y-4 min-w-0">
                  {/* Brand & Organization Title Block inside Sidebar */}
                  <div className={`flex items-center pb-3 border-b border-slate-100 min-w-0 ${isSidebarCollapsed ? 'justify-center' : 'justify-between'}`}>
                    {!isSidebarCollapsed ? (
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="h-9 w-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white shrink-0 shadow-xs">
                          <Landmark className="h-5 w-5" />
                        </div>
                        <div className="text-left min-w-0 flex-1">
                          <h1 className="text-sm font-bold text-slate-900 tracking-tight truncate max-w-[150px]">
                            {activeTenant?.name || 'Komite Sekolah'}
                          </h1>
                          <div className="flex items-center gap-1.5 mt-0.5 text-[10px] text-slate-500 font-medium">
                            <span className="px-1.5 py-0.2 rounded bg-indigo-50 text-indigo-700 font-bold border border-indigo-100 shrink-0">
                              {activeTenant?.schoolLevel || 'SMP'}
                            </span>
                            <span className="font-mono text-slate-400 truncate">
                              {activeTenant?.id || getActiveTenantId()}
                            </span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      <div className="h-9 w-9 bg-indigo-600 rounded-xl flex items-center justify-center text-white shrink-0 shadow-xs" title={activeTenant?.name || 'Komite Sekolah'}>
                        <Landmark className="h-5 w-5" />
                      </div>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        const next = !isSidebarCollapsed;
                        setIsSidebarCollapsed(next);
                        localStorage.setItem('isSidebarCollapsed', String(next));
                      }}
                      className="p-1.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-600 hover:text-slate-900 border border-slate-200/80 transition-all cursor-pointer shrink-0"
                      title={isSidebarCollapsed ? "Buka / Perluas Menu Sidebar (Expand)" : "Ciutkan Menu Sidebar (Collapse)"}
                    >
                      {isSidebarCollapsed ? <PanelLeftOpen className="w-4 h-4 text-indigo-600" /> : <PanelLeftClose className="w-4 h-4" />}
                    </button>
                  </div>

                  {/* Academic Year Switcher inside Sidebar */}
                  {!isSidebarCollapsed ? (
                    <div className="flex items-center justify-between gap-1.5 bg-slate-50 px-3 py-2 rounded-xl text-xs text-slate-700 font-bold border border-slate-200/80">
                      <div className="flex items-center gap-1.5 min-w-0">
                        <GraduationCap className="h-4 w-4 text-indigo-600 shrink-0" />
                        <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Tahun Ajaran</span>
                      </div>
                      <select
                        id="select-academic-year-sidebar"
                        value={selectedAcademicYear}
                        onChange={(e) => setSelectedAcademicYear(e.target.value)}
                        className="bg-transparent text-slate-900 border-none outline-none font-bold text-xs cursor-pointer focus:ring-0 uppercase py-0"
                      >
                        {availableAcademicYears.map(yr => (
                          <option key={yr} value={yr}>TA {yr}</option>
                        ))}
                      </select>
                    </div>
                  ) : (
                    <div className="flex justify-center" title={`Tahun Ajaran: TA ${selectedAcademicYear}`}>
                      <div className="p-2 rounded-xl bg-slate-50 text-indigo-600 border border-slate-200/80">
                        <GraduationCap className="h-4 w-4" />
                      </div>
                    </div>
                  )}
                  
                  <nav className="flex flex-col gap-1.5">
                    
                    {!isSidebarCollapsed && (
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-2 pt-1">
                        Utama
                      </span>
                    )}

                    {/* Tab Dashboard */}
                    <button
                      id="nav-dashboard"
                      onClick={() => setActiveTab('dashboard')}
                      title="Ringkasan Utama"
                      className={`w-full min-h-[42px] flex items-center transition-all cursor-pointer ${
                        isSidebarCollapsed ? 'justify-center p-2.5 rounded-2xl' : 'justify-between px-3 py-2.5 rounded-2xl text-xs font-bold'
                      } ${
                        activeTab === 'dashboard' 
                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/80 shadow-2xs' 
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent'
                      }`}
                    >
                      <div className={`flex items-center gap-2.5 min-w-0 ${isSidebarCollapsed ? 'justify-center' : ''}`}>
                        <LayoutDashboard className={`h-4 w-4 shrink-0 ${activeTab === 'dashboard' ? 'text-indigo-600' : 'text-slate-400'}`} />
                        {!isSidebarCollapsed && <span className="truncate">Ringkasan Utama</span>}
                      </div>
                      {!isSidebarCollapsed && activeTab === 'dashboard' && <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0" />}
                    </button>

                    {/* Tab Class Manager */}
                    <button
                      id="nav-classes"
                      onClick={() => setActiveTab('classes')}
                      title="Pemetaan Kelas"
                      className={`w-full min-h-[42px] flex items-center transition-all cursor-pointer ${
                        isSidebarCollapsed ? 'justify-center p-2.5 rounded-2xl' : 'justify-between px-3 py-2.5 rounded-2xl text-xs font-bold'
                      } ${
                        activeTab === 'classes' 
                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/80 shadow-2xs' 
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent'
                      }`}
                    >
                      <div className={`flex items-center gap-2.5 min-w-0 ${isSidebarCollapsed ? 'justify-center' : ''}`}>
                        <Building2 className={`h-4 w-4 shrink-0 ${activeTab === 'classes' ? 'text-indigo-600' : 'text-slate-400'}`} />
                        {!isSidebarCollapsed && <span className="truncate">Pemetaan Kelas</span>}
                      </div>
                      {!isSidebarCollapsed && activeTab === 'classes' && <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0" />}
                    </button>

                    {/* Tab Student Manager */}
                    <button
                      id="nav-students"
                      onClick={() => setActiveTab('students')}
                      title="Database Siswa"
                      className={`w-full min-h-[42px] flex items-center transition-all cursor-pointer ${
                        isSidebarCollapsed ? 'justify-center p-2.5 rounded-2xl' : 'justify-between px-3 py-2.5 rounded-2xl text-xs font-bold'
                      } ${
                        activeTab === 'students' 
                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/80 shadow-2xs' 
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent'
                      }`}
                    >
                      <div className={`flex items-center gap-2.5 min-w-0 ${isSidebarCollapsed ? 'justify-center' : ''}`}>
                        <GraduationCap className={`h-4 w-4 shrink-0 ${activeTab === 'students' ? 'text-indigo-600' : 'text-slate-400'}`} />
                        {!isSidebarCollapsed && <span className="truncate">Database Siswa</span>}
                      </div>
                      {!isSidebarCollapsed && activeTab === 'students' && <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0" />}
                    </button>

                    {!isSidebarCollapsed && (
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-2 pt-2">
                        Keuangan
                      </span>
                    )}

                    {/* Tab Student Bills Manager */}
                    <button
                      id="nav-iuran"
                      onClick={() => setActiveTab('iuran')}
                      title="Kelola Iuran"
                      className={`w-full min-h-[42px] flex items-center transition-all cursor-pointer ${
                        isSidebarCollapsed ? 'justify-center p-2.5 rounded-2xl' : 'justify-between px-3 py-2.5 rounded-2xl text-xs font-bold'
                      } ${
                        activeTab === 'iuran' 
                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/80 shadow-2xs' 
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent'
                      }`}
                    >
                      <div className={`flex items-center gap-2.5 min-w-0 ${isSidebarCollapsed ? 'justify-center' : ''}`}>
                        <ClipboardList className={`h-4 w-4 shrink-0 ${activeTab === 'iuran' ? 'text-indigo-600' : 'text-slate-400'}`} />
                        {!isSidebarCollapsed && <span className="truncate">Kelola Iuran Siswa</span>}
                      </div>
                      {!isSidebarCollapsed && activeTab === 'iuran' && <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0" />}
                    </button>

                    {/* Tab Cashflow */}
                    <button
                      id="nav-cashflow"
                      onClick={() => setActiveTab('cashflow')}
                      title="Buku Kas Komite"
                      className={`w-full min-h-[42px] flex items-center transition-all cursor-pointer ${
                        isSidebarCollapsed ? 'justify-center p-2.5 rounded-2xl' : 'justify-between px-3 py-2.5 rounded-2xl text-xs font-bold'
                      } ${
                        activeTab === 'cashflow' 
                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/80 shadow-2xs' 
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent'
                      }`}
                    >
                      <div className={`flex items-center gap-2.5 min-w-0 ${isSidebarCollapsed ? 'justify-center' : ''}`}>
                        <Coins className={`h-4 w-4 shrink-0 ${activeTab === 'cashflow' ? 'text-indigo-600' : 'text-slate-400'}`} />
                        {!isSidebarCollapsed && <span className="truncate">Buku Kas Komite</span>}
                      </div>
                      {!isSidebarCollapsed && activeTab === 'cashflow' && <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0" />}
                    </button>

                    {!isSidebarCollapsed && (
                      <span className="text-[9px] font-bold text-slate-400 uppercase tracking-widest px-2 pt-2">
                        Program & Advokasi
                      </span>
                    )}

                    {/* Tab Events planner */}
                    <button
                      id="nav-events"
                      onClick={() => setActiveTab('events')}
                      title="RAB & Program"
                      className={`w-full min-h-[42px] flex items-center transition-all cursor-pointer ${
                        isSidebarCollapsed ? 'justify-center p-2.5 rounded-2xl' : 'justify-between px-3 py-2.5 rounded-2xl text-xs font-bold'
                      } ${
                        activeTab === 'events' 
                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/80 shadow-2xs' 
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent'
                      }`}
                    >
                      <div className={`flex items-center gap-2.5 min-w-0 ${isSidebarCollapsed ? 'justify-center' : ''}`}>
                        <Target className={`h-4 w-4 shrink-0 ${activeTab === 'events' ? 'text-indigo-600' : 'text-slate-400'}`} />
                        {!isSidebarCollapsed && <span className="truncate">RAB & Program</span>}
                      </div>
                      {!isSidebarCollapsed && activeTab === 'events' && <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0" />}
                    </button>

                    {/* Tab Notifications */}
                    <button
                      id="nav-notifications"
                      onClick={() => setActiveTab('notifications')}
                      title="Advokasi & WA"
                      className={`w-full min-h-[42px] flex items-center transition-all cursor-pointer ${
                        isSidebarCollapsed ? 'justify-center p-2.5 rounded-2xl' : 'justify-between px-3 py-2.5 rounded-2xl text-xs font-bold'
                      } ${
                        activeTab === 'notifications' 
                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/80 shadow-2xs' 
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent'
                      }`}
                    >
                      <div className={`flex items-center gap-2.5 min-w-0 ${isSidebarCollapsed ? 'justify-center' : ''}`}>
                        <Bell className={`h-4 w-4 shrink-0 ${activeTab === 'notifications' ? 'text-indigo-600' : 'text-slate-400'}`} />
                        {!isSidebarCollapsed && <span className="truncate">Advokasi & WA</span>}
                      </div>
                      {!isSidebarCollapsed && activeTab === 'notifications' && <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0" />}
                    </button>

                    {/* Tab Reports */}
                    <button
                      id="nav-reports"
                      onClick={() => setActiveTab('reports')}
                      title="Laporan LPJ"
                      className={`w-full min-h-[42px] flex items-center transition-all cursor-pointer ${
                        isSidebarCollapsed ? 'justify-center p-2.5 rounded-2xl' : 'justify-between px-3 py-2.5 rounded-2xl text-xs font-bold'
                      } ${
                        activeTab === 'reports' 
                          ? 'bg-indigo-50 text-indigo-700 border border-indigo-200/80 shadow-2xs' 
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50 border border-transparent'
                      }`}
                    >
                      <div className={`flex items-center gap-2.5 min-w-0 ${isSidebarCollapsed ? 'justify-center' : ''}`}>
                        <FileSpreadsheet className={`h-4 w-4 shrink-0 ${activeTab === 'reports' ? 'text-indigo-600' : 'text-slate-400'}`} />
                        {!isSidebarCollapsed && <span className="truncate">Laporan LPJ</span>}
                      </div>
                      {!isSidebarCollapsed && activeTab === 'reports' && <div className="w-1.5 h-1.5 rounded-full bg-indigo-600 shrink-0" />}
                    </button>
                  </nav>
                </div>

                {/* DB seeder module panel */}
                <div className={`bg-slate-50 border border-slate-200/80 rounded-2xl space-y-3 text-left mt-2 ${isSidebarCollapsed ? 'p-2 flex flex-col items-center justify-center' : 'p-3.5'}`}>
                  {!isSidebarCollapsed ? (
                    <>
                      <div className="flex items-start gap-2.5">
                        <Sparkles className="h-4 w-4 text-amber-500 shrink-0 mt-0.5" />
                        <div className="space-y-0.5 min-w-0">
                          <span className="text-xs font-bold text-slate-800 block">Database Mandiri</span>
                          <span className="text-[10.5px] text-slate-500 block leading-snug font-medium">
                            Isi data percontohan jika database kosong.
                          </span>
                        </div>
                      </div>
                      <button
                        onClick={handleTriggerSeed}
                        className="w-full bg-white hover:bg-slate-100 text-slate-700 font-bold text-[11px] py-1.5 px-3 rounded-xl transition-all flex items-center justify-center gap-1.5 border border-slate-200 cursor-pointer shadow-2xs active:scale-[0.99]"
                      >
                        Isi Data Percontohan
                      </button>
                    </>
                  ) : (
                    <button
                      onClick={handleTriggerSeed}
                      title="Isi Data Percontohan Demo"
                      className="p-2 rounded-xl bg-white hover:bg-slate-100 text-amber-500 border border-slate-200 transition-all cursor-pointer"
                    >
                      <Sparkles className="h-4 w-4" />
                    </button>
                  )}
                </div>
              </aside>

              {/* DYNAMIC COMPONENT PANEL CANVAS (RIGHT) */}
              <section className="flex-1 min-w-0">
                {collectionsLoading ? (
                  <div className="bg-white border border-slate-200/80 p-16 rounded-3xl text-center space-y-4 shadow-2xs">
                    <div className="animate-spin h-7 w-7 text-indigo-600 border-4 border-indigo-100 border-t-indigo-600 rounded-full mx-auto" />
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-wider block">Menyinkronkan Data Real-time Dari Firestore...</span>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {/* Panel Switching Conditions */}

                    {/* DASHBOARD RINGKASAN */}
                    {activeTab === 'dashboard' && (
                      <div className="space-y-6">
                        
                        {/* Welcome Bento Card */}
                        <div className="bg-white border border-slate-200/80 text-slate-900 p-6 sm:p-7 rounded-3xl relative overflow-hidden flex flex-col md:flex-row justify-between items-start md:items-center gap-4 shadow-2xs text-left">
                          <div className="space-y-1 z-10 max-w-xl">
                            <span className="text-[10px] font-bold text-indigo-700 uppercase tracking-wider block bg-indigo-50 border border-indigo-100 px-2.5 py-0.5 rounded-full w-max">
                              Dashboard Pengawasan Komite
                            </span>
                            <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-slate-900 block pt-1">
                              Portal Organisasi Komite Sekolah
                            </h2>
                            <p className="text-xs text-slate-500 leading-relaxed font-medium">
                              Mitra independen sekolah: transparansi, akuntabilitas, dan advokasi siswa.
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
                          <div className="absolute -right-10 -bottom-10 w-64 h-64 bg-indigo-500/5 rounded-full blur-3xl pointer-events-none"></div>
                        </div>

                        {/* Top stat indicator bars */}
                        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
                          {/* Saldo Kas */}
                          <div className="bg-white border border-slate-200/80 p-4 sm:p-5 rounded-2xl shadow-2xs flex items-center justify-between transition-all hover:border-slate-300">
                            <div className="space-y-0.5 text-left flex-1 min-w-0 pr-2">
                              <span className="text-xs font-semibold text-slate-500 tracking-wide block truncate">Sisa Saldo Kas</span>
                              <span className="text-lg sm:text-xl font-bold text-slate-900 block font-mono truncate" title={formatIDR(systemDashboardStats.netCash)}>{formatIDR(systemDashboardStats.netCash)}</span>
                            </div>
                            <div className="h-10 w-10 sm:h-11 sm:w-11 bg-indigo-50 rounded-2xl flex items-center justify-center text-indigo-600 shrink-0 border border-indigo-100">
                              <Coins className="h-5 w-5" />
                            </div>
                          </div>

                          {/* Pemasukan */}
                          <div className="bg-white border border-slate-200/80 p-4 sm:p-5 rounded-2xl shadow-2xs flex items-center justify-between transition-all hover:border-slate-300">
                            <div className="space-y-0.5 text-left flex-1 min-w-0 pr-2">
                              <span className="text-xs font-semibold text-slate-500 tracking-wide block truncate">Total Penerimaan</span>
                              <span className="text-lg sm:text-xl font-bold text-emerald-600 block font-mono truncate" title={`+${formatIDR(systemDashboardStats.totalIncome)}`}>+{formatIDR(systemDashboardStats.totalIncome)}</span>
                            </div>
                            <div className="h-10 w-10 sm:h-11 sm:w-11 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 shrink-0 border border-emerald-100">
                              <ArrowDownLeft className="h-5 w-5" />
                            </div>
                          </div>

                          {/* Pengeluaran */}
                          <div className="bg-white border border-slate-200/80 p-4 sm:p-5 rounded-2xl shadow-2xs flex items-center justify-between transition-all hover:border-slate-300">
                            <div className="space-y-0.5 text-left flex-1 min-w-0 pr-2">
                              <span className="text-xs font-semibold text-slate-500 tracking-wide block truncate">Total Pengeluaran</span>
                              <span className="text-lg sm:text-xl font-bold text-rose-600 block font-mono truncate" title={`-${formatIDR(systemDashboardStats.totalExpense)}`}>-{formatIDR(systemDashboardStats.totalExpense)}</span>
                            </div>
                            <div className="h-10 w-10 sm:h-11 sm:w-11 bg-rose-50 rounded-2xl flex items-center justify-center text-rose-600 shrink-0 border border-rose-100">
                              <ArrowUpRight className="h-5 w-5" />
                            </div>
                          </div>

                          {/* Piutang Outstanding */}
                          <div className="bg-white border border-slate-200/80 p-4 sm:p-5 rounded-2xl shadow-2xs flex items-center justify-between transition-all hover:border-slate-300">
                            <div className="space-y-0.5 text-left flex-1 min-w-0 pr-2">
                              <span className="text-xs font-semibold text-slate-500 tracking-wide block truncate">Piutang Outstanding</span>
                              <span className="text-lg sm:text-xl font-bold text-amber-600 block font-mono truncate" title={formatIDR(systemDashboardStats.unpaidSum)}>{formatIDR(systemDashboardStats.unpaidSum)}</span>
                            </div>
                            <div className="h-10 w-10 sm:h-11 sm:w-11 bg-amber-50 rounded-2xl flex items-center justify-center text-amber-600 shrink-0 border border-amber-100">
                              <Bell className="h-5 w-5" />
                            </div>
                          </div>
                        </div>

                        {/* Bento visual lists & analytics links */}
                        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                          {/* Active events panel queue */}
                          <div className="lg:col-span-7 bg-white p-6 rounded-3xl border border-slate-200/80 space-y-4 shadow-2xs text-left">
                            <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
                              <h3 className="text-sm font-bold text-slate-900 tracking-tight">Anggaran Kegiatan Komite</h3>
                              <button onClick={() => setActiveTab('events')} className="text-xs text-indigo-600 font-bold hover:text-indigo-800 transition-colors cursor-pointer shrink-0 whitespace-nowrap">Semua Event →</button>
                            </div>

                            <div className="space-y-3">
                              {filteredEvents.slice(0, 3).map(evt => {
                                const spendRate = evt.budgetTarget > 0 
                                  ? Math.min(100, Math.round((evt.actualExpense / evt.budgetTarget) * 100))
                                  : 0;

                                return (
                                  <div key={evt.id} className="bg-slate-50 hover:bg-slate-100/80 p-4 rounded-2xl border border-slate-100 transition-all space-y-2">
                                    <div className="flex justify-between items-center">
                                      <span className="text-xs font-bold text-slate-800">{evt.title}</span>
                                      <span className="text-[10px] bg-white font-bold px-2 py-0.5 rounded-md uppercase text-indigo-700 border border-slate-200">{evt.status}</span>
                                    </div>
                                    <div className="space-y-1">
                                      <div className="w-full bg-slate-200 h-2 rounded-full overflow-hidden">
                                        <div className="bg-indigo-600 h-full rounded-full" style={{ width: `${spendRate}%` }}></div>
                                      </div>
                                      <div className="flex justify-between text-[9px] text-slate-500 font-bold uppercase tracking-wider">
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
                          <div className="lg:col-span-5 bg-white p-6 rounded-3xl border border-slate-200/80 space-y-4 shadow-2xs text-left">
                            <div className="flex items-center justify-between gap-3 pb-3 border-b border-slate-100">
                              <h3 className="text-sm font-bold text-slate-900 tracking-tight">Mutasi Keuangan Terkini</h3>
                              <button onClick={() => setActiveTab('cashflow')} className="text-xs text-indigo-600 font-bold hover:text-indigo-800 transition-colors cursor-pointer shrink-0 whitespace-nowrap">Detail Buku Kas →</button>
                            </div>

                            <div className="space-y-3 max-h-60 overflow-y-auto pr-1">
                              {filteredTransactions.slice(0, 4).map(tx => (
                                <div key={tx.id} className="flex justify-between items-center text-xs p-3 rounded-xl bg-slate-50 border border-slate-100 hover:bg-slate-100/80 transition-colors">
                                  <div>
                                    <span className="font-bold text-slate-800 block truncate max-w-[150px]">{tx.category}</span>
                                    <span className="text-[10px] text-slate-500 font-mono">{tx.date} • {tx.paymentMethod}</span>
                                  </div>
                                  <span className={`font-bold font-mono ${tx.type === 'income' ? 'text-emerald-600' : 'text-rose-600'}`}>
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

                    {/* MANAJEMEN KELAS */}
                    {activeTab === 'classes' && (
                      <ClassManager 
                        classes={dynamicClasses}
                        students={filteredStudents}
                        bills={filteredBills}
                        selectedAcademicYear={selectedAcademicYear}
                        onAddClass={handleAddClass}
                        onEditClass={handleEditClass}
                        onDeleteClass={handleDeleteClass}
                        userRole={userRole}
                      />
                    )}

                    {/* MANAJEMEN SISWA */}
                    {activeTab === 'students' && (
                      <StudentManager 
                        students={filteredStudents} 
                        allStudents={students}
                        bills={filteredBills} 
                        allBills={bills}
                        transactions={transactions}
                        events={events}
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
                        selectedAcademicYear={selectedAcademicYear}
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
                        selectedAcademicYear={selectedAcademicYear}
                      />
                    )}

                  </div>
                )}
              </section>

            </main>

            {/* PLATFORM APP FOOTER */}
            <footer className="bg-white border-t border-slate-200 text-slate-500 py-6 text-center text-xs space-y-1 mt-12 no-print">
              <p className="font-bold">KomiteKu SaaS © {new Date().getFullYear()} • Sekolah Mandiri Indonesia</p>
              <p className="text-[10px] text-slate-400 font-medium">Mitra independen sekolah: transparansi, akuntabilitas, dan advokasi siswa.</p>
            </footer>

          </div>
        )}
      </AnimatePresence>

      <TenantSetupModal
        isOpen={tenantSetupOpen}
        tenant={activeTenant}
        onClose={() => setTenantSetupOpen(false)}
        onSave={(updatedTenant) => {
          setActiveTenant(updatedTenant);
        }}
      />

      <VersionManagerModal
        isOpen={versionModalOpen}
        onClose={() => setVersionModalOpen(false)}
        onRefreshData={() => refreshTenantProfile()}
      />

    </div>
  );
}
