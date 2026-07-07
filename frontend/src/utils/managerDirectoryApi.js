import { fetchJson } from './api';
import { normalizeDirectoryPerson } from './managerDirectory';

export async function searchManagerDirectory(query, limit = 25) {
  const params = new URLSearchParams({
    q: query,
    limit: String(limit),
  });
  const data = await fetchJson(`/api/manager/persons/search?${params}`);
  return Array.isArray(data) ? data.map(normalizeDirectoryPerson).filter(Boolean) : [];
}

export async function fetchFormMatchCandidates(person, limit = 15) {
  const data = await fetchJson(`/api/manager/persons/match-candidates?limit=${limit}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      email: person.email?.trim() || undefined,
      firstName: person.firstName?.trim() || undefined,
      lastName: person.lastName?.trim() || undefined,
      location: person.location?.trim() || undefined,
    }),
  });

  if (!Array.isArray(data)) return [];

  return data
    .map((row) => {
      const personRow = normalizeDirectoryPerson(row);
      if (!personRow) return null;
      return {
        ...personRow,
        matchReasons: Array.isArray(row.matchReasons) ? row.matchReasons : ['Match'],
      };
    })
    .filter(Boolean);
}
