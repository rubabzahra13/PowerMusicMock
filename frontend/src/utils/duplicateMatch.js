/** Client-side mirror of backend match_classification for Request History UX. */

const POTENTIAL_DUPLICATE_THRESHOLD = 45.0;

function norm(val) {
  if (!val) return '';
  return String(val).trim().toLowerCase().replace(/\s+/g, ' ');
}

function jaroWinkler(s1, s2) {
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;

  const len1 = s1.length;
  const len2 = s2.length;
  const matchDistance = Math.floor(Math.max(len1, len2) / 2) - 1;

  let matches = 0;
  const hash1 = Array(len1).fill(false);
  const hash2 = Array(len2).fill(false);

  for (let i = 0; i < len1; i += 1) {
    const start = Math.max(0, i - matchDistance);
    const end = Math.min(len2, i + matchDistance + 1);
    for (let j = start; j < end; j += 1) {
      if (!hash2[j] && s1[i] === s2[j]) {
        hash1[i] = true;
        hash2[j] = true;
        matches += 1;
        break;
      }
    }
  }

  if (matches === 0) return 0.0;

  let t = 0;
  let point = 0;
  for (let i = 0; i < len1; i += 1) {
    if (hash1[i]) {
      while (!hash2[point]) point += 1;
      if (s1[i] !== s2[point]) t += 1;
      point += 1;
    }
  }
  t /= 2;

  const m = matches;
  const jaro = (m / len1 + m / len2 + (m - t) / m) / 3.0;

  let prefix = 0;
  const maxPrefix = Math.min(4, len1, len2);
  for (let i = 0; i < maxPrefix; i += 1) {
    if (s1[i] === s2[i]) prefix += 1;
    else break;
  }

  return jaro + prefix * 0.1 * (1.0 - jaro);
}

/**
 * @returns {'confirmed_duplicate' | 'potential_duplicate' | null}
 */
export function matchClassification(left, right) {
  const firstL = norm(left?.firstName);
  const lastL = norm(left?.lastName);
  const emailL = norm(left?.email);
  const locL = norm(left?.location);
  const firstR = norm(right?.firstName);
  const lastR = norm(right?.lastName);
  const emailR = norm(right?.email);
  const locR = norm(right?.location);

  if (!lastL || !lastR) return null;

  const sameLast = lastL === lastR;
  const sameFirst = firstL === firstR;
  const sameEmail = Boolean(emailL && emailR && emailL === emailR);
  const sameLoc = Boolean(locL && locR && locL === locR);

  const firstNameScore = jaroWinkler(firstL, firstR) * 30.0;
  const lastNameScore = jaroWinkler(lastL, lastR) * 35.0;
  const locScore = sameLoc ? 25.0 : 0.0;
  const emailScore = sameEmail ? 10.0 : 0.0;
  const totalScore = firstNameScore + lastNameScore + emailScore + locScore;

  if (sameFirst && sameLast && sameEmail && sameLoc) {
    return 'confirmed_duplicate';
  }
  if (totalScore >= POTENTIAL_DUPLICATE_THRESHOLD) {
    return 'potential_duplicate';
  }
  return null;
}
