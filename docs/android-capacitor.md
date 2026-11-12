# Panduan Build & Deployment Android (Capacitor) — POS Kasir Toko Bangunan

Dokumen ini menjelaskan tata cara pembungkusan, kompilasi, dan instalasi aplikasi **POS Kasir Toko Bangunan** menjadi file paket aplikasi Android (**APK**) siap pakai menggunakan **Capacitor 6**.

---

## 1. Prasyarat Lingkungan Pengembangan

Sebelum melakukan kompilasi APK Android di komputer Anda, pastikan telah terpasang:
1. **Node.js**: Versi 18+ (disarankan versi LTS atau v20+).
2. **Java Development Kit (JDK)**: Versi 17 (disarankan Eclipse Temurin 17 atau OpenJDK 17).
3. **Android Studio** (Koala / Iguana atau yang lebih baru) atau **Android SDK command-line tools**:
   - Android SDK Platform: API level 34 (Android 14).
   - Android SDK Build-Tools: 34.0.0.
   - Android NDK & CMake (opsional).
4. **Perangkat Uji Fisik (Smartphone/Tablet Android)**:
   - Aktifkan *Developer Options* (Opsi Pengembang) & *USB Debugging*.
   - Pasangkan dengan Printer Bluetooth Thermal (58mm atau 80mm).

---

## 2. Struktur Proyek Android

Proyek ini telah dikonfigurasi dengan arsitektur hybrid modern tanpa build step (Zero Build Step) pada front end:
```
./
├── package.json              # Dependensi Capacitor & scripts build
├── capacitor.config.json     # Konfigurasi ID aplikasi, splash, dan status bar
├── frontend/                 # Direktori web statis (HTML, CSS, JS, Ikon)
└── android/                  # Proyek native Android Studio (Gradle)
    ├── app/
    │   ├── build.gradle      # Konfigurasi SDK 34, namespace & dependensi
    │   └── src/main/
    │       ├── AndroidManifest.xml # Izin Bluetooth, Kamera, & Network
    │       ├── java/         # MainActivity Java bridge Capacitor
    │       └── res/          # Ikon, string, & tema splash screen
    ├── build.gradle          # Gradle build script tingkat proyek
    ├── settings.gradle       # Konfigurasi modul
    └── variables.gradle      # Versi dependensi AndroidX
```

---

## 3. Konfigurasi Izin & Fitur Android (`AndroidManifest.xml`)

File `android/app/src/main/AndroidManifest.xml` telah menyertakan seluruh izin yang diperlukan:

### A. Izin Bluetooth (Printer Kasir Thermal ESC/POS)
* **Android 11 ke bawah (API $\le$ 30):**
  - `android.permission.BLUETOOTH`
  - `android.permission.BLUETOOTH_ADMIN`
  - `android.permission.ACCESS_FINE_LOCATION` (Dibutuhkan sistem Android untuk memindai perangkat BLE terdekat).
* **Android 12 ke atas (API 31+):**
  - `android.permission.BLUETOOTH_SCAN` dengan flag `android:usesPermissionFlags="neverForLocation"` (sehingga tidak melacak GPS pengguna).
  - `android.permission.BLUETOOTH_CONNECT` (Untuk menghubungkan dan mengirimkan byte ESC/POS ke printer thermal).

### B. Izin Kamera (Scanner Barcode Material)
* `android.permission.CAMERA`
* `<uses-feature android:name="android.hardware.camera" android:required="false" />`
* `<uses-feature android:name="android.hardware.camera.autofocus" android:required="false" />`

### C. Jaringan & Keamanan
* `android.permission.INTERNET` & `ACCESS_NETWORK_STATE`
* `android:usesCleartextTraffic="true"` untuk mendukung printer thermal jaringan LAN lokal jika menggunakan IP printer.

---

## 4. Langkah-Langkah Sinkronisasi & Build APK

### Langkah 1: Pasang Dependensi Node.js
Buka terminal pada root proyek:
```bash
npm install
```

### Langkah 2: Sinkronisasi Aset Web ke Native Android
Setiap kali Anda mengubah file di folder `frontend/`, jalankan perintah:
```bash
npx cap sync android
```
Perintah ini akan menyalin seluruh aset web statis (HTML, CSS, JS) ke dalam direktori assets Android native (`android/app/src/main/assets/public/`).

### Langkah 3: Buka di Android Studio
Untuk menguji atau melakukan build melalui antarmuka grafis Android Studio:
```bash
npx cap open android
```
Atau buka Android Studio secara manual lalu pilih folder `C:\POS KASIR TOKO\android`.

---

## 5. Kompilasi APK (Command Line / Terminal)

Jika Anda ingin langsung mengompilasi APK tanpa membuka Android Studio:

### A. Build APK Debug (Untuk Pengujian di HP)
Di terminal PowerShell / Bash:
```bash
cd android
./gradlew assembleDebug
```
File APK debug akan dihasilkan di:
`android/app/build/outputs/apk/debug/app-debug.apk`

Anda dapat langsung memasang file APK ini ke smartphone yang terhubung lewat USB dengan perintah:
```bash
adb install -r android/app/build/outputs/apk/debug/app-debug.apk
```

### B. Build APK Release (Untuk Produksi Toko)
1. Buat keystore penandatanganan:
   ```bash
   keytool -genkey -v -keystore pos-release-key.jks -keyalg RSA -keysize 2048 -validity 10000 -alias poskasir
   ```
2. Jalankan build release:
   ```bash
   cd android
   ./gradlew assembleRelease
   ```
File APK release akan berada di:
`android/app/build/outputs/apk/release/app-release-unsigned.apk`

---

## 6. Integrasi Printer Thermal di Android

Aplikasi mendukung dua metode pencetakan struk di Android:

1. **Jalur Web Bluetooth (Native BLE):**
   - Hidupkan printer thermal Bluetooth kasir.
   - Buka menu **Pengaturan** di aplikasi POS Toko.
   - Pilih jalur cetak **Web Bluetooth**.
   - Saat transaksi selesai, tekan tombol **Cetak Nota** $\rightarrow$ pilih nama printer thermal Anda di daftar Bluetooth dialog.
2. **Jalur RawBT (Aplikasi Pendukung Android):**
   - Sangat disarankan untuk printer thermal Bluetooth Classic (bukan BLE).
   - Pasang aplikasi gratis **RawBT Print Service** dari Google Play Store.
   - Sambungkan printer di RawBT.
   - Di aplikasi POS, pilih jalur cetak **RawBT**. Aplikasi akan otomatis mengirimkan payload cetak struk via intent `rawbt:data:base64` secara instan tanpa perlu pairing ulang.

