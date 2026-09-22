import { ImapFlow } from 'imapflow';
import type { AppConfig } from '../config';
import type { SessionCredentials } from '../types';

export interface DraftSummary {
  uid: number;
  subject: string;
  date: string | null;
}

export interface DraftContent {
  uid: number;
  subject: string;
  html: string | null;
  text: string | null;
}

async function withClient<T>(config: AppConfig, creds: SessionCredentials, fn: (client: ImapFlow) => Promise<T>): Promise<T> {
  const client = new ImapFlow({
    host: config.imap.host,
    port: config.imap.port,
    secure: config.imap.secure,
    auth: { user: creds.email, pass: creds.password },
    logger: false,
  });
  await client.connect();
  try {
    return await fn(client);
  } finally {
    await client.logout().catch(() => client.close());
  }
}

export async function testImapLogin(config: AppConfig, creds: SessionCredentials): Promise<void> {
  await withClient(config, creds, async () => undefined);
}

async function openDraftsMailbox(client: ImapFlow, candidates: string[]): Promise<string> {
  const mailboxes = await client.list();
  const paths = new Set(mailboxes.map((m) => m.path));
  for (const candidate of candidates) {
    if (paths.has(candidate)) {
      await client.mailboxOpen(candidate, { readOnly: true });
      return candidate;
    }
  }
  const fuzzy = mailboxes.find((m) => /draft|brouillon/i.test(m.path));
  if (fuzzy) {
    await client.mailboxOpen(fuzzy.path, { readOnly: true });
    return fuzzy.path;
  }
  throw new Error('Aucun dossier Drafts trouvé sur ce compte.');
}

export async function listDrafts(config: AppConfig, creds: SessionCredentials): Promise<DraftSummary[]> {
  return withClient(config, creds, async (client) => {
    await openDraftsMailbox(client, config.imap.draftsFolderCandidates);
    const results: DraftSummary[] = [];
    for await (const message of client.fetch('1:*', { envelope: true, uid: true })) {
      results.push({
        uid: message.uid,
        subject: message.envelope?.subject ?? '(sans sujet)',
        date: message.envelope?.date ? new Date(message.envelope.date).toISOString() : null,
      });
    }
    return results.sort((a, b) => b.uid - a.uid);
  });
}

export async function fetchDraftRawMime(config: AppConfig, creds: SessionCredentials, uid: number): Promise<Buffer> {
  return withClient(config, creds, async (client) => {
    await openDraftsMailbox(client, config.imap.draftsFolderCandidates);
    const { content } = await client.download(String(uid), undefined, { uid: true });
    const chunks: Buffer[] = [];
    for await (const chunk of content) {
      chunks.push(chunk as Buffer);
    }
    return Buffer.concat(chunks);
  });
}

export async function appendToInbox(config: AppConfig, creds: SessionCredentials, rawMime: Buffer): Promise<void> {
  await withClient(config, creds, async (client) => {
    await client.append('INBOX', rawMime, ['\\Seen']);
  });
}
