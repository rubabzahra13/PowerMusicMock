import { formatAttributedManagerFields } from './manualEntry';
import { formatPersonName } from './personDisplay';
import {
  formatIntakeEventWhen,
  intakeEventLabel,
  INTAKE_EVENT_AUTO,
  INTAKE_EVENT_DIRECTORY,
  channelKeyToEventType,
  eventsForChannel,
} from './intakeEvents';

function clean(value) {
  if (value == null) return '';
  const text = String(value).trim();
  if (!text || text.toLowerCase() === 'null' || text.toLowerCase() === 'undefined') return '';
  return text;
}

function personParts(person) {
  return {
    name: formatPersonName(person, { empty: '' }),
    email: clean(person?.email),
    location: clean(person?.location),
  };
}

function submitterParts(event, fallbackSubmittedBy) {
  const source = event?.submittedBy || fallbackSubmittedBy || null;
  const fields = formatAttributedManagerFields(source);
  return {
    managerName: fields.rawName || '',
    managerEmail: fields.rawEmail || '',
    managerLocation: fields.rawClub || '',
  };
}

const AUTO_ROWS = [
  { key: 'receivedAt', label: 'Received at' },
  { key: 'fromEmail', label: 'Received from', mono: true },
  { key: 'inboxEmail', label: 'Sent to (inbox)', mono: true },
  { key: 'subject', label: 'Subject' },
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email', mono: true },
  { key: 'location', label: 'Location' },
  { key: 'details', label: 'Details' },
];

const MANAGER_ROWS = [
  { key: 'submittedAt', label: 'Submitted at' },
  { key: 'managerName', label: 'Manager name' },
  { key: 'managerEmail', label: 'Manager email', mono: true },
  { key: 'managerLocation', label: 'Manager location' },
  { key: 'name', label: 'Person name' },
  { key: 'email', label: 'Person email', mono: true },
  { key: 'location', label: 'Person location' },
  { key: 'notes', label: 'Notes' },
];

const ADMIN_ROWS = [
  { key: 'submittedAt', label: 'Submitted at' },
  { key: 'managerName', label: 'Manager name' },
  { key: 'managerEmail', label: 'Manager email', mono: true },
  { key: 'managerLocation', label: 'Manager location' },
  { key: 'name', label: 'Person name' },
  { key: 'email', label: 'Person email', mono: true },
  { key: 'location', label: 'Person location' },
  { key: 'notes', label: 'Notes' },
];

const DIRECTORY_ROWS = [
  { key: 'matchedAt', label: 'Matched at' },
  { key: 'directoryName', label: 'Directory name' },
  { key: 'directoryStatus', label: 'Status' },
  { key: 'directoryId', label: 'Directory id', mono: true },
];

function valuesForEvent(event, channelKey, fallbackSubmittedBy) {
  const meta = event.meta || {};
  const person = personParts(event.person);
  const when = formatIntakeEventWhen(event);

  if (channelKey === 'auto' || event.type === INTAKE_EVENT_AUTO) {
    return {
      receivedAt: when,
      fromEmail: clean(meta.fromEmail),
      inboxEmail: clean(meta.inboxEmail),
      subject: clean(meta.subject),
      name: person.name,
      email: person.email,
      location: person.location,
      details: clean(meta.notes),
    };
  }

  if (channelKey === 'directory' || event.type === INTAKE_EVENT_DIRECTORY) {
    return {
      matchedAt: when,
      directoryName: clean(meta.directoryName),
      directoryStatus: clean(meta.directoryStatus),
      directoryId: clean(meta.directoryId),
    };
  }

  const submitter = submitterParts(event, fallbackSubmittedBy);
  return {
    submittedAt: when,
    managerName: submitter.managerName,
    managerEmail: submitter.managerEmail,
    managerLocation: submitter.managerLocation,
    name: person.name,
    email: person.email,
    location: person.location,
    notes: clean(meta.notes),
  };
}

function rowsForChannel(channelKey) {
  if (channelKey === 'auto') return AUTO_ROWS;
  if (channelKey === 'admin') return ADMIN_ROWS;
  if (channelKey === 'directory') return DIRECTORY_ROWS;
  return MANAGER_ROWS;
}

/**
 * Build a comparison-style table for versions of one channel.
 * Columns = each intake (#1, #2…); rows = channel-specific fields.
 */
export function buildChannelVersionTable(
  events,
  channelKey,
  {
    fallbackManagerSubmittedBy = null,
    fallbackAdminSubmittedBy = null,
  } = {},
) {
  const type = channelKeyToEventType(channelKey);
  const channelEvents = Array.isArray(events)
    ? (type ? events.filter((e) => e.type === type) : events)
    : [];
  if (!channelEvents.length) return null;

  const fallbackSubmittedBy = channelKey === 'admin'
    ? fallbackAdminSubmittedBy
    : channelKey === 'manager'
      ? fallbackManagerSubmittedBy
      : null;

  const shortLabel = intakeEventLabel(type || channelEvents[0]?.type);
  const sources = channelEvents.map((event, index) => ({
    key: event.id || `${channelKey}-${index}`,
    title: channelEvents.length > 1 ? `${shortLabel} #${index + 1}` : shortLabel,
    caption: formatIntakeEventWhen(event),
    values: valuesForEvent(event, channelKey, fallbackSubmittedBy),
  }));

  const fieldRows = rowsForChannel(channelKey).filter(({ key }) =>
    sources.some((source) => clean(source.values[key])),
  );

  return {
    channelKey,
    title: shortLabel,
    fieldRows: fieldRows.length ? fieldRows : rowsForChannel(channelKey),
    sources,
  };
}

/** Group all intakes into one version-table per channel (manager → admin → auto → directory). */
export function buildAllChannelVersionTables(
  events,
  fallbacks = {},
) {
  const order = ['manager', 'admin', 'auto', 'directory'];
  return order
    .map((channelKey) => {
      const channelEvents = eventsForChannel(events, channelKey);
      if (!channelEvents.length) return null;
      return buildChannelVersionTable(channelEvents, channelKey, fallbacks);
    })
    .filter(Boolean);
}
