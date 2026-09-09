CREATE TABLE IF NOT EXISTS dc_live_submission_tokens (
  token_hash TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  network_id TEXT,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (network_id) REFERENCES scenepilot_networks(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS dc_live_submission_tokens_expiry_idx
  ON dc_live_submission_tokens(expires_at);
