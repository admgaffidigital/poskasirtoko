/**
 * pelanggan.js — Modul Data Pelanggan, Member, dan Riwayat Transaksi/Poin
 * Sesuai Fase 5 Roadmap POS Kasir Toko Bangunan & Aturan Bisnis #7, #16
 */

import { apiCall } from '../api.js';
import { store } from '../state.js';
import { ICONS, showToast, showModal, showConfirm } from '../utils/ui.js';
import { $, renderSkeleton, renderEmpty } from '../utils/dom.js';
import { escapeHtml, formatRupiah, parseRupiah, formatTanggal } from '../utils/format.js';
import { bukaModalPilihanCetakPenjualan } from '../utils/printer.js';
import { bukaTautanEksternal } from '../utils/native.js';

let pelangganCache = [];
let pelangganSelectMode = false;
const pelangganSelectedMap = new Map();

function syncPelBulkBar(container, isOwnerOrAdmin) {
  const bar = $('#pel-bulk-bar', container);
  const btnToggle = $('#btn-toggle-select-pel', container);
  if (btnToggle) {
    btnToggle.className = `btn btn-sm ${pelangganSelectMode ? 'btn-primary' : 'btn-secondary'}`;
    btnToggle.innerHTML = `${ICONS.check}<span>${pelangganSelectMode ? 'Selesai Pilih' : 'Pilih'}</span>`;
  }
  if (!bar) return;
  const cnt = pelangganSelectedMap.size;
  const elCnt = $('#pel-bulk-count', bar);
  if (elCnt) elCnt.textContent = String(cnt);
  bar.style.display = pelangganSelectMode ? 'flex' : 'none';
  bar.querySelectorAll('[data-needs-sel]').forEach((b) => { b.disabled = cnt === 0; });
  const btnLvl = $('#btn-bulk-pel-level', bar);
  if (btnLvl) btnLvl.style.display = isOwnerOrAdmin ? 'inline-flex' : 'none';
  const btnDel = $('#btn-bulk-pel-hapus', bar);
  if (btnDel) btnDel.style.display = isOwnerOrAdmin ? 'inline-flex' : 'none';
}

export async function renderPelangganModule(container) {
  const user = store.get('user');
  const canEdit = Boolean(user);
  const isOwnerOrAdmin = user && (user.role === 'owner' || user.role === 'admin');
  pelangganSelectMode = false;
  pelangganSelectedMap.clear();

  container.innerHTML = `
    <div class="stack">
      <div class="page-header">
        <div>
          <h2>Data Pelanggan & Member</h2>
          <p>Manajemen mitra pembeli, loyalitas poin member, limit kredit tempo, dan riwayat transaksi</p>
        </div>
        ${canEdit ? `
          <div class="row" style="gap: var(--sp-2); align-items: center;">
            <button type="button" class="btn btn-secondary btn-sm" id="btn-toggle-select-pel" title="Mode Tandai & Pilih Banyak Pelanggan" style="gap: 5px;">
              ${ICONS.check}
              <span>Pilih</span>
            </button>
            <button type="button" class="btn btn-primary" id="btn-tambah-pelanggan">
              ${ICONS.plus}
              <span>Tambah Pelanggan / Member</span>
            </button>
          </div>
        ` : ''}
      </div>

      <!-- Stat Cards Pelanggan (2x2 di mobile, 4 kolom di desktop) -->
      <div class="stat-grid" id="stat-cards-pelanggan">
        <div class="stat-card-pro">
          <div class="stat-card-header">
            <span class="stat-card-title">Total Pelanggan</span>
            <div class="stat-card-icon icon-blue">${ICONS.users}</div>
          </div>
          <div class="stat-card-value" id="stat-pel-total">0</div>
          <div class="stat-card-desc" id="stat-pel-member">0 Member terdaftar</div>
        </div>
        <div class="stat-card-pro">
          <div class="stat-card-header">
            <span class="stat-card-title">Total Saldo Titipan</span>
            <div class="stat-card-icon icon-emerald">${ICONS.wallet}</div>
          </div>
          <div class="stat-card-value text-success" id="stat-pel-deposit">Rp 0</div>
          <div class="stat-card-desc">Dana titipan aktif pelanggan</div>
        </div>
        <div class="stat-card-pro">
          <div class="stat-card-header">
            <span class="stat-card-title">Total Piutang Aktif</span>
            <div class="stat-card-icon icon-rose">${ICONS.wallet}</div>
          </div>
          <div class="stat-card-value text-danger" id="stat-pel-piutang">Rp 0</div>
          <div class="stat-card-desc">Tagihan tempo berjalan</div>
        </div>
        <div class="stat-card-pro">
          <div class="stat-card-header">
            <span class="stat-card-title">Total Poin Beredar</span>
            <div class="stat-card-icon icon-amber">${ICONS.award}</div>
          </div>
          <div class="stat-card-value text-warning" id="stat-pel-poin">0 Poin</div>
          <div class="stat-card-desc">Dapat ditukar hadiah</div>
        </div>
      </div>

      <div class="card card-body stack">
        <!-- Filter Bar Pelanggan (Responsif Proporsional) -->
        <div class="filter-bar-responsive">
          <div class="field filter-tipe">
            <label class="field-label" for="filter-pel-tipe">Tipe Mitra</label>
            <select class="input" id="filter-pel-tipe">
              <option value="">Semua Tipe</option>
              <option value="member">Member</option>
              <option value="umum">Umum</option>
            </select>
          </div>

          <div class="field filter-level">
            <label class="field-label" for="filter-pel-level">Level Member</label>
            <select class="input" id="filter-pel-level">
              <option value="">Semua Level</option>
              <option value="Reguler">Reguler</option>
              <option value="Silver">Silver</option>
              <option value="Gold">Gold</option>
              <option value="Platinum">Platinum</option>
            </select>
          </div>

          <div class="filter-search-wrap">
            <div class="field grow">
              <label class="field-label" for="search-pel">Cari Pelanggan</label>
              <div class="input-group">
                <span class="input-icon">${ICONS.search}</span>
                <input type="search" class="input" id="search-pel" placeholder="Cari nama, kode member, no HP, alamat...">
              </div>
            </div>
          </div>
        </div>

        <div id="area-tabel-pelanggan" style="margin-top: var(--sp-2);">
          ${renderSkeleton(4)}
        </div>
      </div>
    </div>

    <!-- Floating Bulk Action Bar Pelanggan (Solid) -->
    <div class="bulk-action-bar no-print" id="pel-bulk-bar" style="display: none;">
      <div class="bulk-action-info">
        <span class="bulk-action-count" id="pel-bulk-count">0</span>
        <span>pelanggan dipilih</span>
      </div>
      <div class="bulk-action-btns">
        <button type="button" class="btn btn-xs btn-bulk-ghost" id="btn-bulk-pel-all">Pilih Semua</button>
        <button type="button" class="btn btn-xs btn-primary" id="btn-bulk-pel-level" data-needs-sel disabled>Ubah Level</button>
        <button type="button" class="btn btn-xs btn-bulk-ghost" id="btn-bulk-pel-wa" data-needs-sel disabled>Salin Kontak WA</button>
        <button type="button" class="btn btn-xs btn-danger" id="btn-bulk-pel-hapus" data-needs-sel disabled>Hapus</button>
        <button type="button" class="btn btn-xs btn-bulk-ghost" id="btn-bulk-pel-cancel">Batal</button>
      </div>
    </div>
  `;

  // Event Listeners Filter
  let timeoutCari = null;
  const inputSearch = $('#search-pel', container);
  const selTipe = $('#filter-pel-tipe', container);
  const selLevel = $('#filter-pel-level', container);

  const triggerMuat = () => muatDataPelanggan(container);

  inputSearch?.addEventListener('input', () => {
    clearTimeout(timeoutCari);
    timeoutCari = setTimeout(triggerMuat, 300);
  });
  selTipe?.addEventListener('change', triggerMuat);
  selLevel?.addEventListener('change', triggerMuat);

  const keluarSelectPel = () => {
    if (!pelangganSelectMode) return false;
    pelangganSelectMode = false;
    pelangganSelectedMap.clear();
    syncPelBulkBar(container, isOwnerOrAdmin);
    muatDataPelanggan(container);
    return true;
  };
  window.__posCancelSelectMode = keluarSelectPel;

  if (canEdit) {
    $('#btn-toggle-select-pel', container)?.addEventListener('click', () => {
      pelangganSelectMode = !pelangganSelectMode;
      if (!pelangganSelectMode) pelangganSelectedMap.clear();
      syncPelBulkBar(container, isOwnerOrAdmin);
      muatDataPelanggan(container);
    });

    $('#btn-bulk-pel-cancel', container)?.addEventListener('click', keluarSelectPel);

    $('#btn-bulk-pel-all', container)?.addEventListener('click', () => {
      const semuaTerpilih = pelangganCache.length > 0 && pelangganCache.every((p) => pelangganSelectedMap.has(p.id));
      if (semuaTerpilih) {
        pelangganCache.forEach((p) => pelangganSelectedMap.delete(p.id));
      } else {
        pelangganCache.forEach((p) => pelangganSelectedMap.set(p.id, p));
      }
      syncPelBulkBar(container, isOwnerOrAdmin);
      muatDataPelanggan(container);
    });

    // Ubah Level Member Massal (Khusus Owner & Admin)
    $('#btn-bulk-pel-level', container)?.addEventListener('click', () => {
      if (!isOwnerOrAdmin) return;
      const terpilih = Array.from(pelangganSelectedMap.values());
      if (!terpilih.length) return;
      const modalLvl = showModal({
        title: `Ubah Level (${terpilih.length} Pelanggan)`,
        size: 'sm',
        body: `
          <div class="stack">
            <div class="text-sm text-muted">Atur level member untuk <strong>${terpilih.length}</strong> pelanggan terpilih (otomatis menjadi Member):</div>
            <div class="field">
              <label class="field-label" for="sel-bulk-pel-level">Level Member Baru</label>
              <select class="select" id="sel-bulk-pel-level">
                <option value="Reguler">Reguler</option>
                <option value="Silver">Silver</option>
                <option value="Gold">Gold</option>
                <option value="Platinum">Platinum</option>
              </select>
            </div>
          </div>
        `,
        footer: `
          <button type="button" class="btn btn-secondary btn-sm btn-cancel">Batal</button>
          <button type="button" class="btn btn-primary btn-sm" id="btn-konfirm-bulk-pel-lvl">Simpan Level</button>
        `
      });

      modalLvl.el.querySelector('#btn-konfirm-bulk-pel-lvl')?.addEventListener('click', async () => {
        const levelBaru = modalLvl.el.querySelector('#sel-bulk-pel-level')?.value || 'Reguler';
        const btn = modalLvl.el.querySelector('#btn-konfirm-bulk-pel-lvl');
        if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan...'; }
        let sukses = 0;
        for (const it of terpilih) {
          try {
            await apiCall('pelanggan.update', {
              id: it.id,
              tipe: 'member',
              level: levelBaru
            });
            sukses++;
          } catch (_) { }
        }
        modalLvl.close();
        showToast(`${sukses} dari ${terpilih.length} pelanggan berhasil diperbarui ke level ${levelBaru}.`, sukses > 0 ? 'success' : 'warning');
        keluarSelectPel();
      });
    });

    // Salin Daftar Kontak WA Pelanggan Terpilih
    $('#btn-bulk-pel-wa', container)?.addEventListener('click', () => {
      const terpilih = Array.from(pelangganSelectedMap.values());
      if (!terpilih.length) return;
      const lines = terpilih.map((p, i) => `${i + 1}. ${p.nama} (${p.hp || 'Tanpa HP'})${p.tipe === 'member' ? ` - ${p.level || 'Member'}` : ''}`);
      const teks = lines.join('\n');
      const modalWa = showModal({
        title: `Daftar Kontak (${terpilih.length} Pelanggan)`,
        size: 'sm',
        body: `
          <div class="stack">
            <div class="text-xs text-muted">Daftar kontak pelanggan/member yang Anda tandai:</div>
            <textarea class="input" id="txt-bulk-pel-wa" rows="8" style="font-family: var(--font-mono); font-size: 12px;">${escapeHtml(teks)}</textarea>
          </div>
        `,
        footer: `
          <button type="button" class="btn btn-secondary btn-sm btn-cancel">Tutup</button>
          <button type="button" class="btn btn-primary btn-sm" id="btn-copy-pel-wa">Salin Daftar</button>
        `
      });
      modalWa.el.querySelector('#btn-copy-pel-wa')?.addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(modalWa.el.querySelector('#txt-bulk-pel-wa')?.value || teks);
          showToast('Daftar kontak berhasil disalin!', 'success');
        } catch (_) {
          showToast('Salin teks langsung dari kotak di atas.', 'info');
        }
      });
    });

    // Hapus Massal Pelanggan (Owner/Admin)
    const btnBulkPelHapus = $('#btn-bulk-pel-hapus', container);
    btnBulkPelHapus?.addEventListener('click', async () => {
      if (btnBulkPelHapus.disabled) return;
      const terpilih = Array.from(pelangganSelectedMap.values());
      if (!terpilih.length) return;
      const setuju = await showConfirm({
        title: `Hapus ${terpilih.length} Pelanggan Terpilih?`,
        message: 'Pelanggan yang masih memiliki saldo piutang aktif akan dilewati otomatis demi keamanan data.',
        confirmText: `Ya, Hapus ${terpilih.length} Pelanggan`,
        danger: true
      });
      if (!setuju) return;

      btnBulkPelHapus.disabled = true;
      try {
        let sukses = 0;
        let gagal = 0;
        for (const it of terpilih) {
          try {
            await apiCall('pelanggan.delete', { id: it.id });
            sukses++;
          } catch (_) {
            gagal++;
          }
        }
        showToast(
          gagal > 0 ? `${sukses} pelanggan dihapus, ${gagal} dilewati (masih ada piutang aktif).` : `${sukses} pelanggan berhasil dihapus.`,
          sukses > 0 ? 'success' : 'warning',
          3200
        );
        keluarSelectPel();
      } finally {
        btnBulkPelHapus.disabled = false;
      }
    });

    $('#btn-tambah-pelanggan', container)?.addEventListener('click', () => {
      bukaModalFormPelanggan(container, null, triggerMuat);
    });
  }

  await muatDataPelanggan(container);

  return () => {
    pelangganSelectMode = false;
    pelangganSelectedMap.clear();
    if (window.__posCancelSelectMode === keluarSelectPel) {
      window.__posCancelSelectMode = null;
    }
  };
}

