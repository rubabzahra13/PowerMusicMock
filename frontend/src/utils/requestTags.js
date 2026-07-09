export const TAG_ALREADY_EXISTS = 'already exists';
export const TAG_PARTNER_REQUEST = 'partner req';
export const TAG_AUTO_MAIL = 'auto mail';
export const TAG_VERIFIED = 'verified';
export const TAG_UNVERIFIED = 'unverified';

/** @deprecated use TAG_AUTO_MAIL */
export const TAG_AUTO_EMAIL = TAG_AUTO_MAIL;
export const TAG_AUTOMATED_EMAIL = TAG_AUTO_MAIL;

export function isAutomatedIntakeRequest(tags = []) {
  return tags.includes(TAG_AUTO_MAIL);
}

export function isAwaitingManagerSubmission(tags = []) {
  return (
    tags.includes(TAG_UNVERIFIED)
    && tags.includes(TAG_AUTO_MAIL)
    && !tags.includes(TAG_PARTNER_REQUEST)
  );
}

export function isVisibleInNewRequests(tags = []) {
  return tags.includes(TAG_VERIFIED) || isAwaitingManagerSubmission(tags);
}

export function requestTagVariant(tag) {
  if (tag === TAG_ALREADY_EXISTS) return 'already-exists';
  if (tag === TAG_VERIFIED) return 'add-action';
  if (tag === TAG_UNVERIFIED) return 'archived';
  if (tag === TAG_PARTNER_REQUEST) return 'neutral';
  if (tag === TAG_AUTO_MAIL) return 'auto-mail';
  return 'neutral';
}

export function sortRequestTags(tags = []) {
  const order = [
    TAG_VERIFIED,
    TAG_UNVERIFIED,
    TAG_PARTNER_REQUEST,
    TAG_AUTO_MAIL,
    TAG_ALREADY_EXISTS,
  ];
  return [...tags].sort((a, b) => {
    const ai = order.indexOf(a);
    const bi = order.indexOf(b);
    if (ai === -1 && bi === -1) return a.localeCompare(b);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

/** Tags hidden in admin tables — still used for filtering logic. */
export function visibleTableRequestTags(tags = []) {
  return sortRequestTags(tags).filter(
    (tag) => tag !== TAG_VERIFIED && tag !== TAG_UNVERIFIED,
  );
}

/** Intake source tags for the Sent via column (excludes review-only tags). */
export function sentViaTableRequestTags(tags = []) {
  return visibleTableRequestTags(tags).filter((tag) => tag !== TAG_ALREADY_EXISTS);
}

export function intakeMismatchReviewTag(compact = true) {
  return { variant: 'review-mismatch', label: 'Auto Mail differs', prefix: '! ', compact };
}

export function directoryReviewTag(directoryRecord, compact = true) {
  const isRemoved = directoryRecord?.status === 'Removed';
  return {
    variant: isRemoved ? 'review-removed' : 'review-exists',
    label: isRemoved ? 'Already removed in DB' : 'User already exists',
    prefix: '⚠ ',
    compact,
  };
}

export function requestTagLabel(tag) {
  if (tag === TAG_PARTNER_REQUEST) return 'Manager Form';
  if (tag === TAG_AUTO_MAIL) return 'Auto Email';
  return tag;
}
