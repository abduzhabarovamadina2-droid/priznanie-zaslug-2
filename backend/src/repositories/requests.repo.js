'use strict';
const { query, withTransaction } = require('../db/pool');

/**
 * Ошибка бизнес-правила, обнаруженного внутри транзакции: дубль заявки или
 * нехватка баллов. Репозиторий не знает про HTTP — он лишь называет причину,
 * а перевод в код ответа делает сервис. Бросать нужно именно изнутри
 * транзакции: только так списание баллов и вставка заявки либо происходят
 * вместе, либо не происходят вовсе.
 */
class RuleError extends Error {
  constructor(rule, message, details) {
    super(message);
    this.name = 'RuleError';
    this.rule = rule;
    this.details = details;
  }
}

const SELECT = `
  SELECT rq.id, rq.request_no, rq.employee_id, e.tnumber, e.fio AS employee_fio,
         e.post AS employee_post, e.dept AS employee_dept,
         rq.initiator_user_id, u.login AS initiator_login,
         rq.nomination_id, n.name_ru AS nomination, n.points AS nomination_points,
         rq.merit_id, rq.merit_text, rq.comment, rq.note, rq.doc_name, rq.revision_note,
         rq.status_id, s.code AS status_code, s.ui_key AS status_ui_key, s.name AS status_name,
         rq.points, rq.created_at, rq.updated_at,
         -- Вложения показываются прямо в реестре, поэтому берём их здесь,
         -- а не отдельным запросом на каждую строку списка.
         (SELECT COUNT(*)::int FROM attachments a WHERE a.request_id = rq.id) AS attachments_count,
         (SELECT a.id       FROM attachments a WHERE a.request_id = rq.id ORDER BY a.id LIMIT 1) AS attachment_id,
         (SELECT a.filename FROM attachments a WHERE a.request_id = rq.id ORDER BY a.id LIMIT 1) AS attachment_name
    FROM requests rq
    JOIN employees e   ON e.id = rq.employee_id
    JOIN statuses  s   ON s.id = rq.status_id
    LEFT JOIN users u  ON u.id = rq.initiator_user_id
    LEFT JOIN nominations n ON n.id = rq.nomination_id`;

/**
 * Заявки с учётом области видимости.
 *
 * scopeDepartmentId — показывать только заявки на сотрудников этого
 * подразделения и всех вложенных. Рекурсивный обход дерева: у руководителя
 * департамента в области видимости все его управления и отделы.
 */
async function findAll({ status = '', employee = '', scopeDepartmentId = null, limit = 100, offset = 0 } = {}) {
  const params = [];
  const where = [];
  if (status)   { params.push(status);   where.push(`s.code = $${params.length}`); }
  if (employee) { params.push(employee); where.push(`e.tnumber = $${params.length}`); }
  if (scopeDepartmentId) {
    params.push(scopeDepartmentId);
    where.push(`e.department_id IN (
      WITH RECURSIVE subtree AS (
        -- Тип параметра внутри рекурсивного запроса Postgres сам не выводит.
        SELECT id FROM departments WHERE id = $${params.length}::int
        UNION ALL
        SELECT d.id FROM departments d JOIN subtree t ON d.parent_id = t.id
      ) SELECT id FROM subtree)`);
  }
  params.push(limit, offset);
  const { rows } = await query(
    `${SELECT} ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY rq.created_at DESC
      LIMIT $${params.length - 1} OFFSET $${params.length}`, params);
  return rows;
}

async function findById(id) {
  const { rows } = await query(`${SELECT} WHERE rq.id = $1`, [id]);
  return rows[0] || null;
}

async function findHistory(requestId) {
  const { rows } = await query(
    `SELECT h.id, h.request_id, h.action, h.comment, h.created_at,
            h.performed_by, h.performed_by_name,
            so.code AS old_status, sn.code AS new_status
       FROM request_history h
       LEFT JOIN statuses so ON so.id = h.old_status_id
       LEFT JOIN statuses sn ON sn.id = h.new_status_id
      WHERE h.request_id = $1
      ORDER BY h.created_at, h.id`, [requestId]);
  return rows;
}

/** Номинация по id, коду (NOM-101) или русскому названию — что придёт от клиента. */
async function findNomination(value) {
  if (value === undefined || value === null || value === '') return null;
  const raw = String(value).trim();
  const asId = Number.parseInt(raw, 10);
  const { rows } = await query(
    `SELECT id, code, name_ru, points FROM nominations
       WHERE ($1::int IS NOT NULL AND id = $1::int)
          OR upper(code) = upper($2)
          OR lower(name_ru) = lower($2)
       LIMIT 1`,
    [Number.isInteger(asId) && asId > 0 ? asId : null, raw]);
  return rows[0] || null;
}

async function statusIdByCode(code) {
  const { rows } = await query('SELECT id FROM statuses WHERE code = $1', [code]);
  return rows[0] ? rows[0].id : null;
}

/**
 * Создание заявки: проверка дубля, списание баллов инициатора, сама заявка
 * и первая запись истории — одной транзакцией.
 *
 * Строка инициатора блокируется первой (FOR UPDATE): она же сериализует два
 * одновременных запроса от одного человека, иначе двойной клик по кнопке
 * создал бы две заявки и списал баллы дважды.
 */
