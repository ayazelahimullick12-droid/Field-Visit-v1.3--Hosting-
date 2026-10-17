import { Controller, Get } from '@nestjs/common';
import { Public } from '../auth/access';
import { PrismaService } from '../common/prisma.service';
import { VisitsService } from '../visits/visits.service';
import { anonymised } from '../visits/visit-rules';
import { DEFAULT_APP_SETTINGS } from '../reference-data/reference-data.controller';
import { branchJson } from '../structure/structure.controller';

/**
 * The public summary page (/summary.html) reads this without signing in.
 * It holds no names, contact details, photos or text: only what the figures are counted from.
 */
@Controller('api/public')
export class PublicController {
  constructor(private prisma: PrismaService, private visits: VisitsService) {}

  @Public()
  @Get('summary')
  async summary() {
    const [visits, offices, employees, setting] = await Promise.all([
      this.visits.all(),
      this.prisma.office.findMany({ where: { type: 'branch' } }),
      this.prisma.employee.findMany({ select: { id: true, roles: true, department: true } }),
      this.prisma.setting.findUnique({ where: { key: 'app' } }),
    ]);
    // the charts reach back 12 months at most
    const since = new Date();
    since.setMonth(since.getMonth() - 13);
    const from = since.toISOString().slice(0, 10);
    return {
      visits: visits.filter((v) => !v.date || v.date >= from).map(anonymised),
      offices: offices.map(branchJson),
      employees,
      settings: { ...DEFAULT_APP_SETTINGS, ...((setting?.value as object) || {}) },
    };
  }

  /** For uptime checks: GET /api/public/health */
  @Public()
  @Get('health')
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { ok: true, time: new Date().toISOString() };
  }
}
