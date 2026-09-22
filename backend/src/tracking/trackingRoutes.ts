import { Router } from 'express';
import { recordOpen, recordClick } from '../db/repositories/recipientRepository';
import { getCampaignLink } from './trackingRepository';

const TRANSPARENT_PIXEL = Buffer.from(
  'R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBTAA7',
  'base64',
);

export function createTrackingRouter(): Router {
  const router = Router();

  router.get('/o/:trackingId.png', (req, res) => {
    const { trackingId } = req.params;
    recordOpen(trackingId, { userAgent: req.get('user-agent'), ip: req.ip });
    res.set('Content-Type', 'image/gif');
    res.set('Cache-Control', 'no-store, no-cache, must-revalidate, private');
    res.send(TRANSPARENT_PIXEL);
  });

  router.get('/c/:trackingId/:linkId', (req, res) => {
    const { trackingId } = req.params;
    const linkId = Number(req.params.linkId);
    const link = Number.isFinite(linkId) ? getCampaignLink(linkId) : undefined;
    if (!link) {
      res.status(404).send('Lien introuvable');
      return;
    }
    recordClick(trackingId, linkId, { userAgent: req.get('user-agent'), ip: req.ip });
    res.redirect(302, link.original_url);
  });

  return router;
}
