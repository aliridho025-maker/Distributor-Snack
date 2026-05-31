import React, { useState } from 'react'
import { supabase } from './lib/supabase'
import { Truck, Mail, Lock, Eye, EyeOff, ArrowLeft, CheckCircle2 } from 'lucide-react'

const ERR_MAP = {
  'Invalid login credentials':  'Email atau password salah.',
  'Email not confirmed':         'Email belum dikonfirmasi — cek inbox Anda.',
  'User already registered':     'Email sudah terdaftar. Silakan login.',
  'Password should be at least': 'Password minimal 6 karakter.',
  'Unable to validate email':    'Format email tidak valid.',
  'Email rate limit exceeded':   'Terlalu banyak percobaan. Tunggu sebentar.',
  'signup_disabled':             'Pendaftaran saat ini dinonaktifkan.',
}

function mapError(msg = '') {
  for (const [k, v] of Object.entries(ERR_MAP)) {
    if (msg.includes(k)) return v
  }
  return msg || 'Terjadi kesalahan, coba lagi.'
}

export default function AuthPage() {
  const [mode, setMode]         = useState('login')   // login | register | reset
  const [email, setEmail]       = useState('')
  const [password, setPassword] = useState('')
  const [showPw, setShowPw]     = useState(false)
  const [loading, setLoading]   = useState(false)
  const [error, setError]       = useState('')
  const [success, setSuccess]   = useState('')

  const reset = () => { setError(''); setSuccess(''); }

  const handleSubmit = async () => {
    reset()
    if (!email.trim()) { setError('Email wajib diisi.'); return }
    if (mode !== 'reset' && !password) { setError('Password wajib diisi.'); return }
    setLoading(true)

    try {
      if (mode === 'login') {
        const { error: e } = await supabase.auth.signInWithPassword({ email, password })
        if (e) setError(mapError(e.message))
        // sukses → onAuthStateChange di App.jsx otomatis mendeteksi

      } else if (mode === 'register') {
        const { error: e } = await supabase.auth.signUp({ email, password })
        if (e) setError(mapError(e.message))
        else   setSuccess('Akun dibuat! Cek email Anda untuk konfirmasi, lalu login.')

      } else if (mode === 'reset') {
        const { error: e } = await supabase.auth.resetPasswordForEmail(email, {
          redirectTo: window.location.origin + '/?reset=1',
        })
        if (e) setError(mapError(e.message))
        else   setSuccess('Link reset password sudah dikirim ke email Anda.')
      }
    } finally {
      setLoading(false)
    }
  }

  const title = mode === 'login'    ? 'Masuk ke akun Anda'
              : mode === 'register' ? 'Buat akun baru'
              :                       'Reset password'

  return (
    <div
      className="flex min-h-screen flex-col items-center justify-center bg-stone-100 p-4"
      style={{ fontFamily: "'Plus Jakarta Sans', ui-sans-serif, system-ui, sans-serif" }}
    >
      {/* Kartu */}
      <div className="w-full max-w-sm">
        {/* Logo */}
        <div className="mb-8 flex flex-col items-center gap-3">
          <div className="grid h-14 w-14 place-items-center rounded-2xl bg-slate-900 text-emerald-500">
            <Truck size={28} strokeWidth={2.4} />
          </div>
          <div className="text-center">
            <h1 className="text-2xl font-extrabold text-slate-900">SnackDistro</h1>
            <p className="text-sm text-slate-500">Manajemen kanvas &amp; setoran</p>
          </div>
        </div>

        <div className="rounded-2xl border border-stone-200 bg-white p-7 shadow-sm">
          {mode !== 'login' && (
            <button onClick={() => { setMode('login'); reset() }}
              className="mb-4 flex items-center gap-1 text-sm font-medium text-slate-500 hover:text-slate-700">
              <ArrowLeft size={15} /> Kembali
            </button>
          )}

          <h2 className="mb-5 text-lg font-extrabold text-slate-900">{title}</h2>

          {/* Error */}
          {error && (
            <div className="mb-4 rounded-xl bg-red-50 px-4 py-3 text-sm text-red-600">{error}</div>
          )}

          {/* Success */}
          {success ? (
            <div className="flex flex-col items-center gap-3 py-4 text-center">
              <CheckCircle2 size={40} className="text-emerald-500" />
              <p className="text-sm font-medium text-slate-700">{success}</p>
              {mode === 'register' && (
                <button onClick={() => { setMode('login'); setSuccess('') }}
                  className="mt-2 font-bold text-emerald-600 hover:underline">
                  Login sekarang
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {/* Email */}
              <label className="block">
                <span className="mb-1 block text-xs font-semibold text-slate-500">Email</span>
                <div className="relative">
                  <Mail size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                  <input
                    type="email" autoComplete="email" value={email}
                    onChange={e => setEmail(e.target.value)}
                    onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                    placeholder="nama@email.com"
                    className="w-full rounded-xl border border-stone-200 py-2.5 pl-9 pr-3 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                  />
                </div>
              </label>

              {/* Password */}
              {mode !== 'reset' && (
                <label className="block">
                  <span className="mb-1 block text-xs font-semibold text-slate-500">Password</span>
                  <div className="relative">
                    <Lock size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type={showPw ? 'text' : 'password'} autoComplete={mode === 'login' ? 'current-password' : 'new-password'}
                      value={password} onChange={e => setPassword(e.target.value)}
                      onKeyDown={e => e.key === 'Enter' && handleSubmit()}
                      placeholder="••••••••"
                      className="w-full rounded-xl border border-stone-200 py-2.5 pl-9 pr-9 text-sm outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-100"
                    />
                    <button type="button" onClick={() => setShowPw(v => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600">
                      {showPw ? <EyeOff size={15} /> : <Eye size={15} />}
                    </button>
                  </div>
                </label>
              )}

              {mode === 'register' && (
                <p className="text-xs text-slate-400">Password minimal 6 karakter.</p>
              )}

              {/* Tombol aksi */}
              <button onClick={handleSubmit} disabled={loading}
                className="mt-1 w-full rounded-xl bg-emerald-500 py-3 text-sm font-bold text-slate-900 transition hover:bg-emerald-400 disabled:opacity-60">
                {loading ? 'Memproses…'
                  : mode === 'login'    ? 'Masuk'
                  : mode === 'register' ? 'Buat Akun'
                  :                       'Kirim Link Reset'}
              </button>
            </div>
          )}
        </div>

        {/* Footer links */}
        <div className="mt-5 space-y-2 text-center text-sm text-slate-500">
          {mode === 'login' && (
            <>
              <button onClick={() => { setMode('reset'); reset() }}
                className="block w-full hover:text-slate-700">
                Lupa password?
              </button>
              <p>Belum punya akun?{' '}
                <button onClick={() => { setMode('register'); reset() }}
                  className="font-bold text-emerald-600 hover:underline">
                  Daftar di sini
                </button>
              </p>
            </>
          )}
          {mode === 'register' && (
            <p>Sudah punya akun?{' '}
              <button onClick={() => { setMode('login'); reset() }}
                className="font-bold text-emerald-600 hover:underline">
                Masuk
              </button>
            </p>
          )}
        </div>
      </div>
    </div>
  )
}
