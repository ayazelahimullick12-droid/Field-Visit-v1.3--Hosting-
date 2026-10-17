import { Controller, Post, Req } from '@nestjs/common';
import { Request } from 'express';
import * as fs from 'fs';
import * as path from 'path';
import { config } from '../config';
import { UserError } from '../common/error.filter';
import { makeId } from '../common/ids';

const EXT: Record<string, string> = {
  'audio/webm': 'webm', 'audio/ogg': 'ogg', 'audio/mp4': 'm4a', 'audio/aac': 'aac', 'audio/mpeg': 'mp3',
  'audio/wav': 'wav', 'audio/x-wav': 'wav', 'image/jpeg': 'jpg', 'image/png': 'png', 'image/webp': 'webp',
};

/**
 * Voice notes (and any other file) are stored on disk in UPLOAD_DIR and served from /uploads/<name>.
 * The raw file is the request body (main.ts reads it with express.raw).
 */
@Controller('api/uploads')
export class UploadsController {
  @Post()
  upload(@Req() req: Request) {
    const body = req.body as Buffer;
    if (!Buffer.isBuffer(body) || body.length === 0) throw new UserError('The recording was empty.');
    const type = String(req.headers['content-type'] || '').split(';')[0].trim();
    const name = `${makeId('VN', 10)}.${EXT[type] || 'bin'}`;
    fs.mkdirSync(config.uploadDir, { recursive: true });
    fs.writeFileSync(path.join(config.uploadDir, name), body);
    return { url: `/uploads/${name}` };
  }
}
