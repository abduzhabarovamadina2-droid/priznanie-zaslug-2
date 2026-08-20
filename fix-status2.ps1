$ErrorActionPreference = 'Stop'

# ======================================================================
#  ПУНКТ 2, доводка: убрать «На доработку» из карточки заявки в «Заслугах»
#  После перевода на пять статусов эта кнопка ставила статус revision,
#  которого больше нет в карте ts: заявка получала пустой статус и
#  выпадала из рейтинга. Убираем саму кнопку и проброс обработчика.
#  Это выход за границы пункта 2 (там был разрешён только раздел
#  «Администрирование»), но иначе правка оставляет систему противоречивой.
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

# кнопка «На доработку» в карточке заявки раздела «Заслуги»
Rep 'MR_Req: убрать кнопку «На доработку»' `
    '          canModerate && (0, c.jsxs)("button", { className: "btn", onClick: function () { if (!cmt.trim()) { props.toast && props.toast("Укажите примечание для возврата на доработку."); return; } props.onRevise(t, cmt); }, children: [(0, c.jsx)(a1, { size: 15 }), "На доработку"] }),' `
    '' `
    1

# проброс обработчика из раздела «Заслуги»
Rep 'cg: убрать проброс onRevise' `
    'onApprove:MRap,onRevise:MRrv,onDelete:MRrm' `
    'onApprove:MRap,onDelete:MRrm' `
    1

# сам обработчик, ставивший статус revision
Rep 'cg: убрать обработчик MRrv' `
    'MRrv=(S,MRc)=>b(S,"revision","Направлено на доработку",MRc),' `
    '' `
    1

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($path, $text, $utf8NoBom)
$sizeAfter = (Get-Item -LiteralPath $path).Length

Write-Host ''
Write-Host 'Готово. Проверки:'
Write-Host ('  onRevise осталось : {0}' -f ([regex]::Matches($text,[regex]::Escape('onRevise'))).Count)
Write-Host ('  MRrv осталось     : {0}' -f ([regex]::Matches($text,[regex]::Escape('MRrv'))).Count)
Write-Host ('  "revision" как статус: {0}' -f ([regex]::Matches($text,[regex]::Escape('"revision"'))).Count)
Write-Host ('  размер: {0:N0} -> {1:N0} байт' -f $sizeBefore, $sizeAfter)
