require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { Client } = require('pg');
const bcrypt = require('bcryptjs');

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

const users = [
  'CORP.NB.RK\\1',
  'CORP.NB.RK\\2',
  'CORP.NB.RK\\3',
  'CORP.NB.RK\\4'
];

async function update() {
  try {
    await client.connect();

    const hash = await bcrypt.hash('12345', 12);

    for (const login of users) {
      const result = await client.query(
        'UPDATE users SET password_hash = $1 WHERE login = $2 RETURNING id, login, is_active',
        [hash, login]
      );

      console.log('UPDATED:', result.rows);
    }

    console.log('');
    console.log('Готово! У всех пользователей установлен пароль: 12345');
  } catch (error) {
    console.error('ERROR:', error.message);
  } finally {
    await client.end();
  }
}

update();