import { simpleParser } from 'mailparser';
import type { Server } from 'socket.io';
import type { AppConfig } from '../config';
import type { CampaignRow, Recipient, SessionCredentials } from '../types';
import { fetchDraftRawMime } from '../mail/imapClient';
import { normalizeAppleInlineImages } from '../mail/appleDraftNormalizer';
import {
  createCampaign,
  setCampaignStatus,
  setCampaignRenderedContent,
  getResumableCampaignsForSender,
} from '../db/repositories/campaignRepository';
import { insertRecipients } from '../db/repositories/recipientRepository';
import { rewriteLinksForTracking } from '../tracking/linkRewriter';
import { injectTrackingPixelPlaceholder } from '../tracking/pixelInjector';
import { runCampaign, type CampaignAttachment, type CampaignTemplate } from './sendQueue';

export async function createAndStartCampaign(
  config: AppConfig,
  io: Server,
  senderEmail: string,
  creds: SessionCredentials,
  draftUid: number,
  recipients: Recipient[],
  sendRatePerMinute?: number,
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
    sendRatePerMin: sendRatePerMinute && sendRatePerMinute > 0 ? sendRatePerMinute : config.sendRate.emailsPerMinute,
  });

  insertRecipients(campaign.id, recipients);

  const text = typeof parsed.text === 'string' ? parsed.text : null;
  const attachments = (parsed.attachments ?? []).map((a) => ({
    filename: a.filename,
    content: a.content,
    contentType: a.contentType,
    cid: a.cid,
  }));

  let html = typeof parsed.html === 'string' ? parsed.html : null;
  if (html) {
    html = normalizeAppleInlineImages(html, attachments);
    html = rewriteLinksForTracking(html, campaign.id);
    html = injectTrackingPixelPlaceholder(html);
  }

  // Persisted so an interruption can resume the send without re-deriving the tracked body:
  // re-running rewriteLinksForTracking a second time would mint duplicate campaign_links rows.
  setCampaignRenderedContent(campaign.id, html, text);

  const template: CampaignTemplate = { html, text, attachments };

  runCampaign(config, io, campaign, creds, template).catch((err: Error) => {
    setCampaignStatus(campaign.id, 'failed', { finishedAt: new Date().toISOString(), errorMessage: err.message });
    io.to(`campaign:${campaign.id}`).emit('campaign:error', { campaignId: campaign.id, message: err.message });
  });

  return campaign;
}

// Called right after a successful login: any campaign still 'pending' or 'running' in the DB
// for this sender was left mid-send (or never started) by a server crash or restart
// (credentials and the send loop only ever live in process memory, never on disk — see
// sessionStore.ts), so this is the only point at which sending can pick back up. Fire-and-forget:
// login must not block on it.
export async function resumeInterruptedCampaigns(
  config: AppConfig,
  io: Server,
  senderEmail: string,
  creds: SessionCredentials,
): Promise<void> {
  const campaigns = getResumableCampaignsForSender(senderEmail);
  for (const campaign of campaigns) {
    resumeCampaign(config, io, campaign, creds).catch((err: Error) => {
      setCampaignStatus(campaign.id, 'failed', { finishedAt: new Date().toISOString(), errorMessage: err.message });
      io.to(`campaign:${campaign.id}`).emit('campaign:error', { campaignId: campaign.id, message: err.message });
    });
  }
}

async function resumeCampaign(config: AppConfig, io: Server, campaign: CampaignRow, creds: SessionCredentials): Promise<void> {
  // Attachments are re-derived from the immutable raw_mime snapshot (deterministic, no side
  // effects); the body itself reuses the already tracking-rewritten rendered_html/rendered_text
  // saved at creation time instead of recomputing it.
  const parsed = await simpleParser(campaign.raw_mime);
  const attachments: CampaignAttachment[] = (parsed.attachments ?? []).map((a) => ({
    filename: a.filename,
    content: a.content,
    contentType: a.contentType,
    cid: a.cid,
  }));

  const parsedHtml = typeof parsed.html === 'string' ? parsed.html : null;
  let html = campaign.rendered_html;
  if (!html && parsedHtml) {
    // Only reachable if the process died in the sliver of time between inserting the campaign
    // row and saving its rendered content — re-derive rather than silently sending a plain
    // draft with no tracking.
    html = injectTrackingPixelPlaceholder(
      rewriteLinksForTracking(normalizeAppleInlineImages(parsedHtml, attachments), campaign.id),
    );
    setCampaignRenderedContent(campaign.id, html, campaign.rendered_text ?? (typeof parsed.text === 'string' ? parsed.text : null));
  }

  const template: CampaignTemplate = {
    html,
    text: campaign.rendered_text ?? (typeof parsed.text === 'string' ? parsed.text : null),
    attachments,
  };

  await runCampaign(config, io, campaign, creds, template);
}
