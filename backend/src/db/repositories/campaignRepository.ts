import { randomUUID } from 'node:crypto';
import { getDb } from '../connection';
import type { CampaignRow, CampaignStatus } from '../../types';

export function createCampaign(params: {
  senderEmail: string;
  subject: string;
  draftUid: string | null;
  rawMime: Buffer;
  totalRecipients: number;
  sendRatePerMin: number;
}): CampaignRow {
  const db = getDb();
  const id = randomUUID();
  db.prepare(
    `INSERT INTO campaigns (id, sender_email, subject, draft_uid, raw_mime, status, total_recipients, send_rate_per_min)
     VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)`,
  ).run(id, params.senderEmail, params.subject, params.draftUid, params.rawMime, params.totalRecipients, params.sendRatePerMin);
  return getCampaignById(id)!;
}

export function getCampaignById(id: string): CampaignRow | undefined {
  return getDb().prepare(`SELECT * FROM campaigns WHERE id = ?`).get(id) as CampaignRow | undefined;
}

export function listCampaignsForSender(senderEmail: string): CampaignRow[] {
  return getDb()
    .prepare(`SELECT * FROM campaigns WHERE sender_email = ? ORDER BY created_at DESC`)
    .all(senderEmail) as CampaignRow[];
}

// Any campaign still 'pending' or 'running' in the DB when a sender logs back in was left
// mid-send (or never got to start) by a crash or restart — the in-memory send loop and
// credentials don't survive the process dying — so these are exactly the campaigns to resume.
export function getResumableCampaignsForSender(senderEmail: string): CampaignRow[] {
  return getDb()
    .prepare(`SELECT * FROM campaigns WHERE sender_email = ? AND status IN ('pending', 'running')`)
    .all(senderEmail) as CampaignRow[];
}

export function setCampaignRenderedContent(id: string, html: string | null, text: string | null): void {
  getDb().prepare(`UPDATE campaigns SET rendered_html = ?, rendered_text = ? WHERE id = ?`).run(html, text, id);
}

export function setCampaignStatus(id: string, status: CampaignStatus, extra?: { startedAt?: string; finishedAt?: string; errorMessage?: string }): void {
  const db = getDb();
  db.prepare(
    `UPDATE campaigns SET status = ?, started_at = COALESCE(?, started_at), finished_at = COALESCE(?, finished_at), error_message = COALESCE(?, error_message) WHERE id = ?`,
  ).run(status, extra?.startedAt ?? null, extra?.finishedAt ?? null, extra?.errorMessage ?? null, id);
}

export function incrementCampaignCounts(id: string, field: 'sent_count' | 'failed_count'): void {
  const db = getDb();
  db.prepare(`UPDATE campaigns SET ${field} = ${field} + 1 WHERE id = ?`).run(id);
}

export function updateCampaignSendRate(id: string, sendRatePerMin: number): void {
  getDb().prepare(`UPDATE campaigns SET send_rate_per_min = ? WHERE id = ?`).run(sendRatePerMin, id);
}

export interface CampaignTrackingSummary {
  uniqueOpens: number;
  totalOpens: number;
  uniqueClicks: number;
  totalClicks: number;
}

export function getCampaignTrackingSummary(campaignId: string): CampaignTrackingSummary {
  const db = getDb();
  const row = db
    .prepare(
      `SELECT
         SUM(CASE WHEN opened_at IS NOT NULL THEN 1 ELSE 0 END) AS uniqueOpens,
         SUM(open_count) AS totalOpens,
         SUM(CASE WHEN clicked_at IS NOT NULL THEN 1 ELSE 0 END) AS uniqueClicks,
         SUM(click_count) AS totalClicks
       FROM campaign_recipients WHERE campaign_id = ?`,
    )
    .get(campaignId) as Record<string, number | null>;
  return {
    uniqueOpens: row.uniqueOpens ?? 0,
    totalOpens: row.totalOpens ?? 0,
    uniqueClicks: row.uniqueClicks ?? 0,
    totalClicks: row.totalClicks ?? 0,
  };
}
