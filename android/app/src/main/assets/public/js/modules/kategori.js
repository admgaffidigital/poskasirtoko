/**
 * kategori.js — Modul CRUD Kategori & Sub Kategori Produk (Owner & Admin)
 * Dilengkapi pencarian cerdas real-time, filter hirarki, dan fitur lipat/buka sub-kategori.
 */

import { apiCall } from '../api.js';
import { store } from '../state.js';
import { ICONS, showToast, showModal, showConfirm } from '../utils/ui.js';
import { $, renderSkeleton, renderEmpty } from '../utils/dom.js';
import { escapeHtml } from '../utils/format.js';

let kategoriCache = [];
const stateKategori = {
  cari: '',
  filterTipe: 'semua', // 'semua' | 'induk' | 'sub'
  collapsedParents: new Set()
};

function highlightText(text, keyword) {
  if (!keyword || !text) return escapeHtml(text || '');
  const str = String(text);
  const lower = str.toLowerCase();
  const kw = keyword.toLowerCase();
  const idx = lower.indexOf(kw);
  if (idx === -1) return escapeHtml(str);

  const before = escapeHtml(str.slice(0, idx));
  const matched = escapeHtml(str.slice(idx, idx + kw.length));
  const after = highlightText(str.slice(idx + kw.length), keyword);
  return `${before}<mark class="highlight-text">${matched}</mark>${after}`;
}

