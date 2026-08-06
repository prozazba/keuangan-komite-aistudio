import React, { useState } from 'react';
import { X, LogIn, UserPlus, School, CheckCircle, AlertCircle, ArrowRight, ShieldCheck, Terminal, Wrench } from 'lucide-react';
import { setActiveTenantId } from '../firebase';
import { TenantUser, TenantProfile } from '../types';

interface AuthModalProps {
  isOpen: boolean;
  initialMode?: 'login' | 'register';
  onClose: () => void;
  onSuccess: (user: TenantUser, tenant: TenantProfile) => void;
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  initialMode = 'login',
  onClose,
  onSuccess,
}) => {
  const [mode, setMode] = useState<'login' | 'register'>(initialMode);
  
  // Login State
  const [loginEmail, setLoginEmail] = useState('');
  const [loginPassword, setLoginPassword] = useState('');

  // Register State
  const [schoolName, setSchoolName] = useState('');
  const [schoolLevel, setSchoolLevel] = useState('SMP');
  const [adminName, setAdminName] = useState('');
  const [registerEmail, setRegisterEmail] = useState('');
  const [registerPassword, setRegisterPassword] = useState('');

  const [loading, setLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const handleQuickLogin = async (email: string, pass: string) => {
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password: pass })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal masuk');

      setActiveTenantId(data.tenant.id);
      onSuccess(data.user, data.tenant);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Terjadi kesalahan sistem');
    } finally {
      setLoading(false);
    }
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!loginEmail) {
      setErrorMsg('Email wajib diisi');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: loginEmail, password: loginPassword })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal masuk');

      setActiveTenantId(data.tenant.id);
      onSuccess(data.user, data.tenant);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Email atau kata sandi tidak valid');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!schoolName || !registerEmail || !registerPassword) {
      setErrorMsg('Nama sekolah, email, dan kata sandi wajib diisi');
      return;
    }
    setLoading(true);
    setErrorMsg('');
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          schoolName,
          schoolLevel,
          adminName: adminName || 'Bendahara Komite',
          email: registerEmail,
          password: registerPassword
        })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Gagal mendaftar');

      setActiveTenantId(data.tenant.id);
      onSuccess(data.user, data.tenant);
      onClose();
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal melakukan pendaftaran sekolah');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="relative w-full max-w-md bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-slate-100">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/40">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-emerald-500/20 text-emerald-400 flex items-center justify-center">
              <School className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">
                {mode === 'login' ? 'Masuk Pengurus Komite' : 'Pendaftaran Unit Komite Baru'}
              </h3>
              <p className="text-xs text-slate-400">SaaS Platform Komite Sekolah</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Mode Switcher Tabs */}
        <div className="grid grid-cols-2 p-1.5 bg-slate-950 border-b border-slate-800 text-xs font-semibold">
          <button
            onClick={() => { setMode('login'); setErrorMsg(''); }}
            className={`py-2 rounded-lg transition-all flex items-center justify-center gap-2 ${
              mode === 'login' ? 'bg-slate-800 text-emerald-400 shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <LogIn className="w-3.5 h-3.5" />
            <span>Masuk Portal</span>
          </button>
          <button
            onClick={() => { setMode('register'); setErrorMsg(''); }}
            className={`py-2 rounded-lg transition-all flex items-center justify-center gap-2 ${
              mode === 'register' ? 'bg-slate-800 text-emerald-400 shadow' : 'text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>Daftar Unit Komite</span>
          </button>
        </div>

        <div className="p-6">
          {errorMsg && (
            <div className="mb-4 p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {mode === 'login' ? (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Email Pengurus</label>
                <input
                  type="email"
                  value={loginEmail}
                  onChange={e => setLoginEmail(e.target.value)}
                  placeholder="contoh: proto.sekolah.komite@gmail.com"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Kata Sandi</label>
                <input
                  type="password"
                  value={loginPassword}
                  onChange={e => setLoginPassword(e.target.value)}
                  placeholder="••••••••"
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition-all shadow-md shadow-emerald-950/50 flex items-center justify-center gap-2 cursor-pointer"
              >
                {loading ? 'Memproses...' : 'Masuk Kebanggaan Komite'}
                <ArrowRight className="w-4 h-4" />
              </button>

              <div className="relative py-2">
                <div className="absolute inset-0 flex items-center">
                  <div className="w-full border-t border-slate-800" />
                </div>
                <div className="relative flex justify-center text-[10px] uppercase font-semibold text-slate-500 tracking-wider">
                  <span className="px-2 bg-slate-900">Akses Cepat Penguji & Pengembang</span>
                </div>
              </div>

              {/* Dev User Button */}
              <button
                type="button"
                onClick={() => handleQuickLogin('dev@komiteku.id', 'dev12345')}
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 font-semibold text-xs transition-all border border-amber-500/30 flex items-center justify-center gap-2 cursor-pointer"
              >
                <Wrench className="w-4 h-4 text-amber-400" />
                <span>Masuk Cepat: Development User (dev@komiteku.id)</span>
              </button>

              {/* Demo Admin Button */}
              <button
                type="button"
                onClick={() => handleQuickLogin('proto.sekolah.komite@gmail.com', 'demo1234')}
                disabled={loading}
                className="w-full py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-cyan-400 font-semibold text-xs transition-all border border-slate-700/60 flex items-center justify-center gap-2 cursor-pointer"
              >
                <ShieldCheck className="w-4 h-4" />
                <span>Masuk Cepat: Demo Admin Komite</span>
              </button>

              {/* Credentials Card */}
              <div className="p-3 rounded-xl bg-slate-950/80 border border-slate-800/80 text-[11px] text-slate-400 space-y-1">
                <div className="font-bold text-amber-400 flex items-center gap-1.5 mb-1">
                  <Terminal className="w-3.5 h-3.5" />
                  <span>Kredensial Development User:</span>
                </div>
                <div className="flex justify-between font-mono bg-slate-900 p-1.5 rounded border border-slate-800">
                  <span className="text-slate-300">Email: dev@komiteku.id</span>
                  <span className="text-slate-300">Pass: dev12345</span>
                </div>
              </div>
            </form>
          ) : (
            <form onSubmit={handleRegisterSubmit} className="space-y-3.5">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Nama Sekolah / Unit Komite *</label>
                <input
                  type="text"
                  value={schoolName}
                  onChange={e => setSchoolName(e.target.value)}
                  placeholder="contoh: SMP Negeri 12 Surabaya"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Jenjang Sekolah</label>
                  <select
                    value={schoolLevel}
                    onChange={e => setSchoolLevel(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  >
                    <option value="SD">SD / MI</option>
                    <option value="SMP">SMP / MTs</option>
                    <option value="SMA">SMA / MA</option>
                    <option value="SMK">SMK</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Nama Bendahara / Pendaftar</label>
                  <input
                    type="text"
                    value={adminName}
                    onChange={e => setAdminName(e.target.value)}
                    placeholder="Sri Wahyuni, S.E."
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Email Sekolah / Komite *</label>
                <input
                  type="email"
                  value={registerEmail}
                  onChange={e => setRegisterEmail(e.target.value)}
                  placeholder="komite@smpn12.sch.id"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Kata Sandi Akun *</label>
                <input
                  type="password"
                  value={registerPassword}
                  onChange={e => setRegisterPassword(e.target.value)}
                  placeholder="Buat kata sandi minimal 6 karakter"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm transition-all shadow-md shadow-emerald-950/50 flex items-center justify-center gap-2 cursor-pointer mt-2"
              >
                {loading ? 'Mendaftarkan Tenant...' : 'Daftarkan Sekolah & Aktifkan SaaS'}
                <ArrowRight className="w-4 h-4" />
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
