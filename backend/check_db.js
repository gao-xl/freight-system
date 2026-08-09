const { Client } = require('pg');
async function main() {
  // Test connecting as freight@freight_test
  const c = new Client({ user:'freight', password:'12345678', database:'freight_test', host:'127.0.0.1' });
  await c.connect();
  try {
    const r = await c.query("SELECT current_database() AS db, current_user AS usr");
    console.log('Connected as:', r.rows[0].usr, '@', r.rows[0].db);
  } finally { await c.end(); }
}
main().catch(e => { console.log('FAIL:', e.message); process.exit(1); });