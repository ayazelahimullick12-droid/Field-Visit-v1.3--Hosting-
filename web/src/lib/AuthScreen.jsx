import React, { useState } from "react";
import { User, Phone, Mail, Lock, Hash, LogIn, UserPlus } from "lucide-react";
import { login, register } from "./session";

/**
 * Shared identity screen for the Staff and Fixer apps. Every employee is
 * tracked by a unique PIN (their id, effectively) and signs in with that PIN
 * and their password. PIN + password is the only way in.
 *
 * Props:
 * - onRegister(newEmployee) / onLogin(employee)
 * - icon, title, subtitle: branding for whichever app is rendering this
 * - requireRole: if set (e.g. "fixer"), only employees carrying that role
 *   may log in here, and new registrations are tagged with it
 * - footerExtra: optional extra content (e.g. an SSO button) rendered right
 *   after the sign-in/register form, before the footer note
 */
export default function AuthScreen({
  onRegister, onLogin, icon, title, subtitle, requireRole, footerExtra, embedded,
}) {
  const [mode, setMode] = useState("login"); // "login" | "register"

  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [email, setEmail] = useState("");
  const [pin, setPin] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");

  const resetFields = () => {
    setName(""); setPhone(""); setEmail(""); setPin("");
    setPassword(""); setConfirmPassword(""); setError("");
  };
  const switchMode = (m) => { setMode(m); resetFields(); };

  const roleLabel = requireRole ? requireRole : "employee";

  const rejectIfWrongRole = (match) => {
    if (requireRole && !(match.roles || []).includes(requireRole)) {
      setError(`That account exists, but isn't set up as a ${roleLabel} yet. Ask an admin to add the role, or register a new one below.`);
      return true;
    }
    return false;
  };

  const [busy, setBusy] = useState(false);

  // The server checks the PIN and password and sets the sign-in cookie.
  const handleLoginByPin = async () => {
    setError("");
    if (!pin.trim() || !password.trim()) { setError("Enter your PIN and password."); return; }
    setBusy(true);
    try {
      const { user } = await login(pin.trim(), password);
      if (rejectIfWrongRole(user)) return;
      onLogin(user);
    } catch (err) {
      setError(err.message === "Failed to fetch" ? "No connection. Try again when you are online." : err.message);
    } finally { setBusy(false); }
  };

  const handleRegister = async () => {
    setError("");
    if (!name.trim() || !phone.trim() || !email.trim() || !pin.trim() || !password.trim() || !confirmPassword.trim()) {
      setError("Fill in every field — name, number, email, PIN, and password.");
      return;
    }
    if (!/^\d{4,8}$/.test(pin.trim())) { setError("PIN should be 4–8 digits."); return; }
    if (password !== confirmPassword) { setError("Passwords don't match."); return; }
    if (password.length < 6) { setError("Password should be at least 6 characters."); return; }
    setBusy(true);
    try {
      const { user } = await register({ name: name.trim(), phone: phone.trim(), email: email.trim(), pin: pin.trim(), password });
      onRegister(user);
    } catch (err) {
      setError(err.message === "Failed to fetch" ? "No connection. Try again when you are online." : err.message);
    } finally { setBusy(false); }
  };

  const Outer = embedded ? React.Fragment : "div";
  const outerProps = embedded ? {} : { className: "login-screen" };
  return (
    <Outer {...outerProps}>
      <div className="login-card">
        <div className="login-logo">{icon}</div>
        <h1 className="login-title">{title}</h1>
        <p className="login-sub">{subtitle}</p>

        <div className="auth-tabs">
          <button className={`auth-tab ${mode === "login" ? "active" : ""}`} onClick={() => switchMode("login")}>Sign in</button>
          <button className={`auth-tab ${mode === "register" ? "active" : ""}`} onClick={() => switchMode("register")}>Create account</button>
        </div>

        {mode === "login" ? (
          <>
            <div className="field-group">
              <label className="field-label" htmlFor="login-pin">Employee PIN</label>
              <div className="login-input-wrap">
                <Hash size={15} className="login-input-icon" />
                <input id="login-pin" className="input login-input" type="text" inputMode="numeric" autoComplete="username" placeholder="4–8 digits"
                       value={pin} onChange={(e) => setPin(e.target.value)} />
              </div>
            </div>
            <div className="field-group">
              <label className="field-label" htmlFor="login-password">Password</label>
              <div className="login-input-wrap">
                <Lock size={15} className="login-input-icon" />
                <input id="login-password" className="input login-input" type="password" autoComplete="current-password" placeholder="Password"
                       value={password} onChange={(e) => setPassword(e.target.value)}
                       onKeyDown={(e) => e.key === "Enter" && handleLoginByPin()} />
              </div>
            </div>

            {error && <div className="login-error">{error}</div>}

            <button className="btn btn-primary btn-block" style={{ marginTop: 18 }} onClick={handleLoginByPin} disabled={busy}>
              <LogIn size={15} /> Sign in
            </button>
          </>
        ) : (
          <>
            <div className="field-group">
              <label className="field-label">Full name</label>
              <div className="login-input-wrap">
                <User size={15} className="login-input-icon" />
                <input className="input login-input" type="text" placeholder="Ayaz Elahi"
                       value={name} onChange={(e) => setName(e.target.value)} />
              </div>
            </div>
            <div className="field-group">
              <label className="field-label">Phone number</label>
              <div className="login-input-wrap">
                <Phone size={15} className="login-input-icon" />
                <input className="input login-input" type="tel" placeholder="017XXXXXXXX"
                       value={phone} onChange={(e) => setPhone(e.target.value)} />
              </div>
            </div>
            <div className="field-group">
              <label className="field-label">Email</label>
              <div className="login-input-wrap">
                <Mail size={15} className="login-input-icon" />
                <input className="input login-input" type="email" placeholder="you@brac.org"
                       value={email} onChange={(e) => setEmail(e.target.value)} />
              </div>
            </div>
            <div className="field-group">
              <label className="field-label">PIN</label>
              <div className="login-input-wrap">
                <Hash size={15} className="login-input-icon" />
                <input className="input login-input" type="text" inputMode="numeric" placeholder="4–8 digits"
                       value={pin} onChange={(e) => setPin(e.target.value)} />
              </div>
              <p className="field-hint">This becomes your unique employee ID — you'll sign in with it and your password.</p>
            </div>
            <div className="field-group">
              <label className="field-label">Password</label>
              <div className="login-input-wrap">
                <Lock size={15} className="login-input-icon" />
                <input className="input login-input" type="password" placeholder="Password"
                       value={password} onChange={(e) => setPassword(e.target.value)} />
              </div>
            </div>
            <div className="field-group">
              <label className="field-label">Re-type password</label>
              <div className="login-input-wrap">
                <Lock size={15} className="login-input-icon" />
                <input className="input login-input" type="password" placeholder="Re-type password"
                       value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
                       onKeyDown={(e) => e.key === "Enter" && handleRegister()} />
              </div>
            </div>

            {error && <div className="login-error">{error}</div>}

            <button className="btn btn-primary btn-block" style={{ marginTop: 6 }} onClick={handleRegister} disabled={busy}>
              <UserPlus size={15} /> Create account
            </button>
          </>
        )}

        {footerExtra}

        <p className="login-footer">
          Use your work email: action item emails are sent there if you become a fixer.

        </p>
      </div>
    </Outer>
  );
}