/* ========================================================================== */
/* MEMUAT DATA TABEL PELANGGAN                                                */
/* ========================================================================== */

async function muatDataPelanggan(container) {
  const area = $('#area-tabel-pelanggan', container);
  if (!area) return;

  const cari = $('#search-pel', container)?.value.trim() || '';
  const tipe = $('#filter-pel-tipe', container)?.value || '';
  const level = $('#filter-pel-level', container)?.value || '';

  area.innerHTML = renderSkeleton(4);

  try {
    const res = await apiCall('pelanggan.list', {
      cari,
      tipe,
      level,
      aktif_saja: false,
      limit: 100
    });

    const items = res.items || [];
    pelangganCache = items;

    // Hitung ringkasan statistik
    let totalMember = 0;
    let totalPiutang = 0;
    let totalPoin = 0;
    let totalDeposit = 0;

    items.forEach((it) => {
      if (it.tipe === 'member') totalMember++;
      totalPiutang += (Number(it.piutang_berjalan) || 0);
      totalPoin += (Number(it.poin) || 0);
      totalDeposit += (Number(it.saldo_deposit) || 0);
    });

    const elTotal = $('#stat-pel-total', container);
    const elMember = $('#stat-pel-member', container);
    const elDeposit = $('#stat-pel-deposit', container);
    const elPiutang = $('#stat-pel-piutang', container);
    const elPoin = $('#stat-pel-poin', container);

    if (elTotal) elTotal.textContent = `${items.length} Kontak`;
    if (elMember) elMember.textContent = `${totalMember} Member terdaftar`;
    if (elDeposit) elDeposit.textContent = formatRupiah(totalDeposit);
    if (elPiutang) elPiutang.textContent = formatRupiah(totalPiutang);
    if (elPoin) elPoin.textContent = `${totalPoin.toLocaleString('id-ID')} Poin`;

    if (items.length === 0) {
      area.innerHTML = renderEmpty('Belum ada data pelanggan ditemukan', 'Tambahkan pelanggan atau member baru untuk mulai bertransaksi');
      return;
    }

    const user = store.get('user');
    const isOwnerOrAdmin = user && (user.role === 'owner' || user.role === 'admin');

    area.innerHTML = `
      <div class="table-wrap">
        <table class="table table-pelanggan">
          <thead>
            <tr>
              ${pelangganSelectMode ? '<th style="width: 38px; text-align: center;">Pilih</th>' : ''}
              <th style="min-width: 150px;">Kode & Nama</th>
              <th style="min-width: 130px;">Kontak & Alamat</th>
              <th style="min-width: 90px;">Tipe & Level</th>
              <th class="num" style="min-width: 105px; white-space: nowrap;">Limit Kredit</th>
              <th class="num" style="min-width: 105px; white-space: nowrap;">Saldo Titipan</th>
              <th class="num" style="min-width: 95px; white-space: nowrap;">Sisa Piutang</th>
              <th class="num" style="min-width: 80px; white-space: nowrap;">Poin Member</th>
              <th style="min-width: 70px; text-align: center;">Status</th>
              <th style="text-align: right; min-width: 190px; width: 190px; white-space: nowrap;">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((it) => {
      const isMember = it.tipe === 'member';
      const isChecked = pelangganSelectMode && pelangganSelectedMap.has(it.id);
      let badgeTipe = '<span class="badge badge-info">Umum</span>';
      if (isMember) {
        let badgeColor = 'badge-primary';
        if (it.level === 'Gold') badgeColor = 'badge-warning';
        if (it.level === 'Platinum') badgeColor = 'badge-success';
        badgeTipe = `<span class="badge ${badgeColor}">${escapeHtml(it.level || 'Member')}</span>`;
      }

      const statusBadge = it.aktif !== false
        ? '<span class="badge badge-success text-xs">Aktif</span>'
        : '<span class="badge badge-danger text-xs">Nonaktif</span>';

      const piutangAktif = Number(it.piutang_berjalan) || 0;
      const saldoDeposit = Number(it.saldo_deposit) || 0;

      return `
                <tr class="pel-selectable-row ${isChecked ? 'is-bulk-selected' : ''}" data-id="${escapeHtml(it.id)}">
                  ${pelangganSelectMode ? `
                    <td data-label="Pilih" style="width: 38px; text-align: center;">
                      <input type="checkbox" class="bulk-checkbox cb-pel-select" data-id="${escapeHtml(it.id)}" ${isChecked ? 'checked' : ''} aria-label="Pilih ${escapeHtml(it.nama)}">
                    </td>
                  ` : ''}
                  <td data-label="Pelanggan">
                    <div class="row" style="align-items: center; gap: var(--sp-2); flex-wrap: nowrap;">
                      <div class="prd-table-avatar" style="width: 36px; height: 36px; flex-shrink: 0;">
                        ${ICONS.users}
                      </div>
                      <div class="grow" style="min-width: 0;">
                        <div class="fw-bold text-md">${escapeHtml(it.nama)}</div>
                        <span class="text-xs font-mono text-muted">${escapeHtml(it.kode || '-')}</span>
                      </div>
                      <div class="d-none-desktop">
                        ${badgeTipe}
                      </div>
                    </div>
                  </td>
                  <td data-label="Kontak & Alamat">
                    <div class="pel-cell-val">
                      <span class="text-xs font-mono fw-semibold">${escapeHtml(it.hp || '-')}</span>
                      ${it.alamat ? `
                        <div class="text-xs text-muted pel-alamat-text" title="${escapeHtml(it.alamat)}">
                          ${escapeHtml(it.alamat)}
                        </div>
                      ` : ''}
                    </div>
                  </td>
                  <td data-label="Tipe & Level" class="d-none-mobile">${badgeTipe}</td>
                  <td class="num font-mono" data-label="Limit Kredit">
                    <div class="pel-cell-val">
                      <span class="fw-semibold">${isMember ? formatRupiah(it.limit_kredit || 0) : '<span class="text-muted">-</span>'}</span>
                      ${isMember && it.tempo_hari ? `<span class="text-xs text-muted">Tempo ${it.tempo_hari} hari</span>` : ''}
                    </div>
                  </td>
                  <td class="num font-mono" data-label="Saldo Titipan">
                    <span class="fw-bold ${saldoDeposit > 0 ? 'text-success' : 'text-muted'}">${formatRupiah(saldoDeposit)}</span>
                  </td>
                  <td class="num" data-label="Sisa Piutang">
                    <span class="fw-bold ${piutangAktif > 0 ? 'text-danger' : 'text-success'}">${formatRupiah(piutangAktif)}</span>
                  </td>
                  <td class="num font-mono" data-label="Poin Member">
                    ${isMember ? `<span class="fw-bold text-warning">${(it.poin || 0).toLocaleString('id-ID')}</span>` : '<span class="text-muted">-</span>'}
                  </td>
                  <td data-label="Status">${statusBadge}</td>
                  <td style="text-align: right; min-width: 190px; width: 190px; padding-right: 8px; white-space: nowrap;" data-label="Aksi">
                    <div class="pel-actions-row">
                      <button type="button" class="btn btn-secondary btn-sm btn-detail-pel" data-id="${escapeHtml(it.id)}" title="Rincian & Riwayat Belanja/Poin">
                        ${ICONS.eye}
                        <span>Rincian</span>
                      </button>
                      <button type="button" class="btn btn-secondary btn-sm btn-edit-pel" data-id="${escapeHtml(it.id)}" title="Edit Pelanggan">
                        ${ICONS.edit}
                        <span>Ubah</span>
                      </button>
                      ${isOwnerOrAdmin ? `
                        <button type="button" class="btn btn-outline-danger btn-sm btn-hapus-pel" data-id="${escapeHtml(it.id)}" data-nama="${escapeHtml(it.nama)}" title="Hapus Pelanggan">
                          ${ICONS.trash}
                          <span>Hapus</span>
                        </button>
                      ` : ''}
                    </div>
                  </td>
                </tr>
              `;
    }).join('')}
          </tbody>
        </table>
      </div>
    `;

    // Pasang Event Listeners Mode Tandai & Pilih Pelanggan
    if (pelangganSelectMode) {
      area.querySelectorAll('.cb-pel-select').forEach((cb) => {
        cb.addEventListener('change', (e) => {
          e.stopPropagation();
          const id = cb.getAttribute('data-id');
          const tr = cb.closest('tr');
          const obj = items.find((x) => x.id === id);
          if (cb.checked) {
            if (obj) pelangganSelectedMap.set(id, obj);
            tr?.classList.add('is-bulk-selected');
          } else {
            pelangganSelectedMap.delete(id);
            tr?.classList.remove('is-bulk-selected');
          }
          syncPelBulkBar(container, isOwnerOrAdmin);
        });
      });

      area.querySelectorAll('.pel-selectable-row').forEach((tr) => {
        tr.style.cursor = 'pointer';
        tr.addEventListener('click', (e) => {
          if (e.target.closest('button, a, input')) return;
          const id = tr.getAttribute('data-id');
          if (!id) return;
          const cb = tr.querySelector('.cb-pel-select');
          const obj = items.find((x) => x.id === id);
          if (pelangganSelectedMap.has(id)) {
            pelangganSelectedMap.delete(id);
            tr.classList.remove('is-bulk-selected');
            if (cb) cb.checked = false;
          } else {
            if (obj) pelangganSelectedMap.set(id, obj);
            tr.classList.add('is-bulk-selected');
            if (cb) cb.checked = true;
          }
          syncPelBulkBar(container, isOwnerOrAdmin);
        });
      });
    }
    syncPelBulkBar(container, isOwnerOrAdmin);

    // Pasang Event Listeners
    area.querySelectorAll('.btn-detail-pel').forEach((btn) => {
      btn.addEventListener('click', () => {
        bukaModalDetailPelanggan(btn.getAttribute('data-id'), container);
      });
    });

    area.querySelectorAll('.btn-edit-pel').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const pelanggan = items.find((x) => x.id === id);
        if (pelanggan) {
          bukaModalFormPelanggan(container, pelanggan, () => muatDataPelanggan(container));
        }
      });
    });

    area.querySelectorAll('.btn-hapus-pel').forEach((btn) => {
      btn.addEventListener('click', async () => {
        if (btn.disabled) return;
        const id = btn.getAttribute('data-id');
        const nama = btn.getAttribute('data-nama');
        const setuju = await showConfirm(
          `Hapus Pelanggan "${nama}"?`,
          'Data pelanggan akan dinonaktifkan. Penghapusan akan ditolak otomatis jika pelanggan masih memiliki saldo piutang aktif.'
        );
        if (setuju) {
          btn.disabled = true;
          try {
            const resH = await apiCall('pelanggan.delete', { id });
            showToast(resH.pesan || 'Pelanggan berhasil dihapus', 'success');
            await muatDataPelanggan(container);
          } catch (err) {
            showToast(err.message || 'Gagal menghapus pelanggan', 'error');
            btn.disabled = false;
          }
        }
      });
    });

  } catch (err) {
    area.innerHTML = `
      <div class="alert alert-danger">${escapeHtml(err.message || 'Gagal memuat data pelanggan')}</div>
    `;
  }
}

