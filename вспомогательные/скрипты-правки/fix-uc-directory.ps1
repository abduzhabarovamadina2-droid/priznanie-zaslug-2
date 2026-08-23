$ErrorActionPreference = 'Stop'

# ======================================================================
#  Справочник получателей благодарности (uc) — тоже из employees.json
#  uc строится из того же массива people: {f,n,o} разбором ФИО, d = dept.
#  Отдельного блока в JSON нет намеренно — иначе те же 25 человек лежали
#  бы в файле дважды и разъезжались.
#  Заодно пересобирается MR_BIRTHDAYS: это снимок uc.slice(0,5), снятый
#  на этапе инициализации, то есть ДО загрузки JSON.
#  MR_deptList() трогать не нужно — она читает uc лениво, при вызове.
# ======================================================================

$dir  = 'C:\Users\Madina.Abduzhabarova\Desktop\данные для базы'
$path = Join-Path $dir 'Признание заслуг.html'

if (-not (Test-Path -LiteralPath $path)) { throw "Не найден файл: $path" }

$n = 1
while (Test-Path -LiteralPath (Join-Path $dir ("PREV{0}.html" -f $n))) { $n++ }
$prev = Join-Path $dir ("PREV{0}.html" -f $n)
Copy-Item -LiteralPath $path -Destination $prev
Write-Host ("Резервная копия -> {0}" -f $prev)

$text = [System.IO.File]::ReadAllText($path, [System.Text.Encoding]::UTF8)

function Rep {
    param([string]$Name, [string]$Old, [string]$New, [int]$Expected)
    $count = ([regex]::Matches($script:text, [regex]::Escape($Old))).Count
    if ($count -ne $Expected) {
        throw ("Якорь '{0}': найдено {1}, ожидалось {2}. Правка отменена, файл не изменён." -f $Name, $count, $Expected)
    }
    $script:text = $script:text.Replace($Old, $New)
    Write-Host ("  OK  {0} — заменено {1}" -f $Name, $count)
}

$old = 'P.forEach(function(p){MR_PEOPLE.push({fio:p.fio,post:p.post,branch:p.branch,dep:p.dep,dept:p.dept,n:p.n||0})});'

$new = @'
P.forEach(function(p){MR_PEOPLE.push({fio:p.fio,post:p.post,branch:p.branch,dep:p.dep,dept:p.dept,n:p.n||0})});
uc.length=0;
P.forEach(function(p){var t=String(p.fio||"").split(" ").filter(Boolean);uc.push({f:t[0]||"",n:t[1]||"",o:t.slice(2).join(" "),d:p.dept||""})});
MR_BIRTHDAYS.length=0;
uc.slice(0,5).forEach(function(e,i){MR_BIRTHDAYS.push({fio:(e.f+" "+e.n+" "+e.o).replace(/\s+/g," ").trim(),dept:e.d,key:"bd"+i})});
'@

Rep 'MR_applyDir: uc + MR_BIRTHDAYS из people' $old $new 1

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($path, $text, $utf8NoBom)

Write-Host ''
Write-Host 'Готово. Проверки:'
Write-Host ('  uc.length=0            : {0}' -f ([regex]::Matches($text, [regex]::Escape('uc.length=0'))).Count)
Write-Host ('  MR_BIRTHDAYS.length=0  : {0}' -f ([regex]::Matches($text, [regex]::Escape('MR_BIRTHDAYS.length=0'))).Count)
Write-Host ('  MR_PEOPLE.length=0     : {0}' -f ([regex]::Matches($text, [regex]::Escape('MR_PEOPLE.length=0'))).Count)
Write-Host ('  MR_USERS.length=0      : {0}' -f ([regex]::Matches($text, [regex]::Escape('MR_USERS.length=0'))).Count)
Write-Host ('  var uc=[ (встроенный)  : {0}' -f ([regex]::Matches($text, [regex]::Escape('var uc=['))).Count)
