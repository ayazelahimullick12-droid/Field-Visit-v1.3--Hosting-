import { Body, Controller, Get, Post, Put } from '@nestjs/common';
import { AdminOnly } from '../auth/access';
import { MailService } from './mail.service';

/** Admin console → Email settings: the account the app sends emails from. */
@AdminOnly()
@Controller('api/mail')
export class MailController {
  constructor(private mail: MailService) {}

  @Get('settings')
  get() {
    return this.mail.publicSettings();
  }

  @Put('settings')
  save(@Body() body: any) {
    return this.mail.saveSettings(body);
  }

  @Post('test')
  test(@Body() body: any) {
    return this.mail.sendTest(String(body?.to || '').trim());
  }
}
