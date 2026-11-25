/**
 * offline-queue.js — Mode Offline Antrean Transaksi POS Kasir
 * Fitur:
 * - Menampung transaksi penjualan saat internet mati / sinyal terputus di localStorage
 * - Menghasilkan objek struk sementara (OFF-YYYYMMDD-XXXX) agar kasir tetap bisa cetak struk thermal saat offline
 * - Auto-Sync otomatis ke Google Sheets saat perangkat kembali online + tombol Sinkronkan Manual
 * - Modal manajemen antrean: pantau status, kirim ulang satuan/massal, cetak ulang struk offline, atau hapus
 */

import { apiCall } from '../api.js';
import { store } from '../state.js';
import { ICONS, showModal, showToast, showConfirm } from './ui.js';
import { formatRupiah, formatTanggal, escapeHtml } from './format.js';
import { bukaModalPilihanCetakPenjualan } from './printer.js';

const KEY_OFFLINE_QUEUE = 'pos_offline_tx_queue_v1';
let sedangSinkron = false;
let autoSyncTerpasang = false;

function broadcastQueueChange() {
  try {
    if (typeof window !== 'undefined' && typeof window.dispatchEvent === 'function') {
      window.dispatchEvent(new CustomEvent('pos-offline-queue-changed', {
        detail: { count: jumlahAntreanOffline() }
      }));
    }
  } catch (_) {}
}

/** Cek apakah error berasal dari offline / gangguan koneksi jaringan (bukan error validasi bisnis) */
export function adalahErrorJaringanOffline(errOrRes) {
  if (typeof navigator !== 'undefined' && navigator.onLine === false) return true;
  if (!errOrRes) return false;
  const code = String(errOrRes.code || '').toUpperCase();
  if (['OFFLINE', 'NETWORK_ERROR', 'TIMEOUT'].includes(code)) return true;
  const msg = String(errOrRes.error || errOrRes.message || '').toLowerCase();
  return (
    msg.includes('failed to fetch') ||
    msg.includes('networkerror') ||
    msg.includes('offline') ||
    msg.includes('gagal menghubungi server') ||
    msg.includes('timeout') ||
    msg.includes('tidak ada koneksi')
  );
}

/** Ambil daftar antrean transaksi offline yang belum terkirim ke server */
export function ambilAntreanOffline() {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(KEY_OFFLINE_QUEUE);
    const arr = raw ? JSON.parse(raw) : [];
    return Array.isArray(arr) ? arr : [];
  } catch (_) {
    return [];
  }
}

function simpanAntreanOffline(list) {
  try {
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(KEY_OFFLINE_QUEUE, JSON.stringify(list || []));
    }
  } catch (_) {}
  broadcastQueueChange();
}

/** Hitung jumlah transaksi di antrean offline */
export function jumlahAntreanOffline() {
  return ambilAntreanOffline().length;
}

/** Buat nomor nota sementara untuk transaksi offline */
function buatNomorNotaOffline() {
  const d = new Date();
  const ymd = d.getFullYear() +
    String(d.getMonth() + 1).padStart(2, '0') +
    String(d.getDate()).padStart(2, '0');
  const hms = String(d.getHours()).padStart(2, '0') +
    String(d.getMinutes()).padStart(2, '0') +
    String(d.getSeconds()).padStart(2, '0');
  const rand = String(Math.floor(Math.random() * 90 + 10));
  return `OFF-${ymd}-${hms.slice(-4)}${rand}`;
}

