import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { geoMercator, geoPath } from "d3-geo";
import { Plus, Minus, Crosshair, ChevronRight, X, ExternalLink } from "lucide-react";
import { usePrefersReducedMotion } from "./ui";
import {
  STATUS_META, toShapeName, divisionLabelFromShape, districtShapeName, districtFromShape,
  DISTRICTS_BY_DIVISION, timeAgo,
} from "./offices";

/**
 * Zoomable Bangladesh map. Zoom levels follow the location filter:
 *   country → division (its districts appear) → district (office pins and area
 *   clusters) → area → branch.
 * Fills show either coverage (share of offices visited within the target
 * window) or visit volume. Pins are status-coded by shape as well as colour
 * (circle = on track, diamond = overdue, crossed circle = never visited).
 * Labels are level-of-detail: division names at country level, districts and
 * area pills once zoomed in, branch names last — a collision pass drops any
 * label that would overlap another so the map never gets crowded.
 */
const W = 600, H = 600;
const EMPTY = { division: "All", region: "All", area: "All", branch: "All" };
const SHORT = { Chittagong: "Chattogram", Rajshani: "Rajshahi" };

const lerp = (a, b, t) => a + (b - a) * t;
const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
const fitBounds = ([[x0, y0], [x1, y1]], pad = 36, maxK = 60) => {
  const dx = Math.max(x1 - x0, 1e-3), dy = Math.max(y1 - y0, 1e-3);
  const k = Math.min(maxK, (W - 2 * pad) / dx, (H - 2 * pad) / dy);
  return { k, x: W / 2 - (k * (x0 + x1)) / 2, y: H / 2 - (k * (y0 + y1)) / 2 };
};
const mixCam = (a, b, t) => {
  const ca = { x: (W / 2 - a.x) / a.k, y: (H / 2 - a.y) / a.k };
  const cb = { x: (W / 2 - b.x) / b.k, y: (H / 2 - b.y) / b.k };
  const k = Math.exp(lerp(Math.log(a.k), Math.log(b.k), t));
  return { k, x: W / 2 - lerp(ca.x, cb.x, t) * k, y: H / 2 - lerp(ca.y, cb.y, t) * k };
};
const hash = (s) => { let h = 0; for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0; return Math.abs(h); };

const covFill = (s) => {
  if (!s || s.total === 0) return "var(--map-empty)";
  if (s.pct >= 80) return "color-mix(in srgb, var(--success) 70%, var(--card))";
  if (s.pct >= 50) return "color-mix(in srgb, var(--warning) 68%, var(--card))";
  return "color-mix(in srgb, var(--danger) 62%, var(--card))";
};
const visFill = (v, max) => (v > 0 ? `color-mix(in srgb, var(--seq-hi) ${Math.round(16 + 84 * (v / Math.max(max, 1)))}%, var(--seq-lo))` : "var(--map-empty)");

function tally(offices, keyFn) {
  const out = {};
  offices.forEach((o) => {
    const k = keyFn(o);
    const s = (out[k] = out[k] || { total: 0, ok: 0, stale: 0, never: 0 });
    s.total++; s[o.status]++;
  });
  Object.values(out).forEach((s) => { s.pct = s.total ? Math.round((s.ok / s.total) * 100) : 0; });
  return out;
}

