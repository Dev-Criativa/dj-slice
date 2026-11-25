-- Contador "há quanto tempo o momento está no ar": hora em que o momento activo começou.
-- Só adiciona uma coluna; eventos existentes ficam com a hora da migração.
ALTER TABLE events ADD COLUMN moment_since TEXT;
UPDATE events SET moment_since=CURRENT_TIMESTAMP WHERE moment_since IS NULL;
-- Tempo total que cada momento esteve no ar (somado ao mudar ou reiniciar o momento).
CREATE TABLE IF NOT EXISTS moment_totals (
  event_id INTEGER NOT NULL,
  moment TEXT NOT NULL,
  seconds INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY(event_id,moment)
);
