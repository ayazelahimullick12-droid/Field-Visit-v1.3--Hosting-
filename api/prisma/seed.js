/**
 * Prepares an empty database for first use:  npm run db:seed
 * Creates the first admin account (SEED_ADMIN_* in .env or the host's variables) if there is no
 * admin yet, and the default app settings. Safe to run more than once: it does nothing the
 * second time. Plain JavaScript, so it also runs on a server without the development tools.
 */
const path = require('path');
const { PrismaClient } = require('@prisma/client');
const bcrypt = require('bcryptjs');

try { process.loadEnvFile(path.resolve(__dirname, '../.env')); } catch { /* use the environment */ }

const prisma = new PrismaClient();

async function main() {
  if ((await prisma.adminUser.count()) === 0) {
    const pin = process.env.SEED_ADMIN_PIN || '9001';
    const password = process.env.SEED_ADMIN_PASSWORD;
    if (!password || password.startsWith('CHANGE_ME')) throw new Error('Set SEED_ADMIN_PASSWORD first (api/.env, or the host\'s variables).');
    await prisma.adminUser.create({
      data: { id: 'ADM-0001', name: process.env.SEED_ADMIN_NAME || 'System Admin', pin, passwordHash: await bcrypt.hash(password, 10) },
    });
    console.log(`Created the first admin: PIN ${pin}`);
  } else {
    console.log('An admin already exists; none created.');
  }
  const app = await prisma.setting.findUnique({ where: { key: 'app' } });
  if (!app) {
    await prisma.setting.create({ data: { key: 'app', value: { visitTargetDays: 90, managementTabs: { offices: false, people: false, analytics: false } } } });
    console.log('Created the default app settings.');
  }
}

main()
  .catch((err) => { console.error(err.message || err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