export async function renderKategoriModule(container) {
  const user = store.get('user');
  const canEdit = user && (user.role === 'owner' || user.role === 'admin');

  container.innerHTML = `
    <div class="stack" style="gap: var(--sp-3);">
      <!-- Header Modul -->
      <div class="page-header">
        <div>
          <h2>Kategori Produk</h2>
          <p class="d-none-mobile">Pengelompokan barang dan bahan bangunan untuk mempermudah pencarian kasir</p>
        </div>
        <div class="row" style="gap: var(--sp-2);">
          <button type="button" class="btn btn-secondary btn-icon" id="btn-refresh-kategori" title="Muat Ulang Kategori" aria-label="Muat Ulang Kategori">
            ${ICONS.refresh}
          </button>
          ${canEdit ? `
            <button type="button" class="btn btn-primary grow" id="btn-tambah-kategori">
              ${ICONS.plus || ''}
              <span>Tambah Kategori</span>
            </button>
          ` : ''}
        </div>
      </div>

      <!-- Info Panduan Sub Kategori -->
      <div class="card card-body" style="background: linear-gradient(135deg, rgba(234, 88, 12, 0.06) 0%, rgba(249, 115, 22, 0.02) 100%); border-left: 4px solid var(--primary); padding: var(--sp-3) var(--sp-4);">
        <div class="row" style="align-items: flex-start; gap: var(--sp-3);">
          <div style="color: var(--primary); font-size: 1.25rem; line-height: 1; margin-top: 2px;">
            ${ICONS.info}
          </div>
          <div class="grow" style="font-size: var(--fs-sm);">
            <strong style="color: var(--text-heading); display: block; margin-bottom: 3px;">Panduan Struktur Kategori & Sub Kategori:</strong>
            <div style="color: var(--text-muted); line-height: 1.6;">
              • <strong>Kategori Utama</strong> (Cth: <em>PIPA PVC</em>, <em>CAT & PELAPIS</em>, <em>SEMEN</em>) berfungsi sebagai kelompok induk.<br>
              • <strong>Sub Kategori</strong> (Cth: <em>Pipa AW</em>, <em>Pipa D</em>, <em>Fitting</em> di bawah <em>PIPA PVC</em>) dibuat dengan klik tombol <strong>+ Sub</strong> pada baris kategori induknya.<br>
              • Di kasir dan katalog, saat kasir memilih kategori utama, seluruh barang di dalam sub-kategori juga otomatis ditampilkan.
            </div>
          </div>
        </div>
      </div>

      <!-- Bar Filter & Pencarian Cerdas Kategori -->
      <div class="card card-body stack" style="gap: var(--sp-3); padding: var(--sp-3) var(--sp-4);">
        <!-- Baris 1: Filter Segmented Tipe & Aksi Lipat/Buka Global -->
        <div class="row" style="justify-content: space-between; align-items: center; flex-wrap: wrap; gap: var(--sp-2);">
          <div class="segmented" id="seg-filter-kat" role="group">
            <button type="button" class="btn btn-xs ${stateKategori.filterTipe === 'semua' ? 'active' : ''}" data-tipe="semua">
              Semua <span class="badge badge-xs" id="badge-count-semua" style="margin-left: 4px;">0</span>
            </button>
            <button type="button" class="btn btn-xs ${stateKategori.filterTipe === 'induk' ? 'active' : ''}" data-tipe="induk">
              Kategori Utama <span class="badge badge-xs" id="badge-count-induk" style="margin-left: 4px;">0</span>
            </button>
            <button type="button" class="btn btn-xs ${stateKategori.filterTipe === 'sub' ? 'active' : ''}" data-tipe="sub">
              Sub Kategori <span class="badge badge-xs" id="badge-count-sub" style="margin-left: 4px;">0</span>
            </button>
          </div>

          <div class="row" style="gap: 6px; align-items: center;">
            <button type="button" class="btn btn-ghost btn-xs text-muted" id="btn-expand-all" title="Buka Semua Sub Kategori">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 15 5 5 5-5"/><path d="m7 9 5-5 5 5"/></svg>
              <span>Buka Semua</span>
            </button>
            <button type="button" class="btn btn-ghost btn-xs text-muted" id="btn-collapse-all" title="Lipat Semua Sub Kategori">
              <svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m7 11 5-5 5 5"/><path d="m7 13 5 5 5-5"/></svg>
              <span>Lipat Semua</span>
            </button>
          </div>
        </div>

        <!-- Baris 2: Input Pencarian Instan & Counter Hasil -->
        <div class="row" style="gap: var(--sp-2); align-items: center; flex-wrap: wrap;">
          <div class="input-group grow" style="min-width: 240px; position: relative;">
            <span class="input-icon">${ICONS.search}</span>
            <input type="search" id="search-kategori" class="input input-sm w-full" placeholder="Cari nama kategori atau sub-kategori..." value="${escapeHtml(stateKategori.cari)}" autocomplete="off" />
            <button type="button" class="btn btn-ghost btn-xs text-muted" id="btn-clear-search" title="Hapus Pencarian" style="position: absolute; right: 6px; top: 50%; transform: translateY(-50%); height: 24px; width: 24px; padding: 0; display: ${stateKategori.cari ? 'inline-flex' : 'none'}; justify-content: center; align-items: center;">
              ${ICONS.x}
            </button>
          </div>
          <div class="badge badge-secondary" id="badge-hasil-cari" style="font-size: var(--fs-xs); font-family: var(--font-mono); white-space: nowrap; padding: 5px 12px; display: inline-flex; align-items: center; gap: 4px;">
            <span id="text-count-hasil">Memuat...</span>
          </div>
        </div>
      </div>

      <!-- Area Tabel & Kartu Daftar Kategori -->
      <div class="card card-body kat-container-card" id="area-kategori" style="padding: 0; overflow: hidden;">
        <div style="padding: var(--sp-4);">
          ${renderSkeleton(3)}
        </div>
      </div>
    </div>
  `;

  // Bind Event Filter Segmented
  const segFilter = container.querySelector('#seg-filter-kat');
  segFilter?.addEventListener('click', (e) => {
    const btn = e.target.closest('button[data-tipe]');
    if (!btn) return;
    segFilter.querySelectorAll('button').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    stateKategori.filterTipe = btn.getAttribute('data-tipe');
    renderTabelKategori(container, canEdit);
  });

  // Bind Event Pencarian Instan
  const inputSearch = container.querySelector('#search-kategori');
  const btnClearSearch = container.querySelector('#btn-clear-search');

  inputSearch?.addEventListener('input', () => {
    stateKategori.cari = inputSearch.value.trim();
    if (btnClearSearch) {
      btnClearSearch.style.display = stateKategori.cari ? 'inline-flex' : 'none';
    }
    renderTabelKategori(container, canEdit);
  });

  btnClearSearch?.addEventListener('click', () => {
    stateKategori.cari = '';
    if (inputSearch) {
      inputSearch.value = '';
      inputSearch.focus();
    }
    btnClearSearch.style.display = 'none';
    renderTabelKategori(container, canEdit);
  });

  // Bind Global Collapse/Expand
  container.querySelector('#btn-expand-all')?.addEventListener('click', () => {
    stateKategori.collapsedParents.clear();
    renderTabelKategori(container, canEdit);
    showToast('Seluruh sub-kategori dibuka.', 'info', 1500);
  });

  container.querySelector('#btn-collapse-all')?.addEventListener('click', () => {
    const parents = kategoriCache.filter(k => !k.parent_id);
    parents.forEach(p => stateKategori.collapsedParents.add(p.id));
    renderTabelKategori(container, canEdit);
    showToast('Seluruh sub-kategori dilipat ringkas.', 'info', 1500);
  });

  // Bind Tombol Refresh & Tambah
  container.querySelector('#btn-refresh-kategori')?.addEventListener('click', async () => {
    const area = container.querySelector('#area-kategori');
    if (area) {
      area.innerHTML = `<div style="padding: var(--sp-4);">${renderSkeleton(3)}</div>`;
    }
    await muatKategori(container, canEdit);
    showToast('Data kategori berhasil diperbarui', 'success', 1800);
  });

  if (canEdit) {
    container.querySelector('#btn-tambah-kategori')?.addEventListener('click', () => {
      bukaModalFormKategori(container, null, kategoriCache);
    });
  }

  await muatKategori(container, canEdit);
}

