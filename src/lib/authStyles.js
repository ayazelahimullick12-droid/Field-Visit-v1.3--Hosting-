// Shared visual language for the unified login page (src/landing) — the same
// tokens and login/auth classes the staff and admin apps already use, so
// AuthScreen and the role picker look identical to the rest of the product.
export const AUTH_STYLES = `
  :root{
    --magenta:#EC008C;
    --magenta-dark:#B8006E;
    --magenta-wash:#FDE9F4;
    --magenta-wash-2:#FBD3E8;
    --ink:#1D1E22;
    --ink-soft:#5B5D68;
    --ink-faint:#8B8D97;
    --line:#E7E7EC;
    --line-soft:#F0F0F4;
    --paper:#F1F1F5;
    --card:#FFFFFF;
    --danger:#D6394C;
    --danger-wash:#FCE8EA;
    --radius-lg:14px;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
  }
  [data-theme="dark"]{
    --ink:#F2F2F5; --ink-soft:#B9BAC4; --ink-faint:#83848F;
    --line:#33343C; --line-soft:#2A2B32; --paper:#141419; --card:#1D1E24;
    --magenta-wash:#3A1530; --magenta-wash-2:#4A1B3D;
    --danger-wash:#3A1418;
  }
  html, body{ margin:0; padding:0; background:var(--paper); }
  #root{ min-height:100vh; background:var(--paper); }
  .fvt{ background:var(--paper); color:var(--ink); min-height:100vh; font-family:'Inter',sans-serif; }
  .fvt *{ box-sizing:border-box; }

  .theme-toggle{ width:32px;height:32px;border-radius:999px;border:1px solid var(--line); background:var(--card);
                 color:var(--ink-soft); display:flex;align-items:center;justify-content:center; cursor:pointer; flex-shrink:0; }
  .theme-toggle:hover{ background:var(--line-soft); }

  .login-screen{ min-height:100vh; display:flex; align-items:center; justify-content:center;
                 background:linear-gradient(160deg, var(--paper) 0%, var(--magenta-wash) 130%); padding:24px; }
  .login-card{ width:100%; max-width:380px; background:var(--card); border:1px solid var(--line);
               border-radius:var(--radius-lg); box-shadow:0 12px 28px rgba(29,30,34,0.18); padding:36px 30px 28px; text-align:center; }
  .login-logo{ width:44px; height:44px; border-radius:12px; background:var(--magenta);
               display:flex; align-items:center; justify-content:center; margin:0 auto 16px; }
  .login-title{ font-size:19px; font-weight:750; margin:0; }
  .login-sub{ font-size:12px; color:var(--ink-faint); margin:4px 0 0; }
  .login-card .field-group{ text-align:left; margin-top:20px; margin-bottom:0; }
  .login-card .field-group + .field-group{ margin-top:16px; }
  .field-label{ font-size:12.5px; font-weight:650; color:var(--ink); margin-bottom:6px; display:block; }
  .field-hint{ font-size:11px; color:var(--ink-faint); margin-top:6px; }
  .input{ width:100%; border:1px solid var(--line); border-radius:9px; padding:9px 12px; font-size:13px;
        font-family:inherit; background:var(--card); color:var(--ink); }
  .login-input-wrap{ position:relative; }
  .login-input-icon{ position:absolute; left:12px; top:50%; transform:translateY(-50%); color:var(--ink-faint); pointer-events:none; }
  .login-input.input{ padding-left:36px; }
  .login-card .btn-block{ margin-top:24px; }
  .login-footer{ font-size:11px; color:var(--ink-faint); margin:20px 0 0; }
  .login-error{ background:var(--danger-wash); color:var(--danger); font-size:12px; font-weight:650; padding:9px 12px; border-radius:8px; margin-top:16px; text-align:left; }
  .auth-tabs{ display:flex; background:var(--line-soft); border-radius:9px; padding:3px; gap:2px; margin-top:18px; }
  .auth-tab{ flex:1; border:none; background:transparent; padding:8px; border-radius:7px; font-size:12.5px; font-weight:650; color:var(--ink-soft); cursor:pointer; }
  .auth-tab.active{ background:var(--card); color:var(--ink); box-shadow:0 1px 3px rgba(0,0,0,0.08); }
  .auth-subtabs{ display:flex; gap:16px; margin-top:16px; margin-bottom:4px; border-bottom:1px solid var(--line); }
  .auth-subtab{ border:none; background:transparent; padding:0 0 9px; font-size:12.5px; font-weight:650; color:var(--ink-faint); cursor:pointer; border-bottom:2px solid transparent; margin-bottom:-1px; }
  .auth-subtab.active{ color:var(--magenta-dark); border-bottom-color:var(--magenta); }

  .btn{ display:inline-flex; align-items:center; justify-content:center; gap:7px; border:none; cursor:pointer;
        font-weight:650; font-size:13.5px; border-radius:9px; padding:10px 16px; transition:transform .06s ease; }
  .btn:active{ transform:scale(0.97); }
  .btn-primary{ background:var(--magenta); color:#fff; }
  .btn-primary:hover{ background:var(--magenta-dark); }
  .btn-secondary{ background:var(--card); color:var(--ink); border:1px solid var(--line); }
  .btn-secondary:hover{ background:var(--line-soft); }
  .btn:disabled{ opacity:0.5; cursor:not-allowed; }
  .btn-block{ width:100%; }

  /* Top-level Admin / User role picker, above the auth card */
  .role-picker{ display:flex; background:var(--line-soft); border-radius:11px; padding:4px; gap:2px;
                width:100%; max-width:380px; margin:0 auto 16px; }
  .role-picker-btn{ flex:1; border:none; background:transparent; padding:10px; border-radius:8px;
                     font-size:13px; font-weight:700; color:var(--ink-soft); cursor:pointer;
                     display:flex; align-items:center; justify-content:center; gap:7px; }
  .role-picker-btn.active{ background:var(--card); color:var(--magenta-dark); box-shadow:0 1px 3px rgba(0,0,0,0.08); }

  .sso-divider{ display:flex; align-items:center; gap:10px; margin:18px 0 4px; color:var(--ink-faint);
                font-size:11px; text-transform:uppercase; letter-spacing:0.05em; }
  .sso-divider::before, .sso-divider::after{ content:""; flex:1; height:1px; background:var(--line); }
  .sso-note{ background:var(--line-soft); color:var(--ink-soft); font-size:11.5px; padding:8px 12px; border-radius:8px; margin-top:10px; text-align:left; }
`;
