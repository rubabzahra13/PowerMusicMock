/** Timezone-aware display helpers. Store UTC on the server; format in the viewer's zone. */

export function getUserTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

export function getUserTimeZoneLabel(timeZone = getUserTimeZone()) {
  try {
    const parts = new Intl.DateTimeFormat(undefined, {
      timeZone,
      timeZoneName: 'long',
    }).formatToParts(new Date());
    return parts.find((part) => part.type === 'timeZoneName')?.value || timeZone;
  } catch {
    return timeZone;
  }
}

function parseInstant(isoString) {
  if (!isoString) return null;
  const date = new Date(isoString);
  return Number.isNaN(date.getTime()) ? null : date;
}

function calendarKey(date, timeZone) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

export function isTodayInTimeZone(date, timeZone = getUserTimeZone()) {
  return calendarKey(date, timeZone) === calendarKey(new Date(), timeZone);
}

export function isYesterdayInTimeZone(date, timeZone = getUserTimeZone()) {
  const yesterday = new Date();
  yesterday.setDate(yesterday.getDate() - 1);
  return calendarKey(date, timeZone) === calendarKey(yesterday, timeZone);
}

export function formatDateTime(isoString, options = {}, timeZone = getUserTimeZone()) {
  const date = parseInstant(isoString);
  if (!date) return isoString || '';
  try {
    return new Intl.DateTimeFormat(undefined, { timeZone, ...options }).format(date);
  } catch {
    return isoString;
  }
}

export function formatAdminDateTime(isoString, timeZone = getUserTimeZone()) {
  return formatDateTime(isoString, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }, timeZone);
}

export function formatAdminDate(isoString, timeZone = getUserTimeZone()) {
  return formatDateTime(isoString, {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }, timeZone);
}

export function formatListTime(isoString, timeZone = getUserTimeZone()) {
  const date = parseInstant(isoString);
  if (!date) return isoString || '';
  if (isTodayInTimeZone(date, timeZone)) {
    return formatDateTime(isoString, { hour: 'numeric', minute: '2-digit', hour12: true }, timeZone);
  }
  if (isYesterdayInTimeZone(date, timeZone)) return 'Yesterday';
  return formatDateTime(isoString, { day: 'numeric', month: 'short' }, timeZone);
}

export function formatDetailTime(isoString, timeZone = getUserTimeZone()) {
  return formatDateTime(isoString, {
    weekday: 'short',
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }, timeZone);
}

export function getDateGroupLabel(isoString, timeZone = getUserTimeZone()) {
  const date = parseInstant(isoString);
  if (!date) return 'Earlier';
  if (isTodayInTimeZone(date, timeZone)) return 'Today';
  if (isYesterdayInTimeZone(date, timeZone)) return 'Yesterday';
  return formatDateTime(isoString, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  }, timeZone);
}
