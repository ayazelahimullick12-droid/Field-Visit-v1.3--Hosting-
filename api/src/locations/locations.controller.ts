import { Body, Controller, Get, HttpCode, Post, Put } from '@nestjs/common';
import { AdminOnly } from '../auth/access';
import { LocationsService } from './locations.service';

/**
 * The admin console's Locations tab:
 *   GET  /api/locations/status  the last syncs, the rules and the latest report
 *   POST /api/locations/sync    download the branch API now
 *   PUT  /api/locations/rules   save merged spellings / split IDs / dismissed suggestions, then rebuild
 */
@Controller('api/locations')
export class LocationsController {
  constructor(private locations: LocationsService) {}

  @AdminOnly()
  @Get('status')
  status() {
    return this.locations.status();
  }

  @AdminOnly()
  @Post('sync')
  @HttpCode(200)
  async sync() {
    await this.locations.sync('manual');
    return this.locations.status();
  }

  @AdminOnly()
  @Put('rules')
  async rules(@Body() body: any) {
    await this.locations.saveRules(body);
    return this.locations.status();
  }
}
