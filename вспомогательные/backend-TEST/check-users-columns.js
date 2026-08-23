require('dotenv').config();
const {query,closePool}=require('./src/db/pool');

(async()=>{
  try {
    const r = await query(`
      SELECT column_name, data_type
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);
    console.table(r.rows);
  } catch(e) {
    console.error(e);
  } finally {
    await closePool();
  }
})();
