/**
 * Turns the rows of BRAC's branch API into the app's locations. Pure: rows in, lists out.
 *
 * The API lists each branch once per programme (DABI, PROGOTI, BRAC F&A, ...), and each programme
 * has its own divisions, regions and areas. The app keeps one Division → Region → Area tree for
 * all programmes together:
 *   - a division, region or area is known by its NAME (after tidying), within its parent: every
 *     "Sylhet-1" under "North East" is one region, holding the areas of all of them;
 *   - a branch is known by its BRAC branch ID and sits in every area its programmes put it in
 *     (its "placements"). Two IDs listed in rules.splits are two offices sharing one ID: the
 *     second gets ".1" (2853 and 2853.1);
 *   - each region gets one Regional Office and each area one Area Office.
 * Rows that aren't branch offices are left out: rows without a programme (old copies), test
 * records, regional / market / head offices, and the HO, Enterprise and Rohingya camp divisions.
 * The admin can merge two spellings of one region or area (rules.aliases).
 */
import { createHash } from 'crypto';

export interface Alias {
  level: 'region' | 'area';
  division: string;
  region?: string; // for an area: the region it is in
  from: string; // the spelling to fold away
  to: string; // the spelling to keep
}
export interface LocationRules {
  aliases: Alias[];
  splits: string[]; // branch IDs used by two different offices
}
export const DEFAULT_RULES: LocationRules = { aliases: [], splits: ['2853', '4202'] };

export interface Placement { division: string; region: string; area: string; programmes: string[] }
export interface BuiltOffice {
  id: string;
  type: 'region' | 'area' | 'branch';
  name: string;
  code: string | null;
  division: string;
  region: string | null;
  area: string | null;
  placements: Placement[];
  sortOrder: number;
}

// A branch's name and places come from its programmes in this order (others after, A–Z).
const PROGRAMME_ORDER = ['DABI', 'PROGOTI', 'BRAC F&A'];
// Divisions that hold no branch offices.
const SKIP_DIVISIONS = new Set(['ho', 'enterprise', 'coxsbazarhcmp']);
const TEST_NAME = /^\s*(test|uat|demo|dummy)\b/i;
// regional offices (R/O, RO), market offices (BMO, MO), BRAC Learning Centres (BLC), head-office units,
// and names ending in "office"
// ("Notun Office", "Mohangonj Market office"; but "Office Bazar" is a place)
const OFFICE_NAME = /\bR\s*\/\s*O\b|\bRO\b|\bB\.?\s*M\.?\s*O\b|\bMO\b|\bBLC\b|^\s*unit\s+to\b|\boffice\s*$/i;

const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s(/-])([a-z])/g, (_, p, c) => p + c.toUpperCase());

/** "Kushtia - 3" → "Kushtia-3", "Shibgonj  (Chapai)" → "Shibgonj (Chapai)", "VADURIA" → "Vaduria". */
export function tidy(value: unknown): string {
  let t = String(value ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\s*-\s*/g, '-')
    .replace(/\s*\/\s*/g, '/')
    .replace(/'S\b/g, "'s");
  // all capitals or all small letters → Title Case (short codes like "HO" stay as they are)
  if ((t.match(/[a-z]/gi) || []).length >= 3 && (t === t.toUpperCase() || t === t.toLowerCase())) t = titleCase(t);
  return t;
}

/** What two names must share to be the same place: letters and digits, any case. */
export const matchKey = (value: unknown) => tidy(value).toLowerCase().replace(/[^a-z0-9]/g, '');

const hash = (s: string) => createHash('md5').update(s).digest('hex').slice(0, 10).toUpperCase();

const programmeRank = (p: string) => {
  const i = PROGRAMME_ORDER.indexOf(p);
  return i < 0 ? PROGRAMME_ORDER.length : i;
};
const byProgramme = (a: string, b: string) => programmeRank(a) - programmeRank(b) || a.localeCompare(b);

/** Picks the name to show for a group: the first programme's spelling, then the most common. */
class NamePicker {
  private seen = new Map<string, { rank: number; count: number }>();
  add(name: string, programme: string) {
    const s = this.seen.get(name) || { rank: programmeRank(programme), count: 0 };
    s.rank = Math.min(s.rank, programmeRank(programme));
    s.count += 1;
    this.seen.set(name, s);
  }
  get name() {
    return [...this.seen.entries()].sort((a, b) => a[1].rank - b[1].rank || b[1].count - a[1].count || a[0].localeCompare(b[0]))[0][0];
  }
}

interface Row { programme: string; branchId: string; name: string; division: string; region: string; area: string; dk: string; rk: string; ak: string }

function levenshtein(a: string, b: string) {
  if (Math.abs(a.length - b.length) > 2) return 3;
  let prev = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    prev = cur;
  }
  return prev[b.length];
}

