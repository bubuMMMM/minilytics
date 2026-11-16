-- iOS / macOS versions were sometimes stored with underscores from Client Hints (`15_0`).
-- Safe, idempotent rewrite to dotted form (`15.0`).
UPDATE sessions
SET os_version = replace(os_version, '_', '.')
WHERE os_version IS NOT NULL AND os_version LIKE '%\_%' ESCAPE '\';
