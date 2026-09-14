const MIGRATIONS = [
  {
    name: "0001_ica_saas.sql",
    statements: [
      `CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        display_name TEXT NOT NULL DEFAULT '',
        password_hash TEXT NOT NULL,
        password_salt TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'user',
        status TEXT NOT NULL DEFAULT 'active',
        marketing_opt_in INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        last_login_at TEXT
      )`,
      `CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        created_at TEXT NOT NULL,
        user_agent TEXT NOT NULL DEFAULT '',
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_sessions_expires_at ON sessions(expires_at)`,
      `CREATE TABLE IF NOT EXISTS products (
        id TEXT PRIMARY KEY,
        slug TEXT NOT NULL UNIQUE,
        name TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'active',
        created_at TEXT NOT NULL
      )`,
      `CREATE TABLE IF NOT EXISTS user_products (
        user_id TEXT NOT NULL,
        product_id TEXT NOT NULL,
        plan TEXT NOT NULL DEFAULT 'beta',
        access_status TEXT NOT NULL DEFAULT 'active',
        source TEXT NOT NULL DEFAULT 'manual',
        created_at TEXT NOT NULL,
        expires_at TEXT,
        PRIMARY KEY (user_id, product_id),
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS email_campaigns (
        id TEXT PRIMARY KEY,
        subject TEXT NOT NULL,
        body_text TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'draft',
        created_by TEXT,
        created_at TEXT NOT NULL,
        sent_at TEXT,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )`,
      `INSERT OR IGNORE INTO products (
        id, slug, name, status, created_at
      ) VALUES (
        'product_scenepilot',
        'scenepilot',
        'Urban Director Studio',
        'active',
        datetime('now')
      )`
    ]
  },
  {
    name: "0002_scenepilot_networks.sql",
    statements: [
      `CREATE TABLE IF NOT EXISTS scenepilot_networks (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        slug TEXT NOT NULL UNIQUE,
        join_token TEXT NOT NULL UNIQUE,
        status TEXT NOT NULL DEFAULT 'active',
        created_by TEXT,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
      )`,
      `CREATE TABLE IF NOT EXISTS scenepilot_network_members (
        network_id TEXT NOT NULL,
        user_id TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'admin',
        created_at INTEGER NOT NULL,
        PRIMARY KEY (network_id, user_id),
        FOREIGN KEY (network_id) REFERENCES scenepilot_networks(id) ON DELETE CASCADE,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS idx_scenepilot_network_members_user ON scenepilot_network_members(user_id)`,
      `CREATE INDEX IF NOT EXISTS idx_scenepilot_networks_status ON scenepilot_networks(status)`
    ]
  },
  {
    name: "0003_broadcast_destinations.sql",
    statements: [
      `CREATE TABLE IF NOT EXISTS scenepilot_broadcast_destinations (
        network_id TEXT NOT NULL,
        destination_id TEXT NOT NULL,
        label TEXT NOT NULL DEFAULT '',
        rtmp_url TEXT NOT NULL DEFAULT '',
        stream_key_ciphertext TEXT,
        status TEXT NOT NULL DEFAULT 'configured',
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        PRIMARY KEY (network_id, destination_id),
        FOREIGN KEY (network_id) REFERENCES scenepilot_networks(id) ON DELETE CASCADE
      )`,
      `CREATE TABLE IF NOT EXISTS scenepilot_broadcast_events (
        id TEXT PRIMARY KEY,
        network_id TEXT NOT NULL,
        action TEXT NOT NULL,
        destinations_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'pending',
        detail TEXT,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (network_id) REFERENCES scenepilot_networks(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS idx_scenepilot_broadcast_events_network
       ON scenepilot_broadcast_events(network_id, created_at DESC)`
    ]
  },
  {
    name: "0004_dc_live_submission_tokens.sql",
    statements: [
      `CREATE TABLE IF NOT EXISTS dc_live_submission_tokens (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        network_id TEXT,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (network_id) REFERENCES scenepilot_networks(id) ON DELETE SET NULL
      )`,
      `CREATE INDEX IF NOT EXISTS dc_live_submission_tokens_expiry_idx
       ON dc_live_submission_tokens(expires_at)`
    ]
  },
  {
    name: "0005_realtime_publications.sql",
    statements: [
      `CREATE TABLE IF NOT EXISTS scenepilot_realtime_publications (
        room_code TEXT PRIMARY KEY,
        network_id TEXT NOT NULL,
        session_id TEXT NOT NULL,
        tracks_json TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (network_id) REFERENCES scenepilot_networks(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS idx_scenepilot_realtime_publications_network
       ON scenepilot_realtime_publications(network_id, updated_at DESC)`
    ]
  },
  {
    name: "0006_signal_tickets.sql",
    statements: [
      `CREATE TABLE IF NOT EXISTS scenepilot_signal_tickets (
        token_hash TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        network_id TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        FOREIGN KEY (network_id) REFERENCES scenepilot_networks(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS scenepilot_signal_tickets_expiry_idx
       ON scenepilot_signal_tickets(expires_at)`
    ]
  },
  {
    name: "0007_apple_subscriptions.sql",
    statements: [
      `CREATE TABLE IF NOT EXISTS apple_subscriptions (
        user_id TEXT PRIMARY KEY,
        product_id TEXT NOT NULL,
        original_transaction_id TEXT NOT NULL UNIQUE,
        latest_transaction_id TEXT NOT NULL,
        app_account_token TEXT,
        environment TEXT NOT NULL DEFAULT '',
        purchase_date INTEGER,
        expires_at INTEGER,
        status TEXT NOT NULL DEFAULT 'active',
        last_verified_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS apple_subscriptions_original_transaction_idx
       ON apple_subscriptions(original_transaction_id)`,
      `CREATE INDEX IF NOT EXISTS apple_subscriptions_latest_transaction_idx
       ON apple_subscriptions(latest_transaction_id)`,
      `CREATE INDEX IF NOT EXISTS apple_subscriptions_expires_idx
       ON apple_subscriptions(expires_at)`
    ]
  },
  {
    name: "0008_camera_invites.sql",
    statements: [
      `CREATE TABLE IF NOT EXISTS scenepilot_camera_invites (
        token_hash TEXT PRIMARY KEY,
        network_id TEXT NOT NULL,
        room_code TEXT NOT NULL,
        created_by TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        FOREIGN KEY (network_id) REFERENCES scenepilot_networks(id) ON DELETE CASCADE,
        FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
      )`,
      `CREATE INDEX IF NOT EXISTS scenepilot_camera_invites_network_idx
       ON scenepilot_camera_invites(network_id)`,
      `CREATE INDEX IF NOT EXISTS scenepilot_camera_invites_expiry_idx
       ON scenepilot_camera_invites(expires_at)`
    ]
  },
  {
    name: "0009_realtime_viewers.sql",
    statements: [
      `CREATE TABLE IF NOT EXISTS scenepilot_realtime_viewers (
        session_id TEXT PRIMARY KEY,
        room_code TEXT NOT NULL,
        expires_at INTEGER NOT NULL,
        created_at INTEGER NOT NULL,
        updated_at INTEGER NOT NULL
      )`,
      `CREATE INDEX IF NOT EXISTS scenepilot_realtime_viewers_room_idx
       ON scenepilot_realtime_viewers(room_code)`,
      `CREATE INDEX IF NOT EXISTS scenepilot_realtime_viewers_expiry_idx
       ON scenepilot_realtime_viewers(expires_at)`
    ]
  }
];

