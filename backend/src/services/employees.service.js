'use strict';
const repo = require('../repositories/employees.repo');
const AppError = require('../utils/AppError');

async function list(params) {
  const limit = Math.min(Number(params.limit) || 100, 500);
  const offset = Math.max(Number(params.offset) || 0, 0);
  const opts = { limit, offset, search: params.search || '', dept: params.dept || '' };
  const [items, total] = await Promise.all([repo.findAll(opts), repo.countAll(opts)]);
  return { items, total, limit, offset };
}

async function getOne(idOrTnumber) {
  const row = await repo.findByIdOrTnumber(idOrTnumber);
  if (!row) throw AppError.notFound('Сотрудник');
  return row;
}

module.exports = { list, getOne };
