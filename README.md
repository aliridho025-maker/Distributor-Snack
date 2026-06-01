# SnackDistro — Distribusi Snack (Kanvas & Setoran)

Aplikasi web manajemen distribusi snack model konsinyasi: owner ↔ sales.
Frontend **React (Vite)** + backend **Supabase** (Postgres, Auth, RLS).

## Fitur
- Login (Supabase Auth, email + password)
- Muat barang (sales ambil barang → stok berkurang)
- Setoran (hitung terjual, retur balik ke stok, setoran & laba)
- Produk & stok + import massal Excel + foto produk
- Nota Muat & Setoran (PDF, ukuran F4, multi-halaman)
- Data tersinkron lewat Supabase (lintas perangkat)

## 1. Setup Supabase
1. Buat project di [supabase.com](https://supabase.com).
2. Buka **SQL Editor** → jalankan isi file `supabase-schema.sql`.
   - Jika tabel `products` sudah pernah dibuat tanpa kolom foto, jalankan baris migrasi `alter table ... add column ... photo` di bagian bawah file.
3. Ambil kredensial di **Settings → API**: `Project URL` dan `anon public key`.

## 2. Jalankan Lokal
```bash
npm install
cp .env.example .env     # isi VITE_SUPABASE_URL & VITE_SUPABASE_ANON_KEY
npm run dev
```

## 3. Deploy ke Vercel (via GitHub)
```bash
git init && git add . && git commit -m "init"
git remote add origin https://github.com/USERNAME/distributor-snack.git
git push -u origin main
```
Di Vercel: **Add New Project → Import** repo →
**Settings → Environment Variables** isi:
```
VITE_SUPABASE_URL=...
VITE_SUPABASE_ANON_KEY=...
```
→ Deploy. Setiap `git push` akan otomatis re-deploy.

## Catatan
- Saat user pertama mendaftar, baris `businesses` dibuat otomatis (trigger `handle_new_user`). Semua data (produk, sales, muatan) terikat ke usaha tersebut dan diisolasi via RLS.
- Operasi muat & setoran memakai RPC transaksional (`create_load`, `settle_load`) agar stok selalu konsisten.
