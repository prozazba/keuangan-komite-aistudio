import React, { useState } from 'react';
import { db, handleFirestoreError, OperationType, collection, doc, deleteDoc, setDoc, updateDoc } from '../firebase';
import { Event } from '../types';
import { formatIDR } from '../utils';
import { Plus, Target, Calendar, ClipboardList, PenTool, CheckCircle, AlertTriangle, PlayCircle, Ban, Trash2, X } from 'lucide-react';

interface EventManagerProps {
  events: Event[];
  userRole?: 'admin' | 'operator';
}

export default function EventManager({ events, userRole }: EventManagerProps) {
  // Form View State
  const [showForm, setShowForm] = useState(false);
  const [isEditing, setIsEditing] = useState<Event | null>(null);

  // Form Fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().substring(0, 10));
  const [budgetTarget, setBudgetTarget] = useState<number>(0);
  const [status, setStatus] = useState<'planning' | 'active' | 'completed' | 'cancelled'>('planning');

  const resetForm = () => {
    setTitle('');
    setDescription('');
    setDate(new Date().toISOString().substring(0, 10));
    setBudgetTarget(0);
    setStatus('planning');
    setIsEditing(null);
    setShowForm(false);
  };

  const handleEdit = (event: Event) => {
    setIsEditing(event);
    setTitle(event.title);
    setDescription(event.description);
    setDate(event.date);
    setBudgetTarget(event.budgetTarget);
    setStatus(event.status);
    setShowForm(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (userRole === 'operator') {
      alert("Akses Terbatas: Hanya Bendahara (Admin) yang dapat memofifikasi Rencana Anggaran Event & RAB.");
      return;
    }
    if (!title || budgetTarget < 0) {
      alert("Isi data event secara valid!");
      return;
    }

    try {
      const gId = isEditing ? isEditing.id : `evt_${Date.now()}`;
      const payload: Event = {
        id: gId,
        title: title.trim(),
        description: description.trim(),
        date,
        budgetTarget,
        actualIncome: isEditing ? isEditing.actualIncome : 0,
        actualExpense: isEditing ? isEditing.actualExpense : 0,
        status,
        createdAt: isEditing ? isEditing.createdAt : new Date().toISOString()
      };

      await setDoc(doc(db, 'events', gId), payload);
      resetForm();
    } catch (err) {
      handleFirestoreError(err, isEditing ? OperationType.UPDATE : OperationType.CREATE, 'events');
    }
  };

  const handleDelete = async (eventId: string) => {
    if (userRole === 'operator') {
      alert("Akses Terbatas: Hanya Bendahara (Admin) yang dapat menghapus Rencana Anggaran Event & RAB.");
      return;
    }
    if (!window.confirm("Apakah Anda yakin ingin menghapus Rencana Anggaran Event ini?")) {
      return;
    }

    try {
      await deleteDoc(doc(db, 'events', eventId));
    } catch (err) {
      handleFirestoreError(err, OperationType.DELETE, 'events');
    }
  };

  // Compute stats helper
  const getStatusBadge = (evtStatus: string) => {
    switch (evtStatus) {
      case 'planning':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-amber-50 text-amber-700 border border-amber-100"><ClipboardList className="h-3 w-3" /> Perencanaan</span>;
      case 'active':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-emerald-50 text-emerald-700 border border-emerald-100"><PlayCircle className="h-3 w-3 animate-pulse" /> Berjalan</span>;
      case 'completed':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-indigo-50 text-indigo-700 border border-indigo-100"><CheckCircle className="h-3 w-3" /> Selesai</span>;
      case 'cancelled':
        return <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-bold bg-gray-50 text-gray-500 border border-gray-150"><Ban className="h-3 w-3" /> Batal</span>;
      default:
        return null;
    }
  };

  return (
    <div id="event-manager-section" className="space-y-6">
      
      {/* Event Header Panel */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-2xs">
        <div className="text-left">
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Target className="h-5 w-5 text-indigo-600" />
            Program Kerja & RAB Komite Sekolah
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Perumusan Rencana Anggaran Biaya (RAB) program kerja independen Komite Sekolah & program kerja sama, pengawasan realisasi anggaran, serta transparansi.
          </p>
        </div>
        {userRole === 'operator' ? (
          <div className="text-xs bg-amber-50 text-amber-800 border border-amber-200 py-2 px-3.5 rounded-xl font-bold flex items-center gap-1.5 shadow-2xs">
            <AlertTriangle className="h-4 w-4 shrink-0 text-amber-600" />
            <span>Akses Terbatas: Operator</span>
          </div>
        ) : (
          <button
            id="btn-add-event"
            onClick={() => { resetForm(); setShowForm(!showForm); }}
            className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white px-4 py-2 rounded-xl font-bold text-xs transition-all shadow-xs cursor-pointer"
          >
            {showForm ? <X className="h-4 w-4" /> : <Plus className="h-4 w-4" />}
            {showForm ? 'Batal' : 'Tambah Event & RAB Baru'}
          </button>
        )}
      </div>

      {/* Dynamic Form for Event Input */}
      {showForm && (
        <form onSubmit={handleSubmit} className="bg-white border border-gray-150 rounded-2xl p-6 shadow-md transition-all duration-300 space-y-5">
          <div className="border-b border-gray-100 pb-4">
            <h3 className="text-base font-bold text-gray-900">
              {isEditing ? 'Edit Perencanaan Anggaran Event' : 'Buat Rencana Anggaran Biaya (RAB) Baru'}
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-5 text-left">
            {/* Title */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Nama Program / Kegiatan Acara *</label>
              <input
                type="text"
                placeholder="Contoh: Panitia Hari Guru 2026"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-2.5 text-xs transition-all outline-none"
                required
              />
            </div>

            {/* Target Budget */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">RAB Target Anggaran (Rupiah) *</label>
              <input
                type="number"
                placeholder="Contoh: 15000000"
                value={budgetTarget || ''}
                onChange={(e) => setBudgetTarget(Number(e.target.value))}
                className="w-full bg-slate-50 border border-slate-100 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-2.5 text-xs transition-all outline-none"
                required
                min={0}
              />
            </div>

            {/* Date Target */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Target Pelaksanaan *</label>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-2.5 text-xs transition-all outline-none"
                required
              />
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-5 text-left">
            {/* Description */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Keterangan / Tujuan Acara</label>
              <textarea
                placeholder="Contoh: Rincian pemeliharaan sarana olahraga, pembelian raket tenis..."
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="w-full bg-slate-50 border border-slate-100 focus:border-indigo-500 focus:bg-white focus:ring-1 focus:ring-indigo-500 rounded-xl px-4 py-2.5 text-xs transition-all outline-none"
                rows={2}
              />
            </div>

            {/* Status selection */}
            <div>
              <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-2">Status Penyelenggaraan *</label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value as any)}
                className="w-full bg-slate-50 border border-slate-100 focus:border-indigo-500 focus:bg-white rounded-xl px-4 py-2.5 text-xs outline-none cursor-pointer"
                required
              >
                <option value="planning">Tahap Perencanaan (Planning)</option>
                <option value="active">Sedang Berlangsung (Active)</option>
                <option value="completed">Sudah Terselesaikan (Completed)</option>
                <option value="cancelled">Dibatalkan (Cancelled)</option>
              </select>
            </div>
          </div>

          <div className="flex justify-end gap-3 pt-4 border-t border-slate-100">
            <button
              type="button"
              onClick={resetForm}
              className="px-4 py-2 rounded-xl text-slate-505 hover:text-slate-705 hover:bg-slate-100 text-xs font-bold transition-all cursor-pointer"
            >
              Reset
            </button>
            <button
              id="btn-submit-event"
              type="submit"
              className="bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-2 rounded-xl text-xs font-bold transition-all shadow-xs cursor-pointer"
            >
              Rilis Target Anggaran
            </button>
          </div>
        </form>
      )}

      {/* Grid displays of planned budgets */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {events.length > 0 ? (
          events.map((evt) => {
            // Percent calculations
            const percentSpent = evt.budgetTarget > 0 
              ? Math.min(100, Math.round((evt.actualExpense / evt.budgetTarget) * 100))
              : 0;
            
            const netSurplus = evt.actualIncome - evt.actualExpense;

            return (
              <div key={evt.id} className="bg-white border border-slate-100/80 rounded-2xl p-5 shadow-2xs flex flex-col justify-between hover:border-indigo-200 transition-all space-y-4 text-left">
                
                {/* Event header line */}
                <div className="space-y-1">
                  <div className="flex justify-between items-start gap-2">
                    <h3 className="font-bold text-slate-900 leading-tight tracking-tight text-sm hover:text-indigo-600 transition-colors">
                      {evt.title}
                    </h3>
                    <div className="shrink-0">
                      {getStatusBadge(evt.status)}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
                    <Calendar className="h-3.5 w-3.5 text-slate-400" />
                    Target: {evt.date}
                  </div>
                </div>

                {/* Event description block */}
                <p className="text-[11px] text-slate-500 leading-relaxed line-clamp-2 h-10 italic">
                  {evt.description || 'Tidak ada uraian penjelasan tambahan untuk event komite ini.'}
                </p>

                {/* Financial breakdown block */}
                <div className="bg-slate-50/80 rounded-xl p-3.5 border border-slate-200/80 space-y-2.5 text-left">
                  <div className="space-y-1.5 border-b border-slate-200/80 pb-2 text-xs">
                    <div className="flex items-center justify-between gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200/60">
                      <span className="text-slate-500 font-bold uppercase text-[9px] tracking-wide shrink-0">Pemasukan Event</span>
                      <span className="text-emerald-700 font-extrabold font-mono text-xs">{formatIDR(evt.actualIncome)}</span>
                    </div>
                    <div className="flex items-center justify-between gap-2 bg-white px-3 py-1.5 rounded-lg border border-slate-200/60">
                      <span className="text-slate-500 font-bold uppercase text-[9px] tracking-wide shrink-0">Pengeluaran Event</span>
                      <span className="text-rose-700 font-extrabold font-mono text-xs">{formatIDR(evt.actualExpense)}</span>
                    </div>
                  </div>

                  {/* Target budget progress bar */}
                  <div className="space-y-1.5">
                    <div className="flex justify-between items-center text-xs gap-2">
                      <span className="text-slate-500 font-bold uppercase text-[9px] tracking-wider shrink-0">Target RAB: <b className="text-slate-900 font-mono">{formatIDR(evt.budgetTarget)}</b></span>
                      <span className="font-extrabold text-indigo-700 text-[10px] shrink-0 bg-indigo-50 px-2 py-0.5 rounded border border-indigo-100">{percentSpent}% Terpakai</span>
                    </div>
                    {/* Progress track */}
                    <div className="w-full bg-slate-200/80 rounded-full h-2 overflow-hidden">
                      <div 
                        className="bg-indigo-600 h-full rounded-full transition-all duration-500"
                        style={{ width: `${percentSpent}%` }}
                      ></div>
                    </div>
                  </div>

                  {/* Net event balance */}
                  <div className="flex justify-between items-center text-xs pt-1 border-t border-slate-200/60">
                    <span className="text-slate-600 font-medium shrink-0">Selisih Kas:</span>
                    <span className={`font-extrabold font-mono ${netSurplus >= 0 ? 'text-emerald-700' : 'text-rose-600'}`}>
                      {formatIDR(netSurplus)} {netSurplus >= 0 ? '(Sisa)' : '(Defisit)'}
                    </span>
                  </div>
                </div>

                {/* Action footer */}
                {userRole !== 'operator' ? (
                  <div className="flex justify-end items-center gap-2 pt-2 border-t border-gray-100">
                    <button
                      onClick={() => handleEdit(evt)}
                      className="p-1.5 px-3 hover:bg-gray-100 rounded-lg text-xs font-bold text-gray-600 hover:text-indigo-600 transition-colors"
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDelete(evt.id)}
                      className="p-1.5 text-gray-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-all"
                      title="Hapus Event"
                    >
                      <Trash2 className="h-4.5 w-4.5" />
                    </button>
                  </div>
                ) : (
                  <div className="pt-2 border-t border-gray-100 text-center text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                    Sesi Peninjau (Akses Pengeditan Terbatas)
                  </div>
                )}

              </div>
            );
          })
        ) : (
          <div className="col-span-full bg-white border border-gray-150 rounded-2xl py-12 text-center text-gray-400 font-medium">
            <ClipboardList className="h-10 w-10 mx-auto opacity-40 mb-3 text-gray-500" />
            Belum ada rencana kegiatan dicanangkan. Tambahkan Event & RAB di atas!
          </div>
        )}
      </div>

    </div>
  );
}
