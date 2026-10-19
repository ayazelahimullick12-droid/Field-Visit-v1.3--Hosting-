// Saves every table to one JSON file in api/backups/ (git ignores that folder).
//   node scripts/backup-json.js
// Use it before anything that removes data. It's a plain copy for reading or restoring by hand;
// on the server, use deploy/backup.sh (pg_dump) instead.
const fs = require('fs');
const path = require('path');
try { process.loadEnvFile(path.resolve(__dirname, '../.env')); } catch { /* use the environment */ }
const { PrismaClient } = require('@prisma/client');

(async () => {
  const prisma = new PrismaClient();
  const tables = ['employee', 'adminUser', 'department', 'unit', 'region', 'area', 'office', 'visit', 'setting', 'emailLog'];
  const out = { savedAt: new Date().toISOString() };
  for (const t of tables) if (prisma[t]) out[t] = await prisma[t].findMany();
  const dir = path.resolve(__dirname, '../backups');
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `backup-${out.savedAt.replace(/[:.]/g, '-')}.json`);
  fs.writeFileSync(file, JSON.stringify(out, null, 1));
  console.log(`Saved ${file}`);
  console.log(Object.entries(out).filter(([k]) => k !== 'savedAt').map(([k, v]) => `${k}: ${v.length}`).join(', '));
  await prisma.$disconnect();
})();