/* ========================================================================== */
/* MODAL FORM TAMBAH / EDIT PELANGGAN                                         */
/* ========================================================================== */

function bukaModalFormPelanggan(container, pelanggan = null, onSaved) {
  const isEdit = Boolean(pelanggan && pelanggan.id);
  const user = store.get('user');
  const isOwnerOrAdmin = user && (user.role === 'owner' || user.role === 'admin');
  let isSubmitting = false;

  const modalBody = document.createElement('div');
  modalBody.className = 'stack';

  const defaultTipe = pelanggan ? pelanggan.tipe : 'member';
  const defaultLevel = pelanggan ? (pelanggan.level || 'Reguler') : 'Reguler';

  modalBody.innerHTML = `
    <form id="form-pelanggan" class="stack" style="gap: var(--sp-3);">
      <!-- Informasi Kontak & Identitas Mitra -->
      <div class="row" style="gap: var(--sp-3); flex-wrap: wrap;">
        <div class="field grow" style="min-width: 200px;">
          <label class="field-label" for="pel-nama">Nama Lengkap Pelanggan / Toko *</label>
          <input type="text" class="input" id="pel-nama" value="${escapeHtml(pelanggan ? pelanggan.nama : '')}" placeholder="Contoh: Pak Haji Agus / CV Mandiri Perkasa" required>
        </div>

        <div class="field" style="width: 150px; min-width: 130px;">
          <label class="field-label" for="pel-tipe">Tipe Mitra *</label>
          <select class="input" id="pel-tipe" ${isEdit && !isOwnerOrAdmin ? 'disabled' : ''}>
            <option value="member" ${defaultTipe === 'member' ? 'selected' : ''}>Member Loyalitas</option>
            <option value="umum" ${defaultTipe === 'umum' ? 'selected' : ''}>Pelanggan Umum</option>
          </select>
        </div>
      </div>

      <div class="row" style="gap: var(--sp-3); flex-wrap: wrap;">
        <div class="field grow" style="min-width: 190px;">
          <label class="field-label" for="pel-hp">Nomor HP / WhatsApp *</label>
          <input type="tel" class="input" id="pel-hp" value="${escapeHtml(pelanggan ? pelanggan.hp : '')}" placeholder="Contoh: 081234567890">
          <span class="text-xs text-muted" id="ket-hp">Wajib diisi (min 7 digit) untuk member loyalitas</span>
        </div>

        <div class="field" style="width: 200px; min-width: 160px;">
          <div class="row items-center justify-between" style="margin-bottom: 4px;">
            <label class="field-label" for="pel-kode" style="margin-bottom: 0;">Kode Member</label>
            ${!isEdit ? `<button type="button" class="btn btn-ghost btn-xs text-primary" id="btn-auto-kode-pel" title="Generate kode otomatis" style="padding: 2px 6px; font-size: var(--fs-2xs); display: inline-flex; align-items: center; gap: 4px;">${ICONS.sparkles}<span>Auto</span></button>` : ''}
          </div>
          <input type="text" class="input font-mono uppercase" id="pel-kode" value="${escapeHtml(pelanggan ? pelanggan.kode : '')}" placeholder="Auto (MBR-...)" ${!isOwnerOrAdmin && isEdit ? 'disabled' : ''}>
          <span class="text-xs text-muted">Dibuat otomatis bila kosong</span>
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="pel-alamat">Alamat Lengkap / Lokasi Proyek</label>
        <textarea class="input" id="pel-alamat" rows="2" placeholder="Alamat pengiriman material bangunan, nama proyek, atau patokan lokasi...">${escapeHtml(pelanggan ? pelanggan.alamat : '')}</textarea>
      </div>

      <!-- Khusus Pengaturan Member & Kredit Tempo -->
      <div id="section-member-options" class="stack" style="gap: var(--sp-2); padding-top: var(--sp-3); border-top: 1px dashed var(--border);">
        <div class="row items-center justify-between" style="margin-bottom: 2px;">
          <span class="fw-bold text-xs uppercase" style="letter-spacing: 0.05em; color: var(--primary);">Pengaturan Loyalitas & Kredit Tempo</span>
          <span class="badge badge-primary text-2xs">B2B / Rekanan</span>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: var(--sp-2);">
          <div class="field">
            <label class="field-label" for="pel-level">Level Member</label>
            <select class="input" id="pel-level" ${!isOwnerOrAdmin ? 'disabled' : ''}>
              <option value="Reguler" ${defaultLevel === 'Reguler' ? 'selected' : ''}>Reguler (1x Poin)</option>
              <option value="Silver" ${defaultLevel === 'Silver' ? 'selected' : ''}>Silver (1.2x Poin)</option>
              <option value="Gold" ${defaultLevel === 'Gold' ? 'selected' : ''}>Gold (1.5x Poin)</option>
              <option value="Platinum" ${defaultLevel === 'Platinum' ? 'selected' : ''}>Platinum (2x Poin)</option>
            </select>
          </div>

          <div class="field">
            <label class="field-label" for="pel-limit">Limit Kredit Tempo (Rp)</label>
            <input type="text" class="input font-mono fw-bold" id="pel-limit" value="${formatRupiah(pelanggan ? pelanggan.limit_kredit : 0, false)}" ${!isOwnerOrAdmin ? 'disabled' : ''}>
            <span class="text-2xs text-muted">Batas maksimal belanja</span>
          </div>

          <div class="field">
            <label class="field-label" for="pel-tempo">Jatuh Tempo</label>
            <div class="input-group">
              <input type="number" class="input" id="pel-tempo" value="${pelanggan ? (pelanggan.tempo_hari || 30) : 30}" min="1" max="180" ${!isOwnerOrAdmin ? 'disabled' : ''}>
              <span class="text-xs text-muted" style="padding: 0 10px; background: var(--surface-2); display: flex; align-items: center; border-left: 1px solid var(--border);">Hari</span>
            </div>
          </div>
        </div>
      </div>

      <div class="field" style="margin-top: 2px;">
        <label style="display: inline-flex; align-items: center; gap: 10px; font-size: var(--fs-sm); cursor: pointer; user-select: none;">
          <input type="checkbox" id="pel-aktif" ${pelanggan && pelanggan.aktif === false ? '' : 'checked'} style="width: 18px; height: 18px; accent-color: var(--primary);">
          <span class="fw-semibold">Pelanggan Aktif</span>
          <span class="text-xs text-muted">(Dapat dipilih saat transaksi kasir)</span>
        </label>
      </div>
    </form>
  `;

  const inputTipe = $('#pel-tipe', modalBody);
  const sectionMember = $('#section-member-options', modalBody);
  const inputHp = $('#pel-hp', modalBody);
  const inputLimit = $('#pel-limit', modalBody);
  const inputKode = $('#pel-kode', modalBody);

  const sesuaikanTampilanTipe = () => {
    if (inputTipe.value === 'member') {
      sectionMember.style.display = 'flex';
      inputHp.required = true;
    } else {
      sectionMember.style.display = 'none';
      inputHp.required = false;
    }
  };

  inputTipe?.addEventListener('change', sesuaikanTampilanTipe);
  sesuaikanTampilanTipe();

  // Generator instan Kode Member
  $('#btn-auto-kode-pel', modalBody)?.addEventListener('click', () => {
    const today = new Date();
    const y = today.getFullYear();
    const m = String(today.getMonth() + 1).padStart(2, '0');
    const d = String(today.getDate()).padStart(2, '0');
    const rnd = Math.floor(1000 + Math.random() * 9000);
    const prefix = inputTipe.value === 'member' ? 'MBR' : 'PLG';
    if (inputKode) {
      inputKode.value = `${prefix}-${y}${m}${d}-${rnd}`;
      showToast(`Kode otomatis dibuat: ${inputKode.value}`, 'info', 2000);
    }
  });

  // Normalisasi otomatis nomor HP saat input/blur
  inputHp?.addEventListener('blur', () => {
    let val = inputHp.value.trim().replace(/[^\d+]/g, '');
    if (val.startsWith('+62')) val = '0' + val.slice(3);
    else if (val.startsWith('62')) val = '0' + val.slice(2);
    else if (val.length > 0 && val.startsWith('8')) val = '0' + val;
    inputHp.value = val.replace(/\D/g, '');
  });

  inputLimit?.addEventListener('input', () => {
    const n = parseRupiah(inputLimit.value);
    inputLimit.value = formatRupiah(n, false);
  });

  // Modal Footer Terpisah & Menempel Rapi di Bawah Dialog
  const modalFooter = document.createElement('div');
  modalFooter.className = 'row items-center justify-end';
  modalFooter.style.cssText = 'width: 100%; gap: var(--sp-2);';
  modalFooter.innerHTML = `
    <button type="button" class="btn btn-secondary" id="btn-batal-form-pel">Batal</button>
    <button type="submit" form="form-pelanggan" class="btn btn-primary" id="btn-simpan-form-pel">
      ${ICONS.check}
      <span>${isEdit ? 'Simpan Perubahan' : 'Tambah Pelanggan'}</span>
    </button>
  `;

  const modalInstance = showModal({
    title: isEdit ? 'Edit Data Pelanggan / Member' : 'Tambah Pelanggan / Member Baru',
    body: modalBody,
    footer: modalFooter,
    size: 'md'
  });

  // Pastikan form selalu terbuka dari bagian atas dan fokus pada nama
  setTimeout(() => {
    const dialogBody = modalBody.closest('.dialog-body');
    if (dialogBody) dialogBody.scrollTop = 0;
    $('#pel-nama', modalBody)?.focus();
  }, 60);

  $('#btn-batal-form-pel', modalFooter)?.addEventListener('click', () => modalInstance.close());

  $('#form-pelanggan', modalBody)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (isSubmitting) return;

    const nama = $('#pel-nama', modalBody)?.value.trim();
    const tipe = inputTipe?.value;
    let hp = inputHp?.value.trim();
    const alamat = $('#pel-alamat', modalBody)?.value.trim();
    const kode = inputKode?.value.trim();
    const level = $('#pel-level', modalBody)?.value;
    const limit_kredit = parseRupiah(inputLimit ? inputLimit.value : 0);
    const tempo_hari = parseInt($('#pel-tempo', modalBody)?.value || 30, 10);
    const aktif = $('#pel-aktif', modalBody)?.checked;

    // Normalisasi HP
    if (hp) {
      let clean = hp.replace(/[^\d+]/g, '');
      if (clean.startsWith('+62')) clean = '0' + clean.slice(3);
      else if (clean.startsWith('62')) clean = '0' + clean.slice(2);
      else if (clean.length > 0 && clean.startsWith('8')) clean = '0' + clean;
      hp = clean.replace(/\D/g, '');
    }

    if (!nama) {
      showToast('Nama pelanggan wajib diisi', 'warning');
      return;
    }
    if (tipe === 'member' && (!hp || hp.length < 7)) {
      showToast('Nomor HP wajib diisi (minimal 7 digit) untuk pendaftaran Member', 'warning');
      return;
    }

    const btnSimpan = $('#btn-simpan-form-pel', modalFooter);
    if (btnSimpan) {
      btnSimpan.disabled = true;
      btnSimpan.innerHTML = '<span class="spinner spinner-sm"></span> Menyimpan...';
    }
    isSubmitting = true;

    try {
      if (isEdit) {
        await apiCall('pelanggan.update', {
          id: pelanggan.id,
          nama,
          tipe,
          hp,
          alamat,
          kode,
          level,
          limit_kredit,
          tempo_hari,
          aktif
        });
        showToast(`Pelanggan "${nama}" berhasil diperbarui`, 'success');
      } else {
        await apiCall('pelanggan.create', {
          nama,
          tipe,
          hp,
          alamat,
          kode,
          level,
          limit_kredit,
          tempo_hari,
          aktif
        });
        showToast(`Pelanggan "${nama}" berhasil ditambahkan`, 'success');
      }

      modalInstance.close();
      if (onSaved) onSaved();
    } catch (err) {
      showToast(err.message || 'Gagal menyimpan data pelanggan', 'error', 5000);
      if (btnSimpan) {
        btnSimpan.disabled = false;
        btnSimpan.innerHTML = `${ICONS.check} <span>${isEdit ? 'Simpan Perubahan' : 'Tambah Pelanggan'}</span>`;
      }
    } finally {
      isSubmitting = false;
    }
  });
}

