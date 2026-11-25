-- Ecrã do DJ: estado de cada música (queued = na lista, playing = a tocar, played = tocada).
-- Só adiciona colunas; as músicas existentes ficam 'queued'.
ALTER TABLE tracks ADD COLUMN play_status TEXT NOT NULL DEFAULT 'queued';
ALTER TABLE tracks ADD COLUMN played_at TEXT;
CREATE INDEX IF NOT EXISTS idx_tracks_event_status ON tracks(event_id,play_status);
