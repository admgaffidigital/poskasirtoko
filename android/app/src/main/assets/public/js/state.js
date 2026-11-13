/**
 * state.js — State Global & Penyimpanan Lokal
 * Mengelola sesi pengguna, keranjang aktif, status jaringan, dan pengaturan lokal
 */

const STORAGE_KEYS = {
  TOKEN: 'pos_token',
  USER: 'pos_user',
  CART: 'pos_active_cart',
  PENGATURAN: 'pos_pengaturan',
  TOKO: 'pos_toko'
};

class Store {
  constructor() {
    this.listeners = new Map();

    // Inisialisasi state awal (dengan fallback cache lokal persisten)
    this.state = {
      token: this.load(STORAGE_KEYS.TOKEN, ''),
      user: this.load(STORAGE_KEYS.USER, null),
      cart: this.load(STORAGE_KEYS.CART, []),
      isOnline: navigator.onLine,
      pengaturan: this.load(STORAGE_KEYS.PENGATURAN, null),
      toko: this.load(STORAGE_KEYS.TOKO, {
        nama: 'POS Toko',
        alamat: '',
        hp: '',
        nota_footer: ''
      })
    };

    // Pantau status online/offline
    window.addEventListener('online', () => {
      this.set('isOnline', true);
    });
    window.addEventListener('offline', () => {
      this.set('isOnline', false);
    });
  }

  load(key, fallback) {
    try {
      const val = localStorage.getItem(key);
      if (val === null || val === undefined) return fallback;
      try {
        return JSON.parse(val);
      } catch {
        return val;
      }
    } catch {
      return fallback;
    }
  }

  save(key, val) {
    try {
      if (typeof val === 'string') {
        localStorage.setItem(key, val);
      } else {
        localStorage.setItem(key, JSON.stringify(val));
      }
    } catch (e) {
      console.warn('Gagal menyimpan ke localStorage:', e);
    }
  }

  get(key) {
    return this.state[key];
  }

  set(key, val) {
    this.state[key] = val;

    // Sinkronisasi ke penyimpanan persisten jika perlu
    if (key === 'token') this.save(STORAGE_KEYS.TOKEN, val);
    if (key === 'user') this.save(STORAGE_KEYS.USER, val);
    if (key === 'cart') this.save(STORAGE_KEYS.CART, val);
    if (key === 'pengaturan') this.save(STORAGE_KEYS.PENGATURAN, val);
    if (key === 'toko') this.save(STORAGE_KEYS.TOKO, val);

    // Beritahu observer
    if (this.listeners.has(key)) {
      this.listeners.get(key).forEach((fn) => fn(val));
    }
  }

  getNamaToko() {
    return this.state.toko?.nama || this.state.pengaturan?.toko_nama || 'POS Toko';
  }

  setToko(toko) {
    const tokoBersih = {
      nama: (toko && toko.nama) ? String(toko.nama).trim() : (this.state.pengaturan?.toko_nama || 'POS Toko'),
      alamat: (toko && toko.alamat) ? String(toko.alamat).trim() : (this.state.pengaturan?.toko_alamat || ''),
      hp: (toko && toko.hp) ? String(toko.hp).trim() : (this.state.pengaturan?.toko_hp || ''),
      nota_footer: (toko && toko.nota_footer) ? String(toko.nota_footer).trim() : (this.state.pengaturan?.nota_footer || '')
    };
    this.set('toko', tokoBersih);
  }

  subscribe(key, callback) {
    if (!this.listeners.has(key)) {
      this.listeners.set(key, new Set());
    }
    this.listeners.get(key).add(callback);
    return () => this.listeners.get(key).delete(callback);
  }

  setUserSession(token, user) {
    this.set('token', token);
    this.set('user', user);
  }

  clearUserSession() {
    this.set('token', '');
    this.set('user', null);
  }

  // Keranjang Belanja Aktif (Local)
  setCart(items) {
    this.set('cart', items);
  }

  clearCart() {
    this.set('cart', []);
  }
}

export const store = new Store();

