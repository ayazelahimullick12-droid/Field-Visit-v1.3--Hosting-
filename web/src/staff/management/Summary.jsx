import React, { useLayoutEffect, useMemo, useRef, useState } from "react";
import {
  Route, Wrench, Eye, RotateCcw, MapPin, CalendarClock, Building2, ClipboardList, CheckCircle2,
  Users, Image as ImageIcon, ArrowUpRight, ArrowDownRight, Minus,
} from "lucide-react";
import { LocationFilterBar, EMPTY_LOCATION_FILTER, matchesLocation } from "../analytics/common";
import { computeCoverage, average, DAY_MS, inPlace, placeValues } from "../../lib/offices";
import { submittedComplaints, entriesOf, entryPlaces, isDraft, plural, reasonText, phaseOf, placeOfStop } from "../../lib/visits";
import { statusOf, isFixed, isAssigned } from "../../lib/complaints";
import { PERIODS, periodRange } from "./periods";
import { daysToResolve } from "./data";
import { TipBar } from "./ui";
import { CountUp } from "../../lib/ui";

/* Management → Summary (and the public summary page): one page, in plain words.
   Every tile says what it counts, gives the number "out of" something where it can, and has one
   sentence that explains it to someone who has never seen the app.

   How it's built:
     figures()   works out every number from the visits, offices and settings (no drawing here)
     Summary     the page: filters, then one panel per section
     VisitsPanel, FindingsPanel   one card per section
     MiniBar                     a labelled bar with its legend, used inside the cards
   To add a figure: work it out in figures(), then show it in the section's panel. */

// On screen, statuses use everyday words (the stored values stay the same).
export const STATUS_WORDS = [
  ["Waiting", "Waiting for a department", "var(--ink-faint)"],
  ["Assigned", "Given to a department", "var(--info)"],
  ["In Progress", "Being worked on", "var(--warning)"],
  ["Long Term", "Long-term work", "var(--magenta)"],
  ["Fixed", "Resolved", "var(--success)"],
];
const URGENCIES = [["High", "var(--danger)"], ["Medium", "var(--warning)"], ["Low", "var(--line)"]];
const REASON_COLORS = ["var(--series-1)", "var(--series-2)", "var(--series-3)", "var(--series-4)", "var(--series-5)"];

