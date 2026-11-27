/* ---------- 9.1 AUTENTIKASI & SESI ---------- */

/** auth.login — Login dengan username & 6-digit PIN. */
function aksiAuthLogin_(ctx) {
  const p = ctx.payload || {};
  const username = V_.teks(p.username, 'Username', { wajib: true, maks: 50 });
  const pin = V_.pin(p.pin);

  const semuaUser = bacaSemua_('Users');
  const user = semuaUser.filter(function (u) {
    return String(u.username || '').toLowerCase() === username.toLowerCase();
  })[0];

  if (!user || user.deleted) {
    gagal_(KODE.AUTH_INVALID, 'Username atau PIN salah.');
  }

  if (!user.aktif) {
    gagal_(KODE.FORBIDDEN, 'Akun pengguna ini telah dinonaktifkan.');
  }

  // Cek apakah akun sedang terkunci karena gagal 5x (WIB +07:00 independen dari timezone server)
  if (user.kunci_sampai) {
    const tKunci = parseWaktuWibMs_(user.kunci_sampai);
    if (isFinite(tKunci) && tKunci > Date.now()) {
      gagal_(KODE.AUTH_LOCKED, 'Akun Anda terkunci sementara hingga ' + user.kunci_sampai + ' karena salah PIN 5 kali.');
    }
  }

  // Verifikasi hash PIN
  const hashMasuk = hashPin_(pin, user.salt);
  if (hashMasuk !== user.pin_hash) {
    const peng = ambilPengaturan_();
    const maksGagal = peng.login_maks_gagal || 5;
    const kunciMenit = peng.login_kunci_menit || 15;
    const gagalBaru = (Number(user.gagal_login) || 0) + 1;
    let waktuKunciStr = '';

    if (gagalBaru >= maksGagal) {
      waktuKunciStr = formatWaktu_(new Date(Date.now() + kunciMenit * 60 * 1000));
    }

    ubahBaris_('Users', [{
      id: user.id,
      data: { gagal_login: gagalBaru, kunci_sampai: waktuKunciStr }
    }], 'sistem');

    catatAudit_(user.id, 'login_gagal', 'AUTH', user.id, { username: user.username, percobaan: gagalBaru });

    if (waktuKunciStr) {
      gagal_(KODE.AUTH_LOCKED, 'PIN salah 5 kali berturut-turut. Akun dikunci selama 15 menit (hingga ' + waktuKunciStr + ').');
    } else {
      const sisa = maksGagal - gagalBaru;
      gagal_(KODE.AUTH_INVALID, 'Username atau PIN salah. Sisa percobaan: ' + sisa + ' kali.');
    }
  }

  // Login berhasil: reset counter gagal & update last_login
  const waktuSekarang = sekarang_();
  ubahBaris_('Users', [{
    id: user.id,
    data: { gagal_login: 0, kunci_sampai: '', last_login: waktuSekarang }
  }], 'sistem');

  // Buat sesi baru
  const token = buatToken_();
  const tokenHash = sha256Hex_(token);
  const peng = ambilPengaturan_();
  const durasiJam = Number(peng.sesi_jam) || 6;
  const tglKedaluwarsa = formatWaktu_(new Date(Date.now() + durasiJam * 3600 * 1000));

  tambahBaris_('Sesi', [{
    user_id: user.id,
    token_hash: tokenHash,
    kedaluwarsa: tglKedaluwarsa,
    terakhir_aktif: waktuSekarang,
    perangkat: p.perangkat || 'Web'
  }], user.id);

  const userAman = {
    id: user.id,
    username: user.username,
    nama: user.nama,
    role: user.role,
    wajib_ganti_pin: !!user.wajib_ganti_pin
  };

  cacheSimpan_('sesi_' + tokenHash, userAman, 300);
  catatAudit_(user.id, 'login_sukses', 'AUTH', user.id, { username: user.username, role: user.role });

  return {
    token: token,
    user: userAman,
    pengaturan: peng,
    toko: {
      nama: peng.toko_nama || 'Toko',
      alamat: peng.toko_alamat || '',
      hp: peng.toko_hp || '',
      nota_footer: peng.nota_footer || ''
    }
  };
}