async function create(data) {
  return withTransaction(async (client) => {
    let balance = null;
    if (data.initiator_user_id) {
      const u = await client.query(
        'SELECT points_balance FROM users WHERE id = $1 FOR UPDATE', [data.initiator_user_id]);
      if (!u.rows[0]) throw new RuleError('no_user', 'Учётная запись инициатора не найдена');
      balance = u.rows[0].points_balance;
    }

    // Дубль: у инициатора уже висит заявка на этого же сотрудника по этой же
    // номинации в статусе «В ожидании».
    if (data.initiator_user_id) {
      const dup = await client.query(
        `SELECT id, request_no FROM requests
          WHERE initiator_user_id = $1 AND employee_id = $2
            AND nomination_id = $3 AND status_id = $4
          LIMIT 1`,
        [data.initiator_user_id, data.employee_id, data.nomination_id, data.status_id]);
      if (dup.rows[0]) {
        throw new RuleError('duplicate',
          'По этому сотруднику и этой номинации у Вас уже есть заявка на рассмотрении',
          { request_no: dup.rows[0].request_no, request_id: dup.rows[0].id });
      }
    }

    const cost = Number(data.points) || 0;
    if (balance !== null && cost > balance) {
      throw new RuleError('insufficient_points',
        `Недостаточно баллов: требуется ${cost}, доступно ${balance}`,
        { required: cost, available: balance });
    }

    const { rows } = await client.query(
      `INSERT INTO requests (request_no, initiator_user_id, employee_id, nomination_id,
                             merit_id, merit_text, comment, status_id, points)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9) RETURNING id`,
      [data.request_no, data.initiator_user_id, data.employee_id, data.nomination_id,
       data.merit_id, data.merit_text, data.comment, data.status_id, data.points]);
    const id = rows[0].id;

    await client.query(
      `INSERT INTO request_history (request_id, action, new_status_id, performed_by, performed_by_name, comment)
       VALUES ($1, 'Создано', $2, $3, $4, $5)`,
      [id, data.status_id, data.initiator_user_id, data.initiator_name || null, data.comment || '']);

    if (data.initiator_user_id && cost > 0) {
      await client.query(
        'UPDATE users SET points_balance = points_balance - $1 WHERE id = $2',
        [cost, data.initiator_user_id]);
    }

    return id;
  });
}

/**
 * Смена статуса с записью в историю — одной транзакцией.
 *
 * refund: вернуть баллы инициатору. Решение принимает сервис, здесь только
 * исполнение — вместе со сменой статуса, чтобы баллы не вернулись дважды,
 * если запрос оборвётся посередине.
 */
async function updateStatus(id, newStatusId, { performedBy = null, performedByName = null, action, comment = '', refund = false, revisionNote = undefined }) {
  return withTransaction(async (client) => {
    const cur = await client.query(
      'SELECT status_id, points, initiator_user_id FROM requests WHERE id = $1 FOR UPDATE', [id]);
    if (!cur.rows[0]) return null;
    const { status_id: oldStatusId, points, initiator_user_id: initiator } = cur.rows[0];

    // undefined — примечание не трогаем; null — очищаем (заявку отправили заново).
    if (revisionNote === undefined) {
      await client.query('UPDATE requests SET status_id = $1, updated_at = now() WHERE id = $2',
        [newStatusId, id]);
    } else {
      await client.query(
        'UPDATE requests SET status_id = $1, revision_note = $2, updated_at = now() WHERE id = $3',
        [newStatusId, revisionNote, id]);
    }
    await client.query(
      `INSERT INTO request_history (request_id, action, old_status_id, new_status_id, performed_by, performed_by_name, comment)
       VALUES ($1,$2,$3,$4,$5,$6,$7)`,
      [id, action, oldStatusId, newStatusId, performedBy, performedByName, comment]);

    if (refund && initiator && Number(points) > 0) {
      await client.query(
        'UPDATE users SET points_balance = points_balance + $1 WHERE id = $2', [points, initiator]);
    }
    return id;
  });
}

/**
 * Удаление заявки администратором. Историю уносит вместе с заявкой:
 * ссылаться ей больше не на что.
 *
 * refund: вернуть баллы. Сервис разрешает возврат только для заявки,
 * которая ещё висела в ожидании — по согласованной баллы уже отработали.
 */
async function remove(id, { refund = false } = {}) {
  return withTransaction(async (client) => {
    const cur = await client.query(
      'SELECT points, initiator_user_id FROM requests WHERE id = $1 FOR UPDATE', [id]);
    if (!cur.rows[0]) return false;
    const { points, initiator_user_id: initiator } = cur.rows[0];

    if (refund && initiator && Number(points) > 0) {
      await client.query(
        'UPDATE users SET points_balance = points_balance + $1 WHERE id = $2', [points, initiator]);
    }
    await client.query('DELETE FROM request_history WHERE request_id = $1', [id]);
    await client.query('DELETE FROM requests WHERE id = $1', [id]);
    return true;
  });
}

/** Попадает ли заявка в область видимости подразделения. */
async function isInScope(requestId, scopeDepartmentId) {
  if (!scopeDepartmentId) return true;
  const { rows } = await query(
    `SELECT 1 FROM requests rq
       JOIN employees e ON e.id = rq.employee_id
      WHERE rq.id = $1 AND e.department_id IN (
        WITH RECURSIVE subtree AS (
          SELECT id FROM departments WHERE id = $2::int
          UNION ALL
          SELECT d.id FROM departments d JOIN subtree t ON d.parent_id = t.id
        ) SELECT id FROM subtree)
      LIMIT 1`, [requestId, scopeDepartmentId]);
  return rows.length > 0;
}

/** Подразделение сотрудника, к которому привязана учётная запись. */
async function departmentOfUser(userId) {
  const { rows } = await query(
    `SELECT e.department_id FROM users u
       JOIN employees e ON e.id = u.employee_id
      WHERE u.id = $1`, [userId]);
  return rows[0] ? rows[0].department_id : null;
}

module.exports = { findAll, findById, findHistory, findNomination, departmentOfUser, isInScope, statusIdByCode, create, updateStatus, remove, RuleError };
