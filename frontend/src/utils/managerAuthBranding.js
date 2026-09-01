import { readCachedPartnerSlugBranding } from './partnerSlugBrandingCache';

export function isHealthFitnessPartner(partnerName, partnerSlug = '') {
  const name = (partnerName || '').toLowerCase();
  const slug = (partnerSlug || '').toLowerCase();
  return (
    slug === 'health-fitness' ||
    slug === 'health-tech' ||
    slug.includes('health') ||
    name.includes('health fitness') ||
    name.includes('healthtech') ||
    name.includes('health tech') ||
    name.includes('health')
  );
}

export function getPartnerTerminology(partnerName, partnerSlug = '') {
  const isHF = isHealthFitnessPartner(partnerName, partnerSlug);
  return {
    isHealthFitness: isHF,
    managerTerm: isHF ? 'Director' : 'Manager',
    managerTermLower: isHF ? 'director' : 'manager',
    managerTermPlural: isHF ? 'Directors' : 'Managers',
    locationTerm: isHF ? 'Client' : 'Location',
    locationTermLower: isHF ? 'client' : 'location',
    clubOrClientLabel: isHF ? 'Client' : 'Club Location',
    clubOrClientPlaceholder: isHF ? 'e.g. Health Fitness HQ' : 'e.g. London Central',
    managerDetailsTitle: isHF ? 'Director Details' : 'Manager Details',
    managerFirstLabel: isHF ? 'Director First Name' : 'Manager First Name',
    managerLastLabel: isHF ? 'Director Last Name' : 'Manager Last Name',
    managerEmailLabel: isHF ? 'Director Email' : 'Manager Email',
    managerClubLabel: isHF ? 'Director Client' : 'Manager Club Location',
    roleBadge: (name) => {
      const p = name?.trim();
      if (isHF) return p ? `${p} Director` : 'Director';
      return p ? `${p} Manager` : 'Manager';
    },
  };
}

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

export function managerAuthHeading(partnerName, mode, partnerSlug = '') {
  const label = partnerName?.trim();
  const terms = getPartnerTerminology(partnerName, partnerSlug);
  if (!label) {
    if (mode === 'signup') return `${terms.managerTerm} sign up`;
    if (mode === 'signin') return `${terms.managerTerm} sign in`;
    return 'Account';
  }
  if (mode === 'signup') {
    return terms.isHealthFitness ? `${label} Director sign up` : `${label} sign up`;
  }
  return terms.isHealthFitness ? `${label} Director sign in` : `${label} sign in`;
}

export function managerAuthSubmitLabel(partnerName, mode, { loading = false, partnerSlug = '' } = {}) {
  const label = partnerName?.trim();
  const terms = getPartnerTerminology(partnerName, partnerSlug);
  const role = terms.isHealthFitness ? 'Director ' : '';
  if (loading) {
    if (mode === 'signup') return label ? `${label} ${role}sign up…` : `${terms.managerTerm} sign up…`;
    return label ? `${label} ${role}sign in…` : `${terms.managerTerm} sign in…`;
  }
  if (!label) {
    return mode === 'signup' ? `${terms.managerTerm} sign up` : `${terms.managerTerm} sign in`;
  }
  if (mode === 'signup') return `${label} ${role}sign up`;
  return `${label} ${role}sign in`;
}

export function managerAuthCreateAccountLink(partnerName, partnerSlug = '') {
  const label = partnerName?.trim();
  const terms = getPartnerTerminology(partnerName, partnerSlug);
  if (terms.isHealthFitness) {
    return label ? `Create a ${label} Director account` : 'Create a Director account';
  }
  return label ? `Create a ${label} account` : 'Create an account';
}
