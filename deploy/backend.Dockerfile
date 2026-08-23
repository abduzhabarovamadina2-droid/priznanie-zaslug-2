# ---------------------------------------------------------------
# Образ backend-API модуля «Признание заслуг»
# Контекст сборки — корень проекта (см. docker-compose.yml).
# ---------------------------------------------------------------
FROM node:20-alpine AS deps
WORKDIR /app
COPY backend/package.json backend/package-lock.json ./
RUN npm ci --omit=dev

FROM node:20-alpine AS runtime
ENV NODE_ENV=production \
    TZ=Asia/Almaty
WORKDIR /app

# Данные для сидов лежат во frontend/ — кладём их по тому же
# относительному пути, что и в репозитории (../frontend/...).
COPY --chown=node:node frontend/employees.json /frontend/employees.json
COPY --chown=node:node "frontend/Рейтинг.json"  "/frontend/Рейтинг.json"

COPY --from=deps --chown=node:node /app/node_modules ./node_modules
COPY --chown=node:node backend/ ./

USER node
EXPOSE 4000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "src/server.js"]
