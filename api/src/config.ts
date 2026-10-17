import * as path from 'path';

// Reads api/.env (Node 20.12+). Real environment variables win over the file.
try {
  process.loadEnvFile(path.resolve(__dirname, '../.env'));
} catch {
  /* no .env file: use the environment as is */
}

const isProd = process.env.NODE_ENV === 'production';

if (!process.env.APP_SECRET || process.env.APP_SECRET.startsWith('CHANGE_ME')) {
  if (isProd) throw new Error('Set APP_SECRET in api/.env before starting in production.');
  console.warn('[config] APP_SECRET is not set: using a development secret. Never do this on the server.');
}

/** Every setting the API reads, in one place. */
export const config = {
  isProd,
  port: Number(process.env.PORT || 4000),
  secret: process.env.APP_SECRET && !process.env.APP_SECRET.startsWith('CHANGE_ME') ? process.env.APP_SECRET : 'dev-only-secret-do-not-use',
  appUrl: (process.env.APP_URL || '').replace(/\/$/, ''),
  uploadDir: process.env.UPLOAD_DIR || path.resolve(__dirname, '../uploads'),
  // the website built by `npm run build` in web/ (Next.js static export)
  webDir: process.env.WEB_DIR || path.resolve(__dirname, '../../web/out'),
  staffSessionDays: 30,
  adminSessionHours: 12,
};
