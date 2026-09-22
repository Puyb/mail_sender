-- Persist the tracking-rewritten body (not just the raw draft MIME) so an interrupted
-- campaign can resume sending without re-running link rewriting a second time, which
-- would otherwise mint duplicate campaign_links rows for the same URLs.
ALTER TABLE campaigns ADD COLUMN rendered_html TEXT;
ALTER TABLE campaigns ADD COLUMN rendered_text TEXT;
