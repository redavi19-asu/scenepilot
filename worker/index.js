const SESSION_COOKIE = "sp_session";
const SESSION_TTL_MS = 30 * 24 * 60 * 60 * 1000;
const PASSWORD_ITERATIONS = 100000;
const TURNSTILE_VERIFY_URL =
  "https://challenges.cloudflare.com/turnstile/v0/siteverify";

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...extraHeaders
    }
  });
}

function normalizeEmail(value = "") {
  return String(value).trim().toLowerCase();
}

function parseCookies(request) {
  const result = {};
  const header = request.headers.get("Cookie") || "";

  for (const part of header.split(";")) {
    const index = part.indexOf("=");
    if (index === -1) continue;
    const key = part.slice(0, index).trim();
    const value = part.slice(index + 1).trim();
    if (key) result[key] = value;
  }

  return result;
}

function bytesToHex(bytes) {
  return [...bytes]
    .map(value => value.toString(16).padStart(2, "0"))
    .join("");
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
  const bytes = new TextEncoder().encode(value);
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return bytesToHex(new Uint8Array(digest));
}

async function hashPassword(password, saltHex = null) {
  const salt = saltHex
    ? hexToBytes(saltHex)
    : crypto.getRandomValues(new Uint8Array(16));

  const keyMaterial = await crypto.subtle.importKey(
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
    keyMaterial,
    256
  );

  return {
    salt: bytesToHex(salt),
    hash: bytesToHex(new Uint8Array(bits))
  };
}

async function verifyPassword(password, salt, expectedHash) {
  const result = await hashPassword(password, salt);
  return result.hash === expectedHash;
}

function cookieForSession(token) {
  const maxAge = Math.floor(SESSION_TTL_MS / 1000);
  return [
    `${SESSION_COOKIE}=${token}`,
    "Path=/",
    `Max-Age=${maxAge}`,
    "HttpOnly",
    "Secure",
    "SameSite=Lax"
  ].join("; ");
}

function clearSessionCookie() {
  return [
    `${SESSION_COOKIE}=`,
    "Path=/",
    "Max-Age=0",
    "HttpOnly",
    "Secure",
    "SameSite=Lax"
  ].join("; ");
}

function publicUser(row) {
  if (!row) return null;

  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name || "",
    role: row.role || "user",
    status: row.status || "active",
    marketingOptIn: Boolean(row.marketing_opt_in),
    plan: row.plan || "beta",
    accessStatus: row.access_status || "active",
    createdAt: row.created_at || null,
    lastLoginAt: row.last_login_at || null
  };
}

async function getCurrentUser(request, env) {
  if (!env.DB) return null;

  const token = parseCookies(request)[SESSION_COOKIE];
  if (!token) return null;

  const sessionId = await sha256(token);
  const now = Date.now();

  const row = await env.DB.prepare(
    `SELECT
      u.id,
      u.email,
      u.display_name,
      u.role,
      u.status,
      u.marketing_opt_in,
      u.created_at,
      u.last_login_at,
      COALESCE(up.plan, 'beta') AS plan,
      COALESCE(up.access_status, 'active') AS access_status
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    LEFT JOIN user_products up
      ON up.user_id = u.id
      AND up.product_id = 'product_scenepilot'
    WHERE s.id = ?
      AND s.expires_at > ?
    LIMIT 1`
  ).bind(sessionId, now).first();

  if (!row) return null;
  if (row.status !== "active") return null;

  return publicUser(row);
}

async function createSession(env, userId, request) {
  const token = randomToken(32);
  const sessionId = await sha256(token);
  const now = Date.now();
  const expiresAt = now + SESSION_TTL_MS;

  await env.DB.prepare(
    `INSERT INTO sessions (
      id, user_id, expires_at, created_at, user_agent
    ) VALUES (?, ?, ?, ?, ?)`
  ).bind(
    sessionId,
    userId,
    expiresAt,
    now,
    request.headers.get("User-Agent") || ""
  ).run();

  return token;
}

async function requireAdmin(request, env) {
  const user = await getCurrentUser(request, env);

  if (!user || (user.role !== "owner" && user.role !== "admin")) {
    return { user: null, response: json({ error: "Admin access required." }, 403) };
  }

  return { user, response: null };
}

async function readJson(request) {
  try {
    return await request.json();
  } catch (_) {
    return {};
  }
}

async function verifyTurnstile(request, env, token, expectedAction) {
  const secret = String(env.TURNSTILE_SECRET_KEY || "").trim();

  if (!secret) {
    return json({
      error: "Cloudflare Turnstile is not configured for ScenePilot yet."
    }, 503);
  }

  const responseToken = String(token || "").trim();

  if (!responseToken) {
    return json({
      error: "Complete the Cloudflare security check before continuing."
    }, 400);
  }

  try {
    const form = new FormData();
    form.set("secret", secret);
    form.set("response", responseToken);

    const remoteIp =
      request.headers.get("CF-Connecting-IP");

    if (remoteIp) {
      form.set("remoteip", remoteIp);
    }

    const verification = await fetch(
      TURNSTILE_VERIFY_URL,
      {
        method: "POST",
        body: form
      }
    );

    if (!verification.ok) {
      console.error(
        "ScenePilot Turnstile HTTP error",
        verification.status
      );

      return json({
        error: "Security verification is temporarily unavailable."
      }, 503);
    }

    const result = await verification.json();

    if (
      !result.success ||
      (
        result.action &&
        expectedAction &&
        result.action !== expectedAction
      )
    ) {
      console.warn(
        "ScenePilot Turnstile verification failed",
        result["error-codes"] || []
      );

      return json({
        error: "Security verification failed. Please try again."
      }, 403);
    }

    return null;
  } catch (error) {
    console.error(
      "ScenePilot Turnstile verification error",
      error
    );

    return json({
      error: "Security verification is temporarily unavailable."
    }, 503);
  }
}

async function ensureScenePilotProduct(env) {
  await env.DB.prepare(
    `INSERT OR IGNORE INTO products (
      id, slug, name, status, created_at
    ) VALUES (
      'product_scenepilot',
      'scenepilot',
      'ScenePilot',
      'active',
      ?
    )`
  ).bind(Date.now()).run();
}

