import React, { useState } from "react";
import { LayoutDashboard, Building2, Users, Briefcase, Link2, ExternalLink, Check, RotateCcw } from "lucide-react";
import { officeKey } from "../../lib/offices";
import VisitHub from "../visits/VisitHub";
import { LocationFilterBar, EMPTY_LOCATION_FILTER } from "../analytics/common";
import Summary from "./Summary";
import NeedsAttention from "./Attention";
import OfficesView from "./OfficesView";
import DepartmentsView from "./DepartmentsView";
import { PeopleDirectory, PersonProfile } from "./People";
import { peopleList } from "./data";
import { PeriodSelect } from "./periods";

export const MGMT_TABS = [
  { key: "summary", label: "Overview", icon: LayoutDashboard, desc: "What needs your attention today, and the whole programme in charts: field visits, issues found, observations, clients reached and stories." },
  { key: "offices", label: "Offices", icon: Building2, desc: "Every branch, VO, area office and region office: whether it is visited often enough, by whom, and how its issues are doing." },
  { key: "people", label: "People", icon: Users, desc: "Everyone who makes visits: how many, where they went, and what they recorded." },
  { key: "departments", label: "Departments", icon: Briefcase, desc: "How each department deals with the issues it is given: where they stand, how fast they are fixed, and what is late." },
];

/** The public, sign-in-free copy of the Summary (see src/summary/): copy or open its link. */
function PublicLink() {
  const [copied, setCopied] = useState(false);
  const url = `${window.location.origin}/summary.html`;
  const copy = async () => {
    try { await navigator.clipboard.writeText(url); setCopied(true); setTimeout(() => setCopied(false), 2000); } catch { window.prompt("Copy this link:", url); }
  };
  return (
    <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
      <button className="btn btn-secondary btn-sm" onClick={copy} title="Anyone with this link can see a read-only summary, without names or contact details">
        {copied ? <><Check size={14} /> Copied</> : <><Link2 size={14} /> Copy public link</>}
      </button>
      <a className="btn btn-ghost btn-sm" href={url} target="_blank" rel="noreferrer"><ExternalLink size={14} /> Open</a>
    </div>
  );
}

export const EMPTY_MGMT_VIEW = { tab: "summary", period: "30d", loc: EMPTY_LOCATION_FILTER, preset: null, personId: null, visitId: null };

/**
 * The Management section of the staff app (employees tagged "management"). Read-only and
 * organisation-wide. `view` lives in the app so it survives a trip to a Branch 360° profile:
 * { tab, period, loc, preset, personId, visitId }. `period` and `loc` (the filter bar) apply to every
 * tab; `preset` is what "Needs your attention" opened a tab with; a visit opened from a person's
 * profile returns there.
 */
