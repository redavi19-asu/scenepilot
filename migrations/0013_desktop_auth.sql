CREATE TABLE IF NOT EXISTS director_desktop_auth_codes (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  browser_session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  pkce_challenge TEXT NOT NULL,
  redirect_uri TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS director_desktop_auth_expiry ON director_desktop_auth_codes(expires_at);
