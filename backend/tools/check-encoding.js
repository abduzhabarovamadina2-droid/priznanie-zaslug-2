const { query, closePool } = require('../src/db/pool');

async function main() {
  const text = 'Тестовая кириллица Признание заслуг №3';

  const result = await query(
    "SELECT $1::text AS text",
    [text]
  );

  console.log('Отправили:');
  console.log(text);

  console.log('Получили из PostgreSQL:');
  console.log(result.rows[0].text);

  await closePool();
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
