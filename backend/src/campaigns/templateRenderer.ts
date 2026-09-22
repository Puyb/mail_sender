import escapeHtml from 'escape-html';
import type { CampaignRecipientRow } from '../types';

export function personalize(content: string, recipient: Pick<CampaignRecipientRow, 'first_name' | 'last_name'>): string {
  return content
    .replace(/\{\{\s*firstName\s*\}\}/gi, escapeHtml(recipient.first_name ?? ''))
    .replace(/\{\{\s*lastName\s*\}\}/gi, escapeHtml(recipient.last_name ?? ''));
}

export function applyTrackingUrls(html: string, trackingId: string, publicBaseUrl: string): string {
  return html
    .replace(/__TRACK_PIXEL__/g, `${publicBaseUrl}/t/o/${trackingId}.png`)
    .replace(/__TRACK_LINK_(\d+)__/g, (_match, linkId: string) => `${publicBaseUrl}/t/c/${trackingId}/${linkId}`);
}