/* ========================================================================== */
/* MODAL DETAIL & RIWAYAT PELANGGAN                                           */
/* ========================================================================== */

async function bukaModalDetailPelanggan(pelangganId, container = null) {
  const modalBody = document.createElement('div');
  modalBody.className = 'stack';
  modalBody.innerHTML = renderSkeleton(4);

  const modalInstance = showModal({
    title: 'Profil & Rincian Pelanggan',
    body: modalBody,
    size: 'md'
  });

  try {
    const res = await apiCall('pelanggan.detail', { id: pelangganId });
    const pel = res.pelanggan || {};
    const riwayatJual = res.riwayat_penjualan || [];
    const riwayatPoin = res.riwayat_poin || [];
    const riwayatTukar = res.riwayat_penukaran || [];
    const riwayatDeposit = res.riwayat_deposit || [];
    const saldoDeposit = Number(pel.saldo_deposit) || 0;
    const user = store.get('user');
    const isOwnerOrAdmin = user && (user.role === 'owner' || user.role === 'admin');

    const isMember = pel.tipe === 'member';

    const labelJenisDeposit = (jenis) => {
      const map = {
        masuk: { teks: 'Titipan Masuk', cls: 'badge-success' },
        pakai: { teks: 'Belanja POS', cls: 'badge-info' },
        tarik: { teks: 'Pengembalian', cls: 'badge-warning' },
        void: { teks: 'Void Nota', cls: 'badge-primary' },
        retur: { teks: 'Refund Retur', cls: 'badge-success' }
      };
      return map[String(jenis || '').toLowerCase()] || { teks: jenis || '-', cls: 'badge-secondary' };
    };

    modalBody.innerHTML = `
      <div class="card card-body pel-modal-profile" style="background: var(--surface-2); margin-bottom: var(--sp-2);">
        <div class="pel-modal-profile-top">
          <div class="prd-table-avatar" style="width: 44px; height: 44px; border-radius: var(--radius-lg);">
            ${ICONS.users}
          </div>
          <div class="grow" style="min-width: 0;">
            <div class="row" style="align-items: center; gap: 6px; flex-wrap: wrap;">
              <div class="fw-bold" style="font-size: var(--fs-lg); line-height: 1.25;">${escapeHtml(pel.nama)}</div>
              <span class="badge ${isMember ? 'badge-primary' : 'badge-info'}">${escapeHtml((pel.tipe || 'umum').toUpperCase())}${isMember ? ` • ${escapeHtml(pel.level || 'Reguler')}` : ''}</span>
            </div>
            <div class="text-xs font-mono text-muted" style="margin-top: 2px;">Kode: ${escapeHtml(pel.kode || '-')}</div>
            <div class="text-xs text-muted" style="margin-top: 2px;">${escapeHtml(pel.hp || '-')} • ${escapeHtml(pel.alamat || 'Alamat belum diatur')}</div>
          </div>
        </div>
        <div class="pel-modal-profile-stats">
          <div class="pel-modal-stat-item">
            <span class="text-2xs text-muted uppercase fw-semibold">Poin Loyalitas</span>
            <div class="fw-bold text-warning tabular" style="font-size: var(--fs-md);">
              ${(pel.poin || 0).toLocaleString('id-ID')} <small style="font-size: var(--fs-2xs);">POIN</small>
            </div>
          </div>
          <div class="pel-modal-stat-divider"></div>
          <div class="pel-modal-stat-item">
            <span class="text-2xs text-muted uppercase fw-semibold">Total Belanja Lunas</span>
            <div class="fw-bold tabular" style="font-size: var(--fs-md);">${formatRupiah(pel.total_belanja || 0)}</div>
          </div>
        </div>
      </div>

      <!-- Saldo Titipan / Deposit Pelanggan -->
      <div class="card card-body" style="background: var(--surface-2); border: 1px solid var(--border); margin-bottom: var(--sp-2); padding: var(--sp-3);">
        <div class="row-between" style="align-items: center; gap: var(--sp-2); flex-wrap: wrap;">
          <div>
            <div class="text-2xs text-muted uppercase fw-semibold">Saldo Titipan / Deposit</div>
            <div class="fw-bold font-mono ${saldoDeposit > 0 ? 'text-success' : ''}" style="font-size: var(--fs-xl); line-height: 1.2;">${formatRupiah(saldoDeposit)}</div>
            <div class="text-xs text-muted" style="margin-top: 2px;">Dapat langsung dipakai potong pembayaran saat belanja di POS</div>
          </div>
          <div class="row" style="gap: var(--sp-2); flex-wrap: wrap;">
            <button type="button" class="btn btn-primary btn-sm" id="btn-terima-titipan" style="gap: 5px;">
              ${ICONS.plus}
              <span>Terima Titipan</span>
            </button>
            ${isOwnerOrAdmin ? `
              <button type="button" class="btn btn-outline-danger btn-sm" id="btn-tarik-titipan" ${saldoDeposit <= 0 ? 'disabled title="Saldo titipan kosong"' : ''} style="gap: 5px;">
                ${ICONS.wallet}
                <span>Kembalikan Saldo</span>
              </button>
            ` : ''}
          </div>
        </div>
      </div>

      ${isMember ? `
        <div class="stat-grid-3" style="margin-bottom: var(--sp-2);">
          <div class="stat-card-pro is-compact">
            <span class="stat-card-title">LIMIT KREDIT</span>
            <div class="stat-card-value tabular">${formatRupiah(pel.limit_kredit || 0)}</div>
          </div>
          <div class="stat-card-pro is-compact">
            <span class="stat-card-title">PIUTANG BERJALAN</span>
            <div class="stat-card-value tabular ${res.piutang_berjalan > 0 ? 'text-danger' : 'text-success'}">${formatRupiah(res.piutang_berjalan || 0)}</div>
          </div>
          <div class="stat-card-pro is-compact">
            <span class="stat-card-title">SISA LIMIT</span>
            <div class="stat-card-value tabular text-primary">${formatRupiah(res.sisa_limit || 0)}</div>
          </div>
        </div>
      ` : ''}

      <!-- Riwayat Transaksi Belanja -->
      <div class="stack" style="gap: var(--sp-1); margin-top: var(--sp-2);">
        <span class="fw-semibold text-xs text-muted uppercase">TRANSAKSI BELANJA TERAKHIR</span>
        ${riwayatJual.length === 0 ? `
          <div class="text-xs text-muted" style="padding: var(--sp-2); text-align: center;">Belum ada riwayat transaksi belanja.</div>
        ` : `
          <div class="table-wrap">
            <table class="table" style="min-width: 0; width: 100%;">
              <thead>
                <tr>
                  <th>No Nota & Tgl</th>
                  <th class="num">Total Belanja</th>
                  <th>Metode</th>
                  <th>Status</th>
                  <th class="no-print" style="text-align: right; width: 60px;">Aksi</th>
                </tr>
              </thead>
              <tbody>
                ${riwayatJual.map((pj) => {
                  const metodeMap = { tunai: 'Tunai', qris: 'QRIS', transfer: 'Transfer', tempo: 'Tempo', deposit: 'Saldo Titipan', kombinasi: 'Kombinasi', campuran: 'Kombinasi' };
                  const statusMap = { lunas: 'Lunas', belum_lunas: 'Belum Lunas', bayar_sebagian: 'Cicilan', sebagian: 'Cicilan', void: 'Dibatalkan', pending: 'Ditahan' };
                  const isVoid = pj.status === 'void';
                  const isRetPenuh = !isVoid && pj.status_retur === 'penuh';
                  const isRetSebagian = !isVoid && pj.status_retur === 'sebagian';
                  const adaRetur = isRetPenuh || isRetSebagian;
                  const noRetStr = Array.isArray(pj.daftar_no_retur) && pj.daftar_no_retur.length ? pj.daftar_no_retur.join(', ') : '';
                  const totBersih = pj.total_bersih !== undefined ? pj.total_bersih : pj.total;
                  const sisaTag = Number(pj.sisa_tagihan || 0);
                  const mKey = String(pj.metode_bayar || '').toLowerCase();
                  const sKey = String(pj.status_bayar || '').toLowerCase();
                  const metodeLabel = metodeMap[mKey] || (pj.metode_bayar || '-');
                  const statusLabel = isVoid ? 'Dibatalkan' : (isRetPenuh ? 'Diretur Penuh' : (statusMap[sKey] || (pj.status_bayar || '-')));
                  const statusCls = isVoid || isRetPenuh ? 'badge-danger' : (sKey === 'lunas' ? 'badge-success' : (sKey === 'belum_lunas' ? 'badge-danger' : 'badge-warning'));
                  return `
                  <tr style="${isVoid || isRetPenuh ? 'opacity: 0.7; background: var(--bg-surface-variant);' : ''}">
                    <td data-label="No Nota & Tgl">
                      <div class="cell-stack" style="gap: 2px;">
                        <div class="row-between" style="width: 100%; align-items: center; gap: 8px;">
                          <span class="fw-bold font-mono text-xs" style="${isVoid || isRetPenuh ? 'text-decoration: line-through;' : ''}">${escapeHtml(pj.no_nota)}</span>
                          <span class="text-xs text-muted">${formatTanggal(pj.created_at, true)}</span>
                        </div>
                        ${noRetStr ? `<span class="text-2xs font-mono text-danger">Retur: ${escapeHtml(noRetStr)}</span>` : ''}
                      </div>
                    </td>
                    <td class="num fw-bold" data-label="Total Belanja">
                      ${isVoid ? `
                        <span class="text-muted" style="text-decoration: line-through;">${formatRupiah(pj.total)}</span>
                      ` : (adaRetur ? `
                        <div class="cell-stack" style="align-items: flex-end; gap: 1px;">
                          <span class="text-2xs text-muted" style="text-decoration: line-through; font-weight: var(--fw-normal);">${formatRupiah(pj.total)}</span>
                          <span>${formatRupiah(totBersih)}</span>
                          <span class="text-2xs text-danger" style="font-weight: var(--fw-normal);">Retur -${formatRupiah(pj.total_retur || 0)}</span>
                        </div>
                      ` : `
                        <div class="cell-stack" style="align-items: flex-end; gap: 1px;">
                          <span>${formatRupiah(pj.total)}</span>
                          ${sisaTag > 0 ? `<span class="text-2xs text-danger" style="font-weight: var(--fw-normal);">Sisa: ${formatRupiah(sisaTag)}</span>` : ''}
                        </div>
                      `)}
                    </td>
                    <td data-label="Metode"><span class="badge badge-info">${escapeHtml(metodeLabel)}</span></td>
                    <td data-label="Status">
                      <div class="cell-stack" style="gap: 3px; align-items: flex-start;">
                        <span class="badge ${statusCls}">${escapeHtml(statusLabel)}</span>
                        ${isRetSebagian ? `<span class="badge badge-warning badge-xs">Diretur Sebagian</span>` : ''}
                      </div>
                    </td>
                    <td class="no-print" style="text-align: right;" data-label="Aksi">
                      <div class="table-actions">
                        <button type="button" class="btn btn-sm btn-primary btn-cetak-riwayat-pelanggan" data-id="${escapeHtml(pj.id)}" title="Cetak Struk Transaksi">
                          ${ICONS.printer}
                          <span class="d-none-desktop">Cetak Struk</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>

      <!-- Riwayat Mutasi Saldo Titipan / Deposit -->
      <div class="stack" style="gap: var(--sp-1); margin-top: var(--sp-2);">
        <span class="fw-semibold text-xs text-muted uppercase">MUTASI SALDO TITIPAN / DEPOSIT TERAKHIR</span>
        ${riwayatDeposit.length === 0 ? `
          <div class="text-xs text-muted" style="padding: var(--sp-2); text-align: center;">Belum ada riwayat titipan saldo.</div>
        ` : `
          <div class="table-wrap">
            <table class="table" style="min-width: 0; width: 100%;">
              <thead>
                <tr>
                  <th>Waktu & Bukti</th>
                  <th>Jenis</th>
                  <th>Keterangan</th>
                  <th class="num">Nominal</th>
                  <th class="num">Saldo Akhir</th>
                </tr>
              </thead>
              <tbody>
                ${riwayatDeposit.map((dl) => {
                  const j = labelJenisDeposit(dl.jenis);
                  const nom = Number(dl.jumlah) || 0;
                  return `
                    <tr>
                      <td class="text-xs" data-label="Waktu & Bukti">
                        <div class="fw-semibold">${formatTanggal(dl.created_at, true)}</div>
                        <div class="font-mono text-muted">${escapeHtml(dl.no_bukti || dl.ref_id || '-')}</div>
                      </td>
                      <td data-label="Jenis">
                        <span class="badge ${j.cls}">${escapeHtml(j.teks)}</span>
                        <div class="text-2xs text-muted" style="margin-top: 2px;">${escapeHtml(String(dl.metode || '-').toUpperCase())}</div>
                      </td>
                      <td class="text-xs text-muted" data-label="Keterangan">${escapeHtml(dl.catatan || dl.ref_id || '-')}</td>
                      <td class="num font-mono fw-bold ${nom >= 0 ? 'text-success' : 'text-danger'}" data-label="Nominal">
                        ${nom >= 0 ? `+${formatRupiah(nom)}` : `-${formatRupiah(Math.abs(nom))}`}
                      </td>
                      <td class="num font-mono fw-bold" data-label="Saldo Akhir">${formatRupiah(dl.saldo || 0)}</td>
                    </tr>
                  `;
                }).join('')}
              </tbody>
            </table>
          </div>
        `}
      </div>

      <!-- Riwayat Mutasi Poin -->
      ${isMember ? `
        <div class="stack" style="gap: var(--sp-1); margin-top: var(--sp-2);">
          <span class="fw-semibold text-xs text-muted uppercase">MUTASI POIN LOYALITAS TERAKHIR</span>
          ${riwayatPoin.length === 0 ? `
            <div class="text-xs text-muted" style="padding: var(--sp-2); text-align: center;">Belum ada mutasi poin tercatat.</div>
          ` : `
            <div class="table-wrap">
              <table class="table" style="min-width: 0; width: 100%;">
                <thead>
                  <tr>
                    <th>Waktu</th>
                    <th>Jenis Mutasi</th>
                    <th>No Referensi</th>
                    <th class="num">Jumlah</th>
                    <th class="num">Saldo Akhir</th>
                  </tr>
                </thead>
                <tbody>
                  ${riwayatPoin.map((pl) => `
                    <tr>
                      <td class="text-xs" data-label="Waktu">
                        <div class="row-between" style="width: 100%; align-items: center; gap: 8px;">
                          <span class="fw-semibold">${formatTanggal(pl.created_at, true)}</span>
                          <span class="badge ${pl.jumlah > 0 ? 'badge-success' : 'badge-warning'}">${escapeHtml(pl.jenis)}</span>
                        </div>
                      </td>
                      <td class="d-none-mobile" data-label="Jenis"><span class="badge ${pl.jumlah > 0 ? 'badge-success' : 'badge-warning'}">${escapeHtml(pl.jenis)}</span></td>
                      <td class="text-xs font-mono" data-label="No Ref">${escapeHtml(pl.ref_id || '-')}</td>
                      <td class="num fw-bold ${pl.jumlah > 0 ? 'text-success' : 'text-danger'}" data-label="Jumlah">
                        ${pl.jumlah > 0 ? `+${pl.jumlah}` : pl.jumlah}
                      </td>
                      <td class="num font-mono fw-bold" data-label="Saldo Akhir">${(pl.saldo || 0).toLocaleString('id-ID')}</td>
                    </tr>
                  `).join('')}
                </tbody>
              </table>
            </div>
          `}
        </div>
      ` : ''}

      <div class="modal-footer" style="padding: var(--sp-3) 0 0 0; justify-content: flex-end; gap: var(--sp-2);">
        ${pel.hp ? `
          <button type="button" class="btn btn-outline-success btn-sm" id="btn-modal-wa" style="gap: 6px;">
            <span>Chat WhatsApp</span>
          </button>
        ` : ''}
        <button type="button" class="btn btn-secondary btn-sm" id="btn-tutup-detail-pel">Tutup</button>
      </div>
    `;

    $('#btn-terima-titipan', modalBody)?.addEventListener('click', () => {
      bukaModalTerimaTitipan(pel, () => {
        modalInstance.close();
        if (container) muatDataPelanggan(container);
        bukaModalDetailPelanggan(pel.id, container);
      });
    });

    $('#btn-tarik-titipan', modalBody)?.addEventListener('click', () => {
      bukaModalTarikTitipan(pel, () => {
        modalInstance.close();
        if (container) muatDataPelanggan(container);
        bukaModalDetailPelanggan(pel.id, container);
      });
    });

    $('#btn-modal-wa', modalBody)?.addEventListener('click', () => {
      bukaChatWhatsApp(pel.hp, pel.nama);
    });
    $('#btn-tutup-detail-pel', modalBody)?.addEventListener('click', () => modalInstance.close());

    modalBody.querySelectorAll('.btn-cetak-riwayat-pelanggan').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        btn.disabled = true;
        try {
          const res = await apiCall('penjualan.detail', { id });
          bukaModalPilihanCetakPenjualan(res);
        } catch (e) {
          showToast('Gagal memuat detail nota: ' + e.message, 'error');
        } finally {
          btn.disabled = false;
        }
      });
    });

  } catch (err) {
    modalBody.innerHTML = `
      <div class="alert alert-danger">${escapeHtml(err.message || 'Gagal memuat rincian pelanggan')}</div>
    `;
  }
}

