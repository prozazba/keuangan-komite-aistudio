import React, { useState } from 'react';
import { X, History, Download, Upload, RefreshCw, CheckCircle2, AlertTriangle, ShieldCheck, Database } from 'lucide-react';
import { getActiveTenantId } from '../firebase';

interface VersionManagerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onRefreshData?: () => void;
}

export const VersionManagerModal: React.FC<VersionManagerModalProps> = ({
  isOpen,
  onClose,
  onRefreshData,
}) => {
  const [downloading, setDownloading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [statusMsg, setStatusMsg] = useState('');
  const [errorMsg, setErrorMsg] = useState('');

  if (!isOpen) return null;

  const tenantId = getActiveTenantId();

  const handleExportBackup = async () => {
    setDownloading(true);
    setStatusMsg('');
    setErrorMsg('');
    try {
      const res = await fetch(`/api/backup/${encodeURIComponent(tenantId)}`);
      if (!res.ok) throw new Error('Gagal mengunduh cadangan data');
      const data = await res.json();

      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `RestorePoint_${tenantId}_${new Date().toISOString().slice(0,10)}.json`;
      a.click();
      URL.revokeObjectURL(url);

      setStatusMsg('Restore point berhasil diunduh dalam format JSON.');
    } catch (err: any) {
      setErrorMsg(err.message || 'Gagal mengekspor data');
    } finally {
      setDownloading(false);
    }
  };

  const handleImportBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    setStatusMsg('');
    setErrorMsg('');

    try {
      const text = await file.text();
      const jsonData = JSON.parse(text);

      const res = await fetch(`/api/restore/${encodeURIComponent(tenantId)}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(jsonData)
      });

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: 'Gagal memulihkan data' }));
        throw new Error(err.error || 'Gagal memulihkan data');
      }

      setStatusMsg('Data berhasil dipulihkan dari restore point JSON!');
      if (onRefreshData) onRefreshData();
    } catch (err: any) {
      setErrorMsg(err.message || 'Berkas JSON tidak valid atau rusak');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-sm">
      <div className="relative w-full max-w-lg bg-slate-900 border border-slate-800 rounded-2xl shadow-2xl overflow-hidden text-slate-100">
        <div className="flex items-center justify-between p-5 border-b border-slate-800 bg-slate-950/60">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-cyan-500/10 text-cyan-400 flex items-center justify-center border border-cyan-500/20">
              <History className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-base text-white">Cadangan Data & Riwayat</h3>
              <p className="text-xs text-slate-400">Penyimpanan Cadangan & Informasi Aplikasi</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 space-y-5">
          {/* Version badge */}
          <div className="p-4 rounded-xl bg-slate-950 border border-slate-800 flex items-center justify-between">
            <div>
              <div className="text-xs text-slate-400 font-medium">Versi Aplikasi</div>
              <div className="text-base font-bold text-white flex items-center gap-2 mt-0.5">
                <span>Versi v2.5 (Terbaru)</span>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 text-xs font-semibold border border-emerald-500/20">
              Aktif & Ambil
            </span>
          </div>

          {statusMsg && (
            <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 flex-shrink-0" />
              <span>{statusMsg}</span>
            </div>
          )}

          {errorMsg && (
            <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/20 text-rose-400 text-xs flex items-center gap-2">
              <AlertTriangle className="w-4 h-4 flex-shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            {/* Export */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-white font-semibold text-xs">
                <Download className="w-4 h-4 text-emerald-400" />
                <span>Simpan Cadangan Data</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-normal">
                Unduh salinan cadangan lengkap data komite (siswa, iuran, & transaksi).
              </p>
              <button
                onClick={handleExportBackup}
                disabled={downloading}
                className="w-full mt-2 py-2 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold transition-all cursor-pointer"
              >
                {downloading ? 'Mengunduh...' : 'Unduh Berkas Cadangan'}
              </button>
            </div>

            {/* Import */}
            <div className="p-4 rounded-xl bg-slate-950/60 border border-slate-800 space-y-2">
              <div className="flex items-center gap-2 text-white font-semibold text-xs">
                <Upload className="w-4 h-4 text-cyan-400" />
                <span>Pulihkan Data Komite</span>
              </div>
              <p className="text-[11px] text-slate-400 leading-normal">
                Unggah berkas cadangan untuk mengembalikan data komite ke kondisi sebelumnya.
              </p>
              <label className="block w-full mt-2 py-2 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-cyan-400 text-xs font-bold text-center transition-all cursor-pointer border border-slate-700">
                {uploading ? 'Memproses Restore...' : 'Pilih Berkas Cadangan'}
                <input
                  type="file"
                  accept=".json"
                  onChange={handleImportBackup}
                  disabled={uploading}
                  className="hidden"
                />
              </label>
            </div>
          </div>

          <div className="pt-3 text-[11px] text-slate-500 border-t border-slate-800 flex items-center justify-between">
            <span>Kode Unit Komite: <strong className="text-slate-300">{tenantId}</strong></span>
            <span>Tersimpan Aman</span>
          </div>
        </div>
      </div>
    </div>
  );
};