/** Tambahkan transaksi gagal jaringan ke antrean offline + kembalikan data struk sementara siap cetak */
export function tambahKeAntreanOffline(payload, info = {}) {
  const queue = ambilAntreanOffline();
  const localId = 'off_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6);
  const noNotaSementara = buatNomorNotaOffline();
  const waktuSekarang = new Date().toISOString();
  const cfg = store.get('pengaturan') || {};
  const tokoStore = store.get('toko') || {};
  const user = store.get('user') || {};

  const itemsDetail = Array.isArray(info.itemsDetail) ? info.itemsDetail : (payload.items || []);
  const grandTotal = Number(info.grandTotal || 0);
  const ongkir = Number(payload.ongkir || 0);
  const pembayaran = Array.isArray(payload.pembayaran) ? payload.pembayaran : [];
  const totalBayar = pembayaran.reduce((s, b) => s + (Number(b.jumlah) || 0), 0);
  const kembalian = Math.max(0, totalBayar - grandTotal);

  const dataStrukOffline = {
    is_offline_queue: true,
    toko: {
      nama: cfg.toko_nama || tokoStore.nama || 'Toko Bangunan',
      alamat: cfg.toko_alamat || tokoStore.alamat || '',
      hp: cfg.toko_hp || tokoStore.hp || '',
      nota_footer: cfg.nota_footer || tokoStore.nota_footer || ''
    },
    penjualan: {
      id: localId,
      no_nota: noNotaSementara,
      tanggal: waktuSekarang,
      kasir_nama: user.nama || user.username || 'Kasir',
      pelanggan_nama: info.pelangganNama || 'Pelanggan Umum',
      subtotal: Number(info.subtotal || grandTotal - ongkir),
      diskon_transaksi: Number(info.diskonTransaksi || 0),
      pajak: Number(info.pajak || 0),
      pembulatan: Number(info.pembulatan || 0),
      ongkir: ongkir,
      total: grandTotal,
      bayar: totalBayar,
      kembalian: kembalian,
      status_bayar: pembayaran.some((b) => b.metode === 'tempo') ? 'tempo' : 'lunas',
      pengiriman: payload.pengiriman || 'ambil',
      alamat_kirim: payload.alamat_kirim || '',
      catatan: (payload.catatan ? payload.catatan + ' ' : '') + '[ANTREAN OFFLINE]'
    },
    items: itemsDetail.map((it) => ({
      nama: it.nama || 'Produk',
      varian_nama: it.varian_nama || '',
      satuan: it.satuan || 'PCS',
      qty: Number(it.qty || 0),
      qty_dibawa: it.qty_dibawa !== undefined ? Number(it.qty_dibawa) : Number(it.qty || 0),
      harga: Number(it.harga || 0),
      subtotal: Math.round(Number(it.qty || 0) * Number(it.harga || 0))
    })),
    pembayaran: pembayaran
  };

  const entry = {
    localId,
    noNotaSementara,
    waktuDibuat: waktuSekarang,
    pelangganNama: info.pelangganNama || 'Pelanggan Umum',
    kasirNama: user.nama || user.username || 'Kasir',
    total: grandTotal,
    jumlahItem: (payload.items || []).length,
    payload,
    dataStrukOffline,
    lastError: '',
    percobaan: 0
  };

  queue.push(entry);
  simpanAntreanOffline(queue);
  return entry;
}

/** Hapus 1 transaksi dari antrean offline */
export function hapusDariAntreanOffline(localId) {
  const sisa = ambilAntreanOffline().filter((it) => it.localId !== localId);
  simpanAntreanOffline(sisa);
  return sisa;
}

/** Kirim 1 transaksi antrean offline ke server */
export async function kirimSatuAntreanOffline(localId) {
  const queue = ambilAntreanOffline();
  const idx = queue.findIndex((it) => it.localId === localId);
  if (idx === -1) return { ok: false, error: 'Item antrean tidak ditemukan.' };
  const target = queue[idx];

  try {
    const res = await apiCall('penjualan.create', target.payload);
    queue.splice(idx, 1);
    simpanAntreanOffline(queue);
    return { ok: true, data: res, noNotaBaru: res?.penjualan?.no_nota || '' };
  } catch (err) {
    queue[idx].percobaan = (Number(queue[idx].percobaan) || 0) + 1;
    queue[idx].lastError = err?.message || 'Gagal sinkron ke server';
    simpanAntreanOffline(queue);
    return { ok: false, error: queue[idx].lastError, isNetwork: adalahErrorJaringanOffline(err) };
  }
}

