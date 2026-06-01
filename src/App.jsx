import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  LayoutDashboard, Truck, HandCoins, Package, Users, Receipt, Search,
  Plus, Minus, Trash2, X, Pencil, AlertTriangle, TrendingUp,
  Wallet, ArrowDownToLine, CheckCircle2, ChevronRight, PackageCheck,
  RotateCcw, UserPlus, Phone, Printer, Settings, FileText, Upload, FileSpreadsheet, Download, ImagePlus, Camera, LogOut
} from "lucide-react";
import { BarChart, Bar, XAxis, Tooltip, ResponsiveContainer, Cell } from "recharts";
import * as XLSX from "xlsx";
import { supabase, isSupabaseConfigured } from './lib/supabase';
import * as db from './lib/db';
import AuthPage from './AuthPage';
import jsPDF from "jspdf";
import "jspdf-autotable";

/* ============================ Helpers ============================ */
const rupiah = (n) => "Rp " + (Number(n) || 0).toLocaleString("id-ID", { maximumFractionDigits: 0 });
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
const todayKey = (d = new Date()) => d.toISOString().slice(0, 10);
const fmtDate = (iso) =>
  new Date(iso).toLocaleString("id-ID", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
const fmtDateLong = (iso) =>
  new Date(iso).toLocaleString("id-ID", { weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });

const esc = (s) => String(s ?? "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

// Ubah file gambar menjadi thumbnail data URL (resize agar hemat penyimpanan)
function fileToThumb(file, maxDim, cb) {
  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      let w = img.width, h = img.height;
      if (w > h && w > maxDim) { h = Math.round(h * maxDim / w); w = maxDim; }
      else if (h > maxDim) { w = Math.round(w * maxDim / h); h = maxDim; }
      const canvas = document.createElement("canvas");
      canvas.width = w; canvas.height = h;
      canvas.getContext("2d").drawImage(img, 0, 0, w, h);
      try { cb(canvas.toDataURL("image/jpeg", 0.7)); } catch (err) { cb(null); }
    };
    img.onerror = () => cb(null);
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
}

// Bangun dokumen HTML nota mandiri (ukuran F4, multi-halaman, header tabel berulang)
function buildNotaHTML({ type, load }, profile, salesNm) {
  const isMuat = type === "muat";
  const tanggal = isMuat ? load.date : (load.settledDate || load.date);
  const tglStr = fmtDateLong(tanggal);
  const rows = isMuat
    ? load.items.map((i) => ({ name: i.name, price: i.price, qtyAmbil: i.qtyAmbil, jumlah: i.price * i.qtyAmbil }))
    : (load.result || []).map((r) => ({ name: r.name, price: r.price, qtyAmbil: r.qtyAmbil, qtyTerjual: r.qtyTerjual, qtyRetur: r.qtyRetur, jumlah: r.price * r.qtyTerjual }));
  const totalNilai = isMuat ? rows.reduce((s, r) => s + r.jumlah, 0) : (load.setoran ?? rows.reduce((s, r) => s + r.jumlah, 0));
  const totalRetur = isMuat ? 0 : rows.reduce((s, r) => s + r.qtyRetur, 0);
  const colCount = isMuat ? 5 : 7;

  const head = isMuat
    ? '<th class="c" style="width:34px">No</th><th>Nama Barang</th><th class="r">Harga</th><th class="c">Qty</th><th class="r">Jumlah</th>'
    : '<th class="c" style="width:34px">No</th><th>Nama Barang</th><th class="r">Harga</th><th class="c">Bawa</th><th class="c">Laku</th><th class="c">Retur</th><th class="r">Jumlah</th>';

  const body = rows.map((r, idx) => isMuat
    ? `<tr><td class="c">${idx + 1}</td><td>${esc(r.name)}</td><td class="r">${rupiah(r.price)}</td><td class="c">${r.qtyAmbil}</td><td class="r b">${rupiah(r.jumlah)}</td></tr>`
    : `<tr><td class="c">${idx + 1}</td><td>${esc(r.name)}</td><td class="r">${rupiah(r.price)}</td><td class="c">${r.qtyAmbil}</td><td class="c b">${r.qtyTerjual}</td><td class="c muted">${r.qtyRetur}</td><td class="r b">${rupiah(r.jumlah)}</td></tr>`
  ).join("");

  const totalRows = `<tr><td class="r b" colspan="${colCount - 1}">${isMuat ? "Total Nilai Barang Dibawa" : "Total Uang Setoran"}</td><td class="r b">${rupiah(totalNilai)}</td></tr>`
    + (isMuat ? "" : `<tr><td class="r muted" colspan="${colCount - 1}">Total Barang Retur</td><td class="r">${totalRetur} pcs</td></tr>`);

  const note = isMuat
    ? "*Barang diserahkan secara konsinyasi. Pembayaran sesuai jumlah barang yang terjual saat setoran."
    : "*Sisa barang yang tidak terjual telah dikembalikan (retur) ke gudang sesuai rincian di atas.";

  const title = isMuat ? "NOTA MUAT BARANG" : "NOTA SETORAN";
  const leftRole = isMuat ? "Diserahkan oleh," : "Diterima oleh,";
  const rightRole = isMuat ? "Diterima oleh," : "Disetor oleh,";

  return `<!DOCTYPE html><html lang="id"><head><meta charset="utf-8">
<title>${title} ${esc(load.code)}</title>
<style>
  *{box-sizing:border-box}
  @page{ size:215mm 330mm; margin:12mm; }
  body{ font-family:Arial,"Helvetica Neue",sans-serif; color:#1e293b; margin:0; padding:14px; }
  .kop{ display:flex; justify-content:space-between; align-items:flex-start; border-bottom:2px solid #1e293b; padding-bottom:10px; }
  .kop h1{ font-size:20px; margin:0; } .addr{ font-size:11px; color:#64748b; margin:2px 0 0; }
  .title{ text-align:right; } .title h2{ font-size:16px; text-transform:uppercase; letter-spacing:.5px; margin:0; }
  .title .no{ font-size:11px; color:#64748b; margin-top:2px; }
  .meta{ display:flex; justify-content:space-between; margin-top:12px; font-size:13px; }
  .meta .lbl{ color:#64748b; font-size:11px; } .meta .val{ font-weight:700; }
  table{ width:100%; border-collapse:collapse; margin-top:12px; }
  th,td{ border:1px solid #cbd5e1; padding:5px 7px; font-size:12px; vertical-align:top; }
  th{ background:#f1f5f9; text-align:left; font-size:11px; }
  .c{ text-align:center; white-space:nowrap } .r{ text-align:right; white-space:nowrap } .b{ font-weight:700 } .muted{ color:#64748b }
  thead{ display:table-header-group } tfoot{ display:table-row-group }
  tr{ break-inside:avoid; page-break-inside:avoid }
  .note{ font-size:11px; font-style:italic; color:#64748b; margin-top:10px }
  .sign{ display:flex; gap:40px; margin-top:36px; break-inside:avoid; page-break-inside:avoid }
  .sign > div{ flex:1; text-align:center; font-size:13px } .sign .role{ color:#64748b }
  .sign .space{ height:60px } .sign .name{ border-top:1px solid #94a3b8; padding-top:4px; font-weight:700 }
  .sign .sub{ font-size:11px; color:#94a3b8 }
  .bar{ position:fixed; top:0; left:0; right:0; background:#0f172a; padding:8px; text-align:center; }
  .bar button{ background:#10b981; color:#0f172a; border:0; padding:8px 18px; border-radius:8px; font-weight:700; font-size:14px; cursor:pointer; margin:0 4px; }
  .bar .sec{ background:#fff; color:#334155; }
  @media print{ .bar{ display:none } body{ padding:0 } }
</style></head>
<body>
  <div class="bar"><button onclick="window.print()">Cetak Sekarang</button><button class="sec" onclick="window.close()">Tutup</button></div>
  <div style="height:36px"></div>
  <div class="kop">
    <div><h1>${esc(profile.nama || "")}</h1>
      ${profile.alamat ? `<p class="addr">${esc(profile.alamat)}</p>` : ""}
      ${profile.telepon ? `<p class="addr">Telp: ${esc(profile.telepon)}</p>` : ""}
    </div>
    <div class="title"><h2>${title}</h2><div class="no">No: ${esc(load.code)}</div></div>
  </div>
  <div class="meta">
    <div><div class="lbl">Sales</div><div class="val">${esc(salesNm)}</div></div>
    <div style="text-align:right"><div class="lbl">Tanggal</div><div class="val">${tglStr}</div></div>
  </div>
  <table>
    <thead><tr>${head}</tr></thead>
    <tbody>${body}</tbody>
    <tfoot>${totalRows}</tfoot>
  </table>
  <p class="note">${note}</p>
  <div class="sign">
    <div><div class="role">${leftRole}</div><div class="space"></div><div class="name">( ${esc(profile.nama || "")} )</div><div class="sub">Admin / Owner</div></div>
    <div><div class="role">${rightRole}</div><div class="space"></div><div class="name">( ${esc(salesNm)} )</div><div class="sub">Sales</div></div>
  </div>
  <script>window.onload=function(){ setTimeout(function(){ try{ window.focus(); window.print(); }catch(e){} }, 250); };</script>
</body></html>`;
}

// Bangun & unduh PDF nota (F4 215x330mm, multi-halaman)
function generateNotaPdf({ type, load }, profile, salesNm) {
  const isMuat = type === "muat";
  const doc = new jsPDF({ unit: "mm", format: [215, 330], orientation: "portrait" });
  const M = 12, pageW = 215, pageH = 330;

  // Kop
  doc.setFont("helvetica", "bold"); doc.setFontSize(16); doc.setTextColor(20);
  doc.text(profile.nama || "", M, M + 4);
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(110);
  let ky = M + 9;
  if (profile.alamat) { doc.text(profile.alamat, M, ky); ky += 4; }
  if (profile.telepon) { doc.text("Telp: " + profile.telepon, M, ky); ky += 4; }
  doc.setFont("helvetica", "bold"); doc.setFontSize(14); doc.setTextColor(20);
  doc.text(isMuat ? "NOTA MUAT BARANG" : "NOTA SETORAN", pageW - M, M + 4, { align: "right" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(9); doc.setTextColor(110);
  doc.text("No: " + load.code, pageW - M, M + 9, { align: "right" });
  const lineY = Math.max(ky, M + 13);
  doc.setDrawColor(30); doc.setLineWidth(0.5); doc.line(M, lineY, pageW - M, lineY);

  // Meta
  const my = lineY + 6;
  doc.setFontSize(8); doc.setTextColor(120);
  doc.text("Sales", M, my); doc.text("Tanggal", pageW - M, my, { align: "right" });
  doc.setFontSize(11); doc.setTextColor(20); doc.setFont("helvetica", "bold");
  doc.text(salesNm, M, my + 5);
  doc.setFont("helvetica", "normal"); doc.setFontSize(10);
  doc.text(fmtDateLong(isMuat ? load.date : (load.settledDate || load.date)), pageW - M, my + 5, { align: "right" });

  // Data tabel
  const rows = isMuat
    ? load.items.map((i, idx) => [idx + 1, i.name, rupiah(i.price), i.qtyAmbil, rupiah(i.price * i.qtyAmbil)])
    : (load.result || []).map((r, idx) => [idx + 1, r.name, rupiah(r.price), r.qtyAmbil, r.qtyTerjual, r.qtyRetur, rupiah(r.price * r.qtyTerjual)]);
  const totalNilai = isMuat
    ? load.items.reduce((s, i) => s + i.price * i.qtyAmbil, 0)
    : (load.setoran ?? (load.result || []).reduce((s, r) => s + r.price * r.qtyTerjual, 0));
  const totalRetur = isMuat ? 0 : (load.result || []).reduce((s, r) => s + r.qtyRetur, 0);

  const head = isMuat
    ? [["No", "Nama Barang", "Harga", "Qty", "Jumlah"]]
    : [["No", "Nama Barang", "Harga", "Bawa", "Laku", "Retur", "Jumlah"]];
  const foot = [[
    { content: isMuat ? "Total Nilai Barang Dibawa" : "Total Uang Setoran", colSpan: isMuat ? 4 : 6, styles: { halign: "right", fontStyle: "bold" } },
    { content: rupiah(totalNilai), styles: { halign: "right", fontStyle: "bold" } },
  ]];
  if (!isMuat) foot.push([
    { content: "Total Barang Retur", colSpan: 6, styles: { halign: "right", textColor: [120, 120, 120] } },
    { content: totalRetur + " pcs", styles: { halign: "right" } },
  ]);

  doc.autoTable({
    startY: my + 10,
    head, body: rows, foot,
    margin: { left: M, right: M, bottom: M },
    styles: { fontSize: 9, cellPadding: 1.6, lineColor: [203, 213, 225], lineWidth: 0.1, textColor: [30, 41, 59] },
    headStyles: { fillColor: [241, 245, 249], textColor: [71, 85, 105], fontStyle: "bold" },
    footStyles: { fillColor: [255, 255, 255], textColor: [15, 23, 42] },
    columnStyles: isMuat
      ? { 0: { halign: "center", cellWidth: 10 }, 2: { halign: "right" }, 3: { halign: "center" }, 4: { halign: "right" } }
      : { 0: { halign: "center", cellWidth: 10 }, 2: { halign: "right" }, 3: { halign: "center" }, 4: { halign: "center" }, 5: { halign: "center" }, 6: { halign: "right" } },
  });

  // Catatan
  let fy = doc.lastAutoTable.finalY + 6;
  doc.setFont("helvetica", "italic"); doc.setFontSize(8); doc.setTextColor(120);
  const note = isMuat
    ? "*Barang diserahkan secara konsinyasi. Pembayaran sesuai jumlah barang yang terjual saat setoran."
    : "*Sisa barang yang tidak terjual telah dikembalikan (retur) ke gudang sesuai rincian di atas.";
  doc.text(note, M, fy, { maxWidth: pageW - 2 * M });
  fy += 14;

  // Tanda tangan (pindah halaman bila mepet bawah)
  if (fy + 32 > pageH - M) { doc.addPage(); fy = M + 12; }
  const colW = (pageW - 2 * M) / 2;
  const lx = M + colW / 2, rx = M + colW + colW / 2;
  doc.setFont("helvetica", "normal"); doc.setFontSize(10); doc.setTextColor(90);
  doc.text(isMuat ? "Diserahkan oleh," : "Diterima oleh,", lx, fy, { align: "center" });
  doc.text(isMuat ? "Diterima oleh," : "Disetor oleh,", rx, fy, { align: "center" });
  const sy = fy + 22;
  doc.setDrawColor(150); doc.line(lx - 25, sy, lx + 25, sy); doc.line(rx - 25, sy, rx + 25, sy);
  doc.setFont("helvetica", "bold"); doc.setTextColor(20);
  doc.text("( " + (profile.nama || "") + " )", lx, sy + 5, { align: "center" });
  doc.text("( " + salesNm + " )", rx, sy + 5, { align: "center" });
  doc.setFont("helvetica", "normal"); doc.setFontSize(8); doc.setTextColor(140);
  doc.text("Admin / Owner", lx, sy + 10, { align: "center" });
  doc.text("Sales", rx, sy + 10, { align: "center" });

  doc.save((isMuat ? "NotaMuat-" : "NotaSetoran-") + load.code + ".pdf");
}

// Cetak/Simpan PDF: buat PDF langsung; fallback ke tab cetak bila lib gagal dimuat
async function cetakNota(payload, profile, salesNm) {
  try {
    generateNotaPdf(payload, profile, salesNm);
  } catch (e) {
    // fallback: buka tab cetak (tetap bisa "Save as PDF" dari dialog)
    try {
      const html = buildNotaHTML(payload, profile, salesNm);
      const w = window.open("", "_blank");
      if (w && w.document) { w.document.open(); w.document.write(html); w.document.close(); }
      else alert("Gagal membuat PDF. Periksa koneksi internet, lalu coba lagi.");
    } catch (err) {
      alert("Gagal membuat PDF. Periksa koneksi internet, lalu coba lagi.");
    }
  }
}

const DEFAULT_PROFILE = {
  nama: "SnackDistro",
  alamat: "Jl. Distribusi No. 1, Kota Anda",
  telepon: "0812-0000-0000",
};

/* ============================ Root ============================ */
export default function App() {
  // ─── Auth ────────────────────────────────────────────────────────────
  const [session, setSession]     = useState(null);
  const [authLoading, setAuthLoading] = useState(true);

  useEffect(() => {
    if (!isSupabaseConfigured) { setAuthLoading(false); return; }
    supabase.auth.getSession().then(({ data: { session: s } }) => {
      setSession(s); setAuthLoading(false);
    });
    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, s) => {
      setSession(s);
    });
    return () => subscription.unsubscribe();
  }, []);

  if (!isSupabaseConfigured) return <SetupNotice />;

  if (authLoading) return (
    <div className="grid h-screen place-items-center bg-stone-100 text-slate-400"
      style={{ fontFamily: "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif" }}>
      Memuat…
    </div>
  );
  if (!session) return <AuthPage />;

  return <AppShell session={session} />;
}

// Tampil bila VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY belum diisi
function SetupNotice() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-stone-100 p-4"
      style={{ fontFamily: "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif" }}>
      <div className="w-full max-w-md rounded-2xl border border-stone-200 bg-white p-7 shadow-sm">
        <div className="mb-4 grid h-12 w-12 place-items-center rounded-xl bg-amber-100 text-amber-600">
          <Settings size={24} />
        </div>
        <h1 className="text-lg font-extrabold text-slate-900">Supabase belum dikonfigurasi</h1>
        <p className="mt-1 text-sm text-slate-500">
          Aplikasi butuh kredensial Supabase agar login berfungsi. Buat file{' '}
          <code className="rounded bg-stone-100 px-1 font-mono text-xs">.env</code> berisi:
        </p>
        <pre className="mt-3 overflow-x-auto rounded-xl bg-slate-900 p-4 text-xs text-emerald-300">
{`VITE_SUPABASE_URL=https://xxx.supabase.co
VITE_SUPABASE_ANON_KEY=eyJhbGci...`}
        </pre>
        <p className="mt-3 text-sm text-slate-500">
          Di Vercel: <b className="text-slate-700">Settings → Environment Variables</b>, isi kedua nilai
          tersebut lalu <b className="text-slate-700">redeploy</b>. Nilainya ada di Supabase →{' '}
          <b className="text-slate-700">Settings → API</b>.
        </p>
      </div>
    </div>
  );
}

