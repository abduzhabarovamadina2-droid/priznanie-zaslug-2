$ErrorActionPreference = 'Stop'

# ======================================================================
#  Личный кабинет -> данные авторизованного пользователя
#  Якорные замены по минифицированному бандлу. Если хотя бы один якорь
#  не найден (или найден не в ожидаемом количестве) — скрипт падает
#  целиком и файл не перезаписывается.
# ======================================================================

$dir  = 'C:\Users\Madina.Abduzhabarova\Desktop\данные для базы'
$path = Join-Path $dir 'Признание заслуг.html'

if (-not (Test-Path -LiteralPath $path)) { throw "Не найден файл: $path" }

# ---------- резервная копия PREVn.html ----------
$n = 1
while (Test-Path -LiteralPath (Join-Path $dir ("PREV{0}.html" -f $n))) { $n++ }
$prev = Join-Path $dir ("PREV{0}.html" -f $n)
Copy-Item -LiteralPath $path -Destination $prev
Write-Host ("Резервная копия -> {0}" -f $prev)

# ---------- читаем как UTF-8 ----------
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

# ---------- 1. сигнатура + профиль слиянием + счётчик баллов ----------
# Object.assign({}, bt, {...}) — реальные поля из MRu, остальное из bt-заглушки.
# u = t вместо p1(...): rAF-счётчик замирает в фоновой вкладке и показывает 0.
Rep 'Fh: сигнатура, bt2, счётчик' `
    'function Fh({points:t}){let l=(0,N.useRef)(null),a=dg(l),[e,n]=(0,N.useState)(0),u=p1(t,a,{duration:900}),' `
    'function Fh({points:t,user:MRu}){let bt2=MRu?Object.assign({},bt,{fio:MRu.fio,short:MRu.short,role:MRu.post,dept:MRu.dept}):bt;let l=(0,N.useRef)(null),a=dg(l),[e,n]=(0,N.useState)(0),u=t,' `
    1

# ---------- 2. bt. -> bt2. ----------
# Все 16 обращений 'bt.' находятся внутри Fh (массивы s и A + карточка .lk-profile);
# за пределами функции их в файле нет, поэтому замена безопасна.
# Строка объявления из шага 1 содержит 'bt,' и ':bt;' — без точки, её это не заденет.
Rep 'Fh: bt. -> bt2.' 'bt.' 'bt2.' 16

# ---------- 3. место вызова: передаём пользователя ----------
Rep 'vg: вызов Fh' `
    't==="lk"&&(0,c.jsx)(Fh,{points:h})' `
    't==="lk"&&(0,c.jsx)(Fh,{points:h,user:MRuser})' `
    1

# ---------- пишем обратно UTF-8 БЕЗ BOM (как в оригинале) ----------
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($path, $text, $utf8NoBom)

Write-Host ''
Write-Host 'Готово. Проверки:'
Write-Host ('  function Fh({{points:t,user:MRu}}) : {0}' -f ([regex]::Matches($text, [regex]::Escape('function Fh({points:t,user:MRu})'))).Count)
Write-Host ('  bt2.                              : {0}' -f ([regex]::Matches($text, [regex]::Escape('bt2.'))).Count)
Write-Host ('  осталось bt.                      : {0}' -f ([regex]::Matches($text, [regex]::Escape('bt.'))).Count)
Write-Host ('  вызов с user:MRuser               : {0}' -f ([regex]::Matches($text, [regex]::Escape('(0,c.jsx)(Fh,{points:h,user:MRuser})'))).Count)
