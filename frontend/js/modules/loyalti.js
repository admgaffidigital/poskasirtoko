/**
 * loyalti.js — Modul Loyalitas Member, Katalog Hadiah, & Penukaran Poin
 * Sesuai Fase 5 Roadmap POS Kasir Toko Bangunan & Aturan Bisnis #7, #16
 */

import { apiCall } from '../api.js';
import { store } from '../state.js';
import { ICONS, showToast, showModal, showConfirm } from '../utils/ui.js';
import { $, renderSkeleton, renderEmpty } from '../utils/dom.js';
import { escapeHtml, formatTanggal } from '../utils/format.js';

export async function renderLoyaltiModule(container) {
  const user = store.get('user');
  const isOwnerOrAdmin = user && (user.role === 'owner' || user.role === 'admin');

  container.innerHTML = `
    <div class="stack">
      <div class="page-header">
        <div>
          <h2>Poin & Hadiah Loyalitas Member</h2>
          <p>Katalog reward toko bangunan, formulir penukaran poin pelanggan, dan riwayat penukaran</p>
        </div>
        <div class="row" style="gap: var(--sp-2);">
          <div class="segmented" id="tabs-loyalti" role="tablist">
            <button type="button" id="tab-btn-katalog" class="btn btn-sm" aria-pressed="true">
              ${ICONS.award}
              <span>Katalog Hadiah</span>
            </button>
            <button type="button" id="tab-btn-tukar" class="btn btn-sm" aria-pressed="false">
              ${ICONS.rotateCcw}
              <span>Formulir Tukar Poin</span>
            </button>
            <button type="button" id="tab-btn-riwayat" class="btn btn-sm" aria-pressed="false">
              ${ICONS.clipboard}
              <span>Riwayat Penukaran</span>
            </button>
          </div>
          ${isOwnerOrAdmin ? `
            <button type="button" class="btn btn-primary" id="btn-tambah-hadiah">
              <span>+ Tambah Hadiah Baru</span>
            </button>
          ` : ''}
        </div>
      </div>

      <!-- Panel 1: Katalog Hadiah -->
      <div id="panel-katalog" class="stack">
        <div class="card card-body stack">
          <div class="row" style="gap: var(--sp-2); align-items: center;">
            <div class="input-group grow">
              <span class="input-icon">${ICONS.search}</span>
              <input type="search" class="input" id="search-hadiah" placeholder="Cari nama hadiah atau deskripsi...">
            </div>
            <button type="button" class="btn btn-secondary btn-icon" id="btn-refresh-hadiah" title="Muat Ulang" aria-label="Muat Ulang">
              ${ICONS.refresh}
            </button>
          </div>

          <div id="area-grid-hadiah" style="margin-top: var(--sp-2);">
            ${renderSkeleton(4)}
          </div>
        </div>
      </div>

      <!-- Panel 2: Formulir Tukar Poin Kasir -->
      <div id="panel-tukar" class="stack" style="display: none;">
        <div class="card card-body stack" style="max-width: 680px; margin: 0 auto; width: 100%;">
          <div class="row" style="align-items: center; gap: var(--sp-2); margin-bottom: var(--sp-2); border-bottom: 1px solid var(--border); padding-bottom: var(--sp-3);">
            <div style="font-size: 24px; color: var(--warning-text);">${ICONS.award}</div>
            <div>
              <h3 style="margin: 0;">Penukaran Hadiah Member</h3>
              <p class="text-xs text-muted" style="margin: 0;">Pilih member dan hadiah yang ingin ditukarkan dengan poin loyalitas</p>
            </div>
          </div>

          <form id="form-tukar-poin" class="stack">
            <div class="field">
              <label class="field-label" for="tukar-member-select">Pilih Pelanggan Member *</label>
              <select class="input" id="tukar-member-select" required>
                <option value="">-- Cari & Pilih Member --</option>
              </select>
              <div id="info-member-terpilih" class="card card-body" style="background: var(--surface-2); padding: var(--sp-2); margin-top: var(--sp-1); display: none;">
                <div class="row" style="justify-content: space-between; align-items: center;">
                  <div>
                    <span class="text-xs text-muted">Saldo Poin Aktif Member:</span>
                    <div class="fw-bold text-warning font-mono" id="label-saldo-poin-member" style="font-size: var(--fs-lg);">0 Poin</div>
                  </div>
                  <span class="badge badge-primary" id="label-level-member">Reguler</span>
                </div>
              </div>
            </div>

            <div class="field">
              <label class="field-label" for="tukar-hadiah-select">Pilih Item Hadiah *</label>
              <select class="input" id="tukar-hadiah-select" required>
                <option value="">-- Pilih Hadiah Tersedia --</option>
              </select>
              <div id="info-hadiah-terpilih" class="card card-body" style="background: var(--surface-2); padding: var(--sp-2); margin-top: var(--sp-1); display: none;">
                <div class="row" style="justify-content: space-between; align-items: center;">
                  <div>
                    <span class="text-xs text-muted">Biaya Poin per Unit:</span>
                    <div class="fw-bold text-primary font-mono" id="label-poin-hadiah" style="font-size: var(--fs-base);">0 Poin</div>
                  </div>
                  <div style="text-align: right;">
                    <span class="text-xs text-muted">Stok Hadiah Tersedia:</span>
                    <div class="fw-bold font-mono" id="label-stok-hadiah">0 Unit</div>
                  </div>
                </div>
              </div>
            </div>

            <div class="row" style="gap: var(--sp-2);">
              <div class="field" style="width: 140px;">
                <label class="field-label" for="tukar-qty">Kuantitas Hadiah *</label>
                <input type="number" class="input input-num fw-bold" id="tukar-qty" min="1" max="50" value="1" required>
              </div>

              <div class="field grow">
                <label class="field-label">Total Poin yang Dipotong</label>
                <div class="input fw-bold text-danger font-mono" id="label-total-poin-potong" style="display: flex; align-items: center; background: var(--surface-2);">
                  0 Poin
                </div>
              </div>
            </div>

            <div class="field">
              <label class="field-label" for="tukar-catatan">Catatan Petugas Kasir</label>
              <input type="text" class="input" id="tukar-catatan" placeholder="Contoh: Diserahkan langsung ke Pak Agus di kasir 1">
            </div>

            <div style="margin-top: var(--sp-2);">
              <button type="submit" class="btn btn-primary" id="btn-submit-tukar-poin" style="width: 100%; height: 42px;">
                ${ICONS.check}
                <span>Konfirmasi Penukaran Hadiah</span>
              </button>
            </div>
          </form>
        </div>
      </div>

      <!-- Panel 3: Riwayat Penukaran Hadiah -->
      <div id="panel-riwayat" class="stack" style="display: none;">
        <div class="card card-body stack">
          <div class="row" style="justify-content: space-between; align-items: center;">
            <h3 style="margin: 0;">Riwayat Klaim Hadiah Toko</h3>
            <button type="button" class="btn btn-secondary btn-icon" id="btn-refresh-riwayat" title="Muat Ulang">
              ${ICONS.refresh}
            </button>
          </div>
          <div id="area-tabel-riwayat-tukar" style="margin-top: var(--sp-2);">
            ${renderSkeleton(4)}
          </div>
        </div>
      </div>
    </div>
  `;

  // Binding Tab Switching
  const btnKatalog = $('#tab-btn-katalog', container);
  const btnTukar = $('#tab-btn-tukar', container);
  const btnRiwayat = $('#tab-btn-riwayat', container);

  const panelKatalog = $('#panel-katalog', container);
  const panelTukar = $('#panel-tukar', container);
  const panelRiwayat = $('#panel-riwayat', container);

  const setTab = (aktif) => {
    btnKatalog.setAttribute('aria-pressed', aktif === 'katalog');
    btnTukar.setAttribute('aria-pressed', aktif === 'tukar');
    btnRiwayat.setAttribute('aria-pressed', aktif === 'riwayat');

    panelKatalog.style.display = aktif === 'katalog' ? 'flex' : 'none';
    panelTukar.style.display = aktif === 'tukar' ? 'flex' : 'none';
    panelRiwayat.style.display = aktif === 'riwayat' ? 'flex' : 'none';

    if (aktif === 'katalog') muatDataHadiah(container);
    if (aktif === 'tukar') inisialisasiFormTukar(container);
    if (aktif === 'riwayat') muatRiwayatPenukaran(container);
  };

  btnKatalog?.addEventListener('click', () => setTab('katalog'));
  btnTukar?.addEventListener('click', () => setTab('tukar'));
  btnRiwayat?.addEventListener('click', () => setTab('riwayat'));

  // Filter Hadiah
  let timeoutCari = null;
  const inputSearch = $('#search-hadiah', container);
  inputSearch?.addEventListener('input', () => {
    clearTimeout(timeoutCari);
    timeoutCari = setTimeout(() => muatDataHadiah(container), 300);
  });
  $('#btn-refresh-hadiah', container)?.addEventListener('click', () => muatDataHadiah(container));
  $('#btn-refresh-riwayat', container)?.addEventListener('click', () => muatRiwayatPenukaran(container));

  if (isOwnerOrAdmin) {
    $('#btn-tambah-hadiah', container)?.addEventListener('click', () => {
      bukaModalFormHadiah(container, null, () => muatDataHadiah(container));
    });
  }

  // Muat data awal
  await muatDataHadiah(container);
}

