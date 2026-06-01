import { createClient } from '@supabase/supabase-js'

const url = import.meta.env.VITE_SUPABASE_URL || ''
const key = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

// True hanya jika kedua env terisi
export const isSupabaseConfigured = Boolean(url && key)

if (!isSupabaseConfigured) {
  console.warn(
    '[SnackDistro] Supabase belum dikonfigurasi. ' +
    'Set VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY di .env (lokal) ' +
    'atau di Environment Variables (Vercel).'
  )
}

// Placeholder valid agar createClient TIDAK crash saat env kosong
export const supabase = createClient(
  url || 'https://placeholder.supabase.co',
  key || 'placeholder-anon-key'
)
