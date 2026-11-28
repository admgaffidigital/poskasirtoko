/**
 * katalog-publik.js — Etalase Katalog Produk Online Publik + Keranjang Order WhatsApp
 * Tanpa login, aman (tidak pernah menerima HPP atau jumlah stok internal),
 * cepat (SWR cache localStorage + cache server GAS), dan responsif HP/Desktop.
 */

import { CONFIG } from './config.js';
import { ICONS, showToast, showModal } from './utils/ui.js';
import { escapeHtml, formatRupiah, formatQty, optimalkanUrlFoto } from './utils/format.js';

const CACHE_KEY = 'pos_katalog_publik_v1';
const CART_KEY = 'pos_katalog_cart_v1';
const THEME_KEY = 'katalog_publik_theme';

const state = {
  toko: { nama: 'Toko Bangunan', alamat: '', hp: '', logo: '', nota_footer: '' },
  kategori: [],
  produk: [],
  diperbarui: '',
  q: '',
  parentKatId: '',
  subKatId: '',
  filterStatus: 'semua', // semua | tersedia | grosir
  sort: 'terbaru',
  limitTampil: 24,
  cart: []
};

function muatCartLokal() {
  try {
    const raw = localStorage.getItem(CART_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch (_) {
    return [];
  }
}

function simpanCartLokal() {
  try {
    localStorage.setItem(CART_KEY, JSON.stringify(state.cart));
  } catch (_) {}
}

function formatNomorWa(hp) {
  const digits = String(hp || '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.startsWith('62')) return digits;
  if (digits.startsWith('0')) return '62' + digits.slice(1);
  if (digits.startsWith('8')) return '62' + digits;
  return digits;
}

function ambilHargaEfektifItem(item) {
  const qty = Number(item.qty || 1);
  const minGrosir = Number(item.min_grosir_qty || 0);
  const hargaRitel = Number(item.harga_ritel || 0);
  const hargaGrosir = Number(item.harga_grosir || 0);
  const pakaiGrosir = hargaGrosir > 0 && minGrosir > 0 && qty >= minGrosir;
  return {
    harga: pakaiGrosir ? hargaGrosir : hargaRitel,
    pakaiGrosir
  };
}

function hitungRingkasanCart() {
  let totalItem = 0;
  let totalQty = 0;
  let totalHarga = 0;
  state.cart.forEach((it) => {
    const q = Math.max(0.001, Number(it.qty) || 1);
    const { harga } = ambilHargaEfektifItem(it);
    totalItem += 1;
    totalQty += q;
    totalHarga += Math.round(q * harga);
  });
  return { totalItem, totalQty, totalHarga };
}

function tambahKeCart(entry) {
  const key = `${entry.produk_id}__${entry.varian_id || ''}__${entry.satuan || ''}`;
  const existing = state.cart.find((c) => c.key === key);
  if (existing) {
    existing.qty = Math.round((Number(existing.qty || 0) + Number(entry.qty || 1)) * 1000) / 1000;
  } else {
    state.cart.push({ ...entry, key, qty: Math.max(0.001, Number(entry.qty || 1)) });
  }
  simpanCartLokal();
  perbaruiRingkasanCartUI();
  showToast(`"${entry.nama}" masuk keranjang pesanan.`, 'success', 1800);
}

function ambilDataKatalogCache() {
  try {
    const raw = localStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const obj = JSON.parse(raw);
    if (obj && obj.data && Array.isArray(obj.data.produk)) return obj.data;
  } catch (_) {}
  return null;
}

function simpanDataKatalogCache(data) {
  try {
    localStorage.setItem(CACHE_KEY, JSON.stringify({ savedAt: Date.now(), data }));
  } catch (_) {}
}

async function fetchKatalogPublik() {
  const apiUrl = CONFIG.API_URL;
  if (!apiUrl) throw new Error('Alamat server katalog belum dikonfigurasi.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CONFIG.API_TIMEOUT_MS || 25000);
  try {
    const res = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify({ action: 'katalog.publik', payload: {} }),
      signal: controller.signal
    });
    clearTimeout(timer);
    if (!res.ok) throw new Error(`Server mengembalikan HTTP ${res.status}`);
    const json = await res.json();
    if (!json || json.ok !== true || !json.data) {
      throw new Error((json && json.error) || 'Gagal memuat katalog produk.');
    }
    return json.data;
  } catch (err) {
    clearTimeout(timer);
    if (err.name === 'AbortError') throw new Error('Koneksi ke server melebihi batas waktu. Coba muat ulang.');
    throw err;
  }
}

function terapkanDataKatalog(data) {
  if (!data) return;
  state.toko = data.toko || state.toko;
  state.kategori = Array.isArray(data.kategori) ? data.kategori : [];
  state.produk = Array.isArray(data.produk) ? data.produk : [];
  state.diperbarui = data.diperbarui || '';
  document.title = `Katalog Online | ${state.toko.nama || 'Toko Bangunan'}`;
}

function getKatMap() {
  const m = new Map();
  state.kategori.forEach((k) => {
    if (k && k.id) m.set(k.id, k);
  });
  return m;
}

function getNamaKategoriLengkap(katId, katMap) {
  if (!katId || !katMap.has(katId)) return 'Produk Toko';
  const k = katMap.get(katId);
  if (k.parent_id && katMap.has(k.parent_id)) {
    return `${katMap.get(k.parent_id).nama} > ${k.nama}`;
  }
  return k.nama;
}

function ambilProdukTersaring() {
  const katMap = getKatMap();
  let list = [...state.produk];

  // Filter kategori / sub-kategori
  if (state.subKatId) {
    list = list.filter((p) => p.kategori_id === state.subKatId);
  } else if (state.parentKatId) {
    const validIds = new Set([state.parentKatId]);
    state.kategori.forEach((k) => {
      if (k.parent_id === state.parentKatId) validIds.add(k.id);
    });
    list = list.filter((p) => validIds.has(p.kategori_id));
  }

  // Filter cepat
  if (state.filterStatus === 'tersedia') {
    list = list.filter((p) => p.tersedia);
  } else if (state.filterStatus === 'grosir') {
    list = list.filter((p) => {
      if (Number(p.harga_grosir || 0) > 0) return true;
      return Array.isArray(p.varian) && p.varian.some((v) => Number(v.harga_grosir || 0) > 0);
    });
  }

  // Pencarian
  const q = state.q.trim().toLowerCase();
  if (q) {
    list = list.filter((p) => {
      if (String(p.nama || '').toLowerCase().includes(q)) return true;
      if (String(p.sku || '').toLowerCase().includes(q)) return true;
      const katText = getNamaKategoriLengkap(p.kategori_id, katMap).toLowerCase();
      if (katText.includes(q)) return true;
      if (Array.isArray(p.varian) && p.varian.some((v) => String(v.nama_varian || '').toLowerCase().includes(q))) return true;
      return false;
    });
  }

  // Urutkan
  const getMinHarga = (p) => {
    if (p.punya_varian && Array.isArray(p.varian) && p.varian.length > 0) {
      return Math.min(...p.varian.map((v) => Number(v.harga_ritel || 0)));
    }
    return Number(p.harga_ritel || 0);
  };

  if (state.sort === 'harga_asc') {
    list.sort((a, b) => getMinHarga(a) - getMinHarga(b));
  } else if (state.sort === 'harga_desc') {
    list.sort((a, b) => getMinHarga(b) - getMinHarga(a));
  } else if (state.sort === 'nama_asc') {
    list.sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || '')));
  } else {
    list.sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')));
  }

  return list;
}

