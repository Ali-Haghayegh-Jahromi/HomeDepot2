-- Home Depot guide-robot demo: a revision number per visit, for safe concurrent saves.
-- Runs automatically on an empty database volume. On an existing database apply it with:
--   docker exec -i hd_postgres psql -U hd_app -d homedepot < database/init/06_session_rev.sql
-- Safe to run again.
--
-- Every n8n run loads the visit, decides, and saves. Two runs for the same visit can overlap (a robot
-- "near" and "arrived" in the same second, a double tap, a timeout while the AI is still answering).
-- "Save state" only writes when the visit is still active and its rev is the one the run loaded,
-- and adds 1 to rev when it writes; a run that lost the race changes nothing and sends no robot orders.
ALTER TABLE sessions ADD COLUMN IF NOT EXISTS rev INTEGER NOT NULL DEFAULT 0;
