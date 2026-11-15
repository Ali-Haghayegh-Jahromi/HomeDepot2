-- Home Depot guide-robot demo: the event log (for finding bugs; see "Logs and finding bugs" in README.md).
-- Runs automatically on an empty database volume. On an existing database apply it with:
--   docker exec -i hd_postgres psql -U hd_app -d homedepot < database/init/05_event_log.sql
-- Safe to run again.

-- One row per thing that happened in the n8n workflow (the robot service and the demo pages
-- write the same shape of entry to logs/robot_service.jsonl instead).
CREATE TABLE IF NOT EXISTS event_log (
    id           BIGSERIAL PRIMARY KEY,
    ts           TIMESTAMPTZ NOT NULL DEFAULT clock_timestamp(),
    source       TEXT NOT NULL DEFAULT 'n8n',   -- n8n | robot | phone | stage | tool
    level        TEXT NOT NULL DEFAULT 'info',  -- info | warn | error
    session_id   TEXT,
    request_id   INTEGER,
    endpoint     TEXT,                          -- the webhook that started the run, or 'timeout'
    event        TEXT NOT NULL,                 -- e.g. state_saved, ai_call, robot_event, robot_order, call_refused
    details      JSONB NOT NULL DEFAULT '{}',
    duration_ms  INTEGER,
    execution_id TEXT                           -- n8n execution id ($execution.id)
);
CREATE INDEX IF NOT EXISTS event_log_session ON event_log (session_id, id);
CREATE INDEX IF NOT EXISTS event_log_ts ON event_log (ts);

-- Writes a list of entries; never raises (logging must not break the customer's reply).
--   entries: [{event, level?, source?, session_id?, request_id?, details?, duration_ms?, at? (ms since 1970)}]
--   ctx:     {session_id?, request_id?, endpoint?, execution_id?}  (defaults for every entry)
CREATE OR REPLACE FUNCTION log_events(entries jsonb, ctx jsonb DEFAULT '{}'::jsonb) RETURNS integer
LANGUAGE plpgsql AS $fn$
DECLARE n integer := 0;
BEGIN
  BEGIN
    INSERT INTO event_log (ts, source, level, session_id, request_id, endpoint, event, details, duration_ms, execution_id)
    SELECT CASE WHEN jsonb_typeof(e->'at') = 'number' THEN to_timestamp((e->>'at')::float8 / 1000) ELSE clock_timestamp() END,
           coalesce(e->>'source', ctx->>'source', 'n8n'),
           coalesce(e->>'level', 'info'),
           coalesce(e->>'session_id', ctx->>'session_id'),
           CASE WHEN coalesce(e->>'request_id', ctx->>'request_id') ~ '^[0-9]{1,9}$'
                THEN coalesce(e->>'request_id', ctx->>'request_id')::integer END,
           coalesce(e->>'endpoint', ctx->>'endpoint'),
           coalesce(e->>'event', 'unknown'),
           CASE WHEN jsonb_typeof(e->'details') = 'object' THEN e->'details'
                WHEN e ? 'details' THEN jsonb_build_object('value', e->'details') ELSE '{}'::jsonb END,
           CASE WHEN jsonb_typeof(e->'duration_ms') = 'number' THEN round((e->>'duration_ms')::numeric)::integer END,
           coalesce(e->>'execution_id', ctx->>'execution_id')
    FROM jsonb_array_elements(CASE WHEN jsonb_typeof(entries) = 'array' THEN entries ELSE '[]'::jsonb END)
         WITH ORDINALITY AS x(e, ord)
    WHERE jsonb_typeof(e) = 'object'
    ORDER BY ord;
    GET DIAGNOSTICS n = ROW_COUNT;
  EXCEPTION WHEN others THEN
    RAISE WARNING 'log_events failed: %', SQLERRM;
    n := -1;
  END;
  RETURN n;
END
$fn$;

-- The AI's read-only user gets nothing here.
REVOKE ALL ON event_log FROM PUBLIC;
REVOKE ALL ON SEQUENCE event_log_id_seq FROM PUBLIC;
REVOKE ALL ON FUNCTION log_events(jsonb, jsonb) FROM PUBLIC;
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'hd_llm_reader') THEN
    REVOKE ALL ON event_log FROM hd_llm_reader;
    REVOKE ALL ON FUNCTION log_events(jsonb, jsonb) FROM hd_llm_reader;
  END IF;
END $$;
