/**
 * pembelian.js — Modul POS Pembelian & Pengadaan Barang Masuk (Owner & Admin)
 * Sesuai Fase 3 Roadmap POS Kasir Toko Bangunan:
 * - Input multi-item dengan multi-satuan & faktor konversi
 * - Perhitungan moving average HPP dan penambahan stok otomatis
 * - Diskon faktur proporsional
 * - Pencatatan tunai, DP, atau hutang tempo
 */

import { apiCall } from '../api.js';
import { store } from '../state.js';
import { ICONS, showToast, showModal, showConfirm } from '../utils/ui.js';
import { $, $$, renderSkeleton, renderEmpty } from '../utils/dom.js';
import { escapeHtml, formatRupiah, formatQty, parseRupiah, parseQty, formatTanggal } from '../utils/format.js';

export async function renderPembelianModule(container) {
  const user = store.get('user');
  const canEdit = user && (user.role === 'owner' || user.role === 'admin');

  container.innerHTML = `
    <div class="stack">
      <div class="page-header">
        <div>
          <h2>POS Pembelian & Pengadaan Barang</h2>
          <p>Pencatatan barang masuk dari distributor, update stok, dan penyesuaian HPP moving average</p>
        </div>
        <div class="row" style="gap: var(--sp-2);">
          <button type="button" class="btn btn-secondary tab-beli-btn active" id="tab-btn-input">
            ${ICONS.shoppingBag}
            <span>Faktur Baru</span>
          </button>
          <button type="button" class="btn btn-ghost tab-beli-btn" id="tab-btn-riwayat">
            ${ICONS.clipboard}
            <span>Riwayat Faktur</span>
          </button>
        </div>
      </div>

      <div id="tab-content-input" class="tab-beli-view">
        ${renderFormInputBeli()}
      </div>

      <div id="tab-content-riwayat" class="tab-beli-view" style="display: none;">
        <div class="card card-body stack">
          <div class="row" style="gap: var(--sp-2); align-items: center;">
            <div class="input-group grow">
              <span class="input-icon">${ICONS.search}</span>
              <input type="search" class="input" id="search-riwayat-beli" placeholder="Cari nomor faktur PB, faktur supplier, atau nama supplier...">
            </div>
            <button type="button" class="btn btn-secondary btn-icon" id="btn-refresh-riwayat" title="Muat Ulang">
              ${ICONS.refresh}
            </button>
          </div>
          <div id="area-riwayat-beli">
            ${renderSkeleton(4)}
          </div>
        </div>
      </div>
    </div>
  `;

  // Bind Tabs
  const btnTabInput = $('#tab-btn-input', container);
  const btnTabRiwayat = $('#tab-btn-riwayat', container);
  const tabInput = $('#tab-content-input', container);
  const tabRiwayat = $('#tab-content-riwayat', container);

  btnTabInput?.addEventListener('click', () => {
    btnTabInput.classList.add('active', 'btn-secondary');
    btnTabInput.classList.remove('btn-ghost');
    btnTabRiwayat.classList.remove('active', 'btn-secondary');
    btnTabRiwayat.classList.add('btn-ghost');
    tabInput.style.display = 'block';
    tabRiwayat.style.display = 'none';
  });

  btnTabRiwayat?.addEventListener('click', () => {
    btnTabRiwayat.classList.add('active', 'btn-secondary');
    btnTabRiwayat.classList.remove('btn-ghost');
    btnTabInput.classList.remove('active', 'btn-secondary');
    btnTabInput.classList.add('btn-ghost');
    tabInput.style.display = 'none';
    tabRiwayat.style.display = 'block';
    muatRiwayatPembelian(container);
  });

  // Inisialisasi Form Input Pembelian
  initFormInputBeli(container);

  // Inisialisasi Pencarian Riwayat
  $('#search-riwayat-beli', container)?.addEventListener('input', (e) => {
    muatRiwayatPembelian(container, e.target.value.trim());
  });

  $('#btn-refresh-riwayat', container)?.addEventListener('click', () => {
    muatRiwayatPembelian(container, $('#search-riwayat-beli', container)?.value.trim() || '');
  });
}

