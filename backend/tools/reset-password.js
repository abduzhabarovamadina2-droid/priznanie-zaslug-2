require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const bcrypt = require("bcryptjs");
const { Pool } = require("pg");

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  ssl: {
    rejectUnauthorized: false
  }
});

async function main() {
  const login = "CORP.NB.RK\\2";
  const newPassword = "Merit2026!";

  try {
    const passwordHash = await bcrypt.hash(newPassword, 10);

    const result = await pool.query(
      `
      UPDATE users
      SET password_hash = $1,
          updated_at = NOW()
      WHERE login = $2
      RETURNING id, login, role_id, is_active
      `,
      [passwordHash, login]
    );

    if (result.rows.length === 0) {
      console.log("Пользователь не найден:", login);
    } else {
      console.log("Пароль успешно изменён:");
      console.table(result.rows);
      console.log("Логин:", login);
      console.log("Новый пароль:", newPassword);
    }
  } catch (error) {
    console.error("Ошибка:", error.message);
  } finally {
    await pool.end();
  }
}

main();