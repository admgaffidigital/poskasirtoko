@echo off
echo Memasang POS Kasir USB Bridge agar otomatis aktif saat Windows menyala...
set "STARTUP=%APPDATA%\Microsoft\Windows\Start Menu\Programs\Startup"
set "SCRIPT_PATH=%~dp0pos-usb-bridge.ps1"
set "VBS_FILE=%STARTUP%\POS-Kasir-USB-Bridge.vbs"

(
  echo Set WshShell = CreateObject("WScript.Shell"^)
  echo WshShell.Run "powershell -NoProfile -WindowStyle Hidden -ExecutionPolicy Bypass -File ""%SCRIPT_PATH%"" -Port 9199", 0, False
) > "%VBS_FILE%"

echo.
echo [SUKSES] Auto-start terpasang di:
echo   %VBS_FILE%
echo.
echo Menjalankan bridge sekarang di latar belakang...
wscript "%VBS_FILE%"
echo Selesai! Silakan buka aplikasi POS Kasir di Chrome/Edge dan pilih Direct POS USB.
pause