function renderFormInputBeli() {
  const tglHariIni = new Date().toISOString().substring(0, 10);
  return `
    <div class="grid grid-2" style="grid-template-columns: 1fr 340px; gap: var(--sp-3); align-items: start;">
      <!-- Kolom Kiri: Input Item & Keranjang Beli -->
      <div class="stack">
        <!-- Informasi Header Faktur -->
        <div class="card card-body stack">
          <div class="row" style="gap: var(--sp-2);">
            <div class="field grow">
              <label class="field-label" for="beli-supplier">Supplier <span class="wajib">*</span></label>
              <select class="input" id="beli-supplier" required>
                <option value="">-- Pilih Supplier --</option>
              </select>
            </div>
            <div class="field grow">
              <label class="field-label" for="beli-no-faktur-sup">No. Faktur Asli Supplier</label>
              <input type="text" class="input" id="beli-no-faktur-sup" placeholder="Cth: INV/SP/2026/001">
            </div>
            <div class="field" style="width: 160px;">
              <label class="field-label" for="beli-tanggal">Tanggal Masuk</label>
              <input type="date" class="input" id="beli-tanggal" value="${tglHariIni}">
            </div>
          </div>
        </div>

        <!-- Pemilih Produk & Input Item -->
        <div class="card card-body stack">
          <div class="fw-semibold text-sm text-muted">Tambah Barang ke Faktur Pembelian</div>
          <div class="row" style="gap: var(--sp-2); align-items: flex-end;">
            <div class="field grow">
              <label class="field-label" for="beli-cari-produk">Cari Produk / Barcode <span class="wajib">*</span></label>
              <input type="text" class="input" id="beli-cari-produk" placeholder="Ketik nama produk, SKU, atau scan barcode..." autocomplete="off">
              <div id="beli-dropdown-produk" class="card" style="display: none; position: absolute; z-index: 50; max-height: 240px; overflow-y: auto; width: 100%; box-shadow: var(--shadow-lg);"></div>
            </div>
            <div class="field" style="width: 130px;">
              <label class="field-label" for="beli-satuan">Satuan</label>
              <select class="input" id="beli-satuan" disabled>
                <option value="">-</option>
              </select>
            </div>
            <div class="field" style="width: 110px;">
              <label class="field-label" for="beli-qty">Qty Beli</label>
              <input type="number" class="input tabular" id="beli-qty" min="0.001" step="any" value="1" disabled>
            </div>
            <div class="field" style="width: 140px;">
              <label class="field-label" for="beli-harga">Harga Beli (Rp)</label>
              <input type="text" class="input tabular" id="beli-harga" placeholder="0" disabled>
            </div>
            <button type="button" class="btn btn-primary" id="btn-tambah-item-beli" disabled style="margin-bottom: 2px;">
              <span>+ Tambah</span>
            </button>
          </div>
          <div id="beli-preview-konversi" class="text-xs text-muted" style="min-height: 16px;"></div>
        </div>

        <!-- Tabel Daftar Item Masuk -->
        <div class="card card-body">
          <div class="table-wrap">
            <table class="table" id="tabel-keranjang-beli">
              <thead>
                <tr>
                  <th>Barang</th>
                  <th>Satuan</th>
                  <th style="text-align: right;">Qty Beli</th>
                  <th style="text-align: right;">Harga Satuan</th>
                  <th style="text-align: right;">Subtotal</th>
                  <th style="width: 40px;"></th>
                </tr>
              </thead>
              <tbody id="tbody-keranjang-beli">
                <tr>
                  <td colspan="6" class="text-center text-muted" style="padding: var(--sp-4);">
                    Belum ada barang dimasukkan. Pilih produk di atas.
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        </div>
      </div>

      <!-- Kolom Kanan: Ringkasan & Pembayaran -->
      <div class="card card-body stack" style="position: sticky; top: var(--sp-3);">
        <h3>Ringkasan Pembelian</h3>

        <div class="row-between text-sm">
          <span class="text-muted">Total Item</span>
          <span class="tabular fw-semibold" id="beli-ringkasan-item">0 item (0 jenis)</span>
        </div>

        <div class="row-between text-sm">
          <span class="text-muted">Subtotal Kotor</span>
          <span class="tabular fw-semibold" id="beli-ringkasan-subtotal">Rp 0</span>
        </div>

        <div class="field">
          <label class="field-label" for="beli-diskon-faktur">Diskon Faktur (Rp)</label>
          <input type="text" class="input tabular" id="beli-diskon-faktur" value="0">
          <div class="field-hint">Dialokasikan proporsional ke HPP setiap barang.</div>
        </div>

        <hr style="border: 0; border-top: 1px solid var(--clr-border); margin: var(--sp-1) 0;">

        <div class="row-between">
          <span class="fw-bold">TOTAL TAGIHAN</span>
          <span class="tabular fw-bold text-lg text-primary" id="beli-ringkasan-total">Rp 0</span>
        </div>

        <div class="field">
          <label class="field-label" for="beli-nominal-bayar">Nominal Dibayar (Rp)</label>
          <input type="text" class="input tabular fw-bold" id="beli-nominal-bayar" value="0">
          <div class="row" style="gap: var(--sp-1); margin-top: 4px;">
            <button type="button" class="btn btn-ghost btn-xs grow" id="btn-quick-lunas">Lunas</button>
            <button type="button" class="btn btn-ghost btn-xs grow" id="btn-quick-tempo">Hutang (0)</button>
          </div>
        </div>

        <div class="row-between text-sm" id="row-status-bayar">
          <span class="text-muted">Status Pembayaran:</span>
          <span class="badge badge-warning" id="badge-status-bayar">Hutang</span>
        </div>

        <div class="field" id="field-jatuh-tempo">
          <label class="field-label" for="beli-jatuh-tempo">Tanggal Jatuh Tempo Hutang</label>
          <input type="date" class="input" id="beli-jatuh-tempo">
        </div>

        <div class="field">
          <label class="field-label" for="beli-catatan">Catatan</label>
          <input type="text" class="input" id="beli-catatan" placeholder="Keterangan pengiriman / rekening">
        </div>

        <button type="button" class="btn btn-primary btn-block btn-lg" id="btn-simpan-pembelian" disabled style="margin-top: var(--sp-2);">
          <span>Simpan Faktur Pembelian</span>
        </button>
      </div>
    </div>
  `;
}

