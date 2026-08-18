import { readCachedPartnerSlugBranding } from './partnerSlugBrandingCache';

export function partnerDisplayNameFromSlug(slug) {
  if (!slug) return '';
  return String(slug)
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1).toLowerCase())
    .join(' ');
}

export function instantPartnerBrandingFromSlug(slug) {
  if (!slug) return null;
  const cached = readCachedPartnerSlugBranding(slug);
  if (cached?.partnerName) return cached;
  const partnerName = partnerDisplayNameFromSlug(slug);
  if (!partnerName) return null;
  return { partnerName, logoDataUrl: null };
}

function resolvedSlugBranding(slugBranding, partnerSlug) {
  if (slugBranding?.partnerName) {
    return {
      partnerName: slugBranding.partnerName,
      logoDataUrl: slugBranding.logoDataUrl ?? null,
    };
  }

  return instantPartnerBrandingFromSlug(partnerSlug);
}

/** Prefer URL slug on partner links; otherwise typed email, then slug branding. */
export function resolveManagerAuthPartnerBranding({
  emailBranding = null,
  slugBranding = null,
  partnerSlug = '',
}) {
  const fromSlug = resolvedSlugBranding(slugBranding, partnerSlug);

  if (partnerSlug && fromSlug?.partnerName) return fromSlug;
  if (emailBranding?.partnerName) return emailBranding;
  if (fromSlug?.partnerName) return fromSlug;

  return null;
}

export function managerAuthSignupPath(partnerSlug = '') {
  const slug = String(partnerSlug || '').trim();
  if (!slug) return '/submit/signup';
  return `/${encodeURIComponent(slug)}/submit/signup`;
}

export function managerAuthHeading(partnerName, mode) {
  const label = partnerName?.trim();
  if (!label) {
    if (mode === 'signup') return 'Create account';
    if (mode === 'signin') return 'Sign in';
    return 'Account';
  }
  if (mode === 'signup') return `${label} sign up`;
  return `${label} sign in`;
}

export function managerAuthSubmitLabel(partnerName, mode, { loading = false } = {}) {
  const label = partnerName?.trim();
  if (loading) {
    if (mode === 'signup') return label ? `${label} sign up…` : 'Creating account…';
    return label ? `${label} sign in…` : 'Signing in…';
  }
  if (!label) {
    return mode === 'signup' ? 'Create account' : 'Sign in';
  }
  if (mode === 'signup') return `${label} sign up`;
  return `${label} sign in`;
}

export function managerAuthCreateAccountLink(partnerName) {
  const label = partnerName?.trim();
  return label ? `Create a ${label} account` : 'Create an account';
}
