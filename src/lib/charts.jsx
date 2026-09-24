import React, { useState, useRef, useMemo } from "react";
import { geoMercator, geoPath } from "d3-geo";

// Lightweight, dependency-free chart primitives for the Management
// analytics dashboard. Colors are passed in as CSS custom properties
// (defined by the caller) so light/dark theming stays in one place.

export const VIZ_STYLES = `
  .viz-root{ position:relative; }
  .viz-legend{ display:flex; flex-wrap:wrap; gap:14px; margin-top:12px; }
  .viz-legend-item{ display:flex; align-items:center; gap:6px; font-size:12px; color:var(--ink-soft); font-weight:600; }
  .viz-legend-swatch{ width:10px; height:10px; border-radius:3px; flex-shrink:0; }
  .viz-tooltip{ position:absolute; pointer-events:none; background:var(--ink); color:var(--card);
                font-size:11.5px; font-weight:600; padding:6px 10px; border-radius:7px; white-space:nowrap;
                transform:translate(-50%,-100%); margin-top:-8px; z-index:5; box-shadow:0 6px 16px rgba(0,0,0,0.22); }
  .viz-tooltip-row{ display:flex; align-items:center; gap:6px; }
  .viz-tooltip-dot{ width:7px; height:7px; border-radius:50%; flex-shrink:0; }
  .viz-axis-label{ font-size:10px; fill:var(--ink-faint); font-weight:600; }
  .viz-gridline{ stroke:var(--line); stroke-width:1; }
  .viz-empty{ padding:32px; text-align:center; color:var(--ink-faint); font-size:12.5px; }
  .viz-map-shape{ cursor:default; transition:filter .1s ease; }
  .viz-map-shape:hover{ filter:brightness(1.08); }
  .viz-seq-legend{ display:flex; align-items:center; gap:8px; margin-top:10px; font-size:11px; color:var(--ink-faint); font-weight:600; }
  .viz-seq-legend-bar{ width:120px; height:8px; border-radius:4px; }
`;

function Tooltip({ x, y, children }) {
  if (x == null) return null;
  return (
    <div className="viz-tooltip" style={{ left: x, top: y }}>
      {children}
    </div>
  );
}

/* ---------------------------- Legend --------------------------------- */
export function Legend({ items }) {
  return (
    <div className="viz-legend">
      {items.map((it) => (
        <div className="viz-legend-item" key={it.label}>
          <span className="viz-legend-swatch" style={{ background: it.color }} />
          {it.label}
        </div>
      ))}
    </div>
  );
}