function toggleTemaPublik() {
  const urutan = ['warm', 'light', 'dark'];
  const cur = document.documentElement.getAttribute('data-theme') || 'warm';
  const next = urutan[(urutan.indexOf(cur) + 1) % urutan.length];
  document.documentElement.setAttribute('data-theme', next);
  try { localStorage.setItem(THEME_KEY, next); } catch (_) {}
  const label = next === 'warm' ? 'Terang Hangat' : (next === 'dark' ? 'Gelap Malam' : 'Terang Sejuk');
  showToast(`Tampilan: ${label}`, 'info', 1500);
}

function bukaModalPilihOpsiProduk(produk) {
  const katMap = getKatMap();
  const hasVarian = produk.punya_varian && Array.isArray(produk.varian) && produk.varian.length > 0;
  const satuanKonv = Array.isArray(produk.satuan_konversi) ? produk.satuan_konversi : [];
  const daftarSatuan = [
    {
      satuan: produk.satuan_dasar || 'PCS',
      faktor: 1,
      harga_ritel: Number(produk.harga_ritel || 0),
      harga_grosir: Number(produk.harga_grosir || 0)
    },
    ...satuanKonv
  ];

  let selectedVar = hasVarian ? (produk.varian.find((v) => v.tersedia) || produk.varian[0]) : null;
  let selectedSat = daftarSatuan[0];
  let qtyVal = 1;

  const fotoUrl = produk.foto_url ? optimalkanUrlFoto(produk.foto_url, 600) : '';

  const modal = showModal({
    title: escapeHtml(produk.nama),
    size: 'md',
    body: `
      <div class="stack" style="gap: var(--sp-3);">
        <div class="row" style="gap: var(--sp-3); align-items: center;">
          <div style="width: 78px; height: 78px; border-radius: var(--radius-lg); border: 1px solid var(--border); background: var(--surface-2); overflow: hidden; display: grid; place-items: center; flex-shrink: 0;">
            ${fotoUrl
              ? `<img src="${escapeHtml(fotoUrl)}" alt="${escapeHtml(produk.nama)}" style="width: 100%; height: 100%; object-fit: cover;">`
              : `<span style="color: var(--text-muted);">${ICONS.box}</span>`}
          </div>
          <div class="grow" style="min-width: 0;">
            <div class="text-xs text-muted">${escapeHtml(getNamaKategoriLengkap(produk.kategori_id, katMap))}</div>
            <div class="fw-bold text-md" style="margin-top: 2px;">${escapeHtml(produk.nama)}</div>
            <div class="mono fw-bold" id="kp-opt-harga" style="font-size: var(--fs-lg); color: var(--primary); margin-top: 4px;"></div>
            <div class="text-xs" id="kp-opt-grosir" style="color: var(--success); margin-top: 2px;"></div>
          </div>
        </div>

        ${hasVarian ? `
          <div class="field" style="margin-bottom: 0;">
            <label class="field-label">Pilih Varian:</label>
            <div class="row" id="kp-opt-varian-list" style="gap: 6px; flex-wrap: wrap;">
              ${produk.varian.map((v, idx) => `
                <button type="button" class="kp-chip ${selectedVar && selectedVar.id === v.id ? 'is-active' : ''}" data-var-idx="${idx}">
                  <span>${escapeHtml(v.nama_varian)}</span>
                  <span class="mono" style="opacity: 0.85;">(${formatRupiah(v.harga_ritel)})</span>
                </button>
              `).join('')}
            </div>
          </div>
        ` : ''}

        ${!hasVarian && daftarSatuan.length > 1 ? `
          <div class="field" style="margin-bottom: 0;">
            <label class="field-label">Pilih Satuan:</label>
            <div class="row" id="kp-opt-satuan-list" style="gap: 6px; flex-wrap: wrap;">
              ${daftarSatuan.map((s, idx) => `
                <button type="button" class="kp-chip ${idx === 0 ? 'is-active' : ''}" data-sat-idx="${idx}">
                  <span>${escapeHtml(s.satuan)}</span>
                  <span class="mono" style="opacity: 0.85;">(${formatRupiah(s.harga_ritel)})</span>
                </button>
              `).join('')}
            </div>
          </div>
        ` : ''}

        <div class="row-between" style="align-items: center; padding: var(--sp-3); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-md);">
          <span class="fw-semibold text-sm">Jumlah Pesanan</span>
          <div class="kp-qty-ctrl">
            <button type="button" id="kp-opt-minus" aria-label="Kurangi">-</button>
            <input type="number" id="kp-opt-qty" value="1" min="0.1" step="any">
            <button type="button" id="kp-opt-plus" aria-label="Tambah">+</button>
          </div>
        </div>
      </div>
    `,
    footer: `
      <button type="button" class="btn btn-secondary btn-sm" id="kp-opt-batal">Tutup</button>
      <button type="button" class="btn btn-primary btn-sm" id="kp-opt-add" style="display: inline-flex; align-items: center; gap: 6px;">
        ${ICONS.plus}
        <span>Tambah ke Keranjang</span>
      </button>
    `
  });

  const elHarga = modal.el.querySelector('#kp-opt-harga');
  const elGrosir = modal.el.querySelector('#kp-opt-grosir');
  const elQty = modal.el.querySelector('#kp-opt-qty');

  const getCurrentPricing = () => {
    const hRitel = hasVarian ? Number(selectedVar?.harga_ritel || 0) : Number(selectedSat?.harga_ritel || produk.harga_ritel || 0);
    const hGrosir = hasVarian ? Number(selectedVar?.harga_grosir || 0) : Number(selectedSat?.harga_grosir || produk.harga_grosir || 0);
    const minG = Number(produk.min_grosir_qty || 0);
    const unit = hasVarian ? (produk.satuan_dasar || 'PCS') : (selectedSat?.satuan || produk.satuan_dasar || 'PCS');
    return { hRitel, hGrosir, minG, unit };
  };

  const syncPreview = () => {
    const { hRitel, hGrosir, minG, unit } = getCurrentPricing();
    const pakaiGrosir = hGrosir > 0 && minG > 0 && qtyVal >= minG;
    if (elHarga) {
      elHarga.innerHTML = `${formatRupiah(pakaiGrosir ? hGrosir : hRitel)} <span class="kp-card-unit">/ ${escapeHtml(unit)}</span>`;
    }
    if (elGrosir) {
      if (hGrosir > 0 && minG > 0) {
        elGrosir.textContent = pakaiGrosir
          ? `Harga grosir aktif (min. ${formatQty(minG)} ${unit})`
          : `Harga grosir ${formatRupiah(hGrosir)} mulai ${formatQty(minG)} ${unit}`;
      } else {
        elGrosir.textContent = '';
      }
    }
  };

  modal.el.querySelectorAll('[data-var-idx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-var-idx'), 10);
      selectedVar = produk.varian[idx] || produk.varian[0];
      modal.el.querySelectorAll('[data-var-idx]').forEach((b) => b.classList.toggle('is-active', b === btn));
      syncPreview();
    });
  });

  modal.el.querySelectorAll('[data-sat-idx]').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = parseInt(btn.getAttribute('data-sat-idx'), 10);
      selectedSat = daftarSatuan[idx] || daftarSatuan[0];
      modal.el.querySelectorAll('[data-sat-idx]').forEach((b) => b.classList.toggle('is-active', b === btn));
      syncPreview();
    });
  });

  modal.el.querySelector('#kp-opt-minus')?.addEventListener('click', () => {
    qtyVal = Math.max(1, Math.round((qtyVal - 1) * 1000) / 1000);
    if (elQty) elQty.value = String(qtyVal);
    syncPreview();
  });

  modal.el.querySelector('#kp-opt-plus')?.addEventListener('click', () => {
    qtyVal = Math.round((qtyVal + 1) * 1000) / 1000;
    if (elQty) elQty.value = String(qtyVal);
    syncPreview();
  });

  elQty?.addEventListener('input', () => {
    const n = parseFloat(elQty.value);
    if (isFinite(n) && n > 0) {
      qtyVal = n;
      syncPreview();
    }
  });

  modal.el.querySelector('#kp-opt-batal')?.addEventListener('click', () => modal.close());
  modal.el.querySelector('#kp-opt-add')?.addEventListener('click', () => {
    const { hRitel, hGrosir, minG, unit } = getCurrentPricing();
    tambahKeCart({
      produk_id: produk.id,
      varian_id: selectedVar ? selectedVar.id : '',
      nama: selectedVar ? `${produk.nama} (${selectedVar.nama_varian})` : produk.nama,
      satuan: unit,
      harga_ritel: hRitel,
      harga_grosir: hGrosir,
      min_grosir_qty: minG,
      qty: qtyVal
    });
    modal.close();
  });

  syncPreview();
}

