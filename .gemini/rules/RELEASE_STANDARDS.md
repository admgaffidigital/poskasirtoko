# STANDAR MUTLAK UPDATE, SIMPAN & RILIS VERSI APLIKASI
======================================================
Aturan ini WAJIB dipatuhi oleh setiap pengembang dan AI Agent (Antigravity) setiap kali pengguna memberikan perintah "SIMPAN", "UPDATE", "RILIS", atau melakukan perubahan kode aplikasi.

## 1. Masalah yang Pernah Terjadi
- Perubahan disimpan hanya di file web (`frontend/`), tetapi file instalasi APK Android (`poskasirtoko.apk`) tidak dikompilasi ulang sehingga versi yang terpasang di HP pengguna tetap versi lama (misal: tetap tertahan di v1.0.12).
- Service worker cache (`frontend/sw.js`) tidak dinaikkan versinya, menyebabkan browser pengguna tetap memuat file cache lama.
- String fallback pada banner aplikasi (`frontend/js/app.js`) masih memuat nilai versi lama.
- Pengaturan versi tidak konsisten antara `package.json`, `config.js`, `index.html`, `sw.js`, `app.js`, dan `build.gradle`.

## 2. Prosedur Wajib Setiap Kali Update / Simpan
Setiap kali ada pembaruan atau rilis versi:
1. **Jalankan Skrip Rilis Master Otomatis**:
   ```bash
   npm run release
   ```
   Atau jika menaikkan versi patch:
   ```bash
   npm run release -- patch
   ```
2. **Skrip `npm run release` Secara Otomatis Melakukan**:
   - Menyelaraskan versi di **6 lokasi kunci**:
     1. `package.json` (`version`)
     2. `frontend/js/config.js` (`CONFIG.VERSION`)
     3. `frontend/index.html` (footer splash screen `vX.Y.Z`)
     4. `frontend/sw.js` (`CACHE_NAME: 'pos-kasir-static-vX.Y.Z'`)
     5. `frontend/js/app.js` (fallback string `vX.Y.Z`)
     6. `android/app/build.gradle` (`versionName` dan `versionCode`)
   - Menjalankan seluruh pengujian otomatis (`node tests/check_syntax.js`, `check_imports.js`, `check_globals.js`, `test_debug_final.js`) dengan hasil wajib 100% PASS.
   - Menjalankan sinkronisasi Capacitor Android (`npx cap sync android`).
   - Melakukan kompilasi ulang paket APK Android (`.\gradlew.bat assembleDebug` di folder `android/`).
   - Menyalin file biner `app-debug.apk` langsung ke `frontend/download/poskasirtoko.apk`.
   - Melakukan re-sync Capacitor agar link download di aplikasi Android juga terbarui.
3. **Commit dan Push ke GitHub**:
   ```bash
   git add -A ; git commit -m "chore(release): vX.Y.Z deskripsi pembaruan" ; git push origin main
   ```

DILARANG HANYA MENGUBAH SATU FILE VERSI TANPA MENJALANKAN `npm run release`.