/* ========================================================================== */
/* KATALOG HADIAH GRID                                                        */
/* ========================================================================== */

async function muatDataHadiah(container) {
  const area = $('#area-grid-hadiah', container);
  if (!area) return;

  const cari = $('#search-hadiah', container)?.value.trim() || '';
  area.innerHTML = renderSkeleton(4);

  try {
    const res = await apiCall('hadiah.list', { cari, aktif_saja: false });
    const items = res.items || [];

    if (items.length === 0) {
      area.innerHTML = renderEmpty('Belum ada item hadiah di katalog', 'Tambahkan merchandise atau voucher hadiah poin untuk member toko');
      return;
    }

    const user = store.get('user');
    const isOwnerOrAdmin = user && (user.role === 'owner' || user.role === 'admin');

    area.innerHTML = `
      <div class="grid grid-3" style="gap: var(--sp-3);">
        ${items.map((h) => {
          const stok = Number(h.stok || 0);
          const habis = stok <= 0;
          const statusBadge = h.aktif
            ? (habis ? '<span class="badge badge-danger">Stok Habis</span>' : '<span class="badge badge-success">Tersedia</span>')
            : '<span class="badge badge-warning">Nonaktif</span>';

          return `
            <div class="card card-body stack" style="justify-content: space-between; border-top: 4px solid var(--primary);">
              <div class="stack" style="gap: var(--sp-1);">
                <div class="row" style="justify-content: space-between; align-items: flex-start;">
                  <div style="font-size: 28px; color: var(--warning-text);">${ICONS.award}</div>
                  <div>${statusBadge}</div>
                </div>

                <div class="fw-bold" style="font-size: var(--fs-base); margin-top: var(--sp-1);">${escapeHtml(h.nama)}</div>
                <div class="text-xs text-muted" style="min-height: 36px;">${escapeHtml(h.deskripsi || 'Merchandise resmi Toko Bangunan')}</div>

                <div class="row" style="justify-content: space-between; align-items: baseline; margin-top: var(--sp-2); padding-top: var(--sp-2); border-top: 1px solid var(--border);">
                  <div>
                    <span class="text-xs text-muted">Dibutuhkan:</span>
                    <div class="fw-bold text-warning font-mono" style="font-size: var(--fs-lg);">
                      ${(h.poin_dibutuhkan || 0).toLocaleString('id-ID')} <small style="font-size: 11px;">POIN</small>
                    </div>
                  </div>
                  <div style="text-align: right;">
                    <span class="text-xs text-muted">Stok:</span>
                    <div class="fw-bold font-mono ${habis ? 'text-danger' : ''}">${stok} Unit</div>
                  </div>
                </div>
              </div>

              <div class="row" style="gap: var(--sp-2); margin-top: var(--sp-3);">
                ${!habis && h.aktif ? `
                  <button type="button" class="btn btn-sm btn-primary grow btn-tukar-langsung" data-id="${escapeHtml(h.id)}">
                    <span>Tukar Hadiah Ini</span>
                  </button>
                ` : `
                  <button type="button" class="btn btn-sm btn-secondary grow" disabled>
                    <span>Stok Tidak Tersedia</span>
                  </button>
                `}
                ${isOwnerOrAdmin ? `
                  <button type="button" class="btn btn-sm btn-secondary btn-icon btn-edit-hadiah" data-id="${escapeHtml(h.id)}" title="Edit Hadiah">
                    ${ICONS.settings}
                  </button>
                  <button type="button" class="btn btn-sm btn-danger btn-icon btn-hapus-hadiah" data-id="${escapeHtml(h.id)}" data-nama="${escapeHtml(h.nama)}" title="Hapus Hadiah">
                    ${ICONS.x}
                  </button>
                ` : ''}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;

    // Pasang Event Listeners
    area.querySelectorAll('.btn-tukar-langsung').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const tabTukar = $('#tab-btn-tukar', container);
        if (tabTukar) tabTukar.click();
        setTimeout(() => {
          const selH = $('#tukar-hadiah-select', container);
          if (selH) {
            selH.value = id;
            selH.dispatchEvent(new Event('change'));
          }
        }, 150);
      });
    });

    area.querySelectorAll('.btn-edit-hadiah').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const h = items.find((x) => x.id === id);
        if (h) bukaModalFormHadiah(container, h, () => muatDataHadiah(container));
      });
    });

    area.querySelectorAll('.btn-hapus-hadiah').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const nama = btn.getAttribute('data-nama');
        const setuju = await showConfirm(`Hapus Hadiah "${nama}"?`, 'Item hadiah akan dihapus dari katalog penukaran.');
        if (setuju) {
          try {
            const resH = await apiCall('hadiah.delete', { id });
            showToast(resH.pesan || 'Hadiah berhasil dihapus', 'success');
            await muatDataHadiah(container);
          } catch (err) {
            showToast(err.message || 'Gagal menghapus hadiah', 'error');
          }
        }
      });
    });

  } catch (err) {
    area.innerHTML = `
      <div class="alert alert-danger">${escapeHtml(err.message || 'Gagal memuat katalog hadiah')}</div>
    `;
  }
}

