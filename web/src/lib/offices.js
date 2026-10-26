// Office master list + coverage/quality maths shared by the visit wizard, the
// management analytics, the branch profile and the admin Offices tab.

import { isFixed } from "./complaints";

export const DEFAULT_SETTINGS = { visitTargetDays: 90 };

export const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
export const DAY_MS = 86400000;

// The boundary data uses older / alternate spellings for a few names; map
// between this app's own names and the shape names so the map can join.
export const DIVISION_ALIASES = { Chattogram: "Chittagong", Rajshahi: "Rajshani", Barishal: "Barisal" };
export const SHAPE_DISPLAY_NAME = { Chittagong: "Chattogram", Rajshani: "Rajshahi" };
export const DISTRICT_ALIASES = { Chattogram: "Chittagong" };
export const DISTRICT_DISPLAY = { Chittagong: "Chattogram" };

export const toShapeName = (divisionField) => {
  const base = (divisionField || "").replace(/\s*Division$/i, "").trim();
  return DIVISION_ALIASES[base] || base;
};
export const divisionLabelFromShape = (shape) => `${SHAPE_DISPLAY_NAME[shape] || shape} Division`;
export const districtShapeName = (name) => DISTRICT_ALIASES[name] || name;
export const districtFromShape = (shape) => DISTRICT_DISPLAY[shape] || shape;

// All 64 districts grouped by their division's shape name.
export const DISTRICTS_BY_DIVISION = {
  Dhaka: ["Dhaka", "Faridpur", "Gazipur", "Gopalganj", "Kishoreganj", "Madaripur", "Manikganj", "Munshiganj", "Narayanganj", "Narsingdi", "Rajbari", "Shariatpur", "Tangail"],
  Chittagong: ["Bandarban", "Brahamanbaria", "Chandpur", "Chittagong", "Comilla", "Cox's Bazar", "Feni", "Khagrachhari", "Lakshmipur", "Noakhali", "Rangamati"],
  Rajshani: ["Bogra", "Joypurhat", "Naogaon", "Natore", "Nawabganj", "Pabna", "Rajshahi", "Sirajganj"],
  Khulna: ["Bagerhat", "Chuadanga", "Jessore", "Jhenaidah", "Khulna", "Kushtia", "Magura", "Meherpur", "Narail", "Satkhira"],
  Barisal: ["Barguna", "Barisal", "Bhola", "Jhalokati", "Patuakhali", "Pirojpur"],
  Sylhet: ["Habiganj", "Maulvibazar", "Sunamganj", "Sylhet"],
  Rangpur: ["Dinajpur", "Gaibandha", "Kurigram", "Lalmonirhat", "Nilphamari", "Panchagarh", "Rangpur", "Thakurgaon"],
  Mymensingh: ["Jamalpur", "Mymensingh", "Netrakona", "Sherpur"],
};

export const STATUS_META = {
  ok: { label: "Visited recently", short: "On track", color: "var(--success)", pill: "pill-ok" },
  stale: { label: "Overdue", short: "Overdue", color: "var(--warning)", pill: "pill-stale" },
  never: { label: "Never visited", short: "Never", color: "var(--danger)", pill: "pill-never" },
};

/** An office's key everywhere on screen: its id (older records without one: region + name). */
export const officeKey = (o) => o.id || `${o.district}::${o.name}`;

/* ---------- where an office is ----------
   Locations come from BRAC's branch API. A branch sits in every Division › Region › Area its
   programmes put it in (`placements`), so a visit to it counts in each of those places. Visits and
   entries carry the office's id (`officeId`; a VO carries its branch's as `branchOfficeId`), and
   the office list is looked up here, so a branch moved by the API takes its visits with it. */

let directory = new Map();

