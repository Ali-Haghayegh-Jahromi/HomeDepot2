#!/bin/bash
# The AI's database user: can read store_items and nothing else.
# Its password comes from HD_LLM_READER_PASSWORD in the .env file.
set -e
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" <<SQL
CREATE ROLE hd_llm_reader LOGIN PASSWORD '${HD_LLM_READER_PASSWORD}';
REVOKE ALL ON SCHEMA public FROM PUBLIC;
GRANT USAGE ON SCHEMA public TO hd_llm_reader;
GRANT SELECT ON store_items TO hd_llm_reader;
ALTER ROLE hd_llm_reader SET default_transaction_read_only = on;
SQL
