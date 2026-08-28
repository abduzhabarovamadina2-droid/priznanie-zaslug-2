'use strict';
const repo = require('../repositories/requests.repo');
const employeesRepo = require('../repositories/employees.repo');
const meritsRepo = require('../repositories/merits.repo');
const AppError = require('../utils/AppError');
const { can } = require('../config/permissions');
const notifications = require('./notifications.service');
const logger = require('../utils/logger');

/**
 * Переходы статусов взяты из прототипа: заявка создаётся в WAIT, из WAIT
 * модератор переводит в DONE или REJECTED, администратор — в REJECTED_ADMIN,
 * инициатор отзывает в CANCEL. Конечные статусы дальше не двигаются.
 *
 * Кто какой переход выполняет, задаёт PERMISSION_BY_STATUS ниже: отзыв —
 * только инициатор своей заявки, остальные переходы — модерация.
 */
const TRANSITIONS = {
  // Из ожидания модератор либо согласует, либо отклоняет, либо возвращает
  // на доработку; инициатор может отозвать.
  WAIT: ['DONE', 'REJECTED', 'REJECTED_ADMIN', 'CANCEL', 'REVISION'],
  // С доработки инициатор возвращает заявку в ожидание или отзывает её.
  // Модератор может и отсюда отклонить: заявку могли бросить на доработке.
  REVISION: ['WAIT', 'CANCEL', 'REJECTED', 'REJECTED_ADMIN'],
  DONE: [],
  CANCEL: [],
  REJECTED: ['REJECTED_ADMIN'],
  REJECTED_ADMIN: [],
};

/* Право, которое требуется для перехода. Проверяется поверх права маршрута:
   PATCH уже закрыт правом moderate, отзыв — отдельным маршрутом с withdraw. */
const PERMISSION_BY_STATUS = {
  DONE: 'moderate',
  REJECTED: 'moderate',
  REJECTED_ADMIN: 'moderate',
  REVISION: 'moderate',
  CANCEL: 'withdraw',
  // Возврат с доработки в ожидание делает сам инициатор — это часть
  // работы над своей заявкой, а не модерация.
  WAIT: 'create',
};

/* Переходы, при которых баллы возвращаются инициатору: благодарность не
   состоялась. Возврат делается только из статусов, где баллы ещё «висят»
   (WAIT и REVISION). Переход REJECTED → REJECTED_ADMIN разрешён правилами,
   и без этой оговорки он вернул бы баллы второй раз.

   На доработку баллы не возвращаются: заявка не закрыта, человек её
   доработает и отправит снова — списывать второй раз было бы нечестно. */
const REFUNDING = ['CANCEL', 'REJECTED', 'REJECTED_ADMIN'];

/* Статусы, на которых баллы за заявку ещё удерживаются. */
const HOLDING = ['WAIT', 'REVISION'];

const ACTION_BY_STATUS = {
  DONE: 'Согласовано',
  REJECTED: 'Отклонено',
  REJECTED_ADMIN: 'Отклонено администратором',
  REVISION: 'Направлено на доработку',
  CANCEL: 'Отменено инициатором',
  WAIT: 'Отправлено повторно',
};

/**
 * Область видимости заявок.
 *
 * Руководитель отвечает за своё подразделение, а не за весь банк — значит
 * и заявки видит только по нему и вложенным подразделениям. Раньше он
 * получал весь реестр целиком.
 *
 * Модератор, администратор и инициатор видят реестр полностью: первым двум
 * это нужно по роли, а инициатор и так видит только то, что уже согласовано
 * или подано им самим.
 *
 * Если руководитель не привязан к сотруднику, подразделения у него нет —
 * тогда он не видит ничего, кроме собственных заявок. Это осознанно:
 * молча показать всё было бы хуже.
 */
async function scopeFor(user) {
  if (!user || user.role !== 'head') return { scopeDepartmentId: null, scoped: false };
  const departmentId = await repo.departmentOfUser(user.id);
  return { scopeDepartmentId: departmentId || -1, scoped: true, departmentId };
}

async function list(params, user) {
  const limit = Math.min(Number(params.limit) || 100, 500);
  const offset = Math.max(Number(params.offset) || 0, 0);
  const scope = await scopeFor(user);

  const items = await repo.findAll({
    status: params.status || '',
    employee: params.employee || '',
    scopeDepartmentId: scope.scopeDepartmentId,
    limit,
    offset,
  });
  return { items, limit, offset, scoped: scope.scoped };
}

