import 'reflect-metadata';
import { config } from './config';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import * as express from 'express';
import * as fs from 'fs';
import cookieParser from 'cookie-parser';
import { AppModule } from './app.module';
import { ErrorFilter } from './common/error.filter';

/**
 * Starts one server that does everything:
 *   /api/...     the API (NestJS controllers)
 *   /uploads/... voice notes
 *   everything else: the website built from web/ (Next.js static export)
 */
async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false });
  app.set('trust proxy', 1); // behind Nginx/IIS: trust X-Forwarded-Proto for secure cookies
  app.disable('x-powered-by');
  app.use(cookieParser());
  app.use('/api/uploads', express.raw({ type: () => true, limit: '25mb' }));
  // large enough for a visit carrying several downscaled photos
  app.use(express.json({ limit: '20mb' }));
  app.useGlobalFilters(new ErrorFilter());

  app.use('/uploads', express.static(config.uploadDir, { maxAge: '30d', immutable: true }));

  if (fs.existsSync(config.webDir)) {
    // /staff, /admin and /summary also answer as /staff.html etc. (links inside the app use those)
    app.use(express.static(config.webDir, { extensions: ['html'], maxAge: '1h' }));
  } else {
    console.warn(`[web] ${config.webDir} not found: run "npm run build" in web/ to serve the website from here.`);
  }

  await app.listen(config.port);
  console.log(`Field Visit Tracker running at http://localhost:${config.port}`);
}

bootstrap();
