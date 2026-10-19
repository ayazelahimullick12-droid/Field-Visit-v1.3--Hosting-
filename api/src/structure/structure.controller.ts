import { Body, Controller, Get, Put } from '@nestjs/common';
import { Office, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { UserError } from '../common/error.filter';
import { AdminOnly } from '../auth/access';
import { VisitsService } from '../visits/visits.service';
import { renamePlaceInVisit } from '../visits/visit-rules';

const text = (v: any) => String(v ?? '').trim();
const num = (v: any) => (v === '' || v == null || isNaN(Number(v)) ? null : Number(v));
const same = (a: string, b: string) => a.toLowerCase() === b.toLowerCase();

/**
 * A branch office as the screens use it. `district` is the old name for `region`, kept because the
 * analytics code was written when the second level was the district.
 */
export function branchJson(o: Office) {
  return {
    id: o.id, name: o.name, type: o.type, division: o.division, region: o.region, district: o.region,
    area: o.area, lat: o.lat, lng: o.lng, active: o.active, source: o.source,
  };
}

/**
 * Where things are: Division → Region → Area → Branch (BRAC's own structure).
 *   GET/PUT /api/structure  Divisions, Regions, Areas, Regional Offices and Area Offices (Locations & lists tab)
 *   GET/PUT /api/offices    Branch Offices (Branch offices tab)
 * Most rows come from BRAC's ERP (source "erp", kept up to date by branch-sync) and can't be changed
 * here: a save only writes the rows the admin added (source "admin"). Offices store their place by
 * name, as visits do; renaming an admin-added Region or Area also renames it on its offices and
 * on past visits.
 */
@Controller('api')
export class StructureController {
  constructor(private prisma: PrismaService, private visits: VisitsService) {}

  // ---------------- divisions, regions, areas, regional and area offices ----------------

  @Get('structure')
  async structure() {
    const [divisions, regions, areas, offices] = await Promise.all([
      this.prisma.division.findMany({ orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.region.findMany({ orderBy: [{ division: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.area.findMany({ include: { region: true }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
      this.prisma.office.findMany({ where: { type: { in: ['region', 'area'] } }, orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }] }),
    ]);
    return {
      // names of the divisions in use (what the dropdowns list)
      divisions: divisions.filter((d) => d.active).map((d) => d.name),
      divisionList: divisions.map((d) => ({ id: d.id, name: d.name, active: d.active, source: d.source, erpCode: d.erpCode })),
      regions: regions.map((r) => ({ id: r.id, name: r.name, division: r.division, active: r.active, source: r.source, erpCode: r.erpCode })),
      areas: areas.map((a) => ({
        id: a.id, name: a.name, regionId: a.regionId, region: a.region.name, division: a.region.division,
        active: a.active, source: a.source, erpCode: a.erpCode,
      })),
      regionalOffices: offices.filter((o) => o.type === 'region').map((o) => ({ id: o.id, name: o.name, division: o.division, active: o.active, source: o.source, erpCode: o.erpCode })),
      areaOffices: offices.filter((o) => o.type === 'area').map((o) => ({ id: o.id, name: o.name, region: o.region, division: o.division, active: o.active, source: o.source, erpCode: o.erpCode })),
    };
  }

  /** Saves the lists (the admin screen sends them back whole). Only admin-added rows are written. */
  @AdminOnly()
  @Put('structure')
  async saveStructure(@Body() body: any) {
    const [dbDiv, dbReg, dbArea, dbOff] = await Promise.all([
      this.prisma.division.findMany(),
      this.prisma.region.findMany(),
      this.prisma.area.findMany({ include: { region: true } }),
      this.prisma.office.findMany({ where: { type: { in: ['region', 'area'] } } }),
    ]);
    // synced rows can't be changed or removed here: use them exactly as stored, whatever the page sent
    const erpIds = new Set([...dbDiv, ...dbReg, ...dbArea, ...dbOff].filter((x) => x.source === 'erp').map((x) => x.id));
    const mine = (list: any) => (Array.isArray(list) ? list : []).filter((x: any) => !erpIds.has(String(x.id)));
    const divisions = [
      ...dbDiv.filter((d) => d.source === 'erp').map((d) => ({ id: d.id, name: d.name, active: d.active, erp: true })),
      ...mine(body?.divisionList),
    ];
    const regions = [
      ...dbReg.filter((r) => r.source === 'erp').map((r) => ({ id: r.id, name: r.name, division: r.division, active: r.active, erp: true })),
      ...mine(body?.regions),
    ];
    const areas = [
      ...dbArea.filter((a) => a.source === 'erp').map((a) => ({ id: a.id, name: a.name, regionId: a.regionId, active: a.active, erp: true })),
      ...mine(body?.areas),
    ];
    const regionalOffices = mine(body?.regionalOffices);
    const areaOffices = mine(body?.areaOffices);
    const erpOffices = dbOff.filter((o) => o.source === 'erp');

    // ---- check everything first ----
    for (const d of divisions) {
      d.name = text(d.name);
      if (!d.name) throw new UserError('Every division needs a name.');
    }
    divisions.forEach((d, i) => {
      if (divisions.some((x, j) => j !== i && same(x.name, d.name))) throw new UserError(`There are two divisions called "${d.name}".`);
    });
    const divisionNames = new Set(divisions.map((d) => d.name));
    for (const r of regions) {
      r.name = text(r.name);
      if (!r.name) throw new UserError('Every region needs a name.');
      if (!divisionNames.has(r.division)) throw new UserError(`Choose the division for region "${r.name}".`);
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
    const renamedTo = new Map(dbReg.filter((r) => regionById.has(r.id)).map((r) => [r.name, regionById.get(r.id).name]));
    for (const o of areaOffices) if (!regionByName.has(o.region) && renamedTo.has(o.region)) o.region = renamedTo.get(o.region);
    for (const o of regionalOffices) {
      o.name = text(o.name);
      if (!o.name) throw new UserError('Every regional office needs a name.');
      if (!divisionNames.has(o.division)) throw new UserError(`Choose the division for regional office "${o.name}".`);
    }
    for (const o of areaOffices) {
      o.name = text(o.name);
      if (!o.name) throw new UserError('Every area office needs a name.');
      if (!o.region) throw new UserError(`Choose the region for area office "${o.name}".`);
      if (!regionByName.has(o.region)) throw new UserError(`Area office "${o.name}" is in region "${o.region}", which isn't on the list. Move the office to another region first.`);
    }

    // ---- renames of admin-added rows, carried onto offices and past visits ----
    type Move = { from: { region: string; area?: string }; to: { division: string; region: string; area?: string } };
    const moves: Move[] = [];
    const divisionRenames: [string, string][] = [];
    for (const old of dbDiv.filter((d) => d.source !== 'erp')) {
      const d = divisions.find((x) => x.id === old.id);
      if (d && d.name !== old.name) divisionRenames.push([old.name, d.name]);
    }
    for (const old of dbArea.filter((a) => a.source !== 'erp')) {
      const a = areas.find((x) => x.id === old.id);
      if (!a) continue;
      const r = regionById.get(String(a.regionId));
      if (old.name !== a.name || old.region.name !== r.name || old.region.division !== r.division)
        moves.push({ from: { region: old.region.name, area: old.name }, to: { division: r.division, region: r.name, area: a.name } });
    }
    for (const old of dbReg.filter((r) => r.source !== 'erp')) {
      const r = regions.find((x) => x.id === old.id);
      if (r && (old.name !== r.name || old.division !== r.division)) moves.push({ from: { region: old.name }, to: { division: r.division, region: r.name } });
    }

    // ---- refuse to delete something that's still in use ----
    const keptDiv = new Set(divisions.map((d) => String(d.id)));
    const keptReg = new Set(regions.map((r) => String(r.id)));
    const keptArea = new Set(areas.map((a) => String(a.id)));
    for (const old of dbDiv.filter((d) => !keptDiv.has(d.id))) {
      if (regions.some((r) => r.division === old.name)) throw new UserError(`Division "${old.name}" still has regions. Move them or switch the division off instead.`);
    }
    for (const old of dbArea.filter((a) => !keptArea.has(a.id))) {
      const n = await this.prisma.office.count({ where: { type: 'branch', region: old.region.name, area: old.name } });
      if (n) throw new UserError(`Area "${old.name}" still has ${n} branch office(s). Move them or switch the area off instead.`);
    }
    for (const old of dbReg.filter((r) => !keptReg.has(r.id))) {
      const n = (await this.prisma.office.count({ where: { type: 'branch', region: old.name } }))
        + areaOffices.filter((o) => o.region === old.name).length + erpOffices.filter((o) => o.type === 'area' && o.region === old.name).length;
      if (n) throw new UserError(`Region "${old.name}" still has ${n} office(s). Move them or switch the region off instead.`);
    }

    const adminDiv = divisions.filter((d) => !d.erp), adminReg = regions.filter((r) => !r.erp), adminArea = areas.filter((a) => !a.erp);
    await this.prisma.$transaction(async (tx) => {
      for (const [from, to] of divisionRenames) {
        await tx.region.updateMany({ where: { division: from }, data: { division: to } });
        await tx.office.updateMany({ where: { division: from }, data: { division: to } });
      }
      // offices follow renamed / moved areas and regions (areas first: they name their old region)
      for (const m of moves) {
        const where: Prisma.OfficeWhereInput = { region: m.from.region, ...(m.from.area ? { area: m.from.area } : {}), type: { in: ['branch', 'area'] } };
        await tx.office.updateMany({ where, data: { division: m.to.division, region: m.to.region, ...(m.to.area ? { area: m.to.area } : {}) } });
      }

      await tx.area.deleteMany({ where: { source: 'admin', id: { notIn: [...keptArea] } } });
      await tx.region.deleteMany({ where: { source: 'admin', id: { notIn: [...keptReg] } } });
      await tx.division.deleteMany({ where: { source: 'admin', id: { notIn: [...keptDiv] } } });
      // temporary names first, so swapping two names doesn't trip the "unique name" rule
      for (const d of adminDiv) await tx.division.updateMany({ where: { id: String(d.id) }, data: { name: `~${d.id}` } });
      for (const r of adminReg) await tx.region.updateMany({ where: { id: String(r.id) }, data: { name: `~${r.id}` } });
      for (const a of adminArea) await tx.area.updateMany({ where: { id: String(a.id) }, data: { name: `~${a.id}` } });
      for (const d of adminDiv) {
        const data = { name: d.name, active: d.active !== false, source: 'admin' };
        await tx.division.upsert({ where: { id: String(d.id) }, create: { id: String(d.id), ...data }, update: data });
      }
      for (const r of adminReg) {
        const data = { name: r.name, division: r.division, active: r.active !== false, source: 'admin' };
        await tx.region.upsert({ where: { id: String(r.id) }, create: { id: String(r.id), ...data }, update: data });
      }
      for (const a of adminArea) {
        const data = { name: a.name, regionId: String(a.regionId), active: a.active !== false, source: 'admin' };
        await tx.area.upsert({ where: { id: String(a.id) }, create: { id: String(a.id), ...data }, update: data });
      }

      await tx.office.deleteMany({ where: { type: 'region', source: 'admin', id: { notIn: regionalOffices.map((o) => String(o.id)) } } });
      for (const o of regionalOffices) {
        const data = { name: o.name, type: 'region', division: o.division, region: null, area: null, active: o.active !== false, source: 'admin' };
        await tx.office.upsert({ where: { id: String(o.id) }, create: { id: String(o.id), ...data }, update: data });
      }
      await tx.office.deleteMany({ where: { type: 'area', source: 'admin', id: { notIn: areaOffices.map((o) => String(o.id)) } } });
      for (const o of areaOffices) {
        const r = regionByName.get(o.region);
        const data = { name: o.name, type: 'area', division: r.division, region: r.name, area: null, active: o.active !== false, source: 'admin' };
        await tx.office.upsert({ where: { id: String(o.id) }, create: { id: String(o.id), ...data }, update: data });
      }
    }, { timeout: 120_000 });

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

  /**
   * Saves the branch list from the Branch offices tab. Only admin-added branches are written;
   * synced ones are kept as they are. Each branch must sit in an existing Area (which gives its
   * Region and Division).
   */
  @AdminOnly()
  @Put('offices')
  async saveOffices(@Body() list: any[]) {
    if (!Array.isArray(list)) throw new UserError('Expected a list of offices.');
    const [areas, erp] = await Promise.all([
      this.prisma.area.findMany({ include: { region: true } }),
      this.prisma.office.findMany({ where: { type: 'branch', source: 'erp' }, select: { id: true } }),
    ]);
    const erpIds = new Set(erp.map((o) => o.id));
    const rows = list.filter((o) => !erpIds.has(String(o.id))).map((o, i) => {
      const name = text(o.name);
      const region = text(o.region ?? o.district);
      const area = areas.find((a) => a.name === text(o.area) && a.region.name === region);
      if (!name) throw new UserError('Every branch needs a name.');
      if (!area) throw new UserError(`Branch "${name}": area "${text(o.area)}" in region "${region}" doesn't exist. Add it under Locations & lists first.`);
      return {
        id: String(o.id),
        data: {
          name, type: 'branch', division: area.region.division, region: area.region.name, area: area.name,
          lat: num(o.lat), lng: num(o.lng), active: o.active !== false, sortOrder: i, source: 'admin',
        },
      };
    });
    await this.prisma.$transaction(async (tx) => {
      await tx.office.deleteMany({ where: { type: 'branch', source: 'admin', id: { notIn: rows.map((r) => r.id) } } });
      for (const r of rows) await tx.office.upsert({ where: { id: r.id }, create: { id: r.id, ...r.data }, update: r.data });
    }, { timeout: 60_000 });
    return this.offices();
  }
}