// State keranjang pembelian lokal
let keranjangBeli = [];
let itemPilihan = null;

async function initFormInputBeli(container) {
  keranjangBeli = [];
  itemPilihan = null;

  // 1. Muat Dropdown Supplier
  const selectSup = $('#beli-supplier', container);
  try {
    const res = await apiCall('supplier.list', { aktif_saja: true, limit: 200 });
    const sups = res.items || [];
    let opts = '<option value="">-- Pilih Supplier --</option>';
    sups.forEach((s) => {
      opts += `<option value="${s.id}">${escapeHtml(s.nama)}</option>`;
    });
    if (selectSup) selectSup.innerHTML = opts;
  } catch (err) {
    console.warn('Gagal memuat supplier:', err);
  }

  // 2. Pencarian Produk Autocomplete
  const inputCari = $('#beli-cari-produk', container);
  const dropdown = $('#beli-dropdown-produk', container);
  let timeoutCari = null;

  inputCari?.addEventListener('input', () => {
    clearTimeout(timeoutCari);
    const q = inputCari.value.trim();
    if (q.length < 2) {
      if (dropdown) dropdown.style.display = 'none';
      return;
    }
    timeoutCari = setTimeout(async () => {
      try {
        const res = await apiCall('produk.list', { q, limit: 10, aktif_saja: true });
        const prods = res.items || [];
        if (!prods.length) {
          dropdown.innerHTML = `<div class="p-2 text-sm text-muted">Produk "${escapeHtml(q)}" tidak ditemukan.</div>`;
          dropdown.style.display = 'block';
          return;
        }

        let html = '';
        prods.forEach((p) => {
          if (p.punya_varian && p.varian && p.varian.length) {
            p.varian.forEach((v) => {
              html += `
                <div class="p-2 list-item-clickable row-between item-prod-select"
                     data-prod-id="${p.id}" data-var-id="${v.id}" data-nama="${escapeHtml(p.nama + ' - ' + v.nama_varian)}"
                     data-satuan="${escapeHtml(p.satuan_dasar)}" data-hpp="${v.hpp || p.hpp || 0}">
                  <div>
                    <div class="fw-semibold text-sm">${escapeHtml(p.nama)} - <span class="text-primary">${escapeHtml(v.nama_varian)}</span></div>
                    <div class="text-xs text-muted">SKU: ${escapeHtml(v.sku || p.sku || '-')} | Stok: ${formatQty(v.stok)} ${escapeHtml(p.satuan_dasar)}</div>
                  </div>
                  <div class="tabular text-sm fw-semibold">${formatRupiah(v.hpp || p.hpp || 0)}</div>
                </div>
              `;
            });
          } else {
            html += `
              <div class="p-2 list-item-clickable row-between item-prod-select"
                   data-prod-id="${p.id}" data-var-id="" data-nama="${escapeHtml(p.nama)}"
                   data-satuan="${escapeHtml(p.satuan_dasar)}" data-hpp="${p.hpp || 0}">
                <div>
                  <div class="fw-semibold text-sm">${escapeHtml(p.nama)}</div>
                  <div class="text-xs text-muted">SKU: ${escapeHtml(p.sku || '-')} | Stok: ${formatQty(p.stok)} ${escapeHtml(p.satuan_dasar)}</div>
                </div>
                <div class="tabular text-sm fw-semibold">${formatRupiah(p.hpp || 0)}</div>
              </div>
            `;
          }
        });
        dropdown.innerHTML = html;
        dropdown.style.display = 'block';

        dropdown.querySelectorAll('.item-prod-select').forEach((el) => {
          el.addEventListener('click', async () => {
            const prodId = el.getAttribute('data-prod-id');
            const varId = el.getAttribute('data-var-id');
            const nama = el.getAttribute('data-nama');
            const satuanDasar = el.getAttribute('data-satuan');
            const hpp = Number(el.getAttribute('data-hpp')) || 0;

            inputCari.value = nama;
            dropdown.style.display = 'none';

            // Ambil rincian produk untuk mendapatkan daftar satuan konversi
            pilihProdukUntukBeli(container, { id: prodId, varian_id: varId, nama, satuan_dasar: satuanDasar, hpp });
          });
        });
      } catch (err) {
        console.warn('Gagal cari produk:', err);
      }
    }, 250);
  });

  // Sembunyikan dropdown bila klik di luar
  document.addEventListener('click', (e) => {
    if (dropdown && !dropdown.contains(e.target) && e.target !== inputCari) {
      dropdown.style.display = 'none';
    }
  });

  // Tombol Tambah Item
  $('#btn-tambah-item-beli', container)?.addEventListener('click', () => {
    tambahItemKeKeranjangBeli(container);
  });

  // Quick buttons pembayaran
  $('#btn-quick-lunas', container)?.addEventListener('click', () => {
    const total = hitungTotalBeli(container);
    const inputBayar = $('#beli-nominal-bayar', container);
    if (inputBayar) {
      inputBayar.value = formatRupiah(total, false);
      updateStatusBayarUI(container);
    }
  });

  $('#btn-quick-tempo', container)?.addEventListener('click', () => {
    const inputBayar = $('#beli-nominal-bayar', container);
    if (inputBayar) {
      inputBayar.value = '0';
      updateStatusBayarUI(container);
    }
  });

  // Input diskon & bayar listeners
  $('#beli-diskon-faktur', container)?.addEventListener('input', (e) => {
    e.target.value = formatRupiah(parseRupiah(e.target.value), false);
    renderRingkasanBeli(container);
  });

  $('#beli-nominal-bayar', container)?.addEventListener('input', (e) => {
    e.target.value = formatRupiah(parseRupiah(e.target.value), false);
    updateStatusBayarUI(container);
  });

  // Tombol Simpan
  $('#btn-simpan-pembelian', container)?.addEventListener('click', () => {
    simpanPembelian(container);
  });
}

