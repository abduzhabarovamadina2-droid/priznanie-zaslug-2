require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function main() {
  try {
    const result = await pool.query(`
      SELECT
        id,
        login,
        email,
        role_id,
        group_code,
        is_active
      FROM users
      ORDER BY id
    `);

    console.table(result.rows);
  } catch (error) {
    console.error("Ошибка:", error.message);
  } finally {
    await pool.end();
  }
}

main();