import { simpleParser } from 'mailparser';
import type { Server } from 'socket.io';
import type { AppConfig } from '../config';
import type { CampaignRow, Recipient, SessionCredentials } from '../types';
import { fetchDraftRawMime } from '../mail/imapClient';
import { createCampaign, setCampaignStatus } from '../db/repositories/campaignRepository';
import { insertRecipients } from '../db/repositories/recipientRepository';
import { rewriteLinksForTracking } from '../tracking/linkRewriter';
import { injectTrackingPixelPlaceholder } from '../tracking/pixelInjector';
import { runCampaign, type CampaignTemplate } from './sendQueue';

export async function createAndStartCampaign(
  config: AppConfig,
  io: Server,
  senderEmail: string,
  creds: SessionCredentials,
  draftUid: number,
  recipients: Recipient[],
): Promise<CampaignRow> {
  const rawMime = await fetchDraftRawMime(config, creds, draftUid);
  const parsed = await simpleParser(rawMime);
  const subject = parsed.subject || '(sans sujet)';

  const campaign = createCampaign({
    senderEmail,
    subject,
    draftUid: String(draftUid),
    rawMime,
    totalRecipients: recipients.length,
    sendRatePerMin: config.sendRate.emailsPerMinute,
  });

  insertRecipients(campaign.id, recipients);

  let html = typeof parsed.html === 'string' ? parsed.html : null;
  if (html) {
    html = rewriteLinksForTracking(html, campaign.id);
    html = injectTrackingPixelPlaceholder(html);
  }
  const text = typeof parsed.text === 'string' ? parsed.text : null;
  const attachments = (parsed.attachments ?? []).map((a) => ({
    filename: a.filename,
    content: a.content,
    contentType: a.contentType,
    cid: a.cid,
  }));

  const template: CampaignTemplate = { html, text, attachments };

  runCampaign(config, io, campaign, creds, template).catch((err: Error) => {
    setCampaignStatus(campaign.id, 'failed', { finishedAt: new Date().toISOString(), errorMessage: err.message });
    io.to(`campaign:${campaign.id}`).emit('campaign:error', { campaignId: campaign.id, message: err.message });
  });

  return campaign;
}
