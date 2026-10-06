import React, { useEffect, useMemo, useState } from "react";

// Lightweight, dependency-free chart primitives. Each chart measures its own
// container and draws at real pixel size (no scaled-down viewBox), so labels
// stay readable on phones. Styles live in src/styles/brac.css (.viz-*).

function useWidth(fallback = 640) {
  // A callback ref, because a chart's container often mounts *after* the first
  // render (empty state → data arrives). A plain ref + mount effect would never
  // measure it and the chart would stay at the fallback width.
  const [el, setEl] = useState(null);
  const [w, setW] = useState(fallback);
  const ref = useMemo(() => {
    const f = (node) => { f.current = node; setEl(node); };
    f.current = null;
    return f;
  }, []);
  useEffect(() => {
    if (!el) return;
    const measure = () => setW(Math.round(el.getBoundingClientRect().width) || fallback);
    measure();
    if (!("ResizeObserver" in window)) return;
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    return () => ro.disconnect();
  }, [el, fallback]);
  return [ref, w];
}

const clip = (s, n) => (s.length > n ? s.slice(0, Math.max(1, n - 1)) + "…" : s);

function Tooltip({ x, y, children }) {
  if (x == null) return null;
  return <div className="viz-tooltip" style={{ left: x, top: y }}>{children}</div>;
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
export function TrendLineChart({ labels, series, height = 220, showLegend = true }) {
  const [wrapRef, width] = useWidth();
  const [hover, setHover] = useState(null);
  const padL = 30, padR = 12, padT = 16, padB = 28;
  const plotW = width - padL - padR;
  const plotH = height - padT - padB;
  const maxVal = Math.max(1, ...series.flatMap((s) => s.values));
  const n = labels.length;
  const xAt = (i) => padL + (n <= 1 ? plotW / 2 : (i / (n - 1)) * plotW);
  const yAt = (v) => padT + plotH - (v / maxVal) * plotH;
  const gridVals = Array.from({ length: 4 }, (_, i) => Math.round((maxVal / 3) * i));

  const handleMove = (e) => {
    const rect = wrapRef.current.getBoundingClientRect();
    const rel = e.clientX - rect.left;
    let idx = Math.round(((rel - padL) / plotW) * (n - 1));
    idx = Math.max(0, Math.min(n - 1, idx));
    setHover({ idx, x: xAt(idx), y: yAt(Math.max(...series.map((s) => s.values[idx]))) });
  };

  if (n === 0) return <div className="viz-empty">No data yet.</div>;

  return (
    <div className="viz-root" ref={wrapRef}>
      <svg width={width} height={height} onMouseMove={handleMove} onMouseLeave={() => setHover(null)} onTouchMove={(e) => handleMove(e.touches[0])}>
        {gridVals.map((gv, i) => (
          <g key={i}>
            <line className="viz-gridline" x1={padL} x2={width - padR} y1={yAt(gv)} y2={yAt(gv)} />
            <text className="viz-axis-label" x={padL - 6} y={yAt(gv) + 3} textAnchor="end">{gv}</text>
          </g>
        ))}
        {labels.map((lb, i) => (
          <text key={lb + i} className="viz-axis-label" x={xAt(i)} y={height - 8} textAnchor="middle">{lb}</text>
        ))}
        {hover && <line x1={xAt(hover.idx)} x2={xAt(hover.idx)} y1={padT} y2={height - padB} stroke="var(--ink-faint)" strokeWidth="1" strokeDasharray="3,3" />}
        {series.map((s) => {
          const d = s.values.map((v, i) => `${i === 0 ? "M" : "L"} ${xAt(i)} ${yAt(v)}`).join(" ");
          return (
            <g key={s.key}>
              <path className="line-draw" d={d} fill="none" stroke={s.color} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
              {s.values.map((v, i) => (
                <circle key={i} cx={xAt(i)} cy={yAt(v)} r={hover && hover.idx === i ? 5 : 3.2} fill={s.color} stroke="var(--card)" strokeWidth="1.8" />
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
      {showLegend && series.length > 1 && <Legend items={series.map((s) => ({ label: s.label, color: s.color }))} />}
    </div>
  );
}

/* ---------------------------- Ranked bar chart -------------------------- */
// items: [{ label, value, color }]
export function RankedBarChart({ items, valueSuffix = "", max: maxProp, wide = false }) {
  const [wrapRef, width] = useWidth();
  const [hover, setHover] = useState(null);
  if (!items || items.length === 0) return <div className="viz-empty">No data yet.</div>;

  const maxVal = Math.max(1, maxProp || 0, ...items.map((it) => it.value));
  const rowH = 36;
  const height = items.length * rowH + 6;
  // `wide` is for long labels such as "Finance · Accounts & Audit"
  const labelW = wide ? Math.min(240, Math.max(112, Math.round(width * 0.42))) : Math.min(132, Math.max(84, Math.round(width * 0.36)));
  const valW = 46;
  const barMaxW = Math.max(40, width - labelW - valW - 8);
  const fs = width < 380 ? 11 : 12;

  return (
    <div className="viz-root" ref={wrapRef}>
      <svg width={width} height={height}>
        {items.map((it, i) => {
          const w = Math.max(5, (it.value / maxVal) * barMaxW);
          const y = i * rowH + 6;
          return (
            <g key={it.label}
               onMouseEnter={() => setHover({ i, x: labelW + w, y })}
               onMouseLeave={() => setHover(null)}
               onClick={() => setHover({ i, x: labelW + w, y })}>
              <title>{it.label}</title>
              <text x={labelW - 10} y={y + 15} textAnchor="end" fontSize={fs} fontWeight="650" fill="var(--ink)">
                {clip(it.label, Math.floor((labelW - 10) / (fs * 0.56)))}
              </text>
              <rect x={labelW} y={y} width={barMaxW} height={22} rx={11} fill="var(--line-soft)" />
              <rect className="bar-grow" style={{ "--i": i }} x={labelW} y={y} width={w} height={22} rx={11}
                    fill={it.color} opacity={hover && hover.i === i ? 1 : 0.92} />
              <text x={labelW + w + 8} y={y + 15} fontSize={fs} fontWeight="750" fill="var(--ink-soft)">{it.value}{valueSuffix}</text>
            </g>
          );
        })}
      </svg>
      {hover && (
        <Tooltip x={hover.x} y={hover.y}>
          {items[hover.i].label}: {items[hover.i].value}{valueSuffix}
        </Tooltip>
      )}
    </div>
  );
}

/* --------------------------- Stacked bar chart -------------------------- */
// rows: [{ label, segments: [{ key, value }] }]
// segmentDefs: [{ key, label, color }]  (fixed order, drives legend + stacking order)
export function StackedBarChart({ rows, segmentDefs }) {
  const [wrapRef, width] = useWidth();
  const [hover, setHover] = useState(null);
  if (!rows || rows.length === 0) return <div className="viz-empty">No data yet.</div>;

  const rowH = 36;
  const height = rows.length * rowH + 6;
  const labelW = Math.min(112, Math.max(78, Math.round(width * 0.3)));
  const totW = 34;
  const barMaxW = Math.max(40, width - labelW - totW - 6);
  const gap = 2;
  const fs = width < 380 ? 11 : 12;

  const rowTotal = (row) => row.segments.reduce((s, seg) => s + seg.value, 0);
  const maxTotal = Math.max(1, ...rows.map(rowTotal));

  return (
    <div className="viz-root" ref={wrapRef}>
      <svg width={width} height={height}>
        {rows.map((row, ri) => {
          const total = rowTotal(row);
          const totalW = (total / maxTotal) * barMaxW;
          let cursorX = labelW;
          const y = ri * rowH + 6;
          return (
            <g key={row.label}>
              <text x={labelW - 10} y={y + 15} textAnchor="end" fontSize={fs} fontWeight="650" fill="var(--ink)">
                {clip(row.label, Math.floor((labelW - 10) / (fs * 0.56)))}
              </text>
              <rect x={labelW} y={y} width={barMaxW} height={22} rx={11} fill="var(--line-soft)" />
              {row.segments.map((seg) => {
                if (seg.value === 0) return null;
                const def = segmentDefs.find((d) => d.key === seg.key);
                const rawW = (seg.value / maxTotal) * barMaxW;
                const x = cursorX;
                cursorX += rawW;
                const isHover = hover && hover.rowIdx === ri && hover.segKey === seg.key;
                return (
                  <rect key={seg.key} className="bar-grow" style={{ "--i": ri }} x={x} y={y} width={Math.max(3, rawW - gap)} height={22} rx={5}
                        fill={def ? def.color : "var(--ink-faint)"} opacity={isHover ? 1 : 0.92}
                        onMouseEnter={() => setHover({ rowIdx: ri, segKey: seg.key, x: x + rawW / 2, y })}
                        onMouseLeave={() => setHover(null)}
                        onClick={() => setHover({ rowIdx: ri, segKey: seg.key, x: x + rawW / 2, y })} />
                );
              })}
              <text x={labelW + totalW + 8} y={y + 15} fontSize={fs - 1} fontWeight="750" fill="var(--ink-faint)">{total}</text>
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
