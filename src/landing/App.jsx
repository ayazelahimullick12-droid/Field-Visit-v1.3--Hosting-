import React, { useState, useEffect } from "react";
import { MapPin, ShieldAlert, User, Mail, Lock, LogIn } from "lucide-react";
import { usePersistedCollection } from "../lib/usePersistedCollection";
import { useTheme } from "../lib/theme";
import ThemeToggle from "../lib/ThemeToggle";
import AuthScreen from "../lib/AuthScreen";
import { AUTH_STYLES } from "../lib/authStyles";

// Session keys — kept identical to what the staff and admin apps read, so
// signing in here and landing on staff.html / admin.html needs no re-login.
const STAFF_SESSION_KEY = "fvt-staff-session"; // employee id, localStorage
const ADMIN_SESSION_KEY = "fvt-admin-session"; // admin email, sessionStorage

export default function App() {
  const [theme, toggleTheme] = useTheme();
  const [role, setRole] = useState("user"); // "user" | "admin"

  const [employees, setEmployees, employeesLoaded] = usePersistedCollection("employees", []);
  const [adminUsers, , adminUsersLoaded] = usePersistedCollection("adminUsers", []);

  const existingStaffSessionId = (() => {
    try { return localStorage.getItem(STAFF_SESSION_KEY); } catch { return null; }
  })();
  const existingAdminSessionEmail = (() => {
    try { return sessionStorage.getItem(ADMIN_SESSION_KEY); } catch { return null; }
  })();

  const staffMatch = existingStaffSessionId && employeesLoaded
    ? employees.find((e) => e.id === existingStaffSessionId)
    : undefined;
  const adminMatch = existingAdminSessionEmail && adminUsersLoaded
    ? adminUsers.find((a) => a.email.toLowerCase() === existingAdminSessionEmail.toLowerCase())
    : undefined;

  // Already signed in somewhere? Skip the login screen entirely.
  useEffect(() => {
    if (staffMatch) { window.location.replace("/staff.html"); return; }
    if (adminMatch) { window.location.replace("/admin.html"); return; }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [staffMatch, adminMatch]);

  // Keep showing a loading state (never the form) for as long as a session
  // might still turn out to be valid — either the collection hasn't loaded
  // yet, or it has and the redirect above is about to fire.
  const waitingOnStaffSession = existingStaffSessionId && (!employeesLoaded || staffMatch);
  const waitingOnAdminSession = existingAdminSessionEmail && (!adminUsersLoaded || adminMatch);
  if (waitingOnStaffSession || waitingOnAdminSession) {
    return (
      <div className="fvt">
        <style>{AUTH_STYLES}</style>
        <div className="login-screen">
          <div className="login-logo"><MapPin size={20} color="#fff" /></div>
        </div>
      </div>
    );
  }

  const handleStaffLogin = (employee) => {
    try { localStorage.setItem(STAFF_SESSION_KEY, employee.id); } catch { /* ignore */ }
    window.location.href = "/staff.html";
  };

  const handleStaffRegister = (newEmployee) => {
    setEmployees((es) => [...es, newEmployee]);
    try { localStorage.setItem(STAFF_SESSION_KEY, newEmployee.id); } catch { /* ignore */ }
    window.location.href = "/staff.html";
  };

  const handleAdminLogin = (admin) => {
    try { sessionStorage.setItem(ADMIN_SESSION_KEY, admin.email); } catch { /* ignore */ }
    window.location.href = "/admin.html";
  };

  return (
    <div className="fvt">
      <style>{AUTH_STYLES}</style>
      <div style={{ position: "fixed", top: 16, right: 18 }}>
        <ThemeToggle theme={theme} onToggle={toggleTheme} />
      </div>

      <div className="login-screen" style={{ flexDirection: "column" }}>
        <div className="role-picker">
          <button
            className={`role-picker-btn ${role === "user" ? "active" : ""}`}
            onClick={() => setRole("user")}
          >
            <User size={15} /> User
          </button>
          <button
            className={`role-picker-btn ${role === "admin" ? "active" : ""}`}
            onClick={() => setRole("admin")}
          >
            <ShieldAlert size={15} /> Admin
          </button>
        </div>

        {role === "user" ? (
          <AuthScreen
            employees={employees}
            onRegister={handleStaffRegister}
            onLogin={handleStaffLogin}
            icon={<MapPin size={20} color="#fff" />}
            title="Field Visit Tracker"
            subtitle="BRAC Microfinance Programme · Technology Unit"
            demoHint="Demo: PIN 1234 + password password123 (or email ayaz.elahi@brac.org)"
            footerExtra={<SsoSection />}
          />
        ) : (
          <AdminLoginCard adminUsers={adminUsers} onLogin={handleAdminLogin} />
        )}
      </div>
    </div>
  );
}

function SsoSection() {
  const [clicked, setClicked] = useState(false);
  return (
    <>
      <div className="sso-divider">or</div>
      <button className="btn btn-secondary btn-block" onClick={() => setClicked(true)}>
        Continue with SSO
      </button>
      {clicked && (
        <p className="sso-note">
          SSO isn't wired up yet — this button is a placeholder for a future
          single sign-on integration. Sign in above with a PIN or email and
          password for now.
        </p>
      )}
    </>
  );
}

function AdminLoginCard({ adminUsers, onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  const handleLogin = () => {
    if (!email.trim() || !password.trim()) {
      setError("Enter the admin email and password.");
      return;
    }
    const match = adminUsers.find(
      (a) => a.email.toLowerCase() === email.trim().toLowerCase() && a.password === password
    );
    if (!match) {
      setError("Incorrect admin email or password.");
      return;
    }
    onLogin(match);
  };

  return (
    <div className="login-card">
      <div className="login-logo"><ShieldAlert size={20} color="#fff" /></div>
      <h1 className="login-title">Admin Console</h1>
      <p className="login-sub">Field Visit Tracker · BRAC Microfinance</p>

      <div className="field-group">
        <label className="field-label">Email</label>
        <div className="login-input-wrap">
          <Mail size={15} className="login-input-icon" />
          <input className="input login-input" type="email" placeholder="admin@brac.org"
                 value={email} onChange={(e) => setEmail(e.target.value)} />
        </div>
      </div>
      <div className="field-group">
        <label className="field-label">Password</label>
        <div className="login-input-wrap">
          <Lock size={15} className="login-input-icon" />
          <input className="input login-input" type="password" placeholder="Password"
                 value={password} onChange={(e) => setPassword(e.target.value)}
                 onKeyDown={(e) => e.key === "Enter" && handleLogin()} />
        </div>
      </div>

      {error && <div className="login-error">{error}</div>}

      <button className="btn btn-primary btn-block" style={{ marginTop: 20 }} onClick={handleLogin}>
        <LogIn size={15} /> Sign in
      </button>
      <p className="login-footer">Demo: admin@brac.org / admin123</p>

      <SsoSection />
    </div>
  );
}
