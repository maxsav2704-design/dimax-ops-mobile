param()

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

Add-Type -AssemblyName System.Drawing

$MobileRoot = Split-Path -Parent $PSScriptRoot
$BrandAssetDir = Join-Path $MobileRoot "assets\brand"
$AndroidResDir = Join-Path $MobileRoot "android\app\src\main\res"
$SoraFontPath = Join-Path $MobileRoot "node_modules\@expo-google-fonts\sora\800ExtraBold\Sora_800ExtraBold.ttf"
$ManropeFontPath = Join-Path $MobileRoot "node_modules\@expo-google-fonts\manrope\700Bold\Manrope_700Bold.ttf"

$Background = [System.Drawing.Color]::FromArgb(255, 8, 14, 21)
$BackgroundRaised = [System.Drawing.Color]::FromArgb(255, 18, 28, 40)
$Gold = [System.Drawing.Color]::FromArgb(255, 228, 178, 78)
$GoldDeep = [System.Drawing.Color]::FromArgb(255, 177, 125, 38)
$White = [System.Drawing.Color]::FromArgb(255, 245, 247, 250)
$Muted = [System.Drawing.Color]::FromArgb(255, 130, 144, 163)

New-Item -ItemType Directory -Force -Path $BrandAssetDir | Out-Null

function New-RoundedRectanglePath {
    param(
        [Parameter(Mandatory = $true)][System.Drawing.RectangleF]$Bounds,
        [Parameter(Mandatory = $true)][float]$Radius
    )

    $diameter = $Radius * 2
    $path = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $path.AddArc($Bounds.Left, $Bounds.Top, $diameter, $diameter, 180, 90)
    $path.AddArc($Bounds.Right - $diameter, $Bounds.Top, $diameter, $diameter, 270, 90)
    $path.AddArc($Bounds.Right - $diameter, $Bounds.Bottom - $diameter, $diameter, $diameter, 0, 90)
    $path.AddArc($Bounds.Left, $Bounds.Bottom - $diameter, $diameter, $diameter, 90, 90)
    $path.CloseFigure()
    return $path
}

function New-Canvas {
    param(
        [Parameter(Mandatory = $true)][int]$Size,
        [Parameter(Mandatory = $true)][bool]$Transparent
    )

    $bitmap = [System.Drawing.Bitmap]::new(
        $Size,
        $Size,
        [System.Drawing.Imaging.PixelFormat]::Format32bppArgb
    )
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
    $graphics.Clear($(if ($Transparent) { [System.Drawing.Color]::Transparent } else { $Background }))
    return @{ Bitmap = $bitmap; Graphics = $graphics }
}

