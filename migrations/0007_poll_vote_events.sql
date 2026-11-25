-- Style Wars (M2): cada voto conta. Antes, poll_votes guardava só um voto por telemóvel e por votação
-- (o voto seguinte, 5 min depois, substituía o anterior). Agora cada voto é uma linha nova.
CREATE TABLE IF NOT EXISTS poll_vote_events (
  id INTEGER PRIMARY KEY,
  poll_id INTEGER NOT NULL,
  option_id INTEGER NOT NULL,
  voter_key TEXT NOT NULL,
  voted_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS idx_poll_vote_events_option ON poll_vote_events(option_id);
-- Copia os votos que já existem, para os totais não mudarem.
INSERT INTO poll_vote_events(poll_id,option_id,voter_key) SELECT poll_id,option_id,voter_key FROM poll_votes;