async function pilihProdukUntukBeli(container, item) {
  itemPilihan = item;

  const selectSatuan = $('#beli-satuan', container);
  const inputQty = $('#beli-qty', container);
  const inputHarga = $('#beli-harga', container);
  const btnTambah = $('#btn-tambah-item-beli', container);
  const preview = $('#beli-preview-konversi', container);

  if (!selectSatuan || !inputQty || !inputHarga || !btnTambah) return;

  // Set default satuan dasar
  let opts = `<option value="${escapeHtml(item.satuan_dasar)}" data-faktor="1">${escapeHtml(item.satuan_dasar)} (Satuan Dasar)</option>`;

  // Cek apakah ada satuan konversi di master produk
  try {
    const res = await apiCall('produk.list', { q: item.id });
    const prod = (res.items || []).find((p) => p.id === item.id);
    if (prod && prod.satuan_konversi && prod.satuan_konversi.length) {
      prod.satuan_konversi.forEach((sk) => {
        opts += `<option value="${escapeHtml(sk.satuan)}" data-faktor="${sk.faktor}">1 ${escapeHtml(sk.satuan)} = ${sk.faktor} ${escapeHtml(item.satuan_dasar)}</option>`;
      });
    }
  } catch (err) {
    console.warn('Gagal ambil satuan konversi:', err);
  }

  selectSatuan.innerHTML = opts;
  selectSatuan.disabled = false;
  inputQty.disabled = false;
  inputHarga.disabled = false;
  btnTambah.disabled = false;

  inputHarga.value = formatRupiah(item.hpp, false);

  const updatePreview = () => {
    const opt = selectSatuan.options[selectSatuan.selectedIndex];
    const faktor = Number(opt?.getAttribute('data-faktor')) || 1;
    const qty = parseQty(inputQty.value) || 1;
    const qtyDasar = Math.round(qty * faktor * 1000) / 1000;
    if (preview) {
      preview.textContent = faktor > 1 ? `Kuantitas masuk stok: ${formatQty(qtyDasar)} ${item.satuan_dasar}` : '';
    }
  };

  selectSatuan.addEventListener('change', updatePreview);
  inputQty.addEventListener('input', updatePreview);
  updatePreview();

  inputQty.focus();
}

