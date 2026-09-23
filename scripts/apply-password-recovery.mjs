import fs from 'node:fs';

function replaceOnce(source, needle, replacement, label) {
  if (!source.includes(needle)) {
    if (source.includes(replacement)) return source;
    throw new Error(`Could not find ${label}`);
  }
  return source.replace(needle, replacement);
}

// ---- Worker: password-reset API ----
const workerPath = 'worker/index.js';
let worker = fs.readFileSync(workerPath, 'utf8');

worker = replaceOnce(
  worker,
  'const TURNSTILE_VERIFY_URL =\n  "https://challenges.cloudflare.com/turnstile/v0/siteverify";\n',
  'const TURNSTILE_VERIFY_URL =\n  "https://challenges.cloudflare.com/turnstile/v0/siteverify";\nconst PASSWORD_RESET_TTL_MS = 30 * 60 * 1000;\nconst RESEND_EMAIL_URL = "https://api.resend.com/emails";\n',
  'worker auth constants'
);

const resetFunctions = String.raw`
async function ensurePasswordResetSchema(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS ica_password_resets (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      expires_at INTEGER NOT NULL,
      used_at INTEGER,
      created_at INTEGER NOT NULL
    )`
  ).run();

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS ica_password_resets_user_idx
     ON ica_password_resets(user_id, created_at DESC)`
  ).run();
}

function passwordResetEmailConfig(env) {
  return {
    apiKey: String(env.RESEND_API_KEY || "").trim(),
    from: String(
      env.ICA_AUTH_FROM_EMAIL ||
      "I Computer Anything <accounts@mail.icomputeranything.com>"
    ).trim()
  };
}

async function sendPasswordResetEmail(env, email, resetUrl) {
  const config = passwordResetEmailConfig(env);
  if (!config.apiKey || !config.from) {
    throw new Error("Account recovery email is not configured yet.");
  }

  const response = await fetch(RESEND_EMAIL_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      from: config.from,
      to: [email],
      subject: "Reset your ICA Software password",
      text:
        "A password reset was requested for your I Computer Anything software account. " +
        "Use this link within 30 minutes: " + resetUrl +
        "\n\nIf you did not request this, you can ignore this email.",
      html: `
        <div style="font-family:Arial,sans-serif;background:#090b10;color:#f7f7f7;padding:32px;border-radius:18px">
          <h2 style="margin:0 0 12px">Reset your ICA Software password</h2>
          <p style="color:#c7cbd4;line-height:1.6">A password reset was requested for your I Computer Anything software account.</p>
          <p style="margin:26px 0">
            <a href="${resetUrl}" style="display:inline-block;background:#f4b942;color:#090b10;text-decoration:none;font-weight:800;padding:13px 20px;border-radius:10px">RESET PASSWORD</a>
          </p>
          <p style="color:#9ca3af;font-size:13px;line-height:1.55">This link expires in 30 minutes. If you did not request it, you can ignore this email.</p>
        </div>
      `
    })
  });

  if (!response.ok) {
    const detail = await response.text().catch(() => "");
    console.error("ICA password reset email failed", response.status, detail.slice(0, 500));
    throw new Error("Password reset email could not be sent right now.");
  }
}

async function handlePasswordResetRequest(request, env) {
  if (!env.DB) {
    return json({ error: "ICA account database is unavailable." }, 503);
  }

  const body = await readJson(request);
  const turnstileError = await verifyTurnstile(
    request,
    env,
    body.turnstileToken,
    "password_reset"
  );
  if (turnstileError) return turnstileError;

  const email = normalizeEmail(body.email);
  if (!/^\\S+@\\S+\\.\\S+$/.test(email)) {
    return json({ error: "Enter a valid email address." }, 400);
  }

  const config = passwordResetEmailConfig(env);
  if (!config.apiKey || !config.from) {
    return json({
      error: "Account recovery email is not configured yet. Add the RESEND_API_KEY Cloudflare secret."
    }, 503);
  }

  await ensurePasswordResetSchema(env);
  const now = Date.now();
  await env.DB.prepare(
    "DELETE FROM ica_password_resets WHERE expires_at <= ? OR used_at IS NOT NULL"
  ).bind(now).run();

  const user = await env.DB.prepare(
    "SELECT id, email, status FROM users WHERE email = ? LIMIT 1"
  ).bind(email).first();

  // Always return the same success message so this endpoint does not reveal
  // whether an email address has an ICA account.
  const genericMessage =
    "If an ICA Software account exists for that email, a password reset link has been sent.";

  if (!user || user.status !== "active") {
    return json({ ok: true, message: genericMessage });
  }

  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const expiresAt = now + PASSWORD_RESET_TTL_MS;

  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM ica_password_resets WHERE user_id = ?"
    ).bind(user.id),
    env.DB.prepare(
      `INSERT INTO ica_password_resets (
        token_hash, user_id, expires_at, created_at
      ) VALUES (?, ?, ?, ?)`
    ).bind(tokenHash, user.id, expiresAt, now)
  ]);

  const resetUrl =
    `${new URL(request.url).origin}/reset-password?token=${encodeURIComponent(token)}`;

  try {
    await sendPasswordResetEmail(env, user.email, resetUrl);
  } catch (error) {
    console.error("ICA password recovery failed", error);
    await env.DB.prepare(
      "DELETE FROM ica_password_resets WHERE token_hash = ?"
    ).bind(tokenHash).run();
    return json({
      error: error instanceof Error ? error.message : "Password reset email could not be sent."
    }, 503);
  }

  return json({ ok: true, message: genericMessage });
}

async function handlePasswordReset(request, env) {
  if (!env.DB) {
    return json({ error: "ICA account database is unavailable." }, 503);
  }

  const body = await readJson(request);
  const token = String(body.token || "").trim();
  const password = String(body.password || "");

  if (!token || token.length < 40) {
    return json({ error: "This password reset link is invalid." }, 400);
  }

  if (password.length < 10) {
    return json({ error: "New password must be at least 10 characters." }, 400);
  }

  await ensurePasswordResetSchema(env);
  const tokenHash = await sha256(token);
  const now = Date.now();
  const row = await env.DB.prepare(
    `SELECT r.user_id, r.expires_at, r.used_at, u.status
     FROM ica_password_resets r
     JOIN users u ON u.id = r.user_id
     WHERE r.token_hash = ?
     LIMIT 1`
  ).bind(tokenHash).first();

  if (
    !row ||
    row.used_at ||
    Number(row.expires_at || 0) <= now ||
    row.status !== "active"
  ) {
    return json({ error: "This password reset link is invalid or has expired." }, 400);
  }

  const passwordData = await hashPassword(password);

  await env.DB.batch([
    env.DB.prepare(
      `UPDATE users
       SET password_hash = ?, password_salt = ?
       WHERE id = ?`
    ).bind(passwordData.hash, passwordData.salt, row.user_id),
    env.DB.prepare(
      "UPDATE ica_password_resets SET used_at = ? WHERE token_hash = ?"
    ).bind(now, tokenHash),
    env.DB.prepare(
      "DELETE FROM sessions WHERE user_id = ?"
    ).bind(row.user_id)
  ]);

  return json({
    ok: true,
    message: "Password updated. You can sign in with the new password now."
  });
}
`;