/** Call whenever the office lists load (the staff app, the admin console, the public summary). */
export function setOfficeDirectory(offices, structure) {
  const next = new Map();
  (offices || []).forEach((o) => next.set(o.id, o));
  (structure?.regionalOffices || []).forEach((o) => next.set(o.id, { ...o, placements: [{ division: o.division, region: o.region || "", area: "" }] }));
  (structure?.areaOffices || []).forEach((o) => next.set(o.id, { ...o, placements: [{ division: o.division, region: o.region, area: o.area }] }));
  directory = next;
}
export const officeById = (id) => (id ? directory.get(id) : undefined);

/** Every Division › Region › Area a record counts in: its office's placements, or its own fields. */
export function placementsOf(rec) {
  if (!rec) return [];
  if (rec.placements?.length) return rec.placements;
  const o = officeById(rec.officeId || rec.place?.officeId || rec.branchOfficeId || rec.place?.branchOfficeId);
  if (o?.placements?.length) return o.placements;
  return [{ division: rec.division || "", region: rec.region ?? rec.district ?? "", area: rec.area || "" }];
}

const fits = (p, f) => (f.division === "All" || p.division === f.division) && (f.region === "All" || p.region === f.region) && (f.area === "All" || p.area === f.area);
/** Is any of the record's places inside the filter's division / region / area? */
export const inPlace = (rec, filter) => placementsOf(rec).some((p) => fits(p, filter));
/** The values of one level ("division", "region", "area") a record counts under, within the filter. */
export const placeValues = (rec, field, filter) =>
  [...new Set(placementsOf(rec).filter((p) => fits(p, filter)).map((p) => p[field]).filter(Boolean))];

/**
 * division → region → area → [{ id, name }] branches, for the visit form's dropdowns. A branch is
 * listed under every area it sits in. Regions and areas come from /api/structure, so an area shows
 * even before it has a branch. The tree also carries the active Regional and Area Offices, as
 * `tree.regionalOffices` / `tree.areaOffices` (not enumerable, so Object.keys(tree) is still just the divisions).
 */
export function buildLocationTree(offices, structure) {
  const tree = {};
  const add = (division, region, area) => {
    if (!division || !region) return;
    tree[division] = tree[division] || {};
    tree[division][region] = tree[division][region] || {};
    if (area) tree[division][region][area] = tree[division][region][area] || [];
  };
  (structure?.regions || []).filter((r) => r.active !== false).forEach((r) => add(r.division, r.name));
  (structure?.areas || []).filter((a) => a.active !== false).forEach((a) => add(a.division, a.region, a.name));
  (offices || []).filter((o) => o.active !== false).forEach((o) => {
    placementsOf({ ...o, region: o.district }).forEach((p) => {
      if (!p.area) return;
      add(p.division, p.region, p.area);
      const list = tree[p.division][p.region][p.area];
      if (!list.some((b) => b.id === o.id)) list.push({ id: o.id, name: o.name });
    });
  });
  Object.values(tree).forEach((regions) => Object.values(regions).forEach((areas) => Object.values(areas).forEach((list) => list.sort((a, b) => a.name.localeCompare(b.name)))));
  Object.defineProperty(tree, "regionalOffices", { value: (structure?.regionalOffices || []).filter((o) => o.active !== false) });
  Object.defineProperty(tree, "areaOffices", { value: (structure?.areaOffices || []).filter((o) => o.active !== false) });
  return tree;
}

const avg = (arr) => (arr.length ? arr.reduce((s, r) => s + r, 0) / arr.length : null);
export const average = avg;

/** Five equally-weighted checks on how fully the information at one office of a visit was captured.
 *  Works on the per-office records from expandVisits() (src/lib/visits.js). */
export function visitChecks(v) {
  const obs = v.observations || [];
  const talks = v.interactions || [];
  const complaints = v.complaints || [];
  const said = (e) => String(e.description || "").trim() !== "" || !!e.voice;
  const checks = {
    registered: !!(v.location && v.date && v.reason),
    observed: obs.length > 0,
    clientRated: talks.some((o) => (o.ratings || []).some((r) => r.stars > 0)),
    covered: obs.length + talks.length + complaints.length + (v.stories || []).length > 0,
    detail: [...obs, ...talks, ...complaints].some((e) => said(e) || !!e.photoUrl),
  };
  const passed = Object.values(checks).filter(Boolean).length;
  return { checks, score: passed / 5 };
}
export const CHECK_LABELS = {
  registered: "Visit registered",
  observed: "Observation recorded",
  clientRated: "Client interaction rated",
  covered: "Something recorded at this office",
  detail: "Descriptions, photos or voice notes captured",
};