function tambahItemKeKeranjangBeli(container) {
  if (!itemPilihan) return;

  const selectSatuan = $('#beli-satuan', container);
  const inputQty = $('#beli-qty', container);
  const inputHarga = $('#beli-harga', container);

  const opt = selectSatuan.options[selectSatuan.selectedIndex];
  const satuan = opt.value;
  const faktor = Number(opt.getAttribute('data-faktor')) || 1;
  const qty = parseQty(inputQty.value);
  const hargaBeli = parseRupiah(inputHarga.value);

  if (qty <= 0) {
    showToast('Kuantitas beli harus lebih dari 0.', 'warning');
    return;
  }
  if (hargaBeli < 0) {
    showToast('Harga beli tidak boleh negatif.', 'warning');
    return;
  }

  const subtotal = Math.round(qty * hargaBeli);
  const qtyDasar = Math.round(qty * faktor * 1000) / 1000;

  keranjangBeli.push({
    produk_id: itemPilihan.id,
    varian_id: itemPilihan.varian_id || '',
    nama: itemPilihan.nama,
    satuan: satuan,
    satuan_dasar: itemPilihan.satuan_dasar,
    faktor: faktor,
    qty: qty,
    qty_dasar: qtyDasar,
    harga_beli: hargaBeli,
    subtotal: subtotal
  });

  // Reset form pemilih item
  itemPilihan = null;
  $('#beli-cari-produk', container).value = '';
  selectSatuan.innerHTML = '<option value="">-</option>';
  selectSatuan.disabled = true;
  inputQty.value = '1';
  inputQty.disabled = true;
  inputHarga.value = '';
  inputHarga.disabled = true;
  $('#btn-tambah-item-beli', container).disabled = true;
  $('#beli-preview-konversi', container).textContent = '';

  renderTabelKeranjangBeli(container);
  renderRingkasanBeli(container);
}

function renderTabelKeranjangBeli(container) {
  const tbody = $('#tbody-keranjang-beli', container);
  if (!tbody) return;

  if (!keranjangBeli.length) {
    tbody.innerHTML = `
      <tr>
        <td colspan="6" class="text-center text-muted" style="padding: var(--sp-4);">
          Belum ada barang dimasukkan. Pilih produk di atas.
        </td>
      </tr>
    `;
    return;
  }

  let html = '';
  keranjangBeli.forEach((it, idx) => {
    html += `
      <tr>
        <td data-label="Barang">
          <div class="fw-semibold">${escapeHtml(it.nama)}</div>
          ${it.faktor > 1 ? `<div class="text-xs text-muted">1 ${escapeHtml(it.satuan)} = ${it.faktor} ${escapeHtml(it.satuan_dasar)}</div>` : ''}
        </td>
        <td data-label="Satuan"><span class="badge">${escapeHtml(it.satuan)}</span></td>
        <td style="text-align: right;" class="tabular" data-label="Qty Beli">
          <div class="fw-semibold">${formatQty(it.qty)}</div>
          ${it.faktor > 1 ? `<div class="text-xs text-muted">(${formatQty(it.qty_dasar)} ${escapeHtml(it.satuan_dasar)})</div>` : ''}
        </td>
        <td style="text-align: right;" class="tabular" data-label="Harga Satuan">${formatRupiah(it.harga_beli)}</td>
        <td style="text-align: right;" class="tabular fw-bold" data-label="Subtotal">${formatRupiah(it.subtotal)}</td>
        <td style="text-align: center;" data-label="Aksi">
          <button type="button" class="btn btn-ghost btn-sm text-danger btn-icon btn-hapus-item-beli" data-index="${idx}" title="Hapus">
            ${ICONS.x}
          </button>
        </td>
      </tr>
    `;
  });

  tbody.innerHTML = html;

  tbody.querySelectorAll('.btn-hapus-item-beli').forEach((btn) => {
    btn.addEventListener('click', () => {
      const idx = Number(btn.getAttribute('data-index'));
      keranjangBeli.splice(idx, 1);
      renderTabelKeranjangBeli(container);
      renderRingkasanBeli(container);
    });
  });
}

