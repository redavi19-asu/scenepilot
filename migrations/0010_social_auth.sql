CREATE TABLE IF NOT EXISTS social_auth_states (
  state_hash TEXT PRIMARY KEY,
  provider TEXT NOT NULL CHECK (provider IN ('google','microsoft','apple')),
  code_verifier TEXT NOT NULL,
  nonce TEXT NOT NULL,
  return_path TEXT NOT NULL DEFAULT '/app',
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS social_auth_states_expiry_idx ON social_auth_states(expires_at);

CREATE TABLE IF NOT EXISTS social_identities (
  provider TEXT NOT NULL CHECK (provider IN ('google','microsoft','apple')),
  provider_subject TEXT NOT NULL,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  PRIMARY KEY (provider, provider_subject),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS social_identities_user_idx ON social_identities(user_id);
