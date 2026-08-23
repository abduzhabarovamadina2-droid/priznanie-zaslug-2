$ErrorActionPreference = 'Stop'

# ======================================================================
#  Справочник сотрудников -> внешний employees.json
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

# ---------- 1. ключ localStorage: v3 -> v4 ----------
# В v3 лежат заявки со старыми ФИО; после смены справочника они бы ссылались
# на несуществующих людей (рейтинг, галерея победителей).
Rep 'localStorage: mr_state_v3 -> v4' `
    'var MR_LS = "mr_state_v3";' `
    'var MR_LS = "mr_state_v4";' `
    1

# ---------- 2. флаг "me" — от авторизованного пользователя ----------
# Раньше это была статическая пометка me:true у Исакуловой во встроенном
# MR_PEOPLE. Во внешнем JSON такого поля нет, поэтому подсветка своей строки
# в рейтинге (класс mr-me) теперь вычисляется от MR_CUR.
Rep 'MR_person: me от текущего пользователя' `
    'gross: pts, fine: fine, penalties: pen });' `
    'gross: pts, fine: fine, penalties: pen, me: MR_isMe(p.fio) });' `
    1

# ---------- 3. старт приложения: загрузка справочника ----------
$oldBoot = '(0,c1.createRoot)(document.getElementById("root")).render((0,c.jsx)(vg,{}));'

$newBoot = @'
function MR_isMe(fio){return !!(MR_CUR&&fio===MR_CUR.fio)}
function MR_applyDir(j){
if(!j||typeof j!=="object")throw new Error("bad json");
var P=j.people,U=j.users;
if(!Array.isArray(P)||!P.length)throw new Error("no people");
MR_PEOPLE.length=0;
P.forEach(function(p){MR_PEOPLE.push({fio:p.fio,post:p.post,branch:p.branch,dep:p.dep,dept:p.dept,n:p.n||0})});
var nu=MR_USERS.length;
if(Array.isArray(U)&&U.length){MR_USERS.length=0;U.forEach(function(u){MR_USERS.push(u)});nu=U.length}
return P.length+" people, "+nu+" users"+(j.version?" (v"+j.version+")":"")
}
function MR_mount(){(0,c1.createRoot)(document.getElementById("root")).render((0,c.jsx)(vg,{}))}
(function(){
var done=!1,go=function(m){if(done)return;done=!0;console.log(m);MR_mount()};
if(typeof fetch!="function"||location.protocol==="file:"){go("встроенные данные");return}
try{
fetch("employees.json",{cache:"no-store"})
.then(function(r){if(!r.ok)throw new Error("HTTP "+r.status);return r.json()})
.then(function(j){go("employees.json: "+MR_applyDir(j))})
.catch(function(){go("встроенные данные")})
}catch(e){go("встроенные данные")}
})();
'@

Rep 'Старт приложения: fetch employees.json' $oldBoot $newBoot 1

# ---------- пишем обратно UTF-8 БЕЗ BOM ----------
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($path, $text, $utf8NoBom)

Write-Host ''
Write-Host 'Готово. Проверки:'
Write-Host ('  mr_state_v4                 : {0}' -f ([regex]::Matches($text, [regex]::Escape('mr_state_v4'))).Count)
Write-Host ('  осталось mr_state_v3        : {0}' -f ([regex]::Matches($text, [regex]::Escape('mr_state_v3'))).Count)
Write-Host ('  MR_isMe(p.fio)              : {0}' -f ([regex]::Matches($text, [regex]::Escape('MR_isMe(p.fio)'))).Count)
Write-Host ('  fetch("employees.json"      : {0}' -f ([regex]::Matches($text, [regex]::Escape('fetch("employees.json"'))).Count)
Write-Host ('  MR_PEOPLE.length=0          : {0}' -f ([regex]::Matches($text, [regex]::Escape('MR_PEOPLE.length=0'))).Count)
Write-Host ('  MR_USERS.length=0           : {0}' -f ([regex]::Matches($text, [regex]::Escape('MR_USERS.length=0'))).Count)
Write-Host ('  прямых render() вне MR_mount: {0}' -f (([regex]::Matches($text, [regex]::Escape('createRoot'))).Count - 1))
