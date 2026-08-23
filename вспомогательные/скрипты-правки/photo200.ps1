$ErrorActionPreference = 'Stop'

# Конвертация новых снимков: центральный квадрат -> 200x200 -> JPEG q82.
# Имя файла приводится к ключу словаря MR_PHOTOS: «Имя Фамилия».
# ВНИМАНИЕ: PowerShell не различает регистр имён переменных, поэтому
# целевая сторона — $TARGET, сторона вырезаемого квадрата — $cutSide.

$dir   = 'C:\Users\Madina.Abduzhabarova\Desktop\данные для базы'
$src   = Join-Path $dir 'фото'
$out   = Join-Path $dir 'фото-200'
if (-not (Test-Path -LiteralPath $out)) { New-Item -ItemType Directory -Path $out | Out-Null }

Add-Type -AssemblyName System.Drawing
$jpeg = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq 'image/jpeg' }
function Get-EncParams([int]$q) {
    $ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [int64]$q)
    return $ep
}
function Get-Key([string]$name) {
    $w = $name -split '\s+' | Where-Object { $_ }
    if ($w.Count -ge 3) { return ($w[1] + ' ' + $w[0]) }
    return ($w -join ' ')
}

$TARGET = 200
$LIMIT  = 25KB
$QUALITIES = 82, 78, 74, 70, 66, 62

foreach ($f in (Get-ChildItem -LiteralPath $src -Include *.png,*.jpg,*.jpeg -File -Recurse:$false -ErrorAction SilentlyContinue |
                Sort-Object Name)) {
    $key = Get-Key $f.BaseName
    $dst = Join-Path $out ($key + '.jpg')
    if (Test-Path -LiteralPath $dst) { Write-Host ('  пропуск (уже есть): {0}' -f $key); continue }

    $img = [System.Drawing.Image]::FromFile($f.FullName)
    try {
        $cutSide = [Math]::Min($img.Width, $img.Height)
        $sx = [int](($img.Width  - $cutSide) / 2)
        $sy = [int](($img.Height - $cutSide) / 2)
        $bmp = New-Object System.Drawing.Bitmap($TARGET, $TARGET)
        $g = [System.Drawing.Graphics]::FromImage($bmp)
        try {
            $g.Clear([System.Drawing.Color]::White)
            $g.InterpolationMode  = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
            $g.PixelOffsetMode    = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
            $g.SmoothingMode      = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
            $g.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
            $g.DrawImage($img,
                (New-Object System.Drawing.Rectangle(0, 0, $TARGET, $TARGET)),
                (New-Object System.Drawing.Rectangle($sx, $sy, $cutSide, $cutSide)),
                [System.Drawing.GraphicsUnit]::Pixel)
        } finally { $g.Dispose() }
        $usedQ = 0
        foreach ($q in $QUALITIES) {
            $bmp.Save($dst, $jpeg, (Get-EncParams $q))
            $usedQ = $q
            if ((Get-Item -LiteralPath $dst).Length -le $LIMIT) { break }
        }
        $bmp.Dispose()
    } finally { $img.Dispose() }

    $sz = (Get-Item -LiteralPath $dst).Length
    Write-Host ('  СОЗДАН  {0,-24} <- {1,-34} {2,6:N1} КБ (q{3}), исходник {4:N0} КБ' -f $key, $f.BaseName, ($sz/1KB), $usedQ, ($f.Length/1KB))
    if ($sz -gt $LIMIT) { throw ("'{0}' весит {1:N1} КБ при лимите 25 КБ." -f $key, ($sz/1KB)) }
}
Write-Host 'Готово.'
