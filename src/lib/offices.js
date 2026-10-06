// Office master list + coverage/quality maths shared by the visit wizard, the
// management analytics, the branch profile and the admin Offices tab.

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

export const officeKey = (o) => `${o.district}::${o.name}`;

/** division → district → area → [branch names], from the active offices. */
export function buildLocationTree(offices) {
  const tree = {};
  (offices || []).filter((o) => o.active !== false).forEach((o) => {
    tree[o.division] = tree[o.division] || {};
    tree[o.division][o.district] = tree[o.division][o.district] || {};
    tree[o.division][o.district][o.area] = tree[o.division][o.district][o.area] || [];
    tree[o.division][o.district][o.area].push(o.name);
  });
  return tree;
}

const avg = (arr) => (arr.length ? arr.reduce((s, r) => s + r, 0) / arr.length : null);
export const average = avg;

/** Five equally-weighted checks on how fully a visit's information was captured. */
export function visitChecks(v) {
  const f = v.feedback || {};
  const checks = {
    registered: !!(v.location && v.date && v.reason && v.steps?.register),
    staffRated: (f.staff?.rating || 0) > 0,
    memberRated: (f.member?.rating || 0) > 0 && Number(f.member?.count) > 0,
    complaintsDone: !!v.steps?.complaints,
    detail: ((f.staff?.tags?.length || 0) + (f.member?.tags?.length || 0) > 0) || !!(f.staff?.notes || f.member?.notes),
  };
  const passed = Object.values(checks).filter(Boolean).length;
  return { checks, score: passed / 5 };
}
export const CHECK_LABELS = {
  registered: "Visit registered",
  staffRated: "Staff feedback rated",
  memberRated: "Member feedback + members consulted",
  complaintsDone: "Complaints step completed",
  detail: "Tags or notes captured",
};

export function visitRatings(v) {
  return [v.feedback?.staff?.rating, v.feedback?.member?.rating].filter((r) => typeof r === "number" && r > 0);
}

/** One row per active office, with its visit recency and health signals. */
export function computeCoverage(offices, visits, targetDays = 90, now = new Date()) {
  const byKey = {};
  const byName = {};
  (visits || []).forEach((v) => {
    if (!v.location || !v.date || v.steps?.register === false) return;
    if (v.region) (byKey[`${v.region}::${v.location}`] = byKey[`${v.region}::${v.location}`] || []).push(v);
    else (byName[v.location] = byName[v.location] || []).push(v);
  });
  return (offices || []).filter((o) => o.active !== false).map((o) => {
    const vs = [...(byKey[officeKey(o)] || []), ...(byName[o.name] || [])].sort((a, b) => b.date.localeCompare(a.date));
    const last = vs[0];
    const daysSince = last ? Math.max(0, Math.floor((now - new Date(last.date)) / DAY_MS)) : null;
    const status = !last ? "never" : daysSince > targetDays ? "stale" : "ok";
    const ratings = vs.flatMap(visitRatings);
    const complaints = vs.flatMap((v) => v.complaints || []);
    return {
      ...o, key: officeKey(o), region: o.district, location: o.name,
      visits: vs, visitCount: vs.length, lastDate: last?.date || null, lastBy: last?.employeeName || null,
      daysSince, status, avgRating: avg(ratings),
      openComplaints: complaints.filter((c) => c.status !== "Resolved").length, totalComplaints: complaints.length,
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
