'use strict';
/**
 * Простой раннер миграций: выполняет .sql-файлы из папки migrations
 * по возрастанию имени, каждый — в отдельной транзакции, и запоминает
 * выполненные в таблице schema_migrations. Повторный запуск ничего не
 * повторяет. Внешних библиотек миграций намеренно не тянем.
 *
 *   node scripts/migrate.js up
 *   node scripts/migrate.js status
 */
const fs = require('fs');
const path = require('path');
const { pool, closePool } = require('../src/db/pool');

const DIR = path.join(__dirname, '..', 'migrations');

async function ensureTable() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      name       VARCHAR(255) PRIMARY KEY,
      applied_at TIMESTAMPTZ NOT NULL DEFAULT now()
    )`);
}

function files() {
  if (!fs.existsSync(DIR)) return [];
  return fs.readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort();
}

async function applied() {
  const { rows } = await pool.query('SELECT name FROM schema_migrations');
  return new Set(rows.map((r) => r.name));
}

async function up() {
  await ensureTable();
  const done = await applied();
  const list = files();
  let count = 0;

  for (const name of list) {
    if (done.has(name)) {
      console.log(`  =  ${name} — уже применена`);
      continue;
    }
    const sql = fs.readFileSync(path.join(DIR, name), 'utf8');
    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      await client.query(sql);
      await client.query('INSERT INTO schema_migrations (name) VALUES ($1)', [name]);
      await client.query('COMMIT');
      console.log(`  +  ${name} — применена`);
      count += 1;
    } catch (err) {
      await client.query('ROLLBACK');
      console.error(`  !  ${name} — ОШИБКА, изменения откачены`);
      throw err;
    } finally {
      client.release();
    }
  }
  console.log(`\nГотово. Файлов: ${list.length}, применено сейчас: ${count}.`);
}

async function status() {
  await ensureTable();
  const done = await applied();
  const list = files();
  console.log('Миграции:');
  for (const name of list) console.log(`  ${done.has(name) ? '[x]' : '[ ]'} ${name}`);
  console.log(`\nВсего: ${list.length}, применено: ${list.filter((n) => done.has(n)).length}.`);
}

(async () => {
  const cmd = process.argv[2] || 'up';
  try {
    if (cmd === 'up') await up();
    else if (cmd === 'status') await status();
    else {
      console.error(`Неизвестная команда: ${cmd}. Доступно: up, status.`);
      process.exitCode = 1;
    }
  } catch (err) {
    console.error('\nМиграции не выполнены:', err.message);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
})();
