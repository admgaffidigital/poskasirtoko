# POS Kasir Toko — Direct USB ESC/POS Print Bridge (Windows)

Tool super ringan (0 instalasi, tanpa Node.js, tanpa Java, tanpa QZ Tray, tanpa ganti driver Zadig) untuk mencetak **RAW ESC/POS asli langsung ke Printer Thermal USB 58mm / 80mm** dari browser Desktop (Chrome / Edge).

## Kelebihan
- **Ketajaman 100% Native Hardware**: Menggunakan font internal printer thermal (bukan render gambar browser), hitam pekat, cepat, dan tidak buram.
- **Panjang Kertas 100% Eksak**: Kertas berhenti tepat di akhir struk + **Auto-Cutter** langsung memotong.
- **1 Klik Langsung Keluar Kertas**: Tanpa dialog Print Chrome/Edge.
- **Buka Laci Kasir Otomatis**: Mendukung perintah Cash Drawer Kick (`ESC p`).
- **Kompatibel Semua Merek Printer Thermal USB Windows**: Eppos, Panda, VSC, Blueprint, Xprinter, Epson TM-T82, Iware, Codeshop, POS-58, POS-80.

## Cara Pakai (30 Detik)
1. Pastikan printer thermal USB sudah terpasang dan muncul di **Control Panel > Devices and Printers** Windows.
2. Klik 2× **`jalankan-bridge.bat`** untuk mencoba langsung (atau klik 2× **`pasang-autostart-windows.bat`** agar otomatis aktif setiap komputer kasir dinyalakan).
3. Di aplikasi Web POS Kasir, buka **Pengaturan → Atur Printer** (atau klik **Direct POS USB** di modal cetak):
   - Status **POS USB Bridge Windows** otomatis berubah hijau (**Terhubung**).
   - Pilih nama printer thermal USB Anda dari daftar dropdown.
   - Klik **Uji Cetak Direct USB** — struk langsung tercetak tajam!
