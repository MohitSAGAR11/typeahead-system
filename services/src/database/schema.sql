
CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE TABLE IF NOT EXISTS search_queries (
    id          BIGSERIAL PRIMARY KEY,
    query       TEXT        NOT NULL,
    count       BIGINT      NOT NULL DEFAULT 0,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_search_queries_query
    ON search_queries (LOWER(query));
CREATE INDEX IF NOT EXISTS idx_search_queries_query_prefix
    ON search_queries (LOWER(query) text_pattern_ops);
CREATE INDEX IF NOT EXISTS idx_search_queries_count
    ON search_queries (count DESC);
CREATE INDEX IF NOT EXISTS idx_search_queries_query_count
    ON search_queries (LOWER(query) text_pattern_ops, count DESC);
CREATE TABLE IF NOT EXISTS recent_search_events (
    id          BIGSERIAL   PRIMARY KEY,
    query       TEXT        NOT NULL,
    searched_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_recent_events_time
    ON recent_search_events (searched_at DESC);
CREATE INDEX IF NOT EXISTS idx_recent_events_query_time
    ON recent_search_events (LOWER(query), searched_at DESC);
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;
DROP TRIGGER IF EXISTS trg_search_queries_updated_at ON search_queries;
CREATE TRIGGER trg_search_queries_updated_at
    BEFORE UPDATE ON search_queries
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();
