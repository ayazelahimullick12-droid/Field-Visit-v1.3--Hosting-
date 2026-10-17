import { Body, Controller, Delete, Get, Param, Put } from '@nestjs/common';
import { CurrentUser, SessionUser, StaffOnly } from '../auth/access';
import { VisitsService } from './visits.service';

/** The staff app saves each visit on its own (and queues saves while the phone is offline). */
@Controller('api/visits')
export class VisitsController {
  constructor(private visits: VisitsService) {}

  @Get()
  list(@CurrentUser() user: SessionUser) {
    return this.visits.listFor(user);
  }

  @StaffOnly()
  @Put(':id')
  save(@CurrentUser() user: SessionUser, @Param('id') id: string, @Body() body: any) {
    return this.visits.saveFromStaff(user, id, body);
  }

  @StaffOnly()
  @Delete(':id')
  remove(@CurrentUser() user: SessionUser, @Param('id') id: string) {
    return this.visits.deleteFromStaff(user, id);
  }
}
