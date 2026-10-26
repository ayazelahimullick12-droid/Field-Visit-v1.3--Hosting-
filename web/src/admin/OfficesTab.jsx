import React, { useMemo, useState } from "react";
import { Search, Download, MapPin, Target, Power, Save } from "lucide-react";
import { Reveal, downloadCsv } from "../lib/ui";
import { Kpi } from "../staff/analytics/common";
import { DEFAULT_SETTINGS, STATUS_META, computeCoverage, coverageSummary, officeKey, timeAgo } from "../lib/offices";
import { expandVisits } from "../lib/visits";

/* Branch offices: the list behind the visit form's branch dropdown and management's coverage
   ("never visited") tracking. It comes from BRAC's branch API (see Locations & lists → Sync) and
   can't be edited here. A branch sits in every area its programmes put it in; one the API no longer
   lists is switched off, never deleted, so its visits stay. The admin sets the visit target here. */

const PAGE = 15;
const placesOf = (o) => (o.placements?.length ? o.placements : [{ division: o.division, region: o.district, area: o.area }]);

export default function OfficesTab({ offices, structure, visits, settings, setSettings, showToast }) {
  const DIVISIONS = structure?.divisions || [];
  const regions = structure?.regions || [];
  const target = settings?.visitTargetDays || DEFAULT_SETTINGS.visitTargetDays;
  const [targetDraft, setTargetDraft] = useState(String(target));
  const [query, setQuery] = useState("");
  const [division, setDivision] = useState("All");
  const [state, setState] = useState("all"); // all | never | stale | ok | inactive
  const [showAll, setShowAll] = useState(false);

  const coverage = useMemo(() => computeCoverage(offices, expandVisits(visits), target), [offices, visits, target]);
  const covByKey = useMemo(() => Object.fromEntries(coverage.map((r) => [r.key, r])), [coverage]);
  const sum = useMemo(() => coverageSummary(coverage), [coverage]);
  const inactive = offices.filter((o) => o.active === false).length;
  const regionsCovered = new Set(coverage.flatMap((o) => placesOf(o).map((p) => `${p.division}|${p.region}`))).size;

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase();
    return offices
      .map((o) => ({ o, cov: covByKey[officeKey(o)] }))
      .filter(({ o, cov }) => {
        if (division !== "All" && !placesOf(o).some((p) => p.division === division)) return false;
        const retired = o.active === false;
        if (state === "inactive" && !retired) return false;
        if ((state === "never" || state === "stale" || state === "ok") && (retired || cov?.status !== state)) return false;
        return !q || `${o.name} ${o.code || ""} ${placesOf(o).map((p) => `${p.area} ${p.region} ${p.division}`).join(" ")}`.toLowerCase().includes(q);
      })
      .sort((a, b) => (a.o.division || "").localeCompare(b.o.division || "") || (a.o.district || "").localeCompare(b.o.district || "") || a.o.name.localeCompare(b.o.name));
  }, [offices, covByKey, query, division, state]);
  const shown = showAll ? rows : rows.slice(0, PAGE);

  const saveTarget = () => {
    const n = Math.round(Number(targetDraft));
    if (!Number.isFinite(n) || n < 1 || n > 365) { showToast("Enter a number of days between 1 and 365."); return; }
    setSettings({ ...(settings || DEFAULT_SETTINGS), visitTargetDays: n });
    setTargetDraft(String(n));
    showToast(`Visit target set to ${n} days — coverage updates everywhere straight away.`);
  };

  const exportCsv = () =>
    downloadCsv(`branch-offices-${new Date().toISOString().slice(0, 10)}.csv`, [
      { label: "Branch", key: "name" }, { label: "Branch code", key: "code" },
      { label: "Area", key: "area" }, { label: "Region", key: "district" }, { label: "Division", key: "division" },
      { label: "Also in", get: (o) => placesOf(o).slice(1).map((p) => [p.division, p.region, p.area].join(" › ")).join("; ") },
      { label: "Active", get: (o) => (o.active === false ? "no" : "yes") },
    ], offices);

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <p className="h-eyebrow">Configuration</p>
          <h1 className="h-title">Branch offices</h1>
          <p className="h-desc">The branches behind the visit form and management's "never visited" tracking, from BRAC's branch API (all programmes). They change with each sync on <b>Locations &amp; lists</b>; a branch the API no longer lists is switched off, keeping its visits.</p>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button className="btn btn-secondary btn-sm" onClick={exportCsv}><Download size={14} /> Export CSV</button>
        </div>
      </div>

      <div className="kpi-grid" style={{ marginBottom: 18 }}>
        <Reveal i={0}><Kpi icon={MapPin} tone="green" label="Active branches" value={sum.total} /></Reveal>
        <Reveal i={1}><Kpi icon={Target} label="Regions with branches" value={regionsCovered} foot={<span className="pill pill-brand">of {regions.length}</span>} /></Reveal>
        <Reveal i={2}><Kpi icon={MapPin} tone="red" label="Never visited" value={sum.never} /></Reveal>
        <Reveal i={3}><Kpi icon={MapPin} tone="amber" label={`Overdue (> ${target} days)`} value={sum.stale} /></Reveal>
        <Reveal i={4}><Kpi icon={Power} tone="blue" label="No longer in the API" value={inactive} /></Reveal>
      </div>

      <Reveal className="card card-pad" style={{ marginBottom: 18 }}>
        <div className="target-row">
          <div>
            <p className="analytics-card-title" style={{ marginBottom: 2 }}>Visit target</p>
            <p className="analytics-card-sub" style={{ margin: 0 }}>
              An office not visited within this many days is flagged <strong>Overdue</strong> on the management dashboard.
            </p>
          </div>
          <div className="target-controls">
            <div className="filter-chips">
              {[30, 60, 90, 120, 180].map((n) => (
                <button key={n} className={`filter-chip ${Number(targetDraft) === n ? "active" : ""}`} onClick={() => setTargetDraft(String(n))}>{n}d</button>
              ))}
            </div>
            <input className="input" type="number" min="1" max="365" value={targetDraft} onChange={(e) => setTargetDraft(e.target.value)}
                   onKeyDown={(e) => e.key === "Enter" && saveTarget()} style={{ width: 96 }} aria-label="Visit target in days" />
            <button className="btn btn-primary btn-sm" onClick={saveTarget} disabled={Number(targetDraft) === target}><Save size={14} /> Save</button>
          </div>
        </div>
      </Reveal>

      <div className="toolbar">
        <div className="search-box">
          <Search size={16} />
          <input className="input" placeholder="Search branch, code, area, region…" value={query} onChange={(e) => { setQuery(e.target.value); setShowAll(false); }} />
        </div>
        <select className="select" style={{ width: "auto", minWidth: 170 }} value={division} onChange={(e) => { setDivision(e.target.value); setShowAll(false); }} aria-label="Division">
          <option value="All">All divisions</option>
          {DIVISIONS.map((d) => <option key={d}>{d}</option>)}
        </select>
        <div className="filter-chips">
          {[["all", "All"], ["never", "Never visited"], ["stale", "Overdue"], ["ok", "On track"], ["inactive", "No longer in the API"]].map(([k, label]) => (
            <button key={k} className={`filter-chip ${state === k ? "active" : ""}`} onClick={() => { setState(k); setShowAll(false); }}>{label}</button>
          ))}
        </div>
      </div>

      {rows.length === 0 ? (
        <div className="card empty-state">{offices.length ? "No offices match." : "No branches yet: run a sync on Locations & lists."}</div>
      ) : (
        <div className="ctable-wrap">
          <table className="ctable stack">
            <thead>
              <tr><th>Branch</th><th>Where</th><th>Status</th><th>Last visit</th><th>Visits</th></tr>
            </thead>
            <tbody>
              {shown.map(({ o, cov }) => {
                const retired = o.active === false;
                const meta = cov ? STATUS_META[cov.status] : null;
                const places = placesOf(o);
                return (
                  <tr key={o.id} style={retired ? { opacity: 0.6 } : undefined}>
                    <td data-label="Branch"><div className="cell-main">{o.name}</div><div className="cell-sub mono">{o.code || o.id}</div></td>
                    <td data-label="Where">
                      <div className="cell-main">{places[0].area}</div>
                      <div className="cell-sub">{places[0].region} · {places[0].division}{places.length > 1 ? ` · also in ${places.length - 1} more area${places.length > 2 ? "s" : ""}` : ""}</div>
                    </td>
                    <td data-label="Status">{retired ? <span className="pill pill-brand">Not in API</span> : meta && <span className={`pill ${meta.pill}`}>{meta.short}</span>}</td>
                    <td data-label="Last visit">{cov?.lastDate ? <><div className="cell-main">{timeAgo(cov.daysSince)}</div><div className="cell-sub">{cov.lastDate}</div></> : <span style={{ color: "var(--ink-faint)" }}>—</span>}</td>
                    <td data-label="Visits">{cov ? cov.visitCount : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {rows.length > PAGE && (
        <div style={{ textAlign: "center", marginTop: 14 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setShowAll((s) => !s)}>{showAll ? "Show fewer" : `Show all ${rows.length}`}</button>
        </div>
      )}
    </div>
  );
}
