$ErrorActionPreference = 'Stop'

# ======================================================================
#  ЗАДАЧА 1: выгрузка/загрузка рабочего состояния (mr_state_v4) файлом
#  ЗАДАЧА 2: «Расположение в рейтинге» в ЛК -> MR_board
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

# ---------- 1. право на работу с состоянием ----------
Rep 'MR_can: действие state' `
    '    remove: ["admin"],' `
    ("    remove: [""admin""],`n    state: [""moderator"", ""admin""],") `
    1

# ---------- 2. функции состояния и мини-рейтинг ЛК ----------
$helpers = @(
 '/* ---------- рабочее состояние файлом ----------'
 '   localStorage живёт в одном браузере; эти функции переносят реестр'
 '   между машинами. Скачивание — тем же приёмом, что и экспорт .xlsx. */'
 'function MR_download(text, filename, mime) {'
 '  try {'
 '    var blob = new Blob([text], { type: mime || "application/json;charset=utf-8" });'
 '    var a = document.createElement("a");'
 '    a.href = URL.createObjectURL(blob); a.download = filename;'
 '    document.body.appendChild(a); a.click();'
 '    setTimeout(function () { URL.revokeObjectURL(a.href); a.remove(); }, 0);'
 '    return true;'
 '  } catch (err) { return false; }'
 '}'
 'function MR_stateExport() {'
 '  try {'
 '    var s = MR_boot();'
 '    var out = {};'
 '    Object.keys(s).forEach(function (k) { out[k] = s[k]; });'
 '    out.savedAt = new Date().toISOString();'
 '    return MR_download(JSON.stringify(out, null, 2), "state.json");'
 '  } catch (e) { return false; }'
 '}'
 '/* пустая строка = файл пригоден */'
 'function MR_stateValidate(j) {'
 '  if (!j || typeof j !== "object" || Array.isArray(j)) return "это не объект состояния";'
 '  var arr = function (v) { return v === undefined || Array.isArray(v); };'
 '  var obj = function (v) { return v === undefined || (v && typeof v === "object" && !Array.isArray(v)); };'
 '  if (!arr(j.records)) return "поле records должно быть списком";'
 '  if (!arr(j.del)) return "поле del должно быть списком";'
 '  if (!obj(j.ovr)) return "поле ovr должно быть объектом";'
 '  if (!obj(j.pts)) return "поле pts должно быть объектом";'
 '  if (!obj(j.read)) return "поле read должно быть объектом";'
 '  if (j.seq !== undefined && typeof j.seq !== "number") return "поле seq должно быть числом";'
 '  if (j.records === undefined && j.ovr === undefined && j.del === undefined) return "нет ни заявок, ни согласований";'
 '  return "";'
 '}'
 '/* пишем в localStorage только после успешной проверки */'
 'function MR_stateApply(j) {'
 '  var clean = {};'
 '  Object.keys(j).forEach(function (k) { if (k !== "savedAt") clean[k] = j[k]; });'
 '  try { window.localStorage.setItem(MR_LS, JSON.stringify(clean)); return true; }'
 '  catch (e) { return false; }'
 '}'
 'function MR_statePick(toast) {'
 '  var inp = document.createElement("input");'
 '  inp.type = "file"; inp.accept = "application/json,.json"; inp.style.display = "none";'
 '  inp.onchange = function () {'
 '    var f = inp.files && inp.files[0];'
 '    if (!f) { inp.remove(); return; }'
 '    var rd = new FileReader();'
 '    rd.onerror = function () { inp.remove(); toast("Не удалось прочитать файл."); };'
 '    rd.onload = function () {'
 '      inp.remove();'
 '      var j;'
 '      try { j = JSON.parse(String(rd.result)); }'
 '      catch (e) { toast("Файл не читается: повреждённый JSON. Ничего не изменено."); return; }'
 '      var bad = MR_stateValidate(j);'
 '      if (bad) { toast("Файл не подходит: " + bad + ". Ничего не изменено."); return; }'
 '      var cnt = (j.records || []).length;'
 '      var msg = "Загрузить состояние из файла «" + f.name + "»?" +'
 '                "\n\nЗаявок в файле: " + cnt +'
 '                (j.savedAt ? ("\nСохранено: " + j.savedAt) : "") +'
 '                "\n\nТекущий реестр, согласования и остатки баллов будут заменены. Отменить будет нельзя.";'
 '      if (!window.confirm(msg)) { toast("Загрузка отменена — ничего не изменено."); return; }'
 '      if (!MR_stateApply(j)) { toast("Не удалось записать состояние в браузер."); return; }'
 '      window.location.reload();'
 '    };'
 '    rd.readAsText(f, "utf-8");'
 '  };'
 '  document.body.appendChild(inp); inp.click();'
 '}'
 '/* мини-рейтинг в личном кабинете — тот же MR_board, что и в разделе'
 '   «Рейтинг» и в галерее победителей, окно из пяти строк вокруг себя */'
 'function MR_lkRate(records, ovr, del, user) {'
 '  var board = MR_board(records || [], ovr || {}, del || [], "quarter");'
 '  var ranked = board.filter(function (v) { return v.pts > 0; });'
 '  var me = user ? user.fio : "";'
 '  var idx = -1, i;'
 '  for (i = 0; i < ranked.length; i++) if (ranked[i].fio === me) { idx = i; break; }'
 '  var from = idx < 0 ? 0 : Math.max(0, Math.min(idx - 2, ranked.length - 5));'
 '  var out = ranked.slice(from, from + 5).map(function (v, k) {'
 '    return { key: v.fio, n: from + k + 1, fio: v.fio, pts: v.pts, me: v.fio === me };'
 '  });'
 '  if (idx < 0 && me) {'
 '    var mine = board.find(function (v) { return v.fio === me; });'
 '    out.push({ key: me, n: "—", fio: me, pts: mine ? mine.pts : 0, me: true });'
 '  }'
 '  return out;'
 '}'
 ''
 '/* ---------- навигация с учётом прав ---------- */'
) -join "`n"
Rep 'функции состояния и MR_lkRate' '/* ---------- навигация с учётом прав ---------- */' $helpers 1

