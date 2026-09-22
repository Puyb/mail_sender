import { Router } from 'express';
import type { AppConfig } from '../config';
import { requireAuth } from '../auth/authMiddleware';
import { createUploadMiddleware } from './multerConfig';
import { parseCsvRecipients } from '../recipients/csvParser';
import { parseVcardRecipients } from '../recipients/vcardParser';

export function createUploadRouter(config: AppConfig): Router {
  const router = Router();
  const upload = createUploadMiddleware(config);

  router.post('/recipients', requireAuth, upload.single('file'), (req, res) => {
    if (!req.file) {
      res.status(400).json({ error: 'Aucun fichier fourni' });
      return;
    }
    const name = req.file.originalname.toLowerCase();
    const buffer = req.file.buffer;

    let result;
    if (name.endsWith('.vcf')) {
      if (!buffer.toString('utf-8', 0, 32).match(/BEGIN:VCARD/i)) {
        res.status(400).json({ error: 'Le fichier ne semble pas être une vCard valide' });
        return;
      }
      result = parseVcardRecipients(buffer);
    } else if (name.endsWith('.csv')) {
      result = parseCsvRecipients(buffer);
    } else {
      res.status(400).json({ error: 'Format de fichier non supporté (attendu : .csv ou .vcf)' });
      return;
    }

    res.json({ recipients: result.recipients, count: result.recipients.length, warnings: result.warnings });
  });

  return router;
}