async function muatKategori(container, canEdit) {
  const area = container.querySelector('#area-kategori');
  if (!area) return;

  try {
    const res = await apiCall('kategori.list', {});
    const items = res.items || [];
    kategoriCache = items;

    // Perbarui counter global
    const totalSemua = items.length;
    const totalInduk = items.filter(k => !k.parent_id).length;
    const totalSub = items.filter(k => k.parent_id).length;

    const elCountSemua = container.querySelector('#badge-count-semua');
    const elCountInduk = container.querySelector('#badge-count-induk');
    const elCountSub = container.querySelector('#badge-count-sub');

    if (elCountSemua) elCountSemua.textContent = totalSemua;
    if (elCountInduk) elCountInduk.textContent = totalInduk;
    if (elCountSub) elCountSub.textContent = totalSub;

    renderTabelKategori(container, canEdit);
  } catch (err) {
    console.error('Gagal memuat kategori:', err);
    if (area) {
      area.innerHTML = `
        <div style="padding: var(--sp-4);">
          ${renderEmpty({
            title: 'Gagal Memuat Kategori',
            text: err.message || 'Terjadi kesalahan saat menghubungi server.',
            icon: ICONS.alertTriangle,
            actionButton: `<button type="button" class="btn btn-secondary btn-sm" id="btn-retry-kat">${ICONS.refresh} Coba Lagi</button>`
          })}
        </div>
      `;
      area.querySelector('#btn-retry-kat')?.addEventListener('click', () => muatKategori(container, canEdit));
    }
  }
}

