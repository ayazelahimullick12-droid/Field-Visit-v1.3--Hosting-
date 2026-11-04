import React, { useMemo, useState } from "react";
import { Search, Download, ChevronRight, ExternalLink } from "lucide-react";
import { downloadCsv, CountUp } from "../../lib/ui";
import { timeAgo, DAY_MS, STATUS_META, coverageSummary, inPlace } from "../../lib/offices";
import { plural } from "../../lib/visits";
import { isFixed } from "../../lib/complaints";
import { officeRows, entryTotal, KIND_LABEL, KIND_PLURAL } from "./data";
import { periodRange, periodMeta } from "./periods";
import { StatusBar } from "./DepartmentsView";
import { SidePanel } from "./ui";

const KINDS = ["branch", "vo", "area", "region"];
const STATUS_RANK = { never: 0, stale: 1, ok: 2 };
const SORTS = {
  attention: { label: "Needs attention first", fn: (a, b) => (STATUS_RANK[a.status] ?? 3) - (STATUS_RANK[b.status] ?? 3) || (a.lastDate || "").localeCompare(b.lastDate || "") || a.name.localeCompare(b.name) },
  most: { label: "Most visited", fn: (a, b) => b.visits - a.visits || a.name.localeCompare(b.name) },
  least: { label: "Least visited", fn: (a, b) => a.visits - b.visits || (a.lastDate || "").localeCompare(b.lastDate || "") },
  oldest: { label: "Longest since last visit", fn: (a, b) => (a.lastDate || "").localeCompare(b.lastDate || "") },
  openItems: { label: "Most issues open", fn: (a, b) => b.openComplaints - a.openComplaints || b.entries.complaints - a.entries.complaints },
  entries: { label: "Most recorded", fn: (a, b) => entryTotal(b.entries) - entryTotal(a.entries) },
  name: { label: "Name", fn: (a, b) => a.name.localeCompare(b.name) },
};
const daysSince = (d) => (d ? Math.max(0, Math.floor((Date.now() - new Date(d)) / DAY_MS)) : null);

// An office matches by where it is (a branch in every area it is listed in; a VO by its branch).
function matchLoc(r, f) {
  if (!inPlace(r, f)) return false;
  if (f.branch !== "All" && r.name !== f.branch && r.parent !== f.branch) return false;
  return true;
}

/** An office's details, above its visits: where its issues stand, and who visited it (most first). */
function OfficeAtAGlance({ r, onOpenPerson }) {
  const items = r.records.flatMap((x) => x.complaints || []);
  const people = new Map();
  r.records.forEach((x) => { const p = people.get(x.employeeId) || { id: x.employeeId, name: x.employeeName, n: 0 }; p.n++; people.set(x.employeeId, p); });
  if (!r.records.length) return null;
  return (
    <div className="oa">
      {items.length > 0 && (
        <div className="oa-part">
          <span className="oa-label">{plural(items.length, "issue")} · {items.filter(isFixed).length} resolved</span>
          <StatusBar list={items} />
        </div>
      )}
      <div className="oa-part">
        <span className="oa-label">Visited by</span>
        <div className="oa-people">
          {[...people.values()].sort((a, b) => b.n - a.n).map((p) => (
            <button key={p.id} type="button" className="tag-badge oa-person" onClick={() => onOpenPerson(p.id)}>{p.name} <b>{p.n}</b></button>
          ))}
        </div>
      </div>
    </div>
  );
}

/** Management → Offices: whether every branch is being visited (status), how often every branch, VO,
 *  area and region office is visited and by whom, and how its issues are doing. `loc` comes from
 *  Management's filter bar; `preset` ({ kind, status }) from "Needs your attention". */
