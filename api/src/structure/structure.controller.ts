import { Controller, Get } from '@nestjs/common';
import { Office } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';

/**
 * A branch office as the screens use it. `district` is the old name for `region`, kept so the
 * coverage and analytics code (written when the second level was the district) keeps working.
 * `placements` lists every Division › Region › Area the branch is in (one per programme's area).
 */
export function branchJson(o: Office) {
  return {
    id: o.id, name: o.name, type: o.type, code: o.code, division: o.division, region: o.region, district: o.region,
    area: o.area, lat: o.lat, lng: o.lng, active: o.active,
    placements: ((o.placements as any[]) || []).map(({ division, region, area }) => ({ division, region, area })),
  };
}

/**
 * Where things are: Division → Region → Area → Branch, all from BRAC's branch API
 * (api/src/locations). Read-only here.
 *   GET /api/structure  divisions, regions, areas, Regional Offices and Area Offices
 *   GET /api/offices    Branch Offices
 */
@Controller('api')
export class StructureController {
  constructor(private prisma: PrismaService) {}

  @Get('structure')
  async structure() {
    const [regions, areas, offices] = await Promise.all([
      this.prisma.region.findMany({ orderBy: [{ division: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.area.findMany({ include: { region: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.office.findMany({ where: { type: { in: ['region', 'area'] } }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    ]);
    const place = (o: Office) => ({ id: o.id, name: o.name, division: o.division, region: o.region, area: o.area, active: o.active });
    return {
      divisions: [...new Set(regions.map((r) => r.division))].sort(),
      regions: regions.map((r) => ({ id: r.id, name: r.name, division: r.division, active: r.active })),
      areas: areas.map((a) => ({ id: a.id, name: a.name, regionId: a.regionId, region: a.region.name, division: a.region.division, active: a.active })),
      regionalOffices: offices.filter((o) => o.type === 'region').map(place),
      areaOffices: offices.filter((o) => o.type === 'area').map(place),
    };
  }

  @Get('offices')
  async offices() {
    const rows = await this.prisma.office.findMany({ where: { type: 'branch' }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    return rows.map(branchJson);
  }
}
