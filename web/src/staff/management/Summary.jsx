import React, { useMemo, useState } from "react";
import {
  Route, Wrench, Star, Eye, RotateCcw, MapPin, CalendarClock, Building2, ClipboardList, CheckCircle2, AlarmClock,
  Smile, Users, UserCheck, Image as ImageIcon, Heart, MessageCircle, Share2, ArrowUpRight, ArrowDownRight, Minus,
} from "lucide-react";
import { LocationFilterBar, EMPTY_LOCATION_FILTER, matchesLocation } from "../analytics/common";
import { computeCoverage, average, DAY_MS } from "../../lib/offices";
import { submittedComplaints, entriesOf, entryPlaces, isDraft, plural, reasonText, phaseOf } from "../../lib/visits";
import { statusOf, isFixed, isLate, isAssigned } from "../../lib/complaints";
import { PERIODS, periodRange } from "./periods";
import { daysToResolve } from "./data";

/* Management → Summary (and the public summary page): one page, in plain words.
   Every tile says what it counts, gives the number "out of" something where it can, and has one
   sentence that explains it to someone who has never seen the app.

   How it's built:
     figures()   works out every number from the visits, offices and settings (no drawing here)
     Summary     the page: filters, an opening sentence, then four sections of tiles
     Tile, SplitBar, UrgencyStatus, DepartmentChart, Rows   the kinds of tile
   To add a tile: add the number in figures(), then a <Tile …/> in the section you want. */