export default function OfficesView({ records, offices, coverage, target, period, loc, preset, onOpenBranch, onOpenPerson, onOpenVisit }) {
  const [kind, setKind] = useState(preset?.kind || "branch");
  const [status, setStatus] = useState(preset?.status || "all");
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState("attention");
  const [open, setOpen] = useState(null);
  const [showAll, setShowAll] = useState(false);
  const meta = periodMeta(period);

  // coverage status (visited within the target / overdue / never) exists for branches only: they're the master list
  const statusByKey = useMemo(() => new Map(coverage.map((c) => [c.key, c.status])), [coverage]);
  const rows = useMemo(
    () => officeRows(records, offices, periodRange(period)).map((r) => ({ ...r, status: r.kind === "branch" ? statusByKey.get(r.key) || null : null })),
    [records, offices, period, statusByKey]
  );
  const located = rows.filter((r) => matchLoc(r, loc));
  const cov = coverageSummary(located.filter((r) => r.status));
  const totals = Object.fromEntries(KINDS.map((k) => [k, located.filter((r) => r.kind === k).reduce((s, r) => s + r.visits, 0)]));
  const counts = Object.fromEntries(["all", ...KINDS].map((k) => [k, k === "all" ? located.length : located.filter((r) => r.kind === k).length]));
  const statusCounts = { never: cov.never, stale: cov.stale, ok: cov.ok };
  const q = query.trim().toLowerCase();
  const list = located
    .filter((r) => kind === "all" || r.kind === kind)
    .filter((r) => status === "all" || r.status === status)
    .filter((r) => !q || [r.name, r.parent, r.area, r.region, r.division, r.lastBy].some((x) => String(x || "").toLowerCase().includes(q)))
    .sort(SORTS[sort].fn);
  const shown = showAll ? list : list.slice(0, 25);

  const exportCsv = () => downloadCsv(`office-visits-${period}.csv`, [
    { label: "Office", key: "name" }, { label: "Type", get: (r) => KIND_LABEL[r.kind] }, { label: "Under", key: "parent" },
    { label: `Status (visited within ${target} days)`, get: (r) => (r.status ? STATUS_META[r.status].label : "") },
    { label: "Division", key: "division" }, { label: "Region", key: "region" }, { label: "Area", key: "area" },
    { label: `Visits (${meta.label})`, key: "visits" }, { label: "Staff", key: "staff" },
    { label: "Issues", get: (r) => r.entries.complaints }, { label: "Client interactions", get: (r) => r.entries.interactions },
    { label: "Observations", get: (r) => r.entries.observations }, { label: "Stories", get: (r) => r.entries.stories },
    { label: "Avg rating", get: (r) => (r.avgRating == null ? "" : r.avgRating.toFixed(2)) },
    { label: "Info completeness %", get: (r) => (r.quality == null ? "" : Math.round(r.quality * 100)) },
    { label: "Open issues", key: "openComplaints" }, { label: "Last visit", key: "lastDate" }, { label: "Last visited by", key: "lastBy" },
  ], list);

  const openRow = open ? rows.find((r) => r.key === open) : null;

  return (
    <>
      <div className="kpi-grid" style={{ marginBottom: 16 }}>
        {KINDS.map((k) => (
          <button key={k} type="button" className={`kpi kpi-btn ${kind === k ? "on" : ""}`} onClick={() => setKind(kind === k ? "all" : k)}>
            <div className="kpi-num"><CountUp value={totals[k]} /></div>
            <div className="kpi-label">{KIND_PLURAL[k]}: visits · {meta.label.toLowerCase()}</div>
            <div className="kpi-foot">
              <span className="pill pill-brand">{counts[k].toLocaleString()} offices</span>
              {k === "branch" && cov.total > 0 && <span className={`pill ${cov.pct >= 80 ? "pill-ok" : cov.pct >= 50 ? "pill-stale" : "pill-never"}`}>{cov.pct}% covered</span>}
            </div>
          </button>
        ))}
      </div>

      <div className="card card-pad">
        <div className="section-header">
          <div>
            <p className="analytics-card-title" style={{ marginBottom: 2 }}>Every office</p>
            <p className="analytics-card-sub" style={{ margin: 0 }}>{list.length.toLocaleString()} of {rows.length.toLocaleString()} · visits in {meta.label.toLowerCase()}. Status and last visit ignore the period: on track means visited within {target} days. Select an office for its visits and who went.</p>
          </div>
          <button className="btn btn-secondary btn-sm" onClick={exportCsv}><Download size={14} /> Export CSV</button>
        </div>

        {/* one row: search, type, status, sort */}
        <div className="mg-tools">
          <div className="search-box">
            <Search size={16} />
            <input className="input" placeholder="Search an office, area, region or the last visitor" value={query} onChange={(e) => setQuery(e.target.value)} />
          </div>
          <select className="select" aria-label="Type of office" value={kind} onChange={(e) => setKind(e.target.value)}>
            {["all", ...KINDS].map((k) => <option key={k} value={k}>{k === "all" ? "All offices" : KIND_PLURAL[k]} ({counts[k].toLocaleString()})</option>)}
          </select>
          <select className="select" aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="all">Any status</option>
            <option value="never">{STATUS_META.never.label} ({statusCounts.never.toLocaleString()})</option>
            <option value="stale">Overdue, over {target} days ({statusCounts.stale.toLocaleString()})</option>
            <option value="ok">{STATUS_META.ok.short} ({statusCounts.ok.toLocaleString()})</option>
          </select>
          <select className="select" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}>
            {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
          </select>
        </div>

        <div className="ctable-wrap">
          <table className="ctable stack">
            <thead><tr><th>Office</th><th>Type</th><th>Status</th><th>Visits</th><th>Staff</th><th>Recorded</th><th>Rating</th><th>Issues</th><th>Last visit</th><th /></tr></thead>
            <tbody>
              {shown.map((r) => {
                const d = daysSince(r.lastDate);
                return (
                  <tr key={r.key} className={`row-link ${open === r.key ? "sel" : ""}`} onClick={() => setOpen(r.key)}>
                    <td data-label="Office"><div className="cell-main">{r.name}</div><div className="cell-sub">{[r.kind === "vo" ? r.parent : r.area, r.region].filter(Boolean).join(" · ") || "—"}</div></td>
                    <td data-label="Type"><span className="tag-badge">{KIND_LABEL[r.kind]}</span></td>
                    <td data-label="Status">{r.status ? <span className={`pill ${STATUS_META[r.status].pill}`}>{STATUS_META[r.status].short}</span> : <span style={{ color: "var(--ink-faint)" }} title="Only branches are measured against the visit target">—</span>}</td>
                    <td data-label="Visits"><b>{r.visits}</b></td>
                    <td data-label="Staff">{r.staff}</td>
                    <td data-label="Recorded" title="issues · client interactions · observations · stories">
                      {entryTotal(r.entries) ? `${r.entries.complaints} · ${r.entries.interactions} · ${r.entries.observations} · ${r.entries.stories}` : <span style={{ color: "var(--ink-faint)" }}>—</span>}
                    </td>
                    <td data-label="Rating">{r.avgRating == null ? "—" : `${r.avgRating.toFixed(1)}★`}</td>
                    <td data-label="Issues" title="raised in the period · how many of them are resolved">
                      {r.entries.complaints ? <>
                        <b>{r.entries.complaints}</b> <span className="cell-sub" style={{ display: "inline" }}>· {Math.round(((r.entries.complaints - r.openComplaints) / r.entries.complaints) * 100)}% resolved</span>
                        {r.openComplaints > 0 && <div><span className="pill pill-stale">{r.openComplaints} open</span></div>}
                      </> : <span style={{ color: "var(--ink-faint)" }}>0</span>}
                    </td>
                    <td data-label="Last visit">{r.lastDate ? <><div className="cell-main">{timeAgo(d)}</div><div className="cell-sub">{r.lastBy}</div></> : <span style={{ color: "var(--ink-faint)" }}>Never</span>}</td>
                    <td data-label="" style={{ textAlign: "right" }}><ChevronRight size={15} color="var(--ink-faint)" /></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {list.length === 0 && <div className="viz-empty">No offices match.</div>}
        {list.length > 25 && (
          <div style={{ textAlign: "center", marginTop: 14 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowAll((s) => !s)}>{showAll ? "Show fewer" : `Show all ${list.length.toLocaleString()}`}</button>
          </div>
        )}
      </div>

      {openRow && (
        <SidePanel title={openRow.name} onClose={() => setOpen(null)}
          sub={[KIND_LABEL[openRow.kind], openRow.kind === "vo" ? openRow.parent && `under ${openRow.parent}` : openRow.area, openRow.region].filter(Boolean).join(" · ")}
          actions={openRow.kind === "branch" && openRow.office ? <button className="btn btn-secondary btn-sm" onClick={() => onOpenBranch(openRow.office)}><ExternalLink size={13} /> Branch 360°</button> : null}>
          <div className="sp-stats">
            <div><b>{openRow.visits}</b><span>visits · {meta.label.toLowerCase()}</span></div>
            <div><b>{openRow.entries.complaints}</b><span>issues · {openRow.openComplaints} open</span></div>
            <div><b>{openRow.avgRating == null ? "—" : `${openRow.avgRating.toFixed(1)}★`}</b><span>client rating</span></div>
          </div>
          {openRow.status && <p className="sp-note"><span className={`pill ${STATUS_META[openRow.status].pill}`}>{STATUS_META[openRow.status].short}</span> Last visit {openRow.lastDate ? `${timeAgo(daysSince(openRow.lastDate))}, by ${openRow.lastBy}` : "never"}.</p>}
          <OfficeAtAGlance r={openRow} onOpenPerson={onOpenPerson} />
          <p className="sp-label">{plural(openRow.records.length, "visit")} in {meta.label.toLowerCase()}, newest first · select one to open it</p>
          {openRow.records.length === 0 ? <div className="viz-empty" style={{ padding: 12 }}>No visits in this period.</div> : (
            [...openRow.records].sort((a, b) => (b.date || "").localeCompare(a.date || "")).map((v) => (
              <button key={v.id} type="button" className="sp-item" onClick={() => onOpenVisit(v.tripId)}>
                <span className="sp-item-main">
                  <b>{v.employeeName}</b>
                  <small>{v.date} · {v.reason || "No purpose given"}</small>
                </span>
                <span className="sp-item-tags">
                  {[
                    v.complaints.length && plural(v.complaints.length, "issue"),
                    v.interactions.length && plural(v.interactions.length, "client talk"),
                    v.observations.length && plural(v.observations.length, "observation"),
                    v.stories.length && plural(v.stories.length, "story", "stories"),
                  ].filter(Boolean).map((t) => <span key={t} className="tag-badge">{t}</span>)}
                </span>
              </button>
            ))
          )}
        </SidePanel>
      )}
    </>
  );
}
