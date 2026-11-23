<# :
@echo off
title POS Kasir Toko - Direct POS USB (ESC/POS) Bridge
echo Menjalankan Direct POS USB ESC/POS Bridge di http://127.0.0.1:9199 ...
powershell -NoProfile -ExecutionPolicy Bypass -Command "Invoke-Expression ([System.IO.File]::ReadAllText('%~f0'))"
pause
exit /b
#>

$Port = 9199
$ErrorActionPreference = 'Stop'

Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;

public static class RawPrinterHelper
{
    [StructLayout(LayoutKind.Sequential, CharSet = CharSet.Unicode)]
    public class DOCINFOW
    {
        [MarshalAs(UnmanagedType.LPWStr)] public string pDocName;
        [MarshalAs(UnmanagedType.LPWStr)] public string pOutputFile;
        [MarshalAs(UnmanagedType.LPWStr)] public string pDataType;
    }

    [DllImport("winspool.Drv", EntryPoint = "OpenPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true)]
    public static extern bool OpenPrinter(string szPrinter, out IntPtr hPrinter, IntPtr pd);

    [DllImport("winspool.Drv", EntryPoint = "ClosePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool ClosePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartDocPrinterW", SetLastError = true, CharSet = CharSet.Unicode, ExactSpelling = true)]
    public static extern bool StartDocPrinter(IntPtr hPrinter, int level, [In, MarshalAs(UnmanagedType.LPStruct)] DOCINFOW di);

    [DllImport("winspool.Drv", EntryPoint = "EndDocPrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool EndDocPrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "StartPagePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool StartPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "EndPagePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool EndPagePrinter(IntPtr hPrinter);

    [DllImport("winspool.Drv", EntryPoint = "WritePrinter", SetLastError = true, ExactSpelling = true)]
    public static extern bool WritePrinter(IntPtr hPrinter, IntPtr pBytes, int dwCount, out int dwWritten);

    public static void SendBytes(string printerName, byte[] bytes, string docName)
    {
        IntPtr hPrinter;
        if (!OpenPrinter(printerName, out hPrinter, IntPtr.Zero))
            throw new Exception("Gagal membuka printer '" + printerName + "' (Win32 Error " + Marshal.GetLastWin32Error() + ")");
        try
        {
            DOCINFOW di = new DOCINFOW { pDocName = docName, pDataType = "RAW" };
            if (!StartDocPrinter(hPrinter, 1, di))
                throw new Exception("StartDocPrinter gagal (Win32 Error " + Marshal.GetLastWin32Error() + ")");
            try
            {
                if (!StartPagePrinter(hPrinter))
                    throw new Exception("StartPagePrinter gagal (Win32 Error " + Marshal.GetLastWin32Error() + ")");
                IntPtr pUnmanaged = Marshal.AllocCoTaskMem(bytes.Length);
                try
                {
                    Marshal.Copy(bytes, 0, pUnmanaged, bytes.Length);
                    int written;
                    if (!WritePrinter(hPrinter, pUnmanaged, bytes.Length, out written))
                        throw new Exception("WritePrinter gagal (Win32 Error " + Marshal.GetLastWin32Error() + ")");
                }
                finally
                {
                    Marshal.FreeCoTaskMem(pUnmanaged);
                    EndPagePrinter(hPrinter);
                }
            }
            finally { EndDocPrinter(hPrinter); }
        }
        finally { ClosePrinter(hPrinter); }
    }
}
"@

Add-Type -AssemblyName System.Drawing

function Get-PrinterList {
  $list = @()
  foreach ($p in [System.Drawing.Printing.PrinterSettings]::InstalledPrinters) { $list += [string]$p }
  return $list
}

function Get-DefaultPrinterName {
  try { return [string](New-Object System.Drawing.Printing.PrinterSettings).PrinterName } catch { return '' }
}

function Send-JsonResponse($Response, [int]$StatusCode, [hashtable]$Body) {
  $Response.StatusCode = $StatusCode
  $Response.ContentType = 'application/json; charset=utf-8'
  $Response.Headers['Access-Control-Allow-Origin'] = '*'
  $Response.Headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
  $Response.Headers['Access-Control-Allow-Headers'] = 'Content-Type'
  $Response.Headers['Access-Control-Allow-Private-Network'] = 'true'
  $buf = [System.Text.Encoding]::UTF8.GetBytes(($Body | ConvertTo-Json -Compress -Depth 4))
  $Response.ContentLength64 = $buf.Length
  $Response.OutputStream.Write($buf, 0, $buf.Length)
  $Response.OutputStream.Close()
}

$listener = New-Object System.Net.HttpListener
$prefix = "http://127.0.0.1:$Port/"
$listener.Prefixes.Add($prefix)
$listener.Start()

Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  POS KASIR TOKO - DIRECT USB ESC/POS PRINT BRIDGE AKTIF  " -ForegroundColor Green
Write-Host "==========================================================" -ForegroundColor Cyan
Write-Host "  Alamat Lokal   : $prefix"
Write-Host "  Default Printer: $(Get-DefaultPrinterName)"
Write-Host "  Daftar Printer :"
foreach ($prn in (Get-PrinterList)) { Write-Host "    - $prn" }
Write-Host "----------------------------------------------------------"
Write-Host "  Biarkan jendela ini terbuka saat menggunakan kasir PC."
Write-Host "=========================================================="

try {
  while ($listener.IsListening) {
    $ctx = $listener.GetContext()
    $req = $ctx.Request
    $res = $ctx.Response

    if ($req.HttpMethod -eq 'OPTIONS') {
      $res.StatusCode = 204
      $res.Headers['Access-Control-Allow-Origin'] = '*'
      $res.Headers['Access-Control-Allow-Methods'] = 'GET, POST, OPTIONS'
      $res.Headers['Access-Control-Allow-Headers'] = 'Content-Type'
      $res.Headers['Access-Control-Allow-Private-Network'] = 'true'
      $res.OutputStream.Close()
      continue
    }

    $path = $req.Url.AbsolutePath.TrimEnd('/')
    if ($req.HttpMethod -eq 'GET' -and ($path -eq '' -or $path -eq '/status' -or $path -eq '/printers')) {
      Send-JsonResponse $res 200 @{
        ok              = $true
        service         = 'pos-kasir-usb-bridge'
        version         = '1.0'
        default_printer = (Get-DefaultPrinterName)
        printers        = (Get-PrinterList)
      }
      continue
    }

    if ($req.HttpMethod -eq 'POST' -and $path -eq '/print') {
      try {
        $reader = New-Object System.IO.StreamReader($req.InputStream, [System.Text.Encoding]::UTF8)
        $payload = ($reader.ReadToEnd()) | ConvertFrom-Json
        $reader.Close()
        $targetPrinter = if ($payload.printer) { [string]$payload.printer } else { Get-DefaultPrinterName }
        if (-not $targetPrinter) {
          Send-JsonResponse $res 400 @{ ok = $false; error = 'Printer Windows belum dipilih.' }
          continue
        }
        $bytes = [System.Convert]::FromBase64String([string]$payload.data_base64)
        $docName = if ($payload.doc_name) { [string]$payload.doc_name } else { 'POS Kasir ESC/POS' }
        [RawPrinterHelper]::SendBytes($targetPrinter, $bytes, $docName)
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] CETAK OK -> $targetPrinter ($($bytes.Length) bytes)" -ForegroundColor Green
        Send-JsonResponse $res 200 @{ ok = $true; printer = $targetPrinter; bytes = $bytes.Length }
      } catch {
        Write-Host "[$(Get-Date -Format 'HH:mm:ss')] CETAK GAGAL -> $($_.Exception.Message)" -ForegroundColor Red
        Send-JsonResponse $res 500 @{ ok = $false; error = $_.Exception.Message }
      }
      continue
    }

    Send-JsonResponse $res 404 @{ ok = $false; error = 'Endpoint tidak ditemukan.' }
  }
} finally {
  $listener.Stop()
  $listener.Close()
}
