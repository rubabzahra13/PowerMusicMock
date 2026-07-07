import { normalizeDirectoryPerson } from './managerDirectory';

const CACHE_KEY = 'pm_manager_directory_snapshot';
const CACHE_TTL_MS = 5 * 60 * 1000;

export function readDirectoryCache(userId) {
  if (!userId || typeof sessionStorage === 'undefined') return null;
  try {
    const raw = sessionStorage.getItem(CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (parsed?.userId !== userId || !Array.isArray(parsed.people)) return null;
    if (Date.now() - (parsed.cachedAt || 0) > CACHE_TTL_MS) return null;
    return parsed.people.map(normalizeDirectoryPerson).filter(Boolean);
  } catch {
    return null;
  }
}

export function writeDirectoryCache(userId, people) {
  if (!userId || typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.setItem(
      CACHE_KEY,
      JSON.stringify({
        userId,
        cachedAt: Date.now(),
        people: people.map(normalizeDirectoryPerson).filter(Boolean),
      }),
    );
  } catch {
    /* quota or private mode */
  }
}

export function clearDirectoryCache() {
  if (typeof sessionStorage === 'undefined') return;
  try {
    sessionStorage.removeItem(CACHE_KEY);
  } catch {
    /* ignore */
  }
}
