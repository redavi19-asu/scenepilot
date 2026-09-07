PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS scenepilot_broadcast_destinations (
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
);

CREATE TABLE IF NOT EXISTS scenepilot_broadcast_events (
  id TEXT PRIMARY KEY,
  network_id TEXT NOT NULL,
  action TEXT NOT NULL,
  destinations_json TEXT NOT NULL DEFAULT '[]',
  status TEXT NOT NULL DEFAULT 'pending',
  detail TEXT,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (network_id) REFERENCES scenepilot_networks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scenepilot_broadcast_events_network
  ON scenepilot_broadcast_events(network_id, created_at DESC);
