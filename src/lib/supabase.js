import { createClient } from '@supabase/supabase-js'

const url  = import.meta.env.VITE_SUPABASE_URL      || ''
const key  = import.meta.env.VITE_SUPABASE_ANON_KEY || ''

if (!url || !key) {
  console.warn(
    '[SnackDistro] Supabase belum dikonfigurasi.\n' +
    'Buat file .env dan isi VITE_SUPABASE_URL + VITE_SUPABASE_ANON_KEY.\n' +
    'Lihat .env.example untuk contohnya.'
  )
}

export const supabase = createClient(url, key)
