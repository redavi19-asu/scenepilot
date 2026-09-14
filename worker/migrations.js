import migration0001 from "../migrations/0001_ica_saas.sql";
import migration0002 from "../migrations/0002_scenepilot_networks.sql";
import migration0003 from "../migrations/0003_broadcast_destinations.sql";
import migration0004 from "../migrations/0004_dc_live_submission_tokens.sql";
import migration0005 from "../migrations/0005_realtime_publications.sql";
import migration0006 from "../migrations/0006_signal_tickets.sql";
import migration0007 from "../migrations/0007_apple_subscriptions.sql";
import migration0008 from "../migrations/0008_camera_invites.sql";
import migration0009 from "../migrations/0009_realtime_viewers.sql";

const BUNDLED_MIGRATIONS = [
  ["0001_ica_saas.sql", migration0001],
  ["0002_scenepilot_networks.sql", migration0002],
  ["0003_broadcast_destinations.sql", migration0003],
  ["0004_dc_live_submission_tokens.sql", migration0004],
  ["0005_realtime_publications.sql", migration0005],
  ["0006_signal_tickets.sql", migration0006],
  ["0007_apple_subscriptions.sql", migration0007],
  ["0008_camera_invites.sql", migration0008],
  ["0009_realtime_viewers.sql", migration0009]
];

let migrationPromise = null;

async function runBundledMigrations(db) {
  if (!db) {
    throw new Error("Urban Director Studio D1 binding is unavailable.");
  }

  await db.exec(`
    CREATE TABLE IF NOT EXISTS scenepilot_schema_migrations (
      name TEXT PRIMARY KEY,
      applied_at INTEGER NOT NULL
    );
  `);

  const existing = await db.prepare(
    "SELECT name FROM scenepilot_schema_migrations"
  ).all();

  const appliedNames = new Set(
    (existing.results || []).map(row => String(row.name || ""))
  );

  const applied = [];

  for (const [name, sql] of BUNDLED_MIGRATIONS) {
    if (appliedNames.has(name)) continue;

    await db.exec(sql);
    await db.prepare(
      "INSERT OR IGNORE INTO scenepilot_schema_migrations (name, applied_at) VALUES (?, ?)"
    ).bind(name, Date.now()).run();

    applied.push(name);
  }

  const row = await db.prepare(
    "SELECT COUNT(*) AS count FROM scenepilot_schema_migrations"
  ).first();

  return {
    applied,
    count: Number(row?.count || 0),
    expected: BUNDLED_MIGRATIONS.length
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