/* ========================================================================== */
/* BUKA CHAT WHATSAPP DIRECT                                                  */
/* ========================================================================== */

function bukaChatWhatsApp(hp, nama) {
  if (!hp) return;
  let cleanHp = String(hp).replace(/[^0-9]/g, '');
  if (cleanHp.startsWith('0')) cleanHp = '62' + cleanHp.substring(1);
  else if (!cleanHp.startsWith('62')) cleanHp = '62' + cleanHp;

  const namaToko = store.getNamaToko ? store.getNamaToko() : 'Toko Kami';
  const pesan = `Halo Bpk/Ibu *${nama || ''}*, salam dari *${namaToko}*. Ada yang dapat kami bantu seputar kebutuhan belanja / pesanan Anda?`;
  const url = `https://wa.me/${cleanHp}?text=${encodeURIComponent(pesan)}`;
  bukaTautanEksternal(url);
}

/* ========================================================================== */
/* MODAL TERIMA & PENGEMBALIAN SALDO TITIPAN (DEPOSIT PELANGGAN)              */
/* ========================================================================== */

function bukaBuktiTitipanWA(pel, dataBukti, jenis) {
  let cleanHp = String(pel.hp || '').replace(/[^0-9]/g, '');
  if (cleanHp.startsWith('0')) cleanHp = '62' + cleanHp.substring(1);
  else if (cleanHp && !cleanHp.startsWith('62')) cleanHp = '62' + cleanHp;

  const namaToko = store.getNamaToko ? store.getNamaToko() : 'TOKO';
  const judul = jenis === 'tarik' ? 'BUKTI PENGEMBALIAN SALDO TITIPAN' : 'BUKTI TERIMA SALDO TITIPAN';
  const nominal = Math.abs(Number(dataBukti.log?.jumlah || 0));
  let pesan = `*${judul}*\n`;
  pesan += `Toko: *${namaToko.toUpperCase()}*\n`;
  pesan += `No. Bukti : *${dataBukti.no_bukti || '-'}*\n`;
  pesan += `Pelanggan : *${pel.nama || '-'}*\n`;
  pesan += `Metode    : ${String(dataBukti.log?.metode || 'tunai').toUpperCase()}\n`;
  pesan += `Nominal   : *${formatRupiah(nominal)}*\n`;
  pesan += `Saldo Titipan Sekarang: *${formatRupiah(dataBukti.saldo_deposit || 0)}*\n`;
  if (dataBukti.log?.catatan) pesan += `Catatan   : ${dataBukti.log.catatan}\n`;
  pesan += `\nTerima kasih atas kepercayaan Anda berbelanja di ${namaToko}.`;

  const encoded = encodeURIComponent(pesan);
  const url = cleanHp ? `https://wa.me/${cleanHp}?text=${encoded}` : `https://wa.me/?text=${encoded}`;
  bukaTautanEksternal(url);
}

