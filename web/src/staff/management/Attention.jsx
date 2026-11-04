import React, { useMemo } from "react";
import { AlertTriangle, Clock, MapPinOff, UserX, Inbox, ClipboardCheck, ChevronRight, CheckCircle2 } from "lucide-react";
import { submittedComplaints, phaseOf, plural } from "../../lib/visits";
import { statusOf, isFixed, isLate } from "../../lib/complaints";
import { DAY_MS } from "../../lib/offices";
import { matchesLocation } from "../analytics/common";

/* Management → Overview: "Needs your attention". Things that are wrong today (whatever the time
   filter says, but inside the chosen place), each one a button that opens the tab that deals with
   it, already filtered. */

const OLD_DAYS = 14; // a high-urgency issue open longer than this needs a nudge
const IDLE_DAYS = 30; // a field worker with no visit in this long

const filedOn = (c) => c.submittedAt || c.filedDate || c.visitDate;
const ageOf = (c, now) => Math.floor((now - new Date(filedOn(c))) / DAY_MS);

/** The two largest groups, as "HR 3 · Construction 2". */
function top(list, keyFn, n = 2) {
  const m = new Map();
  list.forEach((x) => { const k = keyFn(x); if (k) m.set(k, (m.get(k) || 0) + 1); });
  return [...m.entries()].sort((a, b) => b[1] - a[1]).slice(0, n).map(([k, c]) => `${k} ${c}`).join(" · ");
}

export function attentionItems({ trips, coverage, employees, loc, now = new Date() }) {
  const open = submittedComplaints(trips).filter((c) => matchesLocation(c, loc) && !isFixed(c));
  const high = open.filter((c) => c.urgency === "High" && ageOf(c, now) > OLD_DAYS);
  const late = open.filter((c) => isLate(c, now));
  const waiting = open.filter((c) => statusOf(c) === "Waiting");
  const branches = coverage.filter((o) => matchesLocation(o, loc));
  const overdue = branches.filter((o) => o.status === "stale");
  const never = branches.filter((o) => o.status === "never");
  const since = new Date(now.getTime() - IDLE_DAYS * DAY_MS).toISOString().slice(0, 10);
  const today = now.toISOString().slice(0, 10);
  const active = new Set(trips.filter((v) => v.date && v.date >= since && v.date <= today).map((v) => v.employeeId));
  const idle = employees.filter((e) => (e.roles?.length ? e.roles.includes("field") : true) && !active.has(e.id));
  const notDone = trips.filter((v) => phaseOf(v) === "due");
  const dept = (c) => c.department || "No department";

  return [
    high.length && { key: "high", tone: "bad", Icon: AlertTriangle, text: `${plural(high.length, "high-urgency issue")} open for more than ${OLD_DAYS} days`, tag: top(high, dept), go: { tab: "departments", preset: { focus: "high" }, period: "all" } },
    late.length && { key: "late", tone: "bad", Icon: Clock, text: `${plural(late.length, "issue")} past ${late.length === 1 ? "its" : "their"} deadline`, tag: top(late, dept), go: { tab: "departments", preset: { focus: "late" }, period: "all" } },
    waiting.length && { key: "waiting", tone: "warn", Icon: Inbox, text: `${plural(waiting.length, "issue")} not given to a department yet`, tag: top(waiting, (c) => c.location), go: { tab: "departments", preset: { focus: "waiting" }, period: "all" } },
    overdue.length && { key: "overdue", tone: "warn", Icon: MapPinOff, text: `${plural(overdue.length, "branch", "branches")} overdue for a visit${never.length ? `, ${never.length.toLocaleString()} never visited` : ""}`, tag: top(overdue, (o) => o.division), go: { tab: "offices", preset: { kind: "branch", status: "stale" } } },
    idle.length && { key: "idle", tone: "warn", Icon: UserX, text: `${plural(idle.length, "field worker")} with no visit in ${IDLE_DAYS} days`, tag: idle.slice(0, 2).map((e) => e.name).join(", ") + (idle.length > 2 ? ` +${idle.length - 2}` : ""), go: { tab: "people", preset: { sort: "last" } } },
    notDone.length && { key: "notDone", tone: "info", Icon: ClipboardCheck, text: `${plural(notDone.length, "visit")} back from the field but not marked done`, tag: top(notDone, (v) => v.employeeName), go: { tab: "people", preset: { sort: "notDone" } } },
  ].filter(Boolean);
}

export default function NeedsAttention({ trips, coverage, employees, loc, onGo }) {
  const items = useMemo(() => attentionItems({ trips, coverage, employees, loc }), [trips, coverage, employees, loc]);
  return (
    <section className="card card-pad na">
      <div className="na-head">
        <p className="analytics-card-title" style={{ margin: 0 }}>Needs your attention</p>
        <span className="analytics-card-sub" style={{ margin: 0 }}>As of today{loc.division !== "All" ? `, in ${loc.branch !== "All" ? loc.branch : loc.area !== "All" ? loc.area : loc.region !== "All" ? loc.region : loc.division}` : ""} · select one to deal with it</span>
      </div>
      {items.length === 0 ? (
        <div className="na-row ok" style={{ cursor: "default" }}><CheckCircle2 size={16} /><span className="na-text">Nothing needs attention right now.</span></div>
      ) : items.map(({ key, tone, Icon, text, tag, go }) => (
        <button key={key} type="button" className={`na-row ${tone}`} onClick={() => onGo(go)}>
          <Icon size={16} />
          <span className="na-text">{text}</span>
          {tag && <span className="na-tag">{tag}</span>}
          <ChevronRight size={15} className="na-go" />
        </button>
      ))}
    </section>
  );
}
