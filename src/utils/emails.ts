export function normalizeEmail(email: string): string {
  const lower = (email || '').toLowerCase().trim();
  const [localRaw, domainRaw = ''] = lower.split('@');
  const domain = domainRaw === 'googlemail.com' ? 'gmail.com' : domainRaw;
  const localNoPlus = localRaw.split('+')[0];
  // We no longer remove dots to simplify compatibility with Firestore rules (which lack global replace/join).
  return `${localNoPlus}@${domain}`;
}

export function collaboratorKey(email: string) {
  return normalizeEmail(email);
}