'use strict';
const repo = require('../repositories/merits.repo');

async function list(params = {}) {
  const items = await repo.findAll({
    nomination: params.nomination || '',
    activeOnly: String(params.all || '') !== '1',
  });
  return { items, total: items.length };
}

module.exports = { list };