function susunPesanWhatsApp({ namaPemesan, pengiriman, alamat, catatan }) {
  const { totalHarga } = hitungRingkasanCart();
  const garis = '------------------------------';
  const baris = [
    `Halo *${state.toko.nama || 'Toko Bangunan'}*,`,
    'Saya ingin memesan barang dari Katalog Online:',
    garis
  ];

  state.cart.forEach((it, idx) => {
    const { harga, pakaiGrosir } = ambilHargaEfektifItem(it);
    const sub = Math.round((Number(it.qty) || 1) * harga);
    baris.push(
      `${idx + 1}. *${it.nama}*`,
      `   ${formatQty(it.qty)} ${it.satuan} x ${formatRupiah(harga)}${pakaiGrosir ? ' (Grosir)' : ''} = *${formatRupiah(sub)}*`
    );
  });

  baris.push(
    garis,
    `*Estimasi Total: ${formatRupiah(totalHarga)}*`,
    '',
    `Nama Pemesan : ${namaPemesan || '-'}`,
    `Pengambilan  : ${pengiriman === 'dikirim' ? 'Minta Diantar' : 'Ambil di Toko'}`
  );
  if (pengiriman === 'dikirim' && alamat) {
    baris.push(`Alamat Kirim : ${alamat}`);
  }
  if (catatan) {
    baris.push(`Catatan      : ${catatan}`);
  }
  baris.push('', 'Mohon konfirmasi ketersediaan & total akhirnya ya. Terima kasih.');
  return baris.join('\n');
}

