-- PIN do DJ definido no painel de admin (guardado como hash) e sessões do ecrã do DJ.
-- Só cria tabelas novas.
CREATE TABLE IF NOT EXISTS dj_access (
  event_id INTEGER PRIMARY KEY,
  pin_hash TEXT NOT NULL,
  salt TEXT NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE TABLE IF NOT EXISTS dj_sessions (
  token_hash TEXT PRIMARY KEY,
  event_id INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_dj_sessions_event ON dj_sessions(event_id);