let migrationPromise = null;

async function runBundledMigrations(db) {
  if (!db) {
    throw new Error("Urban Director Studio D1 binding is unavailable.");
  }

  await db.prepare(
    `CREATE TABLE IF NOT EXISTS scenepilot_schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    )`
  ).run();

  const existing = await db.prepare(
    "SELECT name FROM scenepilot_schema_migrations"
  ).all();

  const appliedNames = new Set(
    (existing.results || []).map(row => String(row.name || ""))
  );

  const applied = [];

  for (const migration of MIGRATIONS) {
    if (appliedNames.has(migration.name)) continue;

    for (const statement of migration.statements) {
      await db.prepare(statement).run();
    }

    await db.prepare(
      "INSERT OR IGNORE INTO scenepilot_schema_migrations (name, applied_at) VALUES (?, ?)"
    ).bind(migration.name, Date.now()).run();

    applied.push(migration.name);
  }

  const row = await db.prepare(
    "SELECT COUNT(*) AS count FROM scenepilot_schema_migrations"
  ).first();

  return {
    applied,
    count: Number(row?.count || 0),
    expected: MIGRATIONS.length
  };
}

export function ensureBundledMigrations(db) {
  if (!migrationPromise) {
    migrationPromise = runBundledMigrations(db).catch(error => {
      migrationPromise = null;
      throw error;
    });
  }

  return migrationPromise;
}
