import { Body, Controller, HttpCode, Post } from '@nestjs/common';
import { AdminOnly, CurrentUser, SessionUser, StaffOnly } from '../auth/access';
import { ActionItemsService } from './action-items.service';

/**
 * The buttons that change one field of a submitted entry (submitted entries are otherwise read-only).
 * Fixer and story actions always act as the person signed in, whatever the page sends.
 */
@Controller('api/actions')
export class ActionItemsController {
  constructor(private items: ActionItemsService) {}

  // admin
  @AdminOnly() @Post('assign-complaint') @HttpCode(200)
  assign(@Body() body: any) { return this.items.assign(body || {}); }

  @AdminOnly() @Post('extend-deadline') @HttpCode(200)
  extend(@Body() body: any) { return this.items.extend(body || {}); }

  @AdminOnly() @Post('run-deadline-check') @HttpCode(200)
  check() { return this.items.runDeadlineCheck(); }

  @AdminOnly() @Post('relink-office') @HttpCode(200)
  relink(@Body() body: any) { return this.items.relinkOffice(body?.existing, body?.form); }

  // fixers
  @StaffOnly() @Post('start-complaint') @HttpCode(200)
  start(@CurrentUser() u: SessionUser, @Body() body: any) { return this.items.start(u, body || {}); }

  @StaffOnly() @Post('long-term-complaint') @HttpCode(200)
  longTerm(@CurrentUser() u: SessionUser, @Body() body: any) { return this.items.longTerm(u, body || {}); }

  @StaffOnly() @Post('resolve-complaint') @HttpCode(200)
  fixed(@CurrentUser() u: SessionUser, @Body() body: any) { return this.items.fixed(u, body || {}); }

  // stories
  @StaffOnly() @Post('toggle-story-like') @HttpCode(200)
  like(@CurrentUser() u: SessionUser, @Body() body: any) { return this.items.toggleLike(u, body || {}); }

  @StaffOnly() @Post('add-story-comment') @HttpCode(200)
  comment(@CurrentUser() u: SessionUser, @Body() body: any) { return this.items.addComment(u, body || {}); }
}
