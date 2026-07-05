export function formatRequestDisplayId(displayId) {
  if (!displayId) return '—';
  return `R-${String(displayId).padStart(2, '0')}`;
}

export function formatAdminDateTime(isoString) {
  if (!isoString) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false,
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}

export function formatAdminDate(isoString) {
  if (!isoString) return '';
  try {
    return new Intl.DateTimeFormat(undefined, {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    }).format(new Date(isoString));
  } catch {
    return isoString;
  }
}
