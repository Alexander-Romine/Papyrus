# Draws Papyrus's mark - a parchment scroll on a charcoal rounded tile - and
# packs icon.ico with 16/32/48/256 PNG entries. Also writes icon-preview.png.
# Runs from the repo's tools folder, so the app directory is the parent of
# this script.
$appDir = Split-Path -Parent $PSScriptRoot
$iconPath = Join-Path $appDir "icon.ico"
$previewPath = Join-Path $appDir "tools\icon-preview.png"

Add-Type -AssemblyName System.Drawing

function New-RoundedRectPath([float]$x, [float]$y, [float]$w, [float]$h, [float]$r) {
    $p = New-Object System.Drawing.Drawing2D.GraphicsPath
    $p.AddArc($x, $y, 2 * $r, 2 * $r, 180, 90)
    $p.AddArc($x + $w - 2 * $r, $y, 2 * $r, 2 * $r, 270, 90)
    $p.AddArc($x + $w - 2 * $r, $y + $h - 2 * $r, 2 * $r, 2 * $r, 0, 90)
    $p.AddArc($x, $y + $h - 2 * $r, 2 * $r, 2 * $r, 90, 90)
    $p.CloseFigure()
    return , $p
}

# ---------------- master at 256, downscaled for the smaller entries ----------------
$S = 256
$master = New-Object System.Drawing.Bitmap($S, $S)
$g = [System.Drawing.Graphics]::FromImage($master)
$g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$g.Clear([System.Drawing.Color]::Transparent)

# charcoal rounded tile
$tile = New-RoundedRectPath 0 0 256 256 58
$tileBrush = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.Point]::new(0, 0), [System.Drawing.Point]::new(0, 256),
    [System.Drawing.Color]::FromArgb(255, 37, 37, 39),
    [System.Drawing.Color]::FromArgb(255, 11, 11, 12))
$g.FillPath($tileBrush, $tile)

# soft shadow beneath the scroll
$shadowPath = New-Object System.Drawing.Drawing2D.GraphicsPath
$shadowPath.AddEllipse(58, 192, 140, 30)
$shadowBrush = New-Object System.Drawing.Drawing2D.PathGradientBrush($shadowPath)
$shadowBrush.CenterColor = [System.Drawing.Color]::FromArgb(130, 0, 0, 0)
$shadowBrush.SurroundColors = @([System.Drawing.Color]::FromArgb(0, 0, 0, 0))
$g.FillPath($shadowBrush, $shadowPath)

# the unrolled sheet (taller than wide-ish, matching the in-app mark)
$sheetGrad = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.PointF]::new(63, 70), [System.Drawing.PointF]::new(63, 186),
    [System.Drawing.Color]::FromArgb(255, 252, 248, 239),
    [System.Drawing.Color]::FromArgb(255, 226, 216, 197))
$g.FillRectangle($sheetGrad, 63, 70, 130, 116)

# depth where the sheet tucks under the rolls
$shadeL = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.PointF]::new(63, 0), [System.Drawing.PointF]::new(89, 0),
    [System.Drawing.Color]::FromArgb(75, 0, 0, 0),
    [System.Drawing.Color]::FromArgb(0, 0, 0, 0))
$g.FillRectangle($shadeL, 63, 70, 26, 116)
$shadeR = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.PointF]::new(167, 0), [System.Drawing.PointF]::new(193, 0),
    [System.Drawing.Color]::FromArgb(0, 0, 0, 0),
    [System.Drawing.Color]::FromArgb(75, 0, 0, 0))
$g.FillRectangle($shadeR, 167, 70, 26, 116)

# three written lines (the line you're on, then two already written)
$line1 = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(255, 74, 69, 58), 12)
$line1.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$line1.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$g.DrawLine($line1, 89, 96, 173, 96)
$line2 = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(230, 133, 125, 108), 12)
$line2.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$line2.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$g.DrawLine($line2, 89, 128, 157, 128)
$line3 = New-Object System.Drawing.Pen([System.Drawing.Color]::FromArgb(200, 133, 125, 108), 12)
$line3.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
$line3.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
$g.DrawLine($line3, 89, 160, 138, 160)

# rolled ends, cylinder-shaded from the left (full height of the scroll)
$rollGrad = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.PointF]::new(44, 0), [System.Drawing.PointF]::new(76, 0),
    [System.Drawing.Color]::FromArgb(255, 250, 245, 234),
    [System.Drawing.Color]::FromArgb(255, 208, 197, 177))
$leftRoll = New-RoundedRectPath 44 50 32 156 16
$g.FillPath($rollGrad, $leftRoll)

$rollGrad2 = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
    [System.Drawing.PointF]::new(180, 0), [System.Drawing.PointF]::new(212, 0),
    [System.Drawing.Color]::FromArgb(255, 250, 245, 234),
    [System.Drawing.Color]::FromArgb(255, 208, 197, 177))
$rightRoll = New-RoundedRectPath 180 50 32 156 16
$g.FillPath($rollGrad2, $rightRoll)

$g.Dispose()

# ---------------- preview ----------------
$master.Save($previewPath, [System.Drawing.Imaging.ImageFormat]::Png)

# ---------------- pack multi-size .ico ----------------
$sizes = @(16, 32, 48, 256)
$pngs = @{}
foreach ($size in $sizes) {
    if ($size -eq 256) {
        $img = $master
    } else {
        $img = New-Object System.Drawing.Bitmap($size, $size)
        $sg = [System.Drawing.Graphics]::FromImage($img)
        $sg.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $sg.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
        $sg.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $sg.DrawImage($master, 0, 0, $size, $size)
        $sg.Dispose()
    }
    $ms = New-Object System.IO.MemoryStream
    $img.Save($ms, [System.Drawing.Imaging.ImageFormat]::Png)
    $pngs[$size] = $ms.ToArray()
    $ms.Dispose()
    if ($img -ne $master) { $img.Dispose() }
}

$fs = [System.IO.File]::Create($iconPath)
$bw = New-Object System.IO.BinaryWriter($fs)
$bw.Write([UInt16]0)           # reserved
$bw.Write([UInt16]1)           # type: icon
$bw.Write([UInt16]$sizes.Count)
$offset = 6 + 16 * $sizes.Count
foreach ($size in $sizes) {
    $byteSize = [byte]($size -band 255)   # 256 encodes as 0
    $bw.Write($byteSize)
    $bw.Write($byteSize)
    $bw.Write([Byte]0)         # palette colours
    $bw.Write([Byte]0)         # reserved
    $bw.Write([UInt16]1)       # colour planes
    $bw.Write([UInt16]32)      # bits per pixel
    $bw.Write([Int32]$pngs[$size].Length)
    $bw.Write([Int32]$offset)
    $offset += $pngs[$size].Length
}
foreach ($size in $sizes) { $bw.Write($pngs[$size]) }
$bw.Close()
$fs.Close()
$master.Dispose()

Write-Output "icon: $(Test-Path $iconPath) ($([string]::Join(', ', $sizes)) px)"
Write-Output "preview: $(Test-Path $previewPath)"
