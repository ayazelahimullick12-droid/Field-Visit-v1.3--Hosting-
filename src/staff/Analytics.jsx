import React, { useMemo, useState } from "react";
import { BarChart3, ChevronDown, ChevronUp, MapPin, MessageCircle } from "lucide-react";
import { RankedBarChart, StackedBarChart, ChoroplethMap, VIZ_STYLES } from "../lib/charts";
import bdDivisionsGeoJson from "../lib/bd-divisions.geojson.json";
import bdDistrictsGeoJson from "../lib/bd-districts.geojson.json";

// Categorical department palette — fixed order, validated (light + dark) for
// contrast/CVD separation against this app's card surface. See the dataviz
// skill's palette reference for how these six were chosen and checked.
const ANALYTICS_STYLES = `
  :root{
    --series-1:#2a78d6; --series-2:#eb6834; --series-3:#1baf7a;
    --series-4:#eda100; --series-5:#e87ba4; --series-6:#4a3aa7;
    --map-empty:#DCDCE3; --map-line:#C6C6D0;
  }
  [data-theme="dark"]{
    --series-1:#3987e5; --series-2:#d95926; --series-3:#199e70;
    --series-4:#c98500; --series-5:#d55181; --series-6:#9085e9;
    --map-empty:#2E2F38; --map-line:#3D3E48;
  }
  .analytics-block{ margin-top:34px; margin-bottom:12px; }
  .analytics-head{ display:flex; align-items:center; justify-content:space-between; gap:12px; flex-wrap:wrap; margin-bottom:14px; }
  .analytics-summary-row{ display:grid; grid-template-columns:repeat(auto-fit,minmax(120px,1fr)); gap:12px; }
  .analytics-subtabs{ display:flex; background:var(--line-soft); border-radius:10px; padding:3px; gap:2px; margin:18px 0 16px; width:fit-content; }
  .analytics-subtab{ border:none; background:transparent; padding:8px 16px; border-radius:8px; font-size:12.5px; font-weight:700; color:var(--ink-soft); cursor:pointer; display:flex; align-items:center; gap:6px; }
  .analytics-subtab.active{ background:var(--card); color:var(--magenta-dark); box-shadow:0 1px 3px rgba(0,0,0,0.08); }
  .analytics-grid{ display:grid; grid-template-columns:1fr 1fr; gap:16px; }
  @media (max-width: 900px){ .analytics-grid{ grid-template-columns:1fr; } }
  .analytics-card-title{ font-size:13.5px; font-weight:700; margin:0 0 4px; }
  .analytics-card-sub{ font-size:11.5px; color:var(--ink-faint); margin:0 0 14px; }
  .analytics-filters{ display:flex; flex-wrap:wrap; gap:10px; align-items:center; margin-bottom:18px; }
  .analytics-filters .select, .analytics-filters .input{ width:auto; min-width:130px; font-size:12.5px; padding:7px 10px; }
` + VIZ_STYLES;

const SERIES_COLORS = [
  "var(--series-1)", "var(--series-2)", "var(--series-3)",
  "var(--series-4)", "var(--series-5)", "var(--series-6)",
];

const MONTH_LABELS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

// Our own `division` field carries a " Division" suffix and modern spelling;
// the geoBoundaries dataset uses older/alternate spellings for a few. Map
// between the two so the choropleth can join on the right shape.
const DIVISION_ALIASES = { Chattogram: "Chittagong", Rajshahi: "Rajshani", Barisal: "Barisal" };
const SHAPE_DISPLAY_NAME = { Chittagong: "Chattogram", Rajshani: "Rajshahi" };

function toShapeName(divisionField) {
  const base = (divisionField || "").replace(/\s*Division$/i, "").trim();
  return DIVISION_ALIASES[base] || base;
}