/** Sinkronkan seluruh antrean transaksi offline ke server secara berurutan */
export async function sinkronkanAntreanOffline({ senyap = false } = {}) {
  if (sedangSinkron) return { berhasil: 0, gagal: 0, sisa: jumlahAntreanOffline(), skipped: true };
  const awal = ambilAntreanOffline();
  if (!awal.length) return { berhasil: 0, gagal: 0, sisa: 0 };
  if (typeof navigator !== 'undefined' && navigator.onLine === false) {
    if (!senyap) showToast('Perangkat masih offline. Sambungkan internet lalu coba sinkronkan lagi.', 'warning');
    return { berhasil: 0, gagal: awal.length, sisa: awal.length };
  }
  if (!store.get('token')) {
    return { berhasil: 0, gagal: 0, sisa: awal.length, skipped: true };
  }

  sedangSinkron = true;
  let berhasil = 0;
  let gagal = 0;

  try {
    for (const item of awal) {
      const r = await kirimSatuAntreanOffline(item.localId);
      if (r.ok) {
        berhasil++;
      } else {
        gagal++;
        if (r.isNetwork) break; // Hentikan loop jika jaringan kembali putus
      }
    }
  } finally {
    sedangSinkron = false;
  }

  const sisa = jumlahAntreanOffline();
  if (!senyap) {
    if (berhasil > 0 && gagal === 0) {
      showToast(`${berhasil} transaksi offline berhasil disinkronkan ke server!`, 'success', 4000);
    } else if (berhasil > 0 && gagal > 0) {
      showToast(`${berhasil} transaksi tersinkron, ${gagal} masih tertahan di antrean.`, 'warning', 4500);
    } else if (gagal > 0) {
      showToast(`${gagal} transaksi offline gagal disinkronkan. Cek detail di modal Antrean Offline.`, 'error', 4500);
    }
  } else if (berhasil > 0) {
    showToast(`Auto-Sync: ${berhasil} transaksi offline berhasil dikirim ke server!`, 'success', 4000);
  }

  return { berhasil, gagal, sisa };
}

/** Pasang listener global agar transaksi offline otomatis terkirim saat perangkat kembali online */
export function inisialisasiAutoSyncAntreanOffline() {
  if (autoSyncTerpasang || typeof window === 'undefined') return;
  autoSyncTerpasang = true;
  window.addEventListener('online', () => {
    if (jumlahAntreanOffline() > 0) {
      setTimeout(() => {
        sinkronkanAntreanOffline({ senyap: true }).catch(() => {});
      }, 2200);
    }
  });
}