async function handleRegister(request, env) {
  if (!env.DB) {
    return json({ error: "ICA D1 database is not bound to ScenePilot yet." }, 503);
  }

  const body = await readJson(request);

  const turnstileError = await verifyTurnstile(
    request,
    env,
    body.turnstileToken,
    "register"
  );

  if (turnstileError) return turnstileError;

  const email = normalizeEmail(body.email);
  const displayName = String(body.displayName || "").trim().slice(0, 100);
  const password = String(body.password || "");
  const marketingOptIn = body.marketingOptIn ? 1 : 0;

  if (!displayName) {
    return json({ error: "Enter your name." }, 400);
  }

  if (!/^\S+@\S+\.\S+$/.test(email)) {
    return json({ error: "Enter a valid email address." }, 400);
  }

  if (password.length < 8) {
    return json({ error: "Password must be at least 8 characters." }, 400);
  }

  await ensureScenePilotProduct(env);

  const existing = await env.DB.prepare(
    "SELECT id FROM users WHERE email = ? LIMIT 1"
  ).bind(email).first();

  if (existing) {
    return json({ error: "An account already exists for that email." }, 409);
  }

  const countRow = await env.DB.prepare(
    "SELECT COUNT(*) AS count FROM users"
  ).first();

  const isFirstUser = Number(countRow?.count || 0) === 0;
  const role = isFirstUser ? "owner" : "user";
  const plan = isFirstUser ? "pro" : "beta";
  const accessStatus = isFirstUser ? "active" : "pending";
  const id = crypto.randomUUID();
  const now = Date.now();
  const passwordData = await hashPassword(password);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO users (
        id, email, display_name, password_hash, password_salt,
        role, status, marketing_opt_in, created_at
      ) VALUES (?, ?, ?, ?, ?, ?, 'active', ?, ?)`
    ).bind(
      id,
      email,
      displayName,
      passwordData.hash,
      passwordData.salt,
      role,
      marketingOptIn,
      now
    ),
    env.DB.prepare(
      `INSERT OR IGNORE INTO user_products (
        user_id, product_id, plan, access_status, source, created_at
      ) VALUES (?, 'product_scenepilot', ?, ?, ?, ?)`
    ).bind(
      id,
      plan,
      accessStatus,
      isFirstUser ? "owner-bootstrap" : "beta-signup",
      now
    )
  ]);

  if (!isFirstUser) {
    return json({
      user: null,
      firstOwner: false,
      pendingApproval: true,
      message: "Account created. ScenePilot beta access is waiting for administrator approval."
    }, 201);
  }

  const token = await createSession(env, id, request);

  const user = await getCurrentUser(
    new Request(request.url, {
      headers: {
        Cookie: `${SESSION_COOKIE}=${token}`
      }
    }),
    env
  );

  return json(
    { user, firstOwner: true, pendingApproval: false },
    201,
    { "Set-Cookie": cookieForSession(token) }
  );
}

async function handleLogin(request, env) {
  if (!env.DB) {
    return json({ error: "ICA D1 database is not bound to ScenePilot yet." }, 503);
  }

  const body = await readJson(request);

  const turnstileError = await verifyTurnstile(
    request,
    env,
    body.turnstileToken,
    "login"
  );

  if (turnstileError) return turnstileError;

  const email = normalizeEmail(body.email);
  const password = String(body.password || "");

  const row = await env.DB.prepare(
    `SELECT
      id,
      email,
      password_hash,
      password_salt,
      status
    FROM users
    WHERE email = ?
    LIMIT 1`
  ).bind(email).first();

  if (!row || !(await verifyPassword(password, row.password_salt, row.password_hash))) {
    return json({ error: "Email or password is incorrect." }, 401);
  }

  if (row.status !== "active") {
    return json({ error: "This account is not active." }, 403);
  }

  const now = Date.now();

  await env.DB.prepare(
    "UPDATE users SET last_login_at = ? WHERE id = ?"
  ).bind(now, row.id).run();

  await env.DB.prepare(
    "DELETE FROM sessions WHERE user_id = ? AND expires_at <= ?"
  ).bind(row.id, now).run();

  const token = await createSession(env, row.id, request);

  const user = await getCurrentUser(
    new Request(request.url, {
      headers: {
        Cookie: `${SESSION_COOKIE}=${token}`
      }
    }),
    env
  );

  if (user?.accessStatus !== "active") {
    return json({
      error:
        user?.accessStatus === "pending"
          ? "Your ScenePilot account is waiting for beta approval."
          : "ScenePilot access is suspended for this account."
    }, 403);
  }

  return json(
    { user },
    200,
    { "Set-Cookie": cookieForSession(token) }
  );
}

async function handleLogout(request, env) {
  const token = parseCookies(request)[SESSION_COOKIE];

  if (env.DB && token) {
    const sessionId = await sha256(token);
    await env.DB.prepare(
      "DELETE FROM sessions WHERE id = ?"
    ).bind(sessionId).run();
  }

  return json(
    { ok: true },
    200,
    { "Set-Cookie": clearSessionCookie() }
  );
}

async function handleMe(request, env) {
  if (!env.DB) {
    return json({ error: "ICA D1 database is not bound to ScenePilot yet." }, 503);
  }

  const user = await getCurrentUser(request, env);

  if (!user) {
    return json({ user: null }, 401);
  }

  return json({ user });
}

async function ensureDcLiveSubmissionSchema(env) {
  await env.DB.prepare(
    `CREATE TABLE IF NOT EXISTS dc_live_submission_tokens (
      token_hash TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      network_id TEXT,
      expires_at INTEGER NOT NULL,
      created_at INTEGER NOT NULL,
      FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
      FOREIGN KEY (network_id) REFERENCES scenepilot_networks(id) ON DELETE SET NULL
    )`
  ).run();

  await env.DB.prepare(
    `CREATE INDEX IF NOT EXISTS dc_live_submission_tokens_expiry_idx
     ON dc_live_submission_tokens(expires_at)`
  ).run();
}

async function handleDcLiveSubmissionTicket(request, env) {
  await ensureDcLiveSubmissionSchema(env);
  const auth = await requireScenePilotNetworkMember(request, env);
  if (auth.response) return auth.response;

  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const now = Date.now();
  const expiresAt = now + 6 * 60 * 60 * 1000;

  await env.DB.batch([
    env.DB.prepare(
      "DELETE FROM dc_live_submission_tokens WHERE expires_at <= ?"
    ).bind(now),
    env.DB.prepare(
      `INSERT INTO dc_live_submission_tokens (
        token_hash, user_id, network_id, expires_at, created_at
      ) VALUES (?, ?, ?, ?, ?)`
    ).bind(tokenHash, auth.user.id, auth.network.id, expiresAt, now)
  ]);

  return json({
    token,
    expiresAt,
    creator: {
      id: auth.user.id,
      email: auth.user.email,
      displayName: auth.user.displayName || "",
      role: auth.user.role || "user"
    },
    network: {
      id: auth.network.id,
      name: auth.network.name
    }
  }, 201);
}

async function handleDcLiveVerifyTicket(request, env) {
  await ensureDcLiveSubmissionSchema(env);
  const authorization = String(request.headers.get("Authorization") || "");
  const token = authorization.toLowerCase().startsWith("bearer ")
    ? authorization.slice(7).trim()
    : "";

  if (!token) {
    return json({ valid: false, error: "Submission ticket required." }, 401);
  }

  const tokenHash = await sha256(token);
  const row = await env.DB.prepare(
    `SELECT
      t.user_id,
      t.network_id,
      t.expires_at,
      u.email,
      u.display_name,
      u.role,
      u.status,
      COALESCE(up.access_status, 'active') AS access_status,
      n.name AS network_name
    FROM dc_live_submission_tokens t
    JOIN users u ON u.id = t.user_id
    LEFT JOIN user_products up
      ON up.user_id = u.id
      AND up.product_id = 'product_scenepilot'
    LEFT JOIN scenepilot_networks n ON n.id = t.network_id
    WHERE t.token_hash = ?
      AND t.expires_at > ?
    LIMIT 1`
  ).bind(tokenHash, Date.now()).first();

  if (
    !row ||
    row.status !== "active" ||
    row.access_status !== "active"
  ) {
    return json({ valid: false, error: "Submission ticket is invalid or expired." }, 401);
  }

  return json({
    valid: true,
    expiresAt: row.expires_at,
    creator: {
      id: row.user_id,
      email: row.email,
      displayName: row.display_name || "",
      role: row.role || "user"
    },
    network: {
      id: row.network_id || "",
      name: row.network_name || "ScenePilot Network"
    }
  });
}

async function handleAdminUsers(request, env) {
  const auth = await requireAdmin(request, env);
  if (auth.response) return auth.response;

  const result = await env.DB.prepare(
    `SELECT
      u.id,
      u.email,
      u.display_name,
      u.role,
      u.status,
      u.marketing_opt_in,
      u.created_at,
      u.last_login_at,
      COALESCE(up.plan, 'beta') AS plan,
      COALESCE(up.access_status, 'active') AS access_status
    FROM users u
    LEFT JOIN user_products up
      ON up.user_id = u.id
      AND up.product_id = 'product_scenepilot'
    ORDER BY u.created_at DESC`
  ).all();

  return json({
    users: (result.results || []).map(publicUser)
  });
}

async function handleAdminAccess(request, env, userId) {
  const auth = await requireAdmin(request, env);
  if (auth.response) return auth.response;

  const body = await readJson(request);
  const allowedPlans = new Set(["beta", "free", "ambassador", "pro"]);
  const allowedAccess = new Set(["pending", "active", "suspended"]);
  const allowedRoles = new Set(["user", "admin"]);

  const plan = allowedPlans.has(body.plan) ? body.plan : "beta";
  const accessStatus = allowedAccess.has(body.accessStatus) ? body.accessStatus : "pending";
  const role = allowedRoles.has(body.role) ? body.role : "user";
  const now = Date.now();

  if (auth.user.id === userId) {
    await env.DB.prepare(
      `INSERT INTO user_products (
        user_id, product_id, plan, access_status, source, created_at
      ) VALUES (?, 'product_scenepilot', ?, ?, 'admin', ?)
      ON CONFLICT(user_id, product_id)
      DO UPDATE SET
        plan = excluded.plan,
        access_status = excluded.access_status`
    ).bind(userId, plan, accessStatus, now).run();

    return json({ ok: true });
  }

  await env.DB.batch([
    env.DB.prepare(
      "UPDATE users SET role = ? WHERE id = ? AND role != 'owner'"
    ).bind(role, userId),
    env.DB.prepare(
      `INSERT INTO user_products (
        user_id, product_id, plan, access_status, source, created_at
      ) VALUES (?, 'product_scenepilot', ?, ?, 'admin', ?)
      ON CONFLICT(user_id, product_id)
      DO UPDATE SET
        plan = excluded.plan,
        access_status = excluded.access_status`
    ).bind(userId, plan, accessStatus, now)
  ]);

  return json({ ok: true });
}

async function handleCampaigns(request, env) {
  const auth = await requireAdmin(request, env);
  if (auth.response) return auth.response;

  if (request.method === "GET") {
    const result = await env.DB.prepare(
      `SELECT id, subject, body_text, status, created_at, sent_at
       FROM email_campaigns
       ORDER BY created_at DESC
       LIMIT 50`
    ).all();

    return json({
      campaigns: (result.results || []).map(row => ({
        id: row.id,
        subject: row.subject,
        bodyText: row.body_text,
        status: row.status,
        createdAt: row.created_at,
        sentAt: row.sent_at
      }))
    });
  }

  const body = await readJson(request);
  const subject = String(body.subject || "").trim().slice(0, 180);
  const bodyText = String(body.bodyText || "").trim().slice(0, 20000);

  if (!subject || !bodyText) {
    return json({ error: "Campaign subject and message are required." }, 400);
  }

  const id = crypto.randomUUID();
  const now = Date.now();

  await env.DB.prepare(
    `INSERT INTO email_campaigns (
      id, subject, body_text, status, created_by, created_at
    ) VALUES (?, ?, ?, 'draft', ?, ?)`
  ).bind(
    id,
    subject,
    bodyText,
    auth.user.id,
    now
  ).run();

  return json({
    campaign: {
      id,
      subject,
      bodyText,
      status: "draft",
      createdAt: now
    }
  }, 201);
}

export class ScenePilotRoom {
  constructor(state, env) {
    this.state = state;
    this.env = env;
    this.sessions = new Map();
    this.cameras = new Map();
    this.activeDirectorId = null;
    this.liveSlots = [];
  }

  async fetch(request) {
    if (request.headers.get("Upgrade")?.toLowerCase() !== "websocket") {
      return new Response("ScenePilot WebSocket endpoint", { status: 426 });
    }

    const pair = new WebSocketPair();
    const client = pair[0];
    const server = pair[1];

    server.accept();

    const session = {
      id: crypto.randomUUID(),
      ws: server,
      role: null,
      canDirect: request.headers.get("X-ScenePilot-Can-Direct") === "1",
      userId: request.headers.get("X-ScenePilot-User-Id") || null,
      displayName: request.headers.get("X-ScenePilot-Display-Name") || "",
      lastSeenAt: Date.now()
    };

    this.sessions.set(session.id, session);

    server.addEventListener("message", event => {
      this.handleMessage(session, event.data);
    });

    server.addEventListener("close", () => {
      this.removeSession(session);
    });

    server.addEventListener("error", () => {
      this.removeSession(session);
    });

    this.send(session, "session:ready", {
      socketId: session.id
    });

    return new Response(null, {
      status: 101,
      webSocket: client
    });
  }

  send(session, event, payload) {
    if (!session?.ws) return;

    try {
      session.ws.send(JSON.stringify({ event, payload }));
    } catch (_) {}
  }

  getActiveDirector() {
    if (!this.activeDirectorId) return null;

    const director = this.sessions.get(this.activeDirectorId) || null;

    if (!director) {
      this.activeDirectorId = null;
      return null;
    }

    if (Date.now() - director.lastSeenAt > 15000) {
      this.removeSession(director);
      return null;
    }

    return director;
  }

  assignSlot(_requestedSlot, sessionId) {
    const allowed = [1, 2, 3, 4, 5, 6, 7, 8, 9];

    const used = new Set(
      [...this.cameras.values()]
        .filter(camera => camera.socketId !== sessionId)
        .map(camera => Number(camera.slotId))
        .filter(Number.isFinite)
    );

    return allowed.find(slot => !used.has(slot)) || 9;
  }

  resetProductionSession() {
    let nextSlot = 1;

    for (const camera of this.cameras.values()) {
      camera.slotId = nextSlot;
      camera.name = `USER ${String(nextSlot).padStart(2, "0")}`;

      const cameraSession = this.sessions.get(camera.socketId);
      if (cameraSession) {
        this.send(cameraSession, "camera:registered", {
          slotId: nextSlot,
          directorAvailable: true
        });
      }

      nextSlot += 1;
      if (nextSlot > 9) break;
    }

    this.liveSlots = [];
  }

  sendChatMessage(session, payload) {
    const text = String(payload.text || "").trim().slice(0, 500);
    if (!text) return;

    const now = Date.now();

    if (session.role === "camera") {
      const director = this.getActiveDirector();

      if (!director) {
        this.send(session, "chat:error", {
          error: "Director is not connected."
        });
        return;
      }

      const camera = this.cameras.get(session.id);

      const message = {
        id: crypto.randomUUID(),
        text,
        ts: now,
        fromRole: "camera",
        fromId: session.id,
        fromName: camera?.name || "CAMERA",
        cameraId: session.id,
        slotId: camera?.slotId || null
      };

      this.send(director, "chat:message", message);
      this.send(session, "chat:message", message);
      return;
    }

    if (
      session.role === "director" &&
      this.activeDirectorId === session.id
    ) {
      const targetId = payload.target || null;

      const message = {
        id: crypto.randomUUID(),
        text,
        ts: now,
        fromRole: "director",
        fromId: session.id,
        fromName: session.displayName || "DIRECTOR",
        cameraId: targetId,
        target: targetId || "all"
      };

      if (targetId) {
        const target = this.sessions.get(targetId);
        if (target?.role === "camera") {
          this.send(target, "chat:message", message);
        }
      } else {
        for (const candidate of this.sessions.values()) {
          if (candidate.role === "camera") {
            this.send(candidate, "chat:message", message);
          }
        }
      }

      this.send(session, "chat:message", message);
    }
  }

  handleMessage(session, raw) {
    let message;

    try {
      message = JSON.parse(raw);
    } catch (_) {
      return;
    }

    const event = message?.event;
    const payload = message?.payload || {};

    session.lastSeenAt = Date.now();

    if (event === "session:heartbeat") {
      // Standby heartbeats also expire an orphaned Director and trigger
      // director:available so another device can claim the room.
      this.getActiveDirector();
      return;
    }

    if (event === "director:join") {
      if (!session.canDirect || session.role === "camera") {
        this.send(session, "director:denied", {
          reason: "auth_required",
          message: "A signed-in ScenePilot account is required for Director mode."
        });
        return;
      }

      const currentDirector = this.getActiveDirector();

      if (currentDirector && currentDirector.id !== session.id) {
        session.role = "standby";

        this.send(session, "director:denied", {
          reason: "director_in_use",
          message: "This production already has an active Director."
        });

        return;
      }

      session.role = "director";
      this.activeDirectorId = session.id;

      // Every Director login starts a clean production session.
      // Keep connected sources, but renumber them from CAM 01 and clear names.
      this.resetProductionSession();

      this.send(session, "director:granted", {
        socketId: session.id
      });

      this.send(
        session,
        "room:cameras",
        [...this.cameras.values()]
      );

      for (const candidate of this.sessions.values()) {
        if (candidate.role === "camera") {
          this.send(candidate, "intercom:director", {
            directorId: session.id
          });
        }
      }

      return;
    }

    if (event === "director:focus") {
      if (
        session.role === "director" &&
        this.activeDirectorId === session.id
      ) {
        this.send(
          session,
          "room:cameras",
          [...this.cameras.values()]
        );
      }

      return;
    }

    if (event === "camera:join") {
      if (session.role === "director") {
        return;
      }

      session.role = "camera";

      const slotId = this.assignSlot(
        payload.slotId,
        session.id
      );

      const camera = {
        socketId: session.id,
        name: `USER ${String(slotId).padStart(2, "0")}`,
        connected: true,
        slotId,
        battery: null,
        charging: null,
        network: null,
        telemetryConsent: false,
        telemetrySupport: null
      };

      this.cameras.set(session.id, camera);

      const director = this.getActiveDirector();

      if (director) {
        this.send(director, "camera:joined", camera);
      }

      this.send(session, "camera:registered", {
        slotId,
        directorAvailable: Boolean(director)
      });

      this.send(session, "intercom:director", {
        directorId: director?.id || null
      });

      if (this.liveSlots.length) {
        this.send(session, "program:update", {
          liveSlots: this.liveSlots
        });
      }

      return;
    }

    if (event === "camera:telemetry") {
      if (session.role !== "camera") return;

      const camera = this.cameras.get(session.id);
      if (!camera) return;

      camera.telemetryConsent = payload.telemetryConsent === true;
      camera.telemetrySupport =
        payload.support && typeof payload.support === "object"
          ? {
              battery: Boolean(payload.support.battery),
              network: Boolean(payload.support.network)
            }
          : null;

      camera.battery =
        camera.telemetryConsent && Number.isFinite(payload.battery)
          ? Math.max(0, Math.min(100, Number(payload.battery)))
          : null;
      camera.charging =
        camera.telemetryConsent && typeof payload.charging === "boolean"
          ? payload.charging
          : null;
      camera.network =
        camera.telemetryConsent &&
        payload.network &&
        typeof payload.network === "object"
          ? {
              bars: Number.isFinite(payload.network.bars)
                ? Math.max(1, Math.min(4, Number(payload.network.bars)))
                : null,
              downlink: Number.isFinite(payload.network.downlink)
                ? Number(payload.network.downlink)
                : null,
              rtt: Number.isFinite(payload.network.rtt)
                ? Number(payload.network.rtt)
                : null,
              effectiveType: payload.network.effectiveType
                ? String(payload.network.effectiveType).slice(0, 20)
                : null
            }
          : null;

      const director = this.getActiveDirector();
      if (director) {
        this.send(director, "camera:telemetry", {
          socketId: session.id,
          battery: camera.battery,
          charging: camera.charging,
          network: camera.network,
          telemetryConsent: camera.telemetryConsent,
          support: camera.telemetrySupport
        });
      }

      return;
    }

    if (event === "chat:send") {
      this.sendChatMessage(session, payload);
      return;
    }

    if (event === "camera:control") {
      if (
        session.role !== "director" ||
        this.activeDirectorId !== session.id
      ) {
        return;
      }

      const target = this.sessions.get(payload.target);
      if (!target || target.role !== "camera") return;
      if (payload.command !== "zoom" && payload.command !== "torch") return;

      if (payload.command === "zoom") {
        this.send(target, "camera:control", {
          command: "zoom",
          action: payload.action === "start" ? "start" : "stop",
          direction: Number(payload.direction) < 0 ? -1 : 1
        });
        return;
      }

      this.send(target, "camera:control", {
        command: "torch",
        enabled: Boolean(payload.enabled)
      });

      return;
    }

    if (event === "intercom:ptt") {
      const active = payload.active === true;

      if (
        session.role === "director" &&
        this.activeDirectorId === session.id
      ) {
        const targetId = payload.target || null;
        const outgoing = {
          from: session.id,
          fromRole: "director",
          active
        };

        if (targetId) {
          const target = this.sessions.get(targetId);
          if (target?.role === "camera") {
            this.send(target, "intercom:ptt", outgoing);
          }
        } else {
          for (const candidate of this.sessions.values()) {
            if (candidate.role === "camera") {
              this.send(candidate, "intercom:ptt", outgoing);
            }
          }
        }

        return;
      }

      if (session.role === "camera") {
        const director = this.getActiveDirector();
        if (!director) return;

        const camera = this.cameras.get(session.id);

        this.send(director, "intercom:ptt", {
          from: session.id,
          fromRole: "camera",
          active,
          slotId: camera?.slotId || null
        });
      }

      return;
    }

    if (
      event === "intercom:offer" ||
      event === "intercom:answer" ||
      event === "intercom:ice"
    ) {
      const target = this.sessions.get(payload.target);
      if (!target) return;

      const directorToCamera =
        session.role === "director" &&
        this.activeDirectorId === session.id &&
        target.role === "camera";

      const cameraToDirector =
        session.role === "camera" &&
        target.id === this.activeDirectorId &&
        target.role === "director";

      if (!directorToCamera && !cameraToDirector) return;

      const forwarded = {
        ...payload,
        from: session.id
      };

      delete forwarded.target;

      this.send(target, event, forwarded);
      return;
    }

    if (
      event === "program:update" &&
      session.role === "director" &&
      this.activeDirectorId === session.id
    ) {
      this.liveSlots = Array.isArray(payload.liveSlots)
        ? payload.liveSlots.map(Number).filter(Number.isFinite)
        : [];

      for (const candidate of this.sessions.values()) {
        if (candidate.role === "camera") {
          this.send(candidate, "program:update", {
            liveSlots: this.liveSlots
          });
        }
      }

      return;
    }

    if (
      event === "webrtc:offer" ||
      event === "webrtc:answer" ||
      event === "webrtc:ice"
    ) {
      const target = this.sessions.get(payload.target);
      if (!target) return;

      const forwarded = {
        ...payload,
        from: session.id
      };

      delete forwarded.target;

      this.send(target, event, forwarded);
    }
  }

  removeSession(session) {
    if (!this.sessions.has(session.id)) return;

    this.sessions.delete(session.id);

    if (session.role === "camera") {
      this.cameras.delete(session.id);

      for (const candidate of this.sessions.values()) {
        if (candidate.role === "director") {
          this.send(candidate, "camera:left", {
            socketId: session.id
          });
        }
      }
    }

    if (this.activeDirectorId === session.id) {
      this.activeDirectorId = null;

      for (const candidate of this.sessions.values()) {
        if (candidate.role === "camera") {
          this.send(candidate, "intercom:director", {
            directorId: null
          });
        }

        if (candidate.role === "standby") {
          this.send(candidate, "director:available", {
            message: "The Director position is available. Refresh to claim it."
          });
        }
      }
    }
  }
}


function slugifyNetwork(value = "") {
  return String(value)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 50) || "network";
}

async function getUserScenePilotNetwork(env, userId) {
  return env.DB.prepare(
    `SELECT
      n.id,
      n.name,
      n.slug,
      n.join_token,
      n.status,
      m.role AS member_role
    FROM scenepilot_network_members m
    JOIN scenepilot_networks n ON n.id = m.network_id
    WHERE m.user_id = ?
      AND n.status = 'active'
    ORDER BY m.created_at ASC
    LIMIT 1`
  ).bind(userId).first();
}

async function ensureUserScenePilotNetwork(env, user) {
  let network = await getUserScenePilotNetwork(env, user.id);
  if (network) return network;

  const now = Date.now();
  const id = crypto.randomUUID();
  const baseName =
    user.role === "owner"
      ? "ICA Owner Network"
      : `${user.displayName || user.email || "ScenePilot"} Network`;
  const slug = `${slugifyNetwork(baseName)}-${id.slice(0, 6)}`;
  const joinToken = randomToken(24);

  await env.DB.batch([
    env.DB.prepare(
      `INSERT INTO scenepilot_networks (
        id, name, slug, join_token, status, created_by, created_at, updated_at
      ) VALUES (?, ?, ?, ?, 'active', ?, ?, ?)`
    ).bind(id, baseName, slug, joinToken, user.id, now, now),
    env.DB.prepare(
      `INSERT INTO scenepilot_network_members (
        network_id, user_id, role, created_at
      ) VALUES (?, ?, 'owner', ?)`
    ).bind(id, user.id, now)
  ]);

  return getUserScenePilotNetwork(env, user.id);
}

async function handleNetwork(request, env) {
  if (!env.DB) {
    return json({ error: "ScenePilot database is unavailable." }, 503);
  }

  const user = await getCurrentUser(request, env);
  if (!user || user.status !== "active" || user.accessStatus !== "active") {
    return json({ error: "ScenePilot account access required." }, 401);
  }

  const network = await ensureUserScenePilotNetwork(env, user);

  return json({
    network: {
      id: network.id,
      name: network.name,
      slug: network.slug,
      joinToken: network.join_token,
      memberRole: network.member_role
    }
  });
}

async function userCanAccessNetwork(env, userId, networkId) {
  if (!userId || !networkId) return false;

  const row = await env.DB.prepare(
    `SELECT 1 AS ok
     FROM scenepilot_network_members m
     JOIN scenepilot_networks n ON n.id = m.network_id
     WHERE m.user_id = ?
       AND m.network_id = ?
       AND n.status = 'active'
     LIMIT 1`
  ).bind(userId, networkId).first();

  return Boolean(row);
}

async function validCameraJoinToken(env, networkId, joinToken) {
  if (!networkId || !joinToken) return false;

  const row = await env.DB.prepare(
    `SELECT 1 AS ok
     FROM scenepilot_networks
     WHERE id = ?
       AND join_token = ?
       AND status = 'active'
     LIMIT 1`
  ).bind(networkId, joinToken).first();

  return Boolean(row);
}


const BROADCAST_DESTINATION_IDS = new Set([
  "facebook",
  "instagram",
  "youtube",
  "twitch",
  "tiktok",
  "self",
  "custom"
]);

function bytesToBase64(bytes) {
  let binary = "";
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function broadcastCryptoKey(secret) {
  const raw = new TextEncoder().encode(String(secret || ""));
  const digest = await crypto.subtle.digest("SHA-256", raw);
  return crypto.subtle.importKey(
    "raw",
    digest,
    { name: "AES-GCM" },
    false,
    ["encrypt", "decrypt"]
  );
}

async function encryptBroadcastSecret(value, secret) {
  const key = await broadcastCryptoKey(secret);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = new TextEncoder().encode(String(value || ""));
  const encrypted = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv },
    key,
    plaintext
  );

  return `${bytesToBase64(iv)}.${bytesToBase64(new Uint8Array(encrypted))}`;
}

async function decryptBroadcastSecret(value, secret) {
  const [ivPart, cipherPart] = String(value || "").split(".");
  if (!ivPart || !cipherPart) return "";

  const key = await broadcastCryptoKey(secret);
  const decrypted = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64ToBytes(ivPart) },
    key,
    base64ToBytes(cipherPart)
  );

  return new TextDecoder().decode(decrypted);
}

async function requireScenePilotNetworkMember(request, env) {
  const user = await getCurrentUser(request, env);

  if (!user || user.status !== "active" || user.accessStatus !== "active") {
    return {
      user: null,
      network: null,
      response: json({ error: "ScenePilot account access required." }, 401)
    };
  }

  const network = await getUserScenePilotNetwork(env, user.id);

  if (!network) {
    return {
      user,
      network: null,
      response: json({ error: "ScenePilot network not found." }, 404)
    };
  }

  return { user, network, response: null };
}

async function handleBroadcastDestinations(request, env) {
  const auth = await requireScenePilotNetworkMember(request, env);
  if (auth.response) return auth.response;

  if (request.method === "GET") {
    const result = await env.DB.prepare(
      `SELECT
        destination_id,
        label,
        rtmp_url,
        stream_key_ciphertext,
        status,
        updated_at
       FROM scenepilot_broadcast_destinations
       WHERE network_id = ?
       ORDER BY destination_id ASC`
    ).bind(auth.network.id).all();

    const destinations = (result.results || []).map(row => ({
      id: row.destination_id,
      label: row.label || "",
      url: row.rtmp_url || "",
      configured: Boolean(row.rtmp_url && row.stream_key_ciphertext),
      status: row.status || "configured",
      updatedAt: row.updated_at || null
    }));

    if (!destinations.some(item => item.id === "self")) {
      destinations.push({
        id: "self",
        label: "ScenePilot Self-Hosted",
        url: "",
        configured: Boolean(String(env.ENCODER_API_URL || "").trim()),
        status: "configured",
        updatedAt: null
      });
    }

    return json({
      network: {
        id: auth.network.id,
        name: auth.network.name
      },
      encoderConnected: Boolean(String(env.ENCODER_API_URL || "").trim()),
      destinations
    });
  }

  const body = await readJson(request);
  const destinationId = String(body.destinationId || "").trim().toLowerCase();
  const label = String(body.label || "").trim().slice(0, 120);
  const url = String(body.url || "").trim().slice(0, 1000);
  const streamKey = String(body.streamKey || "").trim();

  if (!BROADCAST_DESTINATION_IDS.has(destinationId)) {
    return json({ error: "Unsupported broadcast destination." }, 400);
  }

  if (!url) {
    return json({ error: "Enter the RTMP / RTMPS URL." }, 400);
  }

  if (!/^rtmps?:\/\//i.test(url)) {
    return json({ error: "Broadcast URL must begin with rtmp:// or rtmps://." }, 400);
  }

  const existing = await env.DB.prepare(
    `SELECT stream_key_ciphertext
     FROM scenepilot_broadcast_destinations
     WHERE network_id = ? AND destination_id = ?
     LIMIT 1`
  ).bind(auth.network.id, destinationId).first();

  let ciphertext = existing?.stream_key_ciphertext || null;

  if (streamKey) {
    const encryptionSecret = String(env.BROADCAST_CONFIG_KEY || "").trim();
    if (!encryptionSecret) {
      return json({
        error: "Broadcast credential encryption is not configured yet."
      }, 503);
    }
    ciphertext = await encryptBroadcastSecret(streamKey, encryptionSecret);
  }

  if (!ciphertext) {
    return json({ error: "Enter a stream key for this destination." }, 400);
  }

  const now = Date.now();

  await env.DB.prepare(
    `INSERT INTO scenepilot_broadcast_destinations (
      network_id,
      destination_id,
      label,
      rtmp_url,
      stream_key_ciphertext,
      status,
      created_at,
      updated_at
    ) VALUES (?, ?, ?, ?, ?, 'configured', ?, ?)
    ON CONFLICT(network_id, destination_id) DO UPDATE SET
      label = excluded.label,
      rtmp_url = excluded.rtmp_url,
      stream_key_ciphertext = excluded.stream_key_ciphertext,
      status = 'configured',
      updated_at = excluded.updated_at`
  ).bind(
    auth.network.id,
    destinationId,
    label,
    url,
    ciphertext,
    now,
    now
  ).run();

  return json({
    ok: true,
    destination: {
      id: destinationId,
      label,
      url,
      configured: true,
      status: "configured",
      updatedAt: now
    }
  });
}

async function loadBroadcastTargets(env, networkId, destinationIds) {
  if (!destinationIds.length) return [];

  const encryptionSecret = String(env.BROADCAST_CONFIG_KEY || "").trim();
  if (!encryptionSecret) {
    throw new Error("Broadcast credential encryption is not configured.");
  }

  const placeholders = destinationIds.map(() => "?").join(",");
  const result = await env.DB.prepare(
    `SELECT destination_id, label, rtmp_url, stream_key_ciphertext
     FROM scenepilot_broadcast_destinations
     WHERE network_id = ?
       AND destination_id IN (${placeholders})`
  ).bind(networkId, ...destinationIds).all();

  const rows = result.results || [];
  const byId = new Map(rows.map(row => [row.destination_id, row]));
  const targets = [];

  for (const id of destinationIds) {
    if (id === "self") {
      targets.push({
        id: "self",
        label: "ScenePilot Self-Hosted",
        url: "",
        streamKey: ""
      });
      continue;
    }

    const row = byId.get(id);
    if (!row?.rtmp_url || !row?.stream_key_ciphertext) {
      throw new Error(`${id} is not configured for this ScenePilot network.`);
    }

    targets.push({
      id,
      label: row.label || "",
      url: row.rtmp_url,
      streamKey: await decryptBroadcastSecret(
        row.stream_key_ciphertext,
        encryptionSecret
      )
    });
  }

  return targets;
}

async function callEncoder(env, path, payload) {
  const baseUrl = String(env.ENCODER_API_URL || "").trim().replace(/\/+$/, "");
  const token = String(env.ENCODER_API_TOKEN || "").trim();

  if (!baseUrl) {
    return {
      ok: false,
      pending: true,
      status: 503,
      data: {
        error: "ScenePilot encoder backend is not connected yet."
      }
    };
  }

  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      ...(token ? { Authorization: `Bearer ${token}` } : {})
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json().catch(() => ({}));

  return {
    ok: response.ok,
    pending: false,
    status: response.status,
    data
  };
}

async function handleBroadcastControl(request, env, action) {
  const auth = await requireScenePilotNetworkMember(request, env);
  if (auth.response) return auth.response;

  const body = await readJson(request);
  const destinationIds = Array.isArray(body.destinations)
    ? [...new Set(
        body.destinations
          .map(value => String(value || "").trim().toLowerCase())
          .filter(value => BROADCAST_DESTINATION_IDS.has(value))
      )]
    : [];

  if (action === "start" && !destinationIds.length) {
    return json({ error: "Select at least one broadcast destination." }, 400);
  }

  let targets = [];

  try {
    if (action === "start") {
      targets = await loadBroadcastTargets(
        env,
        auth.network.id,
        destinationIds
      );
    }
  } catch (error) {
    return json({
      error: error instanceof Error ? error.message : String(error)
    }, 400);
  }

  const eventId = crypto.randomUUID();
  const now = Date.now();

  const retentionClass = auth.user?.role === "owner" ? "owner" : "temporary";

  const encoderPayload = {
    eventId,
    networkId: auth.network.id,
    networkName: auth.network.name,
    ownerUserId: auth.user?.id || null,
    ownerRole: auth.user?.role || "user",
    retentionClass,
    room: String(body.room || "SP-4827").slice(0, 80),
    destinations: targets
  };

  const encoder = await callEncoder(
    env,
    action === "start" ? "/broadcast/start" : "/broadcast/stop",
    encoderPayload
  );

  await env.DB.prepare(
    `INSERT INTO scenepilot_broadcast_events (
      id,
      network_id,
      action,
      destinations_json,
      status,
      detail,
      created_at
    ) VALUES (?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    eventId,
    auth.network.id,
    action,
    JSON.stringify(destinationIds),
    encoder.ok ? "accepted" : encoder.pending ? "backend_pending" : "failed",
    JSON.stringify(encoder.data || {}),
    now
  ).run();

  if (encoder.pending) {
    return json({
      ok: false,
      pending: true,
      eventId,
      error: encoder.data.error
    }, 503);
  }

  if (!encoder.ok) {
    return json({
      ok: false,
      eventId,
      error: encoder.data.error || "Encoder rejected the broadcast request."
    }, encoder.status || 502);
  }

  return json({
    ok: true,
    eventId,
    status: encoder.data.status || (action === "start" ? "starting" : "stopping"),
    encoder: encoder.data
  });
}

