-- Contador "há quanto tempo o momento está no ar": hora em que o momento activo começou.
-- Só adiciona uma coluna; eventos existentes ficam com a hora da migração.
ALTER TABLE events ADD COLUMN moment_since TEXT;
UPDATE events SET moment_since=CURRENT_TIMESTAMP WHERE moment_since IS NULL;
