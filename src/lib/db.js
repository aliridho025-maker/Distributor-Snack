import { supabase } from './supabase'

/* ───────── Business (tenant) ───────── */
let _bizId = null
export function clearBizCache() { _bizId = null }

export async function getBusinessId() {
  if (_bizId) return _bizId
  const { data, error } = await supabase.from('businesses').select('id').limit(1).maybeSingle()
  if (error) throw error
  if (!data) throw new Error('Data usaha (business) belum ada. Pastikan trigger handle_new_user aktif di Supabase.')
  _bizId = data.id
  return _bizId
}

/* ───────── Mapping row(snake_case) → objek app(camelCase) ───────── */
const mapProduct = (r) => ({
  id: r.id, name: r.name, sku: r.sku || '', category: r.category || 'Umum',
  price: Number(r.price) || 0, cost: Number(r.cost) || 0,
  stock: r.stock || 0, minStock: r.min_stock || 0, photo: r.photo || '',
})
const mapSales = (r) => ({ id: r.id, name: r.nama, phone: r.phone || '' })
const mapLoad = (r) => {
  const items = (r.load_items || []).map((it) => ({
    id: it.id, productId: it.product_id, name: it.name,
    price: Number(it.price) || 0, cost: Number(it.cost) || 0,
    qtyAmbil: it.qty_ambil, qtyTerjual: it.qty_terjual, qtyRetur: it.qty_retur,
  }))
  return {
    id: r.id, code: r.code, salesId: r.salesman_id, date: r.loaded_at,
    status: r.status, setoran: Number(r.setoran) || 0, laba: Number(r.laba) || 0,
    settledDate: r.settled_at, items, result: items,
  }
}

const toProductRow = (biz, p) => ({
  business_id: biz, name: p.name, sku: p.sku || '', category: p.category || 'Umum',
  price: p.price || 0, cost: p.cost || 0, stock: p.stock || 0,
  min_stock: p.minStock || 0, photo: p.photo || '',
})

/* ───────── Ambil semua data sekaligus ───────── */
export async function fetchAll() {
  const biz = await getBusinessId()
  const [bizRes, prodRes, salesRes, loadsRes] = await Promise.all([
    supabase.from('businesses').select('*').eq('id', biz).single(),
    supabase.from('products').select('*').eq('business_id', biz).order('name'),
    supabase.from('salesmen').select('*').eq('business_id', biz).order('nama'),
    supabase.from('loads').select('*, load_items(*)').eq('business_id', biz).order('loaded_at', { ascending: false }),
  ])
  for (const r of [bizRes, prodRes, salesRes, loadsRes]) if (r.error) throw r.error
  const b = bizRes.data
  return {
    profile: { nama: b?.nama || 'SnackDistro', alamat: b?.alamat || '', telepon: b?.telepon || '' },
    products: (prodRes.data || []).map(mapProduct),
    sales: (salesRes.data || []).map(mapSales),
    loads: (loadsRes.data || []).map(mapLoad),
  }
}

/* ───────── Produk ───────── */
export async function addProduct(p) {
  const biz = await getBusinessId()
  const { error } = await supabase.from('products').insert(toProductRow(biz, p))
  if (error) throw error
}
export async function updateProduct(p) {
  const { error } = await supabase.from('products').update({
    name: p.name, sku: p.sku || '', category: p.category || 'Umum',
    price: p.price || 0, cost: p.cost || 0, stock: p.stock || 0,
    min_stock: p.minStock || 0, photo: p.photo || '',
  }).eq('id', p.id)
  if (error) throw error
}
export async function deleteProduct(id) {
  const { error } = await supabase.from('products').delete().eq('id', id)
  if (error) throw error
}
export async function addStock(id, qty) {
  const { error } = await supabase.rpc('add_stock', { p_product_id: id, p_qty: qty, p_note: 'Tambah stok gudang' })
  if (error) throw error
}
// Import massal: cocokkan SKU (atau nama) dgn data existing → update; sisanya insert
export async function bulkUpsertProducts(rows, existing) {
  const biz = await getBusinessId()
  const bySku = {}, byName = {}
  existing.forEach((p) => { if (p.sku) bySku[p.sku.toLowerCase()] = p; byName[p.name.toLowerCase()] = p })
  const toInsert = [], toUpdate = []
  rows.forEach((row) => {
    const m = row.sku ? bySku[row.sku.toLowerCase()] : byName[row.name.toLowerCase()]
    if (m) toUpdate.push({ ...row, id: m.id })
    else toInsert.push(toProductRow(biz, row))
  })
  if (toInsert.length) {
    const { error } = await supabase.from('products').insert(toInsert)
    if (error) throw error
  }
  for (const u of toUpdate) {
    const { error } = await supabase.from('products').update({
      name: u.name, sku: u.sku || '', category: u.category || 'Umum',
      price: u.price || 0, cost: u.cost || 0, stock: u.stock || 0, min_stock: u.minStock || 0,
    }).eq('id', u.id)
    if (error) throw error
  }
  return { added: toInsert.length, updated: toUpdate.length }
}

/* ───────── Sales ───────── */
export async function addSalesman(s) {
  const biz = await getBusinessId()
  const { error } = await supabase.from('salesmen').insert({ business_id: biz, nama: s.name, phone: s.phone || '' })
  if (error) throw error
}
export async function updateSalesman(s) {
  const { error } = await supabase.from('salesmen').update({ nama: s.name, phone: s.phone || '' }).eq('id', s.id)
  if (error) throw error
}
export async function deleteSalesman(id) {
  const { error } = await supabase.from('salesmen').delete().eq('id', id)
  if (error) throw error
}

/* ───────── Muat & Setoran (RPC, transaksional) ───────── */
// items: [{ product_id, qty }]  → mengembalikan baris load yang dibuat
export async function createLoad(salesId, items) {
  const { data, error } = await supabase.rpc('create_load', { p_salesman_id: salesId, p_items: items })
  if (error) throw error
  return data
}
// results: [{ item_id, qty_terjual }]
export async function settleLoad(loadId, results) {
  const { data, error } = await supabase.rpc('settle_load', { p_load_id: loadId, p_results: results })
  if (error) throw error
  return data
}

/* ───────── Profil usaha ───────── */
export async function updateProfile(p) {
  const biz = await getBusinessId()
  const { error } = await supabase.from('businesses').update({
    nama: p.nama, alamat: p.alamat, telepon: p.telepon,
  }).eq('id', biz)
  if (error) throw error
}
