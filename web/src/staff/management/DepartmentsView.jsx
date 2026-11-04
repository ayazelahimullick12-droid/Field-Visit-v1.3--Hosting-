import React, { useMemo, useState } from "react";
import { ChevronRight, Download } from "lucide-react";
import { downloadCsv } from "../../lib/ui";
import { submittedComplaints, plural } from "../../lib/visits";
import { statusOf, statusClass, isFixed, isLate, complaintTitle } from "../../lib/complaints";
import { average, DAY_MS } from "../../lib/offices";
import { matchesLocation } from "../analytics/common";
import { STATUS_WORDS } from "./Summary";
import { daysToResolve } from "./data";
import { periodRange, periodMeta, inPeriod } from "./periods";
import { SidePanel, TipBar } from "./ui";

/* Management → Departments: how well each department deals with the issues it is given.
   Counts the issues raised in the period (in the chosen place); their status is as of today. */

const OLD_DAYS = 14;
const NO_DEPT = "No department chosen";
const filedOn = (c) => c.submittedAt || c.filedDate || c.visitDate;
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const one = (n) => (n == null ? "—" : Number(n.toFixed(1)).toString());

// The quick filters (also what "Needs your attention" opens with)
const FOCUS = {
  all: { label: "All", test: () => true },
  open: { label: "Still open", test: (c) => !isFixed(c) },
  high: { label: "High urgency, open > 14 days", test: (c, now) => !isFixed(c) && c.urgency === "High" && (now - new Date(filedOn(c))) / DAY_MS > OLD_DAYS },
  late: { label: "Past deadline", test: (c, now) => isLate(c, now) },
  waiting: { label: "Not given to a department yet", test: (c) => statusOf(c) === "Waiting" },
};

/** One stacked bar of where a list of issues stands; each part shows its count and share on hover. */
export function StatusBar({ list }) {
  return <TipBar className="dp-bar" parts={STATUS_WORDS.map(([key, label, color]) => ({ label, color, value: list.filter((c) => statusOf(c) === key).length }))} />;
}

/** One open issue in a department's side panel. */
function IssueRow({ c, now, onOpenVisit }) {
  const age = Math.floor((now - new Date(filedOn(c))) / DAY_MS);
  return (
    <button type="button" className="sp-item" onClick={() => onOpenVisit(c.visitId)} title="Open the visit it was recorded on">
      <span className="sp-item-main">
        <b>{complaintTitle(c)}</b>
        <small>{[c.location, c.unit, `filed ${String(filedOn(c) || "").slice(0, 10)}`, c.deadline && `deadline ${String(c.deadline).slice(0, 10)}`].filter(Boolean).join(" · ")}</small>
      </span>
      <span className="sp-item-tags">
        <span className={`pill ${c.urgency === "High" ? "pill-never" : c.urgency === "Medium" ? "pill-stale" : ""}`}>{c.urgency || "—"}</span>
        <span className={statusClass(c)}>{statusOf(c)}</span>
        <span className={`dp-age ${age > OLD_DAYS ? "old" : ""}`}>{age} days</span>
      </span>
    </button>
  );
}

