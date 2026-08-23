-- ============================================================================
--  Признание заслуг — начальная схема
--  Структура повторяет данные существующего прототипа: employees.json,
--  Рейтинг.json и справочники внутри «Признание заслуг.html».
--  Новых сущностей и полей «на будущее» не выдумываем — только то, что
--  либо уже есть в проекте, либо явно требуется заданием этапа.
-- ============================================================================

-- ---------- Роли -------------------------------------------------------------
-- Коды взяты из MR_ROLES прототипа. Роль руководителя называется head
-- (в боевой системе — IsHeadMeritRecognition). См. конфликт C-1 в ARCHITECTURE_V1.md.
CREATE TABLE IF NOT EXISTS roles (
    id          SMALLSERIAL PRIMARY KEY,
    code        VARCHAR(32)  NOT NULL UNIQUE,
    name        VARCHAR(128) NOT NULL,
    group_code  VARCHAR(64),
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------- Статусы заявки ---------------------------------------------------
-- Ровно пять, как в боевом модуле. ui_key — ключ, которым статус называется
-- в прототипе (объект ts), чтобы связать фронт и базу без переименований.
CREATE TABLE IF NOT EXISTS statuses (
    id                SMALLSERIAL PRIMARY KEY,
    code              VARCHAR(32)  NOT NULL UNIQUE,
    ui_key            VARCHAR(32)  NOT NULL UNIQUE,
    name              VARCHAR(128) NOT NULL,
    css_class         VARCHAR(16),
    counts_in_rating  BOOLEAN      NOT NULL DEFAULT FALSE,
    sort_order        SMALLINT     NOT NULL DEFAULT 0
);

-- ---------- Сотрудники -------------------------------------------------------
-- Поля один в один из employees.json → people.
-- Ключ работника — табельный номер (tnumber), как в боевой системе.
CREATE TABLE IF NOT EXISTS employees (
    id            SERIAL PRIMARY KEY,
    tnumber       VARCHAR(32)  NOT NULL UNIQUE,
    fio           VARCHAR(255) NOT NULL,
    short_name    VARCHAR(255),
    post          VARCHAR(255),
    branch        VARCHAR(255),
    dep           VARCHAR(255),
    dept          VARCHAR(255),
    seed_badges   SMALLINT     NOT NULL DEFAULT 0,
    photo_key     VARCHAR(255),
    is_active     BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at    TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_employees_fio  ON employees (fio);
CREATE INDEX IF NOT EXISTS idx_employees_dept ON employees (dept);

-- ---------- Пользователи -----------------------------------------------------
-- Пароли только в виде bcrypt-хеша. В employees.json пароль лежит открытым
-- текстом («12345») исключительно как демонстрационный — он используется
-- один раз при сиде для получения хеша и в базу открытым не попадает.
CREATE TABLE IF NOT EXISTS users (
    id             SERIAL PRIMARY KEY,
    employee_id    INTEGER      REFERENCES employees (id) ON DELETE SET NULL,
    login          VARCHAR(128) NOT NULL UNIQUE,
    email          VARCHAR(255) UNIQUE,
    password_hash  VARCHAR(255) NOT NULL,
    role_id        SMALLINT     NOT NULL REFERENCES roles (id),
    group_code     VARCHAR(64),
    points_balance INTEGER      NOT NULL DEFAULT 0,
    is_active      BOOLEAN      NOT NULL DEFAULT TRUE,
    created_at     TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at     TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_users_role     ON users (role_id);
CREATE INDEX IF NOT EXISTS idx_users_employee ON users (employee_id);

-- ---------- Номинации --------------------------------------------------------
-- Из MR_NOM_DATA и MR_Store.nominations прототипа.
CREATE TABLE IF NOT EXISTS nominations (
    id          SERIAL PRIMARY KEY,
    code        VARCHAR(32)  NOT NULL UNIQUE,
    name_kz     VARCHAR(255),
    name_ru     VARCHAR(255) NOT NULL,
    points      INTEGER      NOT NULL,
    badge_name  VARCHAR(64),
    badge_word  VARCHAR(64),
    badge_color VARCHAR(32),
    badge_image VARCHAR(255),
    is_active   BOOLEAN      NOT NULL DEFAULT TRUE,
    created_by  VARCHAR(255),
    rec_dt      TIMESTAMPTZ,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);

-- ---------- Заслуги внутри номинации ----------------------------------------
CREATE TABLE IF NOT EXISTS merits (
    id            SERIAL PRIMARY KEY,
    nomination_id INTEGER NOT NULL REFERENCES nominations (id) ON DELETE CASCADE,
    merit_kz      TEXT,
    merit_ru      TEXT NOT NULL,
    is_active     BOOLEAN NOT NULL DEFAULT TRUE,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_merits_nomination ON merits (nomination_id);

-- ---------- Заявки на признание заслуг ---------------------------------------
CREATE TABLE IF NOT EXISTS requests (
    id                SERIAL PRIMARY KEY,
    request_no        VARCHAR(64)  NOT NULL UNIQUE,
    initiator_user_id INTEGER      REFERENCES users (id) ON DELETE SET NULL,
    employee_id       INTEGER      NOT NULL REFERENCES employees (id) ON DELETE RESTRICT,
    nomination_id     INTEGER      REFERENCES nominations (id) ON DELETE SET NULL,
    merit_id          INTEGER      REFERENCES merits (id) ON DELETE SET NULL,
    merit_text        TEXT,
    comment           TEXT,
    status_id         SMALLINT     NOT NULL REFERENCES statuses (id),
    points            INTEGER      NOT NULL DEFAULT 0,
    doc_name          VARCHAR(255),
    note              TEXT,
    created_at        TIMESTAMPTZ  NOT NULL DEFAULT now(),
    updated_at        TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_requests_employee  ON requests (employee_id);
CREATE INDEX IF NOT EXISTS idx_requests_status    ON requests (status_id);
CREATE INDEX IF NOT EXISTS idx_requests_initiator ON requests (initiator_user_id);
CREATE INDEX IF NOT EXISTS idx_requests_created   ON requests (created_at);

-- ---------- История движения заявки ------------------------------------------
-- Соответствует сущности EmployeeMeritHistory боевого модуля.
CREATE TABLE IF NOT EXISTS request_history (
    id               SERIAL PRIMARY KEY,
    request_id       INTEGER      NOT NULL REFERENCES requests (id) ON DELETE CASCADE,
    action           VARCHAR(128) NOT NULL,
    old_status_id    SMALLINT     REFERENCES statuses (id),
    new_status_id    SMALLINT     REFERENCES statuses (id),
    performed_by     INTEGER      REFERENCES users (id) ON DELETE SET NULL,
    performed_by_name VARCHAR(255),
    comment          TEXT,
    created_at       TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_history_request ON request_history (request_id);

-- ---------- Рейтинг ----------------------------------------------------------
-- Поля один в один из Рейтинг.json: баллы по кварталам, за год и счётчики
-- бейджей по цветам. rank и department_parent_id есть в боевой EmployeeRating,
-- в нашем JSON их пока нет — остаются пустыми (см. TODO этапа).
CREATE TABLE IF NOT EXISTS ratings (
    id                   SERIAL PRIMARY KEY,
    employee_id          INTEGER  NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
    period_year          SMALLINT NOT NULL,
    q1_points            INTEGER  NOT NULL DEFAULT 0,
    q2_points            INTEGER  NOT NULL DEFAULT 0,
    q3_points            INTEGER  NOT NULL DEFAULT 0,
    q4_points            INTEGER  NOT NULL DEFAULT 0,
    year_points          INTEGER  NOT NULL DEFAULT 0,
    gold_badges          SMALLINT NOT NULL DEFAULT 0,
    silver_badges        SMALLINT NOT NULL DEFAULT 0,
    bronze_badges        SMALLINT NOT NULL DEFAULT 0,
    green_badges         SMALLINT NOT NULL DEFAULT 0,
    blue_badges          SMALLINT NOT NULL DEFAULT 0,
    yellow_badges        SMALLINT NOT NULL DEFAULT 0,
    rank                 INTEGER,
    department_parent_id INTEGER,
    source               VARCHAR(32) NOT NULL DEFAULT 'import',
    updated_at           TIMESTAMPTZ NOT NULL DEFAULT now(),
    CONSTRAINT uq_ratings_employee_year UNIQUE (employee_id, period_year)
);

-- ---------- Взыскания (внешняя система ЛПО) ----------------------------------
-- В прототипе это объект MR_PENALTIES, вычитается из баллов рейтинга.
CREATE TABLE IF NOT EXISTS punishments (
    id            SERIAL PRIMARY KEY,
    employee_id   INTEGER NOT NULL REFERENCES employees (id) ON DELETE CASCADE,
    is_punishment BOOLEAN NOT NULL DEFAULT TRUE,
    status        VARCHAR(64),
    date_begin    DATE,
    date_end      DATE,
    name          VARCHAR(255),
    comments      TEXT,
    cost          INTEGER NOT NULL DEFAULT 0,
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_punishments_employee ON punishments (employee_id);

-- ---------- Уведомления ------------------------------------------------------
CREATE TABLE IF NOT EXISTS notifications (
    id         SERIAL PRIMARY KEY,
    user_id    INTEGER      REFERENCES users (id) ON DELETE CASCADE,
    request_id INTEGER      REFERENCES requests (id) ON DELETE CASCADE,
    type       VARCHAR(32)  NOT NULL,
    title      VARCHAR(255) NOT NULL,
    text       TEXT,
    link       VARCHAR(255),
    is_read    BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications (user_id, is_read);

-- ---------- Вложения ---------------------------------------------------------
CREATE TABLE IF NOT EXISTS attachments (
    id          SERIAL PRIMARY KEY,
    request_id  INTEGER      REFERENCES requests (id) ON DELETE CASCADE,
    history_id  INTEGER      REFERENCES request_history (id) ON DELETE CASCADE,
    attach_type VARCHAR(32),
    filename    VARCHAR(255) NOT NULL,
    mime_type   VARCHAR(128),
    size_bytes  INTEGER,
    storage_key VARCHAR(512),
    uploaded_by INTEGER      REFERENCES users (id) ON DELETE SET NULL,
    created_at  TIMESTAMPTZ  NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_attachments_request ON attachments (request_id);
