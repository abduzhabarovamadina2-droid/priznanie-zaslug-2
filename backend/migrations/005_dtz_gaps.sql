-- Закрытие расхождений с ДТЗ и инженерных дыр.
--
-- Одной миграцией, потому что части связаны: статус «На доработке» нужен
-- заявке, справочник подразделений — и сотруднику, и рейтингу, а счётчик
-- попыток входа и версия токена — обе про учётную запись.

-- ---------------------------------------------------------------------------
-- 1. Статус «На доработке»
--
-- ДТЗ требует возврат заявки инициатору с примечанием модератора. В
-- справочнике было пять кодов, шестого — не было, и вернуть заявку было
-- некуда: модератор мог только согласовать или отклонить.
--
-- ui_key = 'revision': именно это значение прототип уже ждёт в своих
-- обработчиках, второго названия для одного состояния заводить не нужно.
-- ---------------------------------------------------------------------------
INSERT INTO statuses (code, ui_key, name, css_class, counts_in_rating, sort_order)
VALUES ('REVISION', 'revision', 'На доработке', 'rev', FALSE, 6)
ON CONFLICT (code) DO NOTHING;

-- Примечание модератора к возврату. Хранится у заявки, а не только в
-- истории: инициатору его нужно видеть в карточке, а не искать в ленте.
ALTER TABLE requests
    ADD COLUMN IF NOT EXISTS revision_note TEXT;

-- ---------------------------------------------------------------------------
-- 2. Справочник фраз (ДТЗ: «Фраза»)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS phrases (
    id         SERIAL PRIMARY KEY,
    text_kz    TEXT,
    text_ru    TEXT        NOT NULL,
    is_active  BOOLEAN     NOT NULL DEFAULT TRUE,
    created_by VARCHAR(255),
    created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 3. Справочник «Вопрос-Ответ» (ДТЗ: раздел вопросов и ответов)
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS faq (
    id          SERIAL PRIMARY KEY,
    question_kz TEXT,
    question_ru TEXT        NOT NULL,
    answer_kz   TEXT,
    answer_ru   TEXT        NOT NULL,
    sort_order  SMALLINT    NOT NULL DEFAULT 0,
    is_active   BOOLEAN     NOT NULL DEFAULT TRUE,
    created_by  VARCHAR(255),
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ---------------------------------------------------------------------------
-- 4. Справочник подразделений
--
-- Раньше подразделение существовало только текстом в трёх полях сотрудника
-- (branch / dep / dept), поэтому department_parent_id в рейтинге заполнить
-- было нечем, а область видимости руководителя не с чем было сравнивать.
--
-- Строим настоящее дерево: филиал -> департамент -> управление. Источник —
-- те же текстовые поля, других данных о структуре нет.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS departments (
    id         SERIAL PRIMARY KEY,
    name       VARCHAR(255) NOT NULL,
    level      SMALLINT     NOT NULL,      -- 1 филиал, 2 департамент, 3 управление
    parent_id  INTEGER      REFERENCES departments (id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ  NOT NULL DEFAULT now(),
    CONSTRAINT uq_departments_name_parent UNIQUE (name, parent_id)
);
CREATE INDEX IF NOT EXISTS idx_departments_parent ON departments (parent_id);

-- Подразделение сотрудника — самый нижний уровень, до которого дотянулись.
ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS department_id INTEGER REFERENCES departments (id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_employees_department ON employees (department_id);

-- ---------------------------------------------------------------------------
-- 5. Счётчик попыток входа
--
-- Был в памяти процесса: рестарт его обнулял, а за балансировщиком лимит
-- умножался на число экземпляров. Переносим в базу — она у экземпляров общая.
-- ---------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS login_attempts (
    key           VARCHAR(320) PRIMARY KEY,   -- «логин@адрес», в нижнем регистре
    fails         SMALLINT     NOT NULL DEFAULT 0,
    first_at      TIMESTAMPTZ  NOT NULL DEFAULT now(),
    last_at       TIMESTAMPTZ  NOT NULL DEFAULT now(),
    blocked_until TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_login_attempts_blocked ON login_attempts (blocked_until);

-- ---------------------------------------------------------------------------
-- 6. Отзыв токенов
--
-- Выданный токен действовал до конца срока: уволенный сотрудник ходил в
-- систему ещё до восьми часов. Теперь в токен кладётся версия; всё, что
-- выдано до tokens_valid_from, считается недействительным.
--
-- Деактивация учётной записи тоже должна отзывать токены — это делает
-- сервис при смене is_active.
-- ---------------------------------------------------------------------------
ALTER TABLE users
    ADD COLUMN IF NOT EXISTS tokens_valid_from TIMESTAMPTZ NOT NULL DEFAULT now();
