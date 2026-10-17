import React, { useEffect, useMemo, useRef, useState } from "react";
import { Search, CornerDownLeft } from "lucide-react";

/**
 * Ctrl/⌘+K quick-jump. `items`: [{ id, group, label, sub, icon, run }].
 * Arrow keys + Enter navigate; Esc closes. On phones it opens as a bottom sheet.
 */
export default function CommandPalette({ open, onClose, items, placeholder = "Search pages and branches…" }) {
  const [q, setQ] = useState("");
  const [idx, setIdx] = useState(0);
  const inputRef = useRef(null);
  const listRef = useRef(null);

  useEffect(() => { if (open) { setQ(""); setIdx(0); setTimeout(() => inputRef.current?.focus(), 30); } }, [open]);

  const results = useMemo(() => {
    const s = q.trim().toLowerCase();
    const pool = !s ? items.filter((i) => i.group === "Go to").concat(items.filter((i) => i.group !== "Go to").slice(0, 6)) : items.filter((i) => `${i.label} ${i.sub || ""} ${i.group}`.toLowerCase().includes(s));
    return pool.slice(0, 40);
  }, [q, items]);

  useEffect(() => { setIdx(0); }, [q]);
  useEffect(() => { listRef.current?.querySelector(".cmdk-item.sel")?.scrollIntoView({ block: "nearest" }); }, [idx]);

  if (!open) return null;

  const run = (it) => { onClose(); it.run(); };
  const onKey = (e) => {
    if (e.key === "Escape") { e.preventDefault(); onClose(); }
    else if (e.key === "ArrowDown") { e.preventDefault(); setIdx((i) => Math.min(results.length - 1, i + 1)); }
    else if (e.key === "ArrowUp") { e.preventDefault(); setIdx((i) => Math.max(0, i - 1)); }
    else if (e.key === "Enter" && results[idx]) { e.preventDefault(); run(results[idx]); }
  };

  let lastGroup = null;
  return (
    <div className="cmdk-veil" onMouseDown={onClose}>
      <div className="cmdk" role="dialog" aria-label="Quick search" onMouseDown={(e) => e.stopPropagation()} onKeyDown={onKey}>
        <div className="cmdk-input">
          <Search size={18} />
          <input ref={inputRef} value={q} onChange={(e) => setQ(e.target.value)} placeholder={placeholder} aria-label="Search" />
        </div>
        <div className="cmdk-list" ref={listRef}>
          {results.length === 0 && <div className="viz-empty">No matches for “{q}”.</div>}
          {results.map((it, i) => {
            const head = it.group !== lastGroup ? (lastGroup = it.group) : null;
            const Icon = it.icon;
            return (
              <React.Fragment key={it.id}>
                {head && <div className="cmdk-group">{head}</div>}
                <button className={`cmdk-item ${i === idx ? "sel" : ""}`} onMouseEnter={() => setIdx(i)} onClick={() => run(it)}>
                  {Icon && <Icon size={17} color={it.color || "var(--ink-soft)"} />}
                  <span style={{ flex: 1, minWidth: 0 }}>
                    <div>{it.label}</div>
                    {it.sub && <div className="ci-sub">{it.sub}</div>}
                  </span>
                  {i === idx && <CornerDownLeft size={14} color="var(--ink-faint)" />}
                </button>
              </React.Fragment>
            );
          })}
        </div>
        <div className="cmdk-foot"><span><span className="kbd">↑↓</span> navigate</span><span><span className="kbd">Enter</span> open</span><span><span className="kbd">Esc</span> close</span></div>
      </div>
    </div>
  );
}
