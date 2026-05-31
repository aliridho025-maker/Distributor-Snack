import React, { useState } from "react";
import { Truck } from "lucide-react";
import { auth } from "./supabase";

const inp = "w-full rounded-xl border border-stone-200 py-2.5 px-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100";

export default function AuthScreen() {
  const [mode, setMode]       = useState("login"); // "login" | "register"
  const [email, setEmail]     = useState("");
  const [password, setPass]   = useState("");
  const [loading, setLoading] = useState(false);
  const [msg, setMsg]         = useState(null); // { type:'error'|'ok', text }

  const submit = async () => {
    if (!email.trim() || !password) return;
    setLoading(true); setMsg(null);
    try {
      if (mode === "login") {
        const { error } = await auth.signIn(email.trim(), password);
        if (error) throw error;
      } else {
        const { error } = await auth.signUp(email.trim(), password);
        if (error) throw error;
        setMsg({ type: "ok", text: "Akun dibuat! Cek email untuk konfirmasi (jika email confirmation aktif), lalu login." });
        setMode("login");
      }
    } catch (e) {
      setMsg({ type: "error", text: e.message || "Terjadi kesalahan." });
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      style={{ fontFamily: "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif" }}
      className="flex min-h-screen items-center justify-center bg-stone-100 p-4"
    >
      <div className="w-full max-w-sm">
        {/* logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-900 text-emerald-400">
            <Truck size={28} strokeWidth={2.2} />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-extrabold text-slate-900">SnackDistro</h1>
            <p className="text-sm text-slate-500">Sistem Kanvas &amp; Setoran</p>
          </div>
        </div>

        {/* card */}
        <div className="rounded-2xl border border-stone-200 bg-white p-6 shadow-sm">
          <h2 className="mb-5 text-lg font-extrabold text-slate-800">
            {mode === "login" ? "Masuk ke akun" : "Buat akun baru"}
          </h2>

          <div className="space-y-3">
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-500">Email</span>
              <input
                type="email" value={email} onChange={(e) => setEmail(e.target.value)}
                className={inp} placeholder="nama@email.com"
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            </label>
            <label className="block">
              <span className="mb-1 block text-xs font-semibold text-slate-500">Password</span>
              <input
                type="password" value={password} onChange={(e) => setPass(e.target.value)}
                className={inp} placeholder="minimal 6 karakter"
                onKeyDown={(e) => e.key === "Enter" && submit()}
              />
            </label>
          </div>

          {msg && (
            <p className={`mt-3 rounded-xl p-3 text-sm ${
              msg.type === "error" ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-700"
            }`}>{msg.text}</p>
          )}

          <button
            onClick={submit} disabled={loading || !email.trim() || !password}
            className="mt-5 w-full rounded-xl bg-emerald-500 py-3 text-sm font-bold text-slate-900 hover:bg-emerald-400 disabled:cursor-not-allowed disabled:bg-stone-200 disabled:text-slate-400"
          >
            {loading ? "Memproses…" : mode === "login" ? "Masuk" : "Daftar"}
          </button>

          <p className="mt-4 text-center text-sm text-slate-500">
            {mode === "login" ? (
              <>Belum punya akun?{" "}
                <button onClick={() => { setMode("register"); setMsg(null); }} className="font-bold text-emerald-600 hover:underline">Daftar</button>
              </>
            ) : (
              <>Sudah punya akun?{" "}
                <button onClick={() => { setMode("login"); setMsg(null); }} className="font-bold text-emerald-600 hover:underline">Masuk</button>
              </>
            )}
          </p>
        </div>
      </div>
    </div>
  );
}
