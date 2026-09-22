import { getDb } from '../db/connection';
import type { CampaignLinkRow } from '../types';

export function insertCampaignLink(campaignId: string, originalUrl: string): number {
  const db = getDb();
  const result = db
    .prepare(`INSERT INTO campaign_links (campaign_id, original_url) VALUES (?, ?)`)
    .run(campaignId, originalUrl);
  return Number(result.lastInsertRowid);
}

export function getCampaignLink(linkId: number): CampaignLinkRow | undefined {
  return getDb().prepare(`SELECT * FROM campaign_links WHERE id = ?`).get(linkId) as CampaignLinkRow | undefined;
}

export interface LinkClickStat {
  linkId: number;
  originalUrl: string;
  totalClicks: number;
  uniqueClicks: number;
}

export function getCampaignLinkStats(campaignId: string): LinkClickStat[] {
  const db = getDb();
  return db
    .prepare(
      `SELECT cl.id AS linkId, cl.original_url AS originalUrl,
              COUNT(te.id) AS totalClicks,
              COUNT(DISTINCT te.campaign_recipient_id) AS uniqueClicks
       FROM campaign_links cl
       LEFT JOIN tracking_events te ON te.link_id = cl.id AND te.event_type = 'click'
       WHERE cl.campaign_id = ?
       GROUP BY cl.id
       ORDER BY totalClicks DESC`,
    )
    .all(campaignId) as LinkClickStat[];
}
