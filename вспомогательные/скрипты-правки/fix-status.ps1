$ErrorActionPreference = 'Stop'

# ======================================================================
#  ПУНКТ 2: пять статусов вместо шести
#    pending        -> WAIT            «В ожидании»
#    sent           -> DONE            «Исполнено»          (только он в рейтинг)
#    withdrawn      -> CANCEL          «Отменено»
#    cancelled      -> REJECTED        «Отклонено»
#    rejected_admin -> REJECTED_ADMIN  «Отклонено администратором»  (новый)
#  draft и revision убраны из карты статусов, из плиток и из кнопок.
#  Внутренние ключи оставлены прежними намеренно: их знает код за
#  пределами разрешённых границ. Боевой код лежит рядом, в поле code,
#  и сравнение в рейтинге идёт именно по нему.
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

# ---------- 1. карта статусов ----------
Rep 'ts: пять статусов' `
    'ts={pending:{label:"В ожидании",cls:"rev"},draft:{label:"Черновик",cls:"rev"},withdrawn:{label:"Отозвано",cls:"info"},revision:{label:"На доработке",cls:"rev"},sent:{label:"Отправлено",cls:"ok"},cancelled:{label:"Отменено",cls:"bad"}}' `
    'ts={pending:{label:"В ожидании",cls:"rev",code:"WAIT"},sent:{label:"Исполнено",cls:"ok",code:"DONE"},withdrawn:{label:"Отменено",cls:"info",code:"CANCEL"},cancelled:{label:"Отклонено",cls:"bad",code:"REJECTED"},rejected_admin:{label:"Отклонено администратором",cls:"bad",code:"REJECTED_ADMIN"}}' `
    1

# ---------- 2. плитки-папки над таблицей «Заслуг» ----------
Rep 'плитки: Черновик -> Отклонено' `
    '{key:"draft",label:"Черновик",icon:d1},{key:"cancelled",label:"Отменено",icon:v1},{key:"sent",label:"Отправлено",icon:m1}' `
    '{key:"rejected",label:"Отклонено",icon:d1},{key:"cancelled",label:"Отменено",icon:v1},{key:"sent",label:"Исполнено",icon:m1}' `
    1

Rep 'плитки: фильтр' `
    'S==="project"?R.status!=="cancelled":S==="draft"?(R.status==="draft"||R.status==="withdrawn"||R.status==="revision"):S==="sent"?R.status==="sent":S==="cancelled"?R.status==="cancelled":!1' `
    'S==="project"?(R.status!=="cancelled"&&R.status!=="rejected_admin"&&R.status!=="withdrawn"):S==="rejected"?(R.status==="cancelled"||R.status==="rejected_admin"):S==="sent"?R.status==="sent":S==="cancelled"?R.status==="withdrawn":!1' `
    1

Rep 'плитки: счётчики' `
    'sc={recognition:0,project:d("project").length,draft:d("draft").length,cancelled:d("cancelled").length,sent:d("sent").length}' `
    'sc={recognition:0,project:d("project").length,rejected:d("rejected").length,cancelled:d("cancelled").length,sent:d("sent").length}' `
    1

Rep 'плитки: пустая таблица' `
    'children:u==="draft"?"Черновиков нет.":u==="sent"?"Отправленных заявок нет.":u==="cancelled"?"Отменённых заявок нет.":"Нет заявок."' `
    'children:u==="rejected"?"Отклонённых заявок нет.":u==="sent"?"Исполненных заявок нет.":u==="cancelled"?"Отменённых заявок нет.":"Нет заявок."' `
    1

# ---------- 3. в рейтинг идёт только DONE ----------
Rep 'MR_board: только DONE' `
    'var sent = MR_buildReqs(records, ovr, del).filter(function (r) { return r.status === "sent"; });' `
    'var sent = MR_buildReqs(records, ovr, del).filter(function (r) { return (ts[r.status] || {}).code === "DONE"; });' `
    1

# ---------- 4. кнопки в карточке «Администрирования» ----------
Rep 'кнопка «Согласовать»: без revision' `
    '          MR_can(role, "moderate") && (t.status === "pending" || t.status === "revision") && (0, c.jsxs)("button", { className: "btn primary", onClick: function () { props.onApprove(t, cmt); }, children: [(0, c.jsx)(A1, { size: 15 }), "Согласовать"] }),' `
    '          MR_can(role, "moderate") && t.status === "pending" && (0, c.jsxs)("button", { className: "btn primary", onClick: function () { props.onApprove(t, cmt); }, children: [(0, c.jsx)(A1, { size: 15 }), "Согласовать"] }),' `
    1

# «На доработку» -> «Отклонить (администратор)»: второй уровень отклонения
Rep 'кнопка «На доработку» -> REJECTED_ADMIN' `
    '          MR_can(role, "moderate") && (t.status === "pending" || t.status === "revision") && (0, c.jsxs)("button", { className: "btn", onClick: function () { if (!cmt.trim()) { props.toast("Укажите примечание для возврата на доработку."); return; } props.onRevise(t, cmt); }, children: [(0, c.jsx)(a1, { size: 15 }), "На доработку"] }),' `
    '          MR_can(role, "remove") && t.status !== "rejected_admin" && (0, c.jsxs)("button", { className: "btn danger", onClick: function () { if (!cmt.trim()) { props.toast("Укажите причину отклонения администратором."); return; } props.onRejectAdmin(t, cmt); }, children: [(0, c.jsx)(a1, { size: 15 }), "Отклонить (администратор)"] }),' `
    1

Rep 'обработчик: onRevise -> onRejectAdmin' `
    '    onRevise: function (r, cm) { move(r, "revision", "Направлено на доработку", cm); }' `
    '    onRejectAdmin: function (r, cm) { move(r, "rejected_admin", "Отклонено администратором", cm); }' `
    1

Rep 'move: убрать примечание доработки' `
    '    patch(r, { status: status, note: status === "revision" ? (cmt || "") : (r.note || ""), history: hist(r, action, cmt) });' `
    '    patch(r, { status: status, note: cmt || r.note || "", history: hist(r, action, cmt) });' `
    1

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($path, $text, $utf8NoBom)
$sizeAfter = (Get-Item -LiteralPath $path).Length

Write-Host ''
Write-Host 'Готово. Проверки:'
foreach ($c in 'WAIT','DONE','CANCEL','REJECTED','REJECTED_ADMIN') {
    Write-Host ('  code {0,-15}: {1}' -f $c, ([regex]::Matches($text, ('code:"{0}"' -f $c))).Count)
}
Write-Host ('  draft в карте статусов  : {0}' -f ([regex]::Matches($text,[regex]::Escape('draft:{label:'))).Count)
Write-Host ('  revision в карте статусов: {0}' -f ([regex]::Matches($text,[regex]::Escape('revision:{label:'))).Count)
Write-Host ('  onRejectAdmin           : {0}' -f ([regex]::Matches($text,[regex]::Escape('onRejectAdmin'))).Count)
Write-Host ('  onRevise осталось       : {0}' -f ([regex]::Matches($text,[regex]::Escape('onRevise'))).Count)
Write-Host ('  рейтинг по code DONE    : {0}' -f ([regex]::Matches($text,[regex]::Escape('code === "DONE"'))).Count)
Write-Host ('  размер: {0:N0} -> {1:N0} байт' -f $sizeBefore, $sizeAfter)
