import { parse } from 'csv-parse/sync';
import type { Recipient, RecipientParseResult } from '../types';
import { dedupeAndValidate } from './recipientValidation';

const EMAIL_HEADER_CANDIDATES = ['email', 'e-mail', 'mail', 'adresse', 'address'];
const FIRST_NAME_HEADER_CANDIDATES = ['firstname', 'first_name', 'prenom', 'prénom', 'first'];
const LAST_NAME_HEADER_CANDIDATES = ['lastname', 'last_name', 'nom', 'name', 'last'];

function findColumn(headers: string[], candidates: string[]): string | undefined {
  const normalized = headers.map((h) => h.trim().toLowerCase());
  for (const candidate of candidates) {
    const index = normalized.indexOf(candidate);
    if (index !== -1) return headers[index];
  }
  return undefined;
}

export function parseCsvRecipients(buffer: Buffer): RecipientParseResult {
  const records: Record<string, string>[] = parse(buffer, {
    columns: true,
    skip_empty_lines: true,
    trim: true,
    bom: true,
  });

  if (records.length === 0) {
    return { recipients: [], warnings: [{ line: 0, reason: 'Fichier CSV vide' }] };
  }

  const headers = Object.keys(records[0]);
  const emailCol = findColumn(headers, EMAIL_HEADER_CANDIDATES) ?? headers[0];
  const firstNameCol = findColumn(headers, FIRST_NAME_HEADER_CANDIDATES);
  const lastNameCol = findColumn(headers, LAST_NAME_HEADER_CANDIDATES);

  const raw: Recipient[] = records.map((row) => ({
    email: row[emailCol] ?? '',
    firstName: firstNameCol ? row[firstNameCol] : undefined,
    lastName: lastNameCol ? row[lastNameCol] : undefined,
  }));

  const { valid, warnings } = dedupeAndValidate(raw);
  return { recipients: valid, warnings };
}
