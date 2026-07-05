export const TAG_ALREADY_EXISTS = 'Already Exists';
export const TAG_AUTOMATED_EMAIL = 'Automated email received';

export function requestTagVariant(tag) {
  if (tag === TAG_ALREADY_EXISTS) return 'already-exists';
  if (tag === TAG_AUTOMATED_EMAIL) return 'draft';
  return 'neutral';
}