/* ========================================================================== */
/* FORMULIR PENUKARAN POIN                                                    */
/* ========================================================================== */

async function inisialisasiFormTukar(container) {
  const selMember = $('#tukar-member-select', container);
  const selHadiah = $('#tukar-hadiah-select', container);
  const inputQty = $('#tukar-qty', container);
  const infoMember = $('#info-member-terpilih', container);
  const infoHadiah = $('#info-hadiah-terpilih', container);
  const lblSaldoPoin = $('#label-saldo-poin-member', container);
  const lblLevelMember = $('#label-level-member', container);
  const lblPoinHadiah = $('#label-poin-hadiah', container);
  const lblStokHadiah = $('#label-stok-hadiah', container);
  const lblTotalPoin = $('#label-total-poin-potong', container);

  if (!selMember || !selHadiah) return;

  try {
    // Muat daftar member
    const [resPel, resH] = await Promise.all([
      apiCall('pelanggan.list', { tipe: 'member', aktif_saja: true, limit: 100 }),
      apiCall('hadiah.list', { aktif_saja: true, limit: 100 })
    ]);

    const members = resPel.items || [];
    const hadiahs = resH.items || [];

    selMember.innerHTML = '<option value="">-- Pilih Pelanggan Member --</option>' +
      members.map((m) => `<option value="${escapeHtml(m.id)}" data-poin="${m.poin || 0}" data-level="${escapeHtml(m.level || 'Reguler')}">${escapeHtml(m.nama)} (${(m.poin || 0).toLocaleString('id-ID')} Poin)</option>`).join('');

    selHadiah.innerHTML = '<option value="">-- Pilih Hadiah Tersedia --</option>' +
      hadiahs.map((h) => `<option value="${escapeHtml(h.id)}" data-poin="${h.poin_dibutuhkan || 0}" data-stok="${h.stok || 0}">${escapeHtml(h.nama)} (${(h.poin_dibutuhkan || 0).toLocaleString('id-ID')} Poin, Stok: ${h.stok})</option>`).join('');

    const hitungPoin = () => {
      const optM = selMember.selectedOptions[0];
      const optH = selHadiah.selectedOptions[0];
      const qty = Math.max(1, parseInt(inputQty.value || 1, 10));

      if (optM && optM.value) {
        infoMember.style.display = 'block';
        const poinM = parseInt(optM.getAttribute('data-poin') || 0, 10);
        lblSaldoPoin.textContent = `${poinM.toLocaleString('id-ID')} Poin`;
        lblLevelMember.textContent = optM.getAttribute('data-level') || 'Reguler';
      } else {
        infoMember.style.display = 'none';
      }

      if (optH && optH.value) {
        infoHadiah.style.display = 'block';
        const poinH = parseInt(optH.getAttribute('data-poin') || 0, 10);
        const stokH = parseInt(optH.getAttribute('data-stok') || 0, 10);
        lblPoinHadiah.textContent = `${poinH.toLocaleString('id-ID')} Poin`;
        lblStokHadiah.textContent = `${stokH} Unit`;

        const totalButuh = poinH * qty;
        lblTotalPoin.textContent = `${totalButuh.toLocaleString('id-ID')} Poin`;
      } else {
        infoHadiah.style.display = 'none';
        lblTotalPoin.textContent = '0 Poin';
      }
    };

    selMember.onchange = hitungPoin;
    selHadiah.onchange = hitungPoin;
    inputQty.oninput = hitungPoin;
    hitungPoin();

    $('#form-tukar-poin', container).onsubmit = async (e) => {
      e.preventDefault();
      const pelanggan_id = selMember.value;
      const hadiah_id = selHadiah.value;
      const qty = parseInt(inputQty.value, 10);
      const catatan = $('#tukar-catatan', container)?.value.trim();

      if (!pelanggan_id) {
        showToast('Pilih pelanggan member terlebih dahulu', 'warning');
        return;
      }
      if (!hadiah_id) {
        showToast('Pilih hadiah yang akan ditukarkan', 'warning');
        return;
      }

      const btnSub = $('#btn-submit-tukar-poin', container);
      btnSub.disabled = true;
      btnSub.innerHTML = '<span class="spinner spinner-sm"></span> Memproses...';

      try {
        const resTukar = await apiCall('member.tukarPoin', {
          pelanggan_id,
          hadiah_id,
          qty,
          catatan
        });

        showToast(resTukar.pesan || 'Penukaran poin berhasil!', 'success', 5000);

        // Reset form & kembali muat
        $('#tukar-catatan', container).value = '';
        inputQty.value = 1;
        inisialisasiFormTukar(container);
      } catch (err) {
        showToast(err.message || 'Gagal memproses penukaran poin', 'error');
        btnSub.disabled = false;
        btnSub.innerHTML = `${ICONS.check} <span>Konfirmasi Penukaran Hadiah</span>`;
      }
    };

  } catch (err) {
    showToast('Gagal memuat data formulir tukar poin: ' + err.message, 'error');
  }
}

