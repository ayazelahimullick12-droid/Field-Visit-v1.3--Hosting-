import React, { useMemo, useState } from "react";
import { Route, Wrench, Star, Eye, RotateCcw } from "lucide-react";
import { LocationFilterBar, EMPTY_LOCATION_FILTER, matchesLocation } from "../analytics/common";
import { computeCoverage, average, DAY_MS } from "../../lib/offices";
import { submittedComplaints, entriesOf, entryPlaces, isDraft, plural, reasonText } from "../../lib/visits";
import { statusOf, isFixed, isLate, isAssigned } from "../../lib/complaints";
import { PERIODS, periodRange } from "./periods";
import { daysToResolve } from "./data";

/* Management → Summary (and the public summary page): one page, in plain words.
   Every tile says what it counts, gives the number "out of" something where it can, and has one
   sentence that explains it to someone who has never seen the app.

   How it's built:
     figures()   works out every number from the visits, offices and settings (no drawing here)
     Summary     the page: filters, an opening sentence, then four sections of tiles
     Tile, SplitBar, Rows   the three kinds of tile
   To add a tile: add the number in figures(), then a <Tile …/> in the section you want. */

// On screen, statuses use everyday words (the stored values stay the same).
const STATUS_WORDS = [
  ["Waiting", "Waiting for a unit", "var(--ink-faint)"],
  ["Assigned", "Given to a unit", "var(--info)"],
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
const median = (list) => {
  if (!list.length) return null;
  const s = [...list].sort((a, b) => a - b);
  return s.length % 2 ? s[(s.length - 1) / 2] : (s[s.length / 2 - 1] + s[s.length / 2]) / 2;
};
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
/** "Up 14 from the previous 30 days" */
function change(now, before, prevWords) {
  if (before == null || !prevWords) return null;
  const d = now - before;
  return d === 0 ? `Same as ${prevWords}.` : `${d > 0 ? "Up" : "Down"} ${Math.abs(d)} from ${prevWords}.`;
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

  // --- branches: visited in the period, and not visited within the visit target (any time) ---
  const branches = offices.filter((o) => o.active !== false && matchesLocation({ division: o.division, region: o.district, area: o.area, location: o.name }, loc));
  const visitedInPeriod = computeCoverage(branches, recordsNow, target).filter((b) => b.visitCount > 0).length;
  const notVisitedLately = computeCoverage(branches, recordsHere, target).filter((b) => b.status !== "ok").length;

  // --- how long visits last (visit date to return date, both days counted) ---
  const lengths = visits.filter((v) => v.returnDate && v.returnDate >= v.date)
    .map((v) => Math.round((new Date(`${v.returnDate}T00:00`) - new Date(`${v.date}T00:00`)) / DAY_MS) + 1);

  // --- why, and when in the day ---
  const reasons = countBy(visits, (v) => reasonText(v) || "Not given");
  const shownReasons = reasons.slice(0, 4);
  const otherReasons = reasons.slice(4).reduce((s, [, n]) => s + n, 0);
  const startOf = (v) => {
    const h = Number(String(v.visitTime || "").split(":")[0]);
    if (!v.visitTime || Number.isNaN(h)) return "Time not given";
    return h < 12 ? "Morning (before 12)" : h < 17 ? "Afternoon (12 to 5)" : "Evening (after 5)";
  };

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
    branches: branches.length, visitedInPeriod, notVisitedLately,
    typicalDays: median(lengths), longestDays: lengths.length ? Math.max(...lengths) : null,
    reasons: [...shownReasons, ...(otherReasons ? [["Other purposes", otherReasons]] : [])],
    starts: ["Morning (before 12)", "Afternoon (12 to 5)", "Evening (after 5)", "Time not given"]
      .map((k) => [k, visits.filter((v) => startOf(v) === k).length]).filter(([, n]) => n > 0),

    raised: raised.length, raisedBefore, fixed: fixed.length, open: open.length,
    daysToFix: daysToFix(fixed),
    waiting: raised.filter((c) => statusOf(c) === "Waiting").length,
    late: raised.filter((c) => isLate(c)).length,
    byStatus: STATUS_WORDS.map(([key, label, color]) => ({ label, color, value: raised.filter((c) => statusOf(c) === key).length })),
    byUrgency: URGENCIES.map((u) => ({ u, raised: raised.filter((c) => c.urgency === u).length, open: open.filter((c) => c.urgency === u).length })),
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
  };
}

