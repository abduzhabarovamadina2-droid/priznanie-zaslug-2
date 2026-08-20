$ErrorActionPreference = 'Stop'

# ======================================================================
#  Встроенный резерв <- тот же источник, что и employees.json
#  1) MR_USERS и MR_PEOPLE заменяются данными, сгенерированными из
#     Сотрудники.xlsx (фрагменты лежат во временной папке, скрипт читает
#     их с диска — руками сюда ничего не вставляется).
#  2) Частичный откат убран: если в JSON нет users, откатываемся целиком,
#     а не «люди новые, учётки старые».
#  3) При работе на резерве внизу появляется плашка «демо-данные».
#  4) Фото Камилы Баденовой удаляется — её нет ни в одной версии Excel.
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

function Rep {
    param([string]$Name, [string]$Old, [string]$New, [int]$Expected)
    $count = ([regex]::Matches($script:text, [regex]::Escape($Old))).Count
    if ($count -ne $Expected) {
        throw ("Якорь '{0}': найдено {1}, ожидалось {2}. Правка отменена." -f $Name, $count, $Expected)
    }
    $script:text = $script:text.Replace($Old, $New)
    Write-Host ("  OK  {0} — заменено {1}" -f $Name, $count)
}

function RepRange {
    param([string]$Name, [string]$Start, [string]$End, [string]$New)
    $i = $script:text.IndexOf($Start)
    if ($i -lt 0) { throw ("Якорь '{0}': начало не найдено. Правка отменена." -f $Name) }
    if ($script:text.IndexOf($Start, $i + 1) -ge 0) {
        throw ("Якорь '{0}': начало встречается более одного раза. Правка отменена." -f $Name)
    }
    $j = $script:text.IndexOf($End, $i)
    if ($j -lt 0) { throw ("Якорь '{0}': конец не найден. Правка отменена." -f $Name) }
    $j += $End.Length
    $old = $script:text.Substring($i, $j - $i)
    $script:text = $script:text.Substring(0, $i) + $New + $script:text.Substring($j)
    Write-Host ("  OK  {0} — {1} -> {2} символов" -f $Name, $old.Length, $New.Length)
}

function RepRegex {
    param([string]$Name, [string]$Pattern, [string]$New, [int]$Expected)
    $count = ([regex]::Matches($script:text, $Pattern)).Count
    if ($count -ne $Expected) {
        throw ("Якорь '{0}': найдено {1}, ожидалось {2}. Правка отменена." -f $Name, $count, $Expected)
    }
    $script:text = [regex]::Replace($script:text, $Pattern, $New)
    Write-Host ("  OK  {0} — заменено {1}" -f $Name, $count)
}

# ---------- 1. резерв из того же источника ----------
$newUsers  = [System.IO.File]::ReadAllText((Join-Path $frag 'MR_USERS.txt'),  [System.Text.Encoding]::UTF8)
$newPeople = [System.IO.File]::ReadAllText((Join-Path $frag 'MR_PEOPLE.txt'), [System.Text.Encoding]::UTF8)
RepRange 'MR_USERS  <- Сотрудники.xlsx' 'var MR_USERS = ['  "`n];" $newUsers
RepRange 'MR_PEOPLE <- Сотрудники.xlsx' 'var MR_PEOPLE = [' "`n];" $newPeople

# ---------- 2. никакого частичного отката ----------
Rep 'MR_applyDir: users обязателен' `
    ("var nu=MR_USERS.length;`nif(Array.isArray(U)&&U.length){MR_USERS.length=0;U.forEach(function(u){MR_USERS.push(u)});nu=U.length}") `
    ("if(!Array.isArray(U)||!U.length)throw new Error(""no users"");`nMR_USERS.length=0;U.forEach(function(u){MR_USERS.push(u)});`nvar nu=U.length;") `
    1

# ---------- 3. видимая плашка при работе на резерве ----------
Rep 'go(): флаг демо-режима' `
    'var done=!1,go=function(m){if(done)return;done=!0;console.log(m);MR_mount()};' `
    'var done=!1,go=function(m,demo){if(done)return;done=!0;console.log(m);MR_mount();if(demo)MR_demoBanner()};' `
    1

Rep 'вызовы отката -> демо-режим' 'go("встроенные данные")' 'go("встроенные данные",1)' 3

$banner = @(
 '/* плашка: показывается, только когда справочник не загрузился */'
 'function MR_demoBanner(){'
 '  try{'
 '    var b=document.createElement("div");'
 '    b.className="mr-demo-banner";'
 '    b.innerHTML="<b>Демо-данные.</b> Справочник employees.json не загружен — показаны встроенные примеры, а не рабочие сотрудники.";'
 '    document.body.appendChild(b);'
 '  }catch(e){}'
 '}'
 'function MR_mount(){'
) -join "`n"
Rep 'MR_demoBanner' 'function MR_mount(){' $banner 1

$css = @(
 '.mr-ava,.mr-win-ava,.mr-bd-ava{position:relative;overflow:hidden}'
 '.mr-demo-banner{position:fixed;left:0;right:0;bottom:0;z-index:9999;'
 '  padding:9px 16px;text-align:center;font-size:12.5px;line-height:1.45;'
 '  color:var(--warn-text);background:var(--surface);'
 '  border-top:2px solid var(--warn);box-shadow:var(--shadow)}'
 '.mr-demo-banner b{font-weight:800;color:var(--warn)}'
) -join "`n"
Rep 'CSS плашки' '.mr-ava,.mr-win-ava,.mr-bd-ava{position:relative;overflow:hidden}' $css 1

# ---------- 4. фото Камилы Баденовой ----------
RepRegex 'MR_PHOTOS: убрать Камилу Баденову' `
    ',\s*"Камила Баденова":\s*"data:image/jpeg;base64,[A-Za-z0-9+/=]+"' `
    '' `
    1

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($path, $text, $utf8NoBom)
$sizeAfter = (Get-Item -LiteralPath $path).Length

Write-Host ''
Write-Host 'Готово. Проверки:'
Write-Host ('  учёток в резерве      : {0}' -f ([regex]::Matches($text, [regex]::Escape('CORP.NB.RK'))).Count)
Write-Host ('  старых логинов осталось: {0}' -f ([regex]::Matches($text, '"(isakulova|badenova|suleimenova|admin)"')).Count)
Write-Host ('  Камила в MR_PHOTOS     : {0}' -f ([regex]::Matches($text, '"Камила Баденова":\s*"data:')).Count)
Write-Host ('  MR_demoBanner          : {0}' -f ([regex]::Matches($text, [regex]::Escape('MR_demoBanner'))).Count)
Write-Host ('  no users -> throw       : {0}' -f ([regex]::Matches($text, [regex]::Escape('throw new Error("no users")'))).Count)
Write-Host ('  размер: {0:N0} КБ -> {1:N0} КБ ({2:+#,##0;-#,##0;0} КБ)' -f ($sizeBefore/1KB), ($sizeAfter/1KB), (($sizeAfter-$sizeBefore)/1KB))