/* ========================================================================== */
/* RIWAYAT PENUKARAN HADIAH                                                   */
/* ========================================================================== */

async function muatRiwayatPenukaran(container) {
  const area = $('#area-tabel-riwayat-tukar', container);
  if (!area) return;

  area.innerHTML = renderSkeleton(4);

  try {
    // Ambil log mutasi poin bertipe 'tukar' dari Poin_Log
    const [resLog, resPel, resH] = await Promise.all([
      apiCall('pelanggan.list', { limit: 100 }),
      apiCall('hadiah.list', { limit: 100 }),
      apiCall('pelanggan.list', { tipe: 'member', limit: 1 })
    ]);

    // Ambil semua mutasi poin tukar
    const memberContoh = resPel.items && resPel.items[0] ? resPel.items[0].id : '';
    let items = [];
    if (memberContoh) {
      const resPoin = await apiCall('member.riwayatPoin', { pelanggan_id: memberContoh, limit: 100 });
      items = (resPoin.items || []).filter((l) => l.jenis === 'tukar');
    }

    if (items.length === 0) {
      area.innerHTML = renderEmpty('Belum ada riwayat penukaran hadiah', 'Klaim penukaran hadiah member akan tercatat di sini');
      return;
    }

    area.innerHTML = `
      <div class="table-wrap">
        <table class="table">
          <thead>
            <tr>
              <th>Waktu Penukaran</th>
              <th>Nomor Bukti</th>
              <th class="num">Poin Dipotong</th>
              <th class="num">Sisa Poin Member</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((it) => `
              <tr>
                <td class="text-xs">${formatTanggal(it.created_at, true)}</td>
                <td><span class="font-mono fw-semibold">${escapeHtml(it.ref_id || '-')}</span></td>
                <td class="num fw-bold text-danger">${it.jumlah} Poin</td>
                <td class="num font-mono fw-bold">${(it.saldo || 0).toLocaleString('id-ID')} Poin</td>
              </tr>
            `).join('')}
          </tbody>
        </table>
      </div>
    `;
  } catch (err) {
    area.innerHTML = `
      <div class="alert alert-danger">${escapeHtml(err.message || 'Gagal memuat riwayat penukaran')}</div>
    `;
  }
}

