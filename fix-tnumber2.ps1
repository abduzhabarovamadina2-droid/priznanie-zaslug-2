$ErrorActionPreference = 'Stop'

# ======================================================================
#  ПУНКТ 1, замыкание: табельный номер доходит до заявки
#  Цепочка: MR_applyDir (uc) -> MR_Send (создание) -> MR_reqBase (чтение).
#  Везде только ДОБАВЛЕНИЕ поля tnumber, ничего не удаляется и не
#  переименовывается. Подстановка инициатора в MR_reqBase не тронута.
# ======================================================================

$dir  = 'C:\Users\Madina.Abduzhabarova\Desktop\данные для базы'
$path = Join-Path $dir 'Признание заслуг.html'
if (-not (Test-Path -LiteralPath $path)) { throw "Не найден файл: $path" }

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

# ---------- 1. справочник выбора получателя несёт табельный номер ----------
# поле называем tn: имя t в этой строке уже занято массивом слов ФИО
Rep 'MR_applyDir: tnumber в uc' `
    'uc.push({f:t[0]||"",n:t[1]||"",o:t.slice(2).join(" "),d:p.dept||""})' `
    'uc.push({f:t[0]||"",n:t[1]||"",o:t.slice(2).join(" "),d:p.dept||"",tn:p.tnumber||""})' `
    1

# ---------- 2. новая заявка сохраняет табельный номер получателя ----------
Rep 'MR_Send: tnumber в заявку' `
    '      emp: t.f + " " + t.n + " " + t.o, dept: t.d,' `
    '      tnumber: t.tn || "", emp: t.f + " " + t.n + " " + t.o, dept: t.d,' `
    1

# ---------- 3. реестр прокидывает поле дальше, в MR_board ----------
Rep 'MR_reqBase: прокинуть tnumber' `
    '      emp: S.emp, post: S.post || "Работник НБРК", dept: S.dept,' `
    '      tnumber: S.tnumber || "", emp: S.emp, post: S.post || "Работник НБРК", dept: S.dept,' `
    1

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($path, $text, $utf8NoBom)
$sizeAfter = (Get-Item -LiteralPath $path).Length

Write-Host ''
Write-Host 'Готово. Проверки:'
Write-Host ('  uc несёт tn            : {0}' -f ([regex]::Matches($text,[regex]::Escape('tn:p.tnumber'))).Count)
Write-Host ('  заявка пишет tnumber   : {0}' -f ([regex]::Matches($text,[regex]::Escape('tnumber: t.tn'))).Count)
Write-Host ('  реестр читает tnumber  : {0}' -f ([regex]::Matches($text,[regex]::Escape('tnumber: S.tnumber'))).Count)
Write-Host ('  инициатор не тронут    : {0}' -f ([regex]::Matches($text,[regex]::Escape('initiator: S.initiator || MR_ME_SHORT'))).Count)
Write-Host ('  размер: {0:N0} -> {1:N0} байт' -f $sizeBefore, $sizeAfter)
