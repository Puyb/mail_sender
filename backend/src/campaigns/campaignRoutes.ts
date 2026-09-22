import { Router } from 'express';
import { z } from 'zod';
import type { Server } from 'socket.io';
import type { AppConfig } from '../config';
import { requireAuth } from '../auth/authMiddleware';
import { getCredentials } from '../auth/sessionStore';
import { createAndStartCampaign } from './campaignService';
import { setCampaignSendRate, requestCampaignStop } from './sendQueue';
import {
  listCampaignsForSender,
  getCampaignById,
  getCampaignTrackingSummary,
  updateCampaignSendRate,
} from '../db/repositories/campaignRepository';
import { getRecipientsForCampaign } from '../db/repositories/recipientRepository';
import { getCampaignLinkStats } from '../tracking/trackingRepository';

const createCampaignSchema = z.object({
  draftUid: z.number().int().positive(),
  recipients: z
    .array(
      z.object({
        email: z.string().email(),
        firstName: z.string().optional(),
        lastName: z.string().optional(),
      }),
    )
    .min(1),
  sendRatePerMinute: z.number().positive().optional(),
});

const sendRateSchema = z.object({
  emailsPerMinute: z.number().positive(),
});

export function createCampaignRouter(config: AppConfig, io: Server): Router {
  const router = Router();

  router.post('/', requireAuth, async (req, res) => {
    const parsed = createCampaignSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Requête invalide', details: parsed.error.issues });
      return;
    }
    const email = req.session.email!;
    const creds = getCredentials(req.sessionID)!;
    try {
      const campaign = await createAndStartCampaign(
        config,
        io,
        email,
        creds,
        parsed.data.draftUid,
        parsed.data.recipients,
        parsed.data.sendRatePerMinute,
      );
      res.json({ campaignId: campaign.id });
    } catch (err) {
      res.status(500).json({ error: `Impossible de créer la campagne : ${(err as Error).message}` });
    }
  });

  router.get('/defaults', requireAuth, (_req, res) => {
    res.json({ emailsPerMinute: config.sendRate.emailsPerMinute });
  });

  router.patch('/:id/send-rate', requireAuth, (req, res) => {
    const parsed = sendRateSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Requête invalide', details: parsed.error.issues });
      return;
    }
    const email = req.session.email!;
    const campaign = getCampaignById(req.params.id);
    if (!campaign || campaign.sender_email !== email) {
      res.status(403).json({ error: 'Accès refusé à cette campagne' });
      return;
    }
    if (campaign.status !== 'pending' && campaign.status !== 'running') {
      res.status(409).json({ error: "La campagne n'est plus en cours d'envoi" });
      return;
    }
    const applied = setCampaignSendRate(campaign.id, parsed.data.emailsPerMinute);
    if (!applied) {
      res.status(409).json({ error: "L'envoi de cette campagne n'est plus actif sur le serveur" });
      return;
    }
    updateCampaignSendRate(campaign.id, parsed.data.emailsPerMinute);
    io.to(`campaign:${campaign.id}`).emit('campaign:rateChanged', {
      campaignId: campaign.id,
      emailsPerMinute: parsed.data.emailsPerMinute,
    });
    res.json({ ok: true });
  });

  router.post('/:id/stop', requireAuth, (req, res) => {
    const email = req.session.email!;
    const campaign = getCampaignById(req.params.id);
    if (!campaign || campaign.sender_email !== email) {
      res.status(403).json({ error: 'Accès refusé à cette campagne' });
      return;
    }
    if (campaign.status !== 'pending' && campaign.status !== 'running') {
      res.status(409).json({ error: "La campagne n'est plus en cours d'envoi" });
      return;
    }
    const applied = requestCampaignStop(campaign.id);
    if (!applied) {
      res.status(409).json({ error: "L'envoi de cette campagne n'est plus actif sur le serveur" });
      return;
    }
    res.json({ ok: true });
  });

  router.get('/', requireAuth, (req, res) => {
    const email = req.session.email!;
    const campaigns = listCampaignsForSender(email).map((c) => ({
      ...c,
      raw_mime: undefined,
      rendered_html: undefined,
      rendered_text: undefined,
      tracking: getCampaignTrackingSummary(c.id),
    }));
    res.json({ campaigns });
  });

  router.get('/:id', requireAuth, (req, res) => {
    const email = req.session.email!;
    const campaign = getCampaignById(req.params.id);
    if (!campaign || campaign.sender_email !== email) {
      res.status(403).json({ error: "Accès refusé à cette campagne" });
      return;
    }
    const recipients = getRecipientsForCampaign(campaign.id);
    const tracking = getCampaignTrackingSummary(campaign.id);
    const links = getCampaignLinkStats(campaign.id);
    res.json({
      campaign: { ...campaign, raw_mime: undefined, rendered_html: undefined, rendered_text: undefined },
      recipients,
      tracking,
      links,
    });
  });

  return router;
}
