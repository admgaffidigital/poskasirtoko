/**
 * state.js — State Global & Penyimpanan Lokal
 * Mengelola sesi pengguna, keranjang aktif, status jaringan, dan pengaturan lokal
 */

const STORAGE_KEYS = {
  TOKEN: 'pos_token',
  USER: 'pos_user',
  CART: 'pos_active_cart'
};

class Store {
  constructor() {
    this.listeners = new Map();

    // Inisialisasi state awal
    this.state = {
      token: this.load(STORAGE_KEYS.TOKEN, ''),
      user: this.load(STORAGE_KEYS.USER, null),
      cart: this.load(STORAGE_KEYS.CART, []),
      isOnline: navigator.onLine,
      pengaturan: null
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
      return val ? JSON.parse(val) : fallback;
    } catch {
      return fallback;
    }
  }

  save(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
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

    // Beritahu observer
    if (this.listeners.has(key)) {
      this.listeners.get(key).forEach((fn) => fn(val));
    }
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

