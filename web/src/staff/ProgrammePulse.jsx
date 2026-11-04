import React, { useEffect, useMemo, useState } from "react";
import { ArrowRight, CheckCircle2, BarChart3 } from "lucide-react";
import { expandVisits, isDraft } from "../lib/visits";
import { computeCoverage, clientsHeard, monthKeyOf, DEFAULT_SETTINGS, DAY_MS } from "../lib/offices";
import { isFixed, complaintTitle } from "../lib/complaints";
import { CountUp, Reveal } from "../lib/ui";
import Summary from "./management/Summary";

/* The programme as a whole, for everyone in the staff app: the dashboard's "The programme this
   month" tiles (each with the person's own share), and the in-app Programme overview page.
   The programme figures come from /api/public/summary: counts only, no names or text, the same
   data the public summary page shows, so every staff member may see them. The person's own share
   comes from their own visits. */

/** The anonymised programme data, loaded once. */
export function useProgrammeData() {
  const [data, setData] = useState(null);
  const [error, setError] = useState(false);
  useEffect(() => {
    let gone = false;
    fetch("/api/public/summary").then((r) => { if (!r.ok) throw new Error("summary"); return r.json(); })
      .then(({ visits, offices, employees, departments, settings }) => {
        if (gone) return;
        const s = settings && !Array.isArray(settings) ? settings : DEFAULT_SETTINGS;
        const records = expandVisits(visits);
        setData({
          visits, offices, departments: departments || [], settings: s, records, at: new Date(),
          employees: employees.map((e) => ({ id: e.id, roles: e.roles || [], departmentId: e.departmentId, teamId: e.teamId })),
          coverage: computeCoverage(offices, records, s.visitTargetDays || 90),
        });
      })
      .catch(() => { if (!gone) setError(true); });
    return () => { gone = true; };
  }, []);
  return { data, error };
}

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

/** The figures behind the tiles: the programme's, and this person's share of each. */
function pulse(data, myVisits, now = new Date()) {
  const month = monthKeyOf(now.toISOString().slice(0, 10));
  const since90 = new Date(now.getTime() - 90 * DAY_MS).toISOString().slice(0, 10);
  const inMonth = (d) => !!d && monthKeyOf(String(d).slice(0, 10)) === month;
  const registered = (v) => v.date && v.steps?.register !== false;

  const myRecords = expandVisits(myVisits);
  const fixedThisMonth = (visits) => visits.flatMap((v) => (v.complaints || []).filter((c) => !isDraft(c) && isFixed(c) && inMonth(c.resolvedAt)));

  // branches visited within the visit target (programme), and branches this person went to in 90 days
  const ok = data.coverage.filter((r) => r.status === "ok").length;
  const myBranches = new Set(myRecords.filter((r) => r.officeKind === "branch" && r.date >= since90).map((r) => r.officeId || r.location)).size;

  const myFixed = fixedThisMonth(myVisits).sort((a, b) => String(b.resolvedAt).localeCompare(String(a.resolvedAt)));

  return {
    visits: { all: data.visits.filter((v) => registered(v) && inMonth(v.date)).length, mine: myVisits.filter((v) => registered(v) && inMonth(v.date)).length },
    branches: { pct: pct(ok, data.coverage.length), total: data.coverage.length, mine: myBranches },
    fixed: { all: fixedThisMonth(data.visits).length, mine: myFixed.length, latest: myFixed[0] || null },
    clients: {
      all: data.records.filter((r) => inMonth(r.date)).reduce((s, r) => s + clientsHeard(r), 0),
      mine: myRecords.filter((r) => inMonth(r.date)).reduce((s, r) => s + clientsHeard(r), 0),
    },
  };
}

function Tile({ i, label, value, suffix = "", mine, share }) {
  return (
    <Reveal i={i} className="pp-tile glass">
      <div className="pp-label">{label}</div>
      <div className="pp-num"><CountUp value={value} suffix={suffix} /></div>
      <div className="pp-mine">{mine}</div>
      <div className="pp-bar" aria-hidden="true"><i style={{ width: `${Math.max(0, Math.min(100, share))}%` }} /></div>
    </Reveal>
  );
}

/**
 * "The programme this month" on the dashboard: four tiles (visits, branches visited within the
 * target, issues fixed, clients heard), each with the person's part; the issues they
 * raised that were fixed; and a way to see more:
 * Management for managers, the Programme overview for everyone else.
 */
export function ProgrammePulse({ programme, myVisits, isManagement, onMore, onOpenComplaint }) {
  const p = useMemo(() => (programme.data ? pulse(programme.data, myVisits) : null), [programme.data, myVisits]);
  if (programme.error) return <div className="pp-empty">Programme figures are unavailable offline.</div>;
  if (!p) return <div className="pp-empty">Loading programme figures…</div>;
  const latest = p.fixed.latest;
  return (
    <div className="pp">
      <div className="pp-head">
        <span className="pp-title">The programme this month</span>
      </div>
      <div className="pp-tiles">
        <Tile i={0} label="Visits" value={p.visits.all} mine={`${p.visits.mine} ${p.visits.mine === 1 ? "was" : "were"} yours`} share={pct(p.visits.mine, p.visits.all)} />
        <Tile i={1} label={`Branches visited, last ${programme.data.settings.visitTargetDays || 90} days`} value={p.branches.pct} suffix="%" mine={`${p.branches.mine} by you`} share={p.branches.pct} />
        <Tile i={2} label="Issues fixed" value={p.fixed.all} mine={`${p.fixed.mine} you raised`} share={pct(p.fixed.mine, p.fixed.all)} />
        <Tile i={3} label="Clients heard" value={p.clients.all} mine={`${p.clients.mine} by you`} share={pct(p.clients.mine, p.clients.all)} />
      </div>
      {latest && (
        <button type="button" className="pp-line ok" onClick={() => onOpenComplaint(latest)}>
          <CheckCircle2 size={15} />
          <span>{p.fixed.mine} issue{p.fixed.mine > 1 ? "s" : ""} you raised {p.fixed.mine > 1 ? "were" : "was"} fixed this month. Latest: <b>{complaintTitle(latest)}</b>{latest.place?.office ? ` at ${latest.place.office}` : ""}{latest.department ? `, fixed by ${latest.department}` : ""}.</span>
        </button>
      )}
      <button type="button" className="btn btn-secondary btn-sm pp-more" onClick={onMore}>
        {isManagement ? "Open Management" : "See the programme overview"} <ArrowRight size={14} />
      </button>
    </div>
  );
}

/** The Programme overview page for staff who aren't managers: the public summary, inside the app. */
export function ProgrammeOverview({ programme, onBack }) {
  const { data, error } = programme;
  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="h-eyebrow" style={{ display: "flex", alignItems: "center", gap: 8 }}><BarChart3 size={13} /> Programme overview</p>
          <h1 className="h-title">The programme at a glance</h1>
          <p className="h-desc">Field visits, issues found and fixed, observations, clients reached and stories, across BRAC. Counts only: no one's name or details.</p>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={onBack}>Back to dashboard</button>
      </div>
      {error ? <div className="card card-pad empty-note">The overview couldn't be loaded. Try again when you're online.</div>
        : !data ? <div className="card card-pad empty-note">Loading…</div>
        : <Summary trips={data.visits} records={data.records} coverage={data.coverage} offices={data.offices} employees={data.employees} departments={data.departments} settings={data.settings} period="30d" publicView />}
    </div>
  );
}