// All 64 districts (ADM2), grouped by the division (ADM1 shapeName) they
// belong to — standard Bangladesh administrative structure, independent of
// this app's own seed data. Used to zoom the choropleth into a division and
// show only the districts that actually belong to it.
const DISTRICTS_BY_DIVISION = {
  Dhaka: ["Dhaka", "Faridpur", "Gazipur", "Gopalganj", "Kishoreganj", "Madaripur", "Manikganj", "Munshiganj", "Narayanganj", "Narsingdi", "Rajbari", "Shariatpur", "Tangail"],
  Chittagong: ["Bandarban", "Brahamanbaria", "Chandpur", "Chittagong", "Comilla", "Cox's Bazar", "Feni", "Khagrachhari", "Lakshmipur", "Noakhali", "Rangamati"],
  Rajshani: ["Bogra", "Joypurhat", "Naogaon", "Natore", "Nawabganj", "Pabna", "Rajshahi", "Sirajganj"],
  Khulna: ["Bagerhat", "Chuadanga", "Jessore", "Jhenaidah", "Khulna", "Kushtia", "Magura", "Meherpur", "Narail", "Satkhira"],
  Barisal: ["Barguna", "Barisal", "Bhola", "Jhalokati", "Patuakhali", "Pirojpur"],
  Sylhet: ["Habiganj", "Maulvibazar", "Sunamganj", "Sylhet"],
  Rangpur: ["Dinajpur", "Gaibandha", "Kurigram", "Lalmonirhat", "Nilphamari", "Panchagarh", "Rangpur", "Thakurgaon"],
  Mymensingh: ["Jamalpur", "Mymensingh", "Netrakona", "Sherpur"],
};

function daysBetween(a, b) {
  return (new Date(b).getTime() - new Date(a).getTime()) / (1000 * 60 * 60 * 24);
}

