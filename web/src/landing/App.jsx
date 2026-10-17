import React, { useState, useEffect } from "react";
import { MapPin, ShieldAlert, User, Hash, Lock, LogIn } from "lucide-react";
import { login, whoAmI } from "../lib/session";
import { useTheme } from "../lib/theme";
import ThemeToggle from "../lib/ThemeToggle";
import AuthScreen from "../lib/AuthScreen";
import BdOutline from "../lib/BdOutline";

// Major cities, [lng, lat] — decorative pins on the sign-in map.
const CITY_PINS = [[90.41, 23.81], [91.78, 22.36], [91.87, 24.89], [88.6, 24.37], [89.54, 22.85], [89.27, 25.74], [90.35, 22.7], [90.42, 24.75], [92.0, 21.43]];

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const [role, setRole] = useState("user"); // "user" | "admin"
  const [checking, setChecking] = useState(true);

  // Already signed in (the server's cookie is still valid)? Skip the sign-in screen.
  useEffect(() => {
    whoAmI().then((me) => {
      if (me?.kind === "employee" && !me.offline) { window.location.replace("/staff.html"); return; }
      if (me?.kind === "admin") { window.location.replace("/admin.html"); return; }
      if (me?.offline) { window.location.replace("/staff.html"); return; } // no signal: open the staff app from this device's copy
      setChecking(false);
    });
  }, []);

  if (checking) {
    return (
      <div className="fvt">
        <div className="session-loading"><div className="brand-mark"><MapPin size={20} /></div></div>
      </div>
    );
  }

  const handleStaffLogin = () => { window.location.href = "/staff.html"; };
  const handleStaffRegister = () => { window.location.href = "/staff.html"; };
  const handleAdminLogin = () => { window.location.href = "/admin.html"; };

  return (
    <div className="fvt">
      <div className="auth-shell">
        <section className="auth-art">
          <div className="brand">
            <div className="brand-mark"><MapPin size={19} /></div>
            <div>
              <div className="brand-name">Field Visit Tracker</div>
              <div className="brand-sub">BRAC · Head Office</div>
            </div>
          </div>

          <BdOutline className="auth-map" pins={CITY_PINS} />
        </section>

        <section className="auth-panel">
          <div className="auth-panel-top"><ThemeToggle theme={theme} onToggle={toggleTheme} /></div>
          <div style={{ width: "100%", maxWidth: 420 }}>
            <div className="role-picker">
              <button className={`role-picker-btn ${role === "user" ? "active" : ""}`} onClick={() => setRole("user")}>
                <User size={15} /> User
              </button>
              <button className={`role-picker-btn ${role === "admin" ? "active" : ""}`} onClick={() => setRole("admin")}>
                <ShieldAlert size={15} /> Admin
              </button>
            </div>

            <div key={role}>
              {role === "user" ? (
                <AuthScreen
                  embedded
                  onRegister={handleStaffRegister}
                  onLogin={handleStaffLogin}
                  icon={<MapPin size={22} />}
                  title="Welcome back"
                  subtitle="Sign in to log and review field visits"
                />
              ) : (
                <AdminLoginCard onLogin={handleAdminLogin} />
              )}
            </div>
          </div>
        </section>
      </div>
    </div>
  );
}

// Admins sign in the same way as everyone else: PIN and password.
function AdminLoginCard({ onLogin }) {
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const handleLogin = async () => {
    if (!pin.trim() || !password.trim()) {
      setError("Enter your admin PIN and password.");
      return;
    }
    setBusy(true);
    try {
      await login(pin.trim(), password, "admin");
      onLogin();
    } catch (err) {
      setError(err.message === "Failed to fetch" ? "No connection. Try again when you are online." : err.message);
    } finally { setBusy(false); }
  };

  return (
    <div className="login-card">
      <div className="login-logo"><ShieldAlert size={22} /></div>
      <h1 className="login-title">Admin console</h1>
      <p className="login-sub">Action items, employees, offices and settings</p>

      <div className="field-group">
        <label className="field-label" htmlFor="admin-pin">Admin PIN</label>
        <div className="login-input-wrap">
          <Hash size={16} className="login-input-icon" />
          <input id="admin-pin" className="input login-input" type="text" inputMode="numeric" placeholder="4–8 digits" autoComplete="username"
                 value={pin} onChange={(e) => setPin(e.target.value)} />
        </div>
      </div>
      <div className="field-group">
        <label className="field-label" htmlFor="admin-password">Password</label>
        <div className="login-input-wrap">
          <Lock size={16} className="login-input-icon" />
          <input id="admin-password" className="input login-input" type="password" placeholder="Password" autoComplete="current-password"
                 value={password} onChange={(e) => setPassword(e.target.value)}
                 onKeyDown={(e) => e.key === "Enter" && handleLogin()} />
        </div>
      </div>

      {error && <div className="login-error">{error}</div>}

      <button className="btn btn-primary btn-block btn-lg" style={{ marginTop: 20 }} onClick={handleLogin} disabled={busy}>
        <LogIn size={16} /> Sign in
      </button>
    </div>
  );
}