worker = replaceOnce(
  worker,
  'async function handleRegister(request, env) {',
  `${resetFunctions}\nasync function handleRegister(request, env) {`,
  'password reset worker functions'
);

worker = replaceOnce(
  worker,
  '  if (url.pathname === "/api/auth/login" && request.method === "POST") {\n    return handleLogin(request, env);\n  }\n\n  if (url.pathname === "/api/auth/logout" && request.method === "POST") {',
  '  if (url.pathname === "/api/auth/login" && request.method === "POST") {\n    return handleLogin(request, env);\n  }\n\n  if (url.pathname === "/api/auth/password/request" && request.method === "POST") {\n    return handlePasswordResetRequest(request, env);\n  }\n\n  if (url.pathname === "/api/auth/password/reset" && request.method === "POST") {\n    return handlePasswordReset(request, env);\n  }\n\n  if (url.pathname === "/api/auth/logout" && request.method === "POST") {',
  'password reset routes'
);

fs.writeFileSync(workerPath, worker);

// ---- Portal: Forgot Password + Reset Password page ----
const portalPath = 'src/ScenePilotPortal.jsx';
let portal = fs.readFileSync(portalPath, 'utf8');

portal = replaceOnce(
  portal,
  '  async function submit(event) {\n    event.preventDefault();\n    setStatus("");\n\n    if (!turnstileToken) {',
  '  async function submit(event) {\n    event.preventDefault();\n    setStatus("");\n\n    if (!turnstileToken) {',
  'auth submit anchor'
);

