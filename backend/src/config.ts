import fs from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

const configSchema = z.object({
  server: z.object({
    port: z.number().int().positive(),
    sessionSecret: z.string().min(8),
    sessionMaxAgeMs: z.number().int().positive(),
  }),
  imap: z.object({
    host: z.string().min(1),
    port: z.number().int().positive(),
    secure: z.boolean(),
    draftsFolderCandidates: z.array(z.string().min(1)).min(1),
  }),
  smtp: z.object({
    host: z.string().min(1),
    port: z.number().int().positive(),
    secure: z.boolean(),
  }),
  sendRate: z.object({
    emailsPerMinute: z.number().positive(),
  }),
  uploads: z.object({
    maxFileSizeBytes: z.number().int().positive(),
    allowedExtensions: z.array(z.string().min(1)).min(1),
  }),
  tracking: z.object({
    publicBaseUrl: z.string().url(),
  }),
});

export type AppConfig = z.infer<typeof configSchema>;

const CONFIG_PATH = path.resolve(__dirname, '../../config/config.json');

export function loadConfig(): AppConfig {
  if (!fs.existsSync(CONFIG_PATH)) {
    throw new Error(
      `Fichier de configuration introuvable : ${CONFIG_PATH}\n` +
        `Copiez config/config.example.json vers config/config.json et renseignez vos valeurs.`,
    );
  }
  const raw = fs.readFileSync(CONFIG_PATH, 'utf-8');
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch (err) {
    throw new Error(`config.json invalide (JSON malformé) : ${(err as Error).message}`);
  }
  const result = configSchema.safeParse(parsed);
  if (!result.success) {
    throw new Error(`config.json invalide :\n${result.error.issues.map((i) => `- ${i.path.join('.')}: ${i.message}`).join('\n')}`);
  }
  return result.data;
}