export default function Management({ view, setView, trips, records, coverage, offices, employees, departments, settings, questions, onOpenBranch }) {
  const set = (patch) => { setView({ ...view, ...patch }); window.scrollTo({ top: 0, behavior: "instant" }); };
  const loc = view.loc || EMPTY_LOCATION_FILTER;
  const openPerson = (personId) => set({ personId, visitId: null });
  const openVisit = (visitId) => set({ visitId });
  const openBranchByName = (name) => { const row = coverage.find((o) => o.name === name); if (row) onOpenBranch(row); };
  const openMasterOffice = (o) => onOpenBranch({ key: officeKey(o) });
  // from the Overview's tiles and "Needs your attention": open a tab ({ tab, preset }), narrow the place
  // ({ loc }), or both; the attention list counts everything open today, so it also asks for all time
  const go = ({ tab, preset = null, loc: place, period }) => set({
    personId: null, ...(tab ? { tab, preset } : {}), ...(place ? { loc: place } : {}), ...(period ? { period } : {}),
  });

  const visit = view.visitId ? trips.find((v) => v.id === view.visitId) : null;
  if (visit) {
    return (
      <VisitHub
        key={visit.id} visit={visit} departments={departments} questions={questions}
        sync={{ pending: 0, online: true, syncing: false }} viewer={{ backLabel: view.personId ? "Back to profile" : "Back" }}
        onSave={() => {}} showToast={() => {}} onEditDetails={() => {}} onMarkedDone={() => {}}
        onBack={() => set({ visitId: null })}
      />
    );
  }

  const person = view.personId ? peopleList(employees, trips).find((p) => p.id === view.personId) : null;
  const tab = MGMT_TABS.find((t) => t.key === view.tab) || MGMT_TABS[0];
  const filtered = view.period !== EMPTY_MGMT_VIEW.period || Object.values(loc).some((v) => v !== "All");

  return (
    <div className="page">
      <div className="page-head mg-pagehead">
        <div>
          <p className="h-eyebrow">Management{person ? " · People" : ""}</p>
          <h1 className="h-title">{person ? "Visit history" : tab.label}</h1>
          {!person && <p className="h-desc">{tab.desc}</p>}
        </div>
        <div style={{ display: "flex", gap: 10, alignItems: "center", flexWrap: "wrap" }}>
          {!person && tab.key === "summary" && <PublicLink />}
          {person && <PeriodSelect value={view.period} onChange={(period) => setView({ ...view, period })} />}
        </div>
      </div>

      {/* the tabs and the filters for all of them, in one bar that stays at the top while scrolling */}
      {!person && (
        <div className="mg-bar">
          <div className="mg-tabs" role="tablist">
            {MGMT_TABS.map((t) => (
              <button key={t.key} role="tab" aria-selected={tab.key === t.key} className={`mg-tab ${tab.key === t.key ? "active" : ""}`} onClick={() => set({ tab: t.key, preset: null })}>
                <t.icon size={14} /> {t.label}
              </button>
            ))}
          </div>
          <div className="mg-filters">
            <PeriodSelect value={view.period} onChange={(period) => setView({ ...view, period })} />
            <LocationFilterBar offices={offices} value={loc} onChange={(l) => setView({ ...view, loc: l })} />
            {filtered && <button className="mf-clear" onClick={() => setView({ ...view, period: EMPTY_MGMT_VIEW.period, loc: EMPTY_LOCATION_FILTER })}><RotateCcw size={12} /> Reset</button>}
          </div>
        </div>
      )}

      <div key={person ? `p-${person.id}` : `${tab.key}-${JSON.stringify(view.preset || {})}`} className="page-enter">
        {person ? (
          <PersonProfile person={person} employees={employees} departments={departments} trips={trips} records={records} period={view.period}
            onBack={() => set({ personId: null, tab: "people" })} onOpenVisit={openVisit} onOpenBranchByName={openBranchByName} />
        ) : tab.key === "summary" ? (
          <>
            <Summary trips={trips} records={records} coverage={coverage} offices={offices} employees={employees} departments={departments} settings={settings}
              filters={{ period: view.period, loc }} onGo={go} />
            <NeedsAttention trips={trips} coverage={coverage} employees={employees} loc={loc} onGo={go} />
          </>
        ) : tab.key === "offices" ? (
          <OfficesView records={records} offices={offices} coverage={coverage} target={settings?.visitTargetDays || 90} period={view.period} loc={loc} preset={view.preset}
            onOpenBranch={openMasterOffice} onOpenPerson={openPerson} onOpenVisit={openVisit} />
        ) : tab.key === "people" ? (
          <PeopleDirectory employees={employees} trips={trips} records={records} period={view.period} loc={loc} preset={view.preset}
            onOpenPerson={openPerson} onOpenVisit={openVisit} onOpenBranchByName={openBranchByName} />
        ) : (
          <DepartmentsView trips={trips} loc={loc} period={view.period} preset={view.preset} onOpenVisit={openVisit} />
        )}
      </div>
    </div>
  );
}