portal = replaceOnce(
  portal,
  '    setBusy(true);\n\n    try {\n      const payload = mode === "register"\n        ? {\n            displayName,\n            email,\n            password,\n            marketingOptIn: marketing,\n            turnstileToken\n          }\n        : {\n            email,\n            password,\n            turnstileToken\n          };\n\n      const data = await api(\n        mode === "register" ? "/api/auth/register" : "/api/auth/login",\n        {\n          method: "POST",\n          body: JSON.stringify(payload)\n        }\n      );',
  '    setBusy(true);\n\n    try {\n      if (mode === "forgot") {\n        const data = await api("/api/auth/password/request", {\n          method: "POST",\n          body: JSON.stringify({ email, turnstileToken })\n        });\n        setStatus(data.message || "If an ICA Software account exists for that email, a password reset link has been sent.");\n        setTurnstileToken("");\n        setTurnstileResetKey(value => value + 1);\n        return;\n      }\n\n      const payload = mode === "register"\n        ? {\n            displayName,\n            email,\n            password,\n            marketingOptIn: marketing,\n            turnstileToken\n          }\n        : {\n            email,\n            password,\n            turnstileToken\n          };\n\n      const data = await api(\n        mode === "register" ? "/api/auth/register" : "/api/auth/login",\n        {\n          method: "POST",\n          body: JSON.stringify(payload)\n        }\n      );',
  'forgot password submit flow'
);

portal = replaceOnce(
  portal,
  '        <h1>{mode === "register" ? "Create your account." : "Welcome back."}</h1>\n        <p>\n          {mode === "register"\n            ? "Create your ICA Software account. Director access is activated after your account is approved."\n            : "Sign in to open the Director console after your Urban Director Studio access has been activated."}\n        </p>',
  '        <h1>{mode === "register" ? "Create your account." : mode === "forgot" ? "Reset your password." : "Welcome back."}</h1>\n        <p>\n          {mode === "register"\n            ? "Create your ICA Software account. Director access is activated after your account is approved."\n            : mode === "forgot"\n              ? "Enter the email on your ICA Software account. We will send you a secure 30-minute reset link."\n              : "Sign in to open the Director console after your Urban Director Studio access has been activated."}\n        </p>',
  'auth heading copy'
);

portal = replaceOnce(
  portal,
  '        <div className="sp-auth-mode-switch">\n          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setStatus(""); setTurnstileToken(""); setTurnstileResetKey(value => value + 1); }}>\n            LOGIN\n          </button>\n          <button type="button" className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setStatus(""); setTurnstileToken(""); setTurnstileResetKey(value => value + 1); }}>\n            CREATE ACCOUNT\n          </button>\n        </div>',
  '        <div className="sp-auth-mode-switch">\n          <button type="button" className={mode === "login" ? "active" : ""} onClick={() => { setMode("login"); setStatus(""); setTurnstileToken(""); setTurnstileResetKey(value => value + 1); }}>\n            LOGIN\n          </button>\n          <button type="button" className={mode === "register" ? "active" : ""} onClick={() => { setMode("register"); setStatus(""); setTurnstileToken(""); setTurnstileResetKey(value => value + 1); }}>\n            CREATE ACCOUNT\n          </button>\n        </div>\n\n        {mode === "forgot" && (\n          <button type="button" className="sp-secondary" onClick={() => { setMode("login"); setStatus(""); setTurnstileToken(""); setTurnstileResetKey(value => value + 1); }}>\n            ← BACK TO LOGIN\n          </button>\n        )}',
  'auth mode switch'
);

