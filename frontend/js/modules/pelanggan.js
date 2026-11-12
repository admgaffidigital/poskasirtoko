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

      <!-- Stat Cards Pelanggan -->
      <div class="grid grid-4" style="gap: var(--sp-3);" id="stat-cards-pelanggan">
        <div class="card card-body stat-card">
          <span class="text-xs text-muted fw-semibold">TOTAL PELANGGAN</span>
          <div class="stat-value" id="stat-pel-total">0</div>
          <span class="text-xs text-muted" id="stat-pel-sub">-</span>
        </div>
        <div class="card card-body stat-card">
          <span class="text-xs text-muted fw-semibold">MEMBER LOYALITAS</span>
          <div class="stat-value text-primary" id="stat-pel-member">0 Member</div>
          <span class="text-xs text-muted">Pelanggan terdaftar</span>
        </div>
        <div class="card card-body stat-card">
          <span class="text-xs text-muted fw-semibold">TOTAL PIUTANG AKTIF</span>
          <div class="stat-value text-danger" id="stat-pel-piutang">Rp 0</div>
          <span class="text-xs text-muted">Tagihan belanja tempo</span>
        </div>
        <div class="card card-body stat-card">
          <span class="text-xs text-muted fw-semibold">TOTAL POIN BEREDAR</span>
          <div class="stat-value text-warning" id="stat-pel-poin">0 Poin</div>
          <span class="text-xs text-muted">Dapat ditukar hadiah</span>
        </div>
      </div>

      <div class="card card-body stack">
        <!-- Filter Bar Pelanggan -->
        <div class="row" style="gap: var(--sp-2); align-items: flex-end; flex-wrap: wrap;">
          <div class="field" style="width: 140px;">
            <label class="field-label" for="filter-pel-tipe">Tipe Mitra</label>
            <select class="input" id="filter-pel-tipe">
              <option value="">Semua Tipe</option>
              <option value="member">Member</option>
              <option value="umum">Umum</option>
            </select>
          </div>

          <div class="field" style="width: 150px;">
            <label class="field-label" for="filter-pel-level">Level Member</label>
            <select class="input" id="filter-pel-level">
              <option value="">Semua Level</option>
              <option value="Reguler">Reguler</option>
              <option value="Silver">Silver</option>
              <option value="Gold">Gold</option>
              <option value="Platinum">Platinum</option>
            </select>
          </div>

          <div class="field grow">
            <label class="field-label" for="search-pel">Cari Pelanggan</label>
            <div class="input-group">
              <span class="input-icon">${ICONS.search}</span>
              <input type="search" class="input" id="search-pel" placeholder="Cari nama, kode member, no HP, atau alamat...">
            </div>
          </div>

          <button type="button" class="btn btn-secondary btn-icon" id="btn-refresh-pel" title="Muat Ulang" style="margin-bottom: 2px;">
            ${ICONS.refresh}
          </button>
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
              <th style="text-align: right;">Aksi</th>
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
                    <div class="fw-semibold">${escapeHtml(it.nama)}</div>
                    <span class="text-xs font-mono text-muted">${escapeHtml(it.kode || '-')}</span>
                  </td>
                  <td data-label="Kontak & Alamat">
                    <div class="row" style="gap: var(--sp-1); align-items: center;">
                      <span class="text-xs">${escapeHtml(it.hp || '-')}</span>
                      ${it.hp ? `
                        <button type="button" class="btn btn-xs btn-ghost btn-wa-direct" data-hp="${escapeHtml(it.hp)}" data-nama="${escapeHtml(it.nama)}" title="Chat WhatsApp">
                          WA
                        </button>
                      ` : ''}
                    </div>
                    <div class="text-xs text-muted" style="max-width: 220px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
                      ${escapeHtml(it.alamat || '-')}
                    </div>
                  </td>
                  <td data-label="Tipe & Level">${badgeTipe}</td>
                  <td class="num font-mono" data-label="Limit Kredit">
                    ${isMember ? formatRupiah(it.limit_kredit || 0) : '<span class="text-muted">-</span>'}
                    ${isMember && it.tempo_hari ? `<div class="text-xs text-muted">${it.tempo_hari} hari</div>` : ''}
                  </td>
                  <td class="num" data-label="Sisa Piutang">
                    <span class="fw-bold ${piutangAktif > 0 ? 'text-danger' : 'text-success'}">${formatRupiah(piutangAktif)}</span>
                  </td>
                  <td class="num font-mono" data-label="Poin Member">
                    ${isMember ? `<span class="fw-bold text-warning">${(it.poin || 0).toLocaleString('id-ID')}</span>` : '<span class="text-muted">-</span>'}
                  </td>
                  <td data-label="Status">${statusBadge}</td>
                  <td style="text-align: right;" data-label="Aksi">
                    <div class="row" style="gap: var(--sp-1); justify-content: flex-end; width: 100%;">
                      <button type="button" class="btn btn-sm btn-ghost btn-detail-pel" data-id="${escapeHtml(it.id)}" title="Rincian & Riwayat Belanja/Poin">
                        Rincian
                      </button>
                      <button type="button" class="btn btn-sm btn-secondary btn-edit-pel" data-id="${escapeHtml(it.id)}" title="Edit Pelanggan">
                        Edit
                      </button>
                      ${isOwnerOrAdmin ? `
                        <button type="button" class="btn btn-sm btn-danger btn-icon btn-hapus-pel" data-id="${escapeHtml(it.id)}" data-nama="${escapeHtml(it.nama)}" title="Hapus Pelanggan">
                          ${ICONS.x}
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

  const modalBody = document.createElement('div');
  modalBody.className = 'stack';

  const defaultTipe = pelanggan ? pelanggan.tipe : 'member';
  const defaultLevel = pelanggan ? (pelanggan.level || 'Reguler') : 'Reguler';

  modalBody.innerHTML = `
    <form id="form-pelanggan" class="stack">
      <div class="row" style="gap: var(--sp-2);">
        <div class="field grow">
          <label class="field-label" for="pel-nama">Nama Lengkap Pelanggan / Toko *</label>
          <input type="text" class="input" id="pel-nama" value="${escapeHtml(pelanggan ? pelanggan.nama : '')}" placeholder="Contoh: Pak Haji Agus / Mandiri Perkasa" required>
        </div>

        <div class="field" style="width: 140px;">
          <label class="field-label" for="pel-tipe">Tipe Mitra *</label>
          <select class="input" id="pel-tipe" ${isEdit && !isOwnerOrAdmin ? 'disabled' : ''}>
            <option value="member" ${defaultTipe === 'member' ? 'selected' : ''}>Member</option>
            <option value="umum" ${defaultTipe === 'umum' ? 'selected' : ''}>Umum</option>
          </select>
        </div>
      </div>

      <div class="row" style="gap: var(--sp-2);">
        <div class="field grow">
          <label class="field-label" for="pel-hp">Nomor HP / WhatsApp *</label>
          <input type="tel" class="input" id="pel-hp" value="${escapeHtml(pelanggan ? pelanggan.hp : '')}" placeholder="Contoh: 081234567890">
          <span class="text-xs text-muted" id="ket-hp">Wajib diisi untuk pendaftaran member loyalitas</span>
        </div>

        <div class="field" style="width: 160px;">
          <label class="field-label" for="pel-kode">Kode Member</label>
          <input type="text" class="input font-mono uppercase" id="pel-kode" value="${escapeHtml(pelanggan ? pelanggan.kode : '')}" placeholder="Auto (MBR-...)" ${!isOwnerOrAdmin && isEdit ? 'disabled' : ''}>
        </div>
      </div>

      <div class="field">
        <label class="field-label" for="pel-alamat">Alamat Lengkap / Lokasi Proyek</label>
        <textarea class="input" id="pel-alamat" rows="2" placeholder="Alamat pengiriman material bangunan...">${escapeHtml(pelanggan ? pelanggan.alamat : '')}</textarea>
      </div>

      <!-- Khusus Pengaturan Member -->
      <div id="section-member-options" class="card card-body stack" style="background: var(--surface-2); padding: var(--sp-3); gap: var(--sp-2);">
        <span class="fw-semibold text-xs text-muted uppercase">PENGATURAN LOYALITAS & KREDIT TEMPO</span>
        
        <div class="row" style="gap: var(--sp-2);">
          <div class="field" style="width: 160px;">
            <label class="field-label" for="pel-level">Level Member</label>
            <select class="input" id="pel-level" ${!isOwnerOrAdmin ? 'disabled' : ''}>
              <option value="Reguler" ${defaultLevel === 'Reguler' ? 'selected' : ''}>Reguler (1x Poin)</option>
              <option value="Silver" ${defaultLevel === 'Silver' ? 'selected' : ''}>Silver (1.2x Poin)</option>
              <option value="Gold" ${defaultLevel === 'Gold' ? 'selected' : ''}>Gold (1.5x Poin)</option>
              <option value="Platinum" ${defaultLevel === 'Platinum' ? 'selected' : ''}>Platinum (2x Poin)</option>
            </select>
          </div>

          <div class="field grow">
            <label class="field-label" for="pel-limit">Limit Kredit Tempo (Rp)</label>
            <input type="text" class="input font-mono fw-bold" id="pel-limit" value="${formatRupiah(pelanggan ? pelanggan.limit_kredit : 0, false)}" ${!isOwnerOrAdmin ? 'disabled' : ''}>
            <span class="text-xs text-muted">Batas maksimal belanja tempo</span>
          </div>

          <div class="field" style="width: 130px;">
            <label class="field-label" for="pel-tempo">Jatuh Tempo</label>
            <div class="input-group">
              <input type="number" class="input" id="pel-tempo" value="${pelanggan ? (pelanggan.tempo_hari || 30) : 30}" min="1" max="180" ${!isOwnerOrAdmin ? 'disabled' : ''}>
              <span class="text-xs" style="padding: 0 6px;">Hari</span>
            </div>
          </div>
        </div>
      </div>

      <div class="field" style="margin-top: var(--sp-1);">
        <label style="display: flex; align-items: center; gap: 8px; font-size: var(--fs-sm); cursor: pointer;">
          <input type="checkbox" id="pel-aktif" ${pelanggan && pelanggan.aktif === false ? '' : 'checked'}>
          <span class="fw-semibold">Pelanggan Aktif</span>
        </label>
      </div>

      <div class="modal-footer" style="padding: var(--sp-3) 0 0 0; justify-content: flex-end;">
        <button type="button" class="btn btn-secondary" id="btn-batal-form-pel">Batal</button>
        <button type="submit" class="btn btn-primary" id="btn-simpan-form-pel">
          ${ICONS.check}
          <span>${isEdit ? 'Simpan Perubahan' : 'Tambah Pelanggan'}</span>
        </button>
      </div>
    </form>
  `;

  const inputTipe = $('#pel-tipe', modalBody);
  const sectionMember = $('#section-member-options', modalBody);
  const inputHp = $('#pel-hp', modalBody);
  const inputLimit = $('#pel-limit', modalBody);

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

  inputLimit?.addEventListener('input', () => {
    const n = parseRupiah(inputLimit.value);
    inputLimit.value = formatRupiah(n, false);
  });

  const modalInstance = showModal({
    title: isEdit ? 'Edit Data Pelanggan / Member' : 'Tambah Pelanggan / Member Baru',
    body: modalBody,
    width: '540px'
  });

  $('#btn-batal-form-pel', modalBody)?.addEventListener('click', () => modalInstance.close());

  $('#form-pelanggan', modalBody)?.addEventListener('submit', async (e) => {
    e.preventDefault();

    const nama = $('#pel-nama', modalBody)?.value.trim();
    const tipe = inputTipe?.value;
    const hp = inputHp?.value.trim();
    const alamat = $('#pel-alamat', modalBody)?.value.trim();
    const kode = $('#pel-kode', modalBody)?.value.trim();
    const level = $('#pel-level', modalBody)?.value;
    const limit_kredit = parseRupiah(inputLimit ? inputLimit.value : 0);
    const tempo_hari = parseInt($('#pel-tempo', modalBody)?.value || 30, 10);
    const aktif = $('#pel-aktif', modalBody)?.checked;

    if (!nama) {
      showToast('Nama pelanggan wajib diisi', 'warning');
      return;
    }
    if (tipe === 'member' && !hp) {
      showToast('Nomor HP wajib diisi untuk pendaftaran Member', 'warning');
      return;
    }

    const btnSimpan = $('#btn-simpan-form-pel', modalBody);
    if (btnSimpan) {
      btnSimpan.disabled = true;
      btnSimpan.innerHTML = '<span class="spinner spinner-sm"></span> Menyimpan...';
    }

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
      showToast(err.message || 'Gagal menyimpan data pelanggan', 'error');
      if (btnSimpan) {
        btnSimpan.disabled = false;
        btnSimpan.innerHTML = `${ICONS.check} <span>${isEdit ? 'Simpan Perubahan' : 'Tambah Pelanggan'}</span>`;
      }
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
    width: '640px'
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
              ${(pel.poin || 0).toLocaleString('id-ID')} <small style="font-size: 11px;">POIN</small>
            </div>
            <div class="text-xs text-muted">Belanja Lunas: ${formatRupiah(pel.total_belanja || 0)}</div>
          </div>
        </div>
      </div>

      ${isMember ? `
        <div class="grid grid-3" style="gap: var(--sp-2); margin-bottom: var(--sp-2);">
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

