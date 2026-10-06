import React, { useEffect, useRef, useState } from "react";
import { MapPin, Search, LogOut, Moon, Sun } from "lucide-react";
import ThemeToggle from "./ThemeToggle";

/**
 * Navigation shell shared by the staff app and the admin console.
 * Desktop: a floating top bar with pill tabs and a dark action segment
 * (modelled on brac.net). Mobile: a compact top bar plus a floating bottom tab
 * bar with a raised primary-action button.
 */
export default function AppShell({
  theme, onToggleTheme, brandSub = "BRAC · Head Office", tabs, active, pageKey, onTab,
  fab, onSearch, user, userSub, onLogout, children,
}) {
  const [menuOpen, setMenuOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!menuOpen) return;
    const onDown = (e) => { if (wrapRef.current && !wrapRef.current.contains(e.target)) setMenuOpen(false); };
    const onKey = (e) => { if (e.key === "Escape") setMenuOpen(false); };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => { document.removeEventListener("mousedown", onDown); document.removeEventListener("keydown", onKey); };
  }, [menuOpen]);

  const initials = (user || "?").split(" ").map((p) => p[0]).join("").slice(0, 2).toUpperCase();
  const FabIcon = fab?.icon;

  // Bottom bar: the raised action button sits in the middle of the tabs.
  const mid = Math.min(2, Math.ceil(tabs.length / 2));
  const bottom = fab ? [...tabs.slice(0, mid), { __fab: true }, ...tabs.slice(mid)] : tabs;

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <div className="brand">
            <div className="brand-mark"><MapPin size={19} /></div>
            <div>
              <div className="brand-name">Field Visit Tracker</div>
              <div className="brand-sub">{brandSub}</div>
            </div>
          </div>

          <nav className="tabs" aria-label="Main">
            {tabs.map((t) => (
              <button key={t.key} className={`tab ${active === t.key ? "active" : ""}`} onClick={() => onTab(t.key)}>
                <t.icon size={16} /> {t.label}
                {t.count > 0 && <span className="tab-count">{t.count}</span>}
              </button>
            ))}
          </nav>

          <div className="topbar-right">
            {onSearch && (
              <button className="icon-btn" onClick={onSearch} aria-label="Search (Ctrl+K)" title="Search (Ctrl+K)">
                <Search size={17} />
              </button>
            )}
            {onSearch && <span className="kbd">Ctrl K</span>}
            <ThemeToggle theme={theme} onToggle={onToggleTheme} />
            {fab && (
              <button className="cta-pill" onClick={fab.onClick} aria-label={fab.label}>{FabIcon && <FabIcon size={15} strokeWidth={2.6} />}<span className="cta-label">{fab.label}</span></button>
            )}
            <div className="user-wrap" ref={wrapRef}>
              <button className="user-btn" onClick={() => setMenuOpen((o) => !o)} aria-haspopup="menu" aria-expanded={menuOpen}>
                <div className="avatar" title={user}>{initials}</div>
                <span className="user-name">{(user || "").split(" ")[0]}</span>
              </button>
              {menuOpen && (
                <div className="user-menu" role="menu">
                  <div className="um-head">
                    <div className="um-name">{user}</div>
                    {userSub && <div className="um-sub">{userSub}</div>}
                  </div>
                  <button className="um-item" role="menuitem" onClick={() => { onToggleTheme(); setMenuOpen(false); }}>
                    {theme === "light" ? <Moon size={16} /> : <Sun size={16} />} {theme === "light" ? "Dark mode" : "Light mode"}
                  </button>
                  <button className="um-item danger" role="menuitem" onClick={onLogout}><LogOut size={16} /> Sign out</button>
                </div>
              )}
            </div>
          </div>
        </div>
      </header>

      <div key={pageKey ?? active} className="page-enter">{children}</div>

      <nav className="bottom-nav" aria-label="Main">
        {bottom.map((t, i) =>
          t.__fab ? (
            <button key="fab" className="bn-fab" onClick={fab.onClick} aria-label={fab.label}>
              {FabIcon && <FabIcon size={24} strokeWidth={2.6} />}
            </button>
          ) : (
            <button key={t.key} className={`bn-item ${active === t.key ? "active" : ""}`} onClick={() => onTab(t.key)}>
              <t.icon size={20} />
              {t.short || t.label}
            </button>
          )
        )}
      </nav>
    </>
  );
}
