import {
  isAwaitingManagerSubmission,
  TAG_PARTNER_REQUEST,
  TAG_VERIFIED,
} from './requestTags';

export const AWAITING_MANAGER_LABEL = 'Auto Email Request';
export const AWAITING_MANAGER_HINT = '';
export const MANUAL_ENTRY_CLUB = 'Manual entry';
export const SENT_BY_ADMIN_LABEL = 'Admin form';
export const NO_MANAGER_NAME = 'No name';
export const NO_MANAGER_EMAIL = 'No email';
export const NO_MANAGER_LOCATION = 'No location';

export const isManualEntry = (submittedBy) => submittedBy?.club === MANUAL_ENTRY_CLUB;

export const isAutomatedSubmittedBy = (submittedBy) => submittedBy?.club === 'Auto email';

function submittedByName(submittedBy) {
  const first = (submittedBy?.firstName || '').trim();
  const last = (submittedBy?.lastName || '').trim();
  if (!first || first.toLowerCase() === 'null') {
    return [last].filter((p) => p && p.toLowerCase() !== 'null').join(' ');
  }
  if (!last || last.toLowerCase() === 'null') return first;
  return `${first} ${last}`.trim();
}

function submittedByClub(submittedBy) {
  const club = (submittedBy?.club || '').trim();
  if (!club || club === MANUAL_ENTRY_CLUB) return '';
  return club;
}

/** Name / email / club with empty placeholders when admin filled any manager field. */
export function formatAttributedManagerFields(submittedBy) {
  const name = submittedByName(submittedBy);
  const email = (submittedBy?.email || '').trim();
  const club = submittedByClub(submittedBy);
  return {
    name: name || NO_MANAGER_NAME,
    email: email || NO_MANAGER_EMAIL,
    club: club || NO_MANAGER_LOCATION,
    hasAny: Boolean(name || email || club),
    rawName: name,
    rawEmail: email,
    rawClub: club,
  };
}

/** True when admin entered any manager name / email / club on Add Manually. */
export function hasAttributedManager(submittedBy) {
  return formatAttributedManagerFields(submittedBy).hasAny;
}

/** Admin Add Manually (no linked manager user) — may still include attributed manager details. */
export function isAdminEntry(request) {
  if (isAwaitingManagerSubmission(request?.tags)) return false;
  if (request?.managerId) return false;
  if (isManualEntry(request?.submittedBy)) return true;
  const tags = request?.tags || [];
  return tags.includes(TAG_PARTNER_REQUEST)
    || (tags.includes(TAG_VERIFIED) && !tags.includes('auto mail'));
}

export const getManagerDisplayName = (submittedBy, tags = [], request = null) => {
  if (isAwaitingManagerSubmission(tags)) return AWAITING_MANAGER_LABEL;
  if (isAutomatedSubmittedBy(submittedBy)) return AWAITING_MANAGER_LABEL;
  const name = submittedByName(submittedBy);
  if (name) return name;
  if (isAdminEntry(request || { submittedBy, tags }) || isManualEntry(submittedBy)) {
    return SENT_BY_ADMIN_LABEL;
  }
  return '';
};

export function getManagerColumnContent(request) {
  const tags = request?.tags || [];
  if (isAwaitingManagerSubmission(tags)) {
    return {
      primary: AWAITING_MANAGER_LABEL,
      secondary: AWAITING_MANAGER_HINT,
      tertiary: '',
      muted: true,
    };
  }
  const submittedBy = request?.submittedBy;
  if (isAutomatedSubmittedBy(submittedBy)) {
    return {
      primary: getManagerDisplayName(submittedBy, tags, request),
      secondary: AWAITING_MANAGER_HINT,
      tertiary: submittedBy?.club || '',
      muted: true,
    };
  }
  if (isAdminEntry(request) || isManualEntry(submittedBy)) {
    const fields = formatAttributedManagerFields(submittedBy);
    if (!fields.hasAny) {
      return {
        primary: 'No manager details',
        secondary: '',
        tertiary: '',
        lines: null,
        muted: true,
        placeholder: true,
      };
    }
    return {
      primary: fields.name,
      secondary: fields.email,
      tertiary: fields.club,
      lines: null,
      muted: false,
    };
  }
  const name = getManagerDisplayName(submittedBy, tags, request);
  if (!name) {
    return {
      primary: AWAITING_MANAGER_LABEL,
      secondary: AWAITING_MANAGER_HINT,
      tertiary: '',
      muted: true,
    };
  }
  return {
    primary: name,
    secondary: (submittedBy?.email || '').trim() || 'No email',
    tertiary: (submittedBy?.club || '').trim() || 'No club',
    muted: false,
  };
}

/** Directory ledger rows — empty manager is not an auto-email request. */
export function getDirectoryManagerColumnContent(row) {
  const name = (row?.managerName || '').trim();
  const email = (row?.managerEmail || '').trim();
  const club = (row?.club || '').trim();
  if (!name && !email) {
    return {
      primary: 'No manager details',
      secondary: '',
      tertiary: '',
      muted: true,
      placeholder: true,
    };
  }
  return {
    primary: name || NO_MANAGER_NAME,
    secondary: email || NO_MANAGER_EMAIL,
    tertiary: club || NO_MANAGER_LOCATION,
    muted: !name,
  };
}