/** auth.logout — Mengakhiri sesi aktif. */
function aksiAuthLogout_(ctx) {
  let t = (ctx.token || '').trim();
  if (t.startsWith('"') && t.endsWith('"') && t.length > 2) {
    t = t.substring(1, t.length - 1).trim();
  }
  const th = sha256Hex_(t);
  const semuaSesi = bacaSemua_('Sesi');
  const sesi = semuaSesi.filter(function (s) { return s.token_hash === th && !s.deleted; })[0];
  if (sesi) {
    hapusLunak_('Sesi', sesi.id, ctx.user.id);
  }
  cacheHapus_('sesi_' + th);
  catatAudit_(ctx.user.id, 'logout', 'AUTH', ctx.user.id, {});
  return { pesan: 'Logout berhasil.' };
}

/** auth.me — Mengambil data profil sesi pengguna yang sedang aktif & identitas toko. */
function aksiAuthMe_(ctx) {
  const peng = ambilPengaturan_();
  return {
    user: ctx.user,
    pengaturan: peng,
    toko: {
      nama: peng.toko_nama || 'Toko',
      alamat: peng.toko_alamat || '',
      hp: peng.toko_hp || '',
      nota_footer: peng.nota_footer || ''
    }
  };
}

/** auth.gantiPin — Mengganti PIN user sendiri. */
function aksiAuthGantiPin_(ctx) {
  const p = ctx.payload || {};
  const pinLama = V_.pin(p.pin_lama);
  const pinBaru = V_.pin(p.pin_baru);

  if (pinLama === pinBaru) {
    gagal_(KODE.VALIDATION, 'PIN baru harus berbeda dengan PIN lama.');
  }

  const u = cariById_('Users', ctx.user.id);
  if (!u || u.deleted) {
    gagal_(KODE.AUTH_INVALID, 'Data pengguna tidak ditemukan.');
  }

  if (hashPin_(pinLama, u.salt) !== u.pin_hash) {
    gagal_(KODE.VALIDATION, 'PIN lama Anda salah.');
  }

  const saltBaru = buatSalt_();
  ubahBaris_('Users', [{
    id: u.id,
    data: {
      pin_hash: hashPin_(pinBaru, saltBaru),
      salt: saltBaru,
      wajib_ganti_pin: false
    }
  }], ctx.user.id);

  // Perbarui cache sesi
  ctx.user.wajib_ganti_pin = false;
  cacheSimpan_('sesi_' + sha256Hex_(ctx.token), ctx.user, 300);
  catatAudit_(ctx.user.id, 'ganti_pin', 'AUTH', u.id, {});

  return { pesan: 'PIN Anda berhasil diperbarui.' };
}

/* ---------- 9.4 PENGATURAN UMUM ---------- */

/** pengaturan.get — Membaca konfigurasi operasional toko. */
function aksiPengaturanGet_() {
  const p = ambilPengaturan_();
  return {
    pengaturan: p,
    toko: {
      nama: p.toko_nama || 'Toko',
      alamat: p.toko_alamat || '',
      hp: p.toko_hp || '',
      nota_footer: p.nota_footer || ''
    }
  };
}

