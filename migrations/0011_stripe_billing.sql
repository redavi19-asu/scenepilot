CREATE TABLE IF NOT EXISTS director_stripe_customers (
  user_id TEXT PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL UNIQUE
);
CREATE TABLE IF NOT EXISTS director_stripe_subscriptions (
  subscription_id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  customer_id TEXT NOT NULL, status TEXT NOT NULL, period_start INTEGER NOT NULL,
  expires_at INTEGER NOT NULL, updated_at INTEGER NOT NULL
);
CREATE INDEX IF NOT EXISTS director_stripe_subscriptions_user ON director_stripe_subscriptions(user_id);
CREATE TABLE IF NOT EXISTS director_stripe_events (id TEXT PRIMARY KEY, processed_at INTEGER NOT NULL);