function hitungTotalBeli(container) {
  const subtotal = keranjangBeli.reduce((sum, it) => sum + it.subtotal, 0);
  const diskon = parseRupiah($('#beli-diskon-faktur', container)?.value || 0);
  return Math.max(0, subtotal - diskon);
}

function renderRingkasanBeli(container) {
  const subtotal = keranjangBeli.reduce((sum, it) => sum + it.subtotal, 0);
  const diskon = parseRupiah($('#beli-diskon-faktur', container)?.value || 0);
  const total = Math.max(0, subtotal - diskon);

  const ringkasanItem = $('#beli-ringkasan-item', container);
  const ringkasanSubtotal = $('#beli-ringkasan-subtotal', container);
  const ringkasanTotal = $('#beli-ringkasan-total', container);
  const btnSimpan = $('#btn-simpan-pembelian', container);

  if (ringkasanItem) {
    const totalQty = keranjangBeli.reduce((sum, it) => sum + it.qty, 0);
    ringkasanItem.textContent = `${formatQty(totalQty)} item (${keranjangBeli.length} barang)`;
  }
  if (ringkasanSubtotal) ringkasanSubtotal.textContent = formatRupiah(subtotal);
  if (ringkasanTotal) ringkasanTotal.textContent = formatRupiah(total);

  if (btnSimpan) {
    btnSimpan.disabled = keranjangBeli.length === 0;
  }

  updateStatusBayarUI(container);
}

function updateStatusBayarUI(container) {
  const total = hitungTotalBeli(container);
  const bayar = parseRupiah($('#beli-nominal-bayar', container)?.value || 0);
  const badge = $('#badge-status-bayar', container);
  const fieldJatuhTempo = $('#field-jatuh-tempo', container);

  let status = 'lunas';
  if (bayar >= total && total > 0) {
    status = 'lunas';
    badge.className = 'badge badge-success';
    badge.textContent = 'Lunas';
    if (fieldJatuhTempo) fieldJatuhTempo.style.display = 'none';
  } else if (bayar > 0 && bayar < total) {
    status = 'sebagian';
    badge.className = 'badge badge-warning';
    badge.textContent = `Sebagian (Sisa: ${formatRupiah(total - bayar)})`;
    if (fieldJatuhTempo) fieldJatuhTempo.style.display = 'block';
  } else {
    status = 'hutang';
    badge.className = 'badge badge-danger';
    badge.textContent = `Hutang Penuh (${formatRupiah(total)})`;
    if (fieldJatuhTempo) fieldJatuhTempo.style.display = 'block';
  }
}

