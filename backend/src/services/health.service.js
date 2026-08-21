'use strict';
const repo = require('../repositories/health.repo');
const config = require('../config');
const pkg = require('../../package.json');

async function status() {
  const result = {
    ok: true,
    service: pkg.name,
    version: pkg.version,
    env: config.env,
    uptimeSec: Math.round(process.uptime()),
    database: { connected: false },
  };

  if (config.missingEnv.length) result.warnings = [`Не заданы переменные окружения: ${config.missingEnv.join(', ')}`];

  try {
    const info = await repo.ping();
    result.database = { connected: true, name: info.db, serverTime: info.server_time };
    try { result.database.counts = await repo.tableCounts(); }
    catch { result.database.counts = null; result.database.note = 'Таблицы ещё не созданы — выполните npm run db:migrate'; }
  } catch (err) {
    result.ok = false;
    result.database = { connected: false, error: err.message };
  }
  return result;
}

module.exports = { status };
