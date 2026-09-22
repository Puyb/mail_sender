import MailComposer from 'nodemailer/lib/mail-composer';
import escapeHtml from 'escape-html';
import type { AppConfig } from '../config';
import type { CampaignRecipientRow, CampaignRow, SessionCredentials } from '../types';
import { appendToInbox } from './imapClient';
import { getCampaignTrackingSummary } from '../db/repositories/campaignRepository';
import { getCampaignLinkStats } from '../tracking/trackingRepository';

function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return minutes > 0 ? `${minutes} min ${remainingSeconds} s` : `${remainingSeconds} s`;
}

export async function sendCampaignReport(
  config: AppConfig,
  creds: SessionCredentials,
  campaign: CampaignRow,
  recipients: CampaignRecipientRow[],
): Promise<void> {
  const durationMs =
    campaign.started_at && campaign.finished_at
      ? new Date(campaign.finished_at).getTime() - new Date(campaign.started_at).getTime()
      : 0;
  const failed = recipients.filter((r) => r.status === 'failed');
  const summary = getCampaignTrackingSummary(campaign.id);
  const linkStats = getCampaignLinkStats(campaign.id);
  const openRate = campaign.sent_count > 0 ? Math.round((summary.uniqueOpens / campaign.sent_count) * 100) : 0;
  const clickRate = campaign.sent_count > 0 ? Math.round((summary.uniqueClicks / campaign.sent_count) * 100) : 0;

  const failedListHtml = failed.length
    ? `<ul>${failed.map((r) => `<li>${escapeHtml(r.email)} — ${escapeHtml(r.error_reason ?? 'raison inconnue')}</li>`).join('')}</ul>`
    : '<p>Aucun échec.</p>';

  const linkStatsHtml = linkStats.length
    ? `<ul>${linkStats
        .map((l) => `<li>${escapeHtml(l.originalUrl)} — ${l.totalClicks} clic(s) (${l.uniqueClicks} destinataire(s) unique(s))</li>`)
        .join('')}</ul>`
    : '<p>Aucun lien tracké dans cet email.</p>';

  const html = `
    <h2>Rapport de campagne : ${escapeHtml(campaign.subject)}</h2>
    <p>Durée d'envoi : ${formatDuration(durationMs)}</p>
    <ul>
      <li>Destinataires : ${campaign.total_recipients}</li>
      <li>Envoyés avec succès : ${campaign.sent_count}</li>
      <li>Échecs : ${campaign.failed_count}</li>
      <li>Taux d'ouverture : ${openRate}% (${summary.uniqueOpens} ouvert(s) unique(s), ${summary.totalOpens} ouverture(s) au total)</li>
      <li>Taux de clic : ${clickRate}% (${summary.uniqueClicks} cliqueur(s) unique(s), ${summary.totalClicks} clic(s) au total)</li>
    </ul>
    <h3>Statistiques par lien</h3>
    ${linkStatsHtml}
    <h3>Échecs détaillés</h3>
    ${failedListHtml}
  `;

  const composer = new MailComposer({
    from: creds.email,
    to: creds.email,
    subject: `[Rapport de campagne] ${campaign.subject}`,
    html,
  });

  const rawMime: Buffer = await new Promise((resolve, reject) => {
    composer.compile().build((err: Error | null, message: Buffer) => {
      if (err) reject(err);
      else resolve(message);
    });
  });

  await appendToInbox(config, creds, rawMime);
}