async function simpanPembelian(container) {
  if (!keranjangBeli.length) {
    showToast('Keranjang pembelian masih kosong.', 'warning');
    return;
  }

  const supplierId = $('#beli-supplier', container)?.value;
  if (!supplierId) {
    showToast('Supplier wajib dipilih.', 'warning');
    return;
  }

  const noFakturSupplier = $('#beli-no-faktur-sup', container)?.value.trim() || '';
  const tanggal = $('#beli-tanggal', container)?.value || '';
  const diskon = parseRupiah($('#beli-diskon-faktur', container)?.value || 0);
  const bayar = parseRupiah($('#beli-nominal-bayar', container)?.value || 0);
  const jatuhTempo = $('#beli-jatuh-tempo', container)?.value || '';
  const catatan = $('#beli-catatan', container)?.value.trim() || '';
  const total = hitungTotalBeli(container);

  if (bayar < total && !jatuhTempo) {
    showToast('Tanggal jatuh tempo wajib diisi untuk transaksi tempo/hutang.', 'warning');
    return;
  }

  const btnSimpan = $('#btn-simpan-pembelian', container);
  btnSimpan.setAttribute('aria-busy', 'true');
  btnSimpan.disabled = true;

  try {
    const payload = {
      supplier_id: supplierId,
      no_faktur_supplier: noFakturSupplier,
      tanggal: tanggal,
      diskon: diskon,
      bayar: bayar,
      jatuh_tempo: jatuhTempo,
      catatan: catatan,
      items: keranjangBeli.map((it) => ({
        produk_id: it.produk_id,
        varian_id: it.varian_id,
        nama: it.nama,
        satuan: it.satuan,
        faktor: it.faktor,
        qty: it.qty,
        harga_beli: it.harga_beli
      }))
    };

    const res = await apiCall('pembelian.create', payload);
    showToast(`Faktur pembelian ${res.no_faktur} berhasil disimpan! Stok dan HPP telah disesuaikan.`, 'success', 5000);

    // Reset Form
    keranjangBeli = [];
    renderTabelKeranjangBeli(container);
    $('#beli-no-faktur-sup', container).value = '';
    $('#beli-diskon-faktur', container).value = '0';
    $('#beli-nominal-bayar', container).value = '0';
    $('#beli-catatan', container).value = '';
    renderRingkasanBeli(container);

    // Beralih ke tab riwayat
    $('#tab-btn-riwayat', container)?.click();
  } catch (err) {
    showToast(err.message, 'error', 5000);
  } finally {
    btnSimpan.removeAttribute('aria-busy');
    btnSimpan.disabled = false;
  }
}

async function muatRiwayatPembelian(container, query = '') {
  const area = $('#area-riwayat-beli', container);
  if (!area) return;

  try {
    const res = await apiCall('pembelian.list', { q: query, limit: 50 });
    const items = res.items || [];

    if (!items.length) {
      area.innerHTML = renderEmpty({
        title: query ? 'Faktur Tidak Ditemukan' : 'Belum Ada Faktur Pembelian',
        text: query ? `Pencarian "${escapeHtml(query)}" tidak cocok dengan faktur manapun.` : 'Mulai mencatat barang masuk pada tab "Faktur Baru".',
        icon: ICONS.shoppingBag
      });
      return;
    }

    let html = `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>No Faktur</th>
              <th>Tanggal</th>
              <th>Supplier</th>
              <th style="text-align: right;">Total Tagihan</th>
              <th style="text-align: right;">Dibayar</th>
              <th style="text-align: center;">Status Bayar</th>
              <th style="width: 80px; text-align: center;">Aksi</th>
            </tr>
          </thead>
          <tbody>
    `;

    items.forEach((pb) => {
      let badgeClass = 'badge-success';
      let statusLabel = 'Lunas';
      if (pb.status_bayar === 'sebagian') {
        badgeClass = 'badge-warning';
        statusLabel = 'Sebagian';
      } else if (pb.status_bayar === 'hutang') {
        badgeClass = 'badge-danger';
        statusLabel = 'Hutang';
      }

      html += `
        <tr>
          <td data-label="No Faktur">
            <div class="tabular fw-bold">${escapeHtml(pb.no_faktur)}</div>
            ${pb.no_faktur_supplier ? `<div class="text-xs text-muted">Faktur Asli: ${escapeHtml(pb.no_faktur_supplier)}</div>` : ''}
          </td>
          <td data-label="Tanggal">
            <div class="text-sm">${formatTanggal(pb.tanggal)}</div>
          </td>
          <td data-label="Supplier">
            <div class="fw-semibold">${escapeHtml(pb.supplier_nama || 'Supplier Umum')}</div>
          </td>
          <td style="text-align: right;" class="tabular fw-bold" data-label="Total Tagihan">
            ${formatRupiah(pb.total)}
          </td>
          <td style="text-align: right;" class="tabular" data-label="Dibayar">
            ${formatRupiah(pb.bayar)}
          </td>
          <td style="text-align: center;" data-label="Status Bayar">
            <span class="badge ${badgeClass}">${statusLabel}</span>
          </td>
          <td style="text-align: center;" data-label="Aksi">
            <button type="button" class="btn btn-ghost btn-sm btn-detail-pembelian" data-id="${pb.id}">
              Detail
            </button>
          </td>
        </tr>
      `;
    });

    html += `
          </tbody>
        </table>
      </div>
    `;

    area.innerHTML = html;

    area.querySelectorAll('.btn-detail-pembelian').forEach((btn) => {
      btn.addEventListener('click', () => {
        bukaModalDetailPembelian(btn.getAttribute('data-id'));
      });
    });
  } catch (err) {
    area.innerHTML = `
      <div class="alert alert-danger">
        ${ICONS.alertTriangle}
        <div>Gagal memuat riwayat pembelian: ${escapeHtml(err.message)}</div>
      </div>
    `;
  }
}

