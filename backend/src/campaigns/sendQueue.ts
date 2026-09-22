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

const SLEEP_POLL_MS = 250;

// Sleeps up to `ms`, but returns early (checked every SLEEP_POLL_MS) once `isStopped` goes
// true, so a stop request doesn't have to wait out a slow campaign's full inter-send delay.
async function interruptibleSleep(ms: number, isStopped: () => boolean): Promise<void> {
  let remaining = ms;
  while (remaining > 0 && !isStopped()) {
    const step = Math.min(SLEEP_POLL_MS, remaining);
    await sleep(step);
    remaining -= step;
  }
}

// Live send rate per running campaign, keyed by campaignId, so an operator can speed up/slow
// down a campaign already in flight without restarting it. Only holds entries while the
// campaign's send loop is actually running in this process.
const liveSendRates = new Map<string, number>();

// Campaigns whose loop should stop after the current recipient. Set by the /stop route,
// consumed by the loop itself.
const stopRequests = new Set<string>();

export function setCampaignSendRate(campaignId: string, emailsPerMinute: number): boolean {
  if (!liveSendRates.has(campaignId)) return false;
  liveSendRates.set(campaignId, emailsPerMinute);
  return true;
}

export function requestCampaignStop(campaignId: string): boolean {
  if (!liveSendRates.has(campaignId)) return false;
  stopRequests.add(campaignId);
  return true;
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
  // Guards against a campaign being started twice concurrently in this process — most notably,
  // a resumed campaign racing a still-running one right after a fresh login (see
  // resumeInterruptedCampaigns). Safe because everything before the first `await` below runs
  // synchronously, so this check-and-set can't interleave with another runCampaign call.
  if (liveSendRates.has(campaign.id)) return;

  const transporter = createSmtpTransport(config, creds);
  // Only recipients still 'pending' are sent to: on a fresh campaign that's everyone, on a
  // resumed one it skips whoever already got 'sent'/'failed' before the interruption.
  const recipients = getRecipientsForCampaign(campaign.id).filter((r) => r.status === 'pending');
  liveSendRates.set(campaign.id, campaign.send_rate_per_min);
  let stopped = false;

  try {
    setCampaignStatus(campaign.id, 'running', { startedAt: new Date().toISOString() });

    for (let i = 0; i < recipients.length; i++) {
      if (stopRequests.has(campaign.id)) {
        stopped = true;
        break;
      }

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
        const currentRate = liveSendRates.get(campaign.id) ?? campaign.send_rate_per_min;
        await interruptibleSleep(60000 / currentRate, () => stopRequests.has(campaign.id));
      }
    }
  } finally {
    liveSendRates.delete(campaign.id);
    // `stopped` only reflects a request seen *during* the loop, so a stop call landing in the
    // narrow window after the last send but before this cleanup runs doesn't wrongly mark an
    // otherwise fully-completed campaign as cancelled — just clear the flag either way.
    stopRequests.delete(campaign.id);
  }

  const finishedAt = new Date().toISOString();
  setCampaignStatus(campaign.id, stopped ? 'cancelled' : 'completed', { finishedAt });
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