// ─── App utama (hanya dirender jika sudah login) ─────────────────────
function AppShell({ session }) {
  const [view, setView] = useState("dashboard");
  const [products, setProducts] = useState([]);
  const [sales, setSales] = useState([]);
  const [loads, setLoads] = useState([]);
  const [profile, setProfile] = useState(DEFAULT_PROFILE);
  const [nota, setNota] = useState(null); // { type:'muat'|'setoran', load }
  const [ready, setReady] = useState(false);
  const [err, setErr] = useState("");
  const [live, setLive] = useState(false);

  const reload = useCallback(async () => {
    try {
      const d = await db.fetchAll();
      setProducts(d.products); setSales(d.sales); setLoads(d.loads); setProfile(d.profile);
      setErr("");
    } catch (e) {
      setErr(e?.message || String(e));
    }
  }, []);

  useEffect(() => { (async () => { await reload(); setReady(true); })(); }, [reload]);

  // Realtime: dorong perubahan dari perangkat lain seketika (debounced)
  useEffect(() => {
    let timer;
    const ping = () => { clearTimeout(timer); timer = setTimeout(() => reload(), 600); };
    const channel = supabase.channel("db-changes")
      .on("postgres_changes", { event: "*", schema: "public", table: "products" }, ping)
      .on("postgres_changes", { event: "*", schema: "public", table: "salesmen" }, ping)
      .on("postgres_changes", { event: "*", schema: "public", table: "loads" }, ping)
      .on("postgres_changes", { event: "*", schema: "public", table: "load_items" }, ping)
      .on("postgres_changes", { event: "*", schema: "public", table: "businesses" }, ping)
      .subscribe((status) => setLive(status === "SUBSCRIBED"));

    const onVisible = () => { if (document.visibilityState === "visible") reload(); };
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
      supabase.removeChannel(channel);
    };
  }, [reload]);

  const openNota = useCallback((type, load) => setNota({ type, load }), []);

  // Handler operasi data → Supabase, lalu reload
  const productOps = {
    save:      async (p)        => { p.id ? await db.updateProduct(p) : await db.addProduct(p); await reload(); },
    remove:    async (id)       => { await db.deleteProduct(id); await reload(); },
    addStock:  async (id, qty)  => { await db.addStock(id, qty); await reload(); },
    bulkImport: async (rows)    => { const r = await db.bulkUpsertProducts(rows, products); await reload(); return r; },
  };
  const salesOps = {
    save:   async (s)  => { s.id ? await db.updateSalesman(s) : await db.addSalesman(s); await reload(); },
    remove: async (id) => { await db.deleteSalesman(id); await reload(); },
  };
  const createLoad  = async (salesId, items)   => { const row = await db.createLoad(salesId, items); await reload(); return row; };
  const settleLoad  = async (loadId, results)  => { await db.settleLoad(loadId, results); await reload(); };
  const saveProfile = async (p)                => { await db.updateProfile(p); await reload(); };

  const nav = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "muat", label: "Muat Barang", icon: Truck },
    { id: "setoran", label: "Setoran", icon: HandCoins },
    { id: "produk", label: "Produk & Stok", icon: Package },
    { id: "sales", label: "Sales", icon: Users },
    { id: "riwayat", label: "Riwayat", icon: Receipt },
    { id: "pengaturan", label: "Pengaturan", icon: Settings },
  ];
  const openLoads = loads.filter((l) => l.status === "open");

  return (
    <div
      className="h-screen w-full overflow-hidden bg-stone-100 text-slate-800">

      <div className="app-shell flex h-full w-full overflow-hidden">

      <aside className="no-print flex w-16 shrink-0 flex-col items-center gap-1 bg-slate-900 py-5 md:w-60 md:items-stretch md:px-3">
        <div className="mb-6 flex items-center gap-3 px-1 md:px-3">
          <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-500 text-slate-900">
            <Truck size={20} strokeWidth={2.4} />
          </div>
          <div className="hidden md:block">
            <div className="text-sm font-extrabold leading-tight text-white">{profile.nama || "SnackDistro"}</div>
            <div className="text-xs text-slate-400">Kanvas &amp; Setoran</div>
          </div>
        </div>
        {nav.map((n) => {
          const active = view === n.id;
          const badge = n.id === "setoran" && openLoads.length ? openLoads.length : null;
          return (
            <button key={n.id} onClick={() => setView(n.id)}
              className={`relative flex items-center gap-3 rounded-xl px-3 py-3 text-sm font-semibold transition ${
                active ? "bg-emerald-500 text-slate-900" : "text-slate-300 hover:bg-slate-800"}`}>
              <n.icon size={20} strokeWidth={active ? 2.4 : 2} />
              <span className="hidden md:inline">{n.label}</span>
              {badge != null && (
                <span className="tnum absolute right-2 top-2 grid h-5 min-w-5 place-items-center rounded-full bg-amber-400 px-1 text-xs font-bold text-slate-900 md:static md:ml-auto">
                  {badge}
                </span>
              )}
            </button>
          );
        })}

        <div className="mt-auto hidden border-t border-slate-700 px-3 pt-3 pb-1 md:block">
          <div className="mb-1 flex items-center gap-1.5">
            <span className={`h-2 w-2 rounded-full ${live ? "bg-emerald-400 animate-pulse" : "bg-slate-500"}`} />
            <span className="text-xs text-slate-400">{live ? "Realtime aktif" : "Menyambung…"}</span>
          </div>
          <p className="truncate text-xs text-slate-400">{session.user.email}</p>
        </div>
        <button
          onClick={() => supabase.auth.signOut()}
          title="Keluar"
          className="flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-400 hover:bg-slate-800 hover:text-white md:w-full">
          <LogOut size={18} />
          <span className="hidden md:inline">Keluar</span>
        </button>
      </aside>

      <main className="flex-1 overflow-y-auto">
        {err && (
          <div className="m-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">
            Gagal memuat/menyimpan data: {err}
          </div>
        )}
        {!ready ? (
          <div className="grid h-full place-items-center text-slate-400">Memuat data…</div>
        ) : view === "dashboard" ? (
          <Dashboard products={products} loads={loads} sales={sales} go={setView} />
        ) : view === "muat" ? (
          <MuatBarang products={products} sales={sales} loads={loads}
            onCreateLoad={createLoad} go={setView} openNota={openNota} />
        ) : view === "setoran" ? (
          <Setoran loads={loads} sales={sales} products={products}
            onSettle={settleLoad} openNota={openNota} />
        ) : view === "produk" ? (
          <Produk products={products} ops={productOps} />
        ) : view === "sales" ? (
          <SalesPage sales={sales} loads={loads} ops={salesOps} />
        ) : view === "pengaturan" ? (
          <Pengaturan profile={profile} onSaveProfile={saveProfile} />
        ) : (
          <Riwayat loads={loads} sales={sales} openNota={openNota} />
        )}
      </main>
      </div>

      {nota && (
        <NotaOverlay nota={nota} profile={profile}
          salesNm={salesName(sales, nota.load.salesId)} onClose={() => setNota(null)} />
      )}
    </div>
  );
}

