import { createClient } from "@supabase/supabase-js";

// ─── Konfigurasi ────────────────────────────────────────────────────────────
// Ganti dua nilai di bawah ini dengan URL & anon key dari Supabase project kamu.
// Cara mendapatkannya: Supabase Dashboard → Settings → API
const SUPABASE_URL  = import.meta.env.VITE_SUPABASE_URL  || "";
const SUPABASE_ANON = import.meta.env.VITE_SUPABASE_ANON || "";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON);

// ─── Auth ────────────────────────────────────────────────────────────────────
export const auth = {
  /** Daftar + otomatis buat business (via trigger on_auth_user_created) */
  signUp: (email, password) =>
    supabase.auth.signUp({ email, password }),

  /** Login */
  signIn: (email, password) =>
    supabase.auth.signInWithPassword({ email, password }),

  /** Logout */
  signOut: () => supabase.auth.signOut(),

  /** Sesi aktif saat ini */
  getSession: () => supabase.auth.getSession(),

  /** Subscribe perubahan sesi */
  onAuthStateChange: (cb) => supabase.auth.onAuthStateChange(cb),
};

// ─── Business / Profile ──────────────────────────────────────────────────────
export const db = {
  /** Ambil profil usaha milik user yg login */
  async getProfile() {
    const { data, error } = await supabase
      .from("businesses")
      .select("*")
      .single();
    if (error) throw error;
    return data; // { id, nama, alamat, telepon, ... }
  },

  /** Update profil usaha */
  async updateProfile(fields) {
    const { data, error } = await supabase
      .from("businesses")
      .update(fields)
      .eq("owner_id", (await supabase.auth.getUser()).data.user.id)
      .select()
      .single();
    if (error) throw error;
    return data;
  },

  // ─── Produk ───────────────────────────────────────────────────────────────
  async getProducts() {
    const { data, error } = await supabase
      .from("products")
      .select("*")
      .order("name");
    if (error) throw error;
    // Normalise field names ke camelCase agar UI tidak berubah
    return (data || []).map(dbProdToApp);
  },

  async upsertProduct(p) {
    const row = appProdToDb(p);
    const { data, error } = await supabase
      .from("products")
      .upsert(row, { onConflict: "id" })
      .select()
      .single();
    if (error) throw error;
    return dbProdToApp(data);
  },

  async deleteProduct(id) {
    const { error } = await supabase.from("products").delete().eq("id", id);
    if (error) throw error;
  },

  /** Tambah / kurangi stok via RPC (tercatat di stock_movements) */
  async addStock(productId, qty, note = "") {
    const { data, error } = await supabase.rpc("add_stock", {
      p_product_id: productId,
      p_qty: qty,
      p_note: note,
    });
    if (error) throw error;
    return dbProdToApp(data);
  },

  // ─── Salesmen ─────────────────────────────────────────────────────────────
  async getSalesmen() {
    const { data, error } = await supabase
      .from("salesmen")
      .select("*")
      .eq("is_active", true)
      .order("nama");
    if (error) throw error;
    return (data || []).map(dbSalesToApp);
  },

  async upsertSalesman(s) {
    const row = appSalesToDb(s);
    const { data, error } = await supabase
      .from("salesmen")
      .upsert(row, { onConflict: "id" })
      .select()
      .single();
    if (error) throw error;
    return dbSalesToApp(data);
  },

  async deleteSalesman(id) {
    // soft-delete: tandai is_active = false
    const { error } = await supabase
      .from("salesmen")
      .update({ is_active: false })
      .eq("id", id);
    if (error) throw error;
  },

  // ─── Loads (Muatan) ───────────────────────────────────────────────────────
  /** Ambil semua loads + load_items sekaligus */
  async getLoads() {
    const { data, error } = await supabase
      .from("loads")
      .select("*, load_items(*)")
      .order("loaded_at", { ascending: false });
    if (error) throw error;
    return (data || []).map(dbLoadToApp);
  },

  /**
   * Buat muatan baru via RPC (transaksional: potong stok + catat movement)
   * items = [{ product_id, qty }, ...]
   */
  async createLoad(salesmanId, items) {
    const { data, error } = await supabase.rpc("create_load", {
      p_salesman_id: salesmanId,
      p_items: JSON.stringify(items),
    });
    if (error) throw error;
    // RPC hanya returns loads row; ambil ulang dengan items
    const { data: full, error: e2 } = await supabase
      .from("loads")
      .select("*, load_items(*)")
      .eq("id", data.id)
      .single();
    if (e2) throw e2;
    return dbLoadToApp(full);
  },

  /**
   * Proses setoran via RPC (transaksional: retur stok + hitung setoran/laba)
   * results = [{ item_id, qty_terjual }, ...]
   */
  async settleLoad(loadId, results) {
    const { data, error } = await supabase.rpc("settle_load", {
      p_load_id: loadId,
      p_results: JSON.stringify(results),
    });
    if (error) throw error;
    // Ambil ulang dengan items
    const { data: full, error: e2 } = await supabase
      .from("loads")
      .select("*, load_items(*)")
      .eq("id", data.id)
      .single();
    if (e2) throw e2;
    return dbLoadToApp(full);
  },
};

// ─── Mapping helpers (DB snake_case <-> App camelCase) ──────────────────────

function dbProdToApp(p) {
  return {
    id:       p.id,
    name:     p.name,
    sku:      p.sku,
    category: p.category,
    price:    Number(p.price),
    cost:     Number(p.cost),
    stock:    p.stock,
    minStock: p.min_stock,
    photo:    p.photo ?? null,
  };
}

function appProdToDb(p) {
  const row = {
    name:      p.name,
    sku:       p.sku      || "",
    category:  p.category || "Umum",
    price:     p.price    || 0,
    cost:      p.cost     || 0,
    stock:     p.stock    || 0,
    min_stock: p.minStock || 0,
  };
  if (p.id) row.id = p.id;
  return row;
}

function dbSalesToApp(s) {
  return { id: s.id, name: s.nama, phone: s.phone };
}

function appSalesToDb(s) {
  const row = { nama: s.name, phone: s.phone || "" };
  if (s.id) row.id = s.id;
  return row;
}

function dbLoadToApp(l) {
  const items = (l.load_items || []).map((i) => ({
    id:         i.id,
    name:       i.name,
    price:      Number(i.price),
    cost:       Number(i.cost),
    qtyAmbil:   i.qty_ambil,
    qtyTerjual: i.qty_terjual,
    qtyRetur:   i.qty_retur,
  }));

  return {
    id:          l.id,
    code:        l.code,
    salesId:     l.salesman_id,
    date:        l.loaded_at,
    settledDate: l.settled_at,
    status:      l.status,
    setoran:     Number(l.setoran),
    laba:        Number(l.laba),
    items,
    // alias untuk komponen Riwayat yang pakai l.result
    result: items,
  };
}
