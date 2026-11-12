/**
 * routes.js — Definisi Rute, Menu, Peran & Fase Roadmap
 * Mengikuti pembagian modul dan matriks hak akses README bagian 5 & 17
 */

import { ICONS } from './utils/ui.js';

export const ROUTES = [
  // ---- Modul Utama ----
  {
    path: '#/pos',
    id: 'pos',
    title: 'POS Kasir',
    shortTitle: 'Kasir',
    icon: ICONS.cashier,
    roles: ['owner', 'admin', 'kasir'],
    fase: 'Fase 2',
    inBottomNav: true,
    group: 'Transaksi'
  },
  {
    path: '#/dashboard',
    id: 'dashboard',
    title: 'Dashboard Laporan',
    shortTitle: 'Laporan',
    icon: ICONS.chart,
    roles: ['owner', 'admin'],
    fase: 'Fase 6',
    inBottomNav: true,
    group: 'Transaksi'
  },
  {
    path: '#/produk',
    id: 'produk',
    title: 'Manajemen Produk',
    shortTitle: 'Produk',
    icon: ICONS.box,
    roles: ['owner', 'admin', 'kasir'],
    fase: 'Fase 1',
    inBottomNav: true,
    group: 'Katalog & Stok'
  },
  {
    path: '#/pembelian',
    id: 'pembelian',
    title: 'POS Pembelian',
    shortTitle: 'Beli',
    icon: ICONS.shoppingBag,
    roles: ['owner', 'admin'],
    fase: 'Fase 3',
    inBottomNav: true,
    group: 'Katalog & Stok'
  },
  {
    path: '#/lainnya',
    id: 'lainnya',
    title: 'Menu Lainnya',
    shortTitle: 'Lainnya',
    icon: ICONS.grid,
    roles: ['owner', 'admin', 'kasir'],
    fase: 'Fase 0',
    inBottomNav: true,
    group: 'Navigasi'
  },

  // ---- Katalog & Stok ----
  {
    path: '#/kategori',
    id: 'kategori',
    title: 'Kategori Produk',
    shortTitle: 'Kategori',
    icon: ICONS.tag,
    roles: ['owner', 'admin'],
    fase: 'Fase 1',
    inBottomNav: false,
    group: 'Katalog & Stok'
  },
  {
    path: '#/kartu-stok',
    id: 'kartu-stok',
    title: 'Kartu Stok',
    shortTitle: 'Kartu Stok',
    icon: ICONS.clipboard,
    roles: ['owner', 'admin'],
    fase: 'Fase 3',
    inBottomNav: false,
    group: 'Katalog & Stok'
  },
  {
    path: '#/opname',
    id: 'opname',
    title: 'Stok Opname',
    shortTitle: 'Opname',
    icon: ICONS.clipboard,
    roles: ['owner', 'admin'],
    fase: 'Fase 3',
    inBottomNav: false,
    group: 'Katalog & Stok'
  },
  {
    path: '#/pricetag',
    id: 'pricetag',
    title: 'Price Tag Harga',
    shortTitle: 'Price Tag',
    icon: ICONS.printer,
    roles: ['owner', 'admin'],
    fase: 'Fase 5',
    inBottomNav: false,
    group: 'Katalog & Stok'
  },

  // ---- Mitra & Pelanggan ----
  {
    path: '#/pelanggan',
    id: 'pelanggan',
    title: 'Pelanggan & Member',
    shortTitle: 'Pelanggan',
    icon: ICONS.users,
    roles: ['owner', 'admin', 'kasir'],
    fase: 'Fase 5',
    inBottomNav: false,
    group: 'Mitra & Loyalitas'
  },
  {
    path: '#/loyalti',
    id: 'loyalti',
    title: 'Poin & Hadiah Member',
    shortTitle: 'Hadiah',
    icon: ICONS.award,
    roles: ['owner', 'admin', 'kasir'],
    fase: 'Fase 5',
    inBottomNav: false,
    group: 'Mitra & Loyalitas'
  },
  {
    path: '#/supplier',
    id: 'supplier',
    title: 'Data Supplier',
    shortTitle: 'Supplier',
    icon: ICONS.truck,
    roles: ['owner', 'admin'],
    fase: 'Fase 3',
    inBottomNav: false,
    group: 'Mitra & Loyalitas'
  },

  // ---- Keuangan ----
  {
    path: '#/hutang-piutang',
    id: 'hutang-piutang',
    title: 'Hutang & Piutang',
    shortTitle: 'Hutang-Piutang',
    icon: ICONS.wallet,
    roles: ['owner', 'admin', 'kasir'],
    fase: 'Fase 4',
    inBottomNav: false,
    group: 'Keuangan'
  },
  {
    path: '#/retur',
    id: 'retur',
    title: 'Retur Jual & Beli',
    shortTitle: 'Retur',
    icon: ICONS.rotateCcw,
    roles: ['owner', 'admin', 'kasir'],
    fase: 'Fase 4',
    inBottomNav: false,
    group: 'Keuangan'
  },

  // ---- Pengaturan & Sistem ----
  {
    path: '#/pengaturan',
    id: 'pengaturan',
    title: 'Pengaturan Umum',
    shortTitle: 'Pengaturan',
    icon: ICONS.settings,
    roles: ['owner'],
    fase: 'Fase 1',
    inBottomNav: false,
    group: 'Sistem'
  },
  {
    path: '#/users',
    id: 'users',
    title: 'Manajemen Pengguna',
    shortTitle: 'Pengguna',
    icon: ICONS.userCheck,
    roles: ['owner'],
    fase: 'Fase 1',
    inBottomNav: false,
    group: 'Sistem'
  },
  {
    path: '#/sistem',
    id: 'sistem',
    title: 'Status & Diagnostik Sistem',
    shortTitle: 'Status Sistem',
    icon: ICONS.database,
    roles: ['owner', 'admin', 'kasir'],
    fase: 'Fase 0',
    inBottomNav: false,
    group: 'Sistem'
  },
  {
    path: '#/desainsistem',
    id: 'desainsistem',
    title: 'Design System & Galeri Komponen',
    shortTitle: 'Design System',
    icon: ICONS.grid,
    roles: ['owner', 'admin', 'kasir'],
    fase: 'Fase 0',
    inBottomNav: false,
    group: 'Sistem'
  }
];

export function cariRute(hash) {
  const cleanHash = (hash || '#/pos').split('?')[0];
  return ROUTES.find((r) => r.path === cleanHash) || ROUTES[0];
}
