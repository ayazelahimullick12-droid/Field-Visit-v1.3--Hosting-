import React, { useMemo, useState } from "react";
import {
  Search, Download, ChevronRight, ExternalLink, ArrowLeft, MapPin, Building2, PenLine, MessageCircle, Star, ShieldCheck, Mail, Phone, Contact, Users,
} from "lucide-react";
import { Reveal, downloadCsv } from "../../lib/ui";
import { TrendLineChart } from "../../lib/charts";
import { timeAgo, monthBuckets, DAY_MS } from "../../lib/offices";
import { ENTRY_TYPES, ENTRY_ORDER, plural, entriesOf, isDraft, reasonText } from "../../lib/visits";
import { Kpi, matchesLocation } from "../analytics/common";
import VisitCard from "../visits/VisitCard";
import { EntryRow } from "../visits/VisitHub";
import { EntryView } from "../visits/EntrySheet";
import { peopleList, personStats, placesOf, entriesBy, KIND_LABEL } from "./data";
import { periodRange, periodMeta, inPeriod } from "./periods";
import { SidePanel, TipBar } from "./ui";

const ROLE_LABELS = { field: "Base user", fixer: "Resolver", management: "Management" };
const initials = (name) => (name || "?").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
const sinceText = (d) => (d ? timeAgo(Math.max(0, Math.floor((Date.now() - new Date(d)) / DAY_MS))) : "Never");
const roleList = (p) => (p.roles?.length ? p.roles : ["field"]);
const pctText = (q) => (q == null ? "—" : `${Math.round(q * 100)}%`);

const SORTS = {
  most: { label: "Most visits", fn: (a, b) => b.s.trips - a.s.trips || a.name.localeCompare(b.name) },
  least: { label: "Fewest visits", fn: (a, b) => a.s.trips - b.s.trips || a.name.localeCompare(b.name) },
  quality: { label: "Lowest completeness", fn: (a, b) => (a.s.quality ?? 2) - (b.s.quality ?? 2) },
  last: { label: "Longest since last visit", fn: (a, b) => (a.s.lastDate || "").localeCompare(b.s.lastDate || "") },
  items: { label: "Most issues", fn: (a, b) => b.s.complaints - a.s.complaints || a.name.localeCompare(b.name) },
  upcoming: { label: "Most upcoming visits", fn: (a, b) => b.s.upcoming - a.s.upcoming || a.name.localeCompare(b.name) },
  observations: { label: "Most observations", fn: (a, b) => b.s.entries.observations - a.s.entries.observations || a.name.localeCompare(b.name) },
  talks: { label: "Most client interactions", fn: (a, b) => b.s.entries.interactions - a.s.entries.interactions || a.name.localeCompare(b.name) },
  stories: { label: "Most stories", fn: (a, b) => b.s.entries.stories - a.s.entries.stories || a.name.localeCompare(b.name) },
  notDone: { label: "Visits not marked done", fn: (a, b) => b.s.notDone - a.s.notDone || a.name.localeCompare(b.name) },
  name: { label: "Name", fn: (a, b) => a.name.localeCompare(b.name) },
};

// the colours of the four kinds of entry, in the "What they recorded" bar
const ENTRY_COLORS = { complaint: "var(--danger)", interaction: "var(--info)", observation: "var(--brand)", story: "var(--warning)" };

