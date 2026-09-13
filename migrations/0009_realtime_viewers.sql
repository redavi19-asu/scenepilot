CREATE TABLE IF NOT EXISTS scenepilot_realtime_viewers (
  session_id TEXT PRIMARY KEY,
  room_code TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS scenepilot_realtime_viewers_room_idx
  ON scenepilot_realtime_viewers(room_code);

CREATE INDEX IF NOT EXISTS scenepilot_realtime_viewers_expiry_idx
  ON scenepilot_realtime_viewers(expires_at);