/** pengaturan.set — Mengubah konfigurasi operasional toko (Khusus Owner). */
function aksiPengaturanSet_(ctx) {
  const p = ctx.payload || {};
  const kunciDukungan = Object.keys(PENGATURAN_DEFAULT);
  const barisPengaturan = bacaSemua_('Pengaturan', { termasukTerhapus: true });
  const petaId = {};
  barisPengaturan.forEach(function (row) { petaId[row.key] = row.id; });

  const diubah = [];
  const ditambah = [];

  kunciDukungan.forEach(function (k) {
    if (p[k] !== undefined) {
      let val = p[k];
      if (k === 'diskon_maks_kasir_persen') val = V_.angka(val, 'Maks Diskon Kasir', { min: 0, max: 100 });
      if (k === 'pajak_persen') val = V_.angka(val, 'Pajak Persen', { min: 0, max: 100 });
      if (k === 'poin_per_rupiah') val = V_.angka(val, 'Aturan Poin (Rp per 1 Poin)', { min: 100 });
      if (k === 'printer_ukuran') val = val === '80' ? '80' : '58';
      if (k === 'printer_jalur') val = ['otomatis', 'usb_direct', 'rawbt', 'webbluetooth', 'browser'].indexOf(val) !== -1 ? val : 'otomatis';

      if (petaId[k]) {
        diubah.push({ id: petaId[k], data: { value: val } });
      } else {
        ditambah.push({ key: k, value: val });
      }
    }
  });

  if (diubah.length) ubahBaris_('Pengaturan', diubah, ctx.user.id);
  if (ditambah.length) tambahBaris_('Pengaturan', ditambah, ctx.user.id);

  cacheHapus_('pengaturan');
  catatAudit_(ctx.user.id, 'pengaturan_ubah', 'SETTING', '', { perubahan: p });

  const hasilPengaturan = ambilPengaturan_();
  return {
    pengaturan: hasilPengaturan,
    toko: {
      nama: hasilPengaturan.toko_nama || 'Toko',
      alamat: hasilPengaturan.toko_alamat || '',
      hp: hasilPengaturan.toko_hp || '',
      nota_footer: hasilPengaturan.nota_footer || ''
    }
  };
}

/** pengaturan.simpanPresetKatalog — Sinkronisasi Cloud Preset Katalog PDF lintas perangkat (Semua Role). */
function aksiPengaturanSimpanPresetKatalog_(ctx) {
  const p = ctx.payload || {};
  if (!Array.isArray(p.presets)) {
    gagal_(KODE.VALIDATION, 'Daftar preset katalog harus berupa array.');
  }

  const bersih = p.presets.slice(0, 25).map(function (pr, idx) {
    const nama = V_.teks(pr && pr.nama, 'Nama Preset', { wajib: true, maks: 80 });
    const ids = Array.isArray(pr && pr.productIds)
      ? pr.productIds.slice(0, 2000).map(function (x) { return String(x || '').trim(); }).filter(Boolean)
      : [];
    const cfg = (pr && pr.config && typeof pr.config === 'object') ? pr.config : {};
    return {
      id: V_.teks(pr && pr.id, 'ID Preset', { maks: 60 }) || ('pr_' + Date.now() + '_' + idx),
      nama: nama,
      productIds: ids,
      config: {
        judul: V_.teks(cfg.judul, 'Judul Katalog', { maks: 120 }),
        subjudul: V_.teks(cfg.subjudul, 'Subjudul', { maks: 120 }),
        catatan: V_.teks(cfg.catatan, 'Catatan', { maks: 240 }),
        layout: ['grid2', 'grid3', 'table'].indexOf(cfg.layout) !== -1 ? cfg.layout : 'grid2',
        modeHarga: ['ritel', 'grosir', 'keduanya', 'tanpa_harga'].indexOf(cfg.modeHarga) !== -1 ? cfg.modeHarga : 'ritel',
        tema: ['teal', 'orange', 'blue', 'bw'].indexOf(cfg.tema) !== -1 ? cfg.tema : 'teal',
        groupByCategory: cfg.groupByCategory !== false,
        showPhoto: cfg.showPhoto !== false,
        showVariants: cfg.showVariants !== false,
        showStock: cfg.showStock !== false,
        showSku: cfg.showSku !== false
      },
      updatedAt: V_.teks(pr && pr.updatedAt, 'Waktu Update', { maks: 40 }) || sekarang_()
    };
  });

  const barisPengaturan = bacaSemua_('Pengaturan', { termasukTerhapus: true });
  let rowEks = null;
  barisPengaturan.forEach(function (row) {
    if (row.key === 'katalog_pdf_presets') rowEks = row;
  });

  if (rowEks) {
    ubahBaris_('Pengaturan', [{ id: rowEks.id, data: { value: bersih, deleted: false } }], ctx.user.id);
  } else {
    tambahBaris_('Pengaturan', [{ key: 'katalog_pdf_presets', value: bersih }], ctx.user.id);
  }

  cacheHapus_('pengaturan');
  catatAudit_(ctx.user.id, 'katalog_preset_simpan', 'SETTING', 'katalog_pdf_presets', { jumlah: bersih.length });

  return {
    presets: bersih,
    waktu_sinkron: sekarang_()
  };
}

