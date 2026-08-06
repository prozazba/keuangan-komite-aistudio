import React, { useState, useEffect } from 'react';
import { 
  X, 
  Settings2, 
  CheckCircle2, 
  Building2, 
  Landmark, 
  GraduationCap, 
  BookOpen, 
  Award, 
  School,
  Save, 
  Palette, 
  UserCheck, 
  MapPin, 
  CreditCard, 
  Phone, 
  Mail,
  Sparkles
} from 'lucide-react';
import { TenantProfile } from '../types';

interface TenantSetupModalProps {
  isOpen: boolean;
  tenant: TenantProfile | null;
  onClose: () => void;
  onSave: (updatedTenant: TenantProfile) => void;
}

const LOGO_OPTIONS = [
  { id: 'landmark', label: 'Landmark Komite', icon: Landmark },
  { id: 'building', label: 'Gedung Sekolah', icon: Building2 },
  { id: 'school', label: 'Kampus Sekolah', icon: School },
  { id: 'graduation', label: 'Topi Toga', icon: GraduationCap },
  { id: 'book', label: 'Buku Ilmu', icon: BookOpen },
  { id: 'award', label: 'Lencana Komite', icon: Award },
];

export const TenantSetupModal: React.FC<TenantSetupModalProps> = ({
  isOpen,
  tenant,
  onClose,
  onSave,
}) => {
  const [activeTab, setActiveTab] = useState<'branding' | 'officials' | 'financial'>('branding');

  const [name, setName] = useState('');
  const [shortName, setShortName] = useState('');
  const [schoolLevel, setSchoolLevel] = useState('SMP');
  const [academicYear, setAcademicYear] = useState('2025/2026');
  const [logoIcon, setLogoIcon] = useState('landmark');
  
  const [committeeChair, setCommitteeChair] = useState('');
  const [treasurerName, setTreasurerName] = useState('');
  const [principalName, setPrincipalName] = useState('');
  
  const [address, setAddress] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [monthlyDuesTarget, setMonthlyDuesTarget] = useState(150000);
  const [bankAccount, setBankAccount] = useState('');

  const [saving, setSaving] = useState(false);
  const [msg, setMsg] = useState('');

  useEffect(() => {
    if (tenant) {
      setName(tenant.name || '');
      setShortName(tenant.shortName || '');
      setSchoolLevel(tenant.schoolLevel || 'SMP');
      setAcademicYear(tenant.academicYear || '2025/2026');
      setLogoIcon(tenant.logoIcon || 'landmark');
      setCommitteeChair(tenant.committeeChair || '');
      setTreasurerName(tenant.treasurerName || '');
      setPrincipalName(tenant.principalName || '');
      setAddress(tenant.address || '');
      setPhone(tenant.phone || '');
      setEmail(tenant.email || '');
      setMonthlyDuesTarget(tenant.monthlyDuesTarget || 150000);
      setBankAccount(tenant.bankAccount || '');
    }
  }, [tenant]);

  if (!isOpen || !tenant) return null;

  const SelectedIconComp = LOGO_OPTIONS.find(l => l.id === logoIcon)?.icon || Landmark;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMsg('');

    try {
      const payload: Partial<TenantProfile> = {
        id: tenant.id,
        name,
        shortName,
        schoolLevel,
        academicYear,
        logoIcon,
        committeeChair,
        treasurerName,
        principalName,
        address,
        phone,
        email,
        monthlyDuesTarget: Number(monthlyDuesTarget),
        bankAccount
      };

      const res = await fetch(`/api/tenants/${tenant.id}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });

      if (!res.ok) throw new Error('Gagal menyimpan pengaturan sekolah');

      const updatedObj: TenantProfile = {
        ...tenant,
        ...payload
      } as TenantProfile;

      onSave(updatedObj);
      setMsg('Pengaturan dan personalisasi sekolah berhasil disimpan.');
      setTimeout(() => {
        onClose();
        setMsg('');
      }, 1000);
    } catch (err: any) {
      setMsg(err.message || 'Terjadi kesalahan saat menyimpan.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-slate-100 flex flex-col max-h-[90vh]">
        
        {/* Header Modal */}
        <div className="flex items-center justify-between p-4 sm:p-5 border-b border-slate-800 bg-slate-950/80 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/10 text-emerald-400 flex items-center justify-center border border-emerald-500/20 shrink-0">
              <Settings2 className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Pengaturan & Branding Komite Sekolah</h3>
              <p className="text-xs text-slate-400">Kelola Identitas, Penanggung Jawab & Acuan Komite</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Live Visual Header Preview */}
        <div className="p-4 bg-slate-950/60 border-b border-slate-800/80 shrink-0">
          <div className="text-[11px] font-semibold text-slate-400 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            <span>Pratinjau Tampilan Header Aplikasi</span>
          </div>
          <div className="p-3.5 rounded-xl bg-header-gradient text-white flex items-center justify-between gap-3 shadow-sm border border-white/10">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-white/15 backdrop-blur-md flex items-center justify-center text-[#fdf0d5] shrink-0">
                <SelectedIconComp className="w-5 h-5" />
              </div>
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-white truncate">{name || 'Nama Sekolah'}</span>
                  <span className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-400/20 text-emerald-200 border border-emerald-400/30">
                    {schoolLevel}
                  </span>
                </div>
                <div className="text-[11px] text-[#fdf0d5]/80 flex items-center gap-2 mt-0.5">
                  <span>TA {academicYear}</span>
                  {committeeChair && <span>• Ketua: {committeeChair}</span>}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Tabs */}
        <div className="flex border-b border-slate-800 bg-slate-950/40 px-4 pt-2 gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('branding')}
            className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold rounded-t-xl transition-colors border-b-2 cursor-pointer ${
              activeTab === 'branding'
                ? 'border-emerald-400 text-emerald-400 bg-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <Palette className="w-4 h-4" />
            <span>Identitas & Visual</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('officials')}
            className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold rounded-t-xl transition-colors border-b-2 cursor-pointer ${
              activeTab === 'officials'
                ? 'border-emerald-400 text-emerald-400 bg-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <UserCheck className="w-4 h-4" />
            <span>Pengurus Komite</span>
          </button>
          <button
            type="button"
            onClick={() => setActiveTab('financial')}
            className={`flex items-center gap-2 px-3.5 py-2.5 text-xs font-semibold rounded-t-xl transition-colors border-b-2 cursor-pointer ${
              activeTab === 'financial'
                ? 'border-emerald-400 text-emerald-400 bg-slate-900'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            }`}
          >
            <CreditCard className="w-4 h-4" />
            <span>Acuan Iuran & Kontak</span>
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-5 overflow-y-auto space-y-4 flex-1">
          {msg && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{msg}</span>
            </div>
          )}

          {/* TAB 1: IDENTITAS & VISUAL */}
          {activeTab === 'branding' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-medium text-slate-300 mb-1">Nama Sekolah / Unit Komite</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    placeholder="Contoh: Komite UPT SMP Negeri 1 Mandiri"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                    required
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Nama Singkat / Inisial</label>
                  <input
                    type="text"
                    value={shortName}
                    onChange={e => setShortName(e.target.value)}
                    placeholder="SPENSA"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Jenjang Pendidikan</label>
                  <select
                    value={schoolLevel}
                    onChange={e => setSchoolLevel(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="SD">SD / MI (Sekolah Dasar)</option>
                    <option value="SMP">SMP / MTs (Sekolah Menengah Pertama)</option>
                    <option value="SMA">SMA / MA (Sekolah Menengah Atas)</option>
                    <option value="SMK">SMK (Sekolah Menengah Kejuruan)</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Tahun Ajaran Aktif</label>
                  <input
                    type="text"
                    value={academicYear}
                    onChange={e => setAcademicYear(e.target.value)}
                    placeholder="2025/2026"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-2">Simbol Icon Logo Komite</label>
                <div className="grid grid-cols-3 sm:grid-cols-6 gap-2">
                  {LOGO_OPTIONS.map((item) => {
                    const IconC = item.icon;
                    const isSelected = logoIcon === item.id;
                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => setLogoIcon(item.id)}
                        className={`flex flex-col items-center justify-center p-3 rounded-xl border text-xs transition-all cursor-pointer ${
                          isSelected
                            ? 'bg-emerald-500/20 border-emerald-400 text-emerald-300'
                            : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-slate-200 hover:border-slate-700'
                        }`}
                      >
                        <IconC className="w-5 h-5 mb-1" />
                        <span className="text-[10px] text-center leading-tight">{item.label}</span>
                      </button>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* TAB 2: PENGURUS KOMITE */}
          {activeTab === 'officials' && (
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Ketua Komite Sekolah</label>
                <input
                  type="text"
                  value={committeeChair}
                  onChange={e => setCommitteeChair(e.target.value)}
                  placeholder="Nama & Gelar Ketua Komite"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Bendahara Komite</label>
                <input
                  type="text"
                  value={treasurerName}
                  onChange={e => setTreasurerName(e.target.value)}
                  placeholder="Nama & Gelar Bendahara Komite"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Kepala Sekolah</label>
                <input
                  type="text"
                  value={principalName}
                  onChange={e => setPrincipalName(e.target.value)}
                  placeholder="Nama & Gelar Kepala Sekolah"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          )}

          {/* TAB 3: FINANCIAL & CONTACT */}
          {activeTab === 'financial' && (
            <div className="space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Target Nominal Iuran Bulanan (Rp)</label>
                  <input
                    type="number"
                    value={monthlyDuesTarget}
                    onChange={e => setMonthlyDuesTarget(Number(e.target.value))}
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-emerald-500 font-mono"
                  />
                  <span className="text-[10px] text-slate-500 mt-1 block">Acuan per tagihan bulanan per siswa</span>
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Rekening Pembayaran Komite</label>
                  <input
                    type="text"
                    value={bankAccount}
                    onChange={e => setBankAccount(e.target.value)}
                    placeholder="BCA 1234-567-890 a.n Komite Sekolah"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Nomor Telepon / WhatsApp Komite</label>
                  <input
                    type="text"
                    value={phone}
                    onChange={e => setPhone(e.target.value)}
                    placeholder="0812-3456-7890"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>

                <div>
                  <label className="block text-xs font-medium text-slate-300 mb-1">Email Resmi Komite</label>
                  <input
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="komite@sekolah.sch.id"
                    className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-sm text-slate-100 focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-300 mb-1">Alamat Lengkap Sekolah</label>
                <textarea
                  rows={2}
                  value={address}
                  onChange={e => setAddress(e.target.value)}
                  placeholder="Jl. Pendidikan No. 45, Surabaya, Jawa Timur"
                  className="w-full px-3.5 py-2 rounded-xl bg-slate-950 border border-slate-800 text-xs text-slate-100 focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>
          )}

          {/* Action Buttons */}
          <div className="pt-4 flex items-center justify-end gap-3 border-t border-slate-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl text-xs font-medium text-slate-300 hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Batal
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-xs shadow-md transition-all cursor-pointer"
            >
              <Save className="w-4 h-4" />
              <span>{saving ? 'Menyimpan...' : 'Simpan Pengaturan'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
