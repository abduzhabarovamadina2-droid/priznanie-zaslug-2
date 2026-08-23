# Деплой модуля «Признание заслуг»

Стенд поднимается одной командой: `docker compose` собирает API, поднимает
PostgreSQL и отдаёт фронтенд через nginx. Наружу торчит **только nginx**,
база и API живут во внутренней сети.

```
браузер ──► nginx :8080 ──┬──► /            статика из frontend/
                          └──► /api/...     proxy_pass на api:4000
                                              api ──► db:5432 (postgres)
```

## Что где лежит

| Файл | Назначение |
|---|---|
| `docker-compose.yml` | описание стенда: `db`, `api`, `web` |
| `backend.Dockerfile` | образ API, контекст сборки — корень проекта |
| `nginx/default.conf` | статика, проксирование `/api/`, заголовки кэша |
| `nginx/config.prod.js` | настройки фронтенда на стенде (`MR_API_BASE = "/api"`) |
| `.env.example` | образец переменных окружения |

## Первый запуск

```powershell
cd deploy
cp .env.example .env       # заполнить POSTGRES_PASSWORD и JWT_SECRET
docker compose up -d --build
docker compose run --rm api npm run db:migrate
docker compose run --rm api npm run db:seed:all
```

Открыть <http://localhost:8080/>. Проверка API: <http://localhost:8080/api/health>.

`JWT_SECRET` генерируется так:

```powershell
node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))"
```

Без него контейнер API не стартует — это намеренно: в production
`backend/src/config/index.js` не подставляет слабое значение по умолчанию.

## Обновление версии

```powershell
docker compose up -d --build api      # пересобрать API
docker compose restart web            # фронтенд — bind-mount, хватает рестарта
docker compose run --rm api npm run db:migrate
```

Фронтенд смонтирован из `../frontend` только для чтения, поэтому правка
HTML видна сразу после обновления страницы — пересборка не нужна.

## Полезные команды

```powershell
docker compose ps                     # статус и healthcheck
docker compose logs -f api            # логи API
docker compose exec db psql -U priznanie -d priznanie_zaslug
docker compose down                   # остановить (данные в томе останутся)
docker compose down -v                # остановить и стереть базу
```

## Что проверить перед выкладкой в контур банка

- [ ] `JWT_SECRET` и `POSTGRES_PASSWORD` — не из примера, лежат вне репозитория
- [ ] `deploy/.env` не попал в Git (проверяется `deploy/.gitignore`)
- [ ] TLS: nginx слушает 443, сертификат подключён, 80 редиректит на 443
- [ ] `CORS_ORIGIN` указывает на реальный домен фронтенда
- [ ] Резервное копирование тома `pgdata`
- [ ] Демо-учётки из `db:seed:users` удалены или пароли сменены