portal = replaceOnce(
  portal,
  '          <label>\n            PASSWORD\n            <input\n              type="password"\n              value={password}\n              onChange={event => setPassword(event.target.value)}\n              autoComplete={mode === "register" ? "new-password" : "current-password"}\n              minLength={8}\n              required\n            />\n          </label>',
  '          {mode !== "forgot" && (\n            <label>\n              PASSWORD\n              <input\n                type="password"\n                value={password}\n                onChange={event => setPassword(event.target.value)}\n                autoComplete={mode === "register" ? "new-password" : "current-password"}\n                minLength={8}\n                required\n              />\n            </label>\n          )}\n\n          {mode === "login" && (\n            <button\n              type="button"\n              className="sp-secondary"\n              onClick={() => { setMode("forgot"); setStatus(""); setTurnstileToken(""); setTurnstileResetKey(value => value + 1); }}\n            >\n              FORGOT PASSWORD?\n            </button>\n          )}',
  'password field and forgot button'
);

portal = replaceOnce(
  portal,
  '          <TurnstileWidget\n            action={mode === "register" ? "register" : "login"}',
  '          <TurnstileWidget\n            action={mode === "register" ? "register" : mode === "forgot" ? "password_reset" : "login"}',
  'turnstile forgot action'
);

portal = replaceOnce(
  portal,
  '          <button className="sp-auth-submit" disabled={busy || !turnstileToken}>\n            {mode === "register" ? <UserPlus size={17}/> : <LogIn size={17}/>}\n            {busy ? "PLEASE WAIT..." : mode === "register" ? "CREATE ACCOUNT" : "LOGIN"}\n          </button>',
  '          <button className="sp-auth-submit" disabled={busy || !turnstileToken}>\n            {mode === "register" ? <UserPlus size={17}/> : mode === "forgot" ? <Mail size={17}/> : <LogIn size={17}/>}\n            {busy ? "PLEASE WAIT..." : mode === "register" ? "CREATE ACCOUNT" : mode === "forgot" ? "SEND RESET LINK" : "LOGIN"}\n          </button>',
  'auth submit button'
);

const resetPage = String.raw`
function PasswordResetPage() {
  const token = new URLSearchParams(window.location.search).get("token") || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const [complete, setComplete] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setStatus("");

    if (!token) {
      setStatus("This password reset link is missing its security token.");
      return;
    }

    if (password.length < 10) {
      setStatus("Use at least 10 characters for the new password.");
      return;
    }

    if (password !== confirmPassword) {
      setStatus("The two passwords do not match.");
      return;
    }

    setBusy(true);
    try {
      const data = await api("/api/auth/password/reset", {
        method: "POST",
        body: JSON.stringify({ token, password })
      });
      setComplete(true);
      setPassword("");
      setConfirmPassword("");
      setStatus(data.message || "Password updated. You can sign in now.");
      window.history.replaceState({}, "", "/reset-password");
    } catch (error) {
      setStatus(error.message);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="sp-auth-shell">
      <button className="sp-auth-back" onClick={() => go("/login")}>← Back to login</button>
      <div className="sp-auth-card">
        <div className="sp-auth-logo"><LockKeyhole size={26}/></div>
        <span className="sp-kicker">ICA SOFTWARE ACCOUNT</span>
        <h1>{complete ? "Password updated." : "Choose a new password."}</h1>
        <p>
          {complete
            ? "Your ICA Software password has been changed and old signed-in sessions were closed."
            : "This changes the password on your shared ICA Software account."}
        </p>

        {!complete && (
          <form onSubmit={submit}>
            <label>
              NEW PASSWORD
              <input
                type="password"
                value={password}
                onChange={event => setPassword(event.target.value)}
                autoComplete="new-password"
                minLength={10}
                required
              />
            </label>
            <label>
              CONFIRM NEW PASSWORD
              <input
                type="password"
                value={confirmPassword}
                onChange={event => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={10}
                required
              />
            </label>
            {status && <div className="sp-auth-error">{status}</div>}
            <button className="sp-auth-submit" disabled={busy}>
              <LockKeyhole size={17}/>
              {busy ? "UPDATING..." : "UPDATE PASSWORD"}
            </button>
          </form>
        )}

        {complete && (
          <>
            {status && <div className="sp-auth-error">{status}</div>}
            <button className="sp-auth-submit" type="button" onClick={() => go("/login")}>
              <LogIn size={17}/> RETURN TO LOGIN
            </button>
          </>
        )}
      </div>
    </div>
  );
}
`;

