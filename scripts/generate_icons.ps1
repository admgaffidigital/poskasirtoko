Add-Type -AssemblyName System.Drawing

$srcPath = "C:\POS KASIR TOKO\frontend\assets\icon-512.png"
$srcBmp = [System.Drawing.Bitmap]::FromFile($srcPath)

function Resize-Image($destPath, $targetW, $targetH, $isRound=$false) {
    $destBmp = New-Object System.Drawing.Bitmap $targetW, $targetH
    $g = [System.Drawing.Graphics]::FromImage($destBmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality

    if ($isRound) {
        $path = New-Object System.Drawing.Drawing2D.GraphicsPath
        $path.AddEllipse(0, 0, $targetW, $targetH)
        $g.SetClip($path)
    }

    $g.DrawImage($srcBmp, 0, 0, $targetW, $targetH)
    $g.Dispose()

    $parentDir = Split-Path -Parent $destPath
    if (-not (Test-Path $parentDir)) {
        New-Item -ItemType Directory -Path $parentDir -Force | Out-Null
    }

    $destBmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $destBmp.Dispose()
    Write-Host "Generated: $destPath ($($targetW)x$($targetH))"
}

# 1. PWA Icons
Resize-Image "C:\POS KASIR TOKO\frontend\assets\icon-192.png" 192 192

# 2. Android Mipmap Icons
$densities = @(
    @{ name = "mdpi"; size = 48; fg = 108 },
    @{ name = "hdpi"; size = 72; fg = 162 },
    @{ name = "xhdpi"; size = 96; fg = 216 },
    @{ name = "xxhdpi"; size = 144; fg = 324 },
    @{ name = "xxxhdpi"; size = 192; fg = 432 }
)

foreach ($d in $densities) {
    $dir = "C:\POS KASIR TOKO\android\app\src\main\res\mipmap-$($d.name)"
    Resize-Image "$dir\ic_launcher.png" $d.size $d.size $false
    Resize-Image "$dir\ic_launcher_round.png" $d.size $d.size $true
    Resize-Image "$dir\ic_launcher_foreground.png" $d.fg $d.fg $false
}

$srcBmp.Dispose()
Write-Host "All icons generated successfully!"