function Draw-DimaxMark {
    param(
        [Parameter(Mandatory = $true)][System.Drawing.Graphics]$Graphics,
        [Parameter(Mandatory = $true)][System.Drawing.RectangleF]$Bounds
    )

    $x = $Bounds.X
    $y = $Bounds.Y
    $w = $Bounds.Width
    $h = $Bounds.Height

    $outer = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $outer.StartFigure()
    $outer.AddLine($x + 0.21 * $w, $y + 0.12 * $h, $x + 0.47 * $w, $y + 0.12 * $h)
    $outer.AddBezier(
        $x + 0.47 * $w, $y + 0.12 * $h,
        $x + 0.70 * $w, $y + 0.12 * $h,
        $x + 0.82 * $w, $y + 0.27 * $h,
        $x + 0.82 * $w, $y + 0.50 * $h
    )
    $outer.AddBezier(
        $x + 0.82 * $w, $y + 0.50 * $h,
        $x + 0.82 * $w, $y + 0.73 * $h,
        $x + 0.70 * $w, $y + 0.88 * $h,
        $x + 0.47 * $w, $y + 0.88 * $h
    )
    $outer.AddLine($x + 0.47 * $w, $y + 0.88 * $h, $x + 0.21 * $w, $y + 0.88 * $h)
    $outer.CloseFigure()

    $markGradient = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
        $Bounds,
        $Gold,
        $GoldDeep,
        42.0
    )
    $pen = [System.Drawing.Pen]::new($markGradient, [Math]::Max(2, 0.055 * $w))
    $pen.LineJoin = [System.Drawing.Drawing2D.LineJoin]::Round
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $Graphics.DrawPath($pen, $outer)

    $inner = [System.Drawing.Drawing2D.GraphicsPath]::new()
    $inner.StartFigure()
    $inner.AddLine($x + 0.39 * $w, $y + 0.31 * $h, $x + 0.48 * $w, $y + 0.31 * $h)
    $inner.AddBezier(
        $x + 0.48 * $w, $y + 0.31 * $h,
        $x + 0.60 * $w, $y + 0.31 * $h,
        $x + 0.66 * $w, $y + 0.38 * $h,
        $x + 0.66 * $w, $y + 0.50 * $h
    )
    $inner.AddBezier(
        $x + 0.66 * $w, $y + 0.50 * $h,
        $x + 0.66 * $w, $y + 0.62 * $h,
        $x + 0.60 * $w, $y + 0.69 * $h,
        $x + 0.48 * $w, $y + 0.69 * $h
    )
    $inner.AddLine($x + 0.48 * $w, $y + 0.69 * $h, $x + 0.39 * $w, $y + 0.69 * $h)
    $inner.CloseFigure()
    $innerBrush = [System.Drawing.SolidBrush]::new([System.Drawing.Color]::FromArgb(150, $Gold))
    $Graphics.FillPath($innerBrush, $inner)

    $innerBrush.Dispose()
    $inner.Dispose()
    $pen.Dispose()
    $markGradient.Dispose()
    $outer.Dispose()
}

