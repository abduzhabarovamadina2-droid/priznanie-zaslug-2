-- Этап 6: журнал действий.
--
-- История заявки (request_history) отвечает на вопрос «что происходило с
-- этой заявкой». Журнал отвечает на другой: «что делал этот человек» —
-- включая входы, отказы по правам и работу со справочниками, то есть то,
-- что к конкретной заявке не привязано.
--
-- Записи журнала не удаляются и не правятся: в этом весь смысл.

CREATE TABLE IF NOT EXISTS audit_log (
    id          BIGSERIAL PRIMARY KEY,
    at          TIMESTAMPTZ  NOT NULL DEFAULT now(),
    user_id     INTEGER      REFERENCES users (id) ON DELETE SET NULL,
    user_login  VARCHAR(255),
    role        VARCHAR(32),
    action      VARCHAR(64)  NOT NULL,
    entity      VARCHAR(32),
    entity_id   VARCHAR(64),
    result      VARCHAR(16)  NOT NULL,
    status_code SMALLINT,
    method      VARCHAR(8),
    path        VARCHAR(255),
    ip          VARCHAR(64),
    details     JSONB
);

-- «Что делал этот человек» и «что было с этим объектом» — два основных
-- вопроса к журналу, под них и индексы.
CREATE INDEX IF NOT EXISTS idx_audit_user   ON audit_log (user_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_entity ON audit_log (entity, entity_id, at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_at     ON audit_log (at DESC);

-- Отказы просматривают отдельно: всплеск 403 — повод разобраться.
CREATE INDEX IF NOT EXISTS idx_audit_denied ON audit_log (at DESC) WHERE result = 'denied';
