require('dotenv').config();
const {query,closePool}=require('./src/db/pool');

(async()=>{
  try {
    const r = await query(`
      SELECT id, employee_id, login, email, role_id, group_code,
             points_balance, is_active
      FROM users
      ORDER BY id
    `);
    console.table(r.rows);
  } catch(e) {
    console.error(e);
  } finally {
    await closePool();
  }
})();