function Draw-LauncherIcon {
    param(
        [Parameter(Mandatory = $true)][int]$Size,
        [Parameter(Mandatory = $true)][string]$OutputPath,
        [switch]$Round,
        [switch]$Transparent
    )

    $canvas = New-Canvas -Size $Size -Transparent:$Transparent
    $bitmap = $canvas.Bitmap
    $graphics = $canvas.Graphics
    try {
        $outerBounds = [System.Drawing.RectangleF]::new(0, 0, $Size, $Size)
        $backgroundGradient = [System.Drawing.Drawing2D.LinearGradientBrush]::new(
            $outerBounds,
            $BackgroundRaised,
            $Background,
            125.0
        )
        if ($Round) {
            $graphics.FillEllipse($backgroundGradient, $outerBounds)
        }
        elseif (-not $Transparent) {
            $radius = [float](0.18 * $Size)
            $rounded = New-RoundedRectanglePath -Bounds $outerBounds -Radius $radius
            $graphics.FillPath($backgroundGradient, $rounded)
            $rounded.Dispose()
        }

        $markSize = if ($Transparent) { 0.50 * $Size } else { 0.64 * $Size }
        $markBounds = [System.Drawing.RectangleF]::new(
            [float](($Size - $markSize) / 2),
            [float](($Size - $markSize) / 2),
            [float]$markSize,
            [float]$markSize
        )
        Draw-DimaxMark -Graphics $graphics -Bounds $markBounds
        $backgroundGradient.Dispose()

        $directory = Split-Path -Parent $OutputPath
        New-Item -ItemType Directory -Force -Path $directory | Out-Null
        $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)
    }
    finally {
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

function Get-BrandFontFamilies {
    $collection = [System.Drawing.Text.PrivateFontCollection]::new()
    if (Test-Path -LiteralPath $SoraFontPath) {
        $collection.AddFontFile($SoraFontPath)
    }
    if (Test-Path -LiteralPath $ManropeFontPath) {
        $collection.AddFontFile($ManropeFontPath)
    }
    return $collection
}

function Draw-SplashLogo {
    param(
        [Parameter(Mandatory = $true)][int]$Size,
        [Parameter(Mandatory = $true)][string]$OutputPath
    )

    $canvas = New-Canvas -Size $Size -Transparent $true
    $bitmap = $canvas.Bitmap
    $graphics = $canvas.Graphics
    $fontCollection = Get-BrandFontFamilies
    try {
        $contentWidth = 0.64 * $Size
        $markSize = 0.22 * $Size
        $contentX = ($Size - $contentWidth) / 2
        $markX = $contentX
        $markY = ($Size - $markSize) / 2
        Draw-DimaxMark -Graphics $graphics -Bounds ([System.Drawing.RectangleF]::new($markX, $markY, $markSize, $markSize))

        $textX = $markX + $markSize + 0.035 * $Size
        $textWidth = $contentX + $contentWidth - $textX
        $families = @($fontCollection.Families)
        $displayFamily = if ($families.Count -gt 0) { $families[0] } else { [System.Drawing.FontFamily]::GenericSansSerif }
        $bodyFamily = if ($families.Count -gt 1) { $families[1] } else { $displayFamily }
        $titleFont = [System.Drawing.Font]::new($displayFamily, [float](0.085 * $Size), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
        $metaFont = [System.Drawing.Font]::new($bodyFamily, [float](0.027 * $Size), [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
        $titleBrush = [System.Drawing.SolidBrush]::new($White)
        $metaBrush = [System.Drawing.SolidBrush]::new($Muted)
        $graphics.DrawString("DIMAX", $titleFont, $titleBrush, [System.Drawing.RectangleF]::new($textX, $markY + 0.02 * $Size, $textWidth, 0.11 * $Size))
        $graphics.DrawString("INSTALLER", $metaFont, $metaBrush, [System.Drawing.RectangleF]::new($textX, $markY + 0.125 * $Size, $textWidth, 0.05 * $Size))

        $directory = Split-Path -Parent $OutputPath
        New-Item -ItemType Directory -Force -Path $directory | Out-Null
        $bitmap.Save($OutputPath, [System.Drawing.Imaging.ImageFormat]::Png)

        $metaBrush.Dispose()
        $titleBrush.Dispose()
        $metaFont.Dispose()
        $titleFont.Dispose()
    }
    finally {
        $fontCollection.Dispose()
        $graphics.Dispose()
        $bitmap.Dispose()
    }
}

Draw-LauncherIcon -Size 1024 -OutputPath (Join-Path $BrandAssetDir "icon.png")
Draw-LauncherIcon -Size 1024 -OutputPath (Join-Path $BrandAssetDir "adaptive-icon.png") -Transparent
Draw-SplashLogo -Size 1152 -OutputPath (Join-Path $BrandAssetDir "splash.png")

$launcherSizes = [ordered]@{
    "mdpi" = 48
    "hdpi" = 72
    "xhdpi" = 96
    "xxhdpi" = 144
    "xxxhdpi" = 192
}
foreach ($density in $launcherSizes.Keys) {
    $directory = Join-Path $AndroidResDir "mipmap-$density"
    Draw-LauncherIcon -Size $launcherSizes[$density] -OutputPath (Join-Path $directory "ic_launcher.webp")
    Draw-LauncherIcon -Size $launcherSizes[$density] -OutputPath (Join-Path $directory "ic_launcher_round.webp") -Round
}

$splashSizes = [ordered]@{
    "mdpi" = 288
    "hdpi" = 432
    "xhdpi" = 576
    "xxhdpi" = 864
    "xxxhdpi" = 1152
}
foreach ($density in $splashSizes.Keys) {
    $directory = Join-Path $AndroidResDir "drawable-$density"
    Draw-SplashLogo -Size $splashSizes[$density] -OutputPath (Join-Path $directory "splashscreen_logo.png")
}

Write-Host "DIMAX launcher and splash assets generated."