/** A person's details in the side panel: what they did, where they went, what they recorded, their latest visits. */
function PersonGlance({ p, records, trips, range, onOpenVisit, onOpenBranchByName }) {
  const places = placesOf(p, records, range);
  const visits = trips.filter((v) => v.employeeId === p.id && v.date && inPeriod(v.date, range)).sort((a, b) => b.date.localeCompare(a.date));
  const [all, setAll] = useState(false);
  return (
    <>
      <div className="sp-stats">
        <div><b>{p.s.trips}</b><span>visits{p.s.upcoming ? ` · ${p.s.upcoming} upcoming` : ""}</span></div>
        <div><b>{p.s.offices}</b><span>offices</span></div>
        <div><b>{p.s.complaints}</b><span>issues · {p.s.resolved} resolved</span></div>
      </div>
      {p.s.entryCount > 0 && (
        <>
          <p className="sp-label">What they recorded · {plural(p.s.entryCount, "entry", "entries")}</p>
          <TipBar className="dp-bar" parts={ENTRY_ORDER.map((t) => ({ label: ENTRY_TYPES[t].plural, value: p.s.entries[ENTRY_TYPES[t].list], color: ENTRY_COLORS[t] }))} />
          <div className="dp-legend" style={{ marginTop: 8 }}>
            {ENTRY_ORDER.map((t) => <span key={t}><i style={{ background: ENTRY_COLORS[t] }} />{ENTRY_TYPES[t].plural} <b>{p.s.entries[ENTRY_TYPES[t].list]}</b></span>)}
          </div>
        </>
      )}
      {places.length > 0 && (
        <>
          <p className="sp-label">Where they went · select a branch for its profile</p>
          <div className="oa-people">
            {places.slice(0, 14).map((x) => (
              <button key={x.key} type="button" className="tag-badge oa-person" disabled={x.kind !== "branch"} onClick={() => onOpenBranchByName(x.name)} title={`${KIND_LABEL[x.kind]}${x.where ? ` · ${x.where}` : ""} · last ${x.last}`}>
                {x.name} <b>{x.count}</b>
              </button>
            ))}
            {places.length > 14 && <span className="cell-sub" style={{ alignSelf: "center" }}>+{places.length - 14} more</span>}
          </div>
        </>
      )}
      <p className="sp-label">{plural(visits.length, "visit")}, newest first · select one to open it</p>
      {visits.length === 0 ? <div className="viz-empty" style={{ padding: 12 }}>No visits in this period.</div> : (all ? visits : visits.slice(0, 8)).map((v) => (
        <button key={v.id} type="button" className="sp-item" onClick={() => onOpenVisit(v.id)}>
          <span className="sp-item-main">
            <b>{(v.stops || []).filter((x) => !x.skipped && x.kind !== "vo").map((x) => x.name).join(", ") || "No office"}</b>
            <small>{v.date} · {reasonText(v) || "No purpose given"}</small>
          </span>
          <span className="sp-item-tags">
            {ENTRY_ORDER.map((t) => { const n = entriesOf(v, t).filter((e) => !isDraft(e)).length; return n ? <span key={t} className="tag-badge">{plural(n, ENTRY_TYPES[t].label.toLowerCase(), ENTRY_TYPES[t].plural.toLowerCase())}</span> : null; })}
          </span>
        </button>
      ))}
      {visits.length > 8 && (
        <div style={{ textAlign: "center", marginTop: 10 }}>
          <button className="btn btn-secondary btn-sm" onClick={() => setAll((x) => !x)}>{all ? "Show fewer" : `Show all ${visits.length}`}</button>
        </div>
      )}
    </>
  );
}

/** Management → People: everyone who makes visits, and what they did in the period. `loc` (Management's
 *  filter bar) narrows it to visits in that place; `preset` ({ sort }) comes from "Needs your attention". */
