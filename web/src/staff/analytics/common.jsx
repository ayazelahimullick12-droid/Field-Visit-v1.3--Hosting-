import React, { useMemo } from "react";
import { CountUp, Sparkline, DeltaChip } from "../../lib/ui";

export const SERIES_COLORS = [
  "var(--series-1)", "var(--series-2)", "var(--series-3)",
  "var(--series-4)", "var(--series-5)", "var(--series-6)",
];

export const EMPTY_LOCATION_FILTER = { division: "All", region: "All", area: "All", branch: "All" };
export const EMPTY_DATE_FILTER = { preset: "all", customMonth: "" };

export function matchesDate(dateStr, filter) {
  if (!filter || filter.preset === "all") return true;
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d)) return false;
  const now = new Date();
  if (filter.preset === "thisMonth") return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  if (filter.preset === "prevMonth") {
    const prev = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    return d.getFullYear() === prev.getFullYear() && d.getMonth() === prev.getMonth();
  }
  if (filter.preset === "custom" && filter.customMonth) {
    const [y, m] = filter.customMonth.split("-").map(Number);
    return d.getFullYear() === y && d.getMonth() === m - 1;
  }
  return true;
}

// Works on any record carrying division / region (district) / area / location (branch).
export function matchesLocation(record, filter) {
  if (filter.division !== "All" && record.division !== filter.division) return false;
  if (filter.region !== "All" && record.region !== filter.region) return false;
  if (filter.area !== "All" && record.area !== filter.area) return false;
  if (filter.branch !== "All" && record.location !== filter.branch) return false;
  return true;
}

/** Which field the "next level down" breakdown should group by. */
export function drillFieldFor(filter) {
  if (filter.branch !== "All") return null;
  if (filter.area !== "All") return "location";
  if (filter.region !== "All") return "area";
  if (filter.division !== "All") return "region";
  return "division";
}
export const DRILL_LABELS = { division: "Division", region: "District", area: "Area", location: "Branch" };

/* ============================== FILTER BARS ============================== */

// Options come from the master office list, so offices that have never been
// visited can still be picked and inspected.
export function LocationFilterBar({ offices, value, onChange, labelled = false }) {
  const divisions = useMemo(() => [...new Set(offices.map((o) => o.division).filter(Boolean))].sort(), [offices]);
  const districts = useMemo(
    () => [...new Set(offices.filter((o) => value.division === "All" || o.division === value.division).map((o) => o.district).filter(Boolean))].sort(),
    [offices, value.division]
  );
  const areas = useMemo(
    () => [...new Set(offices.filter((o) => (value.division === "All" || o.division === value.division) && (value.region === "All" || o.district === value.region)).map((o) => o.area).filter(Boolean))].sort(),
    [offices, value.division, value.region]
  );
  const branches = useMemo(
    () => [...new Set(offices.filter((o) =>
      (value.division === "All" || o.division === value.division) &&
      (value.region === "All" || o.district === value.region) &&
      (value.area === "All" || o.area === value.area)
    ).map((o) => o.name).filter(Boolean))].sort(),
    [offices, value.division, value.region, value.area]
  );

  // `labelled` stacks each select under a visible caption (used in the map panel's filter column)
  const field = (label, node) => (labelled ? <div className="mf-field" key={label}><span className="mf-label">{label}</span>{node}</div> : node);

  return (
    <>
      {field("Division",
        <select className="select" aria-label="Division" value={value.division}
                onChange={(e) => onChange({ division: e.target.value, region: "All", area: "All", branch: "All" })}>
          <option value="All">All Divisions</option>
          {divisions.map((d) => <option key={d} value={d}>{d}</option>)}
        </select>
      )}
      {value.division !== "All" && field("District",
        <select className="select" aria-label="District" value={value.region}
                onChange={(e) => onChange({ ...value, region: e.target.value, area: "All", branch: "All" })}>
          <option value="All">All Districts</option>
          {districts.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      )}
      {value.region !== "All" && field("Area",
        <select className="select" aria-label="Area" value={value.area}
                onChange={(e) => onChange({ ...value, area: e.target.value, branch: "All" })}>
          <option value="All">All Areas</option>
          {areas.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      )}
      {value.area !== "All" && field("Branch",
        <select className="select" aria-label="Branch" value={value.branch}
                onChange={(e) => onChange({ ...value, branch: e.target.value })}>
          <option value="All">All Branches</option>
          {branches.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      )}
    </>
  );
}

/** A map with its filters right beside it (stacked above it on small screens), so changing a
    filter and watching the map zoom happen on the same screen. */
export function MapPanel({ title, sub, filters, canClear, onClear, children }) {
  return (
    <div className="card card-pad map-panel" style={{ minWidth: 0 }}>
      <p className="analytics-card-title">{title}</p>
      <p className="analytics-card-sub">{sub}</p>
      <div className="map-panel-body">
        <div className="map-filters">
          <div className="mf-head">
            <span>Filters</span>
            {canClear && <button className="mf-clear" onClick={onClear}>Clear</button>}
          </div>
          {filters}
        </div>
        <div className="map-stage">{children}</div>
      </div>
    </div>
  );
}

export function DateFilterBar({ value, onChange }) {
  return (
    <>
      <select className="select" aria-label="Date range" value={value.preset}
              onChange={(e) => onChange({ preset: e.target.value, customMonth: value.customMonth })}>
        <option value="all">All time</option>
        <option value="thisMonth">This month</option>
        <option value="prevMonth">Previous month</option>
        <option value="custom">Choose a month…</option>
      </select>
      {value.preset === "custom" && (
        <input type="month" className="input" aria-label="Month" value={value.customMonth}
               onChange={(e) => onChange({ ...value, customMonth: e.target.value })} />
      )}
    </>
  );
}

/* ================================= KPI TILE ================================ */

export function Kpi({ icon: Icon, tone = "", label, value, decimals = 0, suffix = "", prefix = "", delta, spark, sparkColor, foot, className = "" }) {
  return (
    <div className={`kpi ${className}`}>
      <div className="kpi-top">
        {Icon && <span className={`kpi-icon ${tone}`}><Icon size={16} /></span>}
        {delta}
      </div>
      <div className="kpi-num">
        {typeof value === "number" ? <CountUp value={value} decimals={decimals} suffix={suffix} prefix={prefix} /> : value}
      </div>
      <div className="kpi-label">{label}</div>
      {(spark || foot) && (
        <div className="kpi-foot">
          {spark ? <Sparkline data={spark} color={sparkColor || "var(--brand)"} w={88} h={26} /> : <span />}
          {foot}
        </div>
      )}
    </div>
  );
}

export { DeltaChip };
