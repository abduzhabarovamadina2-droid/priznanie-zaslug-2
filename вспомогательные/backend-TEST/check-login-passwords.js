require('dotenv').config();
const bcrypt = require('bcryptjs');
const {query,closePool}=require('./src/db/pool');

(async()=>{
  try {
    const r = await query(`
      SELECT id, login, password_hash
      FROM users
      ORDER BY id
    `);

    for (const u of r.rows) {
      const ok = u.password_hash
        ? await bcrypt.compare('12345', u.password_hash)
        : false;

      console.log(u.login, '=> password 12345:', ok);
    }
  } catch(e) {
    console.error(e);
  } finally {
    await closePool();
  }
})();
