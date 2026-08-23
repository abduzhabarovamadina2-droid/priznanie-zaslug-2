$ErrorActionPreference = 'Stop'

# ======================================================================
#  ШАГ 1 миграции фронтенда: API-клиент MR_api.
#  Только добавление. Существующий код не трогаем: ни MR_Login, ни
#  загрузку employees.json и Рейтинг.json, ни работу с заявками.
#  Клиент пока никем не вызывается — он появляется для следующих шагов.
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

$client = @(
 '/* ======================================================================'
 '   КЛИЕНТ REST API'
 '   Тонкая обёртка над fetch для перехода с localStorage на backend.'
 '   На этом шаге ещё никем не вызывается — подключение пойдёт дальше.'
 ''
 '   Использование:'
 '     await MR_api.get("/employees")'
 '     await MR_api.post("/requests", data)'
 '     await MR_api.patch("/requests/123", data)'
 '     await MR_api.del("/requests/123")'
 ''
 '   Ошибки не возвращаются молча, а выбрасываются объектом с полем kind:'
 '     "auth"      — 401, токен удалён, нужно показать экран входа'
 '     "forbidden" — 403, токен цел, роли не хватает прав'
 '     "network"   — backend недоступен'
 '     "http"      — прочие коды ответа'
 '     "parse"     — ответ пришёл, но это не JSON'
 ''
 '   Ни токен, ни пароль, ни строка подключения никуда не логируются.'
 '   ====================================================================== */'
 'var MR_API_BASE = "http://localhost:4000/api";'
 'var MR_TOKEN_KEY = "mr_token";'
 ''
 '/* Токен держим отдельным ключом, а не внутри mr_state_v4: то состояние'
 '   целиком выгружается в state.json, и токен уехал бы в скачанный файл. */'
 'var MR_token = {'
 '  get: function () {'
 '    try { return window.localStorage.getItem(MR_TOKEN_KEY) || null; }'
 '    catch (e) { return null; }'
 '  },'
 '  set: function (value) {'
 '    try { if (value) window.localStorage.setItem(MR_TOKEN_KEY, value); }'
 '    catch (e) { /* приватный режим — просто останемся без токена */ }'
 '  },'
 '  clear: function () {'
 '    try { window.localStorage.removeItem(MR_TOKEN_KEY); }'
 '    catch (e) { /* нечего чистить */ }'
 '  },'
 '  has: function () { return !!MR_token.get(); }'
 '};'
 ''
 '/* Ошибка запроса. Наследуемся от Error, чтобы работал стек и instanceof. */'
 'function MR_ApiError(kind, message, status, details) {'
 '  var err = new Error(message);'
 '  err.name = "MR_ApiError";'
 '  err.kind = kind;'
 '  err.status = status || 0;'
 '  err.details = details || null;'
 '  err.isApiError = true;'
 '  return err;'
 '}'
 ''
 'var MR_api = {'
 '  base: MR_API_BASE,'
 '  token: MR_token,'
 ''
 '  /* Единая точка: собирает заголовки, разбирает ответ, переводит коды в ошибки. */'
 '  request: function (method, path, body, options) {'
 '    var opts = options || {};'
 '    var url = MR_API_BASE + path;'
 '    var headers = {};'
 '    var i, keys;'
 ''
 '    var tok = MR_token.get();'
 '    if (tok) headers["Authorization"] = "Bearer " + tok;'
 '    if (body !== undefined && body !== null) headers["Content-Type"] = "application/json";'
 '    if (opts.headers) {'
 '      keys = Object.keys(opts.headers);'
 '      for (i = 0; i < keys.length; i++) headers[keys[i]] = opts.headers[keys[i]];'
 '    }'
 ''
 '    var init = { method: method, headers: headers };'
 '    if (body !== undefined && body !== null) init.body = JSON.stringify(body);'
 '    if (opts.signal) init.signal = opts.signal;'
 ''
 '    return fetch(url, init).then(function (res) {'
 '      return res.text().then(function (raw) {'
 '        var data = null;'
 '        if (raw) {'
 '          try { data = JSON.parse(raw); }'
 '          catch (e) {'
 '            if (res.ok) throw MR_ApiError("parse", "Ответ сервера не является JSON", res.status);'
 '          }'
 '        }'
 ''
 '        if (res.ok) return data;'
 ''
 '        var msg = (data && data.error && data.error.message) || ("Ошибка запроса: " + res.status);'
 '        var det = (data && data.error && data.error.details) || null;'
 ''
 '        /* 401 — токен протух или его нет. Убираем его и сообщаем вызывающему,'
 '           что нужен вход. Никакой перезагрузки страницы: решение принимает UI. */'
 '        if (res.status === 401) {'
 '          MR_token.clear();'
 '          throw MR_ApiError("auth", msg || "Требуется авторизация", 401, det);'
 '        }'
 ''
 '        /* 403 — пользователь известен, но роли не хватает прав. Токен оставляем. */'
 '        if (res.status === 403) {'
 '          throw MR_ApiError("forbidden", msg || "Недостаточно прав", 403, det);'
 '        }'
 ''
 '        throw MR_ApiError("http", msg, res.status, det);'
 '      });'
 '    }, function (netErr) {'
 '      /* Сюда попадаем, когда запрос вообще не дошёл: сервер не запущен,'
 '         оборвалась сеть, запрос отменён. */'
 '      if (netErr && netErr.name === "AbortError") {'
 '        throw MR_ApiError("network", "Запрос отменён", 0);'
 '      }'
 '      throw MR_ApiError("network",'
 '        "Не удалось связаться с сервером " + MR_API_BASE + ". Проверьте, запущен ли backend.", 0);'
 '    });'
 '  },'
 ''
 '  get:   function (path, options)       { return MR_api.request("GET", path, null, options); },'
 '  post:  function (path, body, options) { return MR_api.request("POST", path, body === undefined ? {} : body, options); },'
 '  patch: function (path, body, options) { return MR_api.request("PATCH", path, body === undefined ? {} : body, options); },'
 '  del:   function (path, options)       { return MR_api.request("DELETE", path, null, options); },'
 ''
 '  /* Вход: сохраняем токен и отдаём профиль. Пароль остаётся только в аргументах. */'
 '  login: function (login, password) {'
 '    return MR_api.request("POST", "/auth/login", { login: login, password: password })'
 '      .then(function (data) {'
 '        if (data && data.token) MR_token.set(data.token);'
 '        return data;'
 '      });'
 '  },'
 ''
 '  me: function () { return MR_api.get("/auth/me"); },'
 ''
 '  /* Выход — дело клиентское: сервер токены не отзывает. */'
 '  logout: function () { MR_token.clear(); },'
 ''
 '  /* Проверка доступности backend. Открыта без токена. */'
 '  health: function () { return MR_api.get("/health"); }'
 '};'
 ''
 '/* ---------- сохранение состояния между сеансами ---------- */'
 'var MR_LS = "mr_state_v4";'
) -join "`n"