function realtimeConfig(env) {
  const appId = String(env.REALTIME_APP_ID || "").trim();
  const appSecret = String(env.REALTIME_APP_SECRET || "").trim();
  return { appId, appSecret, ready: Boolean(appId && appSecret) };
}

function validRealtimeRoom(value) {
  const room = String(value || "").trim();
  return /^[A-Za-z0-9_-]{1,80}$/.test(room) ? room : "";
}

async function callRealtime(env, path, body = null, method = "POST") {
  const config = realtimeConfig(env);
  if (!config.ready) {
    return { ok: false, status: 503, data: { error: "Cloudflare Realtime is not configured yet." } };
  }

  const response = await fetch(
    `https://rtc.live.cloudflare.com/v1/apps/${encodeURIComponent(config.appId)}${path}`,
    {
      method,
      headers: {
        Authorization: `Bearer ${config.appSecret}`,
        ...(body ? { "Content-Type": "application/json" } : {})
      },
      ...(body ? { body: JSON.stringify(body) } : {})
    }
  );
  const data = await response.json().catch(() => ({}));
  return { ok: response.ok, status: response.status, data };
}

async function createRealtimeSession(env) {
  const result = await callRealtime(env, "/sessions/new");
  if (!result.ok || !result.data?.sessionId) {
    throw new Error(result.data?.errorDescription || result.data?.error || "Could not create a Realtime session.");
  }
  return result.data.sessionId;
}

