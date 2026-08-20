$ErrorActionPreference = 'Stop'

# ======================================================================
#  ПУНКТ 1: ключ работника — табельный номер (tnumber)
#  Границы правки: MR_applyDir, MR_applyRating, MR_person, MR_board,
#  MR_photoKey. Больше ничего не трогаем.
#  Везде оставлен откат на ФИО, чтобы старые записи в localStorage и
#  файлы без tnumber продолжали работать.
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

# ---------- MR_applyDir: переносим tnumber в MR_PEOPLE ----------
# (MR_USERS кладётся целиком через push(u), поле попадает само)
Rep 'MR_applyDir: tnumber в MR_PEOPLE' `
    'P.forEach(function(p){MR_PEOPLE.push({fio:p.fio,post:p.post,branch:p.branch,dep:p.dep,dept:p.dept,n:p.n||0})});' `
    'P.forEach(function(p){MR_PEOPLE.push({tnumber:p.tnumber||"",fio:p.fio,post:p.post,branch:p.branch,dep:p.dep,dept:p.dept,n:p.n||0})});' `
    1

# ---------- MR_applyRating: ключ словаря — табельный номер ----------
Rep 'MR_applyRating: ключ tnumber' `
    ("    var fio = String(r[""ФИО работника""] || """").trim();`n    if (!fio) return;") `
    ("    var fio = String(r[""ФИО работника""] || """").trim();`n    /* ключ — табельный номер; ФИО остаётся подписью для вывода */`n    var tn = String(r.tnumber || """").trim() || fio;`n    if (!tn) return;") `
    1

Rep 'MR_applyRating: запись по tnumber' `
    '    m[fio] = e; k++;' `
    ("    e.fio = fio;`n    m[tn] = e; k++;") `
    1

# ---------- MR_person: рейтинг ищем по табельному номеру ----------
Rep 'MR_person: MR_RATING по tnumber' `
    '  var e = MR_RATING[p.fio], base, basePts;' `
    '  var e = (p.tnumber && MR_RATING[p.tnumber]) || MR_RATING[p.fio], base, basePts;' `
    1

# ---------- MR_board: заявки цепляем по табельному номеру ----------
Rep 'MR_board: ключ заявки' `
    '    (extra[r.emp] = extra[r.emp] || []).push({' `
    ("    var ekey = r.tnumber || r.emp;   /* заявки без tnumber цепляются по ФИО */`n    (extra[ekey] = extra[ekey] || []).push({") `
    1

Rep 'MR_board: сопоставление работника' `
    '  var list = MR_PEOPLE.map(function (p, i) { return MR_person(p, i, period, extra[p.fio]); });' `
    '  var list = MR_PEOPLE.map(function (p, i) { return MR_person(p, i, period, (p.tnumber && extra[p.tnumber]) || extra[p.fio]); });' `
    1

$oldUnknown = @(
 '  Object.keys(extra).forEach(function (fio) {'
 '    if (MR_PEOPLE.some(function (p) { return p.fio === fio; })) return;'
 '    var src = sent.find(function (r) { return r.emp === fio; }) || {};'
 '    list.push(MR_person({ fio: fio, post: src.post || "Работник НБРК", branch: src.branch || "Центральный аппарат", dep: "—", dept: src.dept || "—", n: 0 }, 99, period, extra[fio]));'
 '  });'
) -join "`n"
$newUnknown = @(
 '  Object.keys(extra).forEach(function (k) {'
 '    if (MR_PEOPLE.some(function (p) { return (p.tnumber && p.tnumber === k) || p.fio === k; })) return;'
 '    var src = sent.find(function (r) { return (r.tnumber || r.emp) === k; }) || {};'
 '    list.push(MR_person({ tnumber: src.tnumber || "", fio: src.emp || k, post: src.post || "Работник НБРК", branch: src.branch || "Центральный аппарат", dep: "—", dept: src.dept || "—", n: 0 }, 99, period, extra[k]));'
 '  });'
) -join "`n"
Rep 'MR_board: работник вне справочника' $oldUnknown $newUnknown 1

# ---------- MR_photoKey: резервный ключ по табельному номеру ----------
$oldKey = @(
 'function MR_photoKey(x) {'
 '  if (!x) return "";'
 '  var s = typeof x === "string" ? x : (x.short || x.fio || "");'
 '  var q = String(s).trim().split(/\s+/);'
 '  return q.length >= 3 ? q[1] + " " + q[0] : String(s).trim();'
 '}'
) -join "`n"
$newKey = @(
 'function MR_photoKey(x) {'
 '  if (!x) return "";'
 '  var s = typeof x === "string" ? x : (x.short || x.fio || "");'
 '  var q = String(s).trim().split(/\s+/);'
 '  var k = q.length >= 3 ? q[1] + " " + q[0] : String(s).trim();'
 '  /* резерв: имени в словаре нет, но есть снимок по табельному номеру */'
 '  if (typeof x === "object" && x.tnumber && MR_PHOTOS && !MR_PHOTOS[k] && MR_PHOTOS[x.tnumber]) return x.tnumber;'
 '  return k;'
 '}'
) -join "`n"
Rep 'MR_photoKey: резерв по tnumber' $oldKey $newKey 1

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($path, $text, $utf8NoBom)
$sizeAfter = (Get-Item -LiteralPath $path).Length

Write-Host ''
Write-Host 'Готово. Проверки:'
Write-Host ('  tnumber в MR_PEOPLE     : {0}' -f ([regex]::Matches($text,[regex]::Escape('tnumber:p.tnumber'))).Count)
Write-Host ('  MR_RATING по tnumber    : {0}' -f ([regex]::Matches($text,[regex]::Escape('MR_RATING[p.tnumber]'))).Count)
Write-Host ('  ключ заявки ekey        : {0}' -f ([regex]::Matches($text,[regex]::Escape('var ekey = r.tnumber'))).Count)
Write-Host ('  резерв фото по tnumber  : {0}' -f ([regex]::Matches($text,[regex]::Escape('MR_PHOTOS[x.tnumber]'))).Count)
Write-Host ('  осталось MR_RATING[p.fio] как единственный ключ: {0}' -f ([regex]::Matches($text,[regex]::Escape('var e = MR_RATING[p.fio]'))).Count)
Write-Host ('  размер: {0:N0} -> {1:N0} байт' -f $sizeBefore, $sizeAfter)
