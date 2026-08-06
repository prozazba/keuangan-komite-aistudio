import React, { useState } from 'react';
import { 
  ShieldCheck, 
  Building2, 
  Users, 
  Receipt, 
  BarChart3, 
  Sparkles, 
  ArrowRight, 
  CheckCircle2, 
  Lock, 
  FileSpreadsheet, 
  Globe, 
  School,
  LogIn,
  UserPlus,
  HelpCircle,
  Mail,
  Phone,
  LayoutDashboard,
  Wallet,
  PieChart,
  Download,
  Smartphone
} from 'lucide-react';

interface LandingPageProps {
  onOpenLogin: () => void;
  onOpenRegister: () => void;
  onOpenDemo: () => void;
  onInstallPWA?: () => void;
  isPWAInstallable?: boolean;
  isPWAStandalone?: boolean;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  onOpenLogin,
  onOpenRegister,
  onOpenDemo,
  onInstallPWA,
  isPWAInstallable = false,
  isPWAStandalone = false
}) => {
  const [activePreviewTab, setActivePreviewTab] = useState<'dashboard' | 'kas' | 'laporan'>('dashboard');

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900 font-sans selection:bg-emerald-600 selection:text-white">
      {/* PUBLIC NAVBAR */}
      <nav className="sticky top-0 z-50 bg-white/95 backdrop-blur-md border-b border-slate-200/80 px-4 sm:px-6 lg:px-8 py-3 shadow-xs">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 shrink-0">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-tr from-emerald-600 via-teal-500 to-cyan-500 p-0.5 flex items-center justify-center shadow-md shadow-emerald-600/20">
              <div className="w-full h-full bg-white rounded-[10px] flex items-center justify-center">
                <School className="w-4 h-4 text-emerald-600" />
              </div>
            </div>
            <div>
              <span className="text-base sm:text-lg font-bold tracking-tight text-slate-900 block leading-tight">
                Komite<span className="text-emerald-600">Ku</span>
              </span>
              <span className="text-[10px] text-slate-500 tracking-wide uppercase font-medium flex items-center gap-1.5">
                Komite Sekolah Mandiri
                {isPWAStandalone && (
                  <span className="px-1.5 py-0.2 rounded bg-emerald-100 text-emerald-800 text-[9px] font-semibold">PWA</span>
                )}
              </span>
            </div>
          </div>

          <div className="hidden lg:flex items-center gap-6 xl:gap-8 text-sm font-medium text-slate-600">
            <a href="#fitur" className="hover:text-emerald-600 transition-colors whitespace-nowrap">Fitur Utama</a>
            <a href="#preview" className="hover:text-emerald-600 transition-colors whitespace-nowrap">Pratinjau</a>
            <a href="#keamanan" className="hover:text-emerald-600 transition-colors whitespace-nowrap">Keamanan Data</a>
            <a href="#faq" className="hover:text-emerald-600 transition-colors whitespace-nowrap">Informasi</a>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {(isPWAInstallable || onInstallPWA) && !isPWAStandalone && (
              <button
                onClick={onInstallPWA}
                className="hidden xl:flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 transition-all cursor-pointer whitespace-nowrap"
                title="Pasang KomiteKu ke Layar Utama"
              >
                <Download className="w-3.5 h-3.5 text-emerald-600" />
                <span>Pasang App</span>
              </button>
            )}
            <button
              onClick={onOpenLogin}
              className="flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium text-slate-700 hover:text-slate-900 hover:bg-slate-100 border border-slate-300 transition-all cursor-pointer whitespace-nowrap"
            >
              <LogIn className="w-3.5 h-3.5 sm:w-4 sm:h-4 text-emerald-600" />
              <span>Masuk</span>
            </button>
            <button
              onClick={onOpenRegister}
              className="flex items-center gap-1.5 px-3.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-xs sm:text-sm font-medium bg-emerald-600 hover:bg-emerald-700 text-white shadow-md shadow-emerald-600/20 transition-all cursor-pointer whitespace-nowrap"
            >
              <UserPlus className="w-3.5 h-3.5 sm:w-4 sm:h-4" />
              <span className="hidden sm:inline">Daftar Unit Komite</span>
              <span className="inline sm:hidden">Daftar</span>
            </button>
          </div>
        </div>
      </nav>

      {/* HERO SECTION */}
      <section className="relative overflow-hidden pt-12 pb-20 md:pt-20 md:pb-28 bg-gradient-to-b from-emerald-50/60 via-slate-50 to-white">
        {/* Soft background accent */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-emerald-200/40 blur-[120px] rounded-full pointer-events-none" />
        
        <div className="max-w-5xl mx-auto px-4 text-center relative z-10">
          <div className="inline-flex items-center gap-2 px-4 py-1.5 rounded-full bg-emerald-100/80 border border-emerald-200 text-emerald-800 text-xs font-semibold mb-6 tracking-wide shadow-xs">
            <Sparkles className="w-3.5 h-3.5 text-emerald-600" />
            <span>Platform Keuangan Komite Sekolah Terintegrasi (Progressive Web App)</span>
          </div>

          <h1 className="text-3xl sm:text-5xl lg:text-6xl font-extrabold text-slate-900 tracking-tight leading-[1.15] mb-6">
            Mitra independen sekolah: <br className="hidden sm:inline" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-600 via-teal-600 to-cyan-600">
              transparansi dan akuntabilitas.
            </span>
          </h1>

          <p className="text-base sm:text-lg text-slate-600 max-w-2xl mx-auto mb-8 font-medium leading-relaxed">
            Kelola iuran, operasional, dan bantuan siswa secara transparan dalam satu sistem terisolasi.
          </p>

          {/* AJAKAN BERGABUNG CTA */}
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3.5 max-w-lg mx-auto">
            <button
              onClick={onOpenRegister}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-7 py-3.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-base shadow-lg shadow-emerald-600/25 transition-all cursor-pointer"
            >
              <span>Gabung & Daftarkan Unit Komite</span>
              <ArrowRight className="w-5 h-5" />
            </button>
            <button
              onClick={onOpenDemo}
              className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-semibold text-base shadow-xs transition-all cursor-pointer"
            >
              <Globe className="w-4 h-4 text-cyan-600" />
              <span>Coba Portal Percontohan</span>
            </button>
            {(isPWAInstallable || onInstallPWA) && !isPWAStandalone && (
              <button
                onClick={onInstallPWA}
                className="w-full sm:w-auto flex items-center justify-center gap-2 px-6 py-3.5 rounded-xl bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-semibold text-base transition-all cursor-pointer"
              >
                <Smartphone className="w-4 h-4 text-emerald-600" />
                <span>Install PWA</span>
              </button>
            )}
          </div>

          <div className="mt-10 flex flex-wrap items-center justify-center gap-6 text-xs text-slate-600 font-semibold">
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Multi-Tenant Terisolasi
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Database Terenkapsulasi
            </span>
            <span className="flex items-center gap-1.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" /> Tanpa Instalasi Software
            </span>
          </div>
        </div>
      </section>

      {/* FITUR UNGGULAN */}
      <section id="fitur" className="py-16 bg-white border-y border-slate-200 relative">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <div className="text-center max-w-2xl mx-auto mb-12">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-3">
              Solusi Digital Khusus Pengurus Komite Sekolah
            </h2>
            <p className="text-slate-600 text-sm sm:text-base">
              Dirancang sesuai regulasi tata kelola partisipasi masyarakat dan akuntabilitas keuangan komite.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200/90 hover:border-emerald-300 hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-xl bg-emerald-100 border border-emerald-200 flex items-center justify-center text-emerald-700 mb-5">
                <Receipt className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Penagihan & Iuran Otomatis</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Pencatatan iuran sukarela bulanan siswa dengan kartu iuran digital, bukti pembayaran WhatsApp, dan status keterbayaran real-time.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200/90 hover:border-cyan-300 hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-xl bg-cyan-100 border border-cyan-200 flex items-center justify-center text-cyan-700 mb-5">
                <BarChart3 className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Laporan Transparan SIAP Cetak</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Hasilkan Laporan Kas Umum (BKU), Laporan Kegiatan Acara, dan Nota Pengeluaran yang siap ditandatangani Ketua & Bendahara Komite.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200/90 hover:border-teal-300 hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-xl bg-teal-100 border border-teal-200 flex items-center justify-center text-teal-700 mb-5">
                <Users className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Advokasi & Bantuan Siswa</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Kelola pembebasan iuran bagi siswa kurang mampu, beasiswa komite, dan penyaluran bantuan langsung yang tepat sasaran.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-slate-50 border border-slate-200/90 hover:border-purple-300 hover:shadow-md transition-all">
              <div className="w-12 h-12 rounded-xl bg-purple-100 border border-purple-200 flex items-center justify-center text-purple-700 mb-5">
                <ShieldCheck className="w-6 h-6" />
              </div>
              <h3 className="text-lg font-bold text-slate-900 mb-2">Enkapsulasi Multi-Tenant</h3>
              <p className="text-slate-600 text-sm leading-relaxed">
                Data keuangan, siswa, dan transaksi setiap sekolah tersimpan dalam isolasi tenant mandiri tanpa risiko tertukar dengan sekolah lain.
              </p>
            </div>
          </div>
        </div>
      </section>

      {/* SYSTEM PREVIEW SHOWCASE */}
      <section id="preview" className="py-20 max-w-7xl mx-auto px-4 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-10">
          <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-emerald-800 bg-emerald-100 px-3 py-1 rounded-full border border-emerald-200 mb-3">
            Antarmuka Teruji
          </div>
          <h2 className="text-2xl sm:text-4xl font-bold text-slate-900 mb-3">
            Preview Antarmuka Sistem Kebanggaan Komite
          </h2>
          <p className="text-slate-600 text-sm sm:text-base">
            Simulasi visual tangkapan layar dashboard, aliran arus kas, dan modul penerimaan iuran siswa.
          </p>
        </div>

        {/* Tab Controls */}
        <div className="flex items-center justify-center gap-2 mb-8">
          <button
            onClick={() => setActivePreviewTab('dashboard')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all cursor-pointer ${
              activePreviewTab === 'dashboard'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <LayoutDashboard className="w-4 h-4" />
            <span>Ringkasan Dashboard</span>
          </button>
          <button
            onClick={() => setActivePreviewTab('kas')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all cursor-pointer ${
              activePreviewTab === 'kas'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <Wallet className="w-4 h-4" />
            <span>Arus Kas & Buku Kas Umum</span>
          </button>
          <button
            onClick={() => setActivePreviewTab('laporan')}
            className={`flex items-center gap-2 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all cursor-pointer ${
              activePreviewTab === 'laporan'
                ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                : 'bg-white text-slate-700 hover:bg-slate-100 border border-slate-200'
            }`}
          >
            <PieChart className="w-4 h-4" />
            <span>Kartu Iuran Siswa</span>
          </button>
        </div>

        {/* Mockup Frame */}
        <div className="rounded-2xl bg-white border border-slate-200 p-3 sm:p-6 shadow-xl overflow-hidden">
          {/* Top Bar Mockup */}
          <div className="flex items-center justify-between pb-4 mb-4 border-b border-slate-200">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-red-400" />
              <div className="w-3 h-3 rounded-full bg-yellow-400" />
              <div className="w-3 h-3 rounded-full bg-emerald-400" />
              <span className="text-xs text-slate-500 font-mono ml-2 hidden sm:inline">
                app.komiteku.id/tenant_percontohan/dashboard
              </span>
            </div>
            <div className="text-xs text-emerald-800 bg-emerald-50 border border-emerald-200 px-2.5 py-1 rounded-md font-semibold">
              Mode Multi-Tenant Aktif
            </div>
          </div>

          {/* Dynamic Preview Content */}
          {activePreviewTab === 'dashboard' && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-xs text-slate-500 mb-1 font-semibold">Saldo Kas Komite</div>
                  <div className="text-xl sm:text-2xl font-extrabold text-emerald-700">Rp 48.750.000</div>
                  <div className="text-[11px] text-emerald-600 mt-1 font-medium">↑ +12.4% dari bulan lalu</div>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-xs text-slate-500 mb-1 font-semibold">Total Penerimaan Bulan Ini</div>
                  <div className="text-xl sm:text-2xl font-extrabold text-cyan-700">Rp 18.300.000</div>
                  <div className="text-[11px] text-slate-500 mt-1">Dari 122 transaksi iuran</div>
                </div>
                <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                  <div className="text-xs text-slate-500 mb-1 font-semibold">Capaian Target Iuran</div>
                  <div className="text-xl sm:text-2xl font-extrabold text-teal-700">88.5%</div>
                  <div className="text-[11px] text-slate-500 mt-1">Target bulanan Rp 150rb/siswa</div>
                </div>
              </div>

              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between mb-3">
                  <h4 className="text-sm font-bold text-slate-900">Aktivitas Transaksi Terbaru</h4>
                  <span className="text-xs text-slate-500 font-medium">Terautentikasi Petugas</span>
                </div>
                <div className="space-y-2.5 text-xs">
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-slate-200">
                    <span className="text-slate-800 font-medium">Iuran Bulanan Mei - Ahmad Fauzi (Kelas 7-A)</span>
                    <span className="font-bold text-emerald-600">+ Rp 150.000</span>
                  </div>
                  <div className="flex items-center justify-between p-2.5 rounded-lg bg-white border border-slate-200">
                    <span className="text-slate-800 font-medium">Pembayaran Borongan Renovasi Toilet Siswa</span>
                    <span className="font-bold text-rose-600">- Rp 19.500.000</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {activePreviewTab === 'kas' && (
            <div className="space-y-4">
              <div className="flex items-center justify-between p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div>
                  <h4 className="text-sm font-bold text-slate-900">Buku Kas Umum (BKU) - Komite Sekolah</h4>
                  <p className="text-xs text-slate-500">Pencatatan double-entry penerimaan dan pengeluaran</p>
                </div>
                <span className="px-3 py-1 bg-emerald-100 text-emerald-800 text-xs font-semibold rounded-lg border border-emerald-200">
                  Audit Siap Cetak
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-100 text-slate-700 uppercase font-semibold">
                    <tr>
                      <th className="p-3">Tanggal</th>
                      <th className="p-3">Uraian Transaksi</th>
                      <th className="p-3">Kategori</th>
                      <th className="p-3 text-right">Debit / Masuk</th>
                      <th className="p-3 text-right">Kredit / Keluar</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-200 text-slate-800">
                    <tr>
                      <td className="p-3">02 Mei 2026</td>
                      <td className="p-3 font-semibold text-slate-900">Iuran Bulanan Mei 2026 - Kelas 7-A</td>
                      <td className="p-3"><span className="px-2 py-0.5 bg-emerald-100 text-emerald-800 font-medium rounded">Iuran Bulanan</span></td>
                      <td className="p-3 text-right text-emerald-700 font-bold">Rp 150.000</td>
                      <td className="p-3 text-right text-slate-400">-</td>
                    </tr>
                    <tr>
                      <td className="p-3">04 Mei 2026</td>
                      <td className="p-3 font-semibold text-slate-900">Sumbangan Acara Pentas Seni Donatur</td>
                      <td className="p-3"><span className="px-2 py-0.5 bg-cyan-100 text-cyan-800 font-medium rounded">Sumbangan</span></td>
                      <td className="p-3 text-right text-emerald-700 font-bold">Rp 5.000.000</td>
                      <td className="p-3 text-right text-slate-400">-</td>
                    </tr>
                    <tr>
                      <td className="p-3">14 Mei 2026</td>
                      <td className="p-3 font-semibold text-slate-900">Pembayaran Renovasi Sanitasi Toilet Kelas 7</td>
                      <td className="p-3"><span className="px-2 py-0.5 bg-rose-100 text-rose-800 font-medium rounded">Prasarana</span></td>
                      <td className="p-3 text-right text-slate-400">-</td>
                      <td className="p-3 text-right text-rose-600 font-bold">Rp 19.500.000</td>
                    </tr>
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {activePreviewTab === 'laporan' && (
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-slate-50 border border-slate-200">
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-sm font-bold text-slate-900">Kartu Iuran Siswa Digital</h4>
                  <span className="text-xs font-semibold text-emerald-700">Periode 2025/2026</span>
                </div>
                <p className="text-xs text-slate-500 mb-4">
                  Setiap siswa memiliki rekam jejak iuran transparan yang dapat diakses wali murid.
                </p>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-center">
                    <div className="text-slate-500 text-[10px]">Januari</div>
                    <div className="font-bold text-emerald-700 mt-0.5">LUNAS</div>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-center">
                    <div className="text-slate-500 text-[10px]">Februari</div>
                    <div className="font-bold text-emerald-700 mt-0.5">LUNAS</div>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-center">
                    <div className="text-slate-500 text-[10px]">Maret</div>
                    <div className="font-bold text-emerald-700 mt-0.5">LUNAS</div>
                  </div>
                  <div className="p-3 rounded-lg bg-emerald-50 border border-emerald-200 text-center">
                    <div className="text-slate-500 text-[10px]">April</div>
                    <div className="font-bold text-emerald-700 mt-0.5">LUNAS</div>
                  </div>
                </div>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* KEAMANAN & MULTI-TENANT SECTION */}
      <section id="keamanan" className="py-16 bg-white border-t border-slate-200">
        <div className="max-w-6xl mx-auto px-4 lg:px-8">
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-10 items-center">
            <div>
              <div className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-cyan-800 bg-cyan-100 px-3 py-1 rounded-full border border-cyan-200 mb-4">
                Keamanan Terjamin
              </div>
              <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-4">
                Pemisahan Data Multi-Tenant yang Mutlak
              </h2>
              <p className="text-slate-600 text-sm sm:text-base leading-relaxed mb-6 font-medium">
                Sistem kami menerapkan isolasi tingkat basis data (database encapsulation). Setiap permintaan data dikunci menggunakan identifier tenant unik, memastikan tidak ada data siswa, iuran, maupun transaksi yang bercampur antar sekolah.
              </p>
              <ul className="space-y-3 text-sm text-slate-700 font-medium">
                <li className="flex items-center gap-3">
                  <Lock className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>Kunci data tenant unik pada setiap query SQL PostgreSQL.</span>
                </li>
                <li className="flex items-center gap-3">
                  <ShieldCheck className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>Otentikasi bertingkat untuk Ketua, Bendahara, dan Wali Murid.</span>
                </li>
                <li className="flex items-center gap-3">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600 flex-shrink-0" />
                  <span>Dukungan Ekspor / Impor Cadangan Data Mandiri (JSON).</span>
                </li>
              </ul>
            </div>

            <div className="p-8 rounded-2xl bg-gradient-to-b from-slate-50 to-emerald-50/40 border border-slate-200 shadow-lg">
              <h3 className="text-lg font-bold text-slate-900 mb-3 flex items-center gap-2">
                <Building2 className="w-5 h-5 text-emerald-600" />
                <span>Siap Digunakan Segera</span>
              </h3>
              <p className="text-sm text-slate-600 mb-6">
                Hanya butuh 1 menit untuk mendaftarkan nama sekolah dan mengatur pengurus komite Anda.
              </p>
              <button
                onClick={onOpenRegister}
                className="w-full flex items-center justify-center gap-2 px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-sm shadow-md transition-all cursor-pointer"
              >
                <span>Daftarkan Sekolah Sekarang</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* FOOTER INFORMASI UMUM */}
      <footer id="faq" className="bg-slate-100 border-t border-slate-200 text-slate-600 text-xs py-12">
        <div className="max-w-7xl mx-auto px-4 lg:px-8">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8 mb-10">
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <School className="w-5 h-5 text-emerald-600" />
                <span className="text-base font-bold text-slate-900">KomiteKu SaaS</span>
              </div>
              <p className="text-slate-600 leading-relaxed">
                Mitra independen sekolah: transparansi dan akuntabilitas.
              </p>
            </div>

            <div>
              <h4 className="text-sm font-bold text-slate-900 mb-3">Produk & Layanan</h4>
              <ul className="space-y-2 font-medium">
                <li><a href="#fitur" className="hover:text-emerald-600 transition-colors">Iuran Bulanan Digital</a></li>
                <li><a href="#fitur" className="hover:text-emerald-600 transition-colors">Laporan Kas Umum Komite</a></li>
                <li><a href="#fitur" className="hover:text-emerald-600 transition-colors">Pemberitahuan Orang Tua</a></li>
                <li><a href="#keamanan" className="hover:text-emerald-600 transition-colors">Isolasi Basis Data SaaS</a></li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-bold text-slate-900 mb-3">Informasi Legal & Tatakelola</h4>
              <ul className="space-y-2 font-medium">
                <li><span>Kepatuhan Permendikbud No. 75 Tahun 2016</span></li>
                <li><span>Prinsip Transparansi Partisipatif</span></li>
                <li><span>Hak Privasi Data Siswa</span></li>
                <li><span>Advokasi Bantuan Siswa Mampu</span></li>
              </ul>
            </div>

            <div>
              <h4 className="text-sm font-bold text-slate-900 mb-3">Hubungi Layanan</h4>
              <ul className="space-y-2 font-medium">
                <li className="flex items-center gap-2">
                  <Mail className="w-4 h-4 text-emerald-600" />
                  <span>support@komiteku.id</span>
                </li>
                <li className="flex items-center gap-2">
                  <Phone className="w-4 h-4 text-emerald-600" />
                  <span>+62 812-3456-7890 (WhatsApp Helpdesk)</span>
                </li>
                <li className="flex items-center gap-2">
                  <HelpCircle className="w-4 h-4 text-emerald-600" />
                  <span>Pusat Bantuan Komite Sekolah</span>
                </li>
              </ul>
            </div>
          </div>

          <div className="pt-8 border-t border-slate-200 flex flex-col sm:flex-row items-center justify-between gap-4 font-medium">
            <p>© {new Date().getFullYear()} KomiteKu. Hak Cipta Dilindungi Undang-Undang.</p>
            <div className="flex items-center gap-4">
              <button onClick={onOpenDemo} className="hover:text-emerald-600 transition-colors cursor-pointer">
                Versi Demo Percontohan
              </button>
              <span>•</span>
              <button onClick={onOpenLogin} className="hover:text-emerald-600 transition-colors cursor-pointer">
                Portal Pengurus Sekolah
              </button>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