# ---------- 3. кнопки в «Администрировании» ----------
$oldBar = 'placeholder: "Поиск по ФИО, номеру, тексту…" })] }),' + "`n" +
          '              (0, c.jsxs)("button", { className: "btn sm", onClick: doExport, children: [(0, c.jsx)(Qh, { size: 14 }), (0, c.jsx)("span", { className: "lbl", children: "Экспорт .xlsx" })] })'
$newBar = @(
 'placeholder: "Поиск по ФИО, номеру, тексту…" })] }),'
 '              (0, c.jsxs)("button", { className: "btn sm", onClick: doExport, children: [(0, c.jsx)(Qh, { size: 14 }), (0, c.jsx)("span", { className: "lbl", children: "Экспорт .xlsx" })] }),'
 '              MR_can(role, "state") ? (0, c.jsxs)("button", {'
 '                className: "btn sm", title: "Скачать реестр, согласования и остатки баллов одним файлом",'
 '                onClick: function () { toast(MR_stateExport() ? "Состояние выгружено в state.json." : "Не удалось выгрузить состояние."); },'
 '                children: [(0, c.jsx)(Qh, { size: 14 }), (0, c.jsx)("span", { className: "lbl", children: "Выгрузить состояние" })]'
 '              }) : null,'
 '              MR_can(role, "state") ? (0, c.jsxs)("button", {'
 '                className: "btn sm", title: "Заменить текущий реестр содержимым файла",'
 '                onClick: function () { MR_statePick(toast); },'
 '                children: [(0, c.jsx)(Qh, { size: 14 }), (0, c.jsx)("span", { className: "lbl", children: "Загрузить состояние" })]'
 '              }) : null'
) -join "`n"
Rep 'кнопки состояния в MR_Admin' $oldBar $newBar 1

# ---------- 4. ЛК: мини-рейтинг из MR_board ----------
Rep 'Fh: принимает записи' `
    'function Fh({points:t,user:MRu}){' `
    'function Fh({points:t,user:MRu,records:MRrec,ovr:MRovr,del:MRdel}){' `
    1

Rep 'vg: передаёт записи в ЛК' `
    't==="lk"&&(0,c.jsx)(Fh,{points:h,user:MRuser})' `
    't==="lk"&&(0,c.jsx)(Fh,{points:h,user:MRuser,records:d,ovr:MRovr,del:MRdel})' `
    1

Rep 'ЛК: таблица рейтинга -> MR_board' `
    'Vh.map(g=>(0,c.jsxs)("div",{className:`lk-rate-r${g.me?" me":""}`,children:[(0,c.jsx)("span",{className:"rn",children:g.n}),(0,c.jsx)("span",{className:"rf",children:g.fio}),(0,c.jsx)("span",{className:"rp",children:g.pts})]},g.n))' `
    'MR_lkRate(MRrec,MRovr,MRdel,MRu).map(g=>(0,c.jsxs)("div",{className:`lk-rate-r${g.me?" me":""}`,children:[(0,c.jsx)("span",{className:"rn",children:g.n}),(0,c.jsx)("span",{className:"rf",children:g.fio}),(0,c.jsx)("span",{className:"rp",children:g.pts})]},g.key))' `
    1

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($path, $text, $utf8NoBom)
$sizeAfter = (Get-Item -LiteralPath $path).Length

Write-Host ''
Write-Host 'Готово. Проверки:'
Write-Host ('  MR_stateExport / Import : {0} / {1}' -f ([regex]::Matches($text,[regex]::Escape('MR_stateExport'))).Count, ([regex]::Matches($text,[regex]::Escape('MR_statePick'))).Count)
Write-Host ('  MR_can(role, "state")   : {0}' -f ([regex]::Matches($text,[regex]::Escape('MR_can(role, "state")'))).Count)
Write-Host ('  MR_lkRate               : {0}' -f ([regex]::Matches($text,[regex]::Escape('MR_lkRate'))).Count)
Write-Host ('  осталось Vh.map         : {0}' -f ([regex]::Matches($text,[regex]::Escape('Vh.map'))).Count)
Write-Host ('  размер: {0:N0} -> {1:N0} байт' -f $sizeBefore, $sizeAfter)
