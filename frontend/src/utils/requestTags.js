export const TAG_ALREADY_EXISTS = 'already exists';
export const TAG_PARTNER_REQUEST = 'partner req';
export const TAG_AUTO_MAIL = 'auto mail';
export const TAG_VERIFIED = 'verified';
export const TAG_UNVERIFIED = 'unverified';
/** Stored when admin overlays an existing manager request; also display alias for pure admin entries. */
export const TAG_SENT_BY_ADMIN = 'sent by admin';
export const ADMIN_FORM_LABEL = 'Admin form';

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
  if (tag === TAG_SENT_BY_ADMIN) return 'neutral';
  if (tag === TAG_AUTO_MAIL) return 'neutral';
  return 'neutral';
}

export function sortRequestTags(tags = []) {
  const order = [
    TAG_VERIFIED,
    TAG_UNVERIFIED,
    TAG_PARTNER_REQUEST,
    TAG_SENT_BY_ADMIN,
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

/** Display tags for UI — pure admin entries show Admin form instead of Manager Form.
 *  When admin overlays an existing manager request, both tags are stored and shown.
 */
export function displayRequestTags(tags = [], { isAdminEntry = false } = {}) {
  const hasStoredAdmin = tags.includes(TAG_SENT_BY_ADMIN);
  return visibleTableRequestTags(tags).map((tag) => (
    isAdminEntry && !hasStoredAdmin && tag === TAG_PARTNER_REQUEST
      ? TAG_SENT_BY_ADMIN
      : tag
  ));
}

/** Intake source tags for the Sent via column (excludes review-only tags). */
export function sentViaTableRequestTags(tags = [], { isAdminEntry = false } = {}) {
  return displayRequestTags(tags, { isAdminEntry }).filter((tag) => tag !== TAG_ALREADY_EXISTS);
}

export const SENT_VIA_BOTH = 'both';

/** Filter New Requests by intake source (exclusive Manager Form / Auto Email, or both). */
export function matchesSentViaFilter(tags = [], filterValue) {
  if (filterValue === 'All') return true;
  const hasPartner = tags.includes(TAG_PARTNER_REQUEST);
  const hasAuto = tags.includes(TAG_AUTO_MAIL);
  if (filterValue === TAG_PARTNER_REQUEST) return hasPartner && !hasAuto;
  if (filterValue === TAG_AUTO_MAIL) return hasAuto && !hasPartner;
  if (filterValue === SENT_VIA_BOTH) return hasPartner && hasAuto;
  return true;
}

export function requestTagLabel(tag) {
  if (tag === TAG_PARTNER_REQUEST) return 'Manager Form';
  if (tag === TAG_SENT_BY_ADMIN) return ADMIN_FORM_LABEL;
  if (tag === TAG_AUTO_MAIL) return 'Automated email';
  return tag;
}

/** Directory presence for New requests Status column. */
export function directoryStatusTag(request) {
  const inDirectory = Boolean(
    request?.directoryMatch
    || (request?.tags || []).includes(TAG_ALREADY_EXISTS),
  );
  if (inDirectory) {
    return {
      variant: 'already-exists',
      label: 'Already exists',
      prefix: '⚠ ',
      plain: false,
    };
  }
  return {
    variant: 'new-person',
    label: request?.action === 'Remove' ? 'Not removed' : 'Not added',
    prefix: '',
    plain: true,
  };
}