/** Two names in one list that are probably one place spelled two ways ("Bianibazar" / "Beanibazar", "Tongi" / "Tongi MO"). */
function lookAlike(a: string, b: string) {
  const x = matchKey(a), y = matchKey(b);
  if (x === y || /\d/.test(x + y)) return false;
  if (x.replace(/mo$/, '') === y.replace(/mo$/, '')) return true;
  return x.length >= 5 && y.length >= 5 && levenshtein(x, y) <= 2;
}

export function buildLocations(apiRows: any[], rules: LocationRules = DEFAULT_RULES) {
  const skipped = { noProgramme: 0, incomplete: 0, divisions: {} as Record<string, number>, test: [] as string[], notBranch: [] as string[] };

  // ---- the rows that are branch offices ----
  const rows: Row[] = [];
  for (const r of apiRows) {
    const programme = String(r.program_name ?? '').replace(/s+/g, ' ').trim(); // as BRAC writes it (DABI, BRAC F&A)
    if (!programme) { skipped.noProgramme++; continue; }
    const division = tidy(r.division_name), region = tidy(r.region_name), area = tidy(r.area_name), name = tidy(r.branch_name);
    const branchId = String(r.branch_id ?? '').trim();
    if (!division || !region || !area || !name || !branchId) { skipped.incomplete++; continue; }
    if (SKIP_DIVISIONS.has(matchKey(division))) { skipped.divisions[division] = (skipped.divisions[division] || 0) + 1; continue; }
    if (TEST_NAME.test(name)) { skipped.test.push(`${name} (${programme}, ${branchId})`); continue; }
    if (OFFICE_NAME.test(String(r.branch_name))) { skipped.notBranch.push(`${name} (${programme}, ${branchId})`); continue; }
    rows.push({ programme, branchId, name, division, region, area, dk: '', rk: '', ak: '' });
  }

  // ---- group keys, with the admin's merged spellings ----
  const regionAlias = new Map<string, Alias>();
  const areaAlias = new Map<string, Alias>();
  for (const a of rules.aliases || []) {
    if (a.level === 'region') regionAlias.set(`${matchKey(a.division)}|${matchKey(a.from)}`, a);
    else if (a.level === 'area') areaAlias.set(`${matchKey(a.division)}|${matchKey(a.region)}|${matchKey(a.from)}`, a);
  }
  const forced = new Map<string, string>(); // group key → name the admin chose
  for (const r of rows) {
    r.dk = matchKey(r.division);
    const ra = regionAlias.get(`${r.dk}|${matchKey(r.region)}`);
    r.rk = `${r.dk}|${matchKey(ra ? ra.to : r.region)}`;
    if (ra) forced.set(r.rk, tidy(ra.to));
    const aa = areaAlias.get(`${r.rk}|${matchKey(r.area)}`);
    r.ak = `${r.rk}|${matchKey(aa ? aa.to : r.area)}`;
    if (aa) forced.set(r.ak, tidy(aa.to));
  }

  // ---- names of divisions, regions and areas ----
  const pickers = new Map<string, NamePicker>();
  const pick = (key: string, name: string, programme: string) => {
    if (!pickers.has(key)) pickers.set(key, new NamePicker());
    pickers.get(key)!.add(name, programme);
  };
  for (const r of rows) {
    pick(`d:${r.dk}`, r.division, r.programme);
    pick(`r:${r.rk}`, r.region, r.programme);
    pick(`a:${r.ak}`, r.area, r.programme);
  }
  const nameOf = (kind: 'd' | 'r' | 'a', key: string) => forced.get(key) || pickers.get(`${kind}:${key}`)!.name;

  const regions = new Map<string, { id: string; name: string; division: string }>();
  const areas = new Map<string, { id: string; name: string; regionId: string; region: string; division: string }>();
  for (const r of rows) {
    if (!regions.has(r.rk)) regions.set(r.rk, { id: `RG-${hash(r.rk)}`, name: nameOf('r', r.rk), division: nameOf('d', r.dk) });
    if (!areas.has(r.ak)) {
      const reg = regions.get(r.rk)!;
      areas.set(r.ak, { id: `AR-${hash(r.ak)}`, name: nameOf('a', r.ak), regionId: reg.id, region: reg.name, division: reg.division });
    }
  }

  // ---- branches: one per branch ID (or per name, for the IDs in rules.splits) ----
  const splits = new Set((rules.splits || []).map((s) => String(s).trim()));
  const byId = new Map<string, Row[]>();
  for (const r of rows) {
    if (!byId.has(r.branchId)) byId.set(r.branchId, []);
    byId.get(r.branchId)!.push(r);
  }
  const branches: (BuiltOffice & { rks: Set<string> })[] = [];
  const splitDone: string[] = [];
  for (const [branchId, list] of byId) {
    let groups: Row[][] = [list];
    if (splits.has(branchId)) {
      const byName = new Map<string, Row[]>();
      for (const r of list) {
        const k = matchKey(r.name);
        if (!byName.has(k)) byName.set(k, []);
        byName.get(k)!.push(r);
      }
      const minRank = (g: Row[]) => Math.min(...g.map((r) => programmeRank(r.programme)));
      groups = [...byName.values()].sort((a, b) => minRank(a) - minRank(b));
      if (groups.length > 1) splitDone.push(branchId);
    }
    groups.forEach((group, i) => {
      const code = i === 0 ? branchId : `${branchId}.${i}`;
      const names = new NamePicker();
      group.forEach((r) => names.add(r.name, r.programme));
      // one placement per area, carrying the programmes that put the branch there
      const places = new Map<string, Placement>();
      for (const r of [...group].sort((a, b) => byProgramme(a.programme, b.programme))) {
        const a = areas.get(r.ak)!;
        const p = places.get(r.ak) || { division: a.division, region: a.region, area: a.name, programmes: [] };
        if (!p.programmes.includes(r.programme)) p.programmes.push(r.programme);
        places.set(r.ak, p);
      }
      const placements = [...places.values()];
      const first = placements[0];
      branches.push({
        id: `OFF-B-${code}`, type: 'branch', name: names.name, code,
        division: first.division, region: first.region, area: first.area, placements, sortOrder: 0,
        rks: new Set(group.map((r) => r.rk)),
      });
    });
  }

  // ---- two different branches with one name in one region: show their codes ----
  const sameName = new Map<string, typeof branches>();
  for (const b of branches) for (const rk of b.rks) {
    const k = `${rk}|${matchKey(b.name)}`;
    if (!sameName.has(k)) sameName.set(k, []);
    sameName.get(k)!.push(b);
  }
  const coded = new Set<(typeof branches)[number]>();
  for (const list of sameName.values()) if (list.length > 1) list.forEach((b) => coded.add(b));
  for (const b of coded) b.name = `${b.name} (${b.code})`;

  // ---- offices: one Regional Office per region, one Area Office per area, then the branches ----
  const sortedRegions = [...regions.entries()].sort((a, b) => a[1].division.localeCompare(b[1].division) || a[1].name.localeCompare(b[1].name));
  const sortedAreas = [...areas.entries()].sort((a, b) => a[1].division.localeCompare(b[1].division) || a[1].region.localeCompare(b[1].region) || a[1].name.localeCompare(b[1].name));
  const offices: BuiltOffice[] = [
    ...sortedRegions.map(([rk, r]): BuiltOffice => ({
      id: `OFF-R-${hash(rk)}`, type: 'region', name: `${r.name} Region Office`, code: null, division: r.division, region: r.name, area: null,
      placements: [{ division: r.division, region: r.name, area: '', programmes: [] }], sortOrder: 0,
    })),
    ...sortedAreas.map(([ak, a]): BuiltOffice => ({
      id: `OFF-A-${hash(ak)}`, type: 'area', name: `${a.name} Area Office`, code: null, division: a.division, region: a.region, area: a.name,
      placements: [{ division: a.division, region: a.region, area: a.name, programmes: [] }], sortOrder: 0,
    })),
    ...branches
      .sort((a, b) => a.division.localeCompare(b.division) || (a.region || '').localeCompare(b.region || '') || a.name.localeCompare(b.name))
      .map(({ rks, ...b }) => b),
  ].map((o, i) => ({ ...o, sortOrder: i }));

  // ---- spellings that are probably one place, for the admin to merge (or not) ----
  const suggestions: { level: 'region' | 'area'; division: string; region?: string; a: string; b: string }[] = [];
  const regionsByDivision = new Map<string, string[]>();
  for (const r of regions.values()) regionsByDivision.set(r.division, [...(regionsByDivision.get(r.division) || []), r.name]);
  for (const [division, names] of regionsByDivision)
    for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++)
      if (lookAlike(names[i], names[j])) suggestions.push({ level: 'region', division, a: names[i], b: names[j] });
  const areasByRegion = new Map<string, { division: string; region: string; names: string[] }>();
  for (const a of areas.values()) {
    const g = areasByRegion.get(a.regionId) || { division: a.division, region: a.region, names: [] };
    g.names.push(a.name);
    areasByRegion.set(a.regionId, g);
  }
  for (const g of areasByRegion.values())
    for (let i = 0; i < g.names.length; i++) for (let j = i + 1; j < g.names.length; j++)
      if (lookAlike(g.names[i], g.names[j])) suggestions.push({ level: 'area', division: g.division, region: g.region, a: g.names[i], b: g.names[j] });

  const report = {
    apiRows: apiRows.length,
    usedRows: rows.length,
    skipped,
    programmes: [...new Set(rows.map((r) => r.programme))].sort(byProgramme),
    divisions: new Set(rows.map((r) => r.dk)).size,
    regions: regions.size,
    areas: areas.size,
    branches: branches.length,
    splitBranches: splitDone,
    codedNames: [...coded].map((b) => b.name),
    suggestions,
  };
  return {
    regions: sortedRegions.map(([, r], i) => ({ ...r, sortOrder: i })),
    areas: sortedAreas.map(([, a], i) => ({ id: a.id, name: a.name, regionId: a.regionId, sortOrder: i })),
    offices,
    report,
  };
}

export type BuiltLocations = ReturnType<typeof buildLocations>;
