import type { Recipient, RecipientParseResult } from '../types';
import { dedupeAndValidate } from './recipientValidation';

function unfoldLines(text: string): string[] {
  const rawLines = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
  const unfolded: string[] = [];
  for (const line of rawLines) {
    if ((line.startsWith(' ') || line.startsWith('\t')) && unfolded.length > 0) {
      unfolded[unfolded.length - 1] += line.slice(1);
    } else if (line.trim().length > 0) {
      unfolded.push(line);
    }
  }
  return unfolded;
}

function parseLine(line: string): { key: string; value: string } | null {
  const colonIndex = line.indexOf(':');
  if (colonIndex === -1) return null;
  const rawKey = line.slice(0, colonIndex);
  const value = line.slice(colonIndex + 1);
  const key = rawKey.split(';')[0].trim().toUpperCase();
  return { key, value };
}

function extractCards(lines: string[]): string[][] {
  const cards: string[][] = [];
  let current: string[] | null = null;
  for (const line of lines) {
    if (/^BEGIN:VCARD$/i.test(line.trim())) {
      current = [];
    } else if (/^END:VCARD$/i.test(line.trim())) {
      if (current) cards.push(current);
      current = null;
    } else if (current) {
      current.push(line);
    }
  }
  return cards;
}

function parseCard(lines: string[]): Recipient | null {
  let email: string | undefined;
  let firstName: string | undefined;
  let lastName: string | undefined;
  let fn: string | undefined;

  for (const rawLine of lines) {
    const parsed = parseLine(rawLine);
    if (!parsed) continue;
    const { key, value } = parsed;
    if (key === 'EMAIL' && !email) {
      email = value.trim();
    } else if (key === 'N') {
      const parts = value.split(';');
      lastName = parts[0]?.trim() || undefined;
      firstName = parts[1]?.trim() || undefined;
    } else if (key === 'FN') {
      fn = value.trim();
    }
  }

  if (!email) return null;

  if (!firstName && !lastName && fn) {
    const [first, ...rest] = fn.split(' ');
    firstName = first;
    lastName = rest.join(' ') || undefined;
  }

  return { email, firstName, lastName };
}

export function parseVcardRecipients(buffer: Buffer): RecipientParseResult {
  const text = buffer.toString('utf-8');
  const lines = unfoldLines(text);
  const cards = extractCards(lines);

  if (cards.length === 0) {
    return { recipients: [], warnings: [{ line: 0, reason: 'Aucune vCard (BEGIN:VCARD/END:VCARD) trouvée dans le fichier' }] };
  }

  const raw: Recipient[] = [];
  const warnings: { line: number; reason: string }[] = [];
  cards.forEach((card, index) => {
    const recipient = parseCard(card);
    if (!recipient) {
      warnings.push({ line: index + 1, reason: 'Contact sans adresse email, ignoré' });
      return;
    }
    raw.push(recipient);
  });

  const { valid, warnings: validationWarnings } = dedupeAndValidate(raw);
  return { recipients: valid, warnings: [...warnings, ...validationWarnings] };
}