function renderTabelKategori(container, canEdit) {
  const area = container.querySelector('#area-kategori');
  const elTextHasil = container.querySelector('#text-count-hasil');
  if (!area) return;

  const items = kategoriCache || [];
  if (!items.length) {
    if (elTextHasil) elTextHasil.textContent = '0 kategori';
    area.innerHTML = `
      <div style="padding: var(--sp-4);">
        ${renderEmpty({
          title: 'Kategori Belum Ada',
          text: 'Mulai dengan menambahkan kategori utama seperti "Bahan Bangunan", "Cat & Pelapis", dsb.',
          icon: ICONS.tag,
          actionButton: canEdit ? `<button type="button" class="btn btn-primary btn-sm btn-tambah-pertama">${ICONS.plus || ''} <span>Tambah Kategori</span></button>` : ''
        })}
      </div>
    `;
    area.querySelector('.btn-tambah-pertama')?.addEventListener('click', () => {
      bukaModalFormKategori(container, null, kategoriCache);
    });
    return;
  }

  const keyword = (stateKategori.cari || '').toLowerCase().trim();
  const filterTipe = stateKategori.filterTipe;

  // Peta nama kategori
  const petaKategori = {};
  items.forEach((k) => { petaKategori[k.id] = k.nama; });

  // Kelompokkan Kategori Utama & Sub Kategori
  const allParents = items.filter((k) => !k.parent_id);
  allParents.sort((a, b) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0) || String(a.nama).localeCompare(String(b.nama)));

  const subsByParent = {};
  items.forEach((k) => {
    if (k.parent_id) {
      if (!subsByParent[k.parent_id]) subsByParent[k.parent_id] = [];
      subsByParent[k.parent_id].push(k);
    }
  });

  Object.keys(subsByParent).forEach((pid) => {
    subsByParent[pid].sort((a, b) => (Number(a.urutan) || 0) - (Number(b.urutan) || 0) || String(a.nama).localeCompare(String(b.nama)));
  });

  // Filter Parents & Subs
  const filteredParents = [];
  let totalDitampilkan = 0;

  allParents.forEach((p) => {
    const allSubs = subsByParent[p.id] || [];
    const parentMatches = !keyword || String(p.nama).toLowerCase().includes(keyword);

    let matchingSubs = allSubs;
    if (keyword) {
      if (parentMatches) {
        // Jika induk cocok dengan kata kunci, tampilkan semua anak sub-nya
        matchingSubs = allSubs;
      } else {
        // Jika induk tidak cocok, cari sub-kategori yang cocok
        matchingSubs = allSubs.filter(c => String(c.nama).toLowerCase().includes(keyword));
      }
    }

    // Terapkan filter tipe
    if (filterTipe === 'induk') {
      if (parentMatches) {
        filteredParents.push({ parent: p, subs: [], isParentMatch: true, hasMatchingSub: false });
        totalDitampilkan++;
      }
    } else if (filterTipe === 'sub') {
      if (matchingSubs.length > 0) {
        filteredParents.push({ parent: p, subs: matchingSubs, isParentMatch: parentMatches, hasMatchingSub: true });
        totalDitampilkan += matchingSubs.length;
      }
    } else {
      // 'semua'
      if (parentMatches || matchingSubs.length > 0) {
        filteredParents.push({ parent: p, subs: matchingSubs, isParentMatch: parentMatches, hasMatchingSub: matchingSubs.length > 0 });
        totalDitampilkan += 1 + matchingSubs.length;
      }
    }
  });

  // Orphan sub categories (jika induknya sudah terhapus)
  const allOrphans = items.filter((k) => k.parent_id && !petaKategori[k.parent_id]);
  const filteredOrphans = filterTipe !== 'induk'
    ? allOrphans.filter(o => !keyword || String(o.nama).toLowerCase().includes(keyword))
    : [];

  totalDitampilkan += filteredOrphans.length;

  // Perbarui Badge Hasil
  if (elTextHasil) {
    if (keyword || filterTipe !== 'semua') {
      elTextHasil.textContent = `${totalDitampilkan} dari ${items.length} kategori`;
    } else {
      elTextHasil.textContent = `${totalDitampilkan} kategori`;
    }
  }

  // Jika tidak ada hasil pencarian
  if (totalDitampilkan === 0) {
    area.innerHTML = `
      <div style="padding: var(--sp-6);">
        ${renderEmpty({
          title: 'Kategori Tidak Ditemukan',
          text: keyword
            ? `Tidak ada kategori atau sub-kategori yang cocok dengan "${escapeHtml(stateKategori.cari)}".`
            : 'Tidak ada data pada filter yang dipilih.',
          icon: ICONS.search,
          actionButton: `<button type="button" class="btn btn-secondary btn-sm" id="btn-reset-pencarian">${ICONS.refresh} <span>Reset Pencarian</span></button>`
        })}
      </div>
    `;
    area.querySelector('#btn-reset-pencarian')?.addEventListener('click', () => {
      stateKategori.cari = '';
      stateKategori.filterTipe = 'semua';
      const input = container.querySelector('#search-kategori');
      if (input) input.value = '';
      const seg = container.querySelector('#seg-filter-kat');
      if (seg) {
        seg.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        seg.querySelector('button[data-tipe="semua"]')?.classList.add('active');
      }
      const btnClear = container.querySelector('#btn-clear-search');
      if (btnClear) btnClear.style.display = 'none';
      renderTabelKategori(container, canEdit);
    });
    return;
  }

  // Render Tabel
  let html = `
    <div class="table-wrap">
      <table class="table table-kategori">
        <thead>
          <tr>
            <th>Nama Kategori</th>
            <th>Tipe & Hirarki</th>
            <th style="width: 80px; text-align: right;">Urutan</th>
            ${canEdit ? '<th style="width: 250px; text-align: right;">Aksi</th>' : ''}
          </tr>
        </thead>
        <tbody>
  `;

  filteredParents.forEach(({ parent: p, subs, isParentMatch }) => {
    const totalSubsParent = (subsByParent[p.id] || []).length;
    const hasSubs = totalSubsParent > 0;
    // Jika sedang dalam mode pencarian dengan keyword dan ada sub yang cocok, jangan dilipat agar hasil langsung terlihat
    const isCollapsed = !keyword && stateKategori.collapsedParents.has(p.id);

    // Jika filterTipe bukan 'sub', tampilkan baris Kategori Utama
    if (filterTipe !== 'sub') {
      html += `
        <tr class="kat-row-parent" style="border-top: 1px solid var(--border);">
          <td data-label="Kategori">
            <div class="kat-title-row">
              ${hasSubs ? `
                <button type="button" class="btn-toggle-sub ${isCollapsed ? 'is-collapsed' : ''}" data-parent-id="${p.id}" title="${isCollapsed ? 'Buka Sub Kategori' : 'Lipat Sub Kategori'}" aria-label="Toggle Sub Kategori">
                  ${ICONS.chevronDown}
                </button>
              ` : `
                <div style="width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; flex-shrink: 0; color: var(--text-muted);">
                  <span style="width: 6px; height: 6px; border-radius: 50%; background: var(--border-strong);"></span>
                </div>
              `}
              <div class="prd-table-avatar" style="width: 34px; height: 34px; background: var(--primary-soft); color: var(--primary); flex-shrink: 0;">
                ${ICONS.folder || ICONS.tag}
              </div>
              <div class="grow">
                <div class="fw-bold text-md" style="color: var(--text-heading);">${highlightText(p.nama, keyword)}</div>
              </div>
            </div>
          </td>
          <td data-label="Tipe & Hirarki">
            <div class="kat-hirarki-parent">
              <span class="badge badge-primary">Kategori Utama</span>
              ${hasSubs
                ? `<span class="badge badge-info badge-toggle-sub" data-parent-id="${p.id}" title="Klik untuk ${isCollapsed ? 'membuka' : 'melipat'} ${totalSubsParent} sub-kategori">${totalSubsParent} Sub Kategori ${isCollapsed ? '▸' : '▾'}</span>`
                : `<span class="text-xs text-muted">(Belum ada sub)</span>`
              }
            </div>
          </td>
          <td class="num" data-label="Urutan">${p.urutan || 0}</td>
          ${canEdit ? `
            <td style="text-align: right;" data-label="Aksi">
              <div class="table-actions">
                <button type="button" class="btn btn-primary btn-sm btn-tambah-sub" data-parent-id="${p.id}" data-parent-nama="${escapeHtml(p.nama)}" title="Tambah Sub Kategori di bawah ${escapeHtml(p.nama)}">
                  ${ICONS.plus || ''}
                  <span>Sub</span>
                </button>
                <button type="button" class="btn btn-secondary btn-sm btn-edit-kat" data-id="${p.id}" title="Ubah">
                  ${ICONS.settings}
                  <span>Ubah</span>
                </button>
                <button type="button" class="btn btn-outline-danger btn-sm btn-hapus-kat" data-id="${p.id}" data-nama="${escapeHtml(p.nama)}" data-sub-count="${totalSubsParent}" title="Hapus">
                  ${ICONS.x}
                  <span>Hapus</span>
                </button>
              </div>
            </td>
          ` : ''}
        </tr>
      `;
    }

    // Render Sub Kategori di bawah Parent (jika tidak dilipat)
    if (!isCollapsed && filterTipe !== 'induk') {
      subs.forEach((c) => {
        html += `
          <tr class="kat-row-sub" style="background-color: var(--surface-2); border-left: 3px solid var(--primary-soft);">
            <td data-label="Kategori">
              <div class="kat-title-row kat-sub-indent">
                <span class="kat-sub-arrow">↳</span>
                <div class="prd-table-avatar" style="width: 28px; height: 28px; background: var(--surface-3); color: var(--text-muted); flex-shrink: 0;">
                  ${ICONS.tag}
                </div>
                <div class="grow">
                  <div class="fw-semibold text-sm" style="color: var(--text-body);">${highlightText(c.nama, keyword)}</div>
                </div>
              </div>
            </td>
            <td data-label="Tipe & Hirarki">
              <div class="kat-hirarki-val">
                <span class="badge badge-sm" style="background: var(--surface-3); border: 1px solid var(--border);">Sub Kategori</span>
                <div class="text-xs text-muted" style="line-height: 1.35;">Induk: <strong style="color: var(--text);">${escapeHtml(p.nama)}</strong></div>
              </div>
            </td>
            <td class="num" data-label="Urutan">${c.urutan || 0}</td>
            ${canEdit ? `
              <td style="text-align: right;" data-label="Aksi">
                <div class="table-actions">
                  <button type="button" class="btn btn-secondary btn-sm btn-edit-kat" data-id="${c.id}" title="Ubah">
                    ${ICONS.settings}
                    <span>Ubah</span>
                  </button>
                  <button type="button" class="btn btn-outline-danger btn-sm btn-hapus-kat" data-id="${c.id}" data-nama="${escapeHtml(c.nama)}" data-sub-count="0" title="Hapus">
                    ${ICONS.x}
                    <span>Hapus</span>
                  </button>
                </div>
              </td>
            ` : ''}
          </tr>
        `;
      });
    }
  });

  // Render orphan sub categories jika ada
  filteredOrphans.forEach((o) => {
    html += `
      <tr class="kat-row-orphan" style="background-color: var(--warning-soft); border-left: 3px solid var(--warning);">
        <td data-label="Kategori">
          <div class="kat-title-row kat-sub-indent">
            <div class="prd-table-avatar" style="width: 28px; height: 28px; flex-shrink: 0;">${ICONS.alertTriangle}</div>
            <div class="grow">
              <div class="fw-medium text-sm">${highlightText(o.nama, keyword)}</div>
            </div>
          </div>
        </td>
        <td data-label="Tipe & Hirarki">
          <span class="badge badge-warning">Induk Tidak Ditemukan</span>
        </td>
        <td class="num" data-label="Urutan">${o.urutan || 0}</td>
        ${canEdit ? `
          <td style="text-align: right;" data-label="Aksi">
            <div class="table-actions">
              <button type="button" class="btn btn-secondary btn-sm btn-edit-kat" data-id="${o.id}" title="Ubah">
                ${ICONS.settings}
                <span>Ubah</span>
              </button>
              <button type="button" class="btn btn-outline-danger btn-sm btn-hapus-kat" data-id="${o.id}" data-nama="${escapeHtml(o.nama)}" data-sub-count="0" title="Hapus">
                ${ICONS.x}
                <span>Hapus</span>
              </button>
            </div>
          </td>
        ` : ''}
      </tr>
    `;
  });

  html += `
        </tbody>
      </table>
    </div>
  `;

  area.innerHTML = html;

  // Pasang handler toggle collapse/expand per parent
  const handleToggleParent = (parentId) => {
    if (stateKategori.collapsedParents.has(parentId)) {
      stateKategori.collapsedParents.delete(parentId);
    } else {
      stateKategori.collapsedParents.add(parentId);
    }
    renderTabelKategori(container, canEdit);
  };

  area.querySelectorAll('.btn-toggle-sub').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      const pid = btn.getAttribute('data-parent-id');
      if (pid) handleToggleParent(pid);
    });
  });

  area.querySelectorAll('.badge-toggle-sub').forEach((badge) => {
    badge.addEventListener('click', (e) => {
      e.stopPropagation();
      const pid = badge.getAttribute('data-parent-id');
      if (pid) handleToggleParent(pid);
    });
  });

  // Pasang handler aksi CRUD
  if (canEdit) {
    // Tombol + Sub Kategori
    area.querySelectorAll('.btn-tambah-sub').forEach((btn) => {
      btn.addEventListener('click', () => {
        const parentId = btn.getAttribute('data-parent-id');
        bukaModalFormKategori(container, null, kategoriCache, parentId);
      });
    });

    // Tombol Ubah Kategori
    area.querySelectorAll('.btn-edit-kat').forEach((btn) => {
      btn.addEventListener('click', () => {
        const id = btn.getAttribute('data-id');
        const kat = items.find((x) => x.id === id);
        if (kat) bukaModalFormKategori(container, kat, kategoriCache);
      });
    });

    // Tombol Hapus Kategori
    area.querySelectorAll('.btn-hapus-kat').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const id = btn.getAttribute('data-id');
        const nama = btn.getAttribute('data-nama');
        const subCount = parseInt(btn.getAttribute('data-sub-count') || '0', 10);

        if (subCount > 0) {
          showToast(`Kategori "${nama}" masih memiliki ${subCount} sub-kategori. Hapus atau pindahkan sub-kategori terlebih dahulu sebelum menghapus kategori utama ini.`, 'warning', 4500);
          return;
        }

        const setuju = await showConfirm({
          title: 'Hapus Kategori',
          message: `Apakah Anda yakin ingin menghapus kategori "${nama}"?`,
          confirmText: 'Ya, Hapus',
          danger: true
        });
        if (!setuju) return;

        try {
          await apiCall('kategori.delete', { id });
          showToast('Kategori berhasil dihapus.', 'success');
          await muatKategori(container, canEdit);
        } catch (err) {
          showToast(err.message, 'error', 4500);
        }
      });
    });
  }
}

