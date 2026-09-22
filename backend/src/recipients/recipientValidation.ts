const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function isValidEmail(email: string): boolean {
  return EMAIL_REGEX.test(email.trim());
}

export function dedupeAndValidate(
  recipients: { email: string; firstName?: string; lastName?: string }[],
): { valid: { email: string; firstName?: string; lastName?: string }[]; warnings: { line: number; reason: string; raw?: string }[] } {
  const seen = new Set<string>();
  const valid: { email: string; firstName?: string; lastName?: string }[] = [];
  const warnings: { line: number; reason: string; raw?: string }[] = [];

  recipients.forEach((r, index) => {
    const email = r.email.trim().toLowerCase();
    if (!isValidEmail(email)) {
      warnings.push({ line: index + 1, reason: 'Adresse email invalide', raw: r.email });
      return;
    }
    if (seen.has(email)) {
      warnings.push({ line: index + 1, reason: 'Doublon ignoré', raw: r.email });
      return;
    }
    seen.add(email);
    valid.push({ email, firstName: r.firstName?.trim() || undefined, lastName: r.lastName?.trim() || undefined });
  });

  return { valid, warnings };
}
