@echo off
title POS Kasir Toko - Direct USB ESC/POS Print Bridge
echo Menjalankan Direct USB ESC/POS Print Bridge di http://127.0.0.1:9199 ...
powershell -NoProfile -ExecutionPolicy Bypass -File "%~dp0pos-usb-bridge.ps1" -Port 9199
pause