/** pengaturan.simpanTema — Sinkronisasi Cloud Tema, Warna Aksen, & Tipografi lintas perangkat (Semua Role). */
function aksiPengaturanSimpanTema_(ctx) {
  const p = ctx.payload || {};
  const daftarTheme = ['light', 'warm', 'dark'];
  const daftarAccent = ['orange', 'blue', 'emerald', 'teal', 'indigo', 'rose'];
  const daftarFontFamily = ['system', 'inter', 'jakarta', 'poppins', 'roboto', 'mono'];
  const daftarFontStyle = ['standar', 'tegas', 'ramping'];

  const theme = daftarTheme.indexOf(String(p.theme || '')) !== -1 ? String(p.theme) : 'light';
  const accent = daftarAccent.indexOf(String(p.accent || '')) !== -1 ? String(p.accent) : 'orange';
  const fontFamily = daftarFontFamily.indexOf(String(p.fontFamily || '')) !== -1 ? String(p.fontFamily) : 'system';
  const fontStyle = daftarFontStyle.indexOf(String(p.fontStyle || '')) !== -1 ? String(p.fontStyle) : 'standar';

  let fontPct = parseInt(p.fontPct, 10);
  if (!isFinite(fontPct)) fontPct = 100;
  fontPct = Math.max(85, Math.min(125, fontPct));

  const waktu = sekarang_();
  const temaBersih = {
    theme: theme,
    accent: accent,
    fontFamily: fontFamily,
    fontPct: fontPct,
    fontStyle: fontStyle,
    updatedAt: waktu,
    diubah_oleh: ctx.user.nama || ctx.user.username || ctx.user.id
  };

  const barisPengaturan = bacaSemua_('Pengaturan', { termasukTerhapus: true });
  let rowEks = null;
  barisPengaturan.forEach(function (row) {
    if (row.key === 'tampilan_tema') rowEks = row;
  });

  if (rowEks) {
    ubahBaris_('Pengaturan', [{ id: rowEks.id, data: { value: temaBersih, deleted: false } }], ctx.user.id);
  } else {
    tambahBaris_('Pengaturan', [{ key: 'tampilan_tema', value: temaBersih }], ctx.user.id);
  }

  cacheHapus_('pengaturan');
  catatAudit_(ctx.user.id, 'tampilan_tema_simpan', 'SETTING', 'tampilan_tema', {
    theme: theme,
    accent: accent,
    fontFamily: fontFamily,
    fontPct: fontPct,
    fontStyle: fontStyle
  });

  return {
    tampilan_tema: temaBersih,
    waktu_sinkron: waktu
  };
}

/* ---------- 9.5 MANAJEMEN MULTI AKUN PENGGUNA ---------- */

/** user.list — Daftar akun pengguna (Khusus Owner). */
function aksiUserList_() {
  const users = bacaSemua_('Users').map(function (u) {
    return {
      id: u.id,
      username: u.username,
      nama: u.nama,
      role: u.role,
      aktif: !!u.aktif,
      wajib_ganti_pin: !!u.wajib_ganti_pin,
      gagal_login: Number(u.gagal_login) || 0,
      kunci_sampai: u.kunci_sampai || '',
      last_login: u.last_login || '',
      created_at: u.created_at || ''
    };
  });
  return { items: users };
}

