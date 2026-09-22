import type { Server } from 'socket.io';
import type { AppConfig } from '../config';
import type { CampaignRow, SessionCredentials } from '../types';
import { createSmtpTransport } from '../mail/smtpClient';
import { getRecipientsForCampaign, setRecipientStatus } from '../db/repositories/recipientRepository';
import { setCampaignStatus, incrementCampaignCounts, getCampaignById } from '../db/repositories/campaignRepository';
import { personalize, applyTrackingUrls } from './templateRenderer';
import { sendCampaignReport } from '../mail/reportMailer';

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export interface CampaignAttachment {
  filename?: string;
  content: Buffer;
  contentType?: string;
  cid?: string;
}

export interface CampaignTemplate {
  html: string | null;
  text: string | null;
  attachments: CampaignAttachment[];
}

export async function runCampaign(
  config: AppConfig,
  io: Server,
  campaign: CampaignRow,
  creds: SessionCredentials,
  template: CampaignTemplate,
): Promise<void> {
  const transporter = createSmtpTransport(config, creds);
  const delayMs = 60000 / config.sendRate.emailsPerMinute;
  const recipients = getRecipientsForCampaign(campaign.id);

  setCampaignStatus(campaign.id, 'running', { startedAt: new Date().toISOString() });

  for (let i = 0; i < recipients.length; i++) {
    const recipient = recipients[i];
    const html = template.html
      ? applyTrackingUrls(personalize(template.html, recipient), recipient.tracking_id, config.tracking.publicBaseUrl)
      : undefined;
    const text = template.text ? personalize(template.text, recipient) : undefined;

    try {
      await transporter.sendMail({
        from: creds.email,
        to: recipient.email,
        subject: campaign.subject,
        html,
        text,
        attachments: template.attachments,
      });
      setRecipientStatus(recipient.id, 'sent');
      incrementCampaignCounts(campaign.id, 'sent_count');
    } catch (err) {
      setRecipientStatus(recipient.id, 'failed', (err as Error).message);
      incrementCampaignCounts(campaign.id, 'failed_count');
    }

    const updated = getCampaignById(campaign.id)!;
    io.to(`campaign:${campaign.id}`).emit('campaign:progress', {
      campaignId: campaign.id,
      sentCount: updated.sent_count,
      failedCount: updated.failed_count,
      totalRecipients: updated.total_recipients,
      currentRecipientEmail: recipient.email,
    });

    if (i < recipients.length - 1) {
      await sleep(delayMs);
    }
  }

  const finishedAt = new Date().toISOString();
  setCampaignStatus(campaign.id, 'completed', { finishedAt });
  const finalCampaign = getCampaignById(campaign.id)!;

  io.to(`campaign:${campaign.id}`).emit('campaign:completed', {
    campaignId: campaign.id,
    sentCount: finalCampaign.sent_count,
    failedCount: finalCampaign.failed_count,
    totalRecipients: finalCampaign.total_recipients,
    durationMs: new Date(finishedAt).getTime() - new Date(finalCampaign.started_at!).getTime(),
  });

  try {
    await sendCampaignReport(config, creds, finalCampaign, getRecipientsForCampaign(campaign.id));
  } catch (err) {
    io.to(`campaign:${campaign.id}`).emit('campaign:error', {
      campaignId: campaign.id,
      message: `Échec de l'envoi du rapport : ${(err as Error).message}`,
    });
  }
}