function matchesDate(dateStr, filter) {
  if (!filter || filter.preset === "all") return true;
  if (!dateStr) return false;
  const d = new Date(dateStr);
  if (isNaN(d)) return false;
  const now = new Date();
  if (filter.preset === "thisMonth") {
    return d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
  }
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

function matchesLocation(record, filter) {
  if (filter.division !== "All" && record.division !== filter.division) return false;
  if (filter.region !== "All" && record.region !== filter.region) return false;
  if (filter.area !== "All" && record.area !== filter.area) return false;
  if (filter.branch !== "All" && record.location !== filter.branch) return false;
  return true;
}

const EMPTY_LOCATION_FILTER = { division: "All", region: "All", area: "All", branch: "All" };
const EMPTY_DATE_FILTER = { preset: "all", customMonth: "" };

/* ============================== FILTER BARS ============================== */

function LocationFilterBar({ records, value, onChange }) {
  const divisions = useMemo(() => [...new Set(records.map((r) => r.division).filter(Boolean))].sort(), [records]);
  const regions = useMemo(
    () => [...new Set(records.filter((r) => value.division === "All" || r.division === value.division).map((r) => r.region).filter(Boolean))].sort(),
    [records, value.division]
  );
  const areas = useMemo(
    () => [...new Set(records.filter((r) => (value.division === "All" || r.division === value.division) && (value.region === "All" || r.region === value.region)).map((r) => r.area).filter(Boolean))].sort(),
    [records, value.division, value.region]
  );
  const branches = useMemo(
    () => [...new Set(records.filter((r) =>
      (value.division === "All" || r.division === value.division) &&
      (value.region === "All" || r.region === value.region) &&
      (value.area === "All" || r.area === value.area)
    ).map((r) => r.location).filter(Boolean))].sort(),
    [records, value.division, value.region, value.area]
  );

  return (
    <>
      <select className="select" value={value.division}
              onChange={(e) => onChange({ division: e.target.value, region: "All", area: "All", branch: "All" })}>
        <option value="All">All Divisions</option>
        {divisions.map((d) => <option key={d} value={d}>{d}</option>)}
      </select>
      {value.division !== "All" && (
        <select className="select" value={value.region}
                onChange={(e) => onChange({ ...value, region: e.target.value, area: "All", branch: "All" })}>
          <option value="All">All Districts</option>
          {regions.map((r) => <option key={r} value={r}>{r}</option>)}
        </select>
      )}
      {value.region !== "All" && (
        <select className="select" value={value.area}
                onChange={(e) => onChange({ ...value, area: e.target.value, branch: "All" })}>
          <option value="All">All Areas</option>
          {areas.map((a) => <option key={a} value={a}>{a}</option>)}
        </select>
      )}
      {value.area !== "All" && (
        <select className="select" value={value.branch}
                onChange={(e) => onChange({ ...value, branch: e.target.value })}>
          <option value="All">All Branches</option>
          {branches.map((b) => <option key={b} value={b}>{b}</option>)}
        </select>
      )}
    </>
  );
}

function DateFilterBar({ value, onChange }) {
  return (
    <>
      <select className="select" value={value.preset}
              onChange={(e) => onChange({ preset: e.target.value, customMonth: value.customMonth })}>
        <option value="all">All time</option>
        <option value="thisMonth">This month</option>
        <option value="prevMonth">Previous month</option>
        <option value="custom">Choose a month…</option>
      </select>
      {value.preset === "custom" && (
        <input type="month" className="input" value={value.customMonth}
               onChange={(e) => onChange({ ...value, customMonth: e.target.value })} />
      )}
    </>
  );
}

/* ============================== VISIT ANALYTICS ============================== */

function VisitAnalytics({ visits, theme }) {
  const [locationFilter, setLocationFilter] = useState(EMPTY_LOCATION_FILTER);
  const [dateFilter, setDateFilter] = useState(EMPTY_DATE_FILTER);

  const filtered = useMemo(
    () => visits.filter((v) => matchesLocation(v, locationFilter) && matchesDate(v.date, dateFilter)),
    [visits, locationFilter, dateFilter]
  );

  const byDivision = useMemo(() => {
    const counts = {};
    filtered.forEach((v) => {
      const shape = toShapeName(v.division);
      if (shape) counts[shape] = (counts[shape] || 0) + 1;
    });
    return counts;
  }, [filtered]);

  // Once a division is picked, the map zooms into it: we swap the national
  // geojson for just that division's districts (a real sub-boundary, not a
  // stylized fake), fit to those features' own bounds, and color by district.
  const selectedDivisionShape = locationFilter.division !== "All" ? toShapeName(locationFilter.division) : null;
  const districtShapesInDivision = selectedDivisionShape ? DISTRICTS_BY_DIVISION[selectedDivisionShape] || [] : [];
  const zoomedGeoJson = useMemo(() => {
    if (!selectedDivisionShape) return null;
    return { type: "FeatureCollection", features: bdDistrictsGeoJson.features.filter((f) => districtShapesInDivision.includes(f.properties.shapeName)) };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedDivisionShape]);

  const byDistrict = useMemo(() => {
    if (!selectedDivisionShape) return {};
    const counts = {};
    filtered.forEach((v) => { if (v.region) counts[v.region] = (counts[v.region] || 0) + 1; });
    return counts;
  }, [filtered, selectedDivisionShape]);

  const drillField = useMemo(() => {
    if (locationFilter.branch !== "All") return null;
    let field = "division";
    if (locationFilter.division !== "All") field = "region";
    if (locationFilter.region !== "All") field = "area";
    if (locationFilter.area !== "All") field = "location";
    return field;
  }, [locationFilter]);
  const DRILL_LABELS = { division: "Division", region: "District", area: "Area", location: "Branch" };

  const drillDown = useMemo(() => {
    if (!drillField) return { levelLabel: "Branch", items: null };
    const counts = {};
    filtered.forEach((v) => {
      const key = v[drillField] || "Unspecified";
      counts[key] = (counts[key] || 0) + 1;
    });
    return {
      levelLabel: DRILL_LABELS[drillField],
      items: Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([label, value], i) => ({ label, value, color: SERIES_COLORS[i % SERIES_COLORS.length] })),
    };
  }, [filtered, drillField]);

  // Same grouping level as the visit-count breakdown above, but averaging
  // both feedback sources' star ratings per group instead of counting.
  const ratingByLocation = useMemo(() => {
    if (!drillField) return { levelLabel: "Branch", items: null };
    const buckets = {};
    filtered.forEach((v) => {
      const key = v[drillField] || "Unspecified";
      const ratings = [v.feedback?.staff?.rating, v.feedback?.member?.rating].filter((r) => typeof r === "number" && r > 0);
      if (ratings.length === 0) return;
      buckets[key] = buckets[key] || [];
      buckets[key].push(...ratings);
    });
    const items = Object.entries(buckets)
      .map(([label, ratings], i) => ({
        label, value: Number((ratings.reduce((s, r) => s + r, 0) / ratings.length).toFixed(1)),
        color: SERIES_COLORS[i % SERIES_COLORS.length],
      }))
      .sort((a, b) => b.value - a.value);
    return { levelLabel: DRILL_LABELS[drillField], items };
  }, [filtered, drillField]);

  const reasonBreakdown = useMemo(() => {
    const counts = {};
    filtered.forEach((v) => {
      const key = v.reason || "Unspecified";
      counts[key] = (counts[key] || 0) + 1;
    });
    return Object.entries(counts).sort((a, b) => b[1] - a[1]).map(([label, value], i) => ({ label, value, color: SERIES_COLORS[i % SERIES_COLORS.length] }));
  }, [filtered]);

  const highlightShape = locationFilter.region !== "All" ? locationFilter.region : null;

  // Ratings come from two independent feedback sources per visit — the
  // field staff's own assessment and the member's — pooled for one overall
  // figure, and also kept separate since a gap between the two is itself
  // useful signal (e.g. staff rating a branch well while members don't).
  const ratingStats = useMemo(() => {
    const avg = (arr) => (arr.length ? arr.reduce((s, r) => s + r, 0) / arr.length : null);
    const staffRatings = filtered.map((v) => v.feedback?.staff?.rating).filter((r) => typeof r === "number" && r > 0);
    const memberRatings = filtered.map((v) => v.feedback?.member?.rating).filter((r) => typeof r === "number" && r > 0);
    return {
      overall: avg([...staffRatings, ...memberRatings]),
      staff: avg(staffRatings),
      member: avg(memberRatings),
      count: staffRatings.length + memberRatings.length,
    };
  }, [filtered]);
  const fmtRating = (n) => (n == null ? "—" : `${n.toFixed(1)}★`);

  return (
    <div>
      <div className="analytics-filters">
        <LocationFilterBar records={visits} value={locationFilter} onChange={setLocationFilter} />
        <DateFilterBar value={dateFilter} onChange={setDateFilter} />
      </div>

      <div className="stat-section">
        <div className="stat-row-group">
          <div className="stat-card"><div className="stat-num">{filtered.length}</div><div className="stat-label">Visits in selection</div></div>
          <div className="stat-card"><div className="stat-num">{Object.keys(byDivision).length}</div><div className="stat-label">Divisions Represented</div></div>
          <div className="stat-card"><div className="stat-num" style={{ color: "var(--warning)" }}>{fmtRating(ratingStats.overall)}</div><div className="stat-label">Avg Rating ({ratingStats.count})</div></div>
          <div className="stat-card"><div className="stat-num">{fmtRating(ratingStats.staff)}</div><div className="stat-label">Avg Staff Rating</div></div>
          <div className="stat-card"><div className="stat-num">{fmtRating(ratingStats.member)}</div><div className="stat-label">Avg Member Rating</div></div>
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16, marginTop: 16 }}>
        {zoomedGeoJson ? (
          <>
            <p className="analytics-card-title">Visit Density — {locationFilter.division}</p>
            <p className="analytics-card-sub">Zoomed into its districts — which ones are getting a lot of visits, or not enough.</p>
            <ChoroplethMap
              geojson={zoomedGeoJson}
              valueByShapeName={byDistrict}
              theme={theme}
              highlightShapeName={highlightShape}
            />
          </>
        ) : (
          <>
            <p className="analytics-card-title">Visit Density — Bangladesh</p>
            <p className="analytics-card-sub">Which divisions are getting a lot of visits, or not enough. Pick one to zoom into its districts.</p>
            <ChoroplethMap
              geojson={bdDivisionsGeoJson}
              valueByShapeName={byDivision}
              labelByShapeName={SHAPE_DISPLAY_NAME}
              theme={theme}
            />
          </>
        )}
      </div>

      <div className="analytics-grid" style={{ marginBottom: 16 }}>
        <div className="card card-pad">
          {drillDown.items === null ? (
            <>
              <p className="analytics-card-title">{locationFilter.branch}</p>
              <p className="analytics-card-sub">A single branch is as fine-grained as this gets — {filtered.length} visit(s) here.</p>
            </>
          ) : (
            <>
              <p className="analytics-card-title">Visits by {drillDown.levelLabel}</p>
              <p className="analytics-card-sub">
                {locationFilter.division === "All"
                  ? "Nationwide, broken down by division. Pick a division above to drill into its districts, then areas, then branches."
                  : `Within your current selection, broken down by ${drillDown.levelLabel.toLowerCase()}.`}
              </p>
              <RankedBarChart items={drillDown.items} />
            </>
          )}
        </div>

        <div className="card card-pad">
          {ratingByLocation.items === null ? (
            <>
              <p className="analytics-card-title">Rating — {locationFilter.branch}</p>
              <p className="analytics-card-sub">A single branch is as fine-grained as this gets.</p>
            </>
          ) : ratingByLocation.items.length === 0 ? (
            <>
              <p className="analytics-card-title">Avg Rating by {ratingByLocation.levelLabel}</p>
              <p className="analytics-card-sub">No feedback ratings in this selection yet.</p>
            </>
          ) : (
            <>
              <p className="analytics-card-title">Avg Rating by {ratingByLocation.levelLabel}</p>
              <p className="analytics-card-sub">Combined staff + member stars — which {ratingByLocation.levelLabel.toLowerCase()}s are happiest, or not.</p>
              <RankedBarChart items={ratingByLocation.items} valueSuffix="★" />
            </>
          )}
        </div>
      </div>

      <div className="card card-pad">
        <p className="analytics-card-title">Visits by Reason</p>
        <p className="analytics-card-sub">What kind of work is happening within your current selection.</p>
        <RankedBarChart items={reasonBreakdown} />
      </div>
    </div>
  );
}