/** user.create — Tambah akun pengguna baru (Khusus Owner). */
function aksiUserCreate_(ctx) {
  const p = ctx.payload || {};
  const username = V_.teks(p.username, 'Username', { wajib: true, maks: 30, pola: /^[a-zA-Z0-9_.-]+$/ });
  const nama = V_.teks(p.nama, 'Nama Lengkap', { wajib: true, maks: 100 });
  const role = V_.pilihan(p.role, 'Role', SEMUA_ROLE);
  const pin = V_.pin(p.pin);

  // Cek duplikasi username
  const sudahAda = bacaSemua_('Users').some(function (u) {
    return String(u.username || '').toLowerCase() === username.toLowerCase() && !u.deleted;
  });
  if (sudahAda) {
    gagal_(KODE.CONFLICT, 'Username "' + username + '" sudah digunakan oleh pengguna lain.');
  }

  const salt = buatSalt_();
  const dibuat = tambahBaris_('Users', [{
    username: username,
    nama: nama,
    role: role,
    pin_hash: hashPin_(pin, salt),
    salt: salt,
    aktif: true,
    wajib_ganti_pin: true,
    gagal_login: 0,
    kunci_sampai: '',
    last_login: ''
  }], ctx.user.id)[0];

  catatAudit_(ctx.user.id, 'user_tambah', 'USER', dibuat.id, { username: username, role: role });

  return {
    id: dibuat.id,
    username: dibuat.username,
    nama: dibuat.nama,
    role: dibuat.role,
    aktif: true,
    wajib_ganti_pin: true
  };
}

/** user.update — Ubah nama, role, status aktif pengguna (Khusus Owner). */
function aksiUserUpdate_(ctx) {
  const p = ctx.payload || {};
  const id = V_.teks(p.id, 'ID Pengguna', { wajib: true });
  const nama = V_.teks(p.nama, 'Nama Lengkap', { wajib: true, maks: 100 });
  const role = V_.pilihan(p.role, 'Role', SEMUA_ROLE);
  const aktif = p.aktif !== false;

  // Proteksi akun sendiri
  if (id === ctx.user.id && !aktif) {
    gagal_(KODE.VALIDATION, 'Anda tidak dapat menonaktifkan akun Anda sendiri yang sedang aktif.');
  }
  if (id === ctx.user.id && role !== ctx.user.role) {
    gagal_(KODE.VALIDATION, 'Anda tidak dapat mengubah role akun Anda sendiri saat sedang login.');
  }

  const diubah = ubahBaris_('Users', [{
    id: id,
    data: { nama: nama, role: role, aktif: aktif }
  }], ctx.user.id)[0];

  catatAudit_(ctx.user.id, 'user_ubah', 'USER', id, { role: role, aktif: aktif });

  return {
    id: diubah.id,
    username: diubah.username,
    nama: diubah.nama,
    role: diubah.role,
    aktif: diubah.aktif
  };
}

/** user.resetPin — Reset PIN akun pengguna lain ke PIN baru (Khusus Owner). */
function aksiUserResetPin_(ctx) {
  const p = ctx.payload || {};
  const id = V_.teks(p.id, 'ID Pengguna', { wajib: true });
  const pinBaru = V_.pin(p.pin_baru);

  const u = cariById_('Users', id);
  if (!u || u.deleted) gagal_(KODE.NOT_FOUND, 'Pengguna tidak ditemukan.');

  const saltBaru = buatSalt_();
  ubahBaris_('Users', [{
    id: id,
    data: {
      pin_hash: hashPin_(pinBaru, saltBaru),
      salt: saltBaru,
      wajib_ganti_pin: true,
      gagal_login: 0,
      kunci_sampai: ''
    }
  }], ctx.user.id);

  // Batalkan sesi aktif pengguna yang di-reset PIN-nya di perangkat lain
  bacaSemua_('Sesi').filter(function (s) { return s.user_id === id && !s.deleted; }).forEach(function (s) {
    hapusLunak_('Sesi', s.id, ctx.user.id);
    cacheHapus_('sesi_' + s.token_hash);
  });

  catatAudit_(ctx.user.id, 'user_reset_pin', 'USER', id, { username: u.username });

  return { pesan: 'PIN pengguna ' + u.username + ' berhasil direset. Pengguna wajib mengganti PIN saat login berikutnya.' };
}
