const RESET_TTL_MS = 30 * 60 * 1000;
const PASSWORD_ITERATIONS = 100000;
const TURNSTILE_VERIFY_URL = "https://challenges.cloudflare.com/turnstile/v0/siteverify";
const RESEND_EMAIL_URL = "https://api.resend.com/emails";

const NATIVE_APP_ORIGINS = new Set([
  "capacitor://localhost",
  "ionic://localhost",
  "http://localhost",
  "https://localhost"
]);

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store"
    }
  });
}

function normalizeEmail(value = "") {
  return String(value).trim().toLowerCase();
}

function isNativeAppRequest(request) {
  const platform = String(request.headers.get("X-Urban-Director-Platform") || "").toLowerCase();
  const origin = String(request.headers.get("Origin") || "").trim();
  return (platform === "ios" || platform === "android") && NATIVE_APP_ORIGINS.has(origin);
}

function bytesToHex(bytes) {
  return [...bytes].map(value => value.toString(16).padStart(2, "0")).join("");
}

function hexToBytes(hex) {
  const clean = String(hex || "");
  const bytes = new Uint8Array(clean.length / 2);
  for (let index = 0; index < bytes.length; index++) {
    bytes[index] = Number.parseInt(clean.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

function randomToken(size = 32) {
  const bytes = new Uint8Array(size);
  crypto.getRandomValues(bytes);
  return bytesToHex(bytes);
}

async function sha256(value) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(String(value || ""))
  );
  return bytesToHex(new Uint8Array(digest));
}

async function hashPassword(password, saltHex = null) {
  const salt = saltHex
    ? hexToBytes(saltHex)
    : crypto.getRandomValues(new Uint8Array(16));

  const material = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"]
  );

  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt,
      iterations: PASSWORD_ITERATIONS
    },
    material,
    256
  );

  return {
    salt: bytesToHex(salt),
    hash: bytesToHex(new Uint8Array(bits))
  };
}

async function readJson(request) {
  try {
    return await request.json();
  } catch {
    return {};
  }
}

async function verifyTurnstile(request, env, token) {
  if (isNativeAppRequest(request)) return null;

  const secret = String(env.TURNSTILE_SECRET_KEY || "").trim();
  if (!secret) {
    return json({ error: "Cloudflare Turnstile is not configured for Urban Director Studio yet." }, 503);
  }

  const responseToken = String(token || "").trim();
  if (!responseToken) {
    return json({ error: "Complete the Cloudflare security check before continuing." }, 400);
  }

  try {
    const form = new FormData();
    form.set("secret", secret);
    form.set("response", responseToken);
    const remoteIp = request.headers.get("CF-Connecting-IP");
    if (remoteIp) form.set("remoteip", remoteIp);

    const response = await fetch(TURNSTILE_VERIFY_URL, { method: "POST", body: form });
    if (!response.ok) {
      return json({ error: "Security verification is temporarily unavailable." }, 503);
    }

    const result = await response.json();
    if (!result.success || (result.action && result.action !== "password_reset")) {
      return json({ error: "Security verification failed. Please try again." }, 403);
    }
  } catch (error) {
    console.error("Urban Director password-reset Turnstile error", error);
    return json({ error: "Security verification is temporarily unavailable." }, 503);
  }

  return null;
}

async function ensureSchema(env) {
  if (!env.DB) throw new Error("ICA account database is unavailable.");

  await env.DB.batch([
    env.DB.prepare(
      `CREATE TABLE IF NOT EXISTS ica_password_resets (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        used_at INTEGER,
        created_at INTEGER NOT NULL
      )`
    ),
    env.DB.prepare(
      `CREATE INDEX IF NOT EXISTS ica_password_resets_user_idx
       ON ica_password_resets(user_id, created_at DESC)`
    )
  ]);
}

