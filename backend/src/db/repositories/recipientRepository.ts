import { randomUUID } from 'node:crypto';
import { getDb } from '../connection';
import { isBotUserAgent } from '../../tracking/botDetector';
import type { CampaignRecipientRow, Recipient, RecipientStatus } from '../../types';

export function insertRecipients(campaignId: string, recipients: Recipient[]): void {
  const db = getDb();
  const insert = db.prepare(
    `INSERT INTO campaign_recipients (campaign_id, tracking_id, email, first_name, last_name, sort_order)
     VALUES (?, ?, ?, ?, ?, ?)`,
  );
  const insertMany = db.transaction((rows: Recipient[]) => {
    rows.forEach((r, index) => {
      insert.run(campaignId, randomUUID(), r.email, r.firstName ?? null, r.lastName ?? null, index);
    });
  });
  insertMany(recipients);
}

export function getRecipientsForCampaign(campaignId: string): CampaignRecipientRow[] {
  return getDb()
    .prepare(`SELECT * FROM campaign_recipients WHERE campaign_id = ? ORDER BY sort_order ASC`)
    .all(campaignId) as CampaignRecipientRow[];
}

export function getRecipientByTrackingId(trackingId: string): CampaignRecipientRow | undefined {
  return getDb()
    .prepare(`SELECT * FROM campaign_recipients WHERE tracking_id = ?`)
    .get(trackingId) as CampaignRecipientRow | undefined;
}

export function setRecipientStatus(id: number, status: RecipientStatus, errorReason?: string): void {
  const db = getDb();
  db.prepare(
    `UPDATE campaign_recipients SET status = ?, error_reason = ?, sent_at = CASE WHEN ? = 'sent' THEN strftime('%Y-%m-%dT%H:%M:%fZ','now') ELSE sent_at END WHERE id = ?`,
  ).run(status, errorReason ?? null, status, id);
}

export function recordOpen(trackingId: string, meta: { userAgent?: string; ip?: string }): CampaignRecipientRow | undefined {
  const db = getDb();
  const recipient = getRecipientByTrackingId(trackingId);
  if (!recipient) return undefined;
  const isBot = isBotUserAgent(meta.userAgent);
  db.prepare(
    `INSERT INTO tracking_events (campaign_recipient_id, event_type, user_agent, ip_address, is_bot) VALUES (?, 'open', ?, ?, ?)`,
  ).run(recipient.id, meta.userAgent ?? null, meta.ip ?? null, isBot ? 1 : 0);
  // Bot hits (security scanners prefetching the pixel) are logged for audit but must not count
  // toward open stats, which are bot-filtered by construction since they only read opened_at/open_count.
  if (isBot) return recipient;
  const isFirstOpen = recipient.opened_at === null;
  db.prepare(
    `UPDATE campaign_recipients SET open_count = open_count + 1, opened_at = COALESCE(opened_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')) WHERE id = ?`,
  ).run(recipient.id);
  return { ...recipient, opened_at: isFirstOpen ? new Date().toISOString() : recipient.opened_at };
}

export function recordClick(trackingId: string, linkId: number, meta: { userAgent?: string; ip?: string }): CampaignRecipientRow | undefined {
  const db = getDb();
  const recipient = getRecipientByTrackingId(trackingId);
  if (!recipient) return undefined;
  const isBot = isBotUserAgent(meta.userAgent);
  db.prepare(
    `INSERT INTO tracking_events (campaign_recipient_id, event_type, link_id, user_agent, ip_address, is_bot) VALUES (?, 'click', ?, ?, ?, ?)`,
  ).run(recipient.id, linkId, meta.userAgent ?? null, meta.ip ?? null, isBot ? 1 : 0);
  if (isBot) return recipient;
  db.prepare(
    // A click implies the mail was read even if the (often blocked) open pixel never fired.
    `UPDATE campaign_recipients
     SET click_count = click_count + 1,
         clicked_at = COALESCE(clicked_at, strftime('%Y-%m-%dT%H:%M:%fZ','now')),
         opened_at = COALESCE(opened_at, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
     WHERE id = ?`,
  ).run(recipient.id);
  return recipient;
}
