'use strict';
const repo = require('../repositories/requests.repo');
const employeesRepo = require('../repositories/employees.repo');
const AppError = require('../utils/AppError');

/**
 * Переходы статусов взяты из прототипа: заявка создаётся в WAIT, из WAIT
 * модератор переводит в DONE или REJECTED, администратор — в REJECTED_ADMIN,
 * инициатор отзывает в CANCEL. Конечные статусы дальше не двигаются.
 *
 * TODO (следующий этап): проверять роль вызывающего. Сейчас роль не
 * проверяется — авторизации ещё нет, и делать её «для галочки» не стали.
 */
const TRANSITIONS = {
  WAIT: ['DONE', 'REJECTED', 'REJECTED_ADMIN', 'CANCEL'],
  DONE: [],
  CANCEL: [],
  REJECTED: ['REJECTED_ADMIN'],
  REJECTED_ADMIN: [],
};

const ACTION_BY_STATUS = {
  DONE: 'Согласовано',
  REJECTED: 'Отклонено',
  REJECTED_ADMIN: 'Отклонено администратором',
  CANCEL: 'Отменено инициатором',
};

async function list(params) {
  const limit = Math.min(Number(params.limit) || 100, 500);
  const offset = Math.max(Number(params.offset) || 0, 0);
  const items = await repo.findAll({ status: params.status || '', employee: params.employee || '', limit, offset });
  return { items, limit, offset };
}

async function getOne(id) {
  const row = await repo.findById(id);
  if (!row) throw AppError.notFound('Заявка');
  row.history = await repo.findHistory(id);
  return row;
}

async function create(payload) {
  const errors = [];
  if (!payload.tnumber && !payload.employee_id) errors.push('Не указан сотрудник (tnumber или employee_id)');
  if (!payload.nomination_id) errors.push('Не указана номинация (nomination_id)');
  if (errors.length) throw AppError.badRequest('Некорректные данные заявки', errors);

  const employee = payload.tnumber
    ? await employeesRepo.findByTnumber(payload.tnumber)
    : await employeesRepo.findByIdOrTnumber(payload.employee_id);
  if (!employee) throw AppError.notFound('Сотрудник');

  const statusId = await repo.statusIdByCode('WAIT');
  if (!statusId) throw new AppError('Справочник статусов пуст — выполните npm run db:migrate', 500);

  // TODO (следующий этап): запрет дубля — у инициатора не может висеть вторая
  // заявка по той же заслуге в статусе WAIT (EmployeeGetMeritsCountWait).
  const id = await repo.create({
    request_no: payload.request_no || `ЗС-${new Date().getFullYear()}-${Date.now().toString().slice(-6)}`,
    initiator_user_id: payload.initiator_user_id || null,
    initiator_name: payload.initiator_name || null,
    employee_id: employee.id,
    nomination_id: payload.nomination_id,
    merit_id: payload.merit_id || null,
    merit_text: payload.merit_text || '',
    comment: payload.comment || '',
    status_id: statusId,
    points: Number(payload.points) || 0,
  });
  return getOne(id);
}

async function changeStatus(id, payload) {
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

  const newStatusId = await repo.statusIdByCode(next);
  if (!newStatusId) throw AppError.badRequest(`Неизвестный статус: ${next}`);

  await repo.updateStatus(id, newStatusId, {
    performedBy: payload.performed_by || null,
    performedByName: payload.performed_by_name || null,
    action: ACTION_BY_STATUS[next] || `Статус изменён на ${next}`,
    comment: payload.comment || '',
  });
  return getOne(id);
}

module.exports = { list, getOne, create, changeStatus, TRANSITIONS };