async function realtimeToken(env, sessionId, expiresAt) {
  const secret = realtimeConfig(env).appSecret;
  const payload = `${sessionId}.${expiresAt}`;
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(payload));
  return `${expiresAt}.${bytesToHex(new Uint8Array(signature))}`;
}

async function validRealtimeToken(env, sessionId, token) {
  const [expiresAtText, signatureHex] = String(token || "").split(".");
  const expiresAt = Number(expiresAtText);
  if (
    !Number.isFinite(expiresAt) ||
    Date.now() > expiresAt ||
    !/^[a-f0-9]{64}$/i.test(signatureHex || "")
  ) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(realtimeConfig(env).appSecret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["verify"]
  );
  return crypto.subtle.verify(
    "HMAC",
    key,
    hexToBytes(signatureHex),
    new TextEncoder().encode(`${sessionId}.${expiresAt}`)
  );
}

async function handleRealtimePublish(request, env) {
  const auth = await requireScenePilotNetworkMember(request, env);
  if (auth.response) return auth.response;

  const body = await readJson(request);
  const room = validRealtimeRoom(body.room);
  if (!room) return json({ error: "Enter a valid ScenePilot room." }, 400);
  if (!realtimeConfig(env).ready) {
    return json({ error: "Cloudflare Realtime is not configured yet." }, 503);
  }

  if (request.method === "DELETE") {
    await env.DB.prepare(
      "DELETE FROM scenepilot_realtime_publications WHERE room_code = ? AND network_id = ?"
    ).bind(room, auth.network.id).run();
    return json({ ok: true });
  }

  const sessionDescription = body.sessionDescription;
  const tracks = Array.isArray(body.tracks)
    ? body.tracks.slice(0, 4).map(track => ({
        location: "local",
        mid: String(track?.mid || "").slice(0, 20),
        trackName: String(track?.trackName || "").slice(0, 200)
      })).filter(track => track.mid && track.trackName)
    : [];

  if (
    sessionDescription?.type !== "offer" ||
    !sessionDescription.sdp ||
    sessionDescription.sdp.length > 1024 * 1024 ||
    !tracks.length
  ) {
    return json({ error: "Realtime publish offer is incomplete." }, 400);
  }

  const sessionId = await createRealtimeSession(env);
  const result = await callRealtime(
    env,
    `/sessions/${encodeURIComponent(sessionId)}/tracks/new`,
    { sessionDescription, tracks }
  );
  if (!result.ok) {
    return json({ error: result.data?.errorDescription || result.data?.error || "Realtime rejected the Program feed." }, result.status);
  }

  const now = Date.now();
  await env.DB.prepare(
    `INSERT INTO scenepilot_realtime_publications (
      room_code, network_id, session_id, tracks_json, created_at, updated_at
    ) VALUES (?, ?, ?, ?, ?, ?)
    ON CONFLICT(room_code) DO UPDATE SET
      network_id = excluded.network_id,
      session_id = excluded.session_id,
      tracks_json = excluded.tracks_json,
      updated_at = excluded.updated_at`
  ).bind(room, auth.network.id, sessionId, JSON.stringify(tracks), now, now).run();

  return json({ ...result.data, sessionId });
}