/* ============================== COMPLAINT ANALYTICS ============================== */

function ComplaintAnalytics({ complaints, departments, theme }) {
  const [locationFilter, setLocationFilter] = useState(EMPTY_LOCATION_FILTER);
  const [dateFilter, setDateFilter] = useState(EMPTY_DATE_FILTER);

  const filtered = useMemo(
    () => complaints.filter((c) => matchesLocation(c, locationFilter) && matchesDate(c.filedDate, dateFilter)),
    [complaints, locationFilter, dateFilter]
  );

  const deptOrder = departments.length > 0 ? departments.map((d) => d.name) : [...new Set(filtered.map((c) => c.department))];
  const deptColor = {};
  deptOrder.forEach((name, i) => { deptColor[name] = SERIES_COLORS[i % SERIES_COLORS.length]; });

  const byDept = useMemo(() => deptOrder.map((name) => {
    const deptComplaints = filtered.filter((c) => c.department === name);
    const assigned = deptComplaints.filter((c) => c.assignedEmployeeId);
    const fail = assigned.filter((c) => c.escalated).length;
    const success = assigned.length - fail;
    return {
      name,
      color: deptColor[name],
      count: deptComplaints.length,
      success, fail,
      statusCounts: {
        Open: deptComplaints.filter((c) => c.status === "Open").length,
        "In Progress": deptComplaints.filter((c) => c.status === "In Progress" && !c.escalated).length,
        Escalated: deptComplaints.filter((c) => c.escalated && c.status !== "Resolved").length,
        Resolved: deptComplaints.filter((c) => c.status === "Resolved").length,
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }), [filtered, departments]);

  const urgencyCounts = {
    Low: filtered.filter((c) => c.urgency === "Low").length,
    Medium: filtered.filter((c) => c.urgency === "Medium").length,
    High: filtered.filter((c) => c.urgency === "High").length,
  };

  const resolvedAll = filtered.filter((c) => c.status === "Resolved");
  const resolutionRate = filtered.length ? Math.round((resolvedAll.length / filtered.length) * 100) : 0;
  const assignedAll = filtered.filter((c) => c.assignedEmployeeId);
  const failAll = assignedAll.filter((c) => c.escalated).length;
  const failRate = assignedAll.length ? Math.round((failAll / assignedAll.length) * 100) : 0;

  return (
    <div>
      <div className="analytics-filters">
        <LocationFilterBar records={complaints} value={locationFilter} onChange={setLocationFilter} />
        <DateFilterBar value={dateFilter} onChange={setDateFilter} />
      </div>

      <div className="stat-section">
        <div className="stat-row-group">
          <div className="stat-card"><div className="stat-num">{filtered.length}</div><div className="stat-label">Complaints in selection</div></div>
          <div className="stat-card"><div className="stat-num" style={{ color: "var(--success)" }}>{resolutionRate}%</div><div className="stat-label">Resolution Rate</div></div>
          <div className="stat-card"><div className="stat-num" style={{ color: "var(--warning)" }}>{failRate}%</div><div className="stat-label">Missed-Deadline Rate</div></div>
        </div>
      </div>

      <div className="analytics-grid" style={{ marginTop: 16, marginBottom: 16 }}>
        <div className="card card-pad">
          <p className="analytics-card-title">Complaints by Department</p>
          <p className="analytics-card-sub">Where complaint volume concentrates.</p>
          <RankedBarChart items={[...byDept].sort((a, b) => b.count - a.count).map((d) => ({ label: d.name, value: d.count, color: d.color }))} />
        </div>

        <div className="card card-pad">
          <p className="analytics-card-title">Resolution Ratio by Department</p>
          <p className="analytics-card-sub">Success (resolved without missing deadline) vs. Fail (ever escalated).</p>
          <StackedBarChart
            rows={byDept.map((d) => ({ label: d.name, segments: [{ key: "Success", value: d.success }, { key: "Fail", value: d.fail }] }))}
            segmentDefs={[
              { key: "Success", label: "Success", color: "var(--success)" },
              { key: "Fail", label: "Fail (missed deadline)", color: "var(--danger)" },
            ]}
          />
        </div>
      </div>

      <div className="card card-pad" style={{ marginBottom: 16 }}>
        <p className="analytics-card-title">Complaint Status by Department</p>
        <p className="analytics-card-sub">Open vs. in progress vs. escalated vs. resolved, per department.</p>
        <StackedBarChart
          rows={byDept.map((d) => ({
            label: d.name,
            segments: [
              { key: "Open", value: d.statusCounts.Open },
              { key: "In Progress", value: d.statusCounts["In Progress"] },
              { key: "Escalated", value: d.statusCounts.Escalated },
              { key: "Resolved", value: d.statusCounts.Resolved },
            ],
          }))}
          segmentDefs={[
            { key: "Open", label: "Open", color: "var(--danger)" },
            { key: "In Progress", label: "In Progress", color: "var(--info)" },
            { key: "Escalated", label: "Escalated", color: "var(--warning)" },
            { key: "Resolved", label: "Resolved", color: "var(--success)" },
          ]}
        />
      </div>

      <div className="card card-pad">
        <p className="analytics-card-title">Complaints by Urgency</p>
        <p className="analytics-card-sub">Severity mix within your current selection.</p>
        <RankedBarChart items={[
          { label: "High", value: urgencyCounts.High, color: "var(--danger)" },
          { label: "Medium", value: urgencyCounts.Medium, color: "var(--warning)" },
          { label: "Low", value: urgencyCounts.Low, color: "var(--success)" },
        ]} />
      </div>
    </div>
  );
}

/* ============================== TOP-LEVEL BLOCK ============================== */

export default function Analytics({ visits, departments, theme }) {
  const [expanded, setExpanded] = useState(false);
  const [subTab, setSubTab] = useState("visit"); // "visit" | "complaint"

  const complaints = useMemo(() => {
    const out = [];
    visits.forEach((v) => (v.complaints || []).forEach((c) => out.push({
      ...c, visitDate: v.date, division: v.division, region: v.region, area: v.area, location: v.location,
    })));
    return out;
  }, [visits]);

  const summary = useMemo(() => {
    const now = new Date();
    const thisMonthVisits = visits.filter((v) => {
      const d = new Date(v.date);
      return !isNaN(d) && d.getFullYear() === now.getFullYear() && d.getMonth() === now.getMonth();
    }).length;
    const resolved = complaints.filter((c) => c.status === "Resolved").length;
    const resolutionRate = complaints.length ? Math.round((resolved / complaints.length) * 100) : 0;
    return { totalVisits: visits.length, thisMonthVisits, totalComplaints: complaints.length, resolutionRate };
  }, [visits, complaints]);

  return (
    <div className="analytics-block">
      <style>{ANALYTICS_STYLES}</style>

      <div className="analytics-head">
        <div>
          <p className="h-eyebrow" style={{ marginBottom: 0 }}>Management view</p>
          <p style={{ fontSize: 13.5, fontWeight: 700, display: "flex", alignItems: "center", gap: 6, marginTop: 4 }}>
            <BarChart3 size={16} /> Analytics
          </p>
        </div>
        <button className="btn btn-secondary btn-sm" onClick={() => setExpanded((e) => !e)}>
          {expanded ? <>Show less <ChevronUp size={14} /></> : <>Show more <ChevronDown size={14} /></>}
        </button>
      </div>

      <div className="analytics-summary-row">
        <div className="stat-card"><div className="stat-num">{summary.totalVisits}</div><div className="stat-label">Total Visits</div></div>
        <div className="stat-card"><div className="stat-num">{summary.thisMonthVisits}</div><div className="stat-label">Visits This Month</div></div>
        <div className="stat-card"><div className="stat-num">{summary.totalComplaints}</div><div className="stat-label">Total Complaints</div></div>
        <div className="stat-card"><div className="stat-num" style={{ color: "var(--success)" }}>{summary.resolutionRate}%</div><div className="stat-label">Resolution Rate</div></div>
      </div>

      {expanded && (
        <>
          <div className="analytics-subtabs">
            <button className={`analytics-subtab ${subTab === "visit" ? "active" : ""}`} onClick={() => setSubTab("visit")}>
              <MapPin size={13} /> Visit Analytics
            </button>
            <button className={`analytics-subtab ${subTab === "complaint" ? "active" : ""}`} onClick={() => setSubTab("complaint")}>
              <MessageCircle size={13} /> Complaint Analytics
            </button>
          </div>

          {subTab === "visit"
            ? <VisitAnalytics visits={visits} theme={theme} />
            : <ComplaintAnalytics complaints={complaints} departments={departments} theme={theme} />}
        </>
      )}
    </div>
  );
}
