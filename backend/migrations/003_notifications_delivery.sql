-- Этап 5: доставка уведомлений и уточнения по вложениям.
--
-- В таблице notifications было только «что показать в интерфейсе». Для
-- почты нужно ещё знать, кому письмо ушло и ушло ли: без этого повторный
-- запуск рассылки продублировал бы письма, а сбой почтового сервера
-- остался бы незамеченным.

ALTER TABLE notifications
    ADD COLUMN IF NOT EXISTS email       VARCHAR(255),
    ADD COLUMN IF NOT EXISTS is_sent     BOOLEAN     NOT NULL DEFAULT FALSE,
    ADD COLUMN IF NOT EXISTS sent_at     TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS send_error  TEXT,
    ADD COLUMN IF NOT EXISTS attempts    SMALLINT    NOT NULL DEFAULT 0;

-- Очередь разбирается по возрастанию времени среди неотправленных.
CREATE INDEX IF NOT EXISTS idx_notifications_queue
    ON notifications (is_sent, created_at)
    WHERE is_sent = FALSE;

-- У сотрудника не было адреса почты — письмо отправлять некуда.
-- Заполняется при импорте, если адрес есть в исходных данных.
ALTER TABLE employees
    ADD COLUMN IF NOT EXISTS email VARCHAR(255);

-- Хеш содержимого: по нему видно повторную загрузку того же файла.
ALTER TABLE attachments
    ADD COLUMN IF NOT EXISTS sha256 CHAR(64);

CREATE INDEX IF NOT EXISTS idx_attachments_sha ON attachments (sha256);
