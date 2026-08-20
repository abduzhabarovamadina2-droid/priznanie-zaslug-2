$ErrorActionPreference = 'Stop'

# ======================================================================
#  Личный кабинет: профиль строго по справочнику
#  Было: недостающие поля подставлялись из константы bt — карточки
#  Исакуловой. Из-за этого у руководителя, модератора и администратора
#  показывались её дата рождения, телефоны, кабинет и, главное, её почта.
#  Стало: всё берётся из учётки и из строки справочника по табельному
#  номеру; чего в данных нет — «—». Появятся колонки в Excel — подхватятся
#  сами, править код второй раз не придётся.
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

# ---------- 1. профиль собирается из справочника, а не из bt ----------
Rep 'Fh: профиль из справочника' `
    'function Fh({points:t,user:MRu,records:MRrec,ovr:MRovr,del:MRdel}){let bt2=MRu?Object.assign({},bt,{fio:MRu.fio,short:MRu.short,role:MRu.post,dept:MRu.dept}):bt;' `
    'function Fh({points:t,user:MRu,records:MRrec,ovr:MRovr,del:MRdel}){let MRv=x=>(x===undefined||x===null||x==="")?"—":x;let MRp=(MRu&&(MR_PEOPLE.find(p=>MRu.tnumber&&p.tnumber===MRu.tnumber)||MR_PEOPLE.find(p=>p.fio===MRu.fio)))||{};let bt2=MRu?{fio:MRu.fio,short:MRu.short,role:MRu.post,dept:MRv(MRu.dept||MRp.dept),branch:MRv(MRp.dep||MRu.dep),chief:MRv(MRu.chief),birth:MRv(MRu.birth),phoneIn:MRv(MRu.phoneIn),phoneMob:MRv(MRu.phone||MRu.phoneMob),email:MRv(MRu.email),room:MRv(MRu.room)}:bt;' `
    1

# ---------- 2. маску и mailto не вешаем на «—» ----------
Rep 'Fh: поля без маски на пустых' `
    's=[["ФИО",bt2.fio],["День рождения",bt2.birth,"mask"],["Внутренний телефон",bt2.phoneIn],["Мобильный телефон",bt2.phoneMob,"mask"],["E-mail",bt2.email,"mail"]]' `
    's=[["ФИО",bt2.fio],["День рождения",bt2.birth,bt2.birth==="—"?"":"mask"],["Внутренний телефон",bt2.phoneIn],["Мобильный телефон",bt2.phoneMob,bt2.phoneMob==="—"?"":"mask"],["E-mail",bt2.email,bt2.email==="—"?"":"mail"]]' `
    1

# ---------- 3. подпись под именем: без чужой почты ----------
Rep 'Fh: мета под именем' `
    '(0,c.jsxs)("div",{className:"lk-meta",children:[(0,c.jsxs)("span",{children:[(0,c.jsx)(f1,{size:13}),bt2.birth]}),(0,c.jsxs)("a",{href:`mailto:${bt2.email}`,children:[(0,c.jsx)(o1,{size:13}),bt2.email]})]})' `
    '(0,c.jsxs)("div",{className:"lk-meta",children:[bt2.birth!=="—"&&(0,c.jsxs)("span",{children:[(0,c.jsx)(f1,{size:13}),bt2.birth]}),bt2.email!=="—"?(0,c.jsxs)("a",{href:`mailto:${bt2.email}`,children:[(0,c.jsx)(o1,{size:13}),bt2.email]}):(0,c.jsxs)("span",{children:[(0,c.jsx)(o1,{size:13}),"почта не указана"]})]})' `
    1

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($path, $text, $utf8NoBom)
$sizeAfter = (Get-Item -LiteralPath $path).Length

Write-Host ''
Write-Host 'Готово. Проверки:'
Write-Host ('  bt2 больше не наследует bt : {0}' -f ([regex]::Matches($text,[regex]::Escape('Object.assign({},bt,{fio:MRu.fio'))).Count)
Write-Host ('  подстановка «—»            : {0}' -f ([regex]::Matches($text,[regex]::Escape('let MRv=x=>'))).Count)
Write-Host ('  поиск строки справочника   : {0}' -f ([regex]::Matches($text,[regex]::Escape('MR_PEOPLE.find(p=>MRu.tnumber'))).Count)
Write-Host ('  условная маска             : {0}' -f ([regex]::Matches($text,[regex]::Escape('bt2.birth==="—"?""'))).Count)
Write-Host ('  почта не указана           : {0}' -f ([regex]::Matches($text,[regex]::Escape('почта не указана'))).Count)
Write-Host ('  размер: {0:N0} -> {1:N0} байт' -f $sizeBefore, $sizeAfter)