async function handleRealtimeSubscribe(request, env) {
  const body = await readJson(request);
  const room = validRealtimeRoom(body.room);
  if (!room) return json({ error: "Enter a valid ScenePilot room." }, 400);
  if (!realtimeConfig(env).ready) {
    return json({ error: "Cloudflare Realtime is not configured yet." }, 503);
  }

  const publication = await env.DB.prepare(
    `SELECT session_id, tracks_json
     FROM scenepilot_realtime_publications
     WHERE room_code = ? AND updated_at > ?
     LIMIT 1`
  ).bind(room, Date.now() - 12 * 60 * 60 * 1000).first();
  if (!publication) return json({ error: "Realtime Program is not live." }, 404);

  const publishedTracks = JSON.parse(publication.tracks_json || "[]");
  const tracks = publishedTracks.map(track => ({
    location: "remote",
    sessionId: publication.session_id,
    trackName: track.trackName
  }));
  if (!tracks.length) return json({ error: "Realtime Program has no media tracks." }, 404);

  const sessionId = await createRealtimeSession(env);
  const result = await callRealtime(
    env,
    `/sessions/${encodeURIComponent(sessionId)}/tracks/new`,
    { tracks }
  );
  if (!result.ok) {
    return json({ error: result.data?.errorDescription || result.data?.error || "Realtime subscription failed." }, result.status);
  }

  const expiresAt = Date.now() + 2 * 60 * 1000;
  return json({
    ...result.data,
    sessionId,
    token: await realtimeToken(env, sessionId, expiresAt)
  });
}