function bukaModalTerimaTitipan(pel, onSuccess) {
  const saldoSaatIni = Number(pel.saldo_deposit) || 0;
  const modalBody = document.createElement('div');
  modalBody.innerHTML = `
    <form id="form-terima-titipan" class="stack" style="gap: var(--sp-3);">
      <div class="card card-body" style="background: var(--surface-2); padding: var(--sp-3);">
        <div class="row-between" style="align-items: center;">
          <div>
            <div class="text-xs text-muted">Pelanggan</div>
            <div class="fw-bold">${escapeHtml(pel.nama)}</div>
          </div>
          <div class="text-right">
            <div class="text-xs text-muted">Saldo Saat Ini</div>
            <div class="fw-bold font-mono text-success">${formatRupiah(saldoSaatIni)}</div>
          </div>
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="inp-dep-jumlah">Nominal Titipan (Rp) *</label>
        <input type="number" class="input fw-bold font-mono" id="inp-dep-jumlah" min="1000" step="1000" placeholder="Contoh: 500000" required>
        <div class="row" style="gap: 4px; margin-top: 6px; flex-wrap: wrap;">
          <button type="button" class="btn btn-xs btn-secondary btn-preset-dep" data-val="100000">100rb</button>
          <button type="button" class="btn btn-xs btn-secondary btn-preset-dep" data-val="250000">250rb</button>
          <button type="button" class="btn btn-xs btn-secondary btn-preset-dep" data-val="500000">500rb</button>
          <button type="button" class="btn btn-xs btn-secondary btn-preset-dep" data-val="1000000">1 Juta</button>
          <button type="button" class="btn btn-xs btn-secondary btn-preset-dep" data-val="2000000">2 Juta</button>
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="inp-dep-metode">Metode Penerimaan Dana *</label>
        <select class="select" id="inp-dep-metode" required>
          <option value="tunai">Tunai (Masuk Laci Kasir)</option>
          <option value="transfer">Transfer Bank</option>
          <option value="qris">QRIS</option>
        </select>
      </div>

      <div class="field">
        <label class="field-label" for="inp-dep-catatan">Catatan (Opsional)</label>
        <input type="text" class="input" id="inp-dep-catatan" placeholder="Contoh: Titipan uang proyek rumah tahap 1">
      </div>

      <div class="alert alert-info text-xs" style="margin: 0;">
        ${ICONS.info}
        <div>Dana titipan tercatat masuk ke Arus Kas &amp; Shift Kasir (jika tunai), dan tidak dihitung sebagai omset penjualan hingga dibelanjakan di POS.</div>
      </div>

      <div class="modal-footer" style="padding: var(--sp-2) 0 0 0; justify-content: flex-end; gap: var(--sp-2);">
        <button type="button" class="btn btn-secondary btn-sm" id="btn-batal-dep">Batal</button>
        <button type="submit" class="btn btn-primary btn-sm" id="btn-simpan-dep">${ICONS.check} <span>Simpan Titipan</span></button>
      </div>
    </form>
  `;

  const modal = showModal({
    title: 'Terima Titipan / Deposit Pelanggan',
    body: modalBody,
    size: 'sm'
  });

  const inpJumlah = $('#inp-dep-jumlah', modalBody);
  modalBody.querySelectorAll('.btn-preset-dep').forEach((btn) => {
    btn.addEventListener('click', () => {
      if (inpJumlah) inpJumlah.value = btn.getAttribute('data-val');
    });
  });

  $('#btn-batal-dep', modalBody)?.addEventListener('click', () => modal.close());

  $('#form-terima-titipan', modalBody)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const jumlah = parseRupiah(inpJumlah?.value || 0);
    const metode = $('#inp-dep-metode', modalBody)?.value || 'tunai';
    const catatan = $('#inp-dep-catatan', modalBody)?.value.trim() || '';

    if (jumlah <= 0) {
      showToast('Masukkan nominal titipan yang valid.', 'warning');
      return;
    }

    const btn = $('#btn-simpan-dep', modalBody);
    if (btn) { btn.disabled = true; btn.textContent = 'Menyimpan...'; }

    try {
      const res = await apiCall('deposit.tambah', {
        pelanggan_id: pel.id,
        jumlah,
        metode,
        catatan
      });
      modal.close();
      showToast(res.pesan || 'Titipan saldo berhasil disimpan!', 'success', 3500);

      if (pel.hp) {
        const kirimWa = await showConfirm({
          title: 'Kirim Bukti Titipan via WhatsApp?',
          message: `Bukti ${res.no_bukti} (${formatRupiah(jumlah)}). Saldo titipan ${pel.nama} kini ${formatRupiah(res.saldo_deposit)}.`,
          confirmText: 'Kirim via WhatsApp',
          cancelText: 'Selesai'
        });
        if (kirimWa) bukaBuktiTitipanWA(pel, res, 'masuk');
      }

      if (typeof onSuccess === 'function') onSuccess(res);
    } catch (err) {
      showToast(err.message || 'Gagal mencatat titipan saldo.', 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = `${ICONS.check} <span>Simpan Titipan</span>`; }
    }
  });
}

