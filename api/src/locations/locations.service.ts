import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { PrismaService } from '../common/prisma.service';
import { UserError } from '../common/error.filter';
import { makeId } from '../common/ids';
import { buildLocations, BuiltLocations, DEFAULT_RULES, LocationRules, matchKey, tidy } from './build-locations';

const RULES_KEY = 'locationRules';
const CHECK_EVERY_MS = 10 * 60 * 1000;
const NIGHTLY_HOUR_DHAKA = 2; // the nightly sync runs between 2 and 3 a.m. Bangladesh time
// A download with this much less than last time is refused (a broken page, not real closures).
const MAX_DROP = 0.1;

const dhakaNow = () => new Date(Date.now() + 6 * 3600_000); // read with getUTC*()

/**
 * Where the app's locations come from: BRAC's branch API.
 *   sync()      download every page, keep the rows (ApiBranchRow), rebuild the locations
 *   rebuild()   rebuild the locations from the rows already kept (after the admin changes a rule)
 *   importRows() the same as sync() for rows read from a file (npm run db:locations -- file.json)
 * Each run is recorded in LocationSync with its report. The nightly sync runs by itself when
 * BRANCH_API_URL and BRANCH_API_TOKEN are set.
 */
@Injectable()
export class LocationsService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger('Locations');
  private timer?: NodeJS.Timeout;
  private running = false;

  constructor(private prisma: PrismaService) {}

  onModuleInit() {
    this.timer = setInterval(() => this.nightly().catch((e) => this.logger.error(e)), CHECK_EVERY_MS);
  }
  onModuleDestroy() {
    if (this.timer) clearInterval(this.timer);
  }

  get apiConfigured() {
    return !!(process.env.BRANCH_API_URL && process.env.BRANCH_API_TOKEN);
  }

  // ---------------- the admin's rules ----------------

  async rules(): Promise<LocationRules & { dismissed: string[] }> {
    const row = await this.prisma.setting.findUnique({ where: { key: RULES_KEY } });
    const v = (row?.value as any) || {};
    return {
      aliases: Array.isArray(v.aliases) ? v.aliases : DEFAULT_RULES.aliases,
      splits: Array.isArray(v.splits) ? v.splits.map(String) : DEFAULT_RULES.splits,
      dismissed: Array.isArray(v.dismissed) ? v.dismissed.map(String) : [],
    };
  }

  async saveRules(body: any) {
    const clean = (s: any) => tidy(s);
    const aliases = (Array.isArray(body?.aliases) ? body.aliases : [])
      .map((a: any) => ({ level: a.level === 'region' ? 'region' : 'area', division: clean(a.division), region: clean(a.region), from: clean(a.from), to: clean(a.to) }))
      .filter((a: any) => a.division && a.from && a.to && matchKey(a.from) !== matchKey(a.to) && (a.level === 'region' || a.region));
    const splits = [...new Set((Array.isArray(body?.splits) ? body.splits : []).map((s: any) => String(s).trim()).filter((s: string) => /^\d+$/.test(s)))];
    const dismissed = [...new Set((Array.isArray(body?.dismissed) ? body.dismissed : []).map(String))];
    const value = { aliases, splits, dismissed } as any;
    await this.prisma.setting.upsert({ where: { key: RULES_KEY }, create: { key: RULES_KEY, value }, update: { value } });
    return this.rebuild('rules');
  }

  // ---------------- runs ----------------

  /** Downloads the API and rebuilds the locations. */
  async sync(trigger: 'manual' | 'nightly') {
    if (!this.apiConfigured) throw new UserError('The branch API is not set up: add BRANCH_API_URL and BRANCH_API_TOKEN to the server\'s variables.');
    return this.run(trigger, async () => this.keepRows(await this.download()));
  }

  /** The same as sync(), for rows read from a file. */
  async importRows(rows: any[]) {
    if (!Array.isArray(rows) || !rows.length) throw new UserError('That file has no branch rows.');
    return this.run('file', async () => this.keepRows({ rows, total: rows.length, pages: 1 }));
  }

  /** Rebuilds the locations from the rows already kept. */
  async rebuild(trigger: 'rules' | 'manual' = 'manual') {
    return this.run(trigger, async () => ({}));
  }

  private async run(trigger: string, fetchStep: () => Promise<object>) {
    if (this.running) throw new UserError('A location sync is already running. Try again in a minute.');
    this.running = true;
    const id = makeId('SYNC');
    await this.prisma.locationSync.create({ data: { id, trigger } });
    try {
      const fetched = await fetchStep();
      const rows = (await this.prisma.apiBranchRow.findMany({ where: { present: true }, select: { data: true } })).map((r) => r.data);
      if (!rows.length) throw new UserError('No branch rows have been downloaded yet.');
      const built = buildLocations(rows, await this.rules());
      const applied = await this.apply(built);
      const report = { ...fetched, ...built.report, suggestions: await this.openSuggestions(built), applied };
      const message = `${built.report.branches} branches, ${built.report.regions} regions, ${built.report.areas} areas` +
        (applied.added || applied.switchedOff ? ` (${applied.added} new, ${applied.switchedOff} switched off)` : '');
      return await this.prisma.locationSync.update({ where: { id }, data: { status: 'ok', message, report: report as any, finishedAt: new Date() } });
    } catch (e: any) {
      const refused = e instanceof RefusedError;
      const text = e?.getResponse?.()?.error || e.message; // a UserError keeps its text in the response
      this.logger.warn(`Location ${trigger} ${refused ? 'refused' : 'failed'}: ${text}`);
      await this.prisma.locationSync.update({ where: { id }, data: { status: refused ? 'refused' : 'failed', message: text, finishedAt: new Date() } });
      if (e instanceof UserError) throw e;
      throw new UserError(refused ? e.message : `The location sync failed: ${e.message}`);
    } finally {
      this.running = false;
    }
  }

  /** Once a night, between 2 and 3 a.m. in Bangladesh. */
  private async nightly() {
    if (!this.apiConfigured || this.running) return;
    const now = dhakaNow();
    if (now.getUTCHours() !== NIGHTLY_HOUR_DHAKA) return;
    const since = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()) - 6 * 3600_000);
    if (await this.prisma.locationSync.count({ where: { trigger: 'nightly', startedAt: { gte: since } } })) return;
    await this.sync('nightly').catch(() => undefined); // the failure is recorded on the run
  }

  // ---------------- download ----------------

  /** Every page of the API. Refuses an answer that doesn't add up to the API's own total. */
  private async download() {
    const base = process.env.BRANCH_API_URL!;
    const token = process.env.BRANCH_API_TOKEN!;
    const page = async (n: number) => {
      const url = new URL(base);
      url.searchParams.set('page', String(n));
      for (let attempt = 1; ; attempt++) {
        try {
          const res = await fetch(url, { headers: { Authorization: `Bearer ${token}`, Accept: 'application/json' }, signal: AbortSignal.timeout(60_000) });
          if (!res.ok) throw new Error(`the API answered ${res.status} for page ${n}`);
          return (await res.json()) as any;
        } catch (e) {
          if (attempt >= 3) throw e;
          await new Promise((r) => setTimeout(r, attempt * 2000));
        }
      }
    };
    const rowsOf = (j: any) => (Array.isArray(j?.branch) ? j.branch : Array.isArray(j?.data) ? j.data : Array.isArray(j) ? j : null);
    const first = await page(1);
    if (!rowsOf(first)) throw new Error('the API did not answer with a list of branches');
    const total = Number(first.total_items ?? first.total ?? NaN);
    const pages = Number(first.totalpage ?? first.total_pages ?? first.last_page ?? NaN);
    const rows = [...rowsOf(first)];
    if (Number.isFinite(pages)) {
      for (let n = 2; n <= pages; n++) rows.push(...(rowsOf(await page(n)) || []));
    } else {
      for (let n = 2; n <= 1000; n++) {
        const more = rowsOf(await page(n)) || [];
        if (!more.length) break;
        rows.push(...more);
      }
    }
    if (Number.isFinite(total) && rows.length !== total)
      throw new RefusedError(`The API said ${total} rows but sent ${rows.length}; nothing was changed.`);
    return { rows, total: Number.isFinite(total) ? total : rows.length, pages: Number.isFinite(pages) ? pages : null };
  }

  /** Keeps the rows as they arrived: new ones added, changed ones updated, missing ones marked gone. */
  private async keepRows({ rows, total, pages }: { rows: any[]; total: number; pages: number | null }) {
    const before = await this.prisma.apiBranchRow.count({ where: { present: true } });
    if (before && rows.length < before * (1 - MAX_DROP))
      throw new RefusedError(`Only ${rows.length} rows arrived where there were ${before}; nothing was changed. If branches really closed, ask the developer to lower the limit.`);
    const keyOf = (r: any) => {
      const programme = String(r.program_name ?? '').trim();
      return programme ? `${programme}:${String(r.branch_id ?? '').trim()}` : `none:${String(r.br_id ?? '').trim()}`;
    };
    const incoming = new Map<string, any>();
    for (const r of rows) incoming.set(keyOf(r), r);
    const old = new Map((await this.prisma.apiBranchRow.findMany({ select: { key: true, hash: true } })).map((r) => [r.key, r.hash]));
    const now = new Date();
    const fresh: Prisma.ApiBranchRowCreateManyInput[] = [];
    const changed: { key: string; data: any; hash: string }[] = [];
    for (const [key, r] of incoming) {
      const hash = createHash('md5').update(JSON.stringify(r)).digest('hex');
      const programName = String(r.program_name ?? '').trim() || null;
      if (!old.has(key)) fresh.push({ key, branchId: String(r.branch_id ?? ''), programName, data: r, hash });
      else if (old.get(key) !== hash) changed.push({ key, data: r, hash });
    }
    const keys = [...incoming.keys()];
    await this.prisma.$transaction(async (tx) => {
      for (let i = 0; i < fresh.length; i += 1000) await tx.apiBranchRow.createMany({ data: fresh.slice(i, i + 1000) });
      for (const c of changed) await tx.apiBranchRow.update({ where: { key: c.key }, data: { data: c.data, hash: c.hash } });
      await tx.apiBranchRow.updateMany({ where: { key: { in: keys } }, data: { present: true, lastSeenAt: now } });
      await tx.apiBranchRow.updateMany({ where: { key: { notIn: keys }, present: true }, data: { present: false } });
    }, { timeout: 120_000 });
    const gone = [...old.keys()].filter((k) => !incoming.has(k)).length;
    return { download: { rows: rows.length, total, pages, newRows: fresh.length, changedRows: changed.length, goneRows: gone } };
  }

  // ---------------- apply ----------------

  /** Writes the built locations: regions and areas replaced, offices added / updated / switched off (never deleted). */
  private async apply(built: BuiltLocations) {
    const existing = await this.prisma.office.findMany();
    const byId = new Map(existing.map((o) => [o.id, o]));
    const fields = (o: BuiltLocations['offices'][number]) => ({
      name: o.name, type: o.type, code: o.code, division: o.division, region: o.region, area: o.area,
      placements: o.placements as any, active: true, sortOrder: o.sortOrder,
    });
    // compared by value: the database keeps JSON keys in its own order
    const placesText = (ps: any) => ((ps as any[]) || []).map((p) => [p.division, p.region, p.area, (p.programmes || []).join('+')].join('|')).join(' / ');
    const same = (a: any, b: any) =>
      a.name === b.name && a.type === b.type && a.code === b.code && a.division === b.division && a.region === b.region &&
      a.area === b.area && a.active === b.active && placesText(a.placements) === placesText(b.placements);
    const create: Prisma.OfficeCreateManyInput[] = [];
    const update: { id: string; data: ReturnType<typeof fields> }[] = [];
    // one area more or less shifts the order of thousands of offices: those go in one query
    const reorder: { id: string; sortOrder: number }[] = [];
    for (const o of built.offices) {
      const data = fields(o);
      const e = byId.get(o.id);
      if (!e) create.push({ id: o.id, ...data });
      else if (!same(e, data)) update.push({ id: o.id, data });
      else if (e.sortOrder !== data.sortOrder) reorder.push({ id: o.id, sortOrder: data.sortOrder });
    }
    const keep = new Set(built.offices.map((o) => o.id));
    const off = existing.filter((o) => !keep.has(o.id) && o.active).map((o) => o.id);
    await this.prisma.$transaction(async (tx) => {
      await tx.area.deleteMany({});
      await tx.region.deleteMany({});
      await tx.region.createMany({ data: built.regions });
      for (let i = 0; i < built.areas.length; i += 1000) await tx.area.createMany({ data: built.areas.slice(i, i + 1000) });
      for (let i = 0; i < create.length; i += 1000) await tx.office.createMany({ data: create.slice(i, i + 1000) });
      for (const u of update) await tx.office.update({ where: { id: u.id }, data: u.data });
      if (reorder.length)
        await tx.$executeRaw`UPDATE "Office" o SET "sortOrder" = v.s FROM unnest(${reorder.map((r) => r.id)}::text[], ${reorder.map((r) => r.sortOrder)}::int[]) AS v(id, s) WHERE o.id = v.id`;
      if (off.length) await tx.office.updateMany({ where: { id: { in: off } }, data: { active: false } });
    }, { timeout: 300_000 });
    return { added: create.length, updated: update.length, reordered: reorder.length, switchedOff: off.length };
  }

  /** The look-alike spellings the admin hasn't merged or dismissed yet. */
  private async openSuggestions(built: BuiltLocations) {
    const { dismissed } = await this.rules();
    const gone = new Set(dismissed);
    return built.report.suggestions
      .map((s) => ({ ...s, key: suggestionKey(s) }))
      .filter((s) => !gone.has(s.key));
  }

  // ---------------- for the admin screen ----------------

  async status() {
    const [runs, present, all, rules] = await Promise.all([
      this.prisma.locationSync.findMany({ orderBy: { startedAt: 'desc' }, take: 10 }),
      this.prisma.apiBranchRow.count({ where: { present: true } }),
      this.prisma.apiBranchRow.count(),
      this.rules(),
    ]);
    const lastOk = runs.find((r) => r.status === 'ok') || (await this.prisma.locationSync.findFirst({ where: { status: 'ok' }, orderBy: { startedAt: 'desc' } }));
    return {
      apiConfigured: this.apiConfigured,
      running: this.running,
      rows: { present, gone: all - present },
      rules,
      lastOk,
      runs: runs.map(({ report, ...r }) => r),
    };
  }
}

/** A sync that would have damaged the data: recorded as "refused", nothing changed. */
class RefusedError extends Error {}

export const suggestionKey = (s: { level: string; division: string; region?: string; a: string; b: string }) =>
  [s.level, matchKey(s.division), matchKey(s.region || ''), ...[matchKey(s.a), matchKey(s.b)].sort()].join('|');
