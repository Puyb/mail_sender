ALTER TABLE tracking_events ADD COLUMN is_bot INTEGER NOT NULL DEFAULT 0;
CREATE INDEX IF NOT EXISTS idx_tracking_events_is_bot ON tracking_events(is_bot);
