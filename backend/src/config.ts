import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

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

function optionalEnv(name: string, defaultValue: string): string {
  const raw = process.env[name];
  return raw === undefined || raw === '' ? defaultValue : raw;
}

function envInt(name: string, defaultValue: number): number {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    throw new Error(`Variable d'environnement ${name} invalide : "${raw}" n'est pas un nombre.`);
  }
  return parsed;
}

function envBool(name: string, defaultValue: boolean): boolean {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  const normalized = raw.trim().toLowerCase();
  if (['true', '1', 'yes', 'on'].includes(normalized)) return true;
  if (['false', '0', 'no', 'off'].includes(normalized)) return false;
  throw new Error(`Variable d'environnement ${name} invalide : "${raw}" n'est pas un booléen (true/false).`);
}

function envList(name: string, defaultValue: string[]): string[] {
  const raw = process.env[name];
  if (raw === undefined || raw === '') return defaultValue;
  return raw
    .split(',')
    .map((v) => v.trim())
    .filter((v) => v.length > 0);
}

function readConfigFromEnv(): unknown {
  return {
    server: {
      port: envInt('PORT', 3000),
      sessionSecret: optionalEnv('SESSION_SECRET', ''),
      sessionMaxAgeMs: envInt('SESSION_MAX_AGE_MS', 28800000),
    },
    imap: {
      host: optionalEnv('IMAP_HOST', ''),
      port: envInt('IMAP_PORT', 993),
      secure: envBool('IMAP_SECURE', true),
      draftsFolderCandidates: envList('IMAP_DRAFTS_FOLDERS', [
        'Drafts',
        'INBOX.Drafts',
        '[Gmail]/Drafts',
        'Brouillons',
      ]),
    },
    smtp: {
      host: optionalEnv('SMTP_HOST', ''),
      port: envInt('SMTP_PORT', 465),
      secure: envBool('SMTP_SECURE', true),
    },
    sendRate: {
      emailsPerMinute: envInt('SEND_RATE_EMAILS_PER_MINUTE', 10),
    },
    uploads: {
      maxFileSizeBytes: envInt('UPLOAD_MAX_FILE_SIZE_BYTES', 5242880),
      allowedExtensions: envList('UPLOAD_ALLOWED_EXTENSIONS', ['.csv', '.vcf']),
    },
    tracking: {
      publicBaseUrl: optionalEnv('TRACKING_PUBLIC_BASE_URL', ''),
    },
  };
}

export function loadConfig(): AppConfig {
  let raw: unknown;
  try {
    raw = readConfigFromEnv();
  } catch (err) {
    throw new Error(`Configuration invalide : ${(err as Error).message}`);
  }
  const result = configSchema.safeParse(raw);
  if (!result.success) {
    throw new Error(
      `Configuration invalide (variables d'environnement) :\n${result.error.issues
        .map((i) => `- ${i.path.join('.')}: ${i.message}`)
        .join('\n')}\n\nConsultez .env.example pour la liste des variables attendues.`,
    );
  }
  return result.data;
}