/* ------------------------------------ the page ------------------------------------ */

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
          They raised <b>{plural(F.raised, "problem")}</b> to fix ({F.fixed} already fixed)
          {F.talks ? <>, spoke to <b>{plural(F.talks, "client")}</b>{F.rating != null && <> who rated BRAC <b>{one(F.rating)} out of 5 stars</b></>}</> : ""}
          {F.stories ? <>, and shared <b>{plural(F.stories, "story", "stories")}</b></> : ""}.
        </p>
      </div>

      <Section icon={Route} title="Field visits">
        <div className="s1-grid">
          <Tile label="Visits made" value={F.visits}
                note={`Trips staff registered to field offices, by ${plural(F.staff, "staff member")}. ${change(F.visits, F.visitsBefore, words.prev) || ""}`} />
          <Tile label="Branches visited" value={F.visitedInPeriod} of={`of ${F.branches}`}
                note={`${pct(F.visitedInPeriod, F.branches)}% of branches had at least one visit in this period.`} />
          <Tile label={`Branches not visited for ${F.target}+ days`} value={F.notVisitedLately} of={`of ${F.branches}`}
                note={`BRAC aims to visit every branch at least once every ${F.target} days. Counted as of today.`} />
          <Tile label="Typical visit length" value={F.typicalDays == null ? "—" : one(F.typicalDays)} of={F.typicalDays == null ? "" : F.typicalDays === 1 ? "day" : "days"}
                note={F.typicalDays == null ? "No visits with both dates in this period." : `Half of the visits took this long or less. The longest took ${plural(F.longestDays, "day")}.`} />
        </div>
        <div className="s1-grid s1-wide">
          <SplitBar label="Why staff visited" note="The purpose chosen when the visit was registered."
                    parts={F.reasons.map(([label, value], i) => ({ label, value, color: REASON_COLORS[i % REASON_COLORS.length] }))} />
          <SplitBar label="When visits start" note="The start time staff entered (it's optional)."
                    parts={F.starts.map(([label, value], i) => ({ label, value, color: ["var(--series-2)", "var(--series-3)", "var(--series-5)", "var(--line)"][["Morning (before 12)", "Afternoon (12 to 5)", "Evening (after 5)", "Time not given"].indexOf(label)] || REASON_COLORS[i] }))} />
        </div>
      </Section>

      <Section icon={Wrench} title="Problems found (action items)" sub="Problems raised in this period, and where each one stands today.">
        <div className="s1-grid">
          <Tile label="Problems raised" value={F.raised}
                note={`Issues found at offices during visits that a unit (HR, IT…) needs to fix. ${change(F.raised, F.raisedBefore, words.prev) || ""}`} />
          <Tile label="Fixed" value={F.fixed} of={`of ${F.raised}`}
                note={F.raised ? `${pct(F.fixed, F.raised)}% are fixed.${F.daysToFix != null ? ` On average a fix took ${daysText(F.daysToFix)} from being raised.` : ""}` : "Nothing was raised in this period."} />
          <Tile label="Waiting for a unit" value={F.waiting} of={`of ${F.raised}`}
                note="Not yet given to a unit to fix. The admin assigns these." />
          <Tile label="Past their deadline" value={F.late} of={`of ${F.open} still open`}
                note="Given to a unit, not fixed yet, and the deadline has passed." />
        </div>
        <div className="s1-grid s1-wide">
          <SplitBar label="Where every problem stands" note="Each problem raised in this period, by its status today." parts={F.byStatus} />
          <Rows label="How urgent, and how many are still open" empty="Nothing was raised in this period."
                rows={F.raised ? F.byUrgency.map((x) => [`${x.u} urgency`, <>{x.raised} raised · <b>{x.open} open</b></>]) : []} />
          {!publicView && (
            <Rows label="Which units are fixing them" empty="No problem has been given to a unit yet."
                  rows={F.units.map((x) => [x.unit, <>{x.given} given · {x.fixed} fixed{x.days != null ? ` · ${daysText(x.days)} on average` : ""}</>])} />
          )}
        </div>
      </Section>

      <Section icon={Star} title="What clients told us" sub="From client interactions: staff ask members to rate BRAC from 1 to 5 stars on the admin's questions.">
        <div className="s1-grid">
          <Tile label="Client rating" value={one(F.rating)} of={F.rating == null ? "" : "out of 5 stars"}
                extra={F.rating != null && <Stars value={F.rating} />}
                note={F.rating == null ? "No star ratings in this period." : `The average of all ${plural(F.starCount, "star rating")} clients gave.`} />
          <Tile label="Happy clients" value={F.starCount ? `${F.happy}%` : "—"} of={F.starCount ? "gave 4 or 5 stars" : ""}
                note={F.starCount ? `${F.unhappy}% gave 1 or 2 stars (unhappy). The rest were in between.` : "No star ratings in this period."} />
          <Tile label="Clients spoken to" value={F.talks}
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

      <Section icon={Eye} title="Observations and stories">
        <div className="s1-grid">
          <Tile label="Observations recorded" value={F.observations} of={F.observations ? `at ${plural(F.observationOffices, "office")}` : ""}
                note="Things staff noticed at an office that are worth noting." />
          <Tile label="Referred by BRAC staff" value={F.referred} of={`of ${F.observations}`}
                note="Observations that a staff member at the office pointed out." />
          <Tile label="Stories shared" value={F.stories}
                note={`Field stories posted to the feed${F.likes ? `, liked ${plural(F.likes, "time")}` : ""}.`} />
        </div>
      </Section>
    </div>
  );
}

/* ------------------------------------ the tiles ------------------------------------ */

function Section({ icon: Icon, title, sub, children }) {
  return (
    <section className="s1-section">
      <h2 className="s1-h"><Icon size={16} /> {title}</h2>
      {sub && <p className="s1-sub">{sub}</p>}
      {children}
    </section>
  );
}

/** A number with what it counts, "out of" what, and one sentence of context. */
function Tile({ label, value, of, note, extra }) {
  return (
    <div className="card s1-tile">
      <p className="s1-label">{label}</p>
      <p className="s1-num">{value}{of ? <span className="s1-of"> {of}</span> : null}</p>
      {extra}
      {note && <p className="s1-note">{note.trim()}</p>}
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
            {parts.filter((p) => p.value).map((p) => <span key={p.label} style={{ width: `${(p.value / total) * 100}%`, background: p.color }} />)}
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
      {[1, 2, 3, 4, 5].map((i) => <Star key={i} size={16} fill={i <= full ? "currentColor" : "none"} style={{ opacity: i <= full ? 1 : 0.35 }} />)}
    </div>
  );
}
