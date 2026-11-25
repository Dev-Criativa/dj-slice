-- Ban de dispositivos no Farmador de Aura.
-- Guarda de que telemóvel (voter_key) veio cada mensagem nova e a lista de dispositivos banidos por evento.
-- Só adiciona; não altera dados existentes. Mensagens antigas ficam com voter_key NULL (não podem ser banidas).
ALTER TABLE messages ADD COLUMN voter_key TEXT;
CREATE INDEX IF NOT EXISTS idx_messages_event_voter ON messages(event_id,voter_key);
CREATE TABLE IF NOT EXISTS bans (
  event_id INTEGER NOT NULL,
  voter_key TEXT NOT NULL,
  guest_name TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY(event_id,voter_key)
);
