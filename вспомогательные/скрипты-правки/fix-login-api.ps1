$ErrorActionPreference = 'Stop'

# ======================================================================
#  ШАГ 2: MR_Login переходит на серверную авторизацию.
#  Меняется только вход. Загрузка справочников, рейтинг, заявки и
#  mock-массивы не трогаются. MR_USERS остаётся — но лишь как список для
#  выбора и подписи; проверка пароля уходит на сервер.
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

# ---------- 1. MR_api.login принимает и объект, и два аргумента ----------
$oldLogin = @(
 '  /* Вход: сохраняем токен и отдаём профиль. Пароль остаётся только в аргументах. */'
 '  login: function (login, password) {'
 '    return MR_api.request("POST", "/auth/login", { login: login, password: password })'
) -join "`n"
$newLogin = @(
 '  /* Вход: сохраняем токен и отдаём профиль. Пароль остаётся только в аргументах.'
 '     Принимает и объект MR_api.login({login, password}), и два аргумента. */'
 '  login: function (a, b) {'
 '    var creds = (a && typeof a === "object") ? a : { login: a, password: b };'
 '    return MR_api.request("POST", "/auth/login", { login: creds.login, password: creds.password })'
) -join "`n"
Rep 'MR_api.login: приём объекта' $oldLogin $newLogin 1

# ---------- 2. Нормализация профиля из API в форму, привычную приложению ----------
$norm = @(
 '/* Профиль из API приводим к той же форме, в которой приложение всегда'
 '   работало с записью из MR_USERS: остальной код менять не приходится. */'
 'function MR_userFromApi(u) {'
 '  if (!u) return null;'
 '  var e = u.employee || {};'
 '  return {'
 '    id: u.id,'
 '    tnumber: e.tnumber || "",'
 '    login: u.login,'
 '    role: u.role,'
 '    fio: e.fio || u.login,'
 '    short: e.shortName || e.fio || u.login,'
 '    post: e.post || "",'
 '    dept: e.dept || "",'
 '    dep: e.dep || "",'
 '    branch: e.branch || "",'
 '    group: u.groupCode || "",'
 '    points: typeof u.pointsBalance === "number" ? u.pointsBalance : 0,'
 '    permissions: u.permissions || []'
 '  };'
 '}'
 ''
 '/* Сообщение об ошибке входа: наружу только понятный текст, без подробностей. */'
 'function MR_loginErrorText(err) {'
 '  if (!err) return "Не удалось войти. Попробуйте ещё раз.";'
 '  if (err.kind === "auth" || err.status === 401) return "Неверный логин или пароль";'
 '  if (err.status === 503) return "Авторизация временно недоступна. Обратитесь к администратору.";'
 '  if (err.kind === "network") return "Не удалось подключиться к серверу.";'
 '  if (err.kind === "forbidden" || err.status === 403) return "Доступ запрещён. Учётная запись отключена или недостаточно прав.";'
 '  if (err.status === 400) return "Укажите логин и пароль.";'
 '  return "Не удалось войти. Попробуйте ещё раз.";'
 '}'
 ''
 'function MR_Login(props) {'
) -join "`n"
Rep 'MR_userFromApi + MR_loginErrorText' 'function MR_Login(props) {' $norm 1

# ---------- 3. pick и submit ----------
$oldBody = @(
 '  var cur = MR_USERS.find(function (v) { return v.login === lg; });'
 ''
 '  var pick = function (v) {'
 '    setLg(v);'
 '    var u = MR_USERS.find(function (x) { return x.login === v; });'
 '    setPw(u ? u.pass : "");'
 '    setErr("");'
 '  };'
 '  var submit = function (ev) {'
 '    ev && ev.preventDefault && ev.preventDefault();'
 '    if (!lg) { setErr("Выберите учётную запись из списка."); return; }'
 '    var u = MR_USERS.find(function (v) { return v.login === lg && v.pass === pw; });'
 '    if (!u) { setErr("Неверный пароль для выбранной учётной записи."); return; }'
 '    setErr(""); props.onLogin(u);'
 '  };'
) -join "`n"

