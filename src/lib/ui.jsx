import React, { useEffect, useId, useRef, useState } from "react";
import { ArrowDownRight, ArrowUpRight, Minus } from "lucide-react";

/* Small animation + display primitives shared across the sign-in page, the
   staff app and the admin console. Everything respects prefers-reduced-motion. */

export function usePrefersReducedMotion() {
  const [reduced, setReduced] = useState(() =>
    typeof window !== "undefined" && window.matchMedia ? window.matchMedia("(prefers-reduced-motion: reduce)").matches : false
  );
  useEffect(() => {
    if (!window.matchMedia) return;
    const mq = window.matchMedia("(prefers-reduced-motion: reduce)");
    const on = () => setReduced(mq.matches);
    mq.addEventListener?.("change", on);
    return () => mq.removeEventListener?.("change", on);
  }, []);
  return reduced;
}

/** Tweens from the previous value to `target` (ease-out cubic). */
export function useCountUp(target, { duration = 1000 } = {}) {
  const reduced = usePrefersReducedMotion();
  const safe = Number.isFinite(target) ? target : 0;
  const [val, setVal] = useState(reduced ? safe : 0);
  const cur = useRef(reduced ? safe : 0);
  useEffect(() => {
    if (reduced) { cur.current = safe; setVal(safe); return; }
    const from = cur.current;
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const e = 1 - Math.pow(1 - t, 3);
      cur.current = from + (safe - from) * e;
      setVal(cur.current);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [safe, duration, reduced]);
  return val;
}

export function CountUp({ value, decimals = 0, prefix = "", suffix = "", duration = 1000, className, style }) {
  const v = useCountUp(value, { duration });
  const txt = v.toLocaleString(undefined, { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return <span className={className} style={style}>{prefix}{txt}{suffix}</span>;
}

/** Fades/slides children in once they scroll into view; `i` staggers siblings. */
export function Reveal({ i = 0, as: Tag = "div", className = "", style, children, ...rest }) {
  const ref = useRef(null);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!("IntersectionObserver" in window)) { setShown(true); return; }
    const io = new IntersectionObserver(([e]) => {
      if (e.isIntersecting) { setShown(true); io.disconnect(); }
    }, { rootMargin: "0px 0px -6% 0px", threshold: 0.04 });
    io.observe(el);
    return () => io.disconnect();
  }, []);
  return (
    <Tag ref={ref} className={`reveal ${shown ? "in" : ""} ${className}`} style={{ "--i": i, ...style }} {...rest}>
      {children}
    </Tag>
  );
}

export function Sparkline({ data, color = "var(--brand)", w = 96, h = 30 }) {
  const gid = useId();
  if (!data || data.length < 2) return <div style={{ width: w, height: h }} />;
  const max = Math.max(...data), min = Math.min(...data);
  const rng = max - min || 1;
  const pts = data.map((v, i) => [(i / (data.length - 1)) * w, h - 3 - ((v - min) / rng) * (h - 6)]);
  const d = pts.map((p, i) => `${i ? "L" : "M"}${p[0].toFixed(1)} ${p[1].toFixed(1)}`).join(" ");
  const last = pts[pts.length - 1];
  return (
    <svg className="spark" width={w} height={h} viewBox={`0 0 ${w} ${h}`} aria-hidden="true">
      <defs>
        <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={color} stopOpacity=".35" />
          <stop offset="1" stopColor={color} stopOpacity="0" />
        </linearGradient>
      </defs>
      <path className="area" d={`${d} L${w} ${h} L0 ${h} Z`} fill={`url(#${gid})`} />
      <path className="line" d={d} stroke={color} />
      <circle cx={last[0]} cy={last[1]} r="2.6" fill={color} />
    </svg>
  );
}

/** ↑/↓ chip comparing two values. `goodWhenDown` flips the colour logic. */
export function DeltaChip({ current, previous, goodWhenDown = false, suffix = "%" }) {
  if (previous == null || current == null) return null;
  let label, dir;
  if (previous === 0) {
    if (current === 0) { label = "0"; dir = "flat"; } else { label = "new"; dir = "up"; }
  } else {
    const pct = Math.round(((current - previous) / previous) * 100);
    dir = pct > 0 ? "up" : pct < 0 ? "down" : "flat";
    label = `${Math.abs(pct)}${suffix}`;
  }
  const good = dir === "flat" ? "flat" : (dir === "up") !== goodWhenDown ? "up" : "down";
  const Icon = dir === "up" ? ArrowUpRight : dir === "down" ? ArrowDownRight : Minus;
  return <span className={`delta ${good}`}><Icon size={12} strokeWidth={3} />{label}</span>;
}

/** Animated progress ring. `value` is 0–100. */
export function Ring({ value = 0, size = 148, stroke = 13, color = "var(--success)", children }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = Math.max(0, Math.min(100, value)) / 100;
  return (
    <div className="net-ring" style={{ width: size, height: size }}>
      <svg className="ring" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line-soft)" strokeWidth={stroke} />
        <circle className="ring-fg" cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth={stroke} strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - pct)} transform={`rotate(-90 ${size / 2} ${size / 2})`} style={{ "--circ": c }} />
      </svg>
      <div className="ring-center">{children}</div>
    </div>
  );
}

export function Skeleton({ h = 16, w = "100%", r = 10, style }) {
  return <div className="skeleton" style={{ height: h, width: w, borderRadius: r, ...style }} />;
}

export function downloadCsv(filename, columns, rows) {
  const esc = (v) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const csv = [columns.map((c) => esc(c.label)).join(","), ...rows.map((r) => columns.map((c) => esc(c.get ? c.get(r) : r[c.key])).join(","))].join("\n");
  const blob = new Blob(["﻿" + csv], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
