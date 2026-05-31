import React, { useState, useEffect, useCallback } from "react";
import { auth, db } from "./supabase";
import AuthScreen from "./AuthScreen.jsx";
import App from "./App.jsx";

// Seed data kalau DB baru kosong
const SEED_PRODUCTS = [
  { name: "Keripik Singkong Balado", sku: "KRP-BL", category: "Keripik", price: 9000, cost: 6500, stock: 120, minStock: 30 },
  { name: "Kacang Telur 250g",       sku: "KCG-250", category: "Kacang",  price: 12000, cost: 9000,  stock: 80,  minStock: 24 },
  { name: "Wafer Coklat",            sku: "WFR-CK",  category: "Wafer",   price: 7000,  cost: 5000,  stock: 18,  minStock: 36 },
  { name: "Permen Susu (toples)",    sku: "PRM-SS",  category: "Permen",  price: 25000, cost: 19000, stock: 40,  minStock: 10 },
  { name: "Stik Keju 100g",         sku: "STK-KJ",  category: "Keripik", price: 8500,  cost: 6000,  stock: 95,  minStock: 30 },
  { name: "Biskuit Marie",           sku: "BSK-MR",  category: "Biskuit", price: 11000, cost: 8200,  stock: 60,  minStock: 20 },
];
const SEED_SALES = [
  { name: "Budi Santoso", phone: "0812-3456-7890" },
  { name: "Andi Wijaya",  phone: "0856-1122-3344" },
];

