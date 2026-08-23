'use strict';
/**
 * Импорт учётных записей из employees.json → таблица users.
 * Пароль из файла («12345») используется ТОЛЬКО для получения bcrypt-хеша,
 * в базу открытым текстом не попадает. Ключ — login, повторный запуск
 * обновляет запись. Хеш пересчитывается лишь при создании: у существующего
 * пользователя пароль не затирается.
 *
 *   npm run db:seed:users
 */
const bcrypt = require('bcryptjs');
const config = require('../src/config');
const { query, closePool } = require('../src/db/pool');
const { readJson, report, newStats } = require('./_shared');

const REQUIRED = ['login', 'role', 'fio'];
const SALT_ROUNDS = 10;

(async () => {
  const stats = newStats();
  try {
    const { data, path: file } = readJson(config.seed.employeesPath);
    console.log(`Источник: ${file}`);

    const users = Array.isArray(data.users) ? data.users : [];
    if (!users.length) throw new Error('В файле нет массива users');
    stats.found = users.length;

    const { rows: roleRows } = await query('SELECT id, code FROM roles');
    if (!roleRows.length) throw new Error('Справочник ролей пуст — выполните npm run db:migrate');
    const roleByCode = new Map(roleRows.map((r) => [r.code, r.id]));

    for (let i = 0; i < users.length; i += 1) {
      const u = users[i];
      const miss = REQUIRED.filter((f) => !u[f]);
      if (miss.length) {
        stats.errors.push(`строка ${i + 1}: нет полей — ${miss.join(', ')}`);
        stats.skipped += 1; continue;
      }
      const roleId = roleByCode.get(u.role);
      if (!roleId) {
        stats.errors.push(`строка ${i + 1} (${u.login}): неизвестная роль «${u.role}»`);
        stats.skipped += 1; continue;
      }
      if (!u.pass) {
        stats.errors.push(`строка ${i + 1} (${u.login}): нет пароля, пользователь пропущен`);
        stats.skipped += 1; continue;
      }

      try {
        const { rows: empRows } = await query('SELECT id FROM employees WHERE tnumber = $1', [u.tnumber || '']);
        const employeeId = empRows[0] ? empRows[0].id : null;
        if (!employeeId) stats.errors.push(`предупреждение (${u.login}): сотрудник с табельным ${u.tnumber} не найден, связь не установлена`);

        const hash = await bcrypt.hash(String(u.pass), SALT_ROUNDS);
        const { rows } = await query(
          `INSERT INTO users (employee_id, login, password_hash, role_id, group_code, points_balance)
           VALUES ($1,$2,$3,$4,$5,$6)
           ON CONFLICT (login) DO UPDATE SET
             employee_id = EXCLUDED.employee_id, role_id = EXCLUDED.role_id,
             group_code = EXCLUDED.group_code, points_balance = EXCLUDED.points_balance,
             updated_at = now()
           RETURNING (xmax = 0) AS inserted`,
          [employeeId, u.login, hash, roleId, u.group || null, Number(u.points) || 0]);
        if (rows[0].inserted) stats.inserted += 1; else stats.updated += 1;
      } catch (e) {
        stats.errors.push(`строка ${i + 1} (${u.login}): ${e.message}`);
        stats.skipped += 1;
      }
    }
    report('Импорт пользователей', stats);
    console.log('  Пароли сохранены только как bcrypt-хеши.');
  } catch (err) {
    console.error('\nИмпорт не выполнен:', err.message);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
})();
