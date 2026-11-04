import React, { useEffect } from "react";
import { X } from "lucide-react";
import Portal from "../../lib/Portal";

/* Building blocks shared by the Management tabs. */

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);

/**
 * One item's details (an office, a person, a department) in a panel that slides in from the right,
 * so the table stays where it was. Closes on Esc, the close button or a click outside it.
 */
export function SidePanel({ title, sub, actions, onClose, children }) {
  useEffect(() => {
    const onKey = (e) => { if (e.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <Portal>
      <div className="sp-veil" onClick={onClose}>
        <aside className="sp" role="dialog" aria-modal="true" aria-label={typeof title === "string" ? title : "Details"} onClick={(e) => e.stopPropagation()}>
          <header className="sp-head">
            <div className="sp-titles">
              <h2>{title}</h2>
              {sub && <p>{sub}</p>}
            </div>
            <button type="button" className="icon-btn" onClick={onClose} aria-label="Close"><X size={17} /></button>
          </header>
          {actions && <div className="sp-actions">{actions}</div>}
          <div className="sp-body">{children}</div>
        </aside>
      </div>
    </Portal>
  );
}

/** A stacked bar; each part shows a small card with its name, count and share on hover (or keyboard focus). */
export function TipBar({ parts, className = "" }) {
  const shown = parts.filter((p) => p.value > 0);
  const total = shown.reduce((n, p) => n + p.value, 0);
  if (!total) return null;
  return (
    <div className={`tipbar ${className}`}>
      {shown.map((p, i) => (
        <span key={p.label} className={`tipbar-seg ${i === 0 ? "first" : ""} ${i === shown.length - 1 ? "last" : ""}`} tabIndex={0}
              aria-label={`${p.label}: ${p.value}`} style={{ width: `${(p.value / total) * 100}%`, background: p.color }}>
          <em className={`tipbar-tip ${(shown.slice(0, i).reduce((n, x) => n + x.value, 0) + p.value / 2) / total > 0.7 ? "right" : (shown.slice(0, i).reduce((n, x) => n + x.value, 0) + p.value / 2) / total < 0.3 ? "left" : ""}`} aria-hidden="true">
            <i style={{ background: p.color }} />
            <b>{p.label}</b>
            <span>{p.value.toLocaleString()} · {pct(p.value, total)}%</span>
          </em>
        </span>
      ))}
    </div>
  );
}
