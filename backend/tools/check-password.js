require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const bcrypt = require('bcryptjs');
const { Client } = require('pg');

const client = new Client({
  connectionString: process.env.DATABASE_URL
});

async function check() {
  try {
    await client.connect();

    const result = await client.query(
      'SELECT id, login, password_hash FROM users WHERE login = $1',
      ['CORP.NB.RK\\2']
    );

    console.log('USER FOUND:', result.rows.length > 0);

    if (!result.rows.length) {
      return;
    }

    const hash = result.rows[0].password_hash;

    console.log('ID:', result.rows[0].id);
    console.log('LOGIN:', result.rows[0].login);
    console.log('HASH LENGTH:', hash ? hash.length : 0);

    const password12345 = await bcrypt.compare('12345', hash);
    const passwordMerit = await bcrypt.compare('Merit2026!', hash);

    console.log('12345:', password12345);
    console.log('Merit2026!:', passwordMerit);

  } catch (error) {
    console.error('ERROR:', error.message);
  } finally {
    await client.end();
  }
}

check();