const salesName = (sales, id) => sales.find((s) => s.id === id)?.name || "—";
const loadValue = (l) => l.items.reduce((s, i) => s + i.price * i.qtyAmbil, 0);

/* ============================ Dashboard ============================ */
function Dashboard({ products, loads, sales, go }) {
  const today = todayKey();
  const settledToday = loads.filter((l) => l.status === "settled" && l.settledDate?.slice(0, 10) === today);
  const setoranHariIni = settledToday.reduce((s, l) => s + l.setoran, 0);
  const labaHariIni = settledToday.reduce((s, l) => s + l.laba, 0);
  const openLoads = loads.filter((l) => l.status === "open");
  const barangDiJalan = openLoads.reduce((s, l) => s + loadValue(l), 0);
  const lowStock = products.filter((p) => p.stock <= p.minStock);

  const chartData = useMemo(() => {
    const days = [];
    for (let i = 6; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const k = todayKey(d);
      const total = loads.filter((l) => l.status === "settled" && l.settledDate?.slice(0, 10) === k)
        .reduce((s, l) => s + l.setoran, 0);
      days.push({ label: d.toLocaleDateString("id-ID", { weekday: "short" }), total, isToday: k === today });
    }
    return days;
  }, [loads, today]);

  const stats = [
    { label: "Setoran Hari Ini", value: rupiah(setoranHariIni), icon: Wallet, tone: "emerald" },
    { label: "Laba Hari Ini", value: rupiah(labaHariIni), icon: TrendingUp, tone: "sky" },
    { label: "Barang di Jalan", value: rupiah(barangDiJalan), icon: Truck, tone: "amber" },
    { label: "Sales Bawa Barang", value: openLoads.length + " muatan", icon: Users, tone: "violet" },
  ];
  const tone = {
    emerald: "bg-emerald-50 text-emerald-600", sky: "bg-sky-50 text-sky-600",
    amber: "bg-amber-50 text-amber-600", violet: "bg-violet-50 text-violet-600",
  };

  return (
    <div className="mx-auto max-w-6xl p-5 md:p-8">
      <Header title="Dashboard" subtitle="Ringkasan distribusi & setoran" />
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-stone-200 bg-white p-4">
            <div className={`mb-3 grid h-9 w-9 place-items-center rounded-lg ${tone[s.tone]}`}><s.icon size={18} /></div>
            <div className="tnum text-xl font-extrabold text-slate-900">{s.value}</div>
            <div className="text-xs font-medium text-slate-500">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="mt-5 grid gap-5 lg:grid-cols-5">
        <div className="rounded-2xl border border-stone-200 bg-white p-5 lg:col-span-3">
          <div className="mb-4 flex items-center gap-2">
            <TrendingUp size={18} className="text-emerald-600" />
            <h3 className="font-bold text-slate-900">Setoran 7 Hari Terakhir</h3>
          </div>
          <div className="h-52 w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={chartData} margin={{ top: 6, right: 0, left: 0, bottom: 0 }}>
                <XAxis dataKey="label" tickLine={false} axisLine={false} fontSize={12} stroke="#94a3b8" />
                <Tooltip cursor={{ fill: "#f1f5f9" }} formatter={(v) => [rupiah(v), "Setoran"]}
                  contentStyle={{ borderRadius: 12, border: "1px solid #e2e8f0", fontSize: 12 }} />
                <Bar dataKey="total" radius={[6, 6, 0, 0]}>
                  {chartData.map((e, i) => <Cell key={i} fill={e.isToday ? "#10b981" : "#cbd5e1"} />)}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="space-y-5 lg:col-span-2">
          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <div className="mb-3 flex items-center gap-2">
              <Truck size={18} className="text-amber-500" />
              <h3 className="font-bold text-slate-900">Barang di Jalan</h3>
            </div>
            {openLoads.length === 0 ? (
              <p className="py-4 text-center text-sm text-slate-400">Tidak ada barang yang dibawa sales.</p>
            ) : (
              <ul className="space-y-2">
                {openLoads.slice(0, 5).map((l) => (
                  <li key={l.id} className="flex items-center justify-between rounded-lg bg-amber-50 px-3 py-2">
                    <span className="text-sm font-medium text-slate-700">{salesName(sales, l.salesId)}</span>
                    <span className="tnum text-xs font-bold text-amber-700">{rupiah(loadValue(l))}</span>
                  </li>
                ))}
              </ul>
            )}
            <button onClick={() => go("setoran")}
              className="mt-4 w-full rounded-xl bg-slate-900 py-2.5 text-sm font-semibold text-white hover:bg-slate-800">
              Proses Setoran
            </button>
          </div>

          <div className="rounded-2xl border border-stone-200 bg-white p-5">
            <div className="mb-3 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle size={18} className="text-red-500" />
                <h3 className="font-bold text-slate-900">Stok Menipis</h3>
              </div>
              <span className="tnum rounded-full bg-red-100 px-2 py-0.5 text-xs font-bold text-red-600">{lowStock.length}</span>
            </div>
            {lowStock.length === 0 ? (
              <p className="py-2 text-center text-sm text-slate-400">Stok aman 👍</p>
            ) : (
              <ul className="space-y-1.5">
                {lowStock.slice(0, 4).map((p) => (
                  <li key={p.id} className="flex items-center justify-between text-sm">
                    <span className="truncate text-slate-600">{p.name}</span>
                    <span className="tnum ml-2 shrink-0 font-bold text-red-600">sisa {p.stock}</span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================ Muat Barang ============================ */
function MuatBarang({ products, sales, loads, onCreateLoad, go, openNota }) {
  const [salesId, setSalesId] = useState("");
  const [q, setQ] = useState("");
  const [cart, setCart] = useState({});
  const [done, setDone] = useState(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  const filtered = products.filter(
    (p) => p.name.toLowerCase().includes(q.toLowerCase()) || p.sku.toLowerCase().includes(q.toLowerCase())
  );
  const items = Object.entries(cart).map(([id, qty]) => {
    const p = products.find((x) => x.id === id); return p ? { ...p, qty } : null;
  }).filter(Boolean);
  const total = items.reduce((s, i) => s + i.price * i.qty, 0);
  const chosen = sales.find((s) => s.id === salesId);

  const add = (p) => setCart((c) => {
    const cur = c[p.id] || 0; if (cur >= p.stock) return c; return { ...c, [p.id]: cur + 1 };
  });
  const setQty = (id, qty) => {
    const p = products.find((x) => x.id === id);
    const v = Math.max(0, Math.min(qty, p ? p.stock : qty));
    setCart((c) => { const n = { ...c }; if (v <= 0) delete n[id]; else n[id] = v; return n; });
  };

  const submit = async () => {
    if (!salesId || items.length === 0 || busy) return;
    setBusy(true); setErr("");
    try {
      const payload = items.map((i) => ({ product_id: i.id, qty: i.qty }));
      const row = await onCreateLoad(salesId, payload);
      // Susun objek nota dari keranjang + kode dari server
      const localLoad = {
        id: row?.id, code: row?.code || "MUAT", salesId,
        date: row?.loaded_at || new Date().toISOString(), status: "open",
        items: items.map((i) => ({ id: i.id, productId: i.id, name: i.name, price: i.price, cost: i.cost, qtyAmbil: i.qty })),
      };
      setDone(localLoad);
      setCart({}); setSalesId("");
    } catch (e) {
      setErr(e?.message || String(e));
    } finally {
      setBusy(false);
    }
  };

  if (sales.length === 0) {
    return (
      <div className="mx-auto max-w-md p-8 text-center">
        <Users size={40} className="mx-auto mb-3 text-slate-300" />
        <p className="mb-4 text-slate-500">Belum ada data sales. Tambahkan sales dulu sebelum memuat barang.</p>
        <button onClick={() => go("sales")} className="rounded-xl bg-emerald-500 px-5 py-2.5 text-sm font-bold text-slate-900">Ke Halaman Sales</button>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      {/* header + pilih sales (paling atas, tetap) */}
      <div className="shrink-0 border-b border-stone-200 bg-white px-5 py-4 md:px-6">
        <div className="flex flex-wrap items-end gap-3">
          <div className="flex items-center gap-2">
            <div className="grid h-9 w-9 place-items-center rounded-lg bg-emerald-50 text-emerald-600"><Truck size={18} /></div>
            <div>
              <h1 className="text-lg font-extrabold leading-tight text-slate-900">Muat Barang</h1>
              <p className="text-xs text-slate-500">Pilih sales dulu, lalu tambahkan barang</p>
            </div>
          </div>
          <label className="ml-auto w-full sm:w-72">
            <span className="mb-1 block text-xs font-semibold text-slate-500">Pilih Sales</span>
            <select value={salesId} onChange={(e) => setSalesId(e.target.value)}
              className="w-full rounded-xl border-2 border-stone-200 bg-white py-2.5 px-3 text-sm font-semibold outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100">
              <option value="">— pilih sales —</option>
              {sales.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </select>
          </label>
        </div>
      </div>

      {/* area: di layar lebar header/cari/keranjang tetap, hanya grid produk yang scroll */}
      <div className="flex-1 min-h-0 overflow-y-auto lg:overflow-hidden">
        <div className="mx-auto max-w-6xl p-5 md:p-6 lg:grid lg:h-full lg:min-h-0 lg:grid-cols-3 lg:gap-6">
          {/* kolom produk */}
          <div className="lg:col-span-2 lg:flex lg:h-full lg:min-h-0 lg:flex-col">
            <div className="relative mb-4 lg:shrink-0">
              <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
              <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari produk…"
                className="w-full rounded-xl border border-stone-200 bg-white py-3 pl-10 pr-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
            </div>
            <div className="grid auto-rows-min grid-cols-2 gap-3 sm:grid-cols-3 xl:grid-cols-4 lg:min-h-0 lg:flex-1 lg:overflow-y-auto lg:pb-2 lg:pr-1">
              {filtered.map((p) => {
                const inCart = cart[p.id] || 0; const out = p.stock - inCart <= 0;
                return (
                  <button key={p.id} disabled={out} onClick={() => add(p)}
                    className={`flex flex-col rounded-xl border bg-white p-3 text-left transition ${
                      out ? "cursor-not-allowed border-stone-200 opacity-50" : "border-stone-200 hover:border-emerald-400 hover:shadow-sm"}`}>
                    {p.photo && <img src={p.photo} alt="" className="mb-2 h-20 w-full rounded-lg object-cover" />}
                    <div className="mb-2 flex items-start justify-between gap-1">
                      <span className="rounded-md bg-stone-100 px-1.5 py-0.5 text-xs font-semibold text-slate-500">{p.category}</span>
                      <span className={`tnum rounded-md px-1.5 py-0.5 text-xs font-bold ${
                        p.stock <= p.minStock ? "bg-amber-100 text-amber-700" : "bg-emerald-50 text-emerald-600"}`}>{p.stock}</span>
                    </div>
                    <span className="mb-1 line-clamp-2 text-sm font-semibold leading-tight text-slate-800">{p.name}</span>
                    <span className="tnum mt-auto text-sm font-extrabold text-emerald-600">{rupiah(p.price)}</span>
                  </button>
                );
              })}
              {filtered.length === 0 && <p className="col-span-full py-10 text-center text-sm text-slate-400">Produk tidak ditemukan.</p>}
            </div>
          </div>

          {/* kolom keranjang */}
          <div className="mt-6 lg:mt-0 lg:h-full lg:min-h-0">
            <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white lg:flex lg:h-full lg:flex-col">
              <div className="border-b border-stone-100 p-4 lg:shrink-0">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="flex items-center gap-2 font-bold text-slate-900"><Truck size={18} className="text-emerald-600" /> Keranjang Muatan</h3>
                  {items.length > 0 && (
                    <span className="tnum shrink-0 rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-bold text-emerald-600">
                      {items.reduce((s, i) => s + i.qty, 0)} pcs
                    </span>
                  )}
                </div>
                {chosen
                  ? <p className="mt-1 text-sm text-slate-500">untuk <b className="text-slate-700">{chosen.name}</b></p>
                  : <p className="mt-1 text-sm font-medium text-amber-600">Pilih sales dulu di atas ↑</p>}
              </div>

              <div className="lg:min-h-0 lg:flex-1 lg:overflow-y-auto">
              {items.length === 0 ? (
                <div className="px-4 py-10 text-center text-sm text-slate-400">
                  <PackageCheck size={40} className="mx-auto mb-2 text-slate-200" />Klik produk untuk ditambahkan
                </div>
              ) : (
                <ul className="space-y-2 p-4">
                  {items.map((i) => (
                    <li key={i.id} className="rounded-xl border border-stone-100 p-3">
                      <div className="mb-2 flex items-start justify-between gap-2">
                        <span className="text-sm font-semibold text-slate-800">{i.name}</span>
                        <button onClick={() => setQty(i.id, 0)} className="text-slate-300 hover:text-red-500"><Trash2 size={15} /></button>
                      </div>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1">
                          <button onClick={() => setQty(i.id, i.qty - 1)} className="grid h-7 w-7 place-items-center rounded-lg bg-stone-100 text-slate-600 hover:bg-stone-200"><Minus size={14} /></button>
                          <span className="tnum w-8 text-center text-sm font-bold">{i.qty}</span>
                          <button onClick={() => setQty(i.id, i.qty + 1)} disabled={i.qty >= i.stock}
                            className="grid h-7 w-7 place-items-center rounded-lg bg-stone-100 text-slate-600 hover:bg-stone-200 disabled:opacity-40"><Plus size={14} /></button>
                        </div>
                        <span className="tnum text-sm font-bold text-slate-900">{rupiah(i.price * i.qty)}</span>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
              </div>

              <div className="border-t border-stone-100 p-4 lg:shrink-0">
                <div className="mb-3 flex items-center justify-between">
                  <span className="text-sm text-slate-500">Nilai Barang Dibawa</span>
                  <span className="tnum text-2xl font-extrabold text-slate-900">{rupiah(total)}</span>
                </div>
                <button onClick={submit} disabled={!salesId || items.length === 0 || busy}
                  className="w-full rounded-xl bg-emerald-500 py-3 text-sm font-bold text-slate-900 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-slate-400">
                  {busy ? "Menyimpan…" : "Serahkan ke Sales"}
                </button>
                {err && <p className="mt-2 text-center text-xs text-red-500">{err}</p>}
                {!salesId && items.length > 0 && <p className="mt-2 text-center text-xs text-amber-600">Pilih sales dulu.</p>}
              </div>
            </div>
          </div>
        </div>
      </div>

      {done && (
        <Modal title="Barang Diserahkan" onClose={() => setDone(null)}>
          <div className="mb-4 text-center">
            <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-emerald-100"><CheckCircle2 size={32} className="text-emerald-600" /></div>
            <p className="text-sm text-slate-500">{done.code}</p>
            <p className="font-bold text-slate-900">{salesName(sales, done.salesId)} membawa barang senilai</p>
            <p className="tnum text-2xl font-extrabold text-emerald-600">{rupiah(loadValue(done))}</p>
          </div>
          <p className="rounded-xl bg-amber-50 p-3 text-center text-xs text-amber-700">
            Tercatat sebagai <b>barang di jalan</b>. Setoran diproses saat sales kembali.
          </p>
          <div className="mt-4 flex gap-2">
            <button onClick={() => setDone(null)} className="flex-1 rounded-xl bg-stone-100 py-3 text-sm font-bold text-slate-600 hover:bg-stone-200">Selesai</button>
            <button onClick={() => { const d = done; setDone(null); openNota("muat", d); }}
              className="flex flex-1 items-center justify-center gap-2 rounded-xl bg-slate-900 py-3 text-sm font-bold text-white hover:bg-slate-800">
              <Printer size={16} /> Cetak Nota
            </button>
          </div>
        </Modal>
      )}
    </div>
  );
}

/* ============================ Setoran ============================ */
function Setoran({ loads, sales, products, onSettle, openNota }) {
  const [active, setActive] = useState(null);
  const open = loads.filter((l) => l.status === "open");

  const doSettle = async ({ results, setoran, laba, notaRows }) => {
    await onSettle(active.id, results);
    const settledLoad = { ...active, status: "settled", settledDate: new Date().toISOString(), result: notaRows, setoran, laba };
    setActive(null);
    openNota("setoran", settledLoad);
  };

  return (
    <div className="mx-auto max-w-4xl p-5 md:p-8">
      <Header title="Setoran" subtitle="Proses uang setoran & retur dari sales" />
      {open.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white py-16 text-center text-sm text-slate-400">
          Tidak ada muatan yang menunggu setoran.
        </div>
      ) : (
        <ul className="space-y-2">
          {open.map((l) => (
            <li key={l.id} className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white p-2 pr-3 transition hover:border-emerald-400">
              <button onClick={() => setActive(l)} className="flex flex-1 items-center gap-3 p-2 text-left">
                <div className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-amber-50 text-amber-600"><Truck size={20} /></div>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-bold text-slate-800">{salesName(sales, l.salesId)}</div>
                  <div className="text-xs text-slate-400">{l.code} · {fmtDate(l.date)} · {l.items.length} jenis</div>
                </div>
                <div className="text-right">
                  <div className="tnum font-extrabold text-slate-900">{rupiah(loadValue(l))}</div>
                  <div className="text-xs text-slate-400">nilai dibawa</div>
                </div>
              </button>
              <button onClick={() => openNota("muat", l)} title="Cetak nota muat"
                className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-stone-100 text-slate-500 hover:bg-stone-200">
                <Printer size={16} />
              </button>
              <ChevronRight size={18} className="shrink-0 text-slate-300" />
            </li>
          ))}
        </ul>
      )}
      {active && (
        <SetoranModal load={active} salesNm={salesName(sales, active.salesId)}
          onClose={() => setActive(null)} onSettle={doSettle} />
      )}
    </div>
  );
}

function SetoranModal({ load, salesNm, onClose, onSettle }) {
  const [sold, setSold] = useState(() => Object.fromEntries(load.items.map((i) => [i.id, i.qtyAmbil])));
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const setS = (id, v, max) => setSold((s) => ({ ...s, [id]: Math.max(0, Math.min(Number(v) || 0, max)) }));

  const rows = load.items.map((i) => {
    const terjual = sold[i.id] ?? 0;
    const retur = i.qtyAmbil - terjual;
    return { ...i, qtyTerjual: terjual, qtyRetur: retur, subtotal: terjual * i.price, laba: terjual * (i.price - i.cost) };
  });
  const setoran = rows.reduce((s, r) => s + r.subtotal, 0);
  const laba = rows.reduce((s, r) => s + r.laba, 0);
  const totalRetur = rows.reduce((s, r) => s + r.qtyRetur, 0);

  return (
    <Modal title="Proses Setoran" onClose={onClose} wide>
      <div className="mb-3 flex items-center justify-between rounded-xl bg-stone-50 px-4 py-3">
        <div><div className="text-sm font-bold text-slate-800">{salesNm}</div><div className="text-xs text-slate-400">{load.code}</div></div>
        <span className="rounded-lg bg-white px-2.5 py-1 text-xs font-semibold text-slate-500">{fmtDate(load.date)}</span>
      </div>

      <div className="mb-2 grid grid-cols-12 gap-2 px-1 text-xs font-bold uppercase tracking-wide text-slate-400">
        <div className="col-span-5">Barang</div>
        <div className="col-span-2 text-center">Dibawa</div>
        <div className="col-span-3 text-center">Terjual</div>
        <div className="col-span-2 text-right">Setor</div>
      </div>
      <ul className="max-h-72 space-y-1.5 overflow-y-auto">
        {rows.map((r) => (
          <li key={r.id} className="grid grid-cols-12 items-center gap-2 rounded-xl border border-stone-100 px-2 py-2">
            <div className="col-span-5">
              <div className="text-sm font-semibold leading-tight text-slate-800">{r.name}</div>
              <div className="tnum text-xs text-slate-400">{rupiah(r.price)} · retur {r.qtyRetur}</div>
            </div>
            <div className="tnum col-span-2 text-center text-sm font-bold text-slate-500">{r.qtyAmbil}</div>
            <div className="col-span-3 flex items-center justify-center gap-1">
              <button onClick={() => setS(r.id, r.qtyTerjual - 1, r.qtyAmbil)} className="grid h-6 w-6 place-items-center rounded bg-stone-100 text-slate-600"><Minus size={12} /></button>
              <input value={r.qtyTerjual} onChange={(e) => setS(r.id, e.target.value.replace(/\D/g, ""), r.qtyAmbil)}
                inputMode="numeric" className="tnum w-10 rounded border border-stone-200 py-1 text-center text-sm font-bold outline-none focus:border-emerald-500" />
              <button onClick={() => setS(r.id, r.qtyTerjual + 1, r.qtyAmbil)} className="grid h-6 w-6 place-items-center rounded bg-stone-100 text-slate-600"><Plus size={12} /></button>
            </div>
            <div className="tnum col-span-2 text-right text-sm font-bold text-slate-900">{rupiah(r.subtotal)}</div>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={() => setSold(Object.fromEntries(load.items.map((i) => [i.id, i.qtyAmbil])))}
          className="flex items-center gap-1 rounded-lg bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-600"><PackageCheck size={14} /> Semua Laku</button>
        <button onClick={() => setSold(Object.fromEntries(load.items.map((i) => [i.id, 0])))}
          className="flex items-center gap-1 rounded-lg bg-stone-100 px-3 py-1.5 text-xs font-semibold text-slate-500"><RotateCcw size={14} /> Reset (retur semua)</button>
      </div>

      <div className="mt-4 space-y-1 rounded-xl bg-slate-900 p-4 text-white">
        <div className="flex justify-between text-sm"><span className="text-slate-300">Total Retur ke Gudang</span><span className="tnum font-semibold">{totalRetur} pcs</span></div>
        <div className="flex justify-between text-sm"><span className="text-slate-300">Estimasi Laba</span><span className="tnum font-semibold text-emerald-400">{rupiah(laba)}</span></div>
        <div className="mt-1 flex items-center justify-between border-t border-slate-700 pt-2">
          <span className="font-bold">Uang Setoran</span><span className="tnum text-2xl font-extrabold text-emerald-400">{rupiah(setoran)}</span>
        </div>
      </div>

      <button
        disabled={busy}
        onClick={async () => {
          if (busy) return;
          setBusy(true); setErr("");
          try {
            await onSettle({
              results: rows.map((r) => ({ item_id: r.id, qty_terjual: r.qtyTerjual })),
              setoran, laba,
              notaRows: rows.map(({ id, name, price, cost, qtyAmbil, qtyTerjual, qtyRetur }) =>
                ({ id, name, price, cost, qtyAmbil, qtyTerjual, qtyRetur })),
            });
          } catch (e) {
            setErr(e?.message || String(e)); setBusy(false);
          }
        }}
        className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-slate-900 hover:bg-emerald-400 disabled:opacity-60">
        <Printer size={16} /> {busy ? "Menyimpan…" : "Terima Setoran & Cetak Nota"}
      </button>
      {err && <p className="mt-2 text-center text-xs text-red-500">{err}</p>}
    </Modal>
  );
}

/* ============================ Produk & Stok ============================ */
function Produk({ products, ops }) {
  const [q, setQ] = useState("");
  const [editing, setEditing] = useState(null);
  const [restock, setRestock] = useState(null);
  const [importing, setImporting] = useState(false);
  const filtered = products.filter(
    (p) => p.name.toLowerCase().includes(q.toLowerCase()) || p.sku.toLowerCase().includes(q.toLowerCase()) || p.category.toLowerCase().includes(q.toLowerCase())
  );
  const save = async (d) => { await ops.save(d); setEditing(null); };
  const remove = (id) => { if (confirm("Hapus produk ini?")) ops.remove(id); };
  const addStock = async (id, qty) => { await ops.addStock(id, qty); setRestock(null); };
  const bulkImport = (rows) => ops.bulkImport(rows); // async → mengembalikan {added, updated}

  return (
    <div className="mx-auto max-w-6xl p-5 md:p-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <Header title="Produk & Stok" subtitle="Katalog snack & stok gudang" compact noMargin />
        <div className="flex gap-2">
          <button onClick={() => setImporting(true)} className="flex items-center gap-2 rounded-xl bg-white px-4 py-2.5 text-sm font-bold text-slate-700 ring-1 ring-stone-200 hover:bg-stone-50"><Upload size={18} /> Import Excel</button>
          <button onClick={() => setEditing({})} className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-900 hover:bg-emerald-400"><Plus size={18} /> Produk Baru</button>
        </div>
      </div>
      <div className="relative mb-4">
        <Search size={18} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Cari produk…"
          className="w-full rounded-xl border border-stone-200 bg-white py-3 pl-10 pr-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100" />
      </div>
      <div className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
        <div className="hidden grid-cols-12 gap-2 border-b border-stone-100 bg-stone-50 px-4 py-3 text-xs font-bold uppercase tracking-wide text-slate-400 md:grid">
          <div className="col-span-4">Produk</div><div className="col-span-2">Kategori</div>
          <div className="col-span-2 text-right">Harga</div><div className="col-span-2 text-center">Stok</div><div className="col-span-2 text-right">Aksi</div>
        </div>
        <ul className="divide-y divide-stone-100">
          {filtered.map((p) => {
            const low = p.stock <= p.minStock;
            return (
              <li key={p.id} className="grid grid-cols-12 items-center gap-2 px-4 py-3 text-sm">
                <div className="col-span-12 flex items-center gap-3 md:col-span-4">
                  {p.photo
                    ? <img src={p.photo} alt="" className="h-10 w-10 shrink-0 rounded-lg object-cover ring-1 ring-stone-200" />
                    : <div className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-stone-100 text-slate-300"><Camera size={16} /></div>}
                  <div className="min-w-0">
                    <div className="truncate font-semibold text-slate-800">{p.name}</div>
                    <div className="text-xs text-slate-400">{p.sku} · modal {rupiah(p.cost)}</div>
                  </div>
                </div>
                <div className="col-span-6 md:col-span-2"><span className="rounded-md bg-stone-100 px-2 py-0.5 text-xs font-medium text-slate-500">{p.category}</span></div>
                <div className="tnum col-span-6 text-right font-bold text-slate-800 md:col-span-2">{rupiah(p.price)}</div>
                <div className="col-span-6 md:col-span-2 md:text-center">
                  <span className={`tnum inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-bold ${low ? "bg-amber-100 text-amber-700" : "bg-emerald-50 text-emerald-600"}`}>
                    {low && <AlertTriangle size={12} />} {p.stock}
                  </span>
                </div>
                <div className="col-span-6 flex justify-end gap-1 md:col-span-2">
                  <button onClick={() => setRestock(p)} title="Tambah stok" className="grid h-8 w-8 place-items-center rounded-lg bg-emerald-50 text-emerald-600 hover:bg-emerald-100"><ArrowDownToLine size={15} /></button>
                  <button onClick={() => setEditing(p)} title="Edit" className="grid h-8 w-8 place-items-center rounded-lg bg-stone-100 text-slate-500 hover:bg-stone-200"><Pencil size={15} /></button>
                  <button onClick={() => remove(p.id)} title="Hapus" className="grid h-8 w-8 place-items-center rounded-lg bg-red-50 text-red-500 hover:bg-red-100"><Trash2 size={15} /></button>
                </div>
              </li>
            );
          })}
          {filtered.length === 0 && <li className="py-10 text-center text-sm text-slate-400">Tidak ada produk.</li>}
        </ul>
      </div>
      {editing && <ProductModal product={editing} onSave={save} onClose={() => setEditing(null)} />}
      {restock && <RestockModal product={restock} onAdd={addStock} onClose={() => setRestock(null)} />}
      {importing && <ImportModal onImport={bulkImport} onClose={() => setImporting(false)} />}
    </div>
  );
}

function ProductModal({ product, onSave, onClose }) {
  const [f, setF] = useState({
    id: product.id, name: product.name || "", sku: product.sku || "", category: product.category || "",
    price: product.price || "", cost: product.cost || "", stock: product.stock ?? "", minStock: product.minStock ?? "",
    photo: product.photo || "",
  });
  const set = (k) => (e) => {
    const v = ["price", "cost", "stock", "minStock"].includes(k) ? e.target.value.replace(/\D/g, "") : e.target.value;
    setF((s) => ({ ...s, [k]: v }));
  };
  const pickPhoto = (e) => {
    const file = e.target.files?.[0];
    if (file) fileToThumb(file, 400, (url) => url && setF((s) => ({ ...s, photo: url })));
  };
  const valid = f.name.trim() && f.price !== "";
  const submit = () => valid && onSave({
    id: f.id, name: f.name.trim(), sku: f.sku.trim() || "—", category: f.category.trim() || "Umum",
    price: Number(f.price) || 0, cost: Number(f.cost) || 0, stock: Number(f.stock) || 0, minStock: Number(f.minStock) || 0,
    photo: f.photo || "",
  });
  return (
    <Modal title={product.id ? "Edit Produk" : "Produk Baru"} onClose={onClose}>
      <div className="space-y-3">
        {/* foto (opsional) */}
        <div className="flex items-center gap-3">
          {f.photo ? (
            <img src={f.photo} alt="" className="h-16 w-16 rounded-xl object-cover ring-1 ring-stone-200" />
          ) : (
            <div className="grid h-16 w-16 place-items-center rounded-xl bg-stone-100 text-slate-300"><Camera size={22} /></div>
          )}
          <div className="flex flex-col gap-1">
            <label className="flex cursor-pointer items-center gap-2 rounded-lg bg-stone-100 px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-stone-200">
              <ImagePlus size={14} /> {f.photo ? "Ganti Foto" : "Tambah Foto"}
              <input type="file" accept="image/*" className="hidden" onChange={pickPhoto} />
            </label>
            {f.photo && <button onClick={() => setF((s) => ({ ...s, photo: "" }))} className="text-left text-xs font-medium text-red-500 hover:underline">Hapus foto</button>}
            <span className="text-xs text-slate-400">Opsional</span>
          </div>
        </div>
        <Field label="Nama Produk"><input className={inp} value={f.name} onChange={set("name")} placeholder="cth. Keripik Singkong" /></Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="SKU / Kode"><input className={inp} value={f.sku} onChange={set("sku")} placeholder="KRP-01" /></Field>
          <Field label="Kategori"><input className={inp} value={f.category} onChange={set("category")} placeholder="Keripik" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Harga Jual"><input className={inp + " tnum"} value={f.price} onChange={set("price")} inputMode="numeric" placeholder="0" /></Field>
          <Field label="Harga Modal"><input className={inp + " tnum"} value={f.cost} onChange={set("cost")} inputMode="numeric" placeholder="0" /></Field>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Stok Gudang"><input className={inp + " tnum"} value={f.stock} onChange={set("stock")} inputMode="numeric" placeholder="0" /></Field>
          <Field label="Min. Stok (alert)"><input className={inp + " tnum"} value={f.minStock} onChange={set("minStock")} inputMode="numeric" placeholder="0" /></Field>
        </div>
      </div>
      <button onClick={submit} disabled={!valid} className="mt-5 w-full rounded-xl bg-emerald-500 py-3 text-sm font-bold text-slate-900 hover:bg-emerald-400 disabled:bg-stone-200 disabled:text-slate-400">Simpan</button>
    </Modal>
  );
}

function RestockModal({ product, onAdd, onClose }) {
  const [qty, setQty] = useState(""); const n = Number(qty) || 0;
  return (
    <Modal title="Tambah Stok Gudang" onClose={onClose}>
      <p className="mb-1 text-sm font-semibold text-slate-800">{product.name}</p>
      <p className="mb-4 text-xs text-slate-400">Stok saat ini: <span className="tnum font-bold text-slate-600">{product.stock}</span></p>
      <Field label="Jumlah masuk"><input autoFocus className={inp + " tnum"} value={qty} inputMode="numeric" onChange={(e) => setQty(e.target.value.replace(/\D/g, ""))} placeholder="0" /></Field>
      {n > 0 && <p className="mt-2 text-sm text-slate-500">Stok menjadi <span className="tnum font-bold text-emerald-600">{product.stock + n}</span></p>}
      <button onClick={() => n > 0 && onAdd(product.id, n)} disabled={n <= 0} className="mt-5 w-full rounded-xl bg-emerald-500 py-3 text-sm font-bold text-slate-900 hover:bg-emerald-400 disabled:bg-stone-200 disabled:text-slate-400">Tambahkan</button>
    </Modal>
  );
}

/* ============================ Import Excel ============================ */
function ImportModal({ onImport, onClose }) {
  const [rows, setRows] = useState(null);   // baris valid hasil parse
  const [raw, setRaw] = useState(0);        // jumlah baris terbaca
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState("");
  const [result, setResult] = useState(null); // {added, updated}
  const [importingNow, setImportingNow] = useState(false);

  const pick = (obj, aliases) => {
    for (const a of aliases) {
      const key = Object.keys(obj).find((k) => String(k).trim().toLowerCase() === a);
      if (key !== undefined && String(obj[key]).trim() !== "") return obj[key];
    }
    return "";
  };
  const num = (v) => Number(String(v).replace(/[^\d]/g, "")) || 0;
  const mapRow = (r) => {
    const name = String(pick(r, ["nama", "nama barang", "name", "produk", "barang"])).trim();
    if (!name) return null;
    return {
      name,
      sku: String(pick(r, ["sku", "kode", "kode barang"])).trim(),
      category: String(pick(r, ["kategori", "category"])).trim() || "Umum",
      price: num(pick(r, ["harga", "harga jual", "price", "jual"])),
      cost: num(pick(r, ["modal", "harga modal", "cost", "hpp"])),
      stock: num(pick(r, ["stok", "stock", "qty", "jumlah", "stok awal"])),
      minStock: num(pick(r, ["min stok", "min. stok", "minstock", "minimal stok", "min stock", "stok minimal", "minimum"])),
    };
  };

  const handleFile = (file) => {
    if (!file) return;
    setError(""); setResult(null); setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (e) => {
      try {
        const wb = XLSX.read(new Uint8Array(e.target.result), { type: "array" });
        const ws = wb.Sheets[wb.SheetNames[0]];
        const json = XLSX.utils.sheet_to_json(ws, { defval: "" });
        const mapped = json.map(mapRow).filter(Boolean);
        setRaw(json.length);
        setRows(mapped);
        if (mapped.length === 0) setError("Tidak ada baris valid. Pastikan ada kolom 'Nama' dan 'Harga'.");
      } catch (err) {
        setError("Gagal membaca file. Pastikan format .xlsx, .xls, atau .csv yang benar.");
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const downloadTemplate = () => {
    const aoa = [
      ["Nama", "SKU", "Kategori", "Harga", "Modal", "Stok", "Min Stok"],
      ["Keripik Singkong Balado", "KRP-BL", "Keripik", 9000, 6500, 120, 30],
      ["Kacang Telur 250g", "KCG-250", "Kacang", 12000, 9000, 80, 24],
    ];
    const ws = XLSX.utils.aoa_to_sheet(aoa);
    ws["!cols"] = [{ wch: 28 }, { wch: 12 }, { wch: 14 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 10 }];
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Produk");
    const out = XLSX.write(wb, { bookType: "xlsx", type: "array" });
    const blob = new Blob([out], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "template-produk.xlsx";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 3000);
  };

  const doImport = async () => {
    if (!rows || rows.length === 0 || importingNow) return;
    setImportingNow(true);
    try { setResult(await onImport(rows)); }
    catch (e) { setError(e?.message || String(e)); }
    finally { setImportingNow(false); }
  };

  return (
    <Modal title="Import Produk dari Excel" onClose={onClose} wide>
      {result ? (
        <div className="text-center">
          <div className="mx-auto mb-3 grid h-14 w-14 place-items-center rounded-full bg-emerald-100"><CheckCircle2 size={32} className="text-emerald-600" /></div>
          <p className="font-bold text-slate-900">Import selesai!</p>
          <p className="mt-1 text-sm text-slate-500">
            <b className="tnum text-emerald-600">{result.added}</b> produk baru ditambahkan,{" "}
            <b className="tnum text-sky-600">{result.updated}</b> diperbarui.
          </p>
          <button onClick={onClose} className="mt-5 w-full rounded-xl bg-slate-900 py-3 text-sm font-bold text-white hover:bg-slate-800">Selesai</button>
        </div>
      ) : (
        <>
          <div className="mb-4 rounded-xl bg-stone-50 p-3 text-xs text-slate-500">
            Kolom yang dikenali: <b>Nama</b> (wajib), <b>SKU</b>, <b>Kategori</b>, <b>Harga</b>, <b>Modal</b>, <b>Stok</b>, <b>Min Stok</b>.
            Produk dengan SKU sama akan <b>diperbarui</b>, sisanya ditambah baru.
          </div>

          <button onClick={downloadTemplate} className="mb-3 flex w-full items-center justify-center gap-2 rounded-xl bg-white py-2.5 text-sm font-semibold text-slate-700 ring-1 ring-stone-200 hover:bg-stone-50">
            <Download size={16} /> Unduh Template Excel
          </button>

          <label className="flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-stone-300 bg-stone-50 px-4 py-8 text-center hover:border-emerald-400 hover:bg-emerald-50">
            <FileSpreadsheet size={32} className="text-emerald-500" />
            <span className="text-sm font-semibold text-slate-700">{fileName || "Pilih file Excel / CSV"}</span>
            <span className="text-xs text-slate-400">Format .xlsx, .xls, atau .csv</span>
            <input type="file" accept=".xlsx,.xls,.csv" className="hidden"
              onChange={(e) => handleFile(e.target.files?.[0])} />
          </label>

          {error && <p className="mt-3 rounded-lg bg-red-50 p-3 text-sm text-red-600">{error}</p>}

          {rows && rows.length > 0 && (
            <div className="mt-4">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-semibold text-slate-700">Pratinjau</span>
                <span className="tnum text-slate-500">{rows.length} dari {raw} baris valid</span>
              </div>
              <div className="max-h-56 overflow-auto rounded-xl border border-stone-200">
                <table className="w-full border-collapse text-xs">
                  <thead className="sticky top-0 bg-stone-100">
                    <tr>
                      <th className="px-2 py-1.5 text-left font-bold text-slate-500">Nama</th>
                      <th className="px-2 py-1.5 text-left font-bold text-slate-500">SKU</th>
                      <th className="whitespace-nowrap px-2 py-1.5 text-right font-bold text-slate-500">Harga</th>
                      <th className="px-2 py-1.5 text-center font-bold text-slate-500">Stok</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.slice(0, 50).map((r, i) => (
                      <tr key={i} className="border-t border-stone-100">
                        <td className="px-2 py-1.5 text-slate-700">{r.name}</td>
                        <td className="px-2 py-1.5 text-slate-400">{r.sku || "—"}</td>
                        <td className="tnum whitespace-nowrap px-2 py-1.5 text-right text-slate-700">{rupiah(r.price)}</td>
                        <td className="tnum px-2 py-1.5 text-center text-slate-700">{r.stock}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {rows.length > 50 && <p className="mt-1 text-center text-xs text-slate-400">…dan {rows.length - 50} baris lainnya</p>}
              <button onClick={doImport} className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-slate-900 hover:bg-emerald-400">
                <Upload size={16} /> {importingNow ? "Mengimpor…" : `Import ${rows.length} Produk`}
              </button>
            </div>
          )}
        </>
      )}
    </Modal>
  );
}

/* ============================ Sales ============================ */
function SalesPage({ sales, loads, ops }) {
  const [editing, setEditing] = useState(null);
  const outstanding = (id) => loads.filter((l) => l.status === "open" && l.salesId === id).reduce((s, l) => s + loadValue(l), 0);
  const save = async (d) => { await ops.save(d); setEditing(null); };
  const remove = (id) => { if (confirm("Hapus sales ini?")) ops.remove(id); };

  return (
    <div className="mx-auto max-w-3xl p-5 md:p-8">
      <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <Header title="Sales" subtitle="Data salesman & barang yang sedang dibawa" compact noMargin />
        <button onClick={() => setEditing({})} className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2.5 text-sm font-bold text-slate-900 hover:bg-emerald-400"><UserPlus size={18} /> Sales Baru</button>
      </div>
      {sales.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white py-16 text-center text-sm text-slate-400">Belum ada sales.</div>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2">
          {sales.map((s) => {
            const out = outstanding(s.id);
            return (
              <li key={s.id} className="rounded-2xl border border-stone-200 bg-white p-4">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-3">
                    <div className="grid h-11 w-11 place-items-center rounded-full bg-slate-900 text-sm font-bold text-white">{s.name.slice(0, 2).toUpperCase()}</div>
                    <div>
                      <div className="font-bold text-slate-800">{s.name}</div>
                      <div className="flex items-center gap-1 text-xs text-slate-400"><Phone size={11} /> {s.phone || "—"}</div>
                    </div>
                  </div>
                  <div className="flex gap-1">
                    <button onClick={() => setEditing(s)} className="grid h-7 w-7 place-items-center rounded-lg bg-stone-100 text-slate-500 hover:bg-stone-200"><Pencil size={13} /></button>
                    <button onClick={() => remove(s.id)} className="grid h-7 w-7 place-items-center rounded-lg bg-red-50 text-red-500 hover:bg-red-100"><Trash2 size={13} /></button>
                  </div>
                </div>
                <div className={`mt-3 flex items-center justify-between rounded-xl px-3 py-2 text-sm ${out > 0 ? "bg-amber-50" : "bg-stone-50"}`}>
                  <span className="text-slate-500">Barang di jalan</span>
                  <span className={`tnum font-bold ${out > 0 ? "text-amber-700" : "text-slate-400"}`}>{rupiah(out)}</span>
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {editing && <SalesModal sales={editing} onSave={save} onClose={() => setEditing(null)} />}
    </div>
  );
}

function SalesModal({ sales, onSave, onClose }) {
  const [name, setName] = useState(sales.name || "");
  const [phone, setPhone] = useState(sales.phone || "");
  return (
    <Modal title={sales.id ? "Edit Sales" : "Sales Baru"} onClose={onClose}>
      <div className="space-y-3">
        <Field label="Nama Sales"><input autoFocus className={inp} value={name} onChange={(e) => setName(e.target.value)} placeholder="cth. Budi Santoso" /></Field>
        <Field label="No. HP"><input className={inp} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="0812-xxxx-xxxx" /></Field>
      </div>
      <button onClick={() => name.trim() && onSave({ id: sales.id, name: name.trim(), phone: phone.trim() })}
        disabled={!name.trim()} className="mt-5 w-full rounded-xl bg-emerald-500 py-3 text-sm font-bold text-slate-900 hover:bg-emerald-400 disabled:bg-stone-200 disabled:text-slate-400">Simpan</button>
    </Modal>
  );
}

/* ============================ Riwayat ============================ */
function Riwayat({ loads, sales, openNota }) {
  const [open, setOpen] = useState(null);
  const settled = loads.filter((l) => l.status === "settled").sort((a, b) => new Date(b.settledDate) - new Date(a.settledDate));
  const totalSetoran = settled.reduce((s, l) => s + l.setoran, 0);
  const totalLaba = settled.reduce((s, l) => s + l.laba, 0);

  return (
    <div className="mx-auto max-w-3xl p-5 md:p-8">
      <Header title="Riwayat Setoran" subtitle={`${settled.length} selesai · setoran ${rupiah(totalSetoran)} · laba ${rupiah(totalLaba)}`} />
      {settled.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-stone-300 bg-white py-16 text-center text-sm text-slate-400">Belum ada setoran selesai.</div>
      ) : (
        <ul className="space-y-2">
          {settled.map((l) => {
            const expanded = open === l.id;
            return (
              <li key={l.id} className="overflow-hidden rounded-2xl border border-stone-200 bg-white">
                <button onClick={() => setOpen(expanded ? null : l.id)} className="flex w-full items-center gap-3 p-4 text-left">
                  <div className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-emerald-50 text-emerald-600"><HandCoins size={18} /></div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-bold text-slate-800">{salesName(sales, l.salesId)}</div>
                    <div className="text-xs text-slate-400">{l.code} · setor {fmtDate(l.settledDate)}</div>
                  </div>
                  <div className="text-right">
                    <div className="tnum font-extrabold text-slate-900">{rupiah(l.setoran)}</div>
                    <div className="tnum text-xs text-emerald-600">laba {rupiah(l.laba)}</div>
                  </div>
                </button>
                {expanded && (
                  <div className="border-t border-stone-100 bg-stone-50 p-4 text-sm">
                    <div className="mb-1 grid grid-cols-12 text-xs font-bold uppercase text-slate-400">
                      <span className="col-span-6">Barang</span><span className="col-span-2 text-center">Bawa</span>
                      <span className="col-span-2 text-center">Laku</span><span className="col-span-2 text-center">Retur</span>
                    </div>
                    {l.result.map((r) => (
                      <div key={r.id} className="grid grid-cols-12 py-0.5 text-slate-600">
                        <span className="col-span-6">{r.name}</span>
                        <span className="tnum col-span-2 text-center">{r.qtyAmbil}</span>
                        <span className="tnum col-span-2 text-center font-semibold text-emerald-600">{r.qtyTerjual}</span>
                        <span className="tnum col-span-2 text-center text-slate-400">{r.qtyRetur}</span>
                      </div>
                    ))}
                    <div className="mt-3 flex gap-2">
                      <button onClick={() => openNota("muat", l)} className="flex items-center gap-1.5 rounded-lg bg-white px-3 py-1.5 text-xs font-semibold text-slate-600 ring-1 ring-stone-200 hover:bg-stone-100"><FileText size={13} /> Nota Muat</button>
                      <button onClick={() => openNota("setoran", l)} className="flex items-center gap-1.5 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800"><Printer size={13} /> Nota Setoran</button>
                    </div>
                  </div>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/* ============================ Pengaturan ============================ */
function Pengaturan({ profile, onSaveProfile }) {
  const [f, setF] = useState(profile);
  const [saved, setSaved] = useState(false);
  useEffect(() => setF(profile), [profile]);
  const set = (k) => (e) => { setF((s) => ({ ...s, [k]: e.target.value })); setSaved(false); };
  const save = async () => {
    await onSaveProfile({ nama: f.nama.trim() || "SnackDistro", alamat: f.alamat.trim(), telepon: f.telepon.trim() });
    setSaved(true);
  };

  return (
    <div className="mx-auto max-w-xl p-5 md:p-8">
      <Header title="Pengaturan" subtitle="Identitas usaha yang tampil di nota cetak" />
      <div className="space-y-3 rounded-2xl border border-stone-200 bg-white p-5">
        <Field label="Nama Usaha"><input className={inp} value={f.nama} onChange={set("nama")} placeholder="cth. UD Snack Makmur" /></Field>
        <Field label="Alamat"><textarea rows={2} className={inp} value={f.alamat} onChange={set("alamat")} placeholder="Alamat lengkap usaha" /></Field>
        <Field label="Telepon"><input className={inp} value={f.telepon} onChange={set("telepon")} placeholder="0812-xxxx-xxxx" /></Field>
        <button onClick={save} className="mt-2 flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 py-3 text-sm font-bold text-slate-900 hover:bg-emerald-400">
          {saved ? <><CheckCircle2 size={16} /> Tersimpan</> : "Simpan"}
        </button>
      </div>
      <p className="mt-3 text-center text-xs text-slate-400">Info ini muncul di kop Nota Muat & Nota Setoran.</p>
    </div>
  );
}

/* ============================ NOTA (cetak) ============================ */
function NotaOverlay({ nota, profile, salesNm, onClose }) {
  const { type, load } = nota;
  const isMuat = type === "muat";
  const tanggal = isMuat ? load.date : (load.settledDate || load.date);
  const [busy, setBusy] = useState(false);
  const handleCetak = async () => {
    setBusy(true);
    try { await cetakNota(nota, profile, salesNm); } finally { setBusy(false); }
  };

  // baris & total
  const rows = isMuat
    ? load.items.map((i) => ({ name: i.name, price: i.price, qtyAmbil: i.qtyAmbil, jumlah: i.price * i.qtyAmbil }))
    : (load.result || []).map((r) => ({ name: r.name, price: r.price, qtyAmbil: r.qtyAmbil, qtyTerjual: r.qtyTerjual, qtyRetur: r.qtyRetur, jumlah: r.price * r.qtyTerjual }));
  const totalNilai = isMuat ? rows.reduce((s, r) => s + r.jumlah, 0) : (load.setoran ?? rows.reduce((s, r) => s + r.jumlah, 0));
  const totalRetur = !isMuat ? rows.reduce((s, r) => s + r.qtyRetur, 0) : 0;

  const th = "border border-slate-300 px-2 py-1 text-left text-xs font-bold text-slate-600";
  const td = "border border-slate-300 px-2 py-1 text-sm text-slate-800";

  return (
    <div className="nota-screen fixed inset-0 z-50 overflow-y-auto bg-slate-900/50 p-4">
      {/* toolbar */}
      <div className="no-print mx-auto mb-1 flex max-w-3xl items-center justify-between">
        <span className="font-semibold text-white">Pratinjau {isMuat ? "Nota Muat" : "Nota Setoran"}</span>
        <div className="flex gap-2">
          <button onClick={handleCetak} disabled={busy} className="flex items-center gap-2 rounded-xl bg-emerald-500 px-4 py-2 text-sm font-bold text-slate-900 hover:bg-emerald-400 disabled:opacity-60"><Printer size={16} /> {busy ? "Menyiapkan PDF…" : "Cetak / Simpan PDF"}</button>
          <button onClick={onClose} className="flex items-center gap-2 rounded-xl bg-white px-4 py-2 text-sm font-bold text-slate-700 hover:bg-stone-100"><X size={16} /> Tutup</button>
        </div>
      </div>
      <p className="no-print mx-auto mb-3 max-w-3xl text-xs text-slate-300">
        Tombol di atas mengunduh nota sebagai <b>file PDF</b> ukuran <b>F4 (215 × 330 mm)</b>, otomatis pecah ke beberapa halaman untuk barang yang banyak. Butuh koneksi internet saat pertama kali membuat PDF.
      </p>

      {/* kertas nota */}
      <div id="nota-print" className="mx-auto max-w-3xl bg-white p-5 text-slate-900 shadow-xl sm:p-8"
        style={{ fontFamily: "'Plus Jakarta Sans', sans-serif" }}>
        {/* kop */}
        <div className="flex items-start justify-between border-b-2 border-slate-800 pb-4">
          <div>
            <h2 className="text-xl font-extrabold">{profile.nama}</h2>
            {profile.alamat && <p className="text-xs text-slate-500">{profile.alamat}</p>}
            {profile.telepon && <p className="text-xs text-slate-500">Telp: {profile.telepon}</p>}
          </div>
          <div className="text-right">
            <h3 className="text-lg font-extrabold uppercase tracking-wide">{isMuat ? "Nota Muat Barang" : "Nota Setoran"}</h3>
            <p className="tnum text-xs text-slate-500">No: {load.code}</p>
          </div>
        </div>

        {/* meta */}
        <div className="mt-4 grid grid-cols-2 gap-2 text-sm">
          <div><span className="text-slate-500">Sales</span><div className="font-bold">{salesNm}</div></div>
          <div className="text-right"><span className="text-slate-500">Tanggal</span><div className="font-semibold">{fmtDateLong(tanggal)}</div></div>
        </div>

        {/* tabel */}
        <div className="mt-4 overflow-x-auto">
        <table className="w-full border-collapse" style={{ minWidth: isMuat ? 420 : 560 }}>
          <thead>
            <tr className="bg-slate-100">
              <th className={th + " text-center"} style={{ width: 32 }}>No</th>
              <th className={th}>Nama Barang</th>
              <th className={th + " whitespace-nowrap text-right"}>Harga</th>
              {isMuat ? (
                <th className={th + " text-center"}>Qty</th>
              ) : (
                <>
                  <th className={th + " text-center"}>Bawa</th>
                  <th className={th + " text-center"}>Laku</th>
                  <th className={th + " text-center"}>Retur</th>
                </>
              )}
              <th className={th + " whitespace-nowrap text-right"}>Jumlah</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, idx) => (
              <tr key={idx}>
                <td className={td + " text-center"}>{idx + 1}</td>
                <td className={td}>{r.name}</td>
                <td className={td + " tnum whitespace-nowrap text-right"}>{rupiah(r.price)}</td>
                {isMuat ? (
                  <td className={td + " tnum text-center"}>{r.qtyAmbil}</td>
                ) : (
                  <>
                    <td className={td + " tnum text-center"}>{r.qtyAmbil}</td>
                    <td className={td + " tnum text-center font-semibold"}>{r.qtyTerjual}</td>
                    <td className={td + " tnum text-center text-slate-500"}>{r.qtyRetur}</td>
                  </>
                )}
                <td className={td + " tnum whitespace-nowrap text-right font-semibold"}>{rupiah(r.jumlah)}</td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td className={td + " text-right font-bold"} colSpan={isMuat ? 4 : 6}>
                {isMuat ? "Total Nilai Barang Dibawa" : "Total Uang Setoran"}
              </td>
              <td className={td + " tnum whitespace-nowrap text-right font-extrabold"}>{rupiah(totalNilai)}</td>
            </tr>
            {!isMuat && (
              <tr>
                <td className={td + " text-right text-slate-500"} colSpan={6}>Total Barang Retur</td>
                <td className={td + " tnum whitespace-nowrap text-right"}>{totalRetur} pcs</td>
              </tr>
            )}
          </tfoot>
        </table>
        </div>

        {/* catatan */}
        <p className="mt-3 text-xs italic text-slate-500">
          {isMuat
            ? "*Barang diserahkan secara konsinyasi. Pembayaran dilakukan sesuai jumlah barang yang terjual saat setoran."
            : "*Sisa barang yang tidak terjual telah dikembalikan (retur) ke gudang sesuai rincian di atas."}
        </p>

        {/* tanda tangan */}
        <div className="sign-block mt-8 grid grid-cols-2 gap-8 text-center text-sm">
          <div>
            <p className="text-slate-500">{isMuat ? "Diserahkan oleh," : "Diterima oleh,"}</p>
            <div className="h-16" />
            <p className="border-t border-slate-400 pt-1 font-semibold">( {profile.nama} )</p>
            <p className="text-xs text-slate-400">Admin / Owner</p>
          </div>
          <div>
            <p className="text-slate-500">{isMuat ? "Diterima oleh," : "Disetor oleh,"}</p>
            <div className="h-16" />
            <p className="border-t border-slate-400 pt-1 font-semibold">( {salesNm} )</p>
            <p className="text-xs text-slate-400">Sales</p>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ============================ Shared UI ============================ */
const inp = "w-full rounded-xl border border-stone-200 py-2.5 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";
const Header = ({ title, subtitle, compact, noMargin }) => (
  <div className={noMargin ? "" : compact ? "mb-4" : "mb-6"}>
    <h1 className="text-xl font-extrabold text-slate-900 md:text-2xl">{title}</h1>
    {subtitle && <p className="text-sm text-slate-500">{subtitle}</p>}
  </div>
);
const Field = ({ label, children }) => (
  <label className="block"><span className="mb-1 block text-xs font-semibold text-slate-500">{label}</span>{children}</label>
);
function Modal({ title, children, onClose, wide }) {
  return (
    <div className="no-print fixed inset-0 z-50 grid place-items-center bg-slate-900/40 p-4" onClick={onClose}>
      <div onClick={(e) => e.stopPropagation()} className={`max-h-screen w-full overflow-y-auto rounded-2xl bg-white p-6 ${wide ? "max-w-lg" : "max-w-md"}`}>
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-lg font-extrabold text-slate-900">{title}</h3>
          <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-slate-400 hover:bg-stone-100"><X size={18} /></button>
        </div>
        {children}
      </div>
    </div>
  );
}
