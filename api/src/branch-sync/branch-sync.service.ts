import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { makeId } from '../common/ids';
import { config } from '../config';
import { VisitsService } from '../visits/visits.service';
import { relinkOffice, renamePlaceInVisit } from '../visits/visit-rules';

/** One branch as BRAC's ERP branch list sends it (only the fields we use). */
interface ErpBranch {
  branch_id: string;
  branch_name: string;
  area_id: string;
  area_name: string;
  region_id: string;
  region_name: string;
  division_id: string;
  division_name: string;
  erp_area_id?: string | null;
  erp_region_id?: string | null;
  erp_division_id?: string | null;
  updated_at?: string | null;
}

/** What the last sync did; kept in the Setting table under "branchSync" and shown in the admin console. */
export interface SyncStatus {
  ok: boolean;
  message: string;
  startedAt: string;
  finishedAt?: string;
  lastSuccessAt?: string | null;
  counts?: Record<string, number>;
}

const DAY = 24 * 60 * 60 * 1000;
const clean = (v: any) => String(v ?? '').trim();

/**
 * Keeps Division → Region → Area → Branch in step with BRAC's ERP branch list.
 *
 * Once a day (2:00 AM Bangladesh time) and when an admin presses "Sync now":
 *   1. fetch every page of the list (all of it, or nothing changes);
 *   2. create what's new; update a branch only when its updated_at is newer or its place changed;
 *   3. switch off (never delete) anything from the ERP that's no longer in the list, so past
 *      visits still find it but new visits can't choose it; switch it back on if it returns;
 *   4. make a Regional Office per region and an Area Office per area;
 *   5. carry renames onto offices the admin added and onto past visits.
 * The website only ever reads the copy saved here; it never calls the ERP itself.
 */
@Injectable()
export class BranchSyncService implements OnModuleInit, OnModuleDestroy {
  private log = new Logger('BranchSync');
  private timer: NodeJS.Timeout | null = null;
  private running: Promise<SyncStatus> | null = null;

  constructor(private prisma: PrismaService, private visits: VisitsService) {}

  // ---------------- schedule ----------------

  onModuleInit() {
    if (!config.branchApiToken) {
      this.log.warn('BRAC_BRANCH_API_TOKEN is not set: the branch list will not sync.');
      return;
    }
    this.scheduleNext();
    // catch up after a restart if the last good sync is more than a day old
    this.status().then((s) => {
      const last = s?.lastSuccessAt ? new Date(s.lastSuccessAt).getTime() : 0;
      if (Date.now() - last > DAY) setTimeout(() => this.run('startup').catch(() => undefined), 60_000);
    });
  }

  onModuleDestroy() {
    if (this.timer) clearTimeout(this.timer);
  }