const DEFAULT_FILTERS = { period: "30d", from: "", to: "", loc: EMPTY_LOCATION_FILTER };
const filedOn = (c) => c.submittedAt || c.filedDate || c.visitDate;
const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const one = (n) => (n == null ? "—" : Number(n.toFixed(1)).toString());
const inRange = (d, from, to) => {
  if (!from && !to) return true;
  if (!d) return false;
  const x = new Date(`${String(d).slice(0, 10)}T00:00`);
  return (!from || x >= from) && (!to || x < to);
};
function rangeOf(f) {
  if (f.period !== "custom") return periodRange(f.period);
  if (!f.from || !f.to || f.to < f.from) return periodRange("all");
  const from = new Date(`${f.from}T00:00`), to = new Date(new Date(`${f.to}T00:00`).getTime() + DAY_MS);
  return { from, to, prevFrom: new Date(from.getTime() - (to - from)), prevTo: from };
}
function periodWords(f) {
  if (f.period === "custom") return f.from && f.to ? { now: `${f.from} to ${f.to}`, prev: "the same length of time before" } : { now: "All time", prev: null };
  const p = PERIODS.find((x) => x.key === f.period) || PERIODS[0];
  return { now: p.label, prev: p.prevLabel ? `the ${p.prevLabel}` : null };
}
function countBy(list, keyFn) {
  const m = new Map();
  list.forEach((x) => { const k = keyFn(x); [].concat(k).forEach((one) => m.set(one, (m.get(one) || 0) + 1)); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
/** Every office a visit planned or recorded something at (its places, for "is this visit here?"). */
const visitPlaces = (v) => [
  ...(v.stops || []).filter((st) => !st.skipped).map((st) => placeOfStop(st, v)),
  ...entriesOf(v).filter((e) => !isDraft(e)).flatMap(entryPlaces),
];
const ANYWHERE = { division: "All", region: "All", area: "All" };
const officeOf = (e) => entryPlaces(e)[0]?.office || "";
/** "less than a day", "1 day", "3.5 days" */
const daysText = (d) => (d < 1 ? "less than a day" : d < 1.05 ? "1 day" : `${one(d)} days`);

/* ------------------------------------ the numbers ------------------------------------ */

export function figures({ trips, records, offices, settings, f, employees = [], departments = [] }) {
  const r = rangeOf(f);
  const loc = f.loc;
  const target = settings?.visitTargetDays || 90;

  // --- visits in the chosen place ---
  // a visit is "here" if any of its offices is (a branch counts in every area it is listed in)
  const visitInPlace = (v) => {
    const places = visitPlaces(v);
    if (!(places.length ? places.some((p) => inPlace(p, loc)) : inPlace(v, loc))) return false;
    if (loc.branch !== "All" && !(v.stops || []).some((s) => s.name === loc.branch)
      && !entriesOf(v).some((e) => entryPlaces(e).some((p) => p.office === loc.branch || p.branch === loc.branch))) return false;
    return true;
  };
  const visitsHere = trips.filter((v) => v.date && visitInPlace(v));
  const visits = visitsHere.filter((v) => inRange(v.date, r.from, r.to));
  const visitsPrev = r.prevFrom ? visitsHere.filter((v) => inRange(v.date, r.prevFrom, r.prevTo)) : null;
  const visitsBefore = visitsPrev ? visitsPrev.length : null;
  // one record per office of each visit (see expandVisits in lib/visits.js)
  const recordsHere = records.filter((x) => x.date && matchesLocation(x, loc));
  const recordsNow = recordsHere.filter((x) => inRange(x.date, r.from, r.to));

  // --- branches visited in the period ---
  const branches = offices.filter((o) => o.active !== false && matchesLocation({ ...o, region: o.district, location: o.name }, loc));
  const visitedInPeriod = computeCoverage(branches, recordsNow, target).filter((b) => b.visitCount > 0).length;

  // --- upcoming: registered for a date after today (not limited by the time filter) ---
  const upcoming = visitsHere.filter((v) => phaseOf(v) === "upcoming");
  const weekAhead = new Date(Date.now() + 7 * DAY_MS);

  // --- who made the visits: by the visitor's unit, then their team inside it ---
  const empById = new Map(employees.map((e) => [e.id, e]));
  const byUnit = new Map();
  visits.forEach((v) => {
    const e = empById.get(v.employeeId) || {};
    const unit = departments.find((d) => d.id === e.departmentId);
    const unitName = unit?.name || "No unit";
    const teamName = (unit?.units || []).find((t) => t.id === e.teamId)?.name || "Team not set";
    const row = byUnit.get(unitName) || { unit: unitName, visits: 0, staff: new Set(), teams: new Map() };
    row.visits++;
    row.staff.add(v.employeeId);
    row.teams.set(teamName, (row.teams.get(teamName) || 0) + 1);
    byUnit.set(unitName, row);
  });

  // --- why, and when in the day ---
  const reasons = countBy(visits, (v) => reasonText(v) || "Not given");
  const shownReasons = reasons.slice(0, 4);
  // visits per division: a visit counts once in each division its offices are in
  const divisions = countBy(visits, (v) => {
    const ds = [...new Set(visitPlaces(v).flatMap((p) => placeValues(p, "division", ANYWHERE)))];
    return ds.length ? ds : [v.division || "Not set"];
  });
  const otherReasons = reasons.slice(4).reduce((s, [, n]) => s + n, 0);
  // --- problems (issues) raised in the period; their status is as of today ---
  const items = submittedComplaints(trips).filter((c) => matchesLocation(c, loc));
  const raised = items.filter((c) => inRange(filedOn(c), r.from, r.to));
  const raisedBefore = r.prevFrom ? items.filter((c) => inRange(filedOn(c), r.prevFrom, r.prevTo)).length : null;
  const fixed = raised.filter(isFixed);
  const open = raised.filter((c) => !isFixed(c));
  const daysToFix = (list) => average(list.map(daysToResolve).filter((d) => d != null));
  const units = countBy(raised.filter(isAssigned), (c) => c.department || "No unit").map(([unit]) => {
    const list = raised.filter((c) => isAssigned(c) && (c.department || "No unit") === unit);
    return { unit, given: list.length, fixed: list.filter(isFixed).length, days: daysToFix(list.filter(isFixed)) };
  });

  // --- clients reached, observations and stories ---
  const submitted = (type, list = visits) => list.flatMap((v) => entriesOf(v, type).filter((e) => !isDraft(e)));
  const talks = submitted("interaction");
  const observations = submitted("observation");
  const stories = submitted("story");

  return {
    target,
    visits: visits.length, visitsBefore,
    staff: new Set(visits.map((v) => v.employeeId)).size,
    officesReached: new Set(recordsNow.map((x) => x.location)).size,
    branches: branches.length, visitedInPeriod,
    upcoming: upcoming.length,
    upcomingThisWeek: upcoming.filter((v) => new Date(`${v.date}T00:00`) <= weekAhead).length,
    // real units first (most visits first), "No unit" last
    visitsByUnit: [...byUnit.values()].sort((a, b) => (a.unit === "No unit") - (b.unit === "No unit") || b.visits - a.visits).map((r) => ({
      unit: r.unit, visits: r.visits, staff: r.staff.size,
      // named teams first (largest first), "Team not set" last
      teams: [...r.teams.entries()].sort((a, b) => (a[0] === "Team not set") - (b[0] === "Team not set") || b[1] - a[1]),
    })),
    upcomingOffices: new Set(upcoming.flatMap((v) => (v.stops || []).map((x) => x.name))).size,
    divisions,
    reasons: [...shownReasons, ...(otherReasons ? [["Other purposes", otherReasons]] : [])],

    raised: raised.length, raisedBefore, fixed: fixed.length, open: open.length,
    daysToFix: daysToFix(fixed),
    waiting: raised.filter((c) => statusOf(c) === "Waiting").length,
    highOpen: open.filter((c) => c.urgency === "High").length,
    byUrgency: URGENCIES.map(([u, color]) => ({ label: u, color, value: raised.filter((c) => c.urgency === u).length })),
    byStatus: STATUS_WORDS.map(([key, label, color]) => ({ label, color, value: raised.filter((c) => statusOf(c) === key).length })),
    units,

    talks: talks.length,
    talkBranches: new Set(talks.map(officeOf).filter(Boolean)).size,
    observations: observations.length,
    observationsBefore: visitsPrev ? submitted("observation", visitsPrev).length : null,
    observationOffices: new Set(observations.map(officeOf).filter(Boolean)).size,
    referred: observations.filter((o) => o.fromStaff).length,
    stories: stories.length,
    likes: stories.reduce((s, x) => s + (x.likes || 0), 0),
    // the public page only gets a count of comments (commentCount), never the comments themselves
    comments: stories.reduce((s, x) => s + (Array.isArray(x.comments) ? x.comments.length : x.commentCount || 0), 0),
    shares: stories.reduce((s, x) => s + (x.shares || 0), 0),
  };
}

/* ------------------------------------ the page ------------------------------------ */

// Each section has its own colour (the icon chip, the tile icons and the progress bars).
const TONES = { visits: "var(--success)", issues: "var(--danger)", stories: "var(--brand)" };

/** `filters` ({ period, loc }): set by Management's shared filter bar, which then replaces the Summary's own.
 *  `onGo` (Management only): the tiles and bars open the tab with the details (see goProps). */
export default function Summary({ trips, records, offices = [], employees = [], departments = [], settings, period = "30d", publicView = false, filters = null, onGo }) {
  const [own, setF] = useState({ ...DEFAULT_FILTERS, period });
  const f = filters ? { ...DEFAULT_FILTERS, ...filters } : own;
  const F = useMemo(() => figures({ trips, records, offices, settings, f, employees, departments }), [trips, records, offices, settings, f, employees, departments]);
  const words = periodWords(f);
  const filtered = f.period !== DEFAULT_FILTERS.period || Object.values(f.loc).some((v) => v !== "All");

  return (
    <div className="s1">
      {!publicView && !filters && (
        <div className="card card-pad s1-filters">
          <div className="mf-field">
            <span className="mf-label">Time</span>
            <select className="select" aria-label="Time period" value={f.period} onChange={(e) => setF({ ...f, period: e.target.value })}>
              {PERIODS.map((p) => <option key={p.key} value={p.key}>{p.label}</option>)}
              <option value="custom">Choose dates</option>
            </select>
          </div>
          {f.period === "custom" && (
            <>
              <div className="mf-field"><span className="mf-label">From</span><input type="date" className="input" value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} /></div>
              <div className="mf-field"><span className="mf-label">To</span><input type="date" className="input" value={f.to} min={f.from || undefined} onChange={(e) => setF({ ...f, to: e.target.value })} /></div>
            </>
          )}
          <LocationFilterBar offices={offices} value={f.loc} onChange={(loc) => setF({ ...f, loc })} labelled />
          {filtered && <button className="mf-clear" onClick={() => setF({ ...DEFAULT_FILTERS, period })}><RotateCcw size={12} /> Reset</button>}
        </div>
      )}

      <Section icon={Route} tone={TONES.visits} title="Field visits">
        <VisitsPanel F={F} words={words} onGo={onGo} />
      </Section>

      <Section icon={Wrench} tone={TONES.issues} title="Issues, observations and stories">
        <FindingsPanel F={F} words={words} publicView={publicView} onGo={onGo} />
      </Section>
    </div>
  );
}

/* ------------------------------------ the tiles ------------------------------------ */

/** "17 more than the previous 30 days" as a coloured pill. downIsGood: fewer is the better news. */
function trend(now, before, prevWords, downIsGood = false) {
  if (before == null || !prevWords) return null;
  const d = now - before;
  if (d === 0) return { text: `Same as ${prevWords}`, mood: "flat" };
  return { text: `${Math.abs(d)} ${d > 0 ? "more" : "fewer"} than ${prevWords}`, up: d > 0, mood: (d > 0) !== downIsGood ? "good" : "bad" };
}

function Section({ icon: Icon, tone, title, sub, children }) {
  return (
    <section className="s1-section" style={{ "--tone": tone }}>
      <h2 className="s1-h"><span className="s1-chip"><Icon size={16} /></span>{title}</h2>
      {sub && <p className="s1-sub">{sub}</p>}
      {children}
    </section>
  );
}

/**
 * Field visits in one card: visits made (with the change from the period before) on the left,
 * branches visited and upcoming visits on the right, and the purpose of visit along the bottom.
 */
function VisitsPanel({ F, words, onGo }) {
  const ch = trend(F.visits, F.visitsBefore, words.prev);
  const purposes = F.reasons.map(([label, value], i) => ({ label, value, color: REASON_COLORS[i % REASON_COLORS.length] }));
  // visits by the visitor's unit; named teams listed underneath ("Team not set" left out)
  const units = F.visitsByUnit.map((r, i) => ({ label: r.unit, value: r.visits, color: r.unit === "No unit" ? "var(--line)" : REASON_COLORS[i % REASON_COLORS.length] }));
  const teams = F.visitsByUnit.flatMap((r) => r.teams.filter(([t]) => t !== "Team not set").map(([t, n]) => `${t} (${r.unit}) ${n}`));
  return (
    <div className="card s1-tile s1-panel" style={{ "--tone": TONES.visits }}>
      <div className="s1-panel-top">
        <div className="s1-panel-main" {...goProps(onGo, { tab: "people", preset: { sort: "most" } }, "See who made them")}>
          <div className="s1-top"><p className="s1-label">Visits made · {words.now.toLowerCase()}</p><MapPin size={17} className="s1-icon" /></div>
          <p className="s1-num s1-big"><CountUp value={F.visits} /></p>
          {ch && (
            <span className={`s1-trend ${ch.mood}`}>
              {ch.mood === "flat" ? <Minus size={12} /> : ch.up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />} {ch.text}
            </span>
          )}
          <p className="s1-note">Trips staff registered to field offices, by {plural(F.staff, "staff member")}, to {plural(F.officesReached, "office")}.</p>
        </div>
        <div className="s1-panel-side">
          <div className="s1-mini" {...goProps(onGo, { tab: "offices", preset: { kind: "branch" } }, "See every branch")}>
            <div className="s1-top"><span className="s1-label">Branches visited</span><Building2 size={15} className="s1-icon" /></div>
            <p className="s1-num"><CountUp value={F.visitedInPeriod} /><span className="s1-of"> of {F.branches}</span></p>
            <div className="s1-progress"><span style={{ width: `${F.branches ? Math.round((F.visitedInPeriod / F.branches) * 100) : 0}%` }} /></div>
            <p className="s1-note">{pct(F.visitedInPeriod, F.branches)}% of branches had at least one visit.</p>
          </div>
          <div className="s1-mini" {...goProps(onGo, { tab: "people", preset: { sort: "upcoming" } }, "See who is going")}>
            <div className="s1-top"><span className="s1-label">Upcoming visits</span><CalendarClock size={15} className="s1-icon" /></div>
            <p className="s1-num"><CountUp value={F.upcoming} /><span className="s1-of"> planned</span></p>
            <p className="s1-note">
              {F.upcoming
                ? `Registered for after today${F.upcomingOffices ? `, to ${plural(F.upcomingOffices, "office")}` : ""}. ${F.upcomingThisWeek} in the next 7 days.`
                : "No visits are registered for a date after today."}
            </p>
          </div>
        </div>
      </div>
      <div className="s1-panel-bottom">
        <MiniBar label="Purpose of visit" parts={purposes} />
        <MiniBar label="Visits by unit" parts={units} foot={teams.length ? `Teams: ${teams.join(" · ")}` : null} clampFoot />
        <MiniBar label="Visits by division" parts={F.divisions.map(([label, value], i) => ({ label, value, color: REASON_COLORS[i % REASON_COLORS.length] }))} clampLegend
          onPick={onGo && ((division) => division !== "Not set" && onGo({ loc: { division, region: "All", area: "All", branch: "All" } }))} />
      </div>
    </div>
  );
}

/**
 * Two lines of something long; on hover (or tap / keyboard focus) the rest unfolds over the page in a
 * floating card, the hidden part fading in one by one. A "+N more" tag says how much is hidden.
 * `items`: the children are separate items (a legend) and are counted; otherwise it is one text.
 */
function Unfold({ className, items = false, children }) {
  const wrap = useRef(null);
  const inner = useRef(null);
  const [hidden, setHidden] = useState(0);
  useLayoutEffect(() => {
    const measure = () => {
      const el = inner.current;
      if (!el) return;
      const limit = wrap.current.clientHeight;
      if (!items) { setHidden(el.scrollHeight > el.clientHeight + 2 ? -1 : 0); return; }
      let n = 0;
      [...el.children].forEach((k) => {
        const tail = k.offsetTop + k.offsetHeight > limit + 10; // the inner box starts 8px above the wrapper
        k.dataset.tail = tail ? "1" : "";
        if (tail) k.style.setProperty("--i", n++);
      });
      setHidden(n);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(wrap.current);
    return () => ro.disconnect();
  }, [items, children]);
  return (
    <div ref={wrap} className={`s1-unfold${items ? "" : " text"}${hidden ? " has-more" : ""}`}>
      <div ref={inner} className={`s1-unfold-in ${className}`} tabIndex={hidden ? 0 : undefined}>{children}</div>
      {hidden !== 0 && <span className="s1-unfold-more" aria-hidden="true">{hidden > 0 ? `+${hidden} more` : "more"}</span>}
    </div>
  );
}

/** A labelled bar split into parts, with a legend. clampLegend / clampFoot: show two lines of a long
 *  legend / note and unfold the rest on hover. onPick: legend entries become links (e.g. to filter by
 *  that division); go: the whole bar opens another tab (see goProps). */
function MiniBar({ label, parts, foot, clampLegend = false, clampFoot = false, onPick, go }) {
  const total = parts.reduce((n, p) => n + p.value, 0);
  const entry = (p) => (onPick
    ? <button key={p.label} type="button" className="s1-pick" onClick={() => onPick(p.label)} title={`Show ${p.label} only`}><i style={{ background: p.color }} />{p.label} <b>{p.value}</b></button>
    : <span key={p.label}><i style={{ background: p.color }} />{p.label} <b>{p.value}</b></span>);
  return (
    <div className="s1-minibar" {...(go || {})}>
      <p className="s1-label">{label}</p>
      {total === 0 ? <p className="s1-note">No visits in this period.</p> : (
        <>
          <TipBar className="s1-bar" parts={parts} />
          {clampLegend ? <Unfold className="s1-legend" items>{parts.map(entry)}</Unfold> : <div className="s1-legend">{parts.map(entry)}</div>}
          {foot && (clampFoot ? <Unfold className="s1-note">{foot}</Unfold> : <p className="s1-note" style={{ marginTop: 4 }}>{foot}</p>)}
        </>
      )}
    </div>
  );
}

/** Props that make a tile open another Management tab: `to` is { tab, preset } or { loc }. Nothing on
 *  the public page, which has nowhere to go. */
function goProps(onGo, to, hint) {
  if (!onGo) return null;
  return {
    "data-go": hint, role: "button", tabIndex: 0, onClick: (e) => { if (!e.target.closest(".s1-unfold-in, .s1-pick")) onGo(to); },
    onKeyDown: (e) => { if (e.target === e.currentTarget && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onGo(to); } },
  };
}

// shades of the Issues colour, one per department (largest first)
const DEPT_SHADES = [85, 65, 48, 34, 24, 16].map((n) => `color-mix(in srgb, var(--danger) ${n}%, transparent)`);

/**
 * Issues, observations, clients and stories in one card: registered issues (with the change
 * from the period before) on the left; resolved, observations, clients reached and stories shared on
 * the right; where the issues stand, their urgency and which departments they went to along
 * the bottom. The department bar is left off the public page.
 */
function FindingsPanel({ F, words, publicView, onGo }) {
  const ch = trend(F.raised, F.raisedBefore, words.prev, true);
  const statuses = F.byStatus.filter((x) => x.value);
  const depts = F.units.map((u, i) => ({ label: u.unit, value: u.given, color: DEPT_SHADES[i % DEPT_SHADES.length] }));
  const reactions = [plural(F.likes, "like"), plural(F.comments, "comment"), plural(F.shares, "share")].join(" · ");
  return (
    <div className="card s1-tile s1-panel" style={{ "--tone": TONES.issues }}>
      <div className="s1-panel-top">
        <div className="s1-panel-main" {...goProps(onGo, { tab: "departments" }, "See every department")}>
          <div className="s1-top"><p className="s1-label">Issues encountered · {words.now.toLowerCase()}</p><ClipboardList size={17} className="s1-icon" /></div>
          <p className="s1-num s1-big"><CountUp value={F.raised} /></p>
          {ch && (
            <span className={`s1-trend ${ch.mood}`}>
              {ch.mood === "flat" ? <Minus size={12} /> : ch.up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />} {ch.text}
            </span>
          )}
          <p className="s1-note">Issues found at offices that a department needs to fix. Status as of today.</p>
        </div>
        <div className="s1-panel-side four">
          <div className="s1-mini" style={{ "--tone": "var(--success)" }} {...goProps(onGo, { tab: "departments", preset: { focus: "open" } }, "See what's still open")}>
            <div className="s1-top"><span className="s1-label">Resolved</span><CheckCircle2 size={15} className="s1-icon" /></div>
            <p className="s1-num"><CountUp value={F.fixed} /><span className="s1-of"> of {F.raised}</span></p>
            <div className="s1-progress"><span style={{ width: `${pct(F.fixed, F.raised)}%` }} /></div>
            <p className="s1-note">
              {F.raised ? `${pct(F.fixed, F.raised)}%${F.daysToFix != null ? ` · ${daysText(F.daysToFix)} on average` : ""}.` : "Nothing registered."}
              {F.highOpen ? ` ${F.highOpen} high urgency still open.` : ""}
            </p>
          </div>
          <div className="s1-mini" style={{ "--tone": TONES.stories }} {...goProps(onGo, { tab: "people", preset: { sort: "observations" } }, "See who recorded them")}>
            <div className="s1-top"><span className="s1-label">Observations</span><Eye size={15} className="s1-icon" /></div>
            <p className="s1-num"><CountUp value={F.observations} /></p>
            <p className="s1-note">Noted at {plural(F.observationOffices, "office")}.</p>
          </div>
          <div className="s1-mini" style={{ "--tone": TONES.stories }} {...goProps(onGo, { tab: "people", preset: { sort: "talks" } }, "See who talked to them")}>
            <div className="s1-top"><span className="s1-label">Clients reached</span><Users size={15} className="s1-icon" /></div>
            <p className="s1-num"><CountUp value={F.talks} /></p>
            <p className="s1-note">At {plural(F.talkBranches, "branch", "branches")}.</p>
          </div>
          <div className="s1-mini" style={{ "--tone": TONES.stories }} {...goProps(onGo, { tab: "people", preset: { sort: "stories" } }, "See who shared them")}>
            <div className="s1-top"><span className="s1-label">Stories shared</span><ImageIcon size={15} className="s1-icon" /></div>
            <p className="s1-num"><CountUp value={F.stories} /></p>
            <p className="s1-note">{reactions}.</p>
          </div>
        </div>
      </div>
      <div className="s1-panel-bottom">
        <MiniBar label="Where they stand" parts={statuses} go={goProps(onGo, { tab: "departments", preset: { focus: "open" } }, "See what's still open")} />
        <MiniBar label="Urgency" parts={F.byUrgency.filter((x) => x.value)} go={goProps(onGo, { tab: "departments", preset: { focus: "high" } }, "See high urgency")} />
        {!publicView && <MiniBar label="By department" parts={depts} foot={F.waiting ? `${F.waiting} not given to a department yet.` : null} go={goProps(onGo, { tab: "departments" }, "See every department")} />}
      </div>
    </div>
  );
}
