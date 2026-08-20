$ErrorActionPreference = 'Stop'

# ======================================================================
#  Фотография руководителя в MR_PHOTOS
#  Ключ — «Анар Батырбаева», как отдаёт MR_photoKey и для short учётки,
#  и для полного ФИО из справочника. Запись ставится по алфавиту,
#  между «Айгерим Кайруллаева» и «Асель Сулейменова».
#  Base64 в скрипте не хранится — он читает файл с диска и кодирует сам.
# ======================================================================

$dir  = 'C:\Users\Madina.Abduzhabarova\Desktop\данные для базы'
$path = Join-Path $dir 'Признание заслуг.html'
$jpg  = Join-Path $dir 'фото-200\Анар Батырбаева.jpg'
foreach ($f in @($path, $jpg)) { if (-not (Test-Path -LiteralPath $f)) { throw "Не найден файл: $f" } }

$size = (Get-Item -LiteralPath $jpg).Length
if ($size -gt 25KB) { throw ("Снимок весит {0:N1} КБ при лимите 25 КБ." -f ($size/1KB)) }

$n = 1
while (Test-Path -LiteralPath (Join-Path $dir ("PREV{0}.html" -f $n))) { $n++ }
$prev = Join-Path $dir ("PREV{0}.html" -f $n)
Copy-Item -LiteralPath $path -Destination $prev
Write-Host ("Резервная копия -> {0}" -f $prev)

$sizeBefore = (Get-Item -LiteralPath $path).Length
$text = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

function Rep {
    param([string]$Name, [string]$Old, [string]$New, [int]$Expected)
    $count = ([regex]::Matches($script:text, [regex]::Escape($Old))).Count
    if ($count -ne $Expected) {
        throw ("Якорь '{0}': найдено {1}, ожидалось {2}. Правка отменена." -f $Name, $count, $Expected)
    }
    $script:text = $script:text.Replace($Old, $New)
    Write-Host ("  OK  {0} — заменено {1}" -f $Name, $count)
}

$b64 = [Convert]::ToBase64String([IO.File]::ReadAllBytes($jpg))
$anchor = '  "Асель Сулейменова": "data:image/jpeg;base64,'
$new    = '  "Анар Батырбаева": "data:image/jpeg;base64,' + $b64 + '",' + "`n" + $anchor

Rep 'MR_PHOTOS: снимок руководителя' $anchor $new 1

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($path, $text, $utf8NoBom)
$sizeAfter = (Get-Item -LiteralPath $path).Length

Write-Host ''
Write-Host 'Готово. Проверки:'
Write-Host ('  ключ «Анар Батырбаева» : {0}' -f ([regex]::Matches($text,[regex]::Escape('"Анар Батырбаева": "data:image/jpeg'))).Count)
Write-Host ('  всего снимков в словаре: {0}' -f ([regex]::Matches($text, '"[^"]+":\s*"data:image/jpeg;base64,')).Count)
Write-Host ('  снимок: {0:N1} КБ -> base64 {1:N1} КБ' -f ($size/1KB), ($b64.Length/1KB))
Write-Host ('  размер файла: {0:N0} -> {1:N0} байт (+{2:N0})' -f $sizeBefore, $sizeAfter, ($sizeAfter-$sizeBefore))