export default function InteractiveMap({
  divisions, districts, offices, mode: modeProp, onModeChange, filter = EMPTY, onFilter, onOpenBranch,
  visitValues = { division: {}, district: {} }, targetDays = 90, showModeToggle = true,
  // false = a visits-only map: no coverage colouring, status-coded pins, "% on track" figures or Coverage switch
  showCoverage = true,
}) {
  const reduced = usePrefersReducedMotion();
  const mode = showCoverage ? modeProp : "visits";
  const wrapRef = useRef(null);
  const svgRef = useRef(null);
  const [pxW, setPxW] = useState(600);
  const [hover, setHover] = useState(null);   // { x, y, title, sub }
  const [sel, setSel] = useState(null);       // selected office key
  const [dragging, setDragging] = useState(false);

  // ---- static geometry ----------------------------------------------------
  const geo = useMemo(() => {
    const proj = geoMercator().fitExtent([[40, 30], [W - 40, H - 54]], divisions);
    const gen = geoPath(proj);
    const mk = (f) => ({ name: f.properties.shapeName, d: gen(f), bounds: gen.bounds(f), centroid: gen.centroid(f) });
    return {
      proj, country: gen.bounds(divisions),
      divs: divisions.features.map(mk),
      dists: districts.features.map(mk),
      bay: proj([90.55, 20.05]),
    };
  }, [divisions, districts]);

  const distByShape = useMemo(() => Object.fromEntries(geo.dists.map((d) => [d.name, d])), [geo]);
  const divByShape = useMemo(() => Object.fromEntries(geo.divs.map((d) => [d.name, d])), [geo]);

  const pins = useMemo(() => offices.map((o) => {
    let x, y, approx = false;
    if (Number.isFinite(o.lat) && Number.isFinite(o.lng)) { const p = geo.proj([o.lng, o.lat]); x = p[0]; y = p[1]; }
    else {
      const dc = distByShape[districtShapeName(o.district)];
      const h = hash(o.name);
      x = (dc ? dc.centroid[0] : W / 2) + ((h % 17) - 8) * 0.9; y = (dc ? dc.centroid[1] : H / 2) + (((h >> 5) % 17) - 8) * 0.9; approx = true;
    }
    return { o, x, y, approx };
  }), [offices, geo, distByShape]);

  const divStats = useMemo(() => tally(offices, (o) => toShapeName(o.division)), [offices]);
  const distStats = useMemo(() => tally(offices, (o) => districtShapeName(o.district)), [offices]);

  // ---- camera ---------------------------------------------------------
  const targetCam = useMemo(() => {
    if (filter.branch !== "All") {
      const p = pins.find((q) => q.o.name === filter.branch && (filter.region === "All" || q.o.district === filter.region));
      if (p) { const w = 16; return fitBounds([[p.x - w, p.y - w], [p.x + w, p.y + w]], 0); }
    }
    if (filter.area !== "All") {
      const ps = pins.filter((q) => q.o.area === filter.area && (filter.region === "All" || q.o.district === filter.region));
      if (ps.length) {
        const xs = ps.map((q) => q.x), ys = ps.map((q) => q.y);
        const x0 = Math.min(...xs), x1 = Math.max(...xs), y0 = Math.min(...ys), y1 = Math.max(...ys);
        const m = Math.max(0, 22 - (x1 - x0)) / 2, n = Math.max(0, 22 - (y1 - y0)) / 2;
        // generous padding keeps outlying branches clear of the edges and the legend
        return fitBounds([[x0 - m, y0 - n], [x1 + m, y1 + n]], 125);
      }
    }
    if (filter.region !== "All") { const d = distByShape[districtShapeName(filter.region)]; if (d) return fitBounds(d.bounds, 40); }
    if (filter.division !== "All") { const d = divByShape[toShapeName(filter.division)]; if (d) return fitBounds(d.bounds, 34); }
    return fitBounds(geo.country, 14);
  }, [filter, pins, distByShape, divByShape, geo]);

  const [cam, setCam] = useState(targetCam);
  const camRef = useRef(targetCam);
  const rafRef = useRef(0);
  const firstRef = useRef(true);

  const setBoth = (c) => { camRef.current = c; setCam(c); };
  const animateTo = useCallback((to, dur = 850) => {
    cancelAnimationFrame(rafRef.current);
    if (reduced) { setBoth(to); return; }
    const from = camRef.current, t0 = performance.now();
    const step = (now) => {
      const t = Math.min(1, (now - t0) / dur);
      setBoth(mixCam(from, to, ease(t)));
      if (t < 1) rafRef.current = requestAnimationFrame(step);
    };
    rafRef.current = requestAnimationFrame(step);
  }, [reduced]);

  const targetKey = `${filter.division}|${filter.region}|${filter.area}|${filter.branch}|${pins.length}`;
  useEffect(() => {
    if (firstRef.current) { firstRef.current = false; setBoth(targetCam); return; }
    animateTo(targetCam);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targetKey]);
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

  // container width → px-per-unit, so pins/labels keep a constant on-screen size
  useEffect(() => {
    if (!wrapRef.current || !("ResizeObserver" in window)) return;
    const ro = new ResizeObserver(([e]) => setPxW(e.contentRect.width || 600));
    ro.observe(wrapRef.current);
    return () => ro.disconnect();
  }, []);
  const s = pxW / W;                      // screen px per viewBox unit
  const unit = (px) => px / (cam.k * s);  // px → world units at the current zoom

  // ---- pan / zoom -------------------------------------------------------
  const dragRef = useRef(null);
  const movedRef = useRef(false);
  const onMouseDown = (e) => {
    if (e.button !== 0) return;
    cancelAnimationFrame(rafRef.current);
    dragRef.current = { x: e.clientX, y: e.clientY, cam: camRef.current };
    movedRef.current = false;
  };
  useEffect(() => {
    const move = (e) => {
      const d = dragRef.current; if (!d) return;
      const dx = e.clientX - d.x, dy = e.clientY - d.y;
      if (!movedRef.current && Math.hypot(dx, dy) < 4) return;
      movedRef.current = true; setDragging(true); setHover(null);
      setBoth({ k: d.cam.k, x: d.cam.x + dx / s, y: d.cam.y + dy / s });
    };
    const up = () => { dragRef.current = null; setDragging(false); setTimeout(() => { movedRef.current = false; }, 0); };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
    return () => { window.removeEventListener("mousemove", move); window.removeEventListener("mouseup", up); };
  }, [s]);

  const zoomAt = useCallback((factor, cx = W / 2, cy = H / 2, animate = false) => {
    const c = camRef.current;
    const k = Math.max(0.6, Math.min(80, c.k * factor));
    const to = { k, x: cx - ((cx - c.x) / c.k) * k, y: cy - ((cy - c.y) / c.k) * k };
    if (animate) animateTo(to, 380); else setBoth(to);
  }, [animateTo]);

  useEffect(() => {   // ctrl/⌘ + wheel zooms at the cursor; plain wheel still scrolls the page
    const el = svgRef.current; if (!el) return;
    const onWheel = (e) => {
      if (!(e.ctrlKey || e.metaKey)) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      zoomAt(Math.exp(-e.deltaY * 0.0022), ((e.clientX - r.left) / r.width) * W, ((e.clientY - r.top) / r.height) * H);
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [zoomAt]);

  // ---- interaction -------------------------------------------------------
  const guard = (fn) => (e) => { if (movedRef.current) return; fn(e); };
  const filterFrom = (patch) => onFilter && onFilter({ ...EMPTY, ...patch });
  const up = () => {   // click empty water: step back out one level
    if (filter.branch !== "All") filterFrom({ division: filter.division, region: filter.region, area: filter.area });
    else if (filter.area !== "All") filterFrom({ division: filter.division, region: filter.region });
    else if (filter.region !== "All") filterFrom({ division: filter.division });
    else if (filter.division !== "All") filterFrom({});
  };
  const pointer = (e) => {
    const r = wrapRef.current.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const showTip = (e, title, sub) => { if (dragging) return; setHover({ ...pointer(e), title, sub }); };
  const moveTip = (e) => setHover((h) => (h ? { ...h, ...pointer(e) } : h));

  // ---- derived render data ----------------------------------------------
  const divFocus = filter.division !== "All" ? toShapeName(filter.division) : null;
  const distFocus = filter.region !== "All" ? districtShapeName(filter.region) : null;
  const level = filter.branch !== "All" ? 4 : filter.area !== "All" ? 3 : filter.region !== "All" ? 2 : filter.division !== "All" ? 1 : 0;
  const visMax = Math.max(1, ...Object.values(visitValues.division || {}), ...Object.values(visitValues.district || {}));
  const districtsShown = useMemo(
    () => (divFocus ? geo.dists.filter((d) => (DISTRICTS_BY_DIVISION[divFocus] || []).includes(d.name)) : []),
    [divFocus, geo]
  );

  const visiblePins = useMemo(() => pins.filter((p) => {
    if (level >= 1 && toShapeName(p.o.division) !== divFocus) return false;
    if (level >= 2 && p.o.district !== filter.region) return false;
    return true;
  }), [pins, level, divFocus, filter.region]);

  const ordered = useMemo(
    () => [...visiblePins].sort((a, b) => ["ok", "stale", "never"].indexOf(a.o.status) - ["ok", "stale", "never"].indexOf(b.o.status)),
    [visiblePins]
  );

  const areaClusters = useMemo(() => {
    if (level < 1 || level > 2) return [];
    const m = {};
    visiblePins.forEach((p) => { (m[p.o.area] = m[p.o.area] || []).push(p); });
    return Object.entries(m).map(([area, ps]) => ({
      area, n: ps.length, district: ps[0].o.district,
      x: ps.reduce((a, p) => a + p.x, 0) / ps.length, y: ps.reduce((a, p) => a + p.y, 0) / ps.length,
      worst: ps.some((p) => p.o.status === "never") ? "never" : ps.some((p) => p.o.status === "stale") ? "stale" : "ok",
    }));
  }, [level, visiblePins]);

  const pinR = level >= 3 ? 8 : level === 2 ? 7 : level === 1 ? 5.5 : 3.6;

  // ---- label plan: greedy, priority-ordered, collision-checked in screen px --
  const kq = Math.round(cam.k * 4) / 4 || cam.k;
  const labels = useMemo(() => {
    const sc = kq * s;                       // px per world unit
    const placed = [];
    const hit = (r) => placed.some((q) => !(r.x1 < q.x0 || r.x0 > q.x1 || r.y1 < q.y0 || r.y0 > q.y1));
    const tw = (txt, px, w = 0.6) => txt.length * px * w;
    const out = { texts: [], pills: [], pinLabels: [] };

    // pins are obstacles
    visiblePins.forEach((p) => { const r = pinR * 1.5; placed.push({ x0: p.x * sc - r, x1: p.x * sc + r, y0: p.y * sc - r, y1: p.y * sc + r }); });

    const tryText = (id, wx, wy, text, px, extra = {}) => {
      const w = tw(text, px, extra.wide ? 0.72 : 0.58), h = px * (extra.sub ? 2.5 : 1.25);
      const cx = wx * sc, cy = wy * sc;
      const r = { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 };
      if (hit(r)) return false;
      placed.push(r);
      out.texts.push({ id, x: wx, y: wy, text, px, ...extra });
      return true;
    };

    if (level === 0) {
      // Division names are the point of the national view, so they are never
      // dropped: each one takes the least cluttered spot near its centroid.
      // on a phone-sized map the name alone is enough — colour already carries the %
      const compact = s * W < 520;
      const px = compact ? 9.5 : 11.5, h = px * (compact ? 1.5 : 2.5);
      const nudges = [[0, 0], [0, -26], [0, 26], [-30, 0], [30, 0], [-30, -26], [30, -26], [-30, 26], [30, 26], [0, -48], [0, 48]];
      const clash = (r) => placed.reduce((n, q) => n + (!(r.x1 < q.x0 || r.x0 > q.x1 || r.y1 < q.y0 || r.y0 > q.y1) ? 1 : 0), 0);
      geo.divs.forEach((d) => {
        const st = divStats[d.name];
        const val = mode === "coverage" ? (st ? `${st.pct}% on track` : "no offices") : `${(visitValues.division || {})[d.name] || 0} visits`;
        const text = (SHORT[d.name] || d.name).toUpperCase();
        const w = tw(text, px, 0.72);
        let best = null;
        nudges.forEach(([nx, ny]) => {
          const cx = d.centroid[0] * sc + nx, cy = d.centroid[1] * sc + ny;
          const r = { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 };
          const score = clash(r) * 10 + Math.abs(nx) * 0.02 + Math.abs(ny) * 0.02;
          if (!best || score < best.score) best = { score, r, nx, ny };
        });
        placed.push(best.r);
        out.texts.push({ id: `div-${d.name}`, x: d.centroid[0] + best.nx / sc, y: d.centroid[1] + best.ny / sc, text, px, cls: "div", sub: compact ? undefined : val, wide: true });
      });
    }

    if (level >= 1) {
      // districts that have offices first, then the rest
      const withOff = districtsShown.filter((d) => distStats[d.name]);
      const without = districtsShown.filter((d) => !distStats[d.name]);
      const sel = distFocus;
      if (level === 1) {
        withOff.forEach((d) => tryText(`dist-${d.name}`, d.centroid[0], d.centroid[1] + 0, districtFromShape(d.name), 11, { cls: "dist" }));
        // area pills (priority below district names, above empty districts)
        areaClusters.forEach((c) => {
          const text = `${c.area.replace(/ Area$/, "")} · ${c.n}`;
          const w = tw(text, 11, 0.6) + 26, h = 24;
          for (const dy of [-26, 26]) {
            const cx = c.x * sc, cy = c.y * sc + dy;
            const r = { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 };
            if (!hit(r)) { placed.push(r); out.pills.push({ id: `pill-${c.district}-${c.area}`, area: c.area, text, x: c.x, y: c.y, dy, w, h, worst: c.worst }); break; }
          }
        });
        without.forEach((d) => tryText(`dist-${d.name}`, d.centroid[0], d.centroid[1], districtFromShape(d.name), 9.5, { cls: "dist faint" }));
        // neighbouring divisions, faint
        geo.divs.filter((d) => d.name !== divFocus).forEach((d) => tryText(`ndiv-${d.name}`, d.centroid[0], d.centroid[1], (SHORT[d.name] || d.name).toUpperCase(), 9.5, { cls: "div faint", wide: true }));
      } else {
        // district level: area pills first, then branch names, then neighbouring district names
        areaClusters.forEach((c) => {
          const text = `${c.area.replace(/ Area$/, "")} · ${c.n}`;
          const w = tw(text, 11, 0.6) + 26, h = 24;
          for (const dy of [-28, 28, -52, 52]) {
            const cx = c.x * sc, cy = c.y * sc + dy;
            const r = { x0: cx - w / 2, x1: cx + w / 2, y0: cy - h / 2, y1: cy + h / 2 };
            if (!hit(r)) { placed.push(r); out.pills.push({ id: `pill-${c.district}-${c.area}`, area: c.area, text, x: c.x, y: c.y, dy, w, h, worst: c.worst }); break; }
          }
        });
        districtsShown.filter((d) => d.name !== sel).forEach((d) => tryText(`dist-${d.name}`, d.centroid[0], d.centroid[1], districtFromShape(d.name), 10, { cls: "dist faint" }));
      }
    }

    // branch names, most urgent first (district level and deeper)
    if (level >= 2) {
      const prio = { never: 0, stale: 1, ok: 2 };
      [...visiblePins].sort((a, b) => prio[a.o.status] - prio[b.o.status]).forEach((p) => {
        const text = p.o.name.replace(/ Branch$/, "");
        const px = 10.5, w = tw(text, px, 0.58), h = px * 1.3, rr = pinR * 1.5, sx = p.x * sc, sy = p.y * sc;
        const cand = [
          // rects start 1px clear of the pin's own obstacle box, which would otherwise always count as a hit
          { dx: 0, dy: -(rr + 4), a: "middle", r: { x0: sx - w / 2, x1: sx + w / 2, y0: sy - rr - h - 3, y1: sy - rr - 1 } },
          { dx: 0, dy: rr + h - 1, a: "middle", r: { x0: sx - w / 2, x1: sx + w / 2, y0: sy + rr + 1, y1: sy + rr + h + 3 } },
          { dx: rr + 4, dy: 3.5, a: "start", r: { x0: sx + rr + 1, x1: sx + rr + w + 7, y0: sy - h / 2, y1: sy + h / 2 } },
          { dx: -(rr + 4), dy: 3.5, a: "end", r: { x0: sx - rr - w - 7, x1: sx - rr - 1, y0: sy - h / 2, y1: sy + h / 2 } },
        ];
        const c = cand.find((q) => !hit(q.r));
        if (c) { placed.push(c.r); out.pinLabels.push({ id: p.o.key, x: p.x, y: p.y, text, dx: c.dx, dy: c.dy, a: c.a }); }
      });
    }
    return out;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kq, s, level, mode, divFocus, distFocus, geo, visiblePins, areaClusters, districtsShown, divStats, distStats, visitValues, pinR]);

  const selPin = sel ? pins.find((p) => p.o.key === sel) : null;
  const crumbs = [
    { label: "Bangladesh", patch: {} },
    ...(filter.division !== "All" ? [{ label: filter.division, patch: { division: filter.division } }] : []),
    ...(filter.region !== "All" ? [{ label: filter.region, patch: { division: filter.division, region: filter.region } }] : []),
    ...(filter.area !== "All" ? [{ label: filter.area, patch: { division: filter.division, region: filter.region, area: filter.area } }] : []),
    ...(filter.branch !== "All" ? [{ label: filter.branch, patch: { ...filter } }] : []),
  ];

  return (
    <div className="map-wrap" ref={wrapRef} onMouseLeave={() => setHover(null)}>
      <svg ref={svgRef} className={`map-svg ${dragging ? "dragging" : ""}`} viewBox={`0 0 ${W} ${H}`} onMouseDown={onMouseDown}
           role="img" aria-label="Map of Bangladesh showing office coverage">
        <rect width={W} height={H} fill="transparent" onClick={guard(up)} />
        <g transform={`translate(${cam.x} ${cam.y}) scale(${cam.k})`}>
          {geo.bay && level === 0 && (
            <text className="map-water-label" x={geo.bay[0]} y={geo.bay[1]} textAnchor="middle" style={{ fontSize: unit(11), letterSpacing: "0.5em" }}>BAY OF BENGAL</text>
          )}

          {/* divisions */}
          <g className="map-land" style={{ animation: reduced ? undefined : "fadein .8s ease both" }}>
            {geo.divs.map((d) => {
              const st = divStats[d.name];
              const focused = divFocus === d.name;
              const fill = mode === "coverage" ? covFill(st) : visFill((visitValues.division || {})[d.name] || 0, visMax);
              return (
                <path key={d.name} d={d.d} className="map-shape" role="button" tabIndex={0}
                      aria-label={`${divisionLabelFromShape(d.name)}: ${st ? `${st.total} offices${showCoverage ? `, ${st.pct}% on track` : ""}` : "no offices"}`}
                      style={{ fill: focused ? "var(--map-empty)" : fill, opacity: divFocus && !focused ? 0.34 : 1, stroke: "var(--card)", strokeWidth: 1.4 }}
                      onClick={guard(() => (!focused ? filterFrom({ division: divisionLabelFromShape(d.name) }) : null))}
                      onKeyDown={(e) => e.key === "Enter" && filterFrom({ division: divisionLabelFromShape(d.name) })}
                      onMouseEnter={(e) => showTip(e, divisionLabelFromShape(d.name), st ? `${st.total} offices${showCoverage ? ` · ${st.pct}% on track` : ""} · ${(visitValues.division || {})[d.name] || 0} visits` : "No offices on the master list")}
                      onMouseMove={moveTip} onMouseLeave={() => setHover(null)} />
              );
            })}
          </g>

          {/* districts of the focused division */}
          <g key={divFocus || "none"} style={{ animation: reduced ? undefined : "fadein .6s ease both" }}>
            {districtsShown.map((d) => {
              const ours = districtFromShape(d.name);
              const st = distStats[d.name];
              const isSel = distFocus === d.name;
              const fill = mode === "coverage" ? covFill(st) : visFill((visitValues.district || {})[ours] || 0, visMax);
              return (
                <path key={d.name} d={d.d} className="map-shape" role="button" tabIndex={0}
                      aria-label={`${ours} district: ${st ? `${st.total} offices${showCoverage ? `, ${st.pct}% on track` : ""}` : "no offices"}`}
                      style={{ fill, opacity: distFocus && !isSel ? 0.42 : 1, stroke: isSel ? "var(--brand)" : "var(--card)", strokeWidth: isSel ? 2.6 : 1.3 }}
                      onClick={guard(() => filterFrom({ division: filter.division, region: isSel ? "All" : ours }))}
                      onKeyDown={(e) => e.key === "Enter" && filterFrom({ division: filter.division, region: ours })}
                      onMouseEnter={(e) => showTip(e, ours, st ? `${st.total} offices${showCoverage ? ` · ${st.pct}% on track` : ""} · ${(visitValues.district || {})[ours] || 0} visits` : "No offices on the master list")}
                      onMouseMove={moveTip} onMouseLeave={() => setHover(null)} />
              );
            })}
          </g>

          {/* text labels (level-of-detail, collision-checked) */}
          {labels.texts.map((t) => (
            <text key={t.id} className={`map-label ${t.cls || ""}`} x={t.x} y={t.y} style={{ fontSize: unit(t.px), strokeWidth: unit(3) }}>
              <tspan x={t.x} dy={t.sub ? unit(-1) : unit(t.px * 0.35)}>{t.text}</tspan>
              {t.sub && <tspan className="sub" x={t.x} dy={unit(t.px * 1.25)} style={{ fontSize: unit(t.px * 0.86) }}>{t.sub}</tspan>}
            </text>
          ))}

          {/* area pills */}
          {labels.pills.map((c) => (
            <g key={c.id} transform={`translate(${c.x} ${c.y + unit(c.dy)}) scale(${unit(1)})`} className="map-pill" style={{ cursor: "pointer" }}
               onClick={guard(() => filterFrom({ division: filter.division, region: c.district || filter.region, area: c.area }))}>
              <g className={reduced ? "" : "pill-in"}>
                <rect x={-c.w / 2} y={-c.h / 2} width={c.w} height={c.h} rx={c.h / 2} />
                <circle cx={-c.w / 2 + 13} cy="0" r="4" fill={showCoverage ? STATUS_META[c.worst].color : "var(--brand)"} />
                <text x="7" y="4" textAnchor="middle">{c.text}</text>
              </g>
            </g>
          ))}

          {/* office pins */}
          {ordered.map((p, i) => {
            // without coverage access every pin is the same plain marker
            const status = showCoverage ? p.o.status : "plain";
            const m = STATUS_META[status] || { label: "Field office", color: "var(--brand)" };
            const r = unit(pinR);
            const dim = level >= 3 && filter.area !== "All" && p.o.area !== filter.area;
            const isSel = sel === p.o.key;
            return (
              <g key={p.o.key} transform={`translate(${p.x} ${p.y})`} className="map-pin" role="button" tabIndex={0}
                 aria-label={showCoverage ? `${p.o.name}: ${m.label}` : p.o.name} style={{ opacity: dim ? 0.3 : 1 }}
                 onClick={guard((e) => { e.stopPropagation(); setSel(isSel ? null : p.o.key); })}
                 onKeyDown={(e) => e.key === "Enter" && setSel(p.o.key)}
                 onMouseEnter={(e) => showTip(e, p.o.name, showCoverage ? `${m.label}${p.o.lastDate ? ` · last ${timeAgo(p.o.daysSince)}` : ""}` : `${p.o.visitCount} visit${p.o.visitCount === 1 ? "" : "s"}`)}
                 onMouseMove={moveTip} onMouseLeave={() => setHover(null)}>
                <g className={reduced ? "" : "pop"} style={{ animationDelay: reduced ? undefined : `${Math.min(i, 40) * 14}ms` }}>
                  {status === "never" && !reduced && <circle className="ping" r={r * 1.6} />}
                  <circle r={r * 2.2} fill="transparent" />
                  {(status === "ok" || status === "plain") && <circle className="pin-shape" r={r} fill={m.color} />}
                  {status === "stale" && <rect className="pin-shape" x={-r} y={-r} width={r * 2} height={r * 2} rx={r * 0.25} transform="rotate(45)" fill={m.color} />}
                  {status === "never" && (
                    <g className="pin-shape">
                      <circle r={r} fill={m.color} />
                      <path d={`M${-r * 0.42} ${-r * 0.42}L${r * 0.42} ${r * 0.42}M${r * 0.42} ${-r * 0.42}L${-r * 0.42} ${r * 0.42}`} stroke="#fff" strokeWidth="1.8" vectorEffect="non-scaling-stroke" strokeLinecap="round" />
                    </g>
                  )}
                  {isSel && <circle r={r * 1.9} fill="none" stroke="var(--brand)" strokeWidth="2.2" vectorEffect="non-scaling-stroke" />}
                </g>
              </g>
            );
          })}

          {/* branch names placed by the label planner */}
          {labels.pinLabels.map((l) => (
            <text key={l.id} className="map-label pinname" x={l.x + unit(l.dx)} y={l.y + unit(l.dy)} textAnchor={l.a} style={{ fontSize: unit(10.5), strokeWidth: unit(3) }}>
              {l.text}
            </text>
          ))}
        </g>
      </svg>

      {/* breadcrumb */}
      <div className="map-ctl tl">
        {crumbs.map((c, i) => (
          <button key={c.label + i} className="map-crumb" onClick={() => filterFrom(c.patch)}>
            {i > 0 && <ChevronRight size={12} />}{c.label}
          </button>
        ))}
      </div>

      {/* zoom controls */}
      <div className="map-ctl tr">
        <button className="map-btn" onClick={() => zoomAt(1.7, W / 2, H / 2, true)} aria-label="Zoom in"><Plus size={16} /></button>
        <button className="map-btn" onClick={() => zoomAt(1 / 1.7, W / 2, H / 2, true)} aria-label="Zoom out"><Minus size={16} /></button>
        <button className="map-btn" onClick={() => animateTo(targetCam)} aria-label="Reset view"><Crosshair size={16} /></button>
      </div>

      {showModeToggle && showCoverage && (
        <div className="map-ctl bl">
          <div className="map-mode" role="tablist" aria-label="Map colouring">
            <button className={mode === "coverage" ? "active" : ""} onClick={() => onModeChange && onModeChange("coverage")}>Coverage</button>
            <button className={mode === "visits" ? "active" : ""} onClick={() => onModeChange && onModeChange("visits")}>Visits</button>
          </div>
        </div>
      )}

      <div className="map-ctl br">
        <div className="map-legend">
          {mode === "coverage" ? (
            <>
              <div className="lg-row"><span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--success)" }} /> Visited within {targetDays}d</div>
              <div className="lg-row"><span style={{ width: 9, height: 9, background: "var(--warning)", transform: "rotate(45deg)", borderRadius: 2, margin: "0 .5px" }} /> Overdue</div>
              <div className="lg-row"><span style={{ width: 10, height: 10, borderRadius: "50%", background: "var(--danger)" }} /> Never visited</div>
              <div className="lg-row" style={{ marginTop: 3 }}>
                {[["var(--success)", "≥80%"], ["var(--warning)", "50–79%"], ["var(--danger)", "<50%"]].map(([c, t]) => (
                  <span key={t} style={{ display: "inline-flex", alignItems: "center", gap: 4 }}><span style={{ width: 12, height: 8, borderRadius: 3, background: `color-mix(in srgb, ${c} 66%, var(--card))` }} />{t}</span>
                ))}
              </div>
            </>
          ) : (
            <>
              <div className="lg-row"><span className="lg-bar" /></div>
              <div className="lg-row" style={{ justifyContent: "space-between" }}><span>0</span><span>{visMax} visits</span></div>
            </>
          )}
        </div>
      </div>

      {hover && !selPin && (
        <div className="viz-tooltip" style={{ left: hover.x, top: hover.y }}>
          <div style={{ fontWeight: 750 }}>{hover.title}</div>
          <div style={{ opacity: 0.8, fontWeight: 600, fontSize: 11 }}>{hover.sub}</div>
        </div>
      )}

      {selPin && (
        <div className="map-card">
          {showCoverage && <span className={`pill ${STATUS_META[selPin.o.status].pill}`}>{STATUS_META[selPin.o.status].short}</span>}
          <div className="mc-main">
            <div className="mc-title">{selPin.o.name}</div>
            <div className="mc-sub">
              {selPin.o.area} · {selPin.o.district}<br />
              {showCoverage && (selPin.o.lastDate ? `Last visit ${timeAgo(selPin.o.daysSince)} · ` : "No visits recorded · ")}{selPin.o.visitCount} visit{selPin.o.visitCount === 1 ? "" : "s"}
              {selPin.o.avgRating != null && ` · ${selPin.o.avgRating.toFixed(1)}★`}
              {selPin.approx && " · approx. location"}
            </div>
          </div>
          {onOpenBranch && <button className="btn btn-primary btn-sm" onClick={() => onOpenBranch(selPin.o)}>Profile <ExternalLink size={13} /></button>}
          <button className="icon-btn" onClick={() => setSel(null)} aria-label="Close"><X size={15} /></button>
        </div>
      )}
    </div>
  );
}