/* ------------------------- Multi-series trend line --------------------- */
// series: [{ key, label, color, values: number[] }]  (same length as labels)
export function TrendLineChart({ labels, series, height = 220 }) {
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null); // { idx, x, y }
  const width = 640;
  const padL = 8, padR = 8, padT = 16, padB = 28;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;

  const maxVal = Math.max(1, ...series.flatMap((s) => s.values));
  const n = labels.length;
  const xAt = (i) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yAt = (v) => padT + plotH - (v / maxVal) * plotH;

  const gridSteps = 3;
  const gridVals = Array.from({ length: gridSteps + 1 }, (_, i) => Math.round((maxVal / gridSteps) * i));

  const handleMove = (e) => {
    const rect = wrapRef.current.getBoundingClientRect();
    const relX = ((e.clientX - rect.left) / rect.width) * width;
    let idx = Math.round(((relX - padL) / plotW) * (n - 1));
    idx = Math.max(0, Math.min(n - 1, idx));
    setHover({ idx, x: ((xAt(idx)) / width) * rect.width, y: ((yAt(Math.max(...series.map((s) => s.values[idx])))) / height) * rect.height });
  };

  if (n === 0) return <div className="viz-empty">No data yet.</div>;

  return (
    <div className="viz-root" ref={wrapRef}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}
           onMouseMove={handleMove} onMouseLeave={() => setHover(null)}>
        {gridVals.map((gv, i) => (
          <g key={i}>
            <line className="viz-gridline" x1={padL} x2={width - padR} y1={yAt(gv)} y2={yAt(gv)} />
            <text className="viz-axis-label" x={padL} y={yAt(gv) - 4}>{gv}</text>
          </g>
        ))}

        {labels.map((lb, i) => (
          (i === 0 || i === n - 1 || i === Math.floor(n / 2)) && (
            <text key={lb} className="viz-axis-label" x={xAt(i)} y={height - 8} textAnchor="middle">{lb}</text>
          )
        ))}

        {hover && (
          <line x1={xAt(hover.idx)} x2={xAt(hover.idx)} y1={padT} y2={height - padB}
                stroke="var(--ink-faint)" strokeWidth="1" strokeDasharray="3,3" />
        )}

        {series.map((s) => {
          const d = s.values.map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(v)}`).join(" ");
          return (
            <g key={s.key}>
              <path d={d} fill="none" stroke={s.color} strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
              {s.values.map((v, i) => (
                <circle key={i} cx={xAt(i)} cy={yAt(v)} r={hover && hover.idx === i ? 4.5 : 3}
                        fill={s.color} stroke="var(--card)" strokeWidth="1.5" />
              ))}
            </g>
          );
        })}
      </svg>

      {hover && (
        <Tooltip x={hover.x} y={hover.y}>
          <div style={{ marginBottom: 3, opacity: 0.75 }}>{labels[hover.idx]}</div>
          {series.map((s) => (
            <div className="viz-tooltip-row" key={s.key}>
              <span className="viz-tooltip-dot" style={{ background: s.color }} />
              {s.label}: {s.values[hover.idx]}
            </div>
          ))}
        </Tooltip>
      )}

      <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />
    </div>
  );
}

/* ---------------------------- Ranked bar chart -------------------------- */
// items: [{ label, value, color }]
export function RankedBarChart({ items, valueSuffix = "" }) {
  const wrapRef = useRef(null);
  const [hoverIdx, setHoverIdx] = useState(null);
  const [tooltipPos, setTooltipPos] = useState(null);
  if (!items || items.length === 0) return <div className="viz-empty">No data yet.</div>;

  const maxVal = Math.max(1, ...items.map((it) => it.value));
  const rowH = 34;
  const width = 640;
  const height = items.length * rowH + 8;
  const labelW = 120;
  const barMaxW = width - labelW - 56;

  return (
    <div className="viz-root" ref={wrapRef}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
        {items.map((it, i) => {
          const w = (it.value / maxVal) * barMaxW;
          const y = i * rowH + 6;
          const isHover = hoverIdx === i;
          return (
            <g key={it.label}
               onMouseEnter={(e) => {
                 setHoverIdx(i);
                 const rect = wrapRef.current.getBoundingClientRect();
                 setTooltipPos({ x: ((labelW + w) / width) * rect.width, y: (y / height) * rect.height });
               }}
               onMouseLeave={() => setHoverIdx(null)}
               style={{ cursor: "default" }}>
              <text x={labelW - 10} y={y + 15} textAnchor="end" fontSize="12" fontWeight="650"
                    fill="var(--ink)">{it.label}</text>
              <rect x={labelW} y={y} width={barMaxW} height={20} rx={4} fill="var(--line-soft)" />
              <rect x={labelW} y={y} width={Math.max(4, w)} height={20} rx={4}
                    fill={it.color} opacity={isHover ? 1 : 0.9} />
              <text x={labelW + Math.max(4, w) + 8} y={y + 15} fontSize="11.5" fontWeight="700"
                    fill="var(--ink-soft)">{it.value}{valueSuffix}</text>
            </g>
          );
        })}
      </svg>
      {hoverIdx != null && tooltipPos && (
        <Tooltip x={tooltipPos.x} y={tooltipPos.y}>
          {items[hoverIdx].label}: {items[hoverIdx].value}{valueSuffix}
        </Tooltip>
      )}
    </div>
  );
}

/* --------------------------- Stacked bar chart -------------------------- */
// rows: [{ label, segments: [{ key, value }] }]
// segmentDefs: [{ key, label, color }]  (fixed order, drives legend + stacking order)
export function StackedBarChart({ rows, segmentDefs }) {
  const wrapRef = useRef(null);
  const [hover, setHover] = useState(null); // { rowIdx, segKey, x, y }
  if (!rows || rows.length === 0) return <div className="viz-empty">No data yet.</div>;

  const rowH = 34;
  const width = 640;
  const height = rows.length * rowH + 8;
  const labelW = 100;
  const barMaxW = width - labelW - 50;
  const gap = 2;

  const rowTotal = (row) => row.segments.reduce((s, seg) => s + seg.value, 0);
  const maxTotal = Math.max(1, ...rows.map(rowTotal));

  return (
    <div className="viz-root" ref={wrapRef}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
        {rows.map((row, ri) => {
          const total = rowTotal(row);
          const totalW = (total / maxTotal) * barMaxW;
          let cursorX = labelW;
          const y = ri * rowH + 6;
          return (
            <g key={row.label}>
              <text x={labelW - 10} y={y + 15} textAnchor="end" fontSize="12" fontWeight="650" fill="var(--ink)">
                {row.label}
              </text>
              <rect x={labelW} y={y} width={barMaxW} height={20} rx={4} fill="var(--line-soft)" />
              {row.segments.map((seg) => {
                if (seg.value === 0) return null;
                const def = segmentDefs.find((d) => d.key === seg.key);
                const segW = Math.max(0, (seg.value / maxTotal) * barMaxW - gap);
                const x = cursorX;
                cursorX += (seg.value / maxTotal) * barMaxW;
                const isHover = hover && hover.rowIdx === ri && hover.segKey === seg.key;
                return (
                  <rect key={seg.key} x={x} y={y} width={Math.max(2, segW)} height={20} rx={3}
                        fill={def ? def.color : "var(--ink-faint)"} opacity={isHover ? 1 : 0.92}
                        onMouseEnter={(e) => {
                          const rect = wrapRef.current.getBoundingClientRect();
                          setHover({ rowIdx: ri, segKey: seg.key, x: ((x + segW / 2) / width) * rect.width, y: (y / height) * rect.height });
                        }}
                        onMouseLeave={() => setHover(null)} />
                );
              })}
              <text x={labelW + totalW + 8} y={y + 15} fontSize="11" fontWeight="700" fill="var(--ink-faint)">
                {total}
              </text>
            </g>
          );
        })}
      </svg>

      {hover && (() => {
        const row = rows[hover.rowIdx];
        const seg = row.segments.find((s) => s.key === hover.segKey);
        const def = segmentDefs.find((d) => d.key === hover.segKey);
        return (
          <Tooltip x={hover.x} y={hover.y}>
            <div className="viz-tooltip-row">
              <span className="viz-tooltip-dot" style={{ background: def?.color }} />
              {row.label} · {def?.label}: {seg.value}
            </div>
          </Tooltip>
        );
      })()}

      <Legend items={segmentDefs.map((d) => ({ label: d.label, color: d.color }))} />
    </div>
  );
}

/* ------------------------------ Choropleth map --------------------------- */
// geojson: a FeatureCollection whose features carry `properties.shapeName`.
// valueByShapeName: { [shapeName]: number }. labelByShapeName: optional
// display-name override (the source geojson's names don't always match this
// app's own division spelling).
const SEQ_RAMP = {
  light: { lo: [205, 226, 251], hi: [13, 54, 107] },   // #cde2fb -> #0d366b
  dark: { lo: [42, 48, 64], hi: [57, 135, 229] },       // near dark card -> #3987e5
};

export function ChoroplethMap({ geojson, valueByShapeName, labelByShapeName, theme, height = 320, highlightShapeName }) {
  const width = 420;
  const projection = useMemo(
    () => geoMercator().fitSize([width - 8, height - 8], geojson),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [geojson, height]
  );
  const pathGen = useMemo(() => geoPath(projection), [projection]);
  const [hover, setHover] = useState(null);
  const wrapRef = useRef(null);

  const maxVal = Math.max(1, ...Object.values(valueByShapeName));
  const ramp = SEQ_RAMP[theme === "dark" ? "dark" : "light"];
  const colorFor = (name) => {
    const v = valueByShapeName[name] || 0;
    if (v === 0) return "var(--map-empty)";
    const t = v / maxVal;
    const rgb = ramp.lo.map((c, i) => Math.round(c + (ramp.hi[i] - c) * t));
    return `rgb(${rgb.join(",")})`;
  };
  const displayName = (name) => (labelByShapeName && labelByShapeName[name]) || name;

  return (
    <div className="viz-root" ref={wrapRef}>
      <svg viewBox={`0 0 ${width} ${height}`} width="100%" height={height}>
        {geojson.features.map((f) => {
          const name = f.properties.shapeName;
          const [cx, cy] = pathGen.centroid(f);
          const isHighlight = highlightShapeName && name === highlightShapeName;
          return (
            <path
              key={name}
              className="viz-map-shape"
              d={pathGen(f)}
              fill={colorFor(name)}
              stroke={isHighlight ? "var(--magenta)" : "var(--map-line)"}
              strokeWidth={isHighlight ? 2.5 : 1}
              onMouseEnter={() => {
                const rect = wrapRef.current.getBoundingClientRect();
                setHover({ name, value: valueByShapeName[name] || 0, x: (cx / width) * rect.width, y: (cy / height) * rect.height });
              }}
              onMouseLeave={() => setHover(null)}
            />
          );
        })}
      </svg>

      {hover && (
        <Tooltip x={hover.x} y={hover.y}>
          {displayName(hover.name)}: {hover.value}
        </Tooltip>
      )}

      <div className="viz-seq-legend">
        <span>0</span>
        <span className="viz-seq-legend-bar" style={{
          background: `linear-gradient(to right, rgb(${ramp.lo.join(",")}), rgb(${ramp.hi.join(",")}))`,
        }} />
        <span>{maxVal}</span>
        <span style={{ marginLeft: 8 }}>visits · gray = no data</span>
      </div>
    </div>
  );
}