Rep 'MR_api: клиент REST API' `
    ("/* ---------- сохранение состояния между сеансами ---------- */`nvar MR_LS = ""mr_state_v4"";") `
    $client `
    1

$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($path, $text, $utf8NoBom)
$sizeAfter = (Get-Item -LiteralPath $path).Length

Write-Host ''
Write-Host 'Готово. Проверки:'
Write-Host ('  MR_API_BASE           : {0}' -f ([regex]::Matches($text,[regex]::Escape('var MR_API_BASE ='))).Count)
Write-Host ('  методы get/post/patch/del: {0}' -f ([regex]::Matches($text,'MR_api\.request\("(GET|POST|PATCH|DELETE)"')).Count)
Write-Host ('  обработка 401         : {0}' -f ([regex]::Matches($text,[regex]::Escape('res.status === 401'))).Count)
Write-Host ('  обработка 403         : {0}' -f ([regex]::Matches($text,[regex]::Escape('res.status === 403'))).Count)
Write-Host ('  console.log в клиенте : {0}' -f ([regex]::Matches($text,[regex]::Escape('console.log(tok'))).Count)
Write-Host ('  MR_LS на месте        : {0}' -f ([regex]::Matches($text,[regex]::Escape('var MR_LS = "mr_state_v4";'))).Count)
Write-Host ('  размер: {0:N0} -> {1:N0} байт (+{2:N0})' -f $sizeBefore, $sizeAfter, ($sizeAfter - $sizeBefore))
