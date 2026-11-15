-- Home Depot guide-robot demo: tables.
-- Runs automatically the first time the PostgreSQL container starts (empty data volume).

-- ---------------------------------------------------------------------------
-- 1. The store's items. This is the ONLY table the AI is allowed to read.
-- ---------------------------------------------------------------------------
CREATE TABLE store_items (
    sku          TEXT PRIMARY KEY,                 -- store SKU, e.g. '204-279'
    item_name    TEXT NOT NULL,
    item_url     TEXT NOT NULL,                    -- link to the Home Depot website
    price        NUMERIC(8, 2) NOT NULL CHECK (price > 0),   -- US dollars
    aisle        INTEGER NOT NULL,                 -- 1-12
    shelf        INTEGER NOT NULL,                 -- bay number in that aisle, 1-16
    tag_code     TEXT NOT NULL UNIQUE,             -- the light-up shelf tag of this item
    -- extra details shown to the customer and used by the AI to match items
    department   TEXT NOT NULL,
    category     TEXT NOT NULL,                    -- kind of item, e.g. 'deck screws'
    brand        TEXT NOT NULL,
    quality_tier TEXT NOT NULL CHECK (quality_tier IN ('good', 'better', 'best')),
    description  TEXT NOT NULL,
    specs        TEXT NOT NULL
);

-- ---------------------------------------------------------------------------
-- 2. Where each aisle + shelf is on the robot's map (not visible to the AI).
-- ---------------------------------------------------------------------------
CREATE TABLE shelf_locations (
    aisle   INTEGER NOT NULL,
    shelf   INTEGER NOT NULL,
    x       DOUBLE PRECISION NOT NULL,   -- where the robot stops (map frame, metres)
    y       DOUBLE PRECISION NOT NULL,
    yaw     DOUBLE PRECISION NOT NULL,   -- which way it faces there (radians)
    light_x DOUBLE PRECISION NOT NULL,   -- where the shelf-tag light is
    light_y DOUBLE PRECISION NOT NULL,
    light_z DOUBLE PRECISION NOT NULL,
    PRIMARY KEY (aisle, shelf)
);

-- ---------------------------------------------------------------------------
-- 3. Workflow memory (not visible to the AI's database user).
-- ---------------------------------------------------------------------------
-- One row per customer visit (kiosk button press -> robot back home).
CREATE TABLE sessions (
    session_id    TEXT PRIMARY KEY,                     -- random id, part of the phone link
    status        TEXT NOT NULL DEFAULT 'active'
                  CHECK (status IN ('active', 'ended', 'timed_out')),
    screen        TEXT NOT NULL DEFAULT 'input',        -- what the phone shows now (see API_CONTRACT.md)
    screen_data   JSONB NOT NULL DEFAULT '{}',          -- the content of that screen
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_input_at TIMESTAMPTZ NOT NULL DEFAULT now(),   -- last customer action: the 10-minute timeout counts from here
    ended_at      TIMESTAMPTZ,
    rev           INTEGER NOT NULL DEFAULT 0            -- +1 on every save; a save from a run that loaded an older rev is refused (06_session_rev.sql)
);

-- One row per thing the customer asks for help with (a visit can have several).
CREATE TABLE requests (
    request_id    SERIAL PRIMARY KEY,
    session_id    TEXT NOT NULL REFERENCES sessions (session_id),
    title         TEXT,                                 -- short name of the job, e.g. 'Replace a cracked deck board'
    status        TEXT NOT NULL DEFAULT 'understanding'
                  CHECK (status IN ('understanding', 'choosing', 'guiding', 'completed')),
    budget        NUMERIC(8, 2),                        -- total for the job, if known
    suggested     JSONB NOT NULL DEFAULT '[]',          -- the item list shown to the customer
    chosen_items  JSONB NOT NULL DEFAULT '[]',          -- the items the customer picked, in their order, with shelf positions
    current_index INTEGER NOT NULL DEFAULT 0,           -- which chosen item the robot is on
    repair_steps  JSONB NOT NULL DEFAULT '[]',          -- up to 6 steps
    video_links   JSONB NOT NULL DEFAULT '[]',          -- [{title, url}]
    created_at    TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX requests_session ON requests (session_id, request_id);

-- The whole conversation of a visit, in order, including irrelevant inputs.
CREATE TABLE messages (
    message_id  SERIAL PRIMARY KEY,
    session_id  TEXT NOT NULL REFERENCES sessions (session_id),
    request_id  INTEGER REFERENCES requests (request_id),
    role        TEXT NOT NULL CHECK (role IN ('customer', 'assistant')),
    kind        TEXT NOT NULL,           -- input | question | items | sorry | choice | steps
    content     TEXT NOT NULL,           -- the text (for photos/voice: what the AI understood from them)
    relevant    BOOLEAN,                 -- relevancy check result, for customer inputs
    has_image   BOOLEAN NOT NULL DEFAULT false,
    has_audio   BOOLEAN NOT NULL DEFAULT false,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX messages_session ON messages (session_id, message_id);
