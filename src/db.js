/**
 * AtuStoka Database Layer
 * Uses Supabase when configured, falls back to localStorage for offline use.
 * All data is namespaced per business (store_id).
 */
import { supabase, DB_READY } from './supabase.js'

// ── localStorage helpers ────────────────────────────────────────
const LS = {
  get: (key, fallback = []) => {
    try { const v = localStorage.getItem('atu_' + key); return v ? JSON.parse(v) : fallback } catch { return fallback }
  },
  set: (key, value) => {
    try { localStorage.setItem('atu_' + key, JSON.stringify(value)) } catch {}
  }
}

// ── Auth ────────────────────────────────────────────────────────
export const auth = {
  async signUp({ email, password, metadata }) {
    if (DB_READY) {
      const { data, error } = await supabase.auth.signUp({ email, password, options: { data: metadata } })
      if (error) throw error
      return data.user
    }
    // localStorage fallback
    const users = LS.get('users', [])
    if (users.find(u => u.email === email)) throw new Error('Email already registered')
    const user = { id: crypto.randomUUID(), email, password, ...metadata, createdAt: new Date().toISOString() }
    LS.set('users', [...users, user])
    LS.set('session', user)
    return user
  },

  async signIn({ email, password }) {
    if (DB_READY) {
      const { data, error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) throw error
      return data.user
    }
    const users = LS.get('users', [])
    const user = users.find(u => u.email === email && u.password === password)
    if (!user) throw new Error('Invalid email or password')
    LS.set('session', user)
    return user
  },

  async signOut() {
    if (DB_READY) await supabase.auth.signOut()
    LS.set('session', null)
  },

  async getSession() {
    if (DB_READY) {
      const { data } = await supabase.auth.getSession()
      return data.session?.user || null
    }
    return LS.get('session', null)
  }
}

// ── Generic CRUD ────────────────────────────────────────────────
// table = 'products' | 'sales' | 'customers' | 'expenses' | 'staff'
// storeId = the business owner's user ID (namespaces all data)

export const crud = {
  async getAll(table, storeId) {
    if (DB_READY) {
      const { data, error } = await supabase
        .from(table)
        .select('*')
        .eq('store_id', storeId)
        .order('created_at', { ascending: false })
      if (error) throw error
      return data
    }
    return LS.get(`${storeId}_${table}`, [])
  },

  async insert(table, storeId, row) {
    const newRow = { ...row, id: crypto.randomUUID(), store_id: storeId, created_at: new Date().toISOString() }
    if (DB_READY) {
      const { data, error } = await supabase.from(table).insert(newRow).select().single()
      if (error) throw error
      return data
    }
    const rows = LS.get(`${storeId}_${table}`, [])
    LS.set(`${storeId}_${table}`, [...rows, newRow])
    return newRow
  },

  async update(table, storeId, id, changes) {
    if (DB_READY) {
      const { data, error } = await supabase.from(table).update(changes).eq('id', id).eq('store_id', storeId).select().single()
      if (error) throw error
      return data
    }
    const rows = LS.get(`${storeId}_${table}`, [])
    const updated = rows.map(r => r.id === id ? { ...r, ...changes } : r)
    LS.set(`${storeId}_${table}`, updated)
    return updated.find(r => r.id === id)
  },

  async remove(table, storeId, id) {
    if (DB_READY) {
      const { error } = await supabase.from(table).delete().eq('id', id).eq('store_id', storeId)
      if (error) throw error
    } else {
      const rows = LS.get(`${storeId}_${table}`, [])
      LS.set(`${storeId}_${table}`, rows.filter(r => r.id !== id))
    }
  }
}

// ── Store profile ───────────────────────────────────────────────
export const storeDB = {
  async save(storeId, profile) {
    if (DB_READY) {
      const { error } = await supabase.from('stores').upsert({ id: storeId, ...profile })
      if (error) throw error
    }
    LS.set(`store_${storeId}`, profile)
  },
  async get(storeId) {
    if (DB_READY) {
      const { data } = await supabase.from('stores').select('*').eq('id', storeId).single()
      return data
    }
    return LS.get(`store_${storeId}`, null)
  }
}

// Re-export DB_READY so App.jsx can import it from one place
export { DB_READY } from './supabase.js'
