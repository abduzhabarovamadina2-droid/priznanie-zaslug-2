'use strict';
const repo = require('../repositories/ratings.repo');
const employeesRepo = require('../repositories/employees.repo');
const AppError = require('../utils/AppError');

async function list(params) {
  const limit = Math.min(Number(params.limit) || 100, 500);
  const offset = Math.max(Number(params.offset) || 0, 0);
  const year = params.year ? Number(params.year) : null;
  const items = await repo.findAll({ year, limit, offset });

  // Место берём из базы: его проставляет npm run db:rank оконной функцией,
  // и там равные баллы делят одно место. Счёт на лету остался запасным
  // путём — на случай, если рейтинг импортировали, а пересчёт не запускали;
  // он считает место по позиции строки и при равных баллах даёт разные места.
  let place = offset;
  const withRank = items.map((r) => {
    place += 1;
    return { ...r, rank: r.rank != null ? r.rank : place, rank_source: r.rank != null ? 'stored' : 'calculated' };
  });
  return { items: withRank, limit, offset, year };
}

async function byEmployee(idOrTnumber, params = {}) {
  const employee = await employeesRepo.findByIdOrTnumber(idOrTnumber);
  if (!employee) throw AppError.notFound('Сотрудник');
  const year = params.year ? Number(params.year) : null;
  const items = await repo.findByEmployee(idOrTnumber, year);
  return { employee, items };
}

module.exports = { list, byEmployee };
