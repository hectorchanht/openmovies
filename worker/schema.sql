-- OpenMovies API — D1 schema (applied by scripts/deploy-api.py)
CREATE TABLE IF NOT EXISTS users (
  email TEXT PRIMARY KEY,
  created_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS codes (
  email TEXT PRIMARY KEY,
  code_hash TEXT NOT NULL,
  expires_at INTEGER NOT NULL,
  attempts INTEGER NOT NULL DEFAULT 0,
  sent_at INTEGER NOT NULL
);
CREATE TABLE IF NOT EXISTS states (
  email TEXT PRIMARY KEY,
  state TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
-- Anonymous aggregate analytics: title + action + day bucket. No user id,
-- no IP, no user agent — analysis only, never sold (see /privacy).
CREATE TABLE IF NOT EXISTS events (
  day TEXT NOT NULL,
  action TEXT NOT NULL,
  title_id INTEGER,
  count INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (day, action, title_id)
);