async function bukaModalDetailPembelian(pembelianId) {
  const modal = showModal({
    title: 'Memuat Rincian Faktur...',
    body: renderSkeleton(4)
  });

  try {
    const res = await apiCall('pembelian.detail', { id: pembelianId });
    const pb = res.pembelian;
    const items = res.items || [];
    const sup = res.supplier;
    const hutang = res.hutang;

    modal.el.querySelector('.modal-title').textContent = `Faktur Pembelian: ${pb.no_faktur}`;

    let itemHtml = '';
    items.forEach((it) => {
      itemHtml += `
        <tr>
          <td data-label="Barang">
            <div class="fw-semibold">${escapeHtml(it.nama)}</div>
          </td>
          <td data-label="Satuan">${escapeHtml(it.satuan)}</td>
          <td style="text-align: right;" class="tabular" data-label="Qty">${formatQty(it.qty)}</td>
          <td style="text-align: right;" class="tabular" data-label="Harga Satuan">${formatRupiah(it.harga_beli)}</td>
          <td style="text-align: right;" class="tabular fw-bold" data-label="Subtotal">${formatRupiah(it.subtotal)}</td>
        </tr>
      `;
    });

    modal.el.querySelector('.modal-body').innerHTML = `
      <div class="stack">
        <div class="row-between">
          <div>
            <div class="text-sm text-muted">Distributor / Supplier:</div>
            <div class="fw-bold">${escapeHtml(sup.nama || '-')}</div>
            <div class="text-xs text-muted">${escapeHtml(sup.alamat || '')}</div>
          </div>
          <div style="text-align: right;">
            <div class="text-sm text-muted">Tanggal Faktur:</div>
            <div class="fw-semibold">${formatTanggal(pb.tanggal)}</div>
            ${pb.no_faktur_supplier ? `<div class="text-xs text-muted">Ref Asli: ${escapeHtml(pb.no_faktur_supplier)}</div>` : ''}
          </div>
        </div>

        <div class="table-wrap" style="max-height: 280px; overflow-y: auto;">
          <table class="table">
            <thead>
              <tr>
                <th>Nama Barang</th>
                <th>Satuan</th>
                <th style="text-align: right;">Qty</th>
                <th style="text-align: right;">Harga Satuan</th>
                <th style="text-align: right;">Subtotal</th>
              </tr>
            </thead>
            <tbody>
              ${itemHtml}
            </tbody>
          </table>
        </div>

        <div class="stack" style="background: var(--clr-surface-muted); padding: var(--sp-3); border-radius: var(--radius-md);">
          <div class="row-between text-sm">
            <span class="text-muted">Subtotal Kotor:</span>
            <span class="tabular fw-semibold">${formatRupiah(pb.subtotal)}</span>
          </div>
          <div class="row-between text-sm">
            <span class="text-muted">Diskon Faktur:</span>
            <span class="tabular text-danger">- ${formatRupiah(pb.diskon || 0)}</span>
          </div>
          <div class="row-between fw-bold text-base">
            <span>Total Tagihan:</span>
            <span class="tabular text-primary">${formatRupiah(pb.total)}</span>
          </div>
          <div class="row-between text-sm">
            <span class="text-muted">Dibayar Saat Masuk:</span>
            <span class="tabular">${formatRupiah(pb.bayar || 0)}</span>
          </div>
          ${hutang ? `
            <div class="row-between text-sm fw-bold text-danger" style="border-top: 1px dashed var(--clr-border); padding-top: 4px; margin-top: 4px;">
              <span>Sisa Saldo Hutang:</span>
              <span class="tabular">${formatRupiah(hutang.sisa)} (Jatuh Tempo: ${formatTanggal(hutang.jatuh_tempo || '-')})</span>
            </div>
          ` : ''}
        </div>

        ${pb.catatan ? `
          <div class="text-xs text-muted">
            <strong>Catatan:</strong> ${escapeHtml(pb.catatan)}
          </div>
        ` : ''}
      </div>
    `;
  } catch (err) {
    modal.el.querySelector('.modal-body').innerHTML = `
      <div class="alert alert-danger">${escapeHtml(err.message)}</div>
    `;
  }
}

