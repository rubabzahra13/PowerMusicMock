const DRAFT_PREFIX = 'powerMusicOps.managerFormDraft';

function draftKey(userId) {
  return `${DRAFT_PREFIX}:${userId}`;
}

export function readManagerFormDraft(userId) {
  if (!userId || typeof window === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(draftKey(userId));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

export function writeManagerFormDraft(userId, draft) {
  if (!userId || typeof window === 'undefined') return;
  try {
    sessionStorage.setItem(draftKey(userId), JSON.stringify({ ...draft, savedAt: Date.now() }));
  } catch {
    // ignore quota / private mode
  }
}

export function clearManagerFormDraft(userId) {
  if (!userId || typeof window === 'undefined') return;
  try {
    sessionStorage.removeItem(draftKey(userId));
  } catch {
    // ignore
  }
}

export const EMPTY_MANAGER_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  club: '',
};

export const EMPTY_PERSON_FORM = {
  firstName: '',
  lastName: '',
  email: '',
  location: '',
};
