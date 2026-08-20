$ErrorActionPreference = 'Stop'

# ======================================================================
#  Обновление встроенного резерва после перегенерации employees.json
#  Заменяет только блоки MR_USERS и MR_PEOPLE данными из тех же
#  фрагментов, что и JSON. Больше ничего не трогает.
# ======================================================================

$dir  = 'C:\Users\Madina.Abduzhabarova\Desktop\данные для базы'
$path = Join-Path $dir 'Признание заслуг.html'
$frag = Join-Path $env:TEMP 'mr-dir'
foreach ($f in @($path, (Join-Path $frag 'MR_USERS.txt'), (Join-Path $frag 'MR_PEOPLE.txt'))) {
    if (-not (Test-Path -LiteralPath $f)) { throw "Не найден файл: $f" }
}

$n = 1
while (Test-Path -LiteralPath (Join-Path $dir ("PREV{0}.html" -f $n))) { $n++ }
$prev = Join-Path $dir ("PREV{0}.html" -f $n)
Copy-Item -LiteralPath $path -Destination $prev
Write-Host ("Резервная копия -> {0}" -f $prev)

$sizeBefore = (Get-Item -LiteralPath $path).Length
$text = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

function RepRange {
    param([string]$Name, [string]$Start, [string]$End, [string]$New)
    $i = $script:text.IndexOf($Start)
    if ($i -lt 0) { throw ("Якорь '{0}': начало не найдено." -f $Name) }
    if ($script:text.IndexOf($Start, $i + 1) -ge 0) { throw ("Якорь '{0}': начало не уникально." -f $Name) }
    $j = $script:text.IndexOf($End, $i)
    if ($j -lt 0) { throw ("Якорь '{0}': конец не найден." -f $Name) }
    $j += $End.Length
    $old = $script:text.Substring($i, $j - $i)
    $script:text = $script:text.Substring(0, $i) + $New + $script:text.Substring($j)
    Write-Host ("  OK  {0} — {1} -> {2} символов" -f $Name, $old.Length, $New.Length)
}

$newUsers  = [System.IO.File]::ReadAllText((Join-Path $frag 'MR_USERS.txt'),  [System.Text.Encoding]::UTF8)
$newPeople = [System.IO.File]::ReadAllText((Join-Path $frag 'MR_PEOPLE.txt'), [System.Text.Encoding]::UTF8)
RepRange 'MR_USERS'  'var MR_USERS = ['  "`n];" $newUsers
RepRange 'MR_PEOPLE' 'var MR_PEOPLE = [' "`n];" $newPeople

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($path, $text, $utf8NoBom)
$sizeAfter = (Get-Item -LiteralPath $path).Length

Write-Host ''
Write-Host 'Готово. Проверки:'
Write-Host ('  учёток в резерве : {0}' -f ([regex]::Matches($text, 'login: "CORP\.NB\.RK')).Count)
Write-Host ('  людей в резерве  : {0}' -f ([regex]::Matches($text, '\{ tnumber: "T\d+", fio:')).Count)
Write-Host ('  роль head        : {0}' -f ([regex]::Matches($text, 'role: "head"')).Count)
Write-Host ('  размер: {0:N0} -> {1:N0} байт' -f $sizeBefore, $sizeAfter)