/** Star ratings at one office: one average per client interaction. Observations have no stars. */
export function visitRatings(v) {
  return (v.interactions || [])
    .map((o) => {
      const stars = (o.ratings || []).map((r) => r.stars).filter((n) => n > 0);
      return stars.length ? stars.reduce((s, n) => s + n, 0) / stars.length : null;
    })
    .filter((r) => r != null);
}

/** Clients heard at one office: each client interaction counts once (older entries kept a "members consulted" count). */
export function clientsHeard(v) {
  return (v.interactions || []).reduce((s, o) => s + (Number(o.consulted) > 0 ? Number(o.consulted) : 1), 0);
}

/** One row per active office, with its visit recency and health signals. */
export function computeCoverage(offices, visits, targetDays = 90, now = new Date()) {
  // records carry their office's id; older ones only a region and name
  const byId = {};
  const byKey = {};
  const byName = {};
  (visits || []).forEach((v) => {
    if (!v.location || !v.date || v.steps?.register === false) return;
    if (v.officeId) (byId[v.officeId] = byId[v.officeId] || []).push(v);
    else if (v.region) (byKey[`${v.region}::${v.location}`] = byKey[`${v.region}::${v.location}`] || []).push(v);
    else (byName[v.location] = byName[v.location] || []).push(v);
  });
  return (offices || []).filter((o) => o.active !== false).map((o) => {
    const vs = [...(byId[o.id] || []), ...(byKey[`${o.district}::${o.name}`] || []), ...(byName[o.name] || [])].sort((a, b) => b.date.localeCompare(a.date));
    const last = vs[0];
    const daysSince = last ? Math.max(0, Math.floor((now - new Date(last.date)) / DAY_MS)) : null;
    const status = !last ? "never" : daysSince > targetDays ? "stale" : "ok";
    const ratings = vs.flatMap(visitRatings);
    const complaints = vs.flatMap((v) => v.complaints || []);
    return {
      ...o, key: officeKey(o), region: o.district, location: o.name,
      visits: vs, visitCount: vs.length, lastDate: last?.date || null, lastBy: last?.employeeName || null,
      daysSince, status, avgRating: avg(ratings),
      openComplaints: complaints.filter((c) => !isFixed(c)).length, totalComplaints: complaints.length,
      quality: avg(vs.map((v) => visitChecks(v).score)),
    };
  });
}

export function coverageSummary(rows) {
  const total = rows.length;
  const ok = rows.filter((r) => r.status === "ok").length;
  const stale = rows.filter((r) => r.status === "stale").length;
  const never = rows.filter((r) => r.status === "never").length;
  const visited = rows.filter((r) => r.daysSince != null);
  return { total, ok, stale, never, pct: total ? Math.round((ok / total) * 100) : 0, avgDays: visited.length ? Math.round(avg(visited.map((r) => r.daysSince))) : null };
}

export function monthBuckets(n = 6, now = new Date()) {
  const out = [];
  for (let i = n - 1; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    out.push({ key: `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`, label: MONTH_LABELS[d.getMonth()] });
  }
  return out;
}
export const monthKeyOf = (dateStr) => (dateStr ? String(dateStr).slice(0, 7) : null);

export function timeAgo(days) {
  if (days == null) return "Never";
  if (days === 0) return "Today";
  if (days === 1) return "Yesterday";
  if (days < 30) return `${days} days ago`;
  if (days < 365) return `${Math.round(days / 30)} mo ago`;
  return `${(days / 365).toFixed(1)} yr ago`;
}
