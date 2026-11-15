-- Home Depot guide-robot demo: the AI model chain's memory (see "The model chain" in WORKFLOW_EXPLAINED.md).
-- Runs automatically on an empty database volume; ./start.sh (docker/lib.sh) also applies it to an existing
-- database. Safe to run again.
--
-- Each AI call tries the models of Config.gemini_models in order, then Claude. A model that answers 429 (out of
-- quota / rate limit), 503 / 529 (overloaded) or times out "rests": the workflow writes resting_until here
-- (node "Remember: the model rests") and later calls skip it until then (node "Which AI models are resting?").
CREATE TABLE IF NOT EXISTS ai_model_status (
    model           TEXT PRIMARY KEY,           -- e.g. gemini-flash-lite-latest, claude-sonnet-5-5
    provider        TEXT NOT NULL,              -- gemini | claude
    resting_until   TIMESTAMPTZ,                -- skipped until then (still tried as a last resort)
    reason          TEXT,                       -- quota_day | quota | busy | timeout | model | key
    http_code       TEXT,
    detail          TEXT,                       -- the start of the error message
    failures        INTEGER NOT NULL DEFAULT 0, -- failures that made it rest, in all
    last_failure_at TIMESTAMPTZ,
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
