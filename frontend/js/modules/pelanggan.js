/**
 * pelanggan.js — Modul Data Pelanggan, Member, dan Riwayat Transaksi/Poin
 * Sesuai Fase 5 Roadmap POS Kasir Toko Bangunan & Aturan Bisnis #7, #16
 */

import { apiCall } from '../api.js';
import { store } from '../state.js';
import { ICONS, showToast, showModal, showConfirm } from '../utils/ui.js';
import { $, renderSkeleton, renderEmpty } from '../utils/dom.js';
import { escapeHtml, formatRupiah, parseRupiah, formatTanggal } from '../utils/format.js';

export async function renderPelangganModule(container) {
  const user = store.get('user');
  const canEdit = Boolean(user);
  const isOwnerOrAdmin = user && (user.role === 'owner' || user.role === 'admin');

  container.innerHTML = `
    <div class="stack">
      <div class="page-header">
        <div>
          <h2>Data Pelanggan & Member</h2>
          <p>Manajemen mitra pembeli, loyalitas poin member, limit kredit tempo, dan riwayat transaksi</p>
        </div>
        ${canEdit ? `
          <div>
            <button type="button" class="btn btn-primary" id="btn-tambah-pelanggan">
              <span>+ Tambah Pelanggan / Member</span>
            </button>
          </div>
        ` : ''}
      </div>

      <!-- Stat Cards Pelanggan (2x2 di mobile, 4 kolom di desktop) -->
      <div class="stat-grid" id="stat-cards-pelanggan">
        <div class="card card-body stat-card">
          <span class="text-xs text-muted fw-semibold">TOTAL PELANGGAN</span>
          <div class="stat-value" id="stat-pel-total">0</div>
          <span class="text-xs text-muted" id="stat-pel-sub">Mitra terdaftar</span>
        </div>
        <div class="card card-body stat-card">
          <span class="text-xs text-muted fw-semibold">MEMBER LOYALITAS</span>
          <div class="stat-value text-primary" id="stat-pel-member">0 Member</div>
          <span class="text-xs text-muted">Pelanggan terdaftar</span>
        </div>
        <div class="card card-body stat-card">
          <span class="text-xs text-muted fw-semibold">TOTAL PIUTANG AKTIF</span>
          <div class="stat-value text-danger" id="stat-pel-piutang">Rp 0</div>
          <span class="text-xs text-muted">Tagihan tempo berjalan</span>
        </div>
        <div class="card card-body stat-card">
          <span class="text-xs text-muted fw-semibold">TOTAL POIN BEREDAR</span>
          <div class="stat-value text-warning" id="stat-pel-poin">0 Poin</div>
          <span class="text-xs text-muted">Dapat ditukar hadiah</span>
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

            <button type="button" class="btn btn-secondary btn-icon" id="btn-refresh-pel" title="Muat Ulang" style="height: 40px; width: 40px; margin-bottom: 2px;">
              ${ICONS.refresh}
            </button>
          </div>
        </div>

        <div id="area-tabel-pelanggan" style="margin-top: var(--sp-2);">
          ${renderSkeleton(4)}
        </div>
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
  $('#btn-refresh-pel', container)?.addEventListener('click', triggerMuat);

  if (canEdit) {
    $('#btn-tambah-pelanggan', container)?.addEventListener('click', () => {
      bukaModalFormPelanggan(container, null, triggerMuat);
    });
  }

  await muatDataPelanggan(container);
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

    // Hitung ringkasan statistik
    let totalMember = 0;
    let totalPiutang = 0;
    let totalPoin = 0;

    items.forEach((it) => {
      if (it.tipe === 'member') totalMember++;
      totalPiutang += (Number(it.piutang_berjalan) || 0);
      totalPoin += (Number(it.poin) || 0);
    });

    const elTotal = $('#stat-pel-total', container);
    const elMember = $('#stat-pel-member', container);
    const elPiutang = $('#stat-pel-piutang', container);
    const elPoin = $('#stat-pel-poin', container);

    if (elTotal) elTotal.textContent = `${items.length} Kontak`;
    if (elMember) elMember.textContent = `${totalMember} Member`;
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
        <table class="table">
          <thead>
            <tr>
              <th>Kode & Nama</th>
              <th>Kontak & Alamat</th>
              <th>Tipe & Level</th>
              <th class="num">Limit Kredit</th>
              <th class="num">Sisa Piutang</th>
              <th class="num">Poin Member</th>
              <th>Status</th>
              <th style="text-align: right; min-width: 170px;">Aksi</th>
            </tr>
          </thead>
          <tbody>
            ${items.map((it) => {
              const isMember = it.tipe === 'member';
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

              return `
                <tr data-id="${escapeHtml(it.id)}">
                  <td data-label="Pelanggan">
                    <div class="row" style="align-items: center; gap: var(--sp-2);">
                      <div class="prd-table-avatar" style="width: 36px; height: 36px;">
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
                      <div class="row items-center" style="gap: 6px; justify-content: flex-end;">
                        <span class="text-xs font-mono fw-semibold">${escapeHtml(it.hp || '-')}</span>
                        ${it.hp ? `
                          <button type="button" class="btn btn-xs btn-wa-direct" data-hp="${escapeHtml(it.hp)}" data-nama="${escapeHtml(it.nama)}" title="Chat WhatsApp" style="padding: 1px 6px; font-size: 10px; border-radius: var(--radius-full); background: rgba(34, 197, 94, 0.15); color: #22c55e; border: 1px solid rgba(34, 197, 94, 0.3);">
                            WA
                          </button>
                        ` : ''}
                      </div>
                      ${it.alamat ? `
                        <div class="text-xs text-muted" style="max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
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
                  <td class="num" data-label="Sisa Piutang">
                    <span class="fw-bold ${piutangAktif > 0 ? 'text-danger' : 'text-success'}">${formatRupiah(piutangAktif)}</span>
                  </td>
                  <td class="num font-mono" data-label="Poin Member">
                    ${isMember ? `<span class="fw-bold text-warning">${(it.poin || 0).toLocaleString('id-ID')}</span>` : '<span class="text-muted">-</span>'}
                  </td>
                  <td data-label="Status">${statusBadge}</td>
                  <td style="text-align: right;" data-label="Aksi">
                    <div class="pel-actions-row">
                      <button type="button" class="btn btn-secondary btn-sm btn-detail-pel" data-id="${escapeHtml(it.id)}" title="Rincian & Riwayat Belanja/Poin">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M2 12s3-7 10-7 10 7 10 7-3 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>
                        <span>Rincian</span>
                      </button>
                      <button type="button" class="btn btn-secondary btn-sm btn-edit-pel" data-id="${escapeHtml(it.id)}" title="Edit Pelanggan">
                        <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/></svg>
                        <span>Ubah</span>
                      </button>
                      ${isOwnerOrAdmin ? `
                        <button type="button" class="btn btn-outline-danger btn-sm btn-hapus-pel" data-id="${escapeHtml(it.id)}" data-nama="${escapeHtml(it.nama)}" title="Hapus Pelanggan">
                          <svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2"><path d="M3 6h18M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
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

    // Pasang Event Listeners
    area.querySelectorAll('.btn-detail-pel').forEach((btn) => {
      btn.addEventListener('click', () => {
        bukaModalDetailPelanggan(btn.getAttribute('data-id'));
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
        const id = btn.getAttribute('data-id');
        const nama = btn.getAttribute('data-nama');
        const setuju = await showConfirm(
          `Hapus Pelanggan "${nama}"?`,
          'Data pelanggan akan dinonaktifkan. Penghapusan akan ditolak otomatis jika pelanggan masih memiliki saldo piutang aktif.'
        );
        if (setuju) {
          try {
            const resH = await apiCall('pelanggan.delete', { id });
            showToast(resH.pesan || 'Pelanggan berhasil dihapus', 'success');
            await muatDataPelanggan(container);
          } catch (err) {
            showToast(err.message || 'Gagal menghapus pelanggan', 'error');
          }
        }
      });
    });

    area.querySelectorAll('.btn-wa-direct').forEach((btn) => {
      btn.addEventListener('click', () => {
        const hp = btn.getAttribute('data-hp');
        const nama = btn.getAttribute('data-nama');
        bukaChatWhatsApp(hp, nama);
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
            ${!isEdit ? '<button type="button" class="btn btn-ghost btn-xs text-primary" id="btn-auto-kode-pel" title="Generate kode otomatis" style="padding: 1px 6px; font-size: 11px;">🎲 Auto</button>' : ''}
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
      <div id="section-member-options" class="card card-body stack" style="background: var(--surface-2); padding: var(--sp-3); gap: var(--sp-3); border-radius: var(--radius-lg); border: 1px solid var(--border);">
        <div class="row items-center justify-between">
          <span class="fw-bold text-xs uppercase" style="letter-spacing: 0.05em; color: var(--primary);">PENGATURAN LOYALITAS & KREDIT TEMPO</span>
          <span class="badge badge-primary text-2xs">B2B / Rekanan</span>
        </div>
        
        <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: var(--sp-2);">
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

async function bukaModalDetailPelanggan(pelangganId) {
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

    const isMember = pel.tipe === 'member';

    modalBody.innerHTML = `
      <div class="card card-body" style="background: var(--surface-2); margin-bottom: var(--sp-2);">
        <div class="row" style="justify-content: space-between; align-items: flex-start;">
          <div>
            <div class="fw-bold" style="font-size: var(--fs-lg);">${escapeHtml(pel.nama)}</div>
            <div class="text-xs font-mono text-muted">Kode: ${escapeHtml(pel.kode || '-')}</div>
            <div class="text-xs">${escapeHtml(pel.hp || '-')} | ${escapeHtml(pel.alamat || 'Alamat belum diatur')}</div>
          </div>
          <div style="text-align: right;">
            <span class="badge ${isMember ? 'badge-primary' : 'badge-info'}">${escapeHtml(pel.tipe.toUpperCase())} ${isMember ? `(${pel.level || 'Reguler'})` : ''}</span>
            <div class="fw-bold text-warning" style="font-size: var(--fs-lg); margin-top: 4px;">
              ${(pel.poin || 0).toLocaleString('id-ID')} <small style="font-size: var(--fs-2xs);">POIN</small>
            </div>
            <div class="text-xs text-muted">Belanja Lunas: ${formatRupiah(pel.total_belanja || 0)}</div>
          </div>
        </div>
      </div>

      ${isMember ? `
        <div class="stat-grid-3" style="margin-bottom: var(--sp-2);">
          <div class="card card-body stat-card" style="padding: var(--sp-2);">
            <span class="text-xs text-muted">LIMIT KREDIT</span>
            <div class="fw-bold">${formatRupiah(pel.limit_kredit || 0)}</div>
          </div>
          <div class="card card-body stat-card" style="padding: var(--sp-2);">
            <span class="text-xs text-muted">PIUTANG BERJALAN</span>
            <div class="fw-bold ${res.piutang_berjalan > 0 ? 'text-danger' : 'text-success'}">${formatRupiah(res.piutang_berjalan || 0)}</div>
          </div>
          <div class="card card-body stat-card" style="padding: var(--sp-2);">
            <span class="text-xs text-muted">SISA LIMIT</span>
            <div class="fw-bold text-primary">${formatRupiah(res.sisa_limit || 0)}</div>
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
            <table class="table">
              <thead>
                <tr>
                  <th>No Nota & Tgl</th>
                  <th class="num">Total Belanja</th>
                  <th>Metode</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                ${riwayatJual.map((pj) => `
                  <tr>
                    <td data-label="No Nota & Tgl">
                      <div class="fw-semibold font-mono text-xs">${escapeHtml(pj.no_nota)}</div>
                      <div class="text-xs text-muted">${formatTanggal(pj.created_at, true)}</div>
                    </td>
                    <td class="num fw-bold" data-label="Total Belanja">${formatRupiah(pj.total)}</td>
                    <td data-label="Metode"><span class="badge badge-info">${escapeHtml(pj.metode_bayar)}</span></td>
                    <td data-label="Status"><span class="badge ${pj.status_bayar === 'lunas' ? 'badge-success' : 'badge-warning'}">${escapeHtml(pj.status_bayar)}</span></td>
                  </tr>
                `).join('')}
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
              <table class="table">
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
                      <td class="text-xs" data-label="Waktu">${formatTanggal(pl.created_at, true)}</td>
                      <td data-label="Jenis"><span class="badge ${pl.jumlah > 0 ? 'badge-success' : 'badge-warning'}">${escapeHtml(pl.jenis)}</span></td>
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

      <div class="modal-footer" style="padding: var(--sp-3) 0 0 0; justify-content: flex-end;">
        <button type="button" class="btn btn-secondary" id="btn-tutup-detail-pel">Tutup</button>
      </div>
    `;

    $('#btn-tutup-detail-pel', modalBody)?.addEventListener('click', () => modalInstance.close());

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

  const pesan = `Halo Bpk/Ibu *${nama || ''}*, salam dari Toko Bangunan. Ada yang dapat kami bantu seputar kebutuhan material bangunan proyek Anda?`;
  const url = `https://wa.me/${cleanHp}?text=${encodeURIComponent(pesan)}`;
  window.open(url, '_blank');
}