/** Buka Modal Manajemen Antrean Transaksi Offline */
export function bukaModalAntreanOffline({ onSelesai = null } = {}) {
  const modal = showModal({
    title: 'Antrean Transaksi Offline',
    size: 'lg',
    body: `
      <div class="stack">
        <div class="alert alert-info text-xs">
          ${ICONS.cloud}
          <div>
            Transaksi yang tersimpan saat koneksi terputus akan <strong>otomatis dikirim ke server saat perangkat kembali online</strong>. Anda juga dapat menekan tombol <strong>Sinkronkan Semua</strong> di bawah ini kapan saja.
          </div>
        </div>
        <div id="list-antrean-offline" class="stack-sm"></div>
      </div>
    `,
    footer: `
      <div class="row-between" style="width: 100%; gap: var(--sp-2); flex-wrap: wrap;">
        <button type="button" class="btn btn-outline btn-sm btn-cancel">Tutup</button>
        <button type="button" class="btn btn-primary btn-sm" id="btn-sync-semua-offline" style="display: inline-flex; align-items: center; gap: 6px;">
          ${ICONS.refresh}
          <span>Sinkronkan Semua Sekarang</span>
        </button>
      </div>
    `
  });

  const listEl = modal.el.querySelector('#list-antrean-offline');
  const btnSyncAll = modal.el.querySelector('#btn-sync-semua-offline');

  const renderList = () => {
    const queue = ambilAntreanOffline();
    if (btnSyncAll) btnSyncAll.disabled = queue.length === 0;
    if (!queue.length) {
      listEl.innerHTML = `
        <div class="card card-body text-center stack-sm" style="padding: var(--sp-5); background: var(--surface-2);">
          <div style="color: var(--success); margin: 0 auto;">${ICONS.checkCircle}</div>
          <div class="fw-bold text-sm">Tidak Ada Antrean Offline</div>
          <div class="text-xs text-muted">Seluruh transaksi kasir telah tersinkron dengan aman ke server Cloud.</div>
        </div>
      `;
      return;
    }

    listEl.innerHTML = queue.map((it) => `
      <div class="card card-body stack-sm" style="background: var(--surface-2); padding: var(--sp-3); border: 1px solid ${it.lastError ? 'var(--danger)' : 'var(--border)'};">
        <div class="row-between" style="gap: var(--sp-2); flex-wrap: wrap;">
          <div>
            <div class="row" style="gap: 6px; align-items: center;">
              <span class="badge badge-warning mono">${escapeHtml(it.noNotaSementara)}</span>
              <span class="fw-bold text-sm">${escapeHtml(it.pelangganNama)}</span>
            </div>
            <div class="text-xs text-muted" style="margin-top: 2px;">
              ${formatTanggal(it.waktuDibuat, true)} • Kasir: ${escapeHtml(it.kasirNama)} • ${it.jumlahItem} item
            </div>
          </div>
          <div class="fw-bold mono text-primary" style="font-size: var(--fs-md);">${formatRupiah(it.total)}</div>
        </div>
        ${it.lastError ? `<div class="text-xs text-danger">Gagal sinkron terakhir: ${escapeHtml(it.lastError)}</div>` : ''}
        <div class="row" style="gap: var(--sp-2); justify-content: flex-end; flex-wrap: wrap;">
          <button type="button" class="btn btn-secondary btn-xs btn-off-cetak" data-id="${escapeHtml(it.localId)}" style="display: inline-flex; align-items: center; gap: 4px;">
            ${ICONS.printer}
            <span>Struk</span>
          </button>
          <button type="button" class="btn btn-primary btn-xs btn-off-kirim" data-id="${escapeHtml(it.localId)}" style="display: inline-flex; align-items: center; gap: 4px;">
            ${ICONS.upload}
            <span>Kirim</span>
          </button>
          <button type="button" class="btn btn-ghost btn-xs text-danger btn-off-hapus" data-id="${escapeHtml(it.localId)}" title="Hapus dari antrean">
            ${ICONS.trash}
          </button>
        </div>
      </div>
    `).join('');

    listEl.querySelectorAll('.btn-off-cetak').forEach((btn) => {
      btn.addEventListener('click', () => {
        const found = ambilAntreanOffline().find((x) => x.localId === btn.getAttribute('data-id'));
        if (found?.dataStrukOffline) {
          bukaModalPilihanCetakPenjualan(found.dataStrukOffline, { isNewTransaction: false });
        }
      });
    });

    listEl.querySelectorAll('.btn-off-kirim').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const lid = btn.getAttribute('data-id');
        btn.disabled = true;
        const r = await kirimSatuAntreanOffline(lid);
        if (r.ok) {
          showToast(`Transaksi tersinkron! Nota resmi: ${r.noNotaBaru || 'OK'}`, 'success');
          if (typeof onSelesai === 'function') onSelesai();
        } else {
          showToast('Gagal mengirim transaksi: ' + r.error, 'error');
        }
        renderList();
      });
    });

    listEl.querySelectorAll('.btn-off-hapus').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const lid = btn.getAttribute('data-id');
        const ok = await showConfirm({
          title: 'Hapus Transaksi Antrean Offline?',
          message: 'Transaksi ini belum tersimpan di server. Jika dihapus, data transaksi tidak akan masuk ke laporan penjualan.',
          confirmText: 'Ya, Hapus',
          danger: true
        });
        if (!ok) return;
        hapusDariAntreanOffline(lid);
        renderList();
        showToast('Transaksi dihapus dari antrean offline.', 'info');
      });
    });
  };

  btnSyncAll?.addEventListener('click', async () => {
    btnSyncAll.disabled = true;
    const res = await sinkronkanAntreanOffline({ senyap: false });
    renderList();
    if (res.berhasil > 0 && typeof onSelesai === 'function') onSelesai();
  });

  renderList();
}
