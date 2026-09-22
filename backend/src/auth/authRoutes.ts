import { Router } from 'express';
import { z } from 'zod';
import type { Server } from 'socket.io';
import type { AppConfig } from '../config';
import { testImapLogin } from '../mail/imapClient';
import { setCredentials, clearCredentials, getCredentials } from './sessionStore';
import { resumeInterruptedCampaigns } from '../campaigns/campaignService';

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export function createAuthRouter(config: AppConfig, io: Server): Router {
  const router = Router();

  router.post('/login', async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: 'Email ou mot de passe manquant' });
      return;
    }
    const { email, password } = parsed.data;
    try {
      await testImapLogin(config, { email, password });
    } catch {
      res.status(401).json({ error: 'Connexion IMAP échouée : vérifiez vos identifiants.' });
      return;
    }
    req.session.email = email;
    req.session.save((err) => {
      if (err) {
        res.status(500).json({ error: 'Erreur de session' });
        return;
      }
      setCredentials(req.sessionID, { email, password });
      res.json({ email });
      resumeInterruptedCampaigns(config, io, email, { email, password }).catch((resumeErr: Error) => {
        console.error(`Échec de la reprise des campagnes interrompues pour ${email} :`, resumeErr.message);
      });
    });
  });

  router.post('/logout', (req, res) => {
    clearCredentials(req.sessionID);
    req.session.destroy(() => {
      res.clearCookie('mailsender.sid');
      res.json({ ok: true });
    });
  });

  router.get('/me', (req, res) => {
    const email = req.session.email;
    const creds = email ? getCredentials(req.sessionID) : undefined;
    if (!email || !creds) {
      res.status(401).json({ error: 'Non authentifié' });
      return;
    }
    res.json({ email });
  });

  return router;
}