export default function Root() {
  const [session, setSession]   = useState(undefined); // undefined = loading
  const [products, setProducts] = useState([]);
  const [sales, setSales]       = useState([]);
  const [loads, setLoads]       = useState([]);
  const [profile, setProfile]   = useState({ nama: "SnackDistro", alamat: "", telepon: "" });
  const [ready, setReady]       = useState(false);

  // ─── Auth listener ────────────────────────────────────────────────────────
  useEffect(() => {
    auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: { subscription } } = auth.onAuthStateChange((_e, s) => {
      setSession(s ?? null);
      if (!s) { setReady(false); setProducts([]); setSales([]); setLoads([]); }
    });
    return () => subscription.unsubscribe();
  }, []);

  // ─── Load data saat session muncul ────────────────────────────────────────
  useEffect(() => {
    if (!session) return;
    (async () => {
      setReady(false);
      try {
        const [prof, prods, sals, lds] = await Promise.all([
          db.getProfile(),
          db.getProducts(),
          db.getSalesmen(),
          db.getLoads(),
        ]);

        setProfile({ nama: prof.nama, alamat: prof.alamat, telepon: prof.telepon });

        // Seed kalau masih kosong (akun baru)
        let finalProds = prods;
        if (prods.length === 0) {
          finalProds = await Promise.all(SEED_PRODUCTS.map((p) => db.upsertProduct(p)));
        }
        let finalSals = sals;
        if (sals.length === 0) {
          finalSals = await Promise.all(SEED_SALES.map((s) => db.upsertSalesman(s)));
        }

        setProducts(finalProds);
        setSales(finalSals);
        setLoads(lds);
      } catch (e) {
        console.error("Gagal memuat data:", e.message);
      } finally {
        setReady(true);
      }
    })();
  }, [session]);

  // ─── Persist helpers (gantikan localStorage / window.storage) ────────────

  const persistProducts = useCallback((next) => setProducts(next), []);
  const persistSales    = useCallback((next) => setSales(next), []);
  const persistLoads    = useCallback((next) => setLoads(next), []);
  const persistProfile  = useCallback(async (fields) => {
    try {
      const updated = await db.updateProfile(fields);
      setProfile({ nama: updated.nama, alamat: updated.alamat, telepon: updated.telepon });
    } catch (e) {
      alert("Gagal menyimpan profil: " + e.message);
    }
  }, []);

  // ─── Operasi data yang dulu inline di komponen ────────────────────────────

  /** Tambah / edit produk */
  const saveProduct = useCallback(async (data) => {
    const saved = await db.upsertProduct(data);
    setProducts((prev) => {
      const idx = prev.findIndex((p) => p.id === saved.id);
      return idx >= 0 ? prev.map((p) => p.id === saved.id ? saved : p) : [saved, ...prev];
    });
    return saved;
  }, []);

  /** Hapus produk */
  const removeProduct = useCallback(async (id) => {
    await db.deleteProduct(id);
    setProducts((prev) => prev.filter((p) => p.id !== id));
  }, []);

  /** Tambah stok via RPC */
  const addStock = useCallback(async (productId, qty, note = "") => {
    const updated = await db.addStock(productId, qty, note);
    setProducts((prev) => prev.map((p) => p.id === updated.id ? updated : p));
  }, []);

  /** Tambah / edit sales */
  const saveSalesman = useCallback(async (data) => {
    const saved = await db.upsertSalesman(data);
    setSales((prev) => {
      const idx = prev.findIndex((s) => s.id === saved.id);
      return idx >= 0 ? prev.map((s) => s.id === saved.id ? saved : s) : [...prev, saved];
    });
    return saved;
  }, []);

  /** Hapus sales (soft delete) */
  const removeSalesman = useCallback(async (id) => {
    await db.deleteSalesman(id);
    setSales((prev) => prev.filter((s) => s.id !== id));
  }, []);

  /**
   * Muat barang: panggil RPC create_load lalu refresh state.
   * items = [{ product_id, qty }]  (sudah pakai id asli dari DB)
   */
  const createLoad = useCallback(async (salesmanId, items) => {
    const load = await db.createLoad(salesmanId, items);
    setLoads((prev) => [load, ...prev]);
    // Update stok lokal (RPC sudah potong di DB; ini agar UI langsung sinkron)
    setProducts((prev) => prev.map((p) => {
      const it = items.find((i) => i.product_id === p.id);
      return it ? { ...p, stock: p.stock - it.qty } : p;
    }));
    return load;
  }, []);

  /**
   * Setoran: panggil RPC settle_load lalu refresh state.
   * results = [{ item_id, qty_terjual }]
   */
  const settleLoad = useCallback(async (loadId, results) => {
    const settled = await db.settleLoad(loadId, results);
    setLoads((prev) => prev.map((l) => l.id === settled.id ? settled : l));
    // Update stok lokal: produk yang retur balik ke stok
    setProducts((prev) => prev.map((p) => {
      const returQty = settled.items
        .filter((i) => {
          const orig = loads.find((l) => l.id === loadId)
            ?.items.find((x) => x.id === i.id);
          return orig?.name === p.name; // fallback cocokkan nama
        })
        .reduce((s, i) => s + i.qtyRetur, 0);
      return returQty > 0 ? { ...p, stock: p.stock + returQty } : p;
    }));
    return settled;
  }, [loads]);

  // ─── Render ───────────────────────────────────────────────────────────────
  if (session === undefined) {
    return (
      <div style={{ fontFamily: "system-ui, sans-serif" }}
        className="flex h-screen items-center justify-center bg-stone-100 text-slate-400">
        Memuat…
      </div>
    );
  }

  if (!session) return <AuthScreen />;

  return (
    <App
      products={products}   sales={sales}
      loads={loads}         profile={profile}
      ready={ready}
      // persist (dipakai komponen lama yg masih panggil persistXxx)
      persistProducts={persistProducts}
      persistSales={persistSales}
      persistLoads={persistLoads}
      persistProfile={persistProfile}
      // operasi Supabase
      saveProduct={saveProduct}
      removeProduct={removeProduct}
      addStock={addStock}
      saveSalesman={saveSalesman}
      removeSalesman={removeSalesman}
      createLoad={createLoad}
      settleLoad={settleLoad}
      onSignOut={() => auth.signOut()}
    />
  );
}
