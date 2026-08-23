require('dotenv').config();
const {query,closePool}=require('./src/db/pool');

(async()=>{
  try {
    const r = await query(`
      SELECT id, code, name
      FROM roles
      ORDER BY id
    `);
    console.table(r.rows);
  } catch(e) {
    console.error(e);
  } finally {
    await closePool();
  }
})();
