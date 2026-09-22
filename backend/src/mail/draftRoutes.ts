import { Router } from 'express';
import { simpleParser } from 'mailparser';
import type { AppConfig } from '../config';
import { requireAuth } from '../auth/authMiddleware';
import { getCredentials } from '../auth/sessionStore';
import { listDrafts, fetchDraftRawMime } from './imapClient';
import { normalizeAppleInlineImagesForPreview } from './appleDraftNormalizer';

export function createDraftRouter(config: AppConfig): Router {
  const router = Router();

  router.get('/', requireAuth, async (req, res) => {
    const creds = getCredentials(req.sessionID)!;
    try {
      const drafts = await listDrafts(config, creds);
      res.json({ drafts });
    } catch (err) {
      res.status(502).json({ error: `Impossible de lister les brouillons : ${(err as Error).message}` });
    }
  });

  router.get('/:uid', requireAuth, async (req, res) => {
    const uid = Number(req.params.uid);
    if (!Number.isFinite(uid)) {
      res.status(400).json({ error: 'UID invalide' });
      return;
    }
    const creds = getCredentials(req.sessionID)!;
    try {
      const rawMime = await fetchDraftRawMime(config, creds, uid);
      const parsed = await simpleParser(rawMime);
      let html = typeof parsed.html === 'string' ? parsed.html : null;
      if (html) {
        html = normalizeAppleInlineImagesForPreview(html, parsed.attachments ?? []);
      }
      res.json({
        uid,
        subject: parsed.subject ?? '(sans sujet)',
        html,
        text: typeof parsed.text === 'string' ? parsed.text : null,
        attachmentCount: parsed.attachments?.length ?? 0,
      });
    } catch (err) {
      res.status(502).json({ error: `Impossible de charger le brouillon : ${(err as Error).message}` });
    }
  });

  return router;
}
