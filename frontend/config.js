/* Настройки окружения фронтенда.
   Меняется без пересборки: при деплое этот файл подменяется своим.
   window.MR_API_BASE — базовый адрес backend-API.
     локальная разработка : "http://localhost:4000/api"
     деплой за nginx      : "/api"  (тот же домен, без CORS) */
window.MR_API_BASE = "http://localhost:4000/api";