export default function DepartmentsView({ trips, loc, period, preset, onOpenVisit }) {
  const [focus, setFocus] = useState(preset?.focus || "all");
  const [open, setOpen] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const meta = periodMeta(period);
  const now = useMemo(() => new Date(), []);

  const raised = useMemo(() => {
    const r = periodRange(period);
    return submittedComplaints(trips).filter((c) => matchesLocation(c, loc) && inPeriod(filedOn(c), r));
  }, [trips, loc, period]);
  const items = raised.filter((c) => FOCUS[focus].test(c, now));
  const focusCount = (k) => raised.filter((c) => FOCUS[k].test(c, now)).length;

  const rows = useMemo(() => {
    const m = new Map();
    items.forEach((c) => { const d = c.department || NO_DEPT; m.set(d, [...(m.get(d) || []), c]); });
    return [...m.entries()].map(([name, list]) => {
      const fixed = list.filter(isFixed);
      const openList = list.filter((c) => !isFixed(c)).sort((a, b) => String(filedOn(a)).localeCompare(String(filedOn(b))));
      const units = new Map();
      list.forEach((c) => { const u = c.unit || "Unit not set"; const x = units.get(u) || { total: 0, open: 0 }; x.total++; if (!isFixed(c)) x.open++; units.set(u, x); });
      return {
        name, list, openList,
        fixed: fixed.length,
        days: average(fixed.map(daysToResolve).filter((d) => d != null)),
        late: list.filter((c) => isLate(c, now)).length,
        highOpen: openList.filter((c) => c.urgency === "High").length,
        units: [...units.entries()].sort((a, b) => b[1].total - a[1].total),
      };
    }).sort((a, b) => (a.name === NO_DEPT) - (b.name === NO_DEPT) || b.list.length - a.list.length);
  }, [items, now]);

  const openRow = rows.find((d) => d.name === open);
  const allFixed = raised.filter(isFixed);
  const avgDays = average(allFixed.map(daysToResolve).filter((d) => d != null));

  const exportCsv = () => downloadCsv(`action-items-${period}.csv`, [
    { label: "Filed", get: (c) => String(filedOn(c) || "").slice(0, 10) }, { label: "Department", get: (c) => c.department || "" }, { label: "Unit", get: (c) => c.unit || "" },
    { label: "Office", key: "location" }, { label: "Title", get: complaintTitle }, { label: "Urgency", key: "urgency" }, { label: "Status", get: statusOf },
    { label: "Deadline", get: (c) => c.deadline || "" }, { label: "Resolved", get: (c) => String(c.resolvedAt || "").slice(0, 10) },
  ], items);

  return (
    <>
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        <button type="button" className={`kpi kpi-btn ${focus === "all" ? "on" : ""}`} onClick={() => setFocus("all")}>
          <div className="kpi-num">{raised.length}</div>
          <div className="kpi-label">Issues raised · {meta.label.toLowerCase()}</div>
          <div className="kpi-foot"><span className="pill pill-brand">{raised.length - focusCount("waiting")} given to a department</span></div>
        </button>
        <button type="button" className={`kpi kpi-btn ${focus === "waiting" ? "on" : ""}`} onClick={() => setFocus(focus === "waiting" ? "all" : "waiting")}>
          <div className="kpi-num">{focusCount("waiting")}</div>
          <div className="kpi-label">Not given to a department yet</div>
          <div className="kpi-foot"><span className={`pill ${focusCount("waiting") ? "pill-stale" : "pill-ok"}`}>waiting for the admin</span></div>
        </button>
        <button type="button" className={`kpi kpi-btn ${focus === "late" ? "on" : ""}`} onClick={() => setFocus(focus === "late" ? "all" : "late")}>
          <div className="kpi-num">{focusCount("late")}</div>
          <div className="kpi-label">Past their deadline</div>
          <div className="kpi-foot"><span className={`pill ${focusCount("late") ? "pill-never" : "pill-ok"}`}>{focusCount("high")} high urgency, open &gt; {OLD_DAYS} days</span></div>
        </button>
        <button type="button" className={`kpi kpi-btn ${focus === "open" ? "on" : ""}`} onClick={() => setFocus(focus === "open" ? "all" : "open")}>
          <div className="kpi-num">{pct(allFixed.length, raised.length)}%</div>
          <div className="kpi-label">Resolved</div>
          <div className="kpi-foot"><span className="pill pill-ok">{avgDays == null ? "none resolved yet" : `${one(avgDays)} days on average`}</span></div>
        </button>
      </div>

      <div className="card card-pad">
        <div className="section-header">
          <div>
            <p className="analytics-card-title" style={{ marginBottom: 2 }}>Every department</p>
            <p className="analytics-card-sub" style={{ margin: 0 }}>Issues raised in {meta.label.toLowerCase()}; where they stand is as of today. Select a department for its units and open items.</p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={exportCsv}><Download size={14} /> Export CSV</button>
        </div>
        <div className="toolbar">
          <div className="filter-chips">
            {Object.entries(FOCUS).map(([k, f]) => (
              <button key={k} className={`filter-chip ${focus === k ? "active" : ""}`} onClick={() => setFocus(k)}>{f.label} <span className="fc-count">{focusCount(k)}</span></button>
            ))}
          </div>
        </div>
        <div className="dp-legend">
          {STATUS_WORDS.map(([key, label, color]) => <span key={key}><i style={{ background: color }} />{label}</span>)}
        </div>

        <div className="ctable-wrap">
          <table className="ctable stack">
            <thead><tr><th>Department</th><th>Issues</th><th style={{ width: "30%" }}>Where they stand</th><th>Resolved</th><th>Days to fix</th><th>Late</th><th>High urgency open</th><th /></tr></thead>
            <tbody>
              {rows.map((d) => {
                const isOpen = open === d.name;
                return (
                  <React.Fragment key={d.name}>
                    <tr className={`row-link ${isOpen ? "sel" : ""}`} onClick={() => { setOpen(d.name); setShowAll(false); }}>
                      <td data-label="Department"><div className="cell-main">{d.name}</div><div className="cell-sub">{plural(d.units.length, "unit")}</div></td>
                      <td data-label="Issues"><b>{d.list.length}</b> <span className="cell-sub" style={{ display: "inline" }}>· {d.openList.length} open</span></td>
                      <td data-label="Where they stand"><StatusBar list={d.list} /></td>
                      <td data-label="Resolved">{pct(d.fixed, d.list.length)}%</td>
                      <td data-label="Days to fix">{one(d.days)}</td>
                      <td data-label="Late">{d.late ? <span className="pill pill-never">{d.late}</span> : <span style={{ color: "var(--ink-faint)" }}>0</span>}</td>
                      <td data-label="High urgency open">{d.highOpen ? <span className="pill pill-stale">{d.highOpen}</span> : <span style={{ color: "var(--ink-faint)" }}>0</span>}</td>
                      <td data-label="" style={{ textAlign: "right" }}><ChevronRight size={15} color="var(--ink-faint)" /></td>
                    </tr>
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        {rows.length === 0 && <div className="viz-empty">No issues match.</div>}
      </div>

      {openRow && (
        <SidePanel title={openRow.name} onClose={() => setOpen(null)}
          sub={`${plural(openRow.list.length, "issue")} · ${pct(openRow.fixed, openRow.list.length)}% resolved${openRow.days != null ? ` in ${one(openRow.days)} days on average` : ""}`}>
          <div className="sp-stats">
            <div><b>{openRow.openList.length}</b><span>still open</span></div>
            <div><b>{openRow.late}</b><span>past deadline</span></div>
            <div><b>{openRow.highOpen}</b><span>high urgency open</span></div>
          </div>
          <p className="sp-label">Where they stand</p>
          <StatusBar list={openRow.list} />
          <p className="sp-label">By unit</p>
          <div className="dp-units">
            {openRow.units.map(([u, x]) => <span key={u} className="tag-badge">{u} <b>{x.total}</b>{x.open ? ` · ${x.open} open` : ""}</span>)}
          </div>
          <p className="sp-label">{plural(openRow.openList.length, "open issue")}, oldest first · select one to open its visit</p>
          {openRow.openList.length === 0 ? <div className="viz-empty" style={{ padding: 12 }}>Everything here is resolved.</div>
            : (showAll ? openRow.openList : openRow.openList.slice(0, 12)).map((c) => <IssueRow key={`${c.visitId}-${c.id}`} c={c} now={now} onOpenVisit={onOpenVisit} />)}
          {openRow.openList.length > 12 && (
            <div style={{ textAlign: "center", marginTop: 10 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAll((x) => !x)}>{showAll ? "Show fewer" : `Show all ${openRow.openList.length}`}</button>
            </div>
          )}
        </SidePanel>
      )}
    </>
  );
}
