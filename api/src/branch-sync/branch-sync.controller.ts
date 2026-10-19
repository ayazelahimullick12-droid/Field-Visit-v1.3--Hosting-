import { Controller, Get, HttpCode, Post } from '@nestjs/common';
import { AdminOnly } from '../auth/access';
import { config } from '../config';
import { BranchSyncService } from './branch-sync.service';

/** Admin console → Locations & lists → "BRAC branch list": status and "Sync now". */
@AdminOnly()
@Controller('api/branch-sync')
export class BranchSyncController {
  constructor(private sync: BranchSyncService) {}

  @Get()
  async status() {
    return {
      source: config.branchApiUrl,
      tokenSet: !!config.branchApiToken, // never the token itself
      schedule: 'Every day at 2:00 AM (Bangladesh time)',
      last: await this.sync.status(),
    };
  }

  /** Runs a sync now and waits for it (a minute or so for ~13 pages). */
  @Post('run')
  @HttpCode(200)
  async run() {
    const last = await this.sync.run('admin');
    return { source: config.branchApiUrl, tokenSet: !!config.branchApiToken, schedule: 'Every day at 2:00 AM (Bangladesh time)', last };
  }
}
