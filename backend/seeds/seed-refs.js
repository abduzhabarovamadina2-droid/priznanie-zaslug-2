'use strict';
/**
 * Импорт справочников «Фраза» и «Вопрос-Ответ» из frontend/refs.json.
 *
 * Ключ у фразы — её текст, у вопроса — сам вопрос: своих кодов у этих
 * записей в прототипе нет, а текст внутри справочника уникален. Повторный
 * запуск обновляет запись, дублей не плодит.
 *
 *   npm run db:seed:refs
 */
const config = require('../src/config');
const { query, closePool } = require('../src/db/pool');
const { readJson, report, newStats } = require('./_shared');

async function importPhrases(rows, stats) {
  for (let i = 0; i < rows.length; i += 1) {
    const p = rows[i];
    if (!p.text_ru || !String(p.text_ru).trim()) {
      stats.errors.push(`фраза ${i + 1}: пустой текст`);
      stats.skipped += 1; continue;
    }
    try {
      const found = await query('SELECT id FROM phrases WHERE text_ru = $1', [p.text_ru]);
      if (found.rows[0]) {
        await query('UPDATE phrases SET text_kz = $1, is_active = $2, updated_at = now() WHERE id = $3',
          [p.text_kz || null, p.is_active !== false, found.rows[0].id]);
        stats.updated += 1;
      } else {
        await query('INSERT INTO phrases (text_ru, text_kz, is_active, created_by) VALUES ($1,$2,$3,$4)',
          [p.text_ru, p.text_kz || null, p.is_active !== false, 'import']);
        stats.inserted += 1;
      }
    } catch (e) {
      stats.errors.push(`фраза ${i + 1}: ${e.message}`);
    }
  }
}

async function importFaq(rows, stats) {
  for (let i = 0; i < rows.length; i += 1) {
    const q = rows[i];
    if (!q.question_ru || !q.answer_ru) {
      stats.errors.push(`вопрос ${i + 1}: не заполнены вопрос или ответ`);
      stats.skipped += 1; continue;
    }
    try {
      const found = await query('SELECT id FROM faq WHERE question_ru = $1', [q.question_ru]);
      if (found.rows[0]) {
        await query(
          `UPDATE faq SET answer_ru = $1, question_kz = $2, answer_kz = $3,
                          sort_order = $4, is_active = $5, updated_at = now()
            WHERE id = $6`,
          [q.answer_ru, q.question_kz || null, q.answer_kz || null,
           Number(q.sort_order) || i + 1, q.is_active !== false, found.rows[0].id]);
        stats.updated += 1;
      } else {
        await query(
          `INSERT INTO faq (question_ru, question_kz, answer_ru, answer_kz, sort_order, is_active, created_by)
           VALUES ($1,$2,$3,$4,$5,$6,$7)`,
          [q.question_ru, q.question_kz || null, q.answer_ru, q.answer_kz || null,
           Number(q.sort_order) || i + 1, q.is_active !== false, 'import']);
        stats.inserted += 1;
      }
    } catch (e) {
      stats.errors.push(`вопрос ${i + 1}: ${e.message}`);
    }
  }
}

(async () => {
  const stats = newStats();
  try {
    const { data, path: file } = readJson(config.seed.refsPath);
    console.log(`Источник: ${file}`);

    const phrases = Array.isArray(data.phrases) ? data.phrases : [];
    const faq = Array.isArray(data.faq) ? data.faq : [];
    if (!phrases.length && !faq.length) throw new Error('В файле нет ни фраз, ни вопросов-ответов');
    stats.found = phrases.length + faq.length;

    await importPhrases(phrases, stats);
    await importFaq(faq, stats);

    report('Импорт фраз и вопросов-ответов', stats);
  } catch (e) {
    console.error('\nИмпорт прерван: ' + e.message);
    process.exitCode = 1;
  } finally {
    await closePool();
  }
})();
