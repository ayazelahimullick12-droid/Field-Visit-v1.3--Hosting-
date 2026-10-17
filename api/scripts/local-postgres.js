// FOR YOUR OWN PC ONLY (no admin rights or Docker needed): runs a private PostgreSQL
// on port 5433 with its data in api/.local-pg. Leave this window open while you work.
//   npm run db:local
// Then use in api/.env:
//   DATABASE_URL="postgresql://postgres:postgres@localhost:5433/fvt?schema=public"
// On the real server use a normal PostgreSQL installation instead.
const path = require('path');
const fs = require('fs');
const EmbeddedPostgres = require('embedded-postgres').default;

const dir = path.resolve(__dirname, '../.local-pg');
const fresh = !fs.existsSync(path.join(dir, 'PG_VERSION'));
// UTF8 so Bangla text can be stored (Windows would otherwise pick its own code page)
const pg = new EmbeddedPostgres({
  databaseDir: dir, user: 'postgres', password: 'postgres', port: 5433, persistent: true,
  initdbFlags: ['--encoding=UTF8', '--locale=C'],
});

(async () => {
  if (fresh) await pg.initialise();
  await pg.start();
  if (fresh) await pg.createDatabase('fvt');
  console.log('Local PostgreSQL is running on port 5433 (database "fvt"). Press Ctrl+C to stop.');
  const stop = async () => { await pg.stop(); process.exit(0); };
  process.on('SIGINT', stop);
  process.on('SIGTERM', stop);
})().catch((err) => { console.error(err); process.exit(1); });