async function getOne(id, user) {
  const row = await repo.findById(id);
  if (!row) throw AppError.notFound('Заявка');

  // Область видимости действует и на карточку: иначе руководитель, не
  // видящий заявку в списке, всё равно открыл бы её по прямой ссылке.
  if (user) {
    const scope = await scopeFor(user);
    // Отвечаем как на несуществующую: по разнице ответов нельзя было бы
    // выяснить, что заявка есть, просто она из чужого подразделения.
    if (scope.scoped && !(await repo.isInScope(row.id, scope.scopeDepartmentId))) {
      throw AppError.notFound('Заявка');
    }
  }

  row.history = await repo.findHistory(id);
  return row;
}

async function create(payload, user) {
  const errors = [];
  if (!payload.tnumber && !payload.employee_id) errors.push('Не указан сотрудник (tnumber или employee_id)');
  const nominationRef = payload.nomination_id || payload.nomination_code || payload.nomination;
  if (!nominationRef) errors.push('Не указана номинация (nomination_id, nomination_code или nomination)');
  if (errors.length) throw AppError.badRequest('Некорректные данные заявки', errors);

  const employee = payload.tnumber
    ? await employeesRepo.findByTnumber(payload.tnumber)
    : await employeesRepo.findByIdOrTnumber(payload.employee_id);
  if (!employee) throw AppError.notFound('Сотрудник');

  // Клиент присылает номинацию как угодно: id, код NOM-101 или название.
  const nomination = await repo.findNomination(nominationRef);
  if (!nomination) throw AppError.badRequest(`Номинация не найдена: ${nominationRef}`);

  // Заслуга: клиент шлёт либо merit_id, либо её название текстом. Во втором
  // случае пробуем найти в справочнике — так заявка связывается с merits,
  // а не остаётся со свободным текстом. Не нашли — не беда: merit_text
  // сохраняется как есть, справочник заслуг заполнен не для всех номинаций.
  let meritId = null;
  if (payload.merit_id) {
    const merit = await meritsRepo.findById(payload.merit_id);
    if (!merit) throw AppError.badRequest(`Заслуга не найдена: ${payload.merit_id}`);
    if (merit.nomination_id !== nomination.id) {
      throw AppError.badRequest(
        `Заслуга «${merit.merit_ru}» относится к номинации «${merit.nomination}», а не к «${nomination.name_ru}»`);
    }
    meritId = merit.id;
  } else if (payload.merit_text) {
    const merit = await meritsRepo.findByText(nomination.id, payload.merit_text);
    if (merit) meritId = merit.id;
  }

  const statusId = await repo.statusIdByCode('WAIT');
  if (!statusId) throw new AppError('Справочник статусов пуст — выполните npm run db:migrate', 500);

  // Дубль и списание баллов проверяются внутри транзакции создания:
  // проверка «до» и запись «после» разошлись бы при двух одновременных
  // запросах. Сюда причина приходит уже названной.
  let id;
  try {
    id = await repo.create({
      request_no: payload.request_no || `ЗС-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`,
      initiator_user_id: user ? user.id : null,
      initiator_name: user ? user.login : null,
      employee_id: employee.id,
      nomination_id: nomination.id,
      merit_id: meritId,
      merit_text: payload.merit_text || '',
      comment: payload.comment || '',
      status_id: statusId,
      // Стоимость берём из справочника, а не из тела запроса: иначе цену
      // заявки назначал бы клиент.
      points: Number(nomination.points) || Number(payload.points) || 0,
    });
  } catch (e) {
    throw ruleToError(e);
  }

  const created = await getOne(id);

  // Уведомления — следствие, а не часть операции: заявка уже в базе, и
  // сбой рассылки не должен превращаться в ошибку создания заявки.
  await notifications.onRequestCreated(created)
    .catch((e) => logger.error('Уведомления о новой заявке не разосланы: ' + e.message));

  // Раньше функция ничего не возвращала — клиент получал пустой item.
  return created;
}

/** Причина отказа из репозитория -> ответ, понятный человеку. */
function ruleToError(e) {
  if (!(e instanceof repo.RuleError)) return e;
  if (e.rule === 'duplicate') return new AppError(e.message, 409, e.details);
  if (e.rule === 'insufficient_points') return new AppError(e.message, 409, e.details);
  return AppError.badRequest(e.message, e.details);
}

