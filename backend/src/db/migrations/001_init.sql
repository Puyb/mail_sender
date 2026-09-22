CREATE TABLE IF NOT EXISTS campaigns (
    id                  TEXT PRIMARY KEY,
    sender_email        TEXT NOT NULL,
    subject             TEXT NOT NULL,
    draft_uid           TEXT,
    raw_mime            BLOB NOT NULL,
    status              TEXT NOT NULL CHECK (status IN ('pending','running','completed','failed','cancelled')),
    total_recipients    INTEGER NOT NULL DEFAULT 0,
    sent_count          INTEGER NOT NULL DEFAULT 0,
    failed_count        INTEGER NOT NULL DEFAULT 0,
    send_rate_per_min   INTEGER NOT NULL,
    started_at          TEXT,
    finished_at         TEXT,
    created_at          TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    error_message       TEXT
);
CREATE INDEX IF NOT EXISTS idx_campaigns_sender_email ON campaigns(sender_email);

CREATE TABLE IF NOT EXISTS campaign_recipients (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id         TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    tracking_id         TEXT NOT NULL UNIQUE,
    email               TEXT NOT NULL,
    first_name          TEXT,
    last_name           TEXT,
    status              TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','sent','failed')),
    error_reason        TEXT,
    sent_at             TEXT,
    sort_order          INTEGER NOT NULL,
    opened_at           TEXT,
    open_count          INTEGER NOT NULL DEFAULT 0,
    clicked_at          TEXT,
    click_count         INTEGER NOT NULL DEFAULT 0
);
CREATE INDEX IF NOT EXISTS idx_campaign_recipients_campaign_id ON campaign_recipients(campaign_id);

CREATE TABLE IF NOT EXISTS campaign_links (
    id                  INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_id         TEXT NOT NULL REFERENCES campaigns(id) ON DELETE CASCADE,
    original_url        TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_campaign_links_campaign_id ON campaign_links(campaign_id);

CREATE TABLE IF NOT EXISTS tracking_events (
    id                      INTEGER PRIMARY KEY AUTOINCREMENT,
    campaign_recipient_id   INTEGER NOT NULL REFERENCES campaign_recipients(id) ON DELETE CASCADE,
    event_type              TEXT NOT NULL CHECK (event_type IN ('open','click')),
    link_id                 INTEGER REFERENCES campaign_links(id),
    occurred_at             TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    user_agent              TEXT,
    ip_address              TEXT
);
CREATE INDEX IF NOT EXISTS idx_tracking_events_recipient ON tracking_events(campaign_recipient_id);