async function handleRealtimeRenegotiate(request, env) {
  const body = await readJson(request);
  const sessionId = String(body.sessionId || "").trim();
  if (!realtimeConfig(env).ready) {
    return json({ error: "Cloudflare Realtime is not configured yet." }, 503);
  }
  if (!sessionId || !(await validRealtimeToken(env, sessionId, body.token))) {
    return json({ error: "Realtime subscription authorization expired." }, 403);
  }
  if (
    body.sessionDescription?.type !== "answer" ||
    !body.sessionDescription.sdp ||
    body.sessionDescription.sdp.length > 1024 * 1024
  ) {
    return json({ error: "Realtime subscription answer is incomplete." }, 400);
  }

  const result = await callRealtime(
    env,
    `/sessions/${encodeURIComponent(sessionId)}/renegotiate`,
    { sessionDescription: body.sessionDescription },
    "PUT"
  );
  return result.ok
    ? json(result.data)
    : json({ error: result.data?.errorDescription || result.data?.error || "Realtime negotiation failed." }, result.status);
}

async function handleApi(request, env, url) {
  if (url.pathname === "/api/health" || url.pathname === "/health") {
    let databaseReady = false;
    let userCount = null;

    if (env.DB) {
      try {
        const row = await env.DB.prepare(
          "SELECT COUNT(*) AS count FROM users"
        ).first();
        userCount = Number(row?.count || 0);
        await ensureScenePilotProduct(env);
        databaseReady = true;
      } catch (error) {
        console.error("ScenePilot D1 health check failed", error);
      }
    }

    return json({
      ok: Boolean(env.DB) && databaseReady,
      databaseBound: Boolean(env.DB),
      databaseReady,
      userCount,
      turnstileConfigured: Boolean(
        String(env.TURNSTILE_SECRET_KEY || "").trim()
      ),
      service: "ScenePilot"
    }, Boolean(env.DB) && databaseReady ? 200 : 503);
  }

  if (url.pathname === "/api/network" && request.method === "GET") {
    return handleNetwork(request, env);
  }

  if (
    url.pathname === "/api/broadcast/destinations" &&
    (request.method === "GET" || request.method === "POST")
  ) {
    return handleBroadcastDestinations(request, env);
  }

  if (url.pathname === "/api/broadcast/start" && request.method === "POST") {
    return handleBroadcastControl(request, env, "start");
  }

  if (url.pathname === "/api/broadcast/stop" && request.method === "POST") {
    return handleBroadcastControl(request, env, "stop");
  }

  if (url.pathname === "/api/dc-live/submission-ticket" && request.method === "POST") {
    return handleDcLiveSubmissionTicket(request, env);
  }

  if (url.pathname === "/api/dc-live/verify-ticket" && request.method === "POST") {
    return handleDcLiveVerifyTicket(request, env);
  }

  if (
    url.pathname === "/api/realtime/publish" &&
    (request.method === "POST" || request.method === "DELETE")
  ) {
    return handleRealtimePublish(request, env);
  }

  if (url.pathname === "/api/realtime/subscribe" && request.method === "POST") {
    return handleRealtimeSubscribe(request, env);
  }

  if (url.pathname === "/api/realtime/renegotiate" && request.method === "POST") {
    return handleRealtimeRenegotiate(request, env);
  }

  if (url.pathname === "/api/auth/register" && request.method === "POST") {
    return handleRegister(request, env);
  }

  if (url.pathname === "/api/auth/login" && request.method === "POST") {
    return handleLogin(request, env);
  }

  if (url.pathname === "/api/auth/logout" && request.method === "POST") {
    return handleLogout(request, env);
  }

  if (url.pathname === "/api/auth/me" && request.method === "GET") {
    return handleMe(request, env);
  }

  if (url.pathname === "/api/admin/users" && request.method === "GET") {
    return handleAdminUsers(request, env);
  }

  const accessMatch = url.pathname.match(
    /^\/api\/admin\/users\/([^/]+)\/access$/
  );

  if (accessMatch && request.method === "POST") {
    return handleAdminAccess(
      request,
      env,
      decodeURIComponent(accessMatch[1])
    );
  }

  if (
    url.pathname === "/api/admin/campaigns" &&
    (request.method === "GET" || request.method === "POST")
  ) {
    return handleCampaigns(request, env);
  }

  return json({ error: "API route not found." }, 404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/health") {
      try {
        return await handleApi(request, env, url);
      } catch (error) {
        console.error("ScenePilot health endpoint error", error);
        return json({
          ok: false,
          service: "ScenePilot",
          error: error instanceof Error ? error.message : String(error)
        }, 500);
      }
    }

    if (url.pathname.startsWith("/api/")) {
      try {
        return await handleApi(request, env, url);
      } catch (error) {
        console.error(
          "ScenePilot API unhandled error",
          error
        );

        return json({
          error: "ScenePilot account service error.",
          detail:
            error instanceof Error
              ? error.message
              : String(error)
        }, 500);
      }
    }

    if (url.pathname === "/signal") {
      const room =
        url.searchParams.get("room") || "SP-4827";
      const networkId =
        String(url.searchParams.get("network") || "").trim();
      const joinToken =
        String(url.searchParams.get("join") || "").trim();

      if (!env.DB || !networkId) {
        return json({
          error: "ScenePilot network information is required."
        }, 400);
      }

      let user = null;

      try {
        user = await getCurrentUser(request, env);
      } catch (error) {
        console.error("ScenePilot auth lookup failed", error);
      }

      const memberAccess = Boolean(
        user?.id &&
        await userCanAccessNetwork(env, user.id, networkId)
      );

      const cameraAccess = await validCameraJoinToken(
        env,
        networkId,
        joinToken
      );

      if (!memberAccess && !cameraAccess) {
        return json({
          error: "This ScenePilot network link is invalid or no longer active."
        }, 403);
      }

      const headers = new Headers(request.headers);
      const canDirect = Boolean(
        memberAccess &&
        user &&
        user.status === "active" &&
        user.accessStatus === "active"
      );

      headers.set(
        "X-ScenePilot-Can-Direct",
        canDirect ? "1" : "0"
      );
      headers.set("X-ScenePilot-Network-Id", networkId);

      if (user?.id) {
        headers.set("X-ScenePilot-User-Id", user.id);
      }

      if (user?.displayName) {
        headers.set(
          "X-ScenePilot-Display-Name",
          user.displayName.slice(0, 100)
        );
      }

      const roomIdentity = `${networkId}:${room}`;
      const id = env.ROOMS.idFromName(roomIdentity);
      const roomObject = env.ROOMS.get(id);

      return roomObject.fetch(
        new Request(request, { headers })
      );
    }

    if (env.ASSETS && typeof env.ASSETS.fetch === "function") {
      return env.ASSETS.fetch(request);
    }

    if (
      url.pathname === "/" ||
      url.pathname === "/app" ||
      url.pathname === "/admin"
    ) {
      return new Response(
        `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width,initial-scale=1" />
  <title>ScenePilot</title>
  <style>
    body{margin:0;min-height:100vh;display:grid;place-items:center;background:#0b0d0b;color:#eef1ea;font-family:Arial,sans-serif}
    main{max-width:640px;padding:32px;text-align:center}
    h1{margin:0 0 10px;font-size:42px}
    p{color:#a8aea4;line-height:1.6}
    code{color:#d7ddd2}
  </style>
</head>
<body>
  <main>
    <h1>ScenePilot</h1>
    <p>The ScenePilot Worker is online, but the static asset binding is unavailable in this environment.</p>
    <p>API health remains available at <code>/api/health</code>.</p>
  </main>
</body>
</html>`,
        {
          status: 200,
          headers: {
            "Content-Type": "text/html; charset=utf-8",
            "Cache-Control": "no-store"
          }
        }
      );
    }

    return json({
      error: "ScenePilot route not found.",
      path: url.pathname
    }, 404);
  }
};
