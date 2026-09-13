CREATE TABLE IF NOT EXISTS scenepilot_camera_invites (
  token_hash TEXT PRIMARY KEY,
  network_id TEXT NOT NULL,
  room_code TEXT NOT NULL,
  created_by TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (network_id) REFERENCES scenepilot_networks(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS scenepilot_camera_invites_network_idx
  ON scenepilot_camera_invites(network_id);

CREATE INDEX IF NOT EXISTS scenepilot_camera_invites_expiry_idx
  ON scenepilot_camera_invites(expires_at);