  /** Next 2:00 AM in Bangladesh (UTC+6, no daylight saving) = 20:00 UTC. */
  private scheduleNext() {
    const now = new Date();
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate(), 20, 0, 0));
    if (next <= now) next.setUTCDate(next.getUTCDate() + 1);
    this.timer = setTimeout(async () => {
      await this.run('schedule').catch(() => undefined);
      this.scheduleNext();
    }, next.getTime() - now.getTime());
  }

  // ---------------- status ----------------

  async status(): Promise<SyncStatus | null> {
    const row = await this.prisma.setting.findUnique({ where: { key: 'branchSync' } });
    return (row?.value as any) || null;
  }

  private async saveStatus(s: SyncStatus) {
    await this.prisma.setting.upsert({ where: { key: 'branchSync' }, create: { key: 'branchSync', value: s as any }, update: { value: s as any } });
  }

  // ---------------- run ----------------

  /** Runs a sync (or joins the one already running). Never throws: the result says what happened. */
  run(trigger: 'schedule' | 'admin' | 'startup'): Promise<SyncStatus> {
    if (!this.running) this.running = this.doRun(trigger).finally(() => (this.running = null));
    return this.running;
  }

  private async doRun(trigger: string): Promise<SyncStatus> {
    const before = await this.status();
    const startedAt = new Date().toISOString();
    try {
      if (!config.branchApiToken) throw new Error('The branch list token is not set on the server (BRAC_BRANCH_API_TOKEN in api/.env).');
      const { branches, pages } = await this.fetchAll();
      const counts = await this.apply(branches);
      const s: SyncStatus = {
        ok: true, startedAt, finishedAt: new Date().toISOString(), lastSuccessAt: new Date().toISOString(),
        counts: { pages, ...counts },
        message: counts.changed ? `Synced ${counts.branches} branches: ${counts.changed} change(s).` : `Synced ${counts.branches} branches: no changes.`,
      };
      await this.saveStatus(s);
      this.log.log(`${trigger}: ${s.message}`);
      return s;
    } catch (err: any) {
      const s: SyncStatus = {
        ok: false, startedAt, finishedAt: new Date().toISOString(), lastSuccessAt: before?.lastSuccessAt || null,
        message: `${err?.message || err} Nothing was changed.`,
      };
      await this.saveStatus(s);
      this.log.warn(`${trigger}: ${s.message}`);
      return s;
    }
  }

  // ---------------- 1. fetch every page ----------------

  private async get(query: string) {
    const url = `${config.branchApiUrl}${query ? (config.branchApiUrl.includes('?') ? '&' : '?') + query : ''}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bearer ${config.branchApiToken}`, Accept: 'application/json' },
      signal: AbortSignal.timeout(90_000),
    });
    if (res.status === 401 || res.status === 403) throw new Error('The branch list refused the token (it may have expired).');
    if (!res.ok) throw new Error(`The branch list answered with error ${res.status}.`);
    const json: any = await res.json();
    if (!json || !Array.isArray(json.branch)) throw new Error('The branch list sent something unexpected (no "branch" list).');
    return json;
  }

  private async fetchAll(): Promise<{ branches: ErpBranch[]; pages: number }> {
    const first = await this.get('');
    const totalPages = Number(first.totalpage) || 1;
    const totalItems = Number(first.total_items) || 0;
    const pages: ErpBranch[][] = [first.branch];

    if (totalPages > 1) {
      // The API doesn't document how to ask for page 2, so try the usual names and keep the one
      // that really returns page 2 (current_page = 2).
      let param: string | null = null;
      for (const p of ['page', 'current_page', 'pageNo', 'page_no']) {
        const r = await this.get(`${p}=2`);
        if (Number(r.current_page) === 2) { param = p; pages.push(r.branch); break; }
      }
      if (!param) throw new Error("Couldn't find out how to ask the branch list for page 2.");
      for (let n = 3; n <= totalPages; n++) pages.push((await this.get(`${param}=${n}`)).branch);
    }

    const all = pages.flat();
    if (!all.length) throw new Error('The branch list came back empty.');
    if (totalItems && all.length < totalItems) throw new Error(`Only ${all.length} of ${totalItems} branches came back.`);
    // the same branch twice (page boundaries shifting during the fetch): keep the newest copy
    const byId = new Map<string, ErpBranch>();
    for (const b of all) {
      const id = clean(b.branch_id);
      if (!id) continue;
      const prev = byId.get(id);
      if (!prev || clean(b.updated_at) >= clean(prev.updated_at)) byId.set(id, b);
    }
    return { branches: [...byId.values()], pages: pages.length };
  }

  // ---------------- 2–5. save what changed ----------------

  private async apply(list: ErpBranch[]) {
    const c = { branches: list.length, added: 0, updated: 0, switchedOff: 0, switchedOn: 0, changed: 0 };
    type Move = { from: { region: string; area?: string }; to: { division: string; region: string; area?: string } };
    const moves: Move[] = [];
    const branchMoves: { existing: any; form: any }[] = [];

    // --- divisions, regions and areas named as the ERP names them (made unique where names repeat) ---
    const divisions = new Map<string, { name: string; code: string | null }>();
    const regions = new Map<string, { name: string; division: string; code: string | null }>();
    const areas = new Map<string, { name: string; regionId: string; code: string | null }>();
    const unique = (taken: Set<string>, name: string, extra: string) => (taken.has(name) ? `${name} (${extra})` : name);
    const divNames = new Set<string>(), regNames = new Set<string>();
    const areaNamesIn = new Map<string, Set<string>>();
    for (const b of list) {
      const did = clean(b.division_id), rid = clean(b.region_id), aid = clean(b.area_id);
      if (!divisions.has(did)) { const n = unique(divNames, clean(b.division_name) || `Division ${did}`, did); divNames.add(n); divisions.set(did, { name: n, code: clean(b.erp_division_id) || null }); }
      if (!regions.has(rid)) { const n = unique(regNames, clean(b.region_name) || `Region ${rid}`, divisions.get(did).name); regNames.add(n); regions.set(rid, { name: n, division: divisions.get(did).name, code: clean(b.erp_region_id) || null }); }
      if (!areas.has(aid)) {
        const taken = areaNamesIn.get(rid) || new Set<string>();
        const n = unique(taken, clean(b.area_name) || `Area ${aid}`, clean(b.erp_area_id) || aid);
        taken.add(n); areaNamesIn.set(rid, taken);
        areas.set(aid, { name: n, regionId: rid, code: clean(b.erp_area_id) || null });
      }
    }

    await this.prisma.$transaction(async (tx) => {
      // ---- divisions ----
      const dbDiv = await tx.division.findMany();
      for (const [ext, d] of divisions) {
        const row = dbDiv.find((x) => x.externalId === ext) || dbDiv.find((x) => !x.externalId && x.name === d.name);
        if (!row) { await tx.division.create({ data: { id: makeId('DIV', 8), name: d.name, externalId: ext, erpCode: d.code, source: 'erp' } }); c.added++; continue; }
        if (row.name !== d.name || row.erpCode !== d.code || !row.active || row.externalId !== ext) {
          if (row.name !== d.name) await tx.region.updateMany({ where: { division: row.name }, data: { division: d.name } });
          if (row.name !== d.name) await tx.office.updateMany({ where: { division: row.name }, data: { division: d.name } });
          await tx.division.update({ where: { id: row.id }, data: { name: d.name, erpCode: d.code, active: true, externalId: ext, source: 'erp' } });
          row.active ? c.updated++ : c.switchedOn++;
        }
      }
      const offDiv = await tx.division.updateMany({ where: { source: 'erp', active: true, externalId: { notIn: [...divisions.keys()] } }, data: { active: false } });
      c.switchedOff += offDiv.count;

      // ---- regions ----
      const dbReg = await tx.region.findMany();
      const regionRowId = new Map<string, string>(); // ERP region_id -> our Region.id
      for (const [ext, r] of regions) {
        const row = dbReg.find((x) => x.externalId === ext) || dbReg.find((x) => !x.externalId && x.name === r.name);
        if (!row) {
          const id = makeId('RGN', 8);
          await tx.region.create({ data: { id, name: r.name, division: r.division, externalId: ext, erpCode: r.code, source: 'erp' } });
          regionRowId.set(ext, id); c.added++; continue;
        }
        regionRowId.set(ext, row.id);
        if (row.name !== r.name || row.division !== r.division || row.erpCode !== r.code || !row.active || row.externalId !== ext) {
          if (row.name !== r.name || row.division !== r.division) moves.push({ from: { region: row.name }, to: { division: r.division, region: r.name } });
          await tx.region.update({ where: { id: row.id }, data: { name: r.name, division: r.division, erpCode: r.code, active: true, externalId: ext, source: 'erp' } });
          row.active ? c.updated++ : c.switchedOn++;
        }
      }
      c.switchedOff += (await tx.region.updateMany({ where: { source: 'erp', active: true, externalId: { notIn: [...regions.keys()] } }, data: { active: false } })).count;

      // ---- areas ----
      const dbArea = await tx.area.findMany({ include: { region: true } });
      const newRegionName = (ext: string) => regions.get(ext).name;
      for (const [ext, a] of areas) {
        const regionId = regionRowId.get(a.regionId);
        const row = dbArea.find((x) => x.externalId === ext) || dbArea.find((x) => !x.externalId && x.regionId === regionId && x.name === a.name);
        if (!row) { await tx.area.create({ data: { id: makeId('AREA', 8), name: a.name, regionId, externalId: ext, erpCode: a.code, source: 'erp' } }); c.added++; continue; }
        if (row.name !== a.name || row.regionId !== regionId || row.erpCode !== a.code || !row.active || row.externalId !== ext) {
          const toRegion = newRegionName(a.regionId);
          if (row.name !== a.name || row.regionId !== regionId)
            moves.push({ from: { region: row.region.name, area: row.name }, to: { division: regions.get(a.regionId).division, region: toRegion, area: a.name } });
          await tx.area.update({ where: { id: row.id }, data: { name: a.name, regionId, erpCode: a.code, active: true, externalId: ext, source: 'erp' } });
          row.active ? c.updated++ : c.switchedOn++;
        }
      }
      c.switchedOff += (await tx.area.updateMany({ where: { source: 'erp', active: true, externalId: { notIn: [...areas.keys()] } }, data: { active: false } })).count;

      // offices the admin added follow renamed regions and areas
      for (const m of moves) {
        await tx.office.updateMany({
          where: { source: 'admin', region: m.from.region, ...(m.from.area ? { area: m.from.area } : {}) },
          data: { division: m.to.division, region: m.to.region, ...(m.to.area ? { area: m.to.area } : {}) },
        });
      }

      // ---- offices: a Regional Office per region, an Area Office per area, and the branches ----
      const dbOff = await tx.office.findMany({ where: { externalId: { not: null } } });
      const offByExt = new Map(dbOff.map((o) => [o.externalId, o]));
      const want: { ext: string; data: any; stamp?: string | null }[] = [];
      for (const [ext, r] of regions)
        want.push({ ext: `RO:${ext}`, data: { name: `${r.name} Regional Office`, type: 'region', division: r.division, region: null, area: null, erpCode: r.code } });
      for (const [ext, a] of areas) {
        const r = regions.get(a.regionId);
        want.push({ ext: `AO:${ext}`, data: { name: `${a.name} Area Office`, type: 'area', division: r.division, region: r.name, area: null, erpCode: a.code } });
      }
      const branchNamesIn = new Map<string, Set<string>>();
      for (const b of list) {
        const r = regions.get(clean(b.region_id)), a = areas.get(clean(b.area_id));
        const taken = branchNamesIn.get(r.name) || new Set<string>();
        const name = unique(taken, clean(b.branch_name) || `Branch ${b.branch_id}`, clean(b.branch_id));
        taken.add(name); branchNamesIn.set(r.name, taken);
        want.push({ ext: clean(b.branch_id), stamp: clean(b.updated_at) || null, data: { name, type: 'branch', division: r.division, region: r.name, area: a.name, erpCode: null } });
      }

      const creates: any[] = [];
      for (const w of want) {
        const row = offByExt.get(w.ext);
        if (!row) {
          creates.push({ id: makeId('OFF', 8), ...w.data, active: true, externalId: w.ext, source: 'erp', sourceUpdatedAt: w.stamp ?? null, sortOrder: 0 });
          continue;
        }
        const placeChanged = row.name !== w.data.name || row.division !== w.data.division || row.region !== w.data.region || row.area !== w.data.area;
        const newer = !!w.stamp && (!row.sourceUpdatedAt || w.stamp > row.sourceUpdatedAt);
        if (!placeChanged && !newer && row.active && row.erpCode === w.data.erpCode) continue; // nothing new: leave it alone
        if (placeChanged && row.type === 'branch')
          branchMoves.push({ existing: { name: row.name, district: row.region }, form: { name: w.data.name, district: w.data.region, area: w.data.area, division: w.data.division } });
        await tx.office.update({ where: { id: row.id }, data: { ...w.data, active: true, source: 'erp', sourceUpdatedAt: w.stamp ?? row.sourceUpdatedAt } });
        row.active ? c.updated++ : c.switchedOn++;
      }
      for (let i = 0; i < creates.length; i += 1000) await tx.office.createMany({ data: creates.slice(i, i + 1000) });
      c.added += creates.length;
      c.switchedOff += (await tx.office.updateMany({ where: { source: 'erp', active: true, externalId: { notIn: want.map((w) => w.ext) } }, data: { active: false } })).count;
    }, { timeout: 10 * 60_000, maxWait: 60_000 });

    // past visits follow renamed regions, areas and branches (each visit locked while it changes)
    if (moves.length || branchMoves.length) {
      for (const v of await this.visits.all()) {
        const touched = moves.some((m) => renamePlaceInVisit(v, m.from, m.to)) || branchMoves.some((b) => relinkOffice(v, b.existing, b.form));
        if (!touched) continue;
        await this.visits.update(v.id, (visit) => {
          for (const m of moves) { const next = renamePlaceInVisit(visit, m.from, m.to); if (next) Object.assign(visit, next); }
          for (const b of branchMoves) { const next = relinkOffice(visit, b.existing, b.form); if (next) Object.assign(visit, next); }
        });
      }
    }

    c.changed = c.added + c.updated + c.switchedOff + c.switchedOn;
    return c;
  }
}
