$ErrorActionPreference = 'Stop'

# ======================================================================
#  ПУНКТ 3: третья роль — руководитель (IsHeadMeritRecognition)
#  Границы: MR_USERS, employees.json, MR_roleLabel, MR_nav, MR_Login.
#  MR_roleLabel и MR_Login править не понадобилось: первая читает подпись
#  из MR_ROLES, вторая строит список прямо из MR_USERS — обе подхватят
#  новую роль сами.
#  Видимость разделов = как у модератора, через алиас внутри MR_nav.
#  MR_can намеренно не тронут: он вне границ пункта.
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

# ---------- 1. роль в списке ролей ----------
Rep 'MR_ROLES: роль head' `
    ("  { key: ""admin"", label: ""Администратор заявок «Признание заслуг»"", group: ""AdminMeritRecognitin"" }`n];") `
    ("  { key: ""admin"", label: ""Администратор заявок «Признание заслуг»"", group: ""AdminMeritRecognitin"" },`n  { key: ""head"", label: ""Руководитель"", group: ""HeadMeritRecognition"" }`n];") `
    1

# ---------- 2. учётная запись руководителя во встроенном резерве ----------
# Тот же человек, что и в employees.json: новых сотрудников не заводим,
# логин выдан уже имеющемуся начальнику отдела.
Rep 'MR_USERS: учётка руководителя' `
    ("  { login: ""CORP.NB.RK\\3"", pass: ""12345"", role: ""moderator"", fio: ""Сулейменова Асель Наурызбаевна"", short: ""Асель Сулейменова"", post: ""Главный специалист Управления мотивации ДРЧК"", dept: ""Департамент по работе с человеческим капиталом"", group: """", points: 50 }`n];") `
    ("  { login: ""CORP.NB.RK\\3"", pass: ""12345"", role: ""moderator"", fio: ""Сулейменова Асель Наурызбаевна"", short: ""Асель Сулейменова"", post: ""Главный специалист Управления мотивации ДРЧК"", dept: ""Департамент по работе с человеческим капиталом"", group: """", points: 50 },`n  { tnumber: ""T0021"", login: ""CORP.NB.RK\\4"", pass: ""12345"", role: ""head"", fio: ""Батырбаева Анар Жармухановна"", short: ""Анар Батырбаева"", post: ""Начальник отдела"", dept: ""Отдел бухгалтерского учета"", group: ""HeadMeritRecognition"", points: 50 }`n];") `
    1

# ---------- 3. видимость разделов ----------
Rep 'MR_nav: руководитель видит как модератор' `
    ("function MR_nav(role) {`n  var out = [{ key: ""home"", label: ""Главная"", icon: MR_IcoHome }].concat(ye.sub.slice());") `
    ("function MR_nav(role) {`n  /* TODO: уточнить права руководителя — по бандлам портала видно только`n     саму роль IsHeadMeritRecognition, но не её набор прав. До уточнения`n     показываем ему те же разделы, что модератору. */`n  if (role === ""head"") role = ""moderator"";`n  var out = [{ key: ""home"", label: ""Главная"", icon: MR_IcoHome }].concat(ye.sub.slice());") `
    1

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($path, $text, $utf8NoBom)
$sizeAfter = (Get-Item -LiteralPath $path).Length

Write-Host ''
Write-Host 'Готово. Проверки:'
Write-Host ('  роль head в MR_ROLES  : {0}' -f ([regex]::Matches($text,[regex]::Escape('key: "head"'))).Count)
Write-Host ('  учётка \4 в MR_USERS  : {0}' -f ([regex]::Matches($text,[regex]::Escape('CORP.NB.RK\\4'))).Count)
Write-Host ('  алиас в MR_nav        : {0}' -f ([regex]::Matches($text,[regex]::Escape('if (role === "head") role = "moderator";'))).Count)
Write-Host ('  TODO про права        : {0}' -f ([regex]::Matches($text,[regex]::Escape('TODO: уточнить права руководителя'))).Count)
Write-Host ('  MR_can не тронут (head в нём): {0}' -f ([regex]::Matches($text,'"head"\s*[,\]]')).Count)
Write-Host ('  размер: {0:N0} -> {1:N0} байт' -f $sizeBefore, $sizeAfter)