/* ========================================================================== */
/* MODAL FORM TAMBAH / EDIT HADIAH                                            */
/* ========================================================================== */

function bukaModalFormHadiah(container, hadiah = null, onSaved) {
  const isEdit = Boolean(hadiah && hadiah.id);

  const modalBody = document.createElement('div');
  modalBody.className = 'stack';

  modalBody.innerHTML = `
    <form id="form-hadiah" class="stack">
      <div class="field">
        <label class="field-label" for="h-nama">Nama Item Hadiah *</label>
        <input type="text" class="input" id="h-nama" value="${escapeHtml(hadiah ? hadiah.nama : '')}" placeholder="Contoh: Kaos Eksklusif Toko Bangunan / Payung / Jam Dinding" required>
      </div>

      <div class="field">
        <label class="field-label" for="h-deskripsi">Deskripsi Singkat</label>
        <textarea class="input" id="h-deskripsi" rows="2" placeholder="Keterangan spesifikasi hadiah...">${escapeHtml(hadiah ? hadiah.deskripsi : '')}</textarea>
      </div>

      <div class="row" style="gap: var(--sp-2);">
        <div class="field grow">
          <label class="field-label" for="h-poin">Poin Dibutuhkan *</label>
          <input type="number" class="input font-mono fw-bold" id="h-poin" min="1" value="${hadiah ? (hadiah.poin_dibutuhkan || 100) : 100}" required>
          <span class="text-xs text-muted">Jumlah poin member untuk menukar 1 unit</span>
        </div>

        <div class="field" style="width: 140px;">
          <label class="field-label" for="h-stok">Stok Hadiah *</label>
          <input type="number" class="input font-mono fw-bold" id="h-stok" min="0" value="${hadiah ? (hadiah.stok || 0) : 10}" required>
        </div>
      </div>

      <div class="field" style="margin-top: var(--sp-1);">
        <label style="display: flex; align-items: center; gap: 8px; font-size: var(--fs-sm); cursor: pointer;">
          <input type="checkbox" id="h-aktif" ${hadiah && hadiah.aktif === false ? '' : 'checked'}>
          <span class="fw-semibold">Aktif di Katalog Penukaran</span>
        </label>
      </div>

      <div class="modal-footer" style="padding: var(--sp-3) 0 0 0; justify-content: flex-end;">
        <button type="button" class="btn btn-secondary" id="btn-batal-hadiah">Batal</button>
        <button type="submit" class="btn btn-primary" id="btn-simpan-hadiah">
          ${ICONS.check}
          <span>${isEdit ? 'Simpan Perubahan' : 'Tambah Hadiah'}</span>
        </button>
      </div>
    </form>
  `;

  const modalInstance = showModal({
    title: isEdit ? 'Edit Item Hadiah Poin' : 'Tambah Hadiah Poin Baru',
    body: modalBody,
    width: '460px'
  });

  $('#btn-batal-hadiah', modalBody)?.addEventListener('click', () => modalInstance.close());

  $('#form-hadiah', modalBody)?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nama = $('#h-nama', modalBody)?.value.trim();
    const deskripsi = $('#h-deskripsi', modalBody)?.value.trim();
    const poin_dibutuhkan = parseInt($('#h-poin', modalBody)?.value || 1, 10);
    const stok = parseInt($('#h-stok', modalBody)?.value || 0, 10);
    const aktif = $('#h-aktif', modalBody)?.checked;

    if (!nama) {
      showToast('Nama hadiah wajib diisi', 'warning');
      return;
    }
    if (poin_dibutuhkan <= 0) {
      showToast('Poin dibutuhkan harus lebih dari 0', 'warning');
      return;
    }

    const btnSimpan = $('#btn-simpan-hadiah', modalBody);
    btnSimpan.disabled = true;
    btnSimpan.innerHTML = '<span class="spinner spinner-sm"></span> Menyimpan...';

    try {
      if (isEdit) {
        await apiCall('hadiah.update', { id: hadiah.id, nama, deskripsi, poin_dibutuhkan, stok, aktif });
        showToast(`Hadiah "${nama}" berhasil diperbarui`, 'success');
      } else {
        await apiCall('hadiah.create', { nama, deskripsi, poin_dibutuhkan, stok, aktif });
        showToast(`Hadiah "${nama}" berhasil ditambahkan ke katalog`, 'success');
      }

      modalInstance.close();
      if (onSaved) onSaved();
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan hadiah', 'error');
      btnSimpan.disabled = false;
      btnSimpan.innerHTML = `${ICONS.check} <span>${isEdit ? 'Simpan Perubahan' : 'Tambah Hadiah'}</span>`;
    }
  });
}