function bukaModalKeranjang() {
  const waNum = formatNomorWa(state.toko.hp);

  const modal = showModal({
    title: 'Keranjang Pesanan WhatsApp',
    size: 'md',
    body: `
      <div class="stack" style="gap: var(--sp-3);">
        <div id="kp-cart-list"></div>

        <div id="kp-cart-checkout-area" class="stack" style="gap: var(--sp-3); display: none;">
          <div class="row-between" style="padding: var(--sp-3); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-md);">
            <span class="fw-semibold text-sm">Estimasi Total Belanja</span>
            <span class="mono fw-bold" id="kp-cart-grand-total" style="font-size: var(--fs-lg); color: var(--primary);">Rp 0</span>
          </div>

          <div class="form-grid cols-2">
            <div class="field" style="margin-bottom: 0;">
              <label class="field-label" for="kp-buyer-nama">Nama Pemesan <span class="wajib">*</span></label>
              <input type="text" class="input input-sm" id="kp-buyer-nama" placeholder="Nama Anda / Proyek" autocomplete="name">
            </div>
            <div class="field" style="margin-bottom: 0;">
              <label class="field-label" for="kp-buyer-kirim">Pengambilan Barang</label>
              <select class="select select-sm" id="kp-buyer-kirim">
                <option value="ambil">Ambil di Toko</option>
                <option value="dikirim">Minta Diantar ke Lokasi</option>
              </select>
            </div>
          </div>

          <div class="field" id="kp-wrap-alamat" style="margin-bottom: 0; display: none;">
            <label class="field-label" for="kp-buyer-alamat">Alamat Pengiriman <span class="wajib">*</span></label>
            <input type="text" class="input input-sm" id="kp-buyer-alamat" placeholder="Alamat lengkap / patokan lokasi proyek">
          </div>

          <div class="field" style="margin-bottom: 0;">
            <label class="field-label" for="kp-buyer-catatan">Catatan Tambahan (Opsional)</label>
            <input type="text" class="input input-sm" id="kp-buyer-catatan" placeholder="Cth: Mohon dikirim pagi / konfirmasi ongkir">
          </div>
        </div>
      </div>
    `,
    footer: `
      <div class="row-between" style="width: 100%; gap: var(--sp-2); flex-wrap: wrap;">
        <button type="button" class="btn btn-ghost btn-sm" id="kp-cart-clear" style="color: var(--danger);">Kosongkan</button>
        <div class="row" style="gap: var(--sp-2); flex-wrap: wrap;">
          <button type="button" class="btn btn-secondary btn-sm" id="kp-cart-copy" style="display: inline-flex; align-items: center; gap: 6px;">
            ${ICONS.clipboard}
            <span>Salin Pesanan</span>
          </button>
          <button type="button" class="btn btn-primary btn-sm" id="kp-cart-send-wa" style="display: inline-flex; align-items: center; gap: 6px;">
            ${ICONS.messageCircle}
            <span>Kirim via WhatsApp</span>
          </button>
        </div>
      </div>
    `
  });

  const elList = modal.el.querySelector('#kp-cart-list');
  const elCheckoutArea = modal.el.querySelector('#kp-cart-checkout-area');
  const elTotal = modal.el.querySelector('#kp-cart-grand-total');
  const elNama = modal.el.querySelector('#kp-buyer-nama');
  const elKirim = modal.el.querySelector('#kp-buyer-kirim');
  const elWrapAlamat = modal.el.querySelector('#kp-wrap-alamat');
  const elAlamat = modal.el.querySelector('#kp-buyer-alamat');
  const elCatatan = modal.el.querySelector('#kp-buyer-catatan');
  const btnClear = modal.el.querySelector('#kp-cart-clear');
  const btnCopy = modal.el.querySelector('#kp-cart-copy');
  const btnSendWa = modal.el.querySelector('#kp-cart-send-wa');

  elKirim?.addEventListener('change', () => {
    if (elWrapAlamat) elWrapAlamat.style.display = elKirim.value === 'dikirim' ? '' : 'none';
  });

  const renderCartIsi = () => {
    const { totalHarga } = hitungRingkasanCart();
    const kosong = state.cart.length === 0;
    if (elCheckoutArea) elCheckoutArea.style.display = kosong ? 'none' : 'flex';
    if (btnClear) btnClear.style.display = kosong ? 'none' : '';
    if (btnCopy) btnCopy.disabled = kosong;
    if (btnSendWa) btnSendWa.disabled = kosong;
    if (elTotal) elTotal.textContent = formatRupiah(totalHarga);

    if (kosong) {
      elList.innerHTML = `
        <div class="text-center" style="padding: var(--sp-6) var(--sp-3); color: var(--text-muted);">
          <div style="margin-bottom: var(--sp-2);">${ICONS.cart}</div>
          <div class="fw-semibold text-sm">Keranjang pesanan masih kosong</div>
          <div class="text-xs" style="margin-top: 4px;">Pilih produk di katalog untuk mulai menyusun daftar belanja Anda.</div>
        </div>
      `;
      return;
    }

    elList.innerHTML = state.cart.map((it, idx) => {
      const { harga, pakaiGrosir } = ambilHargaEfektifItem(it);
      const sub = Math.round((Number(it.qty) || 1) * harga);
      return `
        <div class="kp-cart-row" data-cart-idx="${idx}">
          <div class="grow" style="min-width: 0;">
            <div class="fw-semibold text-sm">${escapeHtml(it.nama)}</div>
            <div class="text-xs text-muted mono">
              ${formatRupiah(harga)} / ${escapeHtml(it.satuan)}
              ${pakaiGrosir ? `<span class="badge badge-success text-2xs" style="margin-left: 4px;">Grosir</span>` : ''}
            </div>
            <div class="mono fw-bold text-xs" style="color: var(--primary); margin-top: 2px;">Subtotal: ${formatRupiah(sub)}</div>
          </div>
          <div class="row" style="gap: 6px; align-items: center; flex-shrink: 0;">
            <div class="kp-qty-ctrl">
              <button type="button" class="btn-c-min" data-idx="${idx}" aria-label="Kurangi">-</button>
              <input type="number" class="inp-c-qty" data-idx="${idx}" value="${it.qty}" min="0.1" step="any">
              <button type="button" class="btn-c-plus" data-idx="${idx}" aria-label="Tambah">+</button>
            </div>
            <button type="button" class="btn btn-ghost btn-xs btn-icon btn-c-del" data-idx="${idx}" title="Hapus" style="color: var(--danger);">${ICONS.trash}</button>
          </div>
        </div>
      `;
    }).join('');

    elList.querySelectorAll('.btn-c-min').forEach((b) => {
      b.addEventListener('click', () => {
        const idx = parseInt(b.getAttribute('data-idx'), 10);
        const it = state.cart[idx];
        if (!it) return;
        if (Number(it.qty) <= 1) state.cart.splice(idx, 1);
        else it.qty = Math.round((Number(it.qty) - 1) * 1000) / 1000;
        simpanCartLokal();
        perbaruiRingkasanCartUI();
        renderCartIsi();
      });
    });

    elList.querySelectorAll('.btn-c-plus').forEach((b) => {
      b.addEventListener('click', () => {
        const idx = parseInt(b.getAttribute('data-idx'), 10);
        const it = state.cart[idx];
        if (!it) return;
        it.qty = Math.round((Number(it.qty) + 1) * 1000) / 1000;
        simpanCartLokal();
        perbaruiRingkasanCartUI();
        renderCartIsi();
      });
    });

    elList.querySelectorAll('.inp-c-qty').forEach((inp) => {
      inp.addEventListener('change', () => {
        const idx = parseInt(inp.getAttribute('data-idx'), 10);
        const n = parseFloat(inp.value);
        if (!isFinite(n) || n <= 0) state.cart.splice(idx, 1);
        else state.cart[idx].qty = Math.round(n * 1000) / 1000;
        simpanCartLokal();
        perbaruiRingkasanCartUI();
        renderCartIsi();
      });
    });

    elList.querySelectorAll('.btn-c-del').forEach((b) => {
      b.addEventListener('click', () => {
        const idx = parseInt(b.getAttribute('data-idx'), 10);
        state.cart.splice(idx, 1);
        simpanCartLokal();
        perbaruiRingkasanCartUI();
        renderCartIsi();
      });
    });
  };

  btnClear?.addEventListener('click', () => {
    state.cart = [];
    simpanCartLokal();
    perbaruiRingkasanCartUI();
    renderCartIsi();
  });

  const validasiCheckout = () => {
    const nama = String(elNama?.value || '').trim();
    const pengiriman = elKirim?.value || 'ambil';
    const alamat = String(elAlamat?.value || '').trim();
    const catatan = String(elCatatan?.value || '').trim();
    if (!nama) {
      showToast('Mohon isi Nama Pemesan terlebih dahulu.', 'warning');
      elNama?.focus();
      return null;
    }
    if (pengiriman === 'dikirim' && !alamat) {
      showToast('Mohon isi Alamat Pengiriman untuk pesanan diantar.', 'warning');
      elAlamat?.focus();
      return null;
    }
    return { namaPemesan: nama, pengiriman, alamat, catatan };
  };

  btnCopy?.addEventListener('click', async () => {
    const info = validasiCheckout();
    if (!info) return;
    const teks = susunPesanWhatsApp(info);
    try {
      await navigator.clipboard.writeText(teks);
      showToast('Daftar pesanan disalin! Tinggal tempel di WhatsApp.', 'success');
    } catch (_) {
      showToast('Gagal menyalin otomatis. Gunakan tombol Kirim via WhatsApp.', 'warning');
    }
  });

  btnSendWa?.addEventListener('click', () => {
    const info = validasiCheckout();
    if (!info) return;
    const teks = susunPesanWhatsApp(info);
    const url = waNum
      ? `https://wa.me/${waNum}?text=${encodeURIComponent(teks)}`
      : `https://wa.me/?text=${encodeURIComponent(teks)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  });

  renderCartIsi();
}

function perbaruiRingkasanCartUI() {
  const { totalItem, totalHarga } = hitungRingkasanCart();
  const badgeTop = document.getElementById('kp-cart-count-top');
  if (badgeTop) badgeTop.textContent = String(totalItem);

  const floatBar = document.getElementById('kp-floating-bar');
  const floatSummary = document.getElementById('kp-floating-summary');
  if (floatBar && floatSummary) {
    floatBar.style.display = totalItem > 0 ? 'flex' : 'none';
    floatSummary.innerHTML = `
      <div class="fw-bold text-sm">${totalItem} Barang di Keranjang</div>
      <div class="text-xs mono" style="opacity: 0.92;">Estimasi: ${formatRupiah(totalHarga)}</div>
    `;
  }
}

function renderGridProduk() {
  const gridEl = document.getElementById('kp-grid');
  const countEl = document.getElementById('kp-result-count');
  const loadMoreWrap = document.getElementById('kp-load-more-wrap');
  if (!gridEl) return;

  const katMap = getKatMap();
  const filtered = ambilProdukTersaring();
  const sliced = filtered.slice(0, state.limitTampil);

  if (countEl) {
    countEl.textContent = `Menampilkan ${sliced.length} dari ${filtered.length} produk`;
  }

  if (filtered.length === 0) {
    gridEl.innerHTML = `
      <div class="card card-body text-center" style="grid-column: 1 / -1; padding: var(--sp-8) var(--sp-4);">
        <div style="color: var(--text-muted); margin-bottom: var(--sp-2);">${ICONS.search}</div>
        <div class="fw-bold text-md">Produk tidak ditemukan</div>
        <div class="text-xs text-muted" style="margin-top: 4px;">Coba kata kunci lain atau pilih kategori "Semua".</div>
      </div>
    `;
    if (loadMoreWrap) loadMoreWrap.style.display = 'none';
    return;
  }

  gridEl.innerHTML = sliced.map((p) => {
    const katLabel = getNamaKategoriLengkap(p.kategori_id, katMap);
    const foto = p.foto_url ? optimalkanUrlFoto(p.foto_url, 420) : '';
    const hasVar = p.punya_varian && Array.isArray(p.varian) && p.varian.length > 0;
    const hasMultiSat = Array.isArray(p.satuan_konversi) && p.satuan_konversi.length > 0;
    let hargaUtama = Number(p.harga_ritel || 0);
    let labelMulai = '';
    if (hasVar) {
      const hargaList = p.varian.map((v) => Number(v.harga_ritel || 0)).filter((n) => n > 0);
      if (hargaList.length > 0) {
        const minH = Math.min(...hargaList);
        const maxH = Math.max(...hargaList);
        hargaUtama = minH;
        if (maxH > minH) labelMulai = 'Mulai ';
      }
    }
    const statusPill = p.stok_status === 'tersedia'
      ? '<span class="kp-pill is-ready">Tersedia</span>'
      : (p.stok_status === 'terbatas'
        ? '<span class="kp-pill is-low">Terbatas</span>'
        : '<span class="kp-pill is-out">Hubungi Toko</span>');
    const grosirPill = Number(p.harga_grosir || 0) > 0 && Number(p.min_grosir_qty || 0) > 0
      ? '<span class="kp-pill is-grosir">Grosir</span>'
      : (hasVar ? `<span class="kp-pill">${p.varian.length} Varian</span>` : '');

    return `
      <article class="kp-card" data-prd-id="${escapeHtml(p.id)}">
        <div class="kp-card-media btn-kp-detail" data-prd-id="${escapeHtml(p.id)}">
          ${foto
            ? `<img src="${escapeHtml(foto)}" alt="${escapeHtml(p.nama)}" loading="lazy" decoding="async" referrerpolicy="no-referrer">`
            : `<div class="kp-card-placeholder">${ICONS.box}<span>Foto belum tersedia</span></div>`}
          <div class="kp-card-badges">
            ${statusPill}
            ${grosirPill}
          </div>
        </div>
        <div class="kp-card-body">
          <div class="kp-card-cat">${escapeHtml(katLabel)}</div>
          <div class="kp-card-title btn-kp-detail" data-prd-id="${escapeHtml(p.id)}">${escapeHtml(p.nama)}</div>
          <div class="kp-card-price">
            <span class="kp-card-unit">${labelMulai}</span>${formatRupiah(hargaUtama)}
            <span class="kp-card-unit">/ ${escapeHtml(p.satuan_dasar || 'PCS')}</span>
          </div>
          ${!hasVar && Number(p.harga_grosir || 0) > 0 && Number(p.min_grosir_qty || 0) > 0
            ? `<div class="kp-card-grosir">Grosir ${formatRupiah(p.harga_grosir)} (min ${formatQty(p.min_grosir_qty)})</div>`
            : ''}
        </div>
        <div class="kp-card-foot">
          ${hasVar || hasMultiSat
            ? `<button type="button" class="btn btn-secondary btn-sm btn-kp-detail" data-prd-id="${escapeHtml(p.id)}">${ICONS.grid}<span>Pilih ${hasVar ? 'Varian' : 'Satuan'}</span></button>`
            : `<button type="button" class="btn btn-primary btn-sm btn-kp-add" data-prd-id="${escapeHtml(p.id)}">${ICONS.plus}<span>Keranjang</span></button>`}
        </div>
      </article>
    `;
  }).join('');

  if (loadMoreWrap) {
    loadMoreWrap.style.display = filtered.length > sliced.length ? 'flex' : 'none';
  }

  gridEl.querySelectorAll('.btn-kp-detail').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-prd-id');
      const p = state.produk.find((item) => item.id === id);
      if (p) bukaModalPilihOpsiProduk(p);
    });
  });

  gridEl.querySelectorAll('.btn-kp-add').forEach((el) => {
    el.addEventListener('click', () => {
      const id = el.getAttribute('data-prd-id');
      const p = state.produk.find((item) => item.id === id);
      if (!p) return;
      tambahKeCart({
        produk_id: p.id,
        varian_id: '',
        nama: p.nama,
        satuan: p.satuan_dasar || 'PCS',
        harga_ritel: Number(p.harga_ritel || 0),
        harga_grosir: Number(p.harga_grosir || 0),
        min_grosir_qty: Number(p.min_grosir_qty || 0),
        qty: 1
      });
    });
  });
}

function renderKategoriChips() {
  const parentRow = document.getElementById('kp-parent-chips');
  const subRow = document.getElementById('kp-sub-chips');
  if (!parentRow || !subRow) return;

  const parents = state.kategori.filter((k) => !k.parent_id);
  parentRow.innerHTML = [
    `<button type="button" class="kp-chip ${!state.parentKatId ? 'is-active' : ''}" data-parent-id="">Semua Kategori</button>`,
    ...parents.map((p) => `<button type="button" class="kp-chip ${state.parentKatId === p.id ? 'is-active' : ''}" data-parent-id="${escapeHtml(p.id)}">${escapeHtml(p.nama)}</button>`)
  ].join('');

  parentRow.querySelectorAll('.kp-chip').forEach((b) => {
    b.addEventListener('click', () => {
      state.parentKatId = b.getAttribute('data-parent-id') || '';
      state.subKatId = '';
      state.limitTampil = 24;
      renderKategoriChips();
      renderGridProduk();
    });
  });

  const subs = state.parentKatId ? state.kategori.filter((k) => k.parent_id === state.parentKatId) : [];
  if (subs.length > 0) {
    subRow.style.display = 'flex';
    subRow.innerHTML = [
      `<button type="button" class="kp-subchip ${!state.subKatId ? 'is-active' : ''}" data-sub-id="">Semua Sub</button>`,
      ...subs.map((s) => `<button type="button" class="kp-subchip ${state.subKatId === s.id ? 'is-active' : ''}" data-sub-id="${escapeHtml(s.id)}">${escapeHtml(s.nama)}</button>`)
    ].join('');
    subRow.querySelectorAll('.kp-subchip').forEach((b) => {
      b.addEventListener('click', () => {
        state.subKatId = b.getAttribute('data-sub-id') || '';
        state.limitTampil = 24;
        renderKategoriChips();
        renderGridProduk();
      });
    });
  } else {
    subRow.style.display = 'none';
    subRow.innerHTML = '';
  }
}

function renderShellUtama() {
  const root = document.getElementById('katalog-app');
  if (!root) return;

  const waNum = formatNomorWa(state.toko.hp);
  const waHref = waNum ? `https://wa.me/${waNum}?text=${encodeURIComponent(`Halo ${state.toko.nama}, saya ingin bertanya mengenai stok & harga barang.`)}` : '';

  root.innerHTML = `
    <header class="kp-header">
      <div class="kp-header-inner">
        <div class="kp-brand">
          <div class="kp-logo ${state.toko.logo ? 'has-img' : ''}">
            ${state.toko.logo
              ? `<img src="${escapeHtml(state.toko.logo)}" alt="${escapeHtml(state.toko.nama)}">`
              : ICONS.store}
          </div>
          <div class="kp-brand-info">
            <div class="kp-store-name">${escapeHtml(state.toko.nama || 'Toko Bangunan')}</div>
            <div class="kp-store-addr">${escapeHtml(state.toko.alamat || 'Katalog Produk & Pemesanan Online')}</div>
          </div>
        </div>
        <div class="kp-header-actions">
          ${waHref ? `
            <a href="${waHref}" target="_blank" rel="noopener noreferrer" class="btn btn-secondary btn-sm" title="Chat WhatsApp Toko" style="display: inline-flex; align-items: center; gap: 6px;">
              ${ICONS.messageCircle}
              <span class="kp-hide-sm">Chat WA</span>
            </a>
          ` : ''}
          <button type="button" class="btn btn-secondary btn-sm btn-icon" id="kp-btn-theme" title="Ganti Tema Tampilan" aria-label="Ganti Tema">
            ${ICONS.palette}
          </button>
          <button type="button" class="btn btn-primary btn-sm kp-cart-btn" id="kp-btn-cart-top" title="Buka Keranjang Pesanan">
            ${ICONS.cart}
            <span class="kp-hide-sm">Keranjang</span>
            <span class="kp-cart-badge" id="kp-cart-count-top">0</span>
          </button>
        </div>
      </div>
    </header>

    <main class="kp-container">
      <section class="kp-hero">
        <div class="kp-search-row">
          <div class="input-group">
            <span class="input-icon">${ICONS.search}</span>
            <input type="search" class="input" id="kp-search-input" placeholder="Cari semen, besi, cat, pipa, keramik, atau varian..." value="${escapeHtml(state.q)}" autocomplete="off">
          </div>
          <select class="select kp-sort-select" id="kp-sort-select" aria-label="Urutkan produk">
            <option value="terbaru">Urut: Terbaru</option>
            <option value="harga_asc">Harga: Termurah</option>
            <option value="harga_desc">Harga: Termahal</option>
            <option value="nama_asc">Nama: A - Z</option>
          </select>
        </div>

        <div class="kp-chips-row" id="kp-parent-chips"></div>
        <div class="kp-subchips-row" id="kp-sub-chips" style="display: none;"></div>
      </section>

      <div class="kp-meta-bar">
        <div class="text-xs text-muted" id="kp-result-count">Memuat produk...</div>
        <div class="row" style="gap: 6px;">
          <button type="button" class="kp-subchip ${state.filterStatus === 'semua' ? 'is-active' : ''}" data-kp-filter="semua">Semua</button>
          <button type="button" class="kp-subchip ${state.filterStatus === 'tersedia' ? 'is-active' : ''}" data-kp-filter="tersedia">Tersedia</button>
          <button type="button" class="kp-subchip ${state.filterStatus === 'grosir' ? 'is-active' : ''}" data-kp-filter="grosir">Ada Harga Grosir</button>
        </div>
      </div>

      <section class="kp-grid" id="kp-grid"></section>

      <div id="kp-load-more-wrap" style="display: none; justify-content: center; margin-top: var(--sp-4);">
        <button type="button" class="btn btn-secondary" id="kp-btn-load-more">Muat Produk Lainnya</button>
      </div>

      <footer class="kp-footer-note">
        <div class="fw-semibold" style="color: var(--text);">${escapeHtml(state.toko.nama || 'Toko Bangunan')}</div>
        ${state.toko.alamat ? `<div style="margin-top: 2px;">${escapeHtml(state.toko.alamat)}</div>` : ''}
        <div style="margin-top: 4px;">Harga dapat berubah sewaktu-waktu. Konfirmasi ketersediaan &amp; ongkir langsung melalui WhatsApp toko.</div>
      </footer>
    </main>

    <div class="kp-floating-bar" id="kp-floating-bar" style="display: none;" role="button" tabindex="0">
      <div id="kp-floating-summary"></div>
      <div class="kp-floating-bar-cta">
        ${ICONS.cart}
        <span>Pesan via WA</span>
      </div>
    </div>
  `;

  let debounceTimer = null;
  document.getElementById('kp-search-input')?.addEventListener('input', (e) => {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      state.q = e.target.value || '';
      state.limitTampil = 24;
      renderGridProduk();
    }, 120);
  });

  document.getElementById('kp-sort-select')?.addEventListener('change', (e) => {
    state.sort = e.target.value || 'terbaru';
    renderGridProduk();
  });

  root.querySelectorAll('[data-kp-filter]').forEach((btn) => {
    btn.addEventListener('click', () => {
      state.filterStatus = btn.getAttribute('data-kp-filter') || 'semua';
      state.limitTampil = 24;
      root.querySelectorAll('[data-kp-filter]').forEach((b) => b.classList.toggle('is-active', b === btn));
      renderGridProduk();
    });
  });

  document.getElementById('kp-btn-load-more')?.addEventListener('click', () => {
    state.limitTampil += 24;
    renderGridProduk();
  });

  document.getElementById('kp-btn-theme')?.addEventListener('click', toggleTemaPublik);
  document.getElementById('kp-btn-cart-top')?.addEventListener('click', bukaModalKeranjang);
  document.getElementById('kp-floating-bar')?.addEventListener('click', bukaModalKeranjang);

  renderKategoriChips();
  renderGridProduk();
  perbaruiRingkasanCartUI();
}

async function initKatalogPublik() {
  state.cart = muatCartLokal();
  const cached = ambilDataKatalogCache();
  if (cached) {
    terapkanDataKatalog(cached);
    renderShellUtama();
  }

  try {
    const fresh = await fetchKatalogPublik();
    simpanDataKatalogCache(fresh);
    terapkanDataKatalog(fresh);
    renderShellUtama();
  } catch (err) {
    if (!cached) {
      const root = document.getElementById('katalog-app');
      if (root) {
        root.innerHTML = `
          <div class="kp-boot">
            <div class="kp-boot-card">
              <div style="color: var(--danger);">${ICONS.alertTriangle}</div>
              <div class="fw-bold text-md" style="margin-top: 10px;">Gagal Memuat Katalog</div>
              <div class="text-xs text-muted" style="margin-top: 6px;">${escapeHtml(err.message || 'Periksa koneksi internet Anda.')}</div>
              <button type="button" class="btn btn-primary btn-sm" id="kp-btn-retry" style="margin-top: 16px;">Coba Lagi</button>
            </div>
          </div>
        `;
        document.getElementById('kp-btn-retry')?.addEventListener('click', () => window.location.reload());
      }
    }
  }
}

initKatalogPublik();