async function changeStatus(id, payload, user) {
  const current = await repo.findById(id);
  if (!current) throw AppError.notFound('Заявка');

  const next = String(payload.status || '').toUpperCase();
  const allowed = TRANSITIONS[current.status_code] || [];
  if (!next) throw AppError.badRequest('Не указан новый статус');
  if (!allowed.includes(next)) {
    throw AppError.badRequest(
      `Переход ${current.status_code} → ${next} не предусмотрен`,
      { allowed });
  }

  // Право на конкретный переход. Маршрут проверяет общее право, здесь —
  // право именно на это действие: модератор не отзывает чужие заявки,
  // инициатор не согласовывает свои.
  const needed = PERMISSION_BY_STATUS[next];
  if (needed && user && !can(user.role, needed)) {
    throw new AppError(
      `Недостаточно прав: роль «${user.role}» не может выполнить переход ${current.status_code} → ${next}`,
      403, { role: user.role, required: needed });
  }

  // Отозвать можно только собственную заявку. Администратор — исключение:
  // у него есть право remove и он разбирает спорные случаи.
  if (next === 'CANCEL' && user && user.role !== 'admin'
      && current.initiator_user_id !== user.id) {
    throw new AppError('Отозвать можно только собственную заявку', 403);
  }

  // Отправить доработанную заявку заново может только её инициатор.
  if (next === 'WAIT' && user && user.role !== 'admin'
      && current.initiator_user_id !== user.id) {
    throw new AppError('Отправить заявку повторно может только её инициатор', 403);
  }

  // Возврат без объяснения бесполезен: инициатор не узнает, что править.
  if (next === 'REVISION' && !String(payload.comment || '').trim()) {
    throw AppError.badRequest('Укажите, что нужно исправить: примечание обязательно при возврате на доработку');
  }

  const newStatusId = await repo.statusIdByCode(next);
  if (!newStatusId) throw AppError.badRequest(`Неизвестный статус: ${next}`);

  // Кто выполнил — берём из токена, а не из тела запроса: иначе автора
  // записи в истории назначал бы клиент.
  await repo.updateStatus(id, newStatusId, {
    performedBy: user ? user.id : null,
    performedByName: user ? user.login : null,
    action: ACTION_BY_STATUS[next] || `Статус изменён на ${next}`,
    comment: payload.comment || '',
    refund: HOLDING.includes(current.status_code) && REFUNDING.includes(next),
    // Примечание модератора живёт у заявки, а не только в истории:
    // инициатор должен видеть его в карточке. При повторной отправке
    // очищается — замечание отработано.
    revisionNote: next === 'REVISION' ? String(payload.comment).trim() : (next === 'WAIT' ? null : undefined),
  });

  const updated = await getOne(id);
  await notifications.onStatusChanged(updated, current.status_code, user)
    .catch((e) => logger.error('Уведомления о смене статуса не разосланы: ' + e.message));

  return updated;
}

/**
 * Удаление заявки администратором.
 *
 * Баллы возвращаются только за заявку, которая ещё висела в ожидании:
 * по согласованной благодарность состоялась, и возвращать нечего, а по
 * отклонённой баллы вернулись ещё при отклонении.
 */
async function remove(id, user) {
  const current = await repo.findById(id);
  if (!current) throw AppError.notFound('Заявка');

  const deleted = await repo.remove(id, { refund: current.status_code === 'WAIT' });
  if (!deleted) throw AppError.notFound('Заявка');
  return {
    id: Number(id),
    request_no: current.request_no,
    refunded: current.status_code === 'WAIT' ? current.points : 0,
    deleted_by: user ? user.login : null,
  };
}

/**
 * Повторная отправка доработанной заявки инициатором.
 *
 * Отдельным маршрутом по той же причине, что и отзыв: у инициатора нет
 * права moderate, а PATCH закрыт именно им. Владельца проверяет
 * changeStatus.
 */
async function resubmit(id, payload, user) {
  return changeStatus(id, { status: 'WAIT', comment: payload.comment || '' }, user);
}

/** Отзыв заявки инициатором — отдельное действие под правом withdraw. */
async function withdraw(id, payload, user) {
  return changeStatus(id, { status: 'CANCEL', comment: payload.comment || '' }, user);
}

module.exports = { list, getOne, create, changeStatus, withdraw, resubmit, remove, scopeFor, TRANSITIONS };
