-- ============================================================================
--  Справочные данные: роли, статусы, номинации.
--  Все значения скопированы из прототипа «Признание заслуг.html»:
--    роли      — MR_ROLES
--    статусы   — объект ts (пять статусов, коды боевого модуля)
--    номинации — MR_NOM_DATA + MR_Store.nominations
--  Ничего не добавлено от себя. Повторный запуск безопасен.
-- ============================================================================

INSERT INTO roles (code, name, group_code) VALUES
    ('initiator', 'Инициатор заявки',                            NULL),
    ('moderator', 'Модератор ДРЧК',                              NULL),
    ('admin',     'Администратор заявок «Признание заслуг»',     'AdminMeritRecognition'),
    ('head',      'Руководитель',                                'HeadMeritRecognition')
ON CONFLICT (code) DO UPDATE
    SET name = EXCLUDED.name, group_code = EXCLUDED.group_code;

-- counts_in_rating: в рейтинг идёт только DONE — так в прототипе (MR_board)
-- и так описано в модели боевого модуля.
INSERT INTO statuses (code, ui_key, name, css_class, counts_in_rating, sort_order) VALUES
    ('WAIT',           'pending',        'В ожидании',                 'rev',  FALSE, 1),
    ('DONE',           'sent',           'Исполнено',                  'ok',   TRUE,  2),
    ('CANCEL',         'withdrawn',      'Отменено',                   'info', FALSE, 3),
    ('REJECTED',       'cancelled',      'Отклонено',                  'bad',  FALSE, 4),
    ('REJECTED_ADMIN', 'rejected_admin', 'Отклонено администратором',  'bad',  FALSE, 5)
ON CONFLICT (code) DO UPDATE
    SET ui_key = EXCLUDED.ui_key, name = EXCLUDED.name,
        css_class = EXCLUDED.css_class, counts_in_rating = EXCLUDED.counts_in_rating,
        sort_order = EXCLUDED.sort_order;

-- Баллы 160/110/70/40/20/10 и порядок — из MR_NOM_DATA.
-- Названия бейджей и цвета — из seed fc прототипа и «Описания проекта».
INSERT INTO nominations (code, name_kz, name_ru, points, badge_name, badge_color, created_by, rec_dt) VALUES
    ('NOM-101', 'Кәсіпқойлық',              'За инновационность',        160, 'KEREMET',   'gold',   'Administrator',       '2026-06-26 10:24+06'),
    ('NOM-102', 'Тиімділік',                'За профессионализм',        110, 'TAMASHA',   'silver', 'Administrator',       '2026-06-26 10:24+06'),
    ('NOM-103', 'Белсенділік',              'За эффективность',           70, 'ǴAJAP',     'bronze', 'Administrator',       '2026-07-07 11:44+06'),
    ('NOM-104', 'Командалық жұмыс стилі',   'За командный стиль работы',  40, 'JARAISYŃ',  'green',  'Administrator',       '2026-07-07 11:44+06'),
    ('NOM-105', 'Жәрдемдесу',               'За содействие',              20, 'BÁREKELDI', 'blue',   'Айгерим Кайруллаева', '2025-12-10 15:54+06'),
    ('NOM-106', 'Корпоративтік рух',        'За корпоративный дух',       10, 'ALǴA',      'yellow', 'Айгерим Кайруллаева', '2025-12-10 15:54+06')
ON CONFLICT (code) DO UPDATE
    SET name_kz = EXCLUDED.name_kz, name_ru = EXCLUDED.name_ru, points = EXCLUDED.points,
        badge_name = EXCLUDED.badge_name, badge_color = EXCLUDED.badge_color,
        updated_at = now();
