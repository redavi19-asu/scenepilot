PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS scenepilot_networks (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  slug TEXT NOT NULL UNIQUE,
  join_token TEXT NOT NULL UNIQUE,
  status TEXT NOT NULL DEFAULT 'active',
  created_by TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS scenepilot_network_members (
  network_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'admin',
  created_at INTEGER NOT NULL,
  PRIMARY KEY (network_id, user_id),
  FOREIGN KEY (network_id) REFERENCES scenepilot_networks(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scenepilot_network_members_user
  ON scenepilot_network_members(user_id);

CREATE INDEX IF NOT EXISTS idx_scenepilot_networks_status
  ON scenepilot_networks(status);
