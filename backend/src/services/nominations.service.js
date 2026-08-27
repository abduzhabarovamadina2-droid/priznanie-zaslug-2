'use strict';
const repo = require('../repositories/nominations.repo');

async function list(params = {}) {
  // ?all=1 — вместе с отключёнными: нужно администратору справочников.
  const items = await repo.findAll({ activeOnly: String(params.all || '') !== '1' });
  return { items, total: items.length };
}

module.exports = { list };