// On screen, statuses use everyday words (the stored values stay the same).
const STATUS_WORDS = [
  ["Waiting", "Waiting for a department", "var(--ink-faint)"],
  ["Assigned", "Given to a department", "var(--info)"],
  ["In Progress", "Being worked on", "var(--warning)"],
  ["Long Term", "Long-term work", "var(--magenta)"],
  ["Fixed", "Fixed", "var(--success)"],
];
const URGENCIES = ["High", "Medium", "Low"];
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
  list.forEach((x) => { const k = keyFn(x); m.set(k, (m.get(k) || 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
}
const officeOf = (e) => entryPlaces(e)[0]?.office || "";
/** "less than a day", "1 day", "3.5 days" */
const daysText = (d) => (d < 1 ? "less than a day" : d < 1.05 ? "1 day" : `${one(d)} days`);

/* ------------------------------------ the numbers ------------------------------------ */

export function figures({ trips, records, offices, settings, f }) {
  const r = rangeOf(f);
  const loc = f.loc;
  const target = settings?.visitTargetDays || 90;

  // --- visits in the chosen place ---
  const visitInPlace = (v) => {
    if (loc.division !== "All" && v.division !== loc.division) return false;
    if (loc.region !== "All" && v.region !== loc.region) return false;
    if (loc.area !== "All" && v.area !== loc.area) return false;
    if (loc.branch !== "All" && !(v.stops || []).some((s) => s.name === loc.branch)
      && !entriesOf(v).some((e) => entryPlaces(e).some((p) => p.office === loc.branch || p.branch === loc.branch))) return false;
    return true;
  };
  const visitsHere = trips.filter((v) => v.date && visitInPlace(v));
  const visits = visitsHere.filter((v) => inRange(v.date, r.from, r.to));
  const visitsBefore = r.prevFrom ? visitsHere.filter((v) => inRange(v.date, r.prevFrom, r.prevTo)).length : null;
  // one record per office of each visit (see expandVisits in lib/visits.js)
  const recordsHere = records.filter((x) => x.date && matchesLocation(x, loc));
  const recordsNow = recordsHere.filter((x) => inRange(x.date, r.from, r.to));

  // --- branches visited in the period ---
  const branches = offices.filter((o) => o.active !== false && matchesLocation({ division: o.division, region: o.district, area: o.area, location: o.name }, loc));
  const visitedInPeriod = computeCoverage(branches, recordsNow, target).filter((b) => b.visitCount > 0).length;

  // --- upcoming: registered for a date after today (not limited by the time filter) ---
  const upcoming = visitsHere.filter((v) => phaseOf(v) === "upcoming");
  const weekAhead = new Date(Date.now() + 7 * DAY_MS);

  // --- why, and when in the day ---
  const reasons = countBy(visits, (v) => reasonText(v) || "Not given");
  const shownReasons = reasons.slice(0, 4);
  const otherReasons = reasons.slice(4).reduce((s, [, n]) => s + n, 0);
  // --- problems (action items) raised in the period; their status is as of today ---
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

  // --- clients: star ratings from client interactions ---
  const submitted = (type) => visits.flatMap((v) => entriesOf(v, type).filter((e) => !isDraft(e)));
  const talks = submitted("interaction");
  const stars = talks.flatMap((t) => (t.ratings || []).map((x) => x.stars).filter((n) => n > 0));
  const questionText = (id, fallback) => (settings?.clientRatingQuestions || []).find((q) => q.id === id)?.text || fallback;
  const byQuestion = new Map();
  talks.forEach((t) => (t.ratings || []).filter((x) => x.stars > 0).forEach((x) => {
    const q = byQuestion.get(x.questionId) || { text: questionText(x.questionId, x.question), stars: [] };
    q.stars.push(x.stars);
    byQuestion.set(x.questionId, q);
  }));
  // a branch's rating = the average of its conversations' average stars; only branches with 5+ rated conversations
  const byBranch = new Map();
  talks.forEach((t) => {
    const s = (t.ratings || []).map((x) => x.stars).filter((n) => n > 0);
    if (!s.length || !officeOf(t)) return;
    byBranch.set(officeOf(t), [...(byBranch.get(officeOf(t)) || []), average(s)]);
  });

  // --- observations and stories ---
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
    upcomingOffices: new Set(upcoming.flatMap((v) => (v.stops || []).map((x) => x.name))).size,
    reasons: [...shownReasons, ...(otherReasons ? [["Other purposes", otherReasons]] : [])],

    raised: raised.length, raisedBefore, fixed: fixed.length, open: open.length,
    daysToFix: daysToFix(fixed),
    waiting: raised.filter((c) => statusOf(c) === "Waiting").length,
    late: raised.filter((c) => isLate(c)).length,
    byStatus: STATUS_WORDS.map(([key, label, color]) => ({ label, color, value: raised.filter((c) => statusOf(c) === key).length })),
    byUrgency: URGENCIES.map((u) => ({
      u, raised: raised.filter((c) => c.urgency === u).length, open: open.filter((c) => c.urgency === u).length, fixed: fixed.filter((c) => c.urgency === u).length,
    })),
    units,

    talks: talks.length,
    talkBranches: new Set(talks.map(officeOf).filter(Boolean)).size,
    rating: average(stars),
    happy: pct(stars.filter((n) => n >= 4).length, stars.length),
    unhappy: pct(stars.filter((n) => n <= 2).length, stars.length),
    starCount: stars.length,
    questions: [...byQuestion.values()].map((q) => ({ text: q.text, avg: average(q.stars), n: q.stars.length })),
    lowest: [...byBranch.entries()].filter(([, list]) => list.length >= 5)
      .map(([office, list]) => ({ office, avg: average(list), n: list.length })).sort((a, b) => a.avg - b.avg).slice(0, 3),

    observations: observations.length,
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
const TONES = { visits: "var(--success)", issues: "var(--danger)", clients: "var(--warning)", stories: "var(--brand)" };

export default function Summary({ trips, records, offices = [], settings, period = "30d", publicView = false }) {
  const [f, setF] = useState({ ...DEFAULT_FILTERS, period });
  const F = useMemo(() => figures({ trips, records, offices, settings, f }), [trips, records, offices, settings, f]);
  const words = periodWords(f);
  const filtered = f.period !== DEFAULT_FILTERS.period || Object.values(f.loc).some((v) => v !== "All");

  return (
    <div className="s1">
      {!publicView && (
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

      <div className="card card-pad s1-lead">
        <p className="s1-when">{words.now}{Object.values(f.loc).some((v) => v !== "All") ? ` · ${[f.loc.division, f.loc.region, f.loc.area, f.loc.branch].filter((v) => v !== "All").join(" › ")}` : " · all of Bangladesh"}</p>
        <p>
          {plural(F.staff, "staff member")} made <b>{plural(F.visits, "visit")}</b> to {plural(F.officesReached, "office")}.
          They registered <b>{plural(F.raised, "action item")}</b> ({F.fixed} already fixed)
          {F.talks ? <>, reached <b>{plural(F.talks, "client")}</b>{F.rating != null && <> who rated BRAC <b>{one(F.rating)} out of 5 stars</b></>}</> : ""}
          {F.stories ? <>, and shared <b>{plural(F.stories, "story", "stories")}</b></> : ""}.
        </p>
      </div>

      <Section icon={Route} tone={TONES.visits} title="Field visits">
        <VisitsPanel F={F} words={words} />
      </Section>

      <Section icon={Wrench} tone={TONES.issues} title="Issues found" sub="Action items registered in this period, and where each one stands today.">
        <div className="s1-grid">
          <Tile icon={ClipboardList} tone={TONES.issues} label="Registered action items" value={F.raised}
                change={trend(F.raised, F.raisedBefore, words.prev, true)}
                note="Issues found at offices during visits that a department needs to fix." />
          <Tile icon={CheckCircle2} tone="var(--success)" label="Fixed" value={F.fixed} of={`of ${F.raised}`}
                progress={F.raised ? F.fixed / F.raised : null}
                note={F.raised ? `${pct(F.fixed, F.raised)}% are fixed.${F.daysToFix != null ? ` On average a fix took ${daysText(F.daysToFix)}.` : ""}` : "Nothing was registered in this period."} />
          <Tile icon={AlarmClock} tone="var(--danger)" label="Past their deadline" value={F.late} of={`of ${F.open} still open`}
                progress={F.open ? F.late / F.open : null}
                note="Given to a department, not fixed yet, and the deadline has passed." />
        </div>
        <div className="s1-grid s1-wide">
          <SplitBar label="Where every action item stands" note="Each action item registered in this period, by its status today." parts={F.byStatus} />
          <UrgencyStatus rows={F.byUrgency} />
        </div>
        {!publicView && (
          <div className="s1-grid s1-wide">
            <DepartmentChart rows={F.units} />
          </div>
        )}
      </Section>

      <Section icon={Star} tone={TONES.clients} title="Client feedback" sub="From client interactions: staff ask members to rate BRAC from 1 to 5 stars on the admin's questions.">
        <div className="s1-grid">
          <Tile icon={Star} tone={TONES.clients} label="Client rating" value={one(F.rating)} of={F.rating == null ? "" : "out of 5 stars"}
                extra={F.rating != null && <Stars value={F.rating} />}
                note={F.rating == null ? "No star ratings in this period." : `The average of all ${plural(F.starCount, "star rating")} clients gave.`} />
          <Tile icon={Smile} tone={TONES.clients} label="Happy clients" value={F.starCount ? `${F.happy}%` : "—"} of={F.starCount ? "gave 4 or 5 stars" : ""}
                progress={F.starCount ? F.happy / 100 : null}
                note={F.starCount ? `${F.unhappy}% gave 1 or 2 stars (unhappy). The rest were in between.` : "No star ratings in this period."} />
          <Tile icon={Users} tone={TONES.clients} label="Clients reached" value={F.talks}
                note={`Conversations with BRAC members at ${plural(F.talkBranches, "branch", "branches")}.`} />
        </div>
        <div className="s1-grid s1-wide">
          <Rows label="Rating for each question (out of 5 stars)" empty="No star ratings in this period."
                rows={F.questions.map((q) => [q.text, <><b>{one(q.avg)}</b> / 5 · {plural(q.n, "answer")}</>])} />
          {!publicView && (
            <Rows label="Branches with the lowest client rating" note="Only branches with 5 or more rated conversations."
                  empty="No branch has 5 rated conversations yet."
                  rows={F.lowest.map((b) => [b.office, <><b>{one(b.avg)}</b> / 5 · {plural(b.n, "client")}</>])} />
          )}
        </div>
      </Section>

      <Section icon={Eye} tone={TONES.stories} title="Observations and stories">
        <div className="s1-grid">
          <Tile icon={Eye} tone={TONES.stories} label="Observations recorded" value={F.observations} of={F.observations ? `at ${plural(F.observationOffices, "office")}` : ""}
                note="Things staff noticed at an office that are worth noting." />
          <Tile icon={UserCheck} tone={TONES.stories} label="Referred by BRAC staff" value={F.referred} of={`of ${F.observations}`}
                progress={F.observations ? F.referred / F.observations : null}
                note="Observations that a staff member at the office pointed out." />
          <Tile icon={ImageIcon} tone={TONES.stories} label="Stories shared" value={F.stories}
                extra={<div className="s1-reacts">
                  <span><b>{F.likes}</b><Heart size={13} /> {F.likes === 1 ? "like" : "likes"}</span>
                  <span><b>{F.comments}</b><MessageCircle size={13} /> {F.comments === 1 ? "comment" : "comments"}</span>
                  <span><b>{F.shares}</b><Share2 size={13} /> {F.shares === 1 ? "share" : "shares"}</span>
                </div>}
                note="Field stories posted to the feed, and how staff responded. Shares are counted when someone uses the Share button." />
        </div>
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

/** A number with what it counts, "out of" what (with a bar), a change pill and one sentence of context. */
function Tile({ icon: Icon, tone, label, value, of, progress, change: ch, note, extra }) {
  return (
    <div className="card s1-tile" style={tone ? { "--tone": tone } : undefined}>
      <div className="s1-top">
        <p className="s1-label">{label}</p>
        {Icon && <Icon size={17} className="s1-icon" />}
      </div>
      <p className="s1-num">{value}{of ? <span className="s1-of"> {of}</span> : null}</p>
      {progress != null && <div className="s1-progress"><span style={{ width: `${Math.min(100, Math.round(progress * 100))}%` }} /></div>}
      {ch && (
        <span className={`s1-trend ${ch.mood}`}>
          {ch.mood === "flat" ? <Minus size={12} /> : ch.up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />} {ch.text}
        </span>
      )}
      {extra}
      {note && <p className="s1-note">{note}</p>}
    </div>
  );
}

/**
 * Field visits in one card: visits made (with the change from the period before) on the left,
 * branches visited and upcoming visits on the right, and the purpose of visit along the bottom.
 */
function VisitsPanel({ F, words }) {
  const ch = trend(F.visits, F.visitsBefore, words.prev);
  const purposes = F.reasons.map(([label, value], i) => ({ label, value, color: REASON_COLORS[i % REASON_COLORS.length] }));
  const total = purposes.reduce((n, p) => n + p.value, 0);
  return (
    <div className="card s1-tile s1-panel" style={{ "--tone": TONES.visits }}>
      <div className="s1-panel-top">
        <div className="s1-panel-main">
          <div className="s1-top"><p className="s1-label">Visits made · {words.now.toLowerCase()}</p><MapPin size={17} className="s1-icon" /></div>
          <p className="s1-num s1-big">{F.visits}</p>
          {ch && (
            <span className={`s1-trend ${ch.mood}`}>
              {ch.mood === "flat" ? <Minus size={12} /> : ch.up ? <ArrowUpRight size={12} /> : <ArrowDownRight size={12} />} {ch.text}
            </span>
          )}
          <p className="s1-note">Trips staff registered to field offices, by {plural(F.staff, "staff member")}, to {plural(F.officesReached, "office")}.</p>
        </div>
        <div className="s1-panel-side">
          <div className="s1-mini">
            <div className="s1-top"><span className="s1-label">Branches visited</span><Building2 size={15} className="s1-icon" /></div>
            <p className="s1-num">{F.visitedInPeriod}<span className="s1-of"> of {F.branches}</span></p>
            <div className="s1-progress"><span style={{ width: `${F.branches ? Math.round((F.visitedInPeriod / F.branches) * 100) : 0}%` }} /></div>
            <p className="s1-note">{pct(F.visitedInPeriod, F.branches)}% of branches had at least one visit.</p>
          </div>
          <div className="s1-mini">
            <div className="s1-top"><span className="s1-label">Upcoming visits</span><CalendarClock size={15} className="s1-icon" /></div>
            <p className="s1-num">{F.upcoming}<span className="s1-of"> planned</span></p>
            <p className="s1-note">
              {F.upcoming
                ? `Registered for after today${F.upcomingOffices ? `, to ${plural(F.upcomingOffices, "office")}` : ""}. ${F.upcomingThisWeek} in the next 7 days.`
                : "No visits are registered for a date after today."}
            </p>
          </div>
        </div>
      </div>
      <div className="s1-panel-purpose">
        <p className="s1-label">Purpose of visit</p>
        {total === 0 ? <p className="s1-note">No visits in this period.</p> : (
          <>
            <div className="s1-bar" role="img" aria-label={purposes.map((p) => `${p.label}: ${p.value}`).join(", ")}>
              {purposes.map((p) => <span key={p.label} title={`${p.label}: ${p.value}`} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />)}
            </div>
            <div className="s1-legend">{purposes.map((p) => <span key={p.label}><i style={{ background: p.color }} />{p.label} <b>{p.value}</b></span>)}</div>
          </>
        )}
      </div>
    </div>
  );
}

/** One bar split into parts, with a legend giving each part's count. */
function SplitBar({ label, note, parts }) {
  const total = parts.reduce((s, p) => s + p.value, 0);
  return (
    <div className="card s1-tile">
      <p className="s1-label">{label}</p>
      {total === 0 ? <p className="s1-note">Nothing recorded in this period.</p> : (
        <>
          <div className="s1-bar" role="img" aria-label={parts.map((p) => `${p.label}: ${p.value}`).join(", ")}>
            {parts.filter((p) => p.value).map((p) => <span key={p.label} title={`${p.label}: ${p.value}`} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />)}
          </div>
          <div className="s1-legend">
            {parts.filter((p) => p.value).map((p) => <span key={p.label}><i style={{ background: p.color }} />{p.label} <b>{p.value}</b></span>)}
          </div>
        </>
      )}
      {note && <p className="s1-note">{note}</p>}
    </div>
  );
}

const URGENCY_LOOK = { High: "danger", Medium: "warning", Low: "neutral" };

/** Items status: for each urgency, how many are fixed and how many are still open. */
function UrgencyStatus({ rows }) {
  const any = rows.some((r) => r.raised);
  return (
    <div className="card s1-tile">
      <p className="s1-label">Items status</p>
      {!any ? <p className="s1-note">Nothing was registered in this period.</p> : (
        <>
          {rows.map((r) => (
            <div className="s1-urow" key={r.u}>
              <span className={`s1-pill ${URGENCY_LOOK[r.u]}`}>{r.u}</span>
              <div className="s1-track" role="img" aria-label={`${r.u} urgency: ${r.fixed} fixed, ${r.open} open`}>
                {r.raised > 0 && <><span className="fixed" style={{ width: `${(r.fixed / r.raised) * 100}%` }} /><span className={`open ${URGENCY_LOOK[r.u]}`} style={{ width: `${(r.open / r.raised) * 100}%` }} /></>}
              </div>
              <span className="s1-uval">{r.raised ? <><b>{r.open}</b> open of {r.raised}</> : "none"}</span>
            </div>
          ))}
          <div className="s1-legend" style={{ marginTop: 8 }}>
            <span><i style={{ background: "var(--success)" }} />Fixed</span><span><i style={{ background: "var(--line)" }} />Still open (coloured by urgency)</span>
          </div>
        </>
      )}
    </div>
  );
}

/** Action items per department: bar length = items given; green part = fixed; plus average time to fix. */
function DepartmentChart({ rows }) {
  const max = Math.max(1, ...rows.map((r) => r.given));
  return (
    <div className="card s1-tile">
      <p className="s1-label">Action items per department</p>
      {rows.length === 0 ? <p className="s1-note">No action item has been given to a department yet.</p> : (
        <>
          <div className="s1-dept">
            {rows.map((r) => (
              <div className="s1-drow" key={r.unit}>
                <span className="s1-dname">{r.unit}</span>
                <div className="s1-dtrack">
                  <div className="s1-dbar" style={{ width: `${(r.given / max) * 100}%` }} role="img" aria-label={`${r.unit}: ${r.fixed} of ${r.given} fixed`}>
                    <span className="fixed" style={{ width: `${(r.fixed / r.given) * 100}%` }} />
                    <span className="open" style={{ width: `${((r.given - r.fixed) / r.given) * 100}%` }} />
                  </div>
                </div>
                <span className="s1-dval"><b>{r.fixed}</b> of {r.given} fixed{r.days != null ? ` · ${daysText(r.days)}` : ""}</span>
              </div>
            ))}
          </div>
          <div className="s1-legend" style={{ marginTop: 10 }}>
            <span><i style={{ background: "var(--success)" }} />Fixed</span>
            <span><i style={{ background: "var(--info)" }} />Not fixed yet</span>
            <span>Bar length = action items given · time = average to fix</span>
          </div>
        </>
      )}
    </div>
  );
}

/** A short list: label on the left, figures on the right. */
function Rows({ label, note, rows, empty }) {
  return (
    <div className="card s1-tile">
      <p className="s1-label">{label}</p>
      {rows.length === 0 ? <p className="s1-note">{empty}</p> : rows.map(([left, right], i) => (
        <div className="s1-row" key={i}><span>{left}</span><span>{right}</span></div>
      ))}
      {note && <p className="s1-note">{note}</p>}
    </div>
  );
}

/** Five stars, filled to the nearest whole star. */
function Stars({ value }) {
  const full = Math.round(value);
  return (
    <div className="s1-stars" aria-hidden="true">
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={17} fill={i <= full ? "currentColor" : "none"} style={{ opacity: i <= full ? 1 : 0.3 }} />)}
    </div>
  );
}