function bukaModalTarikTitipan(pel, onSuccess) {
  const saldoSaatIni = Number(pel.saldo_deposit) || 0;
  if (saldoSaatIni <= 0) {
    showToast('Saldo titipan pelanggan saat ini Rp 0.', 'info');
    return;
  }

  const modalBody = document.createElement('div');
  modalBody.innerHTML = `
    <form id="form-tarik-titipan" class="stack" style="gap: var(--sp-3);">
      <div class="card card-body" style="background: var(--surface-2); padding: var(--sp-3);">
        <div class="row-between" style="align-items: center;">
          <div>
            <div class="text-xs text-muted">Pelanggan</div>
            <div class="fw-bold">${escapeHtml(pel.nama)}</div>
          </div>
          <div class="text-right">
            <div class="text-xs text-muted">Saldo Tersedia</div>
            <div class="fw-bold font-mono text-success">${formatRupiah(saldoSaatIni)}</div>
          </div>
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="inp-tarik-jumlah">Nominal Dikembalikan (Rp) *</label>
        <input type="number" class="input fw-bold font-mono" id="inp-tarik-jumlah" value="${saldoSaatIni}" min="1" max="${saldoSaatIni}" required>
        <div class="row" style="justify-content: flex-end; margin-top: 4px;">
          <button type="button" class="btn btn-xs btn-ghost text-primary" id="btn-tarik-semua">Kembalikan Semua (${formatRupiah(saldoSaatIni)})</button>
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="inp-tarik-metode">Metode Pengembalian *</label>
        <select class="select" id="inp-tarik-metode" required>
          <option value="tunai">Tunai (Dari Laci Kasir)</option>
          <option value="transfer">Transfer Bank</option>
        </select>
      </div>

      <div class="field">
        <label class="field-label" for="inp-tarik-catatan">Alasan / Catatan</label>
        <input type="text" class="input" id="inp-tarik-catatan" placeholder="Contoh: Proyek selesai, sisa titipan diminta kembali">
      </div>

      <div class="modal-footer" style="padding: var(--sp-2) 0 0 0; justify-content: flex-end; gap: var(--sp-2);">
        <button type="button" class="btn btn-secondary btn-sm" id="btn-batal-tarik">Batal</button>
        <button type="submit" class="btn btn-danger btn-sm" id="btn-simpan-tarik">${ICONS.check} <span>Kembalikan Saldo</span></button>
      </div>
    </form>
  `;

  const modal = showModal({
    title: 'Kembalikan Saldo Titipan Pelanggan',
    body: modalBody,
    size: 'sm'
  });

  const inpJumlah = $('#inp-tarik-jumlah', modalBody);
  $('#btn-tarik-semua', modalBody)?.addEventListener('click', () => {
    if (inpJumlah) inpJumlah.value = String(saldoSaatIni);
  });
  $('#btn-batal-tarik', modalBody)?.addEventListener('click', () => modal.close());

  $('#form-tarik-titipan', modalBody)?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const jumlah = parseRupiah(inpJumlah?.value || 0);
    const metode = $('#inp-tarik-metode', modalBody)?.value || 'tunai';
    const catatan = $('#inp-tarik-catatan', modalBody)?.value.trim() || '';

    if (jumlah <= 0 || jumlah > saldoSaatIni) {
      showToast(`Nominal harus antara Rp 1 s/d ${formatRupiah(saldoSaatIni)}.`, 'warning');
      return;
    }

    const btn = $('#btn-simpan-tarik', modalBody);
    if (btn) { btn.disabled = true; btn.textContent = 'Memproses...'; }

    try {
      const res = await apiCall('deposit.tarik', {
        pelanggan_id: pel.id,
        jumlah,
        metode,
        catatan
      });
      modal.close();
      showToast(res.pesan || 'Pengembalian saldo titipan berhasil dicatat.', 'success', 3500);
      if (typeof onSuccess === 'function') onSuccess(res);
    } catch (err) {
      showToast(err.message || 'Gagal mengembalikan saldo titipan.', 'error');
      if (btn) { btn.disabled = false; btn.innerHTML = `${ICONS.check} <span>Kembalikan Saldo</span>`; }
    }
  });
}

