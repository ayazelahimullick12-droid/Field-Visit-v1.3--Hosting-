import { Body, Controller, Get, Put } from '@nestjs/common';
import { Office, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { UserError } from '../common/error.filter';
import { AdminOnly } from '../auth/access';
import { VisitsService } from '../visits/visits.service';
import { renamePlaceInVisit } from '../visits/visit-rules';
import { DIVISIONS } from './divisions';

const text = (v: any) => String(v ?? '').trim();
const num = (v: any) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * A branch office as the screens use it. `district` is the old name for `region`, kept so the
 * coverage map and analytics (written when the second level was the district) keep working.
 */
export function branchJson(o: Office) {
  return {
    id: o.id, name: o.name, type: o.type, division: o.division, region: o.region, district: o.region,
    area: o.area, lat: o.lat, lng: o.lng, active: o.active,
  };
}

/**
 * Where things are: Division → Region → Area → Branch.
 *   GET/PUT /api/structure  Regions, Areas, Regional Offices and Area Offices (Locations & lists tab)
 *   GET/PUT /api/offices    Branch Offices (Offices tab)
 * Divisions are fixed (divisions.ts). Offices store their place by name, as visits do; renaming a
 * Region or Area here also renames it on its offices and on past visits.
 */
@Controller('api')
export class StructureController {
  constructor(private prisma: PrismaService, private visits: VisitsService) {}

  // ---------------- regions, areas, regional and area offices ----------------

  @Get('structure')
  async structure() {
    const [regions, areas, offices] = await Promise.all([
      this.prisma.region.findMany({ orderBy: [{ division: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.area.findMany({ include: { region: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.office.findMany({ where: { type: { in: ['region', 'area'] } }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    ]);
    return {
      divisions: DIVISIONS,
      regions: regions.map((r) => ({ id: r.id, name: r.name, division: r.division, active: r.active })),
      areas: areas.map((a) => ({ id: a.id, name: a.name, regionId: a.regionId, region: a.region.name, division: a.region.division, active: a.active })),
      regionalOffices: offices.filter((o) => o.type === 'region').map((o) => ({ id: o.id, name: o.name, division: o.division, active: o.active })),
      areaOffices: offices.filter((o) => o.type === 'area').map((o) => ({ id: o.id, name: o.name, region: o.region, division: o.division, active: o.active })),
    };
  }

  /** Saves all four lists at once (the admin screen sends them back whole). */
  @AdminOnly()
  @Put('structure')
  async saveStructure(@Body() body: any) {
    const regions: any[] = Array.isArray(body?.regions) ? body.regions : [];
    const areas: any[] = Array.isArray(body?.areas) ? body.areas : [];
    const regionalOffices: any[] = Array.isArray(body?.regionalOffices) ? body.regionalOffices : [];
    const areaOffices: any[] = Array.isArray(body?.areaOffices) ? body.areaOffices : [];

    // ---- check everything first ----
    for (const r of regions) {
      r.name = text(r.name);
      if (!r.name) throw new UserError('Every region needs a name.');
      if (!DIVISIONS.includes(r.division)) throw new UserError(`Choose the division for region "${r.name}".`);
    }
    regions.forEach((r, i) => {
      if (regions.some((x, j) => j !== i && same(x.name, r.name))) throw new UserError(`There are two regions called "${r.name}".`);
    });
    const regionById = new Map(regions.map((r) => [String(r.id), r]));
    for (const a of areas) {
      a.name = text(a.name);
      if (!a.name) throw new UserError('Every area needs a name.');
      if (!regionById.has(String(a.regionId))) throw new UserError(`Choose the region for area "${a.name}".`);
    }
    areas.forEach((a, i) => {
      if (areas.some((x, j) => j !== i && x.regionId === a.regionId && same(x.name, a.name)))
        throw new UserError(`Region ${regionById.get(String(a.regionId)).name} has two areas called "${a.name}".`);
    });
    const regionByName = new Map(regions.map((r) => [r.name, r]));
    // an area office may still name its region by the old name when that region is renamed in this save
    const [oldRegions, oldAreas] = await Promise.all([
      this.prisma.region.findMany(),
      this.prisma.area.findMany({ include: { region: true } }),
    ]);
    const renamedTo = new Map(oldRegions.filter((r) => regionById.has(r.id)).map((r) => [r.name, regionById.get(r.id).name]));
    for (const o of areaOffices) if (!regionByName.has(o.region) && renamedTo.has(o.region)) o.region = renamedTo.get(o.region);
    for (const o of regionalOffices) {
      o.name = text(o.name);
      if (!o.name) throw new UserError('Every regional office needs a name.');
      if (!DIVISIONS.includes(o.division)) throw new UserError(`Choose the division for regional office "${o.name}".`);
    }
    for (const o of areaOffices) {
      o.name = text(o.name);
      if (!o.name) throw new UserError('Every area office needs a name.');
      if (!o.region) throw new UserError(`Choose the region for area office "${o.name}".`);
      if (!regionByName.has(o.region)) throw new UserError(`Area office "${o.name}" is in region "${o.region}", which isn't on the list. Move the office to another region first.`);
    }

    // ---- work out renames and moves, to carry them onto offices and past visits ----
    type Move = { from: { region: string; area?: string }; to: { division: string; region: string; area?: string } };
    const moves: Move[] = [];
    for (const old of oldAreas) {
      const a = areas.find((x) => x.id === old.id);
      if (!a) continue;
      const r = regionById.get(String(a.regionId));
      if (old.name !== a.name || old.region.name !== r.name || old.region.division !== r.division)
        moves.push({ from: { region: old.region.name, area: old.name }, to: { division: r.division, region: r.name, area: a.name } });
    }
    for (const old of oldRegions) {
      const r = regions.find((x) => x.id === old.id);
      if (r && (old.name !== r.name || old.division !== r.division))
        moves.push({ from: { region: old.name }, to: { division: r.division, region: r.name } });
    }

    // ---- refuse to delete a region or area that still has offices ----
    const keptRegionIds = new Set(regions.map((r) => String(r.id)));
    const keptAreaIds = new Set(areas.map((a) => String(a.id)));
    // (branches are saved on their own tab; area offices are in this same save, so count what's being kept)
    for (const old of oldAreas.filter((a) => !keptAreaIds.has(a.id))) {
      const n = await this.prisma.office.count({ where: { type: 'branch', region: old.region.name, area: old.name } });
      if (n) throw new UserError(`Area "${old.name}" still has ${n} branch office(s). Move them or switch the area off instead.`);
    }
    for (const old of oldRegions.filter((r) => !keptRegionIds.has(r.id))) {
      const n = (await this.prisma.office.count({ where: { type: 'branch', region: old.name } })) + areaOffices.filter((o) => o.region === old.name).length;
      if (n) throw new UserError(`Region "${old.name}" still has ${n} office(s). Move them or switch the region off instead.`);
    }

    await this.prisma.$transaction(async (tx) => {
      // offices follow renamed / moved areas and regions (areas first: they name their old region)
      for (const m of moves) {
        const where: Prisma.OfficeWhereInput = { region: m.from.region, ...(m.from.area ? { area: m.from.area } : {}), type: { in: ['branch', 'area'] } };
        await tx.office.updateMany({ where, data: { division: m.to.division, region: m.to.region, ...(m.to.area ? { area: m.to.area } : {}) } });
      }

      await tx.area.deleteMany({ where: { id: { notIn: [...keptAreaIds] } } });
      // temporary names first, so swapping two names doesn't trip the "unique name" rule
      for (const r of regions) await tx.region.updateMany({ where: { id: String(r.id) }, data: { name: `~${r.id}` } });
      for (const a of areas) await tx.area.updateMany({ where: { id: String(a.id) }, data: { name: `~${a.id}` } });
      await tx.region.deleteMany({ where: { id: { notIn: [...keptRegionIds] } } });
      for (const [i, r] of regions.entries()) {
        const data = { name: r.name, division: r.division, active: r.active !== false, sortOrder: i };
        await tx.region.upsert({ where: { id: String(r.id) }, create: { id: String(r.id), ...data }, update: data });
      }
      for (const [i, a] of areas.entries()) {
        const data = { name: a.name, regionId: String(a.regionId), active: a.active !== false, sortOrder: i };
        await tx.area.upsert({ where: { id: String(a.id) }, create: { id: String(a.id), ...data }, update: data });
      }

      await tx.office.deleteMany({ where: { type: 'region', id: { notIn: regionalOffices.map((o) => String(o.id)) } } });
      for (const [i, o] of regionalOffices.entries()) {
        const data = { name: o.name, type: 'region', division: o.division, region: null, area: null, active: o.active !== false, sortOrder: i };
        await tx.office.upsert({ where: { id: String(o.id) }, create: { id: String(o.id), ...data }, update: data });
      }
      await tx.office.deleteMany({ where: { type: 'area', id: { notIn: areaOffices.map((o) => String(o.id)) } } });
      for (const [i, o] of areaOffices.entries()) {
        const r = regionByName.get(o.region);
        const data = { name: o.name, type: 'area', division: r.division, region: r.name, area: null, active: o.active !== false, sortOrder: i };
        await tx.office.upsert({ where: { id: String(o.id) }, create: { id: String(o.id), ...data }, update: data });
      }
    }, { timeout: 60_000 });

    // past visits follow too, one visit at a time (each is locked while it changes)
    if (moves.length) {
      for (const v of await this.visits.all()) {
        if (!moves.some((m) => renamePlaceInVisit(v, m.from, m.to))) continue;
        await this.visits.update(v.id, (visit) => {
          for (const m of moves) {
            const next = renamePlaceInVisit(visit, m.from, m.to);
            if (next) Object.assign(visit, next);
          }
        });
      }
    }
    return this.structure();
  }

  // ---------------- branch offices ----------------

  @Get('offices')
  async offices() {
    const rows = await this.prisma.office.findMany({ where: { type: 'branch' }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] });
    return rows.map(branchJson);
  }

  /** Saves the whole branch list. Each branch must sit in an existing Area (which gives its Region and Division). */
  @AdminOnly()
  @Put('offices')
  async saveOffices(@Body() list: any[]) {
    if (!Array.isArray(list)) throw new UserError('Expected a list of offices.');
    const areas = await this.prisma.area.findMany({ include: { region: true } });
    const rows = list.map((o, i) => {
      const name = text(o.name);
      const region = text(o.region ?? o.district);
      const area = areas.find((a) => a.name === text(o.area) && a.region.name === region);
      if (!name) throw new UserError('Every branch needs a name.');
      if (!area) throw new UserError(`Branch "${name}": area "${text(o.area)}" in region "${region}" doesn't exist. Add it under Locations & lists first.`);
      return {
        id: String(o.id),
        data: {
          name, type: 'branch', division: area.region.division, region: area.region.name, area: area.name,
          lat: num(o.lat), lng: num(o.lng), active: o.active !== false, sortOrder: i,
        },
      };
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.office.deleteMany({ where: { type: 'branch', id: { notIn: rows.map((r) => r.id) } } });
      for (const r of rows) await tx.office.upsert({ where: { id: r.id }, create: { id: r.id, ...r.data }, update: r.data });
    }, { timeout: 60_000 });
    return this.offices();
  }
}
