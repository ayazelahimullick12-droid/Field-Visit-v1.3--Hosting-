import { ArgumentsHost, Catch, ExceptionFilter, HttpException } from '@nestjs/common';
import { Response } from 'express';

/**
 * Every error goes to the browser as { error: "message" } — the shape the screens read.
 * Throw `new HttpException({ error: '...', visit }, 409)` to send extra fields.
 */
@Catch()
export class ErrorFilter implements ExceptionFilter {
  catch(err: unknown, host: ArgumentsHost) {
    const res = host.switchToHttp().getResponse<Response>();
    if (err instanceof HttpException) {
      const body = err.getResponse() as any;
      const status = err.getStatus();
      if (body && typeof body === 'object' && 'error' in body && !('statusCode' in body)) return res.status(status).json(body);
      const message = Array.isArray(body?.message) ? body.message.join(', ') : body?.message || err.message;
      return res.status(status).json({ error: message });
    }
    console.error(err);
    return res.status(500).json({ error: 'Something went wrong on the server. Please try again.' });
  }
}

/** A 400 with a readable message, used for every "you can't do that" rule. */
export class UserError extends HttpException {
  constructor(message: string, status = 400) {
    super({ error: message }, status);
  }
}
