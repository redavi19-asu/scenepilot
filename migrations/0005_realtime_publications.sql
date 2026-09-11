PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS scenepilot_realtime_publications (
  room_code TEXT PRIMARY KEY,
  network_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  tracks_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (network_id) REFERENCES scenepilot_networks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_scenepilot_realtime_publications_network
  ON scenepilot_realtime_publications(network_id, updated_at DESC);