portal = replaceOnce(
  portal,
  'function AccessStatusPage({ user, onLogout, onDeleteAccount }) {',
  `${resetPage}\nfunction AccessStatusPage({ user, onLogout, onDeleteAccount }) {`,
  'password reset page component'
);

portal = replaceOnce(
  portal,
  '  if (cleanPath === "/login") {',
  '  if (cleanPath === "/reset-password") {\n    return <PasswordResetPage/>;\n  }\n\n  if (cleanPath === "/login") {',
  'reset-password route'
);

fs.writeFileSync(portalPath, portal);

// ---- Wrangler: verified Resend sender ----
const wranglerPath = 'wrangler.jsonc';
let wrangler = fs.readFileSync(wranglerPath, 'utf8');
wrangler = replaceOnce(
  wrangler,
  '    "APP_STORE_SUBSCRIPTION_PRODUCT_ID": "com.icomputeranything.scenepilot.pro.monthly"\n',
  '    "APP_STORE_SUBSCRIPTION_PRODUCT_ID": "com.icomputeranything.scenepilot.pro.monthly",\n    "ICA_AUTH_FROM_EMAIL": "I Computer Anything <accounts@mail.icomputeranything.com>"\n',
  'ICA auth sender var'
);
fs.writeFileSync(wranglerPath, wrangler);

// ---- Setup note ----
const doc = `# ICA account recovery for Urban Director Studio\n\nUrban Director Studio now includes a real **Forgot Password** flow. Because Director uses the shared ICA SaaS user database, changing this password updates the shared ICA account password used by the other products that authenticate against the same user table.\n\n## One required Cloudflare secret\n\nThe password reset email is sent through Resend. Add the existing Resend API key to the **scenepilot** Worker:\n\n\`\`\`bash\nnpx wrangler secret put RESEND_API_KEY\n\`\`\`\n\nDo not commit the key.\n\nThe sender is configured in \`wrangler.jsonc\` as:\n\n\`I Computer Anything <accounts@mail.icomputeranything.com>\`\n\nThe \`mail.icomputeranything.com\` sending domain must remain verified in Resend.\n\n## Flow\n\n1. User opens **Login → Forgot Password?**\n2. User enters the ICA account email and completes Turnstile.\n3. Director stores only a SHA-256 hash of a random one-time reset token.\n4. Resend emails a link that expires in 30 minutes.\n5. The new password is PBKDF2-hashed with a fresh salt.\n6. Existing shared ICA sessions for that user are invalidated.\n7. The user signs in again with the new password.\n\nThe request endpoint intentionally returns the same success message whether or not the email exists, reducing account-enumeration risk.\n`;
fs.writeFileSync('docs/ACCOUNT_RECOVERY.md', doc);

console.log('Director password recovery applied.');