$newBody = @(
 '  var s5 = (0, N.useState)(!1), busy = s5[0], setBusy = s5[1];'
 '  /* MR_USERS теперь нужен только чтобы показать список и подписи.'
 '     Пароль здесь не хранится и не проверяется — это делает сервер. */'
 '  var cur = MR_USERS.find(function (v) { return v.login === lg; });'
 ''
 '  var pick = function (v) {'
 '    setLg(v);'
 '    setErr("");'
 '  };'
 ''
 '  var submit = function (ev) {'
 '    ev && ev.preventDefault && ev.preventDefault();'
 '    if (busy) return;'
 '    if (!lg) { setErr("Выберите учётную запись из списка."); return; }'
 '    if (!pw) { setErr("Введите пароль."); return; }'
 ''
 '    setErr(""); setBusy(!0);'
 '    MR_api.login({ login: lg, password: pw })'
 '      .then(function (data) {'
 '        if (!MR_token.has()) throw MR_ApiError("auth", "Сервер не выдал токен", 401);'
 '        /* Профиль приходит вместе с токеном. Если он неполон — спрашиваем отдельно. */'
 '        var u = data && data.user;'
 '        if (u && u.login && u.role && u.employee) return u;'
 '        return MR_api.me().then(function (r) { return r && r.user; });'
 '      })'
 '      .then(function (u) {'
 '        var normalized = MR_userFromApi(u);'
 '        if (!normalized) throw MR_ApiError("http", "Сервер вернул пустой профиль", 0);'
 '        setBusy(!1);'
 '        setPw("");            /* пароль в состоянии не задерживаем */'
 '        props.onLogin(normalized);'
 '      })'
 '      .catch(function (e) {'
 '        MR_token.clear();'
 '        setBusy(!1);'
 '        setErr(MR_loginErrorText(e));'
 '      });'
 '  };'
) -join "`n"
Rep 'MR_Login: pick и submit через API' $oldBody $newBody 1

# ---------- 4. Тексты, описывавшие подстановку пароля ----------
Rep 'поле пароля: подсказка' `
    'placeholder: lg ? "" : "Подставится после выбора логина"' `
    'placeholder: lg ? "Введите пароль" : "Сначала выберите учётную запись"' `
    1

Rep 'кнопка: блокировка на время запроса' `
    '(0, c.jsxs)("button", { className: "btn go mr-login-go", type: "submit", children: [(0, c.jsx)(Hh, { size: 15 }), " Войти в Систему"] })' `
    '(0, c.jsxs)("button", { className: "btn go mr-login-go", type: "submit", disabled: busy, children: [(0, c.jsx)(Hh, { size: 15 }), busy ? " Проверяем…" : " Войти в Систему"] })' `
    1

Rep 'подсказка внизу формы' `
    '"Демонстрационный режим: пароль подставляется автоматически при выборе учётной записи. Заявки, справочники и рейтинг сохраняются в браузере и не теряются при перезагрузке страницы."' `
    '"Вход проверяется на сервере. Выберите учётную запись и введите пароль. Заявки, справочники и рейтинг пока сохраняются в браузере."' `
    1

# ---------- 5. Выход очищает токен ----------
Rep 'MRlogout: очистка токена' `
    'MRlogout=()=>{MR_CUR=null,MRsetUser(null),l("home")}' `
    'MRlogout=()=>{MR_api.logout(),MR_CUR=null,MRsetUser(null),l("home")}' `
    1

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($path, $text, $utf8NoBom)
$sizeAfter = (Get-Item -LiteralPath $path).Length

Write-Host ''
Write-Host 'Готово. Проверки:'
Write-Host ('  MR_api.login({...}) вызывается : {0}' -f ([regex]::Matches($text,[regex]::Escape('MR_api.login({ login: lg, password: pw })'))).Count)
Write-Host ('  MR_api.me() вызывается         : {0}' -f ([regex]::Matches($text,[regex]::Escape('MR_api.me()'))).Count)
Write-Host ('  MR_token.has() проверяется     : {0}' -f ([regex]::Matches($text,[regex]::Escape('MR_token.has()'))).Count)
Write-Host ('  setPw(u ? u.pass : "") остался : {0}' -f ([regex]::Matches($text,[regex]::Escape('setPw(u ? u.pass'))).Count)
Write-Host ('  сверка пароля v.pass === pw    : {0}' -f ([regex]::Matches($text,[regex]::Escape('v.pass === pw'))).Count)
Write-Host ('  MR_api.logout() в MRlogout     : {0}' -f ([regex]::Matches($text,[regex]::Escape('MR_api.logout()'))).Count)
Write-Host ('  console.log с токеном          : {0}' -f ([regex]::Matches($text,'console\.(log|warn|error)\([^)]*(token|pass)')).Count)
Write-Host ('  размер: {0:N0} -> {1:N0} байт (+{2:N0})' -f $sizeBefore, $sizeAfter, ($sizeAfter - $sizeBefore))
