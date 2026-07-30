import React, { useState } from 'react';
import { StudentBill } from '../types';
import { formatIDR } from '../utils';
import { 
  Bell, Send, MessageSquare, Mail, CheckCircle2, 
  Clock, AlertCircle, RefreshCw, Smartphone, 
  ExternalLink, Loader2, Sparkles, Filter 
} from 'lucide-react';

interface NotificationsSimProps {
  bills: StudentBill[];
}

interface DeliveryLog {
  id: string;
  studentName: string;
  period: string;
  channel: 'WhatsApp' | 'Email';
  recipient: string;
  status: 'sending' | 'success' | 'failed';
  timestamp: string;
}

export default function NotificationsSim({ bills }: NotificationsSimProps) {
  const [selectedBill, setSelectedBill] = useState<StudentBill | null>(null);
  const [activeTab, setActiveTab] = useState<'wa' | 'email'>('wa');
  
  // Simulated bulk delivery state
  const [isBulkSending, setIsBulkSending] = useState(false);
  const [bulkProgress, setBulkProgress] = useState(0);
  const [currentSendingName, setCurrentSendingName] = useState('');
  const [deliveryLogs, setDeliveryLogs] = useState<DeliveryLog[]>([]);

  // Filtering lists
  const [filterClass, setFilterClass] = useState('All');
  const [filterPeriod, setFilterPeriod] = useState('All');

  // Compute unpaid accounts
  const overdueBills = bills.filter(b => b.status !== 'paid');

  const classesList = Array.from(new Set(bills.map(b => b.studentClass)));
  const periodsList = Array.from(new Set(bills.map(b => b.period)));

  const filteredBills = overdueBills.filter(b => {
    const classMatch = filterClass === 'All' || b.studentClass === filterClass;
    const periodMatch = filterPeriod === 'All' || b.period === filterPeriod;
    return classMatch && periodMatch;
  });

  // Calculate outstanding balance
  const remainingDues = (bill: StudentBill) => bill.amountRequired - bill.amountPaid;

  // Notification content generators
  const getWhatsAppMessage = (bill: StudentBill) => {
    return `Yth. Bapak/Ibu Wali Murid dari *${bill.studentName}* (Kelas ${bill.studentClass}),

Salam hangat dari *Organisasi Komite Sekolah*. Menginfokan perihal kontribusi iuran gotong royong Komite Sekolah untuk mendukung program kerja independen dan pemenuhan sarana belajar siswa:

*Periode:* ${bill.period}
*Jumlah Iuran:* ${formatIDR(bill.amountRequired)}
*Telah Disetorkan:* ${formatIDR(bill.amountPaid)}
*Sisa Kekurangan:* *${formatIDR(remainingDues(bill))}*
*Target Penyerahan:* ${bill.dueDate}

Dukungan iuran ini disalurkan langsung via transfer ke rekening resmi Komite Sekolah:
*Bank Pembangunan Daerah (BPD)*
No. Rekening: *109-28-00382*
a.n. *Komite Sekolah*

_Mohon konfirmasi & kirimkan bukti setoran ke nomor ini setelah bertransaksi._

Terima kasih atas partisipasi aktif Bapak/Ibu sekalian dalam mendukung program Komite dan perlindungan hak-hak siswa.

Salam hormat,
*Pengurus Komite Sekolah*`;
  };

  const getEmailSubject = (bill: StudentBill) => {
    return `[PEMBERITAHUAN] Iuran Gotong Royong Komite Sekolah ${bill.period} - ${bill.studentName}`;
  };

  const getEmailMessage = (bill: StudentBill) => {
    return `Dengan hormat,

Kami mendoakan Bapak/Ibu Wali Murid dalam keadaan sehat selalu.

Menindaklanjuti program kerja independen Organisasi Komite Sekolah, kami menginformasikan perihal status iuran gotong royong dan kontribusi sarana belajar putra/putri Anda:

Detail Siswa:
Nama Siswa     : ${bill.studentName}
Kelas          : ${bill.studentClass}
Nama Wali      : ${bill.parentsName}

Detail Iuran Komite:
Uraian         : Iuran Gotong Royong Komite Sekolah
Periode        : ${bill.period}
Jumlah Wajib   : ${formatIDR(bill.amountRequired)}
Telah Disetor  : ${formatIDR(bill.amountPaid)}
SISA KEKURANGAN: ${formatIDR(remainingDues(bill))} (Diharapkan sebelum ${bill.dueDate})

Metode Penyaluran:
Penyaluran dapat dilakukan melalui transfer ke rekening resmi Komite Sekolah:
- Bank         : Bank Pembangunan Daerah (BPD)
- No. Rekening : 109-28-00382
- Atas Nama    : Komite Sekolah

Pemberitahuan ini disampaikan secara resmi oleh sistem informasi Komite Sekolah. Terima kasih atas kerja sama dan sinergi Bapak/Ibu demi kenyamanan kegiatan belajar mengajar (KBM) siswa.

Hormat kami,
Pengurus Komite Sekolah`;
  };

  // Simulate sending a single notification
  const handleSendSingle = (bill: StudentBill, channel: 'WhatsApp' | 'Email') => {
    const recipient = channel === 'WhatsApp' ? bill.parentsPhone : bill.parentsEmail;
    
    // Create sending log
    const newLog: DeliveryLog = {
      id: `log_${Date.now()}`,
      studentName: bill.studentName,
      period: bill.period,
      channel,
      recipient,
      status: 'sending',
      timestamp: new Date().toLocaleTimeString('id-ID')
    };

    setDeliveryLogs(prev => [newLog, ...prev]);

    // Simulate network delay
    setTimeout(() => {
      setDeliveryLogs(prev => prev.map(log => 
        log.id === newLog.id ? { ...log, status: 'success' } : log
      ));
    }, 1500);
  };

  // Simulate Bulk automated notification dispatch
  const handleBulkSendAll = async () => {
    if (filteredBills.length === 0) {
      alert("Tidak ada tagihan tertunggak untuk dikirim!");
      return;
    }

    if (!window.confirm(`Kirim pengingat otomatis secara masal ke ${filteredBills.length} nomor WhatsApp wali murid terpilih?`)) {
      return;
    }

    setIsBulkSending(true);
    setBulkProgress(0);

    for (let i = 0; i < filteredBills.length; i++) {
      const bill = filteredBills[i];
      setCurrentSendingName(bill.studentName);
      
      // Add log
      const newLog: DeliveryLog = {
        id: `log_bulk_${i}_${Date.now()}`,
        studentName: bill.studentName,
        period: bill.period,
        channel: 'WhatsApp',
        recipient: bill.parentsPhone,
        status: 'sending',
        timestamp: new Date().toLocaleTimeString('id-ID')
      };
      
      setDeliveryLogs(prev => [newLog, ...prev]);

      // Wait 1.1s for each simulation
      await new Promise(resolve => setTimeout(resolve, 1100));

      setDeliveryLogs(prev => prev.map(log => 
        log.id === newLog.id ? { ...log, status: 'success' } : log
      ));

      setBulkProgress(Math.round(((i + 1) / filteredBills.length) * 100));
    }

    setIsBulkSending(false);
    setCurrentSendingName('');
  };

  return (
    <div id="notifications-sim-section" className="space-y-6">
      
      {/* Header info */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 bg-white p-6 rounded-2xl border border-slate-100 shadow-2xs">
        <div className="text-left">
          <h2 className="text-lg font-bold text-slate-900 tracking-tight flex items-center gap-2">
            <Bell className="h-5 w-5 text-indigo-600" />
            Notifikasi Pembayaran Wali Murid
          </h2>
          <p className="text-xs text-slate-505 mt-1">
            Sistem pengiriman pengingat (reminder) otomatis iuran bulanan komite via WhatsApp & Email untuk kemudahan transparansi.
          </p>
        </div>
        <button
          id="btn-send-bulk"
          disabled={isBulkSending || filteredBills.length === 0}
          onClick={handleBulkSendAll}
          className="flex items-center gap-2 bg-indigo-600 hover:bg-indigo-700 disabled:bg-slate-200 text-white px-4 py-2 rounded-xl font-bold text-xs transition-all shadow-xs cursor-pointer"
        >
          {isBulkSending ? (
            <>
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              Mengirim {bulkProgress}%...
            </>
          ) : (
            <>
              <Sparkles className="h-3.5 w-3.5" />
              Simulasi Kirim Masal ({filteredBills.length} Wali)
            </>
          )}
        </button>
      </div>

      {/* Bulk delivery progress box */}
      {isBulkSending && (
        <div className="bg-amber-50 border border-amber-200 rounded-2xl p-5 space-y-3">
          <div className="flex justify-between items-center text-sm">
            <span className="font-bold text-amber-900 flex items-center gap-1.5">
              <RefreshCw className="h-4 w-4 animate-spin text-amber-600" />
              Sistem Auto-Notification Masal Berjalan
            </span>
            <span className="font-bold text-amber-700">{bulkProgress}% Selesai</span>
          </div>
          <div className="text-xs text-gray-600">
            Mengirim iuran pengingat WhatsApp ke wali murid dari <b>{currentSendingName}</b>...
          </div>
          <div className="w-full bg-gray-200 rounded-full h-2 overflow-hidden">
            <div 
              className="bg-amber-500 h-full rounded-full transition-all duration-300"
              style={{ width: `${bulkProgress}%` }}
            ></div>
          </div>
        </div>
      )}

      {/* Roster & Queue splits */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        
        {/* Left pane: Overdue student lists */}
        <div className="lg:col-span-7 bg-white rounded-2xl border border-slate-100 shadow-2xs overflow-hidden flex flex-col justify-between">
          <div>
            <div className="p-5 border-b border-slate-100 flex flex-col sm:flex-row justify-between items-start sm:items-center gap-3 bg-slate-50/50 text-left">
              <h3 className="font-bold text-slate-900 text-xs tracking-wider uppercase">Daftar Tunggakan Aktif</h3>
              {/* Dynamic Period Dropdowns */}
              <div className="flex gap-2 w-full sm:w-auto">
                <select
                  value={filterClass}
                  onChange={(e) => setFilterClass(e.target.value)}
                  className="bg-white border border-slate-100 text-xs text-slate-705 font-bold rounded-lg px-2 py-1 outline-none cursor-pointer"
                >
                  <option value="All">Semua Kelas</option>
                  {classesList.map(c => <option key={c} value={c}>{c}</option>)}
                </select>
                <select
                  value={filterPeriod}
                  onChange={(e) => setFilterPeriod(e.target.value)}
                  className="bg-white border border-slate-100 text-xs text-slate-750 font-bold rounded-lg px-2 py-1 outline-none cursor-pointer"
                >
                  <option value="All">Semua Periode</option>
                  {periodsList.map(p => <option key={p} value={p}>{p}</option>)}
                </select>
              </div>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full border-collapse text-left">
                <thead>
                  <tr className="bg-gray-50/30 border-b border-gray-150 text-[11px] font-bold text-gray-400 uppercase tracking-wider">
                    <th className="px-5 py-3.5">Nama Siswa / Roster</th>
                    <th className="px-5 py-3.5">Periode</th>
                    <th className="px-5 py-3.5 text-right">Tunggakan (Rupiah)</th>
                    <th className="px-5 py-3.5 text-center">Tindakan Kirim</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-150 text-xs text-gray-700">
                  {filteredBills.length > 0 ? (
                    filteredBills.map((bill) => (
                      <tr 
                        key={bill.id} 
                        onClick={() => setSelectedBill(bill)}
                        className={`hover:bg-amber-50/30 transition-colors cursor-pointer ${selectedBill?.id === bill.id ? 'bg-amber-50/50 font-medium' : ''}`}
                      >
                        <td className="px-5 py-4">
                          <div className="font-bold text-gray-900">{bill.studentName}</div>
                          <span className="text-[10px] text-gray-500">{bill.studentClass} • Wali: {bill.parentsName}</span>
                        </td>
                        <td className="px-5 py-4">
                          <span className="bg-gray-105 font-bold px-1.5 py-0.5 rounded text-gray-600 border border-gray-150">
                            {bill.period}
                          </span>
                        </td>
                        <td className="px-5 py-4 text-right">
                          <span className="text-amber-700 font-extrabold text-sm">{formatIDR(remainingDues(bill))}</span>
                        </td>
                        <td className="px-5 py-4 text-center" onClick={(e) => e.stopPropagation()}>
                          <div className="flex items-center justify-center gap-1.5">
                            <button
                              onClick={() => handleSendSingle(bill, 'WhatsApp')}
                              className="p-1 px-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-700 font-semibold rounded-md border border-emerald-100/50 flex items-center gap-1 transition-colors"
                              title="Kirim Peringatan WA"
                            >
                              <MessageSquare className="h-3 w-3" />
                              WA
                            </button>
                            <button
                              onClick={() => handleSendSingle(bill, 'Email')}
                              className="p-1 px-1.5 bg-blue-50 hover:bg-blue-100 text-blue-700 font-semibold rounded-md border border-blue-100/50 flex items-center gap-1 transition-colors"
                              title="Kirim Email"
                            >
                              <Mail className="h-3 w-3" />
                              Email
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={4} className="px-5 py-12 text-center text-gray-400">
                        <CheckCircle2 className="h-10 w-10 mx-auto opacity-40 mb-3 text-emerald-600" />
                        Semua tagihan komite lunas untuk opsi filter ini! Hebat, manajemen terkontrol.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>

          <div className="p-4 bg-gray-50/50 border-t border-gray-150 text-[11px] text-gray-400 text-center font-medium">
            *Pilih salah satu baris siswa untuk menampilkan pra-tinjau template notifikasi di kanan.
          </div>
        </div>

        {/* Right pane: Message Preview Container (Simulated Smartphone) */}
        <div className="lg:col-span-5 flex flex-col gap-6">
          {/* Template Preview Section */}
          <div className="bg-white rounded-2xl border border-slate-100 p-5 shadow-2xs flex-1 flex flex-col justify-between text-left">
            <div>
              <div className="border-b border-slate-100 pb-3 mb-4 flex justify-between items-center">
                <h3 className="font-bold text-slate-900 text-xs tracking-wider uppercase flex items-center gap-1.5">
                  <Smartphone className="h-4 w-4 text-indigo-600" />
                  Pra-tinjau Notifikasi
                </h3>
                {selectedBill && (
                  <div className="flex gap-1 bg-slate-100 p-0.5 rounded-lg text-xs font-bold">
                    <button 
                      onClick={() => setActiveTab('wa')} 
                      className={`px-2 py-1 rounded-md transition-all cursor-pointer text-[11px] ${activeTab === 'wa' ? 'bg-white text-indigo-700 shadow-2xs font-extrabold' : 'text-slate-400 font-semibold'}`}
                    >
                      WhatsApp
                    </button>
                    <button 
                      onClick={() => setActiveTab('email')} 
                      className={`px-2 py-1 rounded-md transition-all cursor-pointer text-[11px] ${activeTab === 'email' ? 'bg-white text-indigo-700 shadow-2xs font-extrabold' : 'text-slate-400 font-semibold'}`}
                    >
                      Email
                    </button>
                  </div>
                )}
              </div>

              {selectedBill ? (
                <div className="space-y-4">
                  
                  {/* Smartphone message frame */}
                  {activeTab === 'wa' ? (
                    <div className="bg-slate-100/70 border border-slate-100 rounded-2xl p-3 max-w-sm mx-auto shadow-inner relative font-sans">
                      {/* WhatsApp styled layout header */}
                      <div className="bg-emerald-600 text-white rounded-t-xl py-2 px-3 text-xs font-bold -mx-3 -mt-3 mb-3 flex items-center justify-between shadow-xs">
                        <span>+62 {selectedBill.parentsPhone} - Online</span>
                        <Smartphone className="h-3 w-3" />
                      </div>
                      
                      <div className="bg-emerald-50 text-gray-800 rounded-xl p-3 text-xs leading-relaxed max-w-xs ml-auto shadow-xs border border-emerald-100 whitespace-pre-wrap font-mono select-all">
                        {getWhatsAppMessage(selectedBill)}
                      </div>
                      <div className="text-[10px] text-right text-slate-400 mt-1">Hari ini • Akurat</div>
                    </div>
                  ) : (
                    <div className="bg-white border border-gray-200 rounded-xl p-4 max-w-md mx-auto shadow-xs text-xs space-y-3 font-sans leading-relaxed">
                      <div className="border-b border-gray-100 pb-2">
                        <div className="text-gray-400"><b>Subject:</b> <span className="text-gray-700 font-semibold">{getEmailSubject(selectedBill)}</span></div>
                        <div className="text-gray-400 mt-1"><b>To:</b> <span className="text-gray-700 font-semibold">{selectedBill.parentsEmail}</span></div>
                      </div>
                      <div className="whitespace-pre-wrap text-gray-700 h-64 overflow-y-auto pr-1">
                        {getEmailMessage(selectedBill)}
                      </div>
                    </div>
                  )}

                  {/* Direct payment dispatch trigger */}
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleSendSingle(selectedBill, activeTab === 'wa' ? 'WhatsApp' : 'Email')}
                      className="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-3 rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs"
                    >
                      <Send className="h-3.5 w-3.5" />
                      Kirim Notifikasi via {activeTab === 'wa' ? 'WhatsApp' : 'Email'}
                    </button>
                  </div>

                </div>
              ) : (
                <div className="text-center py-24 text-gray-400">
                  <Mail className="h-10 w-10 mx-auto opacity-30 mb-3 text-indigo-500" />
                  <p className="text-xs">Silakan pilih salah satu data tagihan siswa di sebelah kiri untuk melihat detail pra-tinjau notifikasi.</p>
                </div>
              )}
            </div>
            
            <div className="bg-gray-50 p-2.5 rounded-lg border border-gray-100 mt-4 text-[11px] text-gray-400 text-center italic">
              Metode notifikasi otomatis ini menjunjung asas kenyamanan wali murid.
            </div>
          </div>

          {/* Delivery progress list log */}
          <div className="bg-white rounded-2xl border border-gray-150 p-5 shadow-xs h-60 flex flex-col">
            <h4 className="font-bold text-gray-800 text-xs uppercase tracking-wider mb-3 flex items-center justify-between pb-2 border-b border-gray-100">
              <span>Log Pengiriman Terbaru</span>
              <span className="text-[10px] text-gray-400 font-normal">Sesi Berjalan</span>
            </h4>
            
            <div className="flex-1 overflow-y-auto space-y-2.5 pr-1">
              {deliveryLogs.length > 0 ? (
                deliveryLogs.map(log => (
                  <div key={log.id} className="flex justify-between items-center bg-gray-50/70 p-2.5 rounded-xl border border-gray-100 text-xs">
                    <div>
                      <span className="font-bold text-gray-800 block">{log.studentName} ({log.period})</span>
                      <span className="text-[10px] text-gray-400 flex items-center gap-1 mt-0.5">
                        {log.channel === 'WhatsApp' ? <MessageSquare className="h-3 w-3 text-emerald-500" /> : <Mail className="h-3 w-3 text-blue-500" />}
                        {log.recipient} • {log.timestamp}
                      </span>
                    </div>

                    <div>
                      {log.status === 'sending' ? (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-700 animate-pulse border border-amber-100">
                          <Loader2 className="h-2.5 w-2.5 animate-spin" /> Mengirim
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold bg-emerald-50 text-emerald-800 border border-emerald-100/50">
                          <CheckCircle2 className="h-2.5 w-2.5" /> Sukses
                        </span>
                      )}
                    </div>
                  </div>
                ))
              ) : (
                <div className="text-center py-12 text-gray-400 text-xs italic">
                  Belum ada laporan aktivitas pengiriman notifikasi terpicu.
                </div>
              )}
            </div>
          </div>
        </div>

      </div>

    </div>
  );
}
