PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS scenepilot_signal_tickets (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  network_id TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (network_id) REFERENCES scenepilot_networks(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS scenepilot_signal_tickets_expiry_idx
  ON scenepilot_signal_tickets(expires_at);