function bukaModalFormKategori(container, kat, semuaKategori = [], defaultParentId = '') {
  const isEdit = !!kat;
  const activeParentId = isEdit ? (kat.parent_id || '') : (defaultParentId || '');

  // Hanya kategori utama (yang tidak memiliki parent_id) yang boleh dipilih sebagai induk, dan bukan dirinya sendiri
  const listPilihanInduk = (semuaKategori || []).filter((k) => {
    if (isEdit && k.id === kat.id) return false;
    if (k.parent_id) return false; // Mencegah nested > 2 level
    return true;
  });

  const parentTerpilih = (semuaKategori || []).find((k) => k.id === activeParentId);

  let optionsParent = '<option value="">-- Kategori Utama (Tanpa Induk) --</option>';
  listPilihanInduk.forEach((k) => {
    const selected = activeParentId === k.id ? 'selected' : '';
    optionsParent += `<option value="${k.id}" ${selected}>${escapeHtml(k.nama)}</option>`;
  });

  let modalTitle = 'Tambah Kategori Baru';
  if (isEdit) {
    modalTitle = `Ubah Kategori: ${kat.nama}`;
  } else if (parentTerpilih) {
    modalTitle = `Tambah Sub Kategori (${parentTerpilih.nama})`;
  }

  const initialHint = activeParentId && parentTerpilih
    ? `Akan disimpan sebagai <strong>Sub-Kategori</strong> di bawah induk <em>${escapeHtml(parentTerpilih.nama)}</em>.`
    : `Pilih kategori induk jika ini adalah sub-kategori. Kosongkan jika ini adalah <strong>Kategori Utama</strong>.`;

  const bodyHtml = `
    <form id="form-kategori" class="stack">
      <div class="field">
        <label class="field-label" for="kat-nama">Nama Kategori <span class="wajib">*</span></label>
        <input type="text" class="input" id="kat-nama" value="${isEdit ? escapeHtml(kat.nama) : ''}" placeholder="Cth: PIPA AW, SEMEN GRESIK, CAT TEMBOK" required data-autofocus>
        <div id="err-kat-nama" class="text-danger text-xs fw-semibold" style="display: none; margin-top: 4px;"></div>
      </div>

      <div class="field">
        <label class="field-label" for="kat-parent">Kategori Induk (Pilih Induk untuk Sub-Kategori)</label>
        <select class="select" id="kat-parent">
          ${optionsParent}
        </select>
        <span class="field-hint" id="hint-kat-parent">${initialHint}</span>
      </div>

      <div class="field">
        <label class="field-label" for="kat-urutan">Nomor Urut Tampilan</label>
        <input type="number" class="input input-num" id="kat-urutan" value="${isEdit ? kat.urutan || 0 : 0}">
      </div>

      <div class="dialog-footer" style="padding: 0; margin-top: var(--sp-2)">
        <button type="button" class="btn btn-ghost btn-close-modal" id="btn-batal-kat">Batal</button>
        <button type="submit" class="btn btn-primary" id="btn-simpan-kat">
          ${isEdit ? 'Simpan Perubahan' : 'Tambah Kategori'}
        </button>
      </div>
    </form>
  `;

  const modal = showModal({
    title: modalTitle,
    body: bodyHtml
  });

  const form = $('#form-kategori', modal.el);
  const inputNama = $('#kat-nama', form);
  const selectParent = $('#kat-parent', form);
  const errNamaEl = $('#err-kat-nama', form);
  const btnSimpan = $('#btn-simpan-kat', form);

  $('#btn-batal-kat', modal.el)?.addEventListener('click', () => modal.close());

  function validasiDuplikatNama() {
    const namaVal = inputNama.value.trim();
    const parentVal = selectParent.value.trim();

    if (!namaVal) {
      if (errNamaEl) errNamaEl.style.display = 'none';
      if (btnSimpan) btnSimpan.disabled = false;
      return true;
    }

    const namaLower = namaVal.toLowerCase();
    let duplikat = false;
    let pesan = '';

    if (!parentVal) {
      // Pengecekan Kategori Utama
      duplikat = (semuaKategori || []).some(k => {
        if (isEdit && k.id === kat.id) return false;
        return !k.parent_id && String(k.nama || '').trim().toLowerCase() === namaLower;
      });
      if (duplikat) {
        pesan = `Kategori utama "${namaVal}" sudah terdaftar. Gunakan nama lain.`;
      }
    } else {
      // Pengecekan Sub Kategori di bawah Induk yang sama
      const parentObj = (semuaKategori || []).find(k => k.id === parentVal);
      duplikat = (semuaKategori || []).some(k => {
        if (isEdit && k.id === kat.id) return false;
        return k.parent_id === parentVal && String(k.nama || '').trim().toLowerCase() === namaLower;
      });
      if (duplikat) {
        pesan = `Sub-kategori "${namaVal}" di bawah induk "${parentObj ? parentObj.nama : ''}" sudah terdaftar.`;
      }
    }

    if (duplikat) {
      if (errNamaEl) {
        errNamaEl.textContent = pesan;
        errNamaEl.style.display = 'block';
      }
      if (btnSimpan) btnSimpan.disabled = true;
      return false;
    } else {
      if (errNamaEl) errNamaEl.style.display = 'none';
      if (btnSimpan) btnSimpan.disabled = false;
      return true;
    }
  }

  inputNama?.addEventListener('input', validasiDuplikatNama);

  // Update hint saat dropdown induk berubah
  selectParent?.addEventListener('change', (e) => {
    const val = e.target.value;
    const hintEl = $('#hint-kat-parent', form);
    if (hintEl) {
      if (val) {
        const selectedParent = (semuaKategori || []).find((k) => k.id === val);
        hintEl.innerHTML = `Akan disimpan sebagai <strong>Sub-Kategori</strong> di bawah induk <em>${escapeHtml(selectedParent?.nama || '')}</em>.`;
      } else {
        hintEl.innerHTML = `Akan disimpan sebagai <strong>Kategori Utama</strong> (level teratas tanpa induk).`;
      }
    }
    validasiDuplikatNama();
  });

  form?.addEventListener('submit', async (e) => {
    e.preventDefault();
    if (!validasiDuplikatNama()) return;

    const nama = inputNama.value.trim();
    const parent_id = selectParent.value.trim();
    const urutan = parseInt($('#kat-urutan', form).value, 10) || 0;

    if (!nama) {
      showToast('Nama kategori wajib diisi.', 'warning');
      return;
    }

    const btnSimpan = $('#btn-simpan-kat', form);
    btnSimpan.setAttribute('aria-busy', 'true');
    btnSimpan.disabled = true;

    try {
      if (isEdit) {
        await apiCall('kategori.update', { id: kat.id, nama, parent_id, urutan });
        showToast('Kategori berhasil diperbarui.', 'success');
      } else {
        await apiCall('kategori.create', { nama, parent_id, urutan });
        showToast('Kategori baru berhasil ditambahkan.', 'success');
      }
      modal.close();
      await muatKategori(container, true);
    } catch (err) {
      showToast(err.message, 'error');
    } finally {
      btnSimpan.removeAttribute('aria-busy');
      btnSimpan.disabled = false;
    }
  });
}