function emailConfig(env) {
  return {
    apiKey: String(env.RESEND_API_KEY || "").trim(),
    from: String(
      env.ICA_AUTH_FROM_EMAIL ||
      "I Computer Anything <accounts@mail.icomputeranything.com>"
    ).trim(),
    publicOrigin: String(
      env.ICA_AUTH_PUBLIC_ORIGIN ||
      "https://scenepilot.ryanedavis.workers.dev"
    ).replace(/\/+$/, "")
  };
}

async function sendResetEmail(env, email, resetUrl) {
  const config = emailConfig(env);
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
        `A password reset was requested for your I Computer Anything software account. ` +
        `Use this link within 30 minutes: ${resetUrl}\n\n` +
        "If you did not request this, you can ignore this email.",
      html: `
        <div style="font-family:Arial,sans-serif;background:#090b10;color:#f7f7f7;padding:32px;border-radius:18px">
          <h2 style="margin:0 0 12px">Reset your ICA Software password</h2>
          <p style="color:#c7cbd4;line-height:1.6">A password reset was requested for your I Computer Anything software account.</p>
          <p style="margin:26px 0"><a href="${resetUrl}" style="display:inline-block;background:#f4b942;color:#090b10;text-decoration:none;font-weight:800;padding:13px 20px;border-radius:10px">RESET PASSWORD</a></p>
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

export async function requestPasswordReset(request, env) {
  if (!env.DB) return json({ error: "ICA account database is unavailable." }, 503);

  const body = await readJson(request);
  const turnstileError = await verifyTurnstile(request, env, body.turnstileToken);
  if (turnstileError) return turnstileError;

  const email = normalizeEmail(body.email);
  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return json({ error: "Enter a valid email address." }, 400);
  }

  const config = emailConfig(env);
  if (!config.apiKey || !config.from) {
    return json({
      error: "Account recovery email is not configured yet. Add the RESEND_API_KEY Cloudflare secret."
    }, 503);
  }

  await ensureSchema(env);
  const now = Date.now();
  await env.DB.prepare(
    "DELETE FROM ica_password_resets WHERE expires_at <= ? OR used_at IS NOT NULL"
  ).bind(now).run();

  const user = await env.DB.prepare(
    "SELECT id, email, status FROM users WHERE email = ? LIMIT 1"
  ).bind(email).first();

  const message =
    "If an ICA Software account exists for that email, a password reset link has been sent.";

  if (!user || user.status !== "active") {
    return json({ ok: true, message });
  }

  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const expiresAt = now + RESET_TTL_MS;

  await env.DB.batch([
    env.DB.prepare("DELETE FROM ica_password_resets WHERE user_id = ?").bind(user.id),
    env.DB.prepare(
      `INSERT INTO ica_password_resets (
        token_hash, user_id, expires_at, created_at
      ) VALUES (?, ?, ?, ?)`
    ).bind(tokenHash, user.id, expiresAt, now)
  ]);

  const resetUrl =
    `${config.publicOrigin}/reset-password?token=${encodeURIComponent(token)}`;

  try {
    await sendResetEmail(env, user.email, resetUrl);
  } catch (error) {
    await env.DB.prepare(
      "DELETE FROM ica_password_resets WHERE token_hash = ?"
    ).bind(tokenHash).run();
    console.error("ICA password recovery failed", error);
    return json({
      error: error instanceof Error ? error.message : "Password reset email could not be sent."
    }, 503);
  }

  return json({ ok: true, message });
}

export async function resetPassword(request, env) {
  if (!env.DB) return json({ error: "ICA account database is unavailable." }, 503);

  const body = await readJson(request);
  const token = String(body.token || "").trim();
  const password = String(body.password || "");

  if (!token || token.length < 40) {
    return json({ error: "This password reset link is invalid." }, 400);
  }
  if (password.length < 10) {
    return json({ error: "New password must be at least 10 characters." }, 400);
  }

  await ensureSchema(env);
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
    env.DB.prepare("DELETE FROM sessions WHERE user_id = ?").bind(row.user_id)
  ]);

  return json({
    ok: true,
    message: "Password updated. You can sign in with the new password now."
  });
}