export function PeopleDirectory({ employees, trips, records, period, loc, preset, onOpenPerson, onOpenVisit, onOpenBranchByName }) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState("all");
  const [dept, setDept] = useState("All");
  const [sort, setSort] = useState(preset?.sort || "most");
  const [open, setOpen] = useState(null);
  const meta = periodMeta(period);
  const range = useMemo(() => periodRange(period), [period]);

  // in a chosen place: only the visits (and people) that went there
  const placeOn = !!loc && Object.values(loc).some((v) => v !== "All");
  const here = useMemo(() => {
    if (!placeOn) return { trips, records };
    const recs = records.filter((x) => matchesLocation(x, loc));
    const ids = new Set(recs.map((x) => x.tripId));
    return { trips: trips.filter((v) => ids.has(v.id)), records: recs };
  }, [placeOn, loc, trips, records]);

  const rows = useMemo(
    () => peopleList(employees, trips).map((p) => ({ ...p, s: personStats(p, here.trips, here.records, range) })).filter((p) => !placeOn || p.s.trips > 0),
    [employees, trips, here, range, placeOn]
  );
  const departments = [...new Set(rows.map((p) => p.department).filter(Boolean))].sort();
  const q = query.trim().toLowerCase();
  const list = rows
    .filter((p) => role === "all" || roleList(p).includes(role))
    .filter((p) => dept === "All" || p.department === dept)
    .filter((p) => !q || [p.name, p.pin, p.designation, p.department, p.email, p.phone].some((x) => String(x || "").toLowerCase().includes(q)))
    .sort(SORTS[sort].fn);
  const openPerson = open ? rows.find((p) => p.id === open) : null;
  const roleCount = (k) => (k === "all" ? rows.length : rows.filter((p) => roleList(p).includes(k)).length);

  const exportCsv = () => downloadCsv(`people-${period}.csv`, [
    { label: "Name", key: "name" }, { label: "Designation", key: "designation" }, { label: "Department", key: "department" },
    { label: "PIN", key: "pin" }, { label: "Email", key: "email" }, { label: "Phone", key: "phone" },
    { label: "User type", get: (p) => roleList(p).map((x) => ROLE_LABELS[x] || x).join(" / ") },
    { label: `Visits (${meta.label})`, get: (p) => p.s.trips }, { label: "Marked done", get: (p) => p.s.done },
    { label: "Offices", get: (p) => p.s.offices }, { label: "Entries submitted", get: (p) => p.s.entryCount },
    { label: "Issues filed", get: (p) => p.s.complaints }, { label: "Drafts not submitted", get: (p) => p.s.drafts },
    { label: "Avg rating", get: (p) => (p.s.avgRating == null ? "" : p.s.avgRating.toFixed(2)) },
    { label: "Info completeness %", get: (p) => (p.s.quality == null ? "" : Math.round(p.s.quality * 100)) },
    { label: "Last visit", get: (p) => p.s.lastDate || "" },
  ], list);

  return (
    <div className="card card-pad">
      <div className="section-header">
        <div>
          <p className="analytics-card-title" style={{ marginBottom: 2 }}>Everyone</p>
          <p className="analytics-card-sub" style={{ margin: 0 }}>{list.length} of {rows.length} · numbers are for {meta.label.toLowerCase()}{placeOn ? ", visits in the chosen place only" : ""}. Select a person for where they went and what they recorded.</p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={exportCsv}><Download size={14} /> Export CSV</button>
      </div>

      {/* one row: search, user type, department, sort */}
      <div className="mg-tools">
        <div className="search-box">
          <Search size={16} />
          <input className="input" placeholder="Search a name, PIN, designation or email" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <select className="select" aria-label="User type" value={role} onChange={(e) => setRole(e.target.value)}>
          {[["all", "Everyone"], ["field", "Base users"], ["fixer", "Resolvers"], ["management", "Management"]].map(([k, label]) => <option key={k} value={k}>{label} ({roleCount(k)})</option>)}
        </select>
        {departments.length > 0 && (
          <select className="select" aria-label="Department" value={dept} onChange={(e) => setDept(e.target.value)}>
            <option value="All">All departments</option>
            {departments.map((d) => <option key={d} value={d}>{d}</option>)}
          </select>
        )}
        <select className="select" aria-label="Sort" value={sort} onChange={(e) => setSort(e.target.value)}>
          {Object.entries(SORTS).map(([k, s]) => <option key={k} value={k}>{s.label}</option>)}
        </select>
      </div>

      <div className="ctable-wrap">
        <table className="ctable stack">
          <thead><tr><th>Person</th><th>PIN</th><th>Visits</th><th>Offices</th><th>Entries</th><th>Issues</th><th>Completeness</th><th>Rating</th><th>Last visit</th><th /></tr></thead>
          <tbody>
            {list.map((p) => (
              <tr key={p.id} className={`row-link ${open === p.id ? "sel" : ""}`} onClick={() => setOpen(p.id)}>
                <td data-label="Person">
                  <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                    <span className="avatar sm">{initials(p.name)}</span>
                    <div style={{ textAlign: "left" }}>
                      <div className="cell-main">{p.name}{p.former && <span className="pill pill-never" style={{ marginLeft: 6 }}>Former</span>}</div>
                      <div className="cell-sub">{[p.designation, p.department].filter(Boolean).join(" · ") || roleList(p).map((x) => ROLE_LABELS[x] || x).join(" · ")}</div>
                    </div>
                  </div>
                </td>
                <td data-label="PIN" className="mono">{p.pin || "—"}</td>
                <td data-label="Visits"><b>{p.s.trips}</b>{p.s.notDone > 0 && <span className="pill pill-stale" style={{ marginLeft: 6 }} title="Back from the visit but not marked as done">{p.s.notDone} not done</span>}
                  {p.s.upcoming > 0 && <span className="pill pill-brand" style={{ marginLeft: 6 }} title="Registered for a date after today">{p.s.upcoming} upcoming</span>}</td>
                <td data-label="Offices">{p.s.offices}</td>
                <td data-label="Entries">{p.s.entryCount}{p.s.drafts > 0 && <span className="cell-sub" style={{ display: "inline", marginLeft: 6 }}>+{p.s.drafts} drafts</span>}</td>
                <td data-label="Issues">{p.s.complaints ? <>{p.s.complaints} <span className="cell-sub" style={{ display: "inline" }}>· {p.s.resolved} resolved</span></> : <span style={{ color: "var(--ink-faint)" }}>0</span>}</td>
                <td data-label="Completeness">{pctText(p.s.quality)}</td>
                <td data-label="Rating">{p.s.avgRating == null ? "—" : `${p.s.avgRating.toFixed(1)}★`}</td>
                <td data-label="Last visit">{sinceText(p.s.lastDate)}</td>
                <td data-label="" style={{ textAlign: "right" }}><ChevronRight size={15} color="var(--ink-faint)" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {list.length === 0 && <div className="viz-empty">No one matches.</div>}

      {openPerson && (
        <SidePanel title={openPerson.name} onClose={() => setOpen(null)}
          sub={[openPerson.designation, openPerson.department, openPerson.pin && `PIN ${openPerson.pin}`].filter(Boolean).join(" · ") || roleList(openPerson).map((x) => ROLE_LABELS[x] || x).join(" · ")}
          actions={<button className="btn btn-secondary btn-sm" onClick={() => onOpenPerson(openPerson.id)}><ExternalLink size={13} /> Full profile</button>}>
          <PersonGlance p={openPerson} records={here.records} trips={here.trips} range={range} onOpenVisit={onOpenVisit} onOpenBranchByName={onOpenBranchByName} />
        </SidePanel>
      )}
    </div>
  );
}

/** One person's profile: who they are, what they did, where they went, and everything they recorded. */
export function PersonProfile({ person, employees, departments, trips, records, period, onBack, onOpenVisit, onOpenBranchByName }) {
  const [type, setType] = useState("all");
  const [entry, setEntry] = useState(null);
  const [showAllEntries, setShowAllEntries] = useState(false);
  const [showAllVisits, setShowAllVisits] = useState(false);
  const meta = periodMeta(period);
  const r = useMemo(() => periodRange(period), [period]);

  const s = useMemo(() => personStats(person, trips, records, r), [person, trips, records, r]);
  const places = useMemo(() => placesOf(person, records, r), [person, records, r]);
  const entries = useMemo(() => entriesBy(person, trips, r), [person, trips, r]);
  const visits = useMemo(
    () => trips.filter((v) => v.employeeId === person.id && (v.date ? inPeriod(v.date, r) : period === "all")).sort((a, b) => (b.date || "").localeCompare(a.date || "")),
    [trips, person.id, r, period]
  );
  const months = useMemo(() => monthBuckets(6), []);

  const unit = departments.find((d) => d.id === person.departmentId)?.name;
  const supervisor = employees.find((e) => e.id === person.supervisorId)?.name;
  const shownEntries = (type === "all" ? entries : entries.filter((e) => e.type === type));
  const typeCount = (t) => (t === "all" ? entries.length : entries.filter((e) => e.type === t).length);

  return (
    <div>
      <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12, paddingLeft: 8 }} onClick={onBack}><ArrowLeft size={15} /> People</button>

      <div className="card card-pad person-hero">
        <div className="avatar lg">{initials(person.name)}</div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <h2 className="ph-name">{person.name}{person.former && <span className="pill pill-never" style={{ marginLeft: 8, verticalAlign: "middle" }}>No longer on the employee list</span>}</h2>
          <div className="ph-role">{[person.designation, person.department].filter(Boolean).join(" · ") || <span style={{ color: "var(--ink-faint)" }}>Designation and department not on file yet</span>}</div>
          <div className="ph-meta">
            <span><Contact size={13} /> PIN <b className="mono">{person.pin || "—"}</b></span>
            {person.email && <a href={`mailto:${person.email}`}><Mail size={13} /> {person.email}</a>}
            {person.phone && <a href={`tel:${person.phone}`}><Phone size={13} /> {person.phone}</a>}
            {unit && <span><Users size={13} /> Unit: {unit}</span>}
            {supervisor && <span>Supervisor: {supervisor}</span>}
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
            {roleList(person).map((x) => <span key={x} className="tag-badge">{ROLE_LABELS[x] || x}</span>)}
            <span className="tag-badge">Last visit: {sinceText(s.lastDate)}</span>
          </div>
        </div>
      </div>

      <div className="kpi-grid" style={{ margin: "16px 0" }}>
        <Reveal i={0}><Kpi icon={MapPin} label={`Visits · ${meta.label.toLowerCase()}`} value={s.trips} spark={s.spark} sparkColor="var(--brand)"
          foot={<span className={`pill ${s.notDone ? "pill-stale" : "pill-ok"}`}>{s.done} done{s.notDone ? ` · ${s.notDone} not marked` : ""}</span>} /></Reveal>
        <Reveal i={1}><Kpi icon={Building2} tone="blue" label="Offices visited" value={s.offices} /></Reveal>
        <Reveal i={2}><Kpi icon={PenLine} tone="green" label="Entries submitted" value={s.entryCount} foot={s.drafts ? <span className="pill pill-stale">{plural(s.drafts, "draft")} unsent</span> : null} /></Reveal>
        <Reveal i={3}><Kpi icon={MessageCircle} tone="red" label="Issues filed" value={s.complaints} foot={s.complaints ? <span className="pill pill-brand">{s.resolved} resolved</span> : null} /></Reveal>
        <Reveal i={4}><Kpi icon={Star} tone="amber" label="Avg client rating" value={s.avgRating == null ? "—" : Number(s.avgRating.toFixed(1))} decimals={1} suffix={s.avgRating == null ? "" : "★"} /></Reveal>
        <Reveal i={5}><Kpi icon={ShieldCheck} tone="green" label="Info completeness" value={s.quality == null ? "—" : Math.round(s.quality * 100)} suffix={s.quality == null ? "" : "%"} /></Reveal>
      </div>

      <div className="bp-grid">
        <Reveal className="card card-pad" i={1} style={{ minWidth: 0 }}>
          <p className="analytics-card-title">Visits</p>
          <p className="analytics-card-sub">{plural(visits.length, "visit")} · {meta.label.toLowerCase()}, newest first. Open one to see everything on it (read-only).</p>
          {visits.length === 0 ? <div className="viz-empty">No visits in this period.</div> : (
            <div className="visit-grid" style={{ gridTemplateColumns: "1fr" }}>
              {(showAllVisits ? visits : visits.slice(0, 6)).map((v) => <VisitCard key={v.id} visit={v} onOpen={() => onOpenVisit(v.id)} />)}
            </div>
          )}
          {visits.length > 6 && (
            <div style={{ textAlign: "center", marginTop: 12 }}>
              <button className="btn btn-secondary btn-sm" onClick={() => setShowAllVisits((x) => !x)}>{showAllVisits ? "Show fewer" : `Show all ${visits.length}`}</button>
            </div>
          )}
        </Reveal>

        <div style={{ display: "flex", flexDirection: "column", gap: 16, minWidth: 0 }}>
          <Reveal className="card card-pad" i={2}>
            <p className="analytics-card-title">Where they went</p>
            <p className="analytics-card-sub">{plural(places.length, "office")} · {meta.label.toLowerCase()}, most visited first.</p>
            {places.length === 0 ? <div className="viz-empty">Nowhere in this period.</div> : places.map((p) => (
              <button key={p.key} type="button" className="attn-row" onClick={p.kind === "branch" ? () => onOpenBranchByName(p.name) : undefined} style={p.kind === "branch" ? undefined : { cursor: "default" }}>
                <span className="attn-main">
                  <div className="attn-name">{p.name} <span className="tag-badge" style={{ marginLeft: 4 }}>{KIND_LABEL[p.kind]}</span></div>
                  <div className="attn-sub">{p.where || "—"} · last {p.last} · {p.entries.complaints}C · {p.entries.interactions}I · {p.entries.observations}O · {p.entries.stories}S</div>
                </span>
                <b style={{ fontSize: 15 }}>{p.count}×</b>
              </button>
            ))}
          </Reveal>
          <Reveal className="card card-pad" i={3}>
            <p className="analytics-card-title">Visits per month</p>
            <p className="analytics-card-sub">Last 6 months.</p>
            <TrendLineChart labels={months.map((m) => m.label)} series={[{ key: "v", label: "Visits", color: "var(--brand)", values: s.spark }]} height={160} showLegend={false} />
          </Reveal>
        </div>
      </div>

      <Reveal className="card card-pad" i={1} style={{ marginTop: 16 }}>
        <p className="analytics-card-title">Everything they recorded</p>
        <p className="analytics-card-sub">Submitted entries · {meta.label.toLowerCase()}, newest first. Select an entry to view it in full.</p>
        <div className="toolbar">
          <div className="filter-chips">
            {["all", ...ENTRY_ORDER].map((t) => (
              <button key={t} className={`filter-chip ${type === t ? "active" : ""}`} onClick={() => setType(t)}>
                {t === "all" ? "All" : ENTRY_TYPES[t].plural} <span className="fc-count">{typeCount(t)}</span>
              </button>
            ))}
          </div>
        </div>
        {shownEntries.length === 0 ? <div className="viz-empty">Nothing recorded in this period.</div> : (
          <div className="entry-panel" style={{ padding: 0 }}>
            {(showAllEntries ? shownEntries : shownEntries.slice(0, 20)).map((e) => (
              <div key={`${e.visit.id}-${e.id}`}>
                <div className="entry-context">{ENTRY_TYPES[e.type].label} · visit of {e.visit.date || "no date"}</div>
                <EntryRow e={e} onOpen={() => setEntry(e)} />
              </div>
            ))}
          </div>
        )}
        {shownEntries.length > 20 && (
          <div style={{ textAlign: "center", marginTop: 12 }}>
            <button className="btn btn-secondary btn-sm" onClick={() => setShowAllEntries((x) => !x)}>{showAllEntries ? "Show fewer" : `Show all ${shownEntries.length}`}</button>
          </div>
        )}
      </Reveal>

      {entry && <EntryView type={entry.type} entry={entry} visit={entry.visit} onClose={() => setEntry(null)} />}
    </div>
  );
}
