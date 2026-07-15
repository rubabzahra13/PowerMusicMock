import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { formatAdminDateTime } from '../utils/requestDisplayId';
import {
  hasAnyDataDiffs,
  hasComparisonContext,
} from '../utils/requestComparison';
import { TAG_AUTO_MAIL, TAG_PARTNER_REQUEST } from '../utils/requestTags';

const norm = (value) => {
  if (value == null) return '';
  if (typeof value === 'object') {
    const role = (value.role || '').trim().toLowerCase();
    const name = (value.name || '').trim().toLowerCase();
    const email = (value.email || '').trim().toLowerCase();
    const club = (value.club || '').trim().toLowerCase();
    return `${role}|${name}|${email}|${club}`;
  }
  return String(value).trim().toLowerCase();
};

const hasValue = (value) => {
  if (value == null) return false;
  if (typeof value === 'object') {
    return Boolean(
      (value.role || '').trim()
      || (value.name || '').trim()
      || (value.email || '').trim()
      || (value.club || '').trim(),
    );
  }
  return String(value).trim() !== '';
};

const PERSON_FIELD_ROWS = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email', mono: true },
  { key: 'location', label: 'Location' },
];

/**
 * One matrix: fields as rows, sources as columns.
 * Fits the available page width (table-fixed, wrapping) — no horizontal scroll.
 */
function ComparisonMatrix({ sources, embedded = false, includeManagerRow = false }) {
  const rows = [
    ...PERSON_FIELD_ROWS.filter(({ key }) =>
      sources.some((source) => source.values[key]),
    ),
    ...(includeManagerRow ? [{ key: 'manager', label: 'Sent by' }] : []),
  ];

  const anchor = sources[0];
  const fieldColClass =
    'w-[5.5rem] bg-[var(--color-brand-secondary-muted)] px-2.5 text-center align-middle text-[var(--color-brand-secondary)] sm:w-24 sm:px-3';
  const titleBorder = 'border-[var(--color-brand-secondary)]';

  return (
    <div
      className={
        embedded
          ? 'min-w-0 overflow-hidden bg-white'
          : 'min-w-0 overflow-hidden rounded-xl border border-[var(--color-brand-secondary)] bg-white'
      }
    >
      <table className="w-full table-fixed border-separate border-spacing-0 text-sm leading-normal">
        <caption className="sr-only">
          Person details from each source. Highlighted values differ from the first column.
        </caption>
        <thead>
          <tr>
            <th
              scope="col"
              className={`${fieldColClass} border-b ${titleBorder} py-2.5 text-[11px] font-semibold uppercase tracking-wide`}
            >
              Field
            </th>
            {sources.map((source) => (
              <th
                key={source.key}
                scope="col"
                className={`border-b ${titleBorder} bg-[var(--color-brand-secondary-muted)] px-2.5 py-2.5 text-center align-middle sm:px-3`}
              >
                <span className="block text-[12px] font-semibold leading-snug text-[var(--color-brand-secondary)] sm:text-[13px]">
                  {source.title}
                </span>
                {source.caption ? (
                  <span className="mt-0.5 block text-[10px] font-normal normal-case leading-snug text-[var(--color-brand-secondary)]/80 sm:text-[11px]">
                    {source.caption}
                  </span>
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map(({ key, label, mono }, rowIndex) => {
            const presentValues = sources
              .map((s) => s.values[key])
              .filter(hasValue);
            const conflict =
              key !== 'manager'
              && presentValues.length > 1
              && new Set(presentValues.map(norm)).size > 1;
            const isLastRow = rowIndex === rows.length - 1;

            return (
              <tr key={key}>
                <th
                  scope="row"
                  className={`${fieldColClass} border-r ${titleBorder} py-3 text-sm font-semibold`}
                >
                  {label}
                  {conflict ? (
                    <span className="mt-1 flex items-center justify-center gap-1 text-[11px] font-semibold text-[var(--color-brand-accent)]">
                      <AlertTriangle className="h-3 w-3 shrink-0" aria-hidden="true" />
                      Conflict
                    </span>
                  ) : null}
                </th>
                {sources.map((source, i) => {
                  const value = source.values[key];
                  const differs =
                    conflict &&
                    i !== 0 &&
                    hasValue(value) &&
                    norm(value) !== norm(anchor.values[key]);

                  return (
                    <td
                      key={`${source.key}-${key}`}
                      className={`px-2.5 py-3 text-center align-middle sm:px-3 ${
                        isLastRow ? '' : 'border-b border-[var(--color-border-default)]'
                      } ${
                        differs ? 'bg-[var(--color-brand-accent)]/10' : 'bg-white'
                      }`}
                    >
                      <span
                        className={`block min-w-0 text-center ${
                          mono
                            ? 'truncate font-mono text-[12px] sm:text-[13px]'
                            : 'break-words [overflow-wrap:anywhere]'
                        } ${
                          differs
                            ? 'font-semibold text-[var(--color-brand-accent)]'
                            : 'font-medium text-[var(--color-text-primary)]'
                        }`}
                        title={typeof value === 'string' ? value : undefined}
                      >
                        {key === 'manager' ? (
                          renderManagerValue(value, differs)
                        ) : (
                          <>
                            {value || <span className="text-[var(--color-text-muted)]">-</span>}
                            {differs ? (
                              <span className="sr-only"> (differs from {anchor.title})</span>
                            ) : null}
                          </>
                        )}
                      </span>
                    </td>
                  );
                })}
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function TableReviewCell({ hasDiffs: showYes, onViewDetails }) {
  if (!showYes) {
    return (
      <span className="block text-center text-xs font-medium text-[var(--color-text-muted)]">No</span>
    );
  }

  return (
    <span className="inline-flex flex-wrap items-center justify-center gap-x-1 text-center text-xs font-medium text-[var(--color-text-muted)]">
      <span className="text-[var(--color-text-muted)]">Yes</span>
      <span aria-hidden="true">·</span>
      {onViewDetails ? (
        <button
          type="button"
          onClick={(event) => {
            event.stopPropagation();
            onViewDetails();
          }}
          className="font-semibold text-[var(--color-brand-secondary)] hover:underline"
        >
          View details
        </button>
      ) : (
        <span className="font-semibold text-[var(--color-brand-secondary)]">View details</span>
      )}
    </span>
  );
}

function renderManagerValue(value, differs) {
  const parsed = parseManagerValue(value);
  if (!parsed.role && !parsed.name && !parsed.email && !parsed.club) {
    return <span className="text-[var(--color-text-muted)]">-</span>;
  }
  const secondaryClass = differs
    ? ''
    : 'font-normal text-[var(--color-text-secondary)]';
  return (
    <>
      {parsed.role ? (
        <span className={`block text-[11px] font-semibold uppercase tracking-wide ${differs ? '' : 'text-[var(--color-text-secondary)]'}`}>
          {parsed.role}
        </span>
      ) : null}
      {parsed.name ? (
        <span className={`block ${parsed.role ? 'mt-0.5' : ''}`}>{parsed.name}</span>
      ) : null}
      {parsed.email ? (
        <span className={`mt-0.5 block font-mono text-[12px] sm:text-[13px] ${secondaryClass}`}>
          {parsed.email}
        </span>
      ) : null}
      {parsed.club ? (
        <span className={`mt-0.5 block text-[12px] sm:text-[13px] ${secondaryClass}`}>
          {parsed.club}
        </span>
      ) : null}
    </>
  );
}

function parseManagerValue(value) {
  if (!value) return { role: '', name: '', email: '', club: '' };
  if (typeof value === 'object') {
    return {
      role: (value.role || '').trim(),
      name: (value.name || '').trim(),
      email: (value.email || '').trim(),
      club: (value.club || '').trim(),
    };
  }
  const text = String(value).trim();
  const paren = text.match(/^(.*?)\s*\(([^)]+)\)\s*$/);
  if (paren) {
    return { role: '', name: paren[1].trim(), email: paren[2].trim(), club: '' };
  }
  if (text.includes('\n')) {
    const [name, ...rest] = text.split('\n');
    return { role: '', name: name.trim(), email: rest.join('\n').trim(), club: '' };
  }
  if (text.includes('@')) return { role: '', name: '', email: text, club: '' };
  return { role: '', name: text, email: '', club: '' };
}

function managerCell({ role = '', name = '', email = '', club = '' } = {}) {
  const displayRole = (role || '').trim();
  const displayName = (name || '').trim();
  const displayEmail = (email || '').trim();
  const displayClub = (club || '').trim();
  if (!displayName && !displayEmail && !displayClub) {
    // Role-only is allowed for Auto email so the label still shows when the address is missing.
    if (displayRole.toLowerCase() !== 'auto email') return null;
  }
  if (!displayRole && !displayName && !displayEmail && !displayClub) return null;
  return {
    role: displayRole,
    name: displayName,
    email: displayEmail,
    club: displayClub,
  };
}

function personValuesFromRequest(requestPerson) {
  if (!requestPerson) return null;
  return {
    name: `${requestPerson.firstName || ''} ${requestPerson.lastName || ''}`.trim(),
    email: requestPerson.email,
    location: requestPerson.location,
  };
}

export default function RequestComparison({
  intakeMatch,
  directoryMatch,
  directory = [],
  requestPerson,
  requestManager = null,
  autoSenderEmail = null,
  managerSubmittedAt = null,
  autoReceivedAt = null,
  tags = [],
  variant = 'table',
  onViewDetails,
  className = '',
  embedded = false,
}) {
  const directoryRecord = useMemo(
    () => directory.find((record) => record.id === directoryMatch?.directoryId) || null,
    [directory, directoryMatch?.directoryId],
  );

  const anyDiffs = hasAnyDataDiffs(intakeMatch, directoryMatch);
  const hasContext = hasComparisonContext(intakeMatch, directoryMatch);

  if (variant === 'table') {
    return (
      <div
        className={`flex min-w-0 items-center justify-center ${className}`.trim()}
        onClick={(event) => event.stopPropagation()}
        onKeyDown={(event) => event.stopPropagation()}
      >
        <TableReviewCell hasDiffs={anyDiffs} onViewDetails={onViewDetails} />
      </div>
    );
  }

  if (!hasContext) return null;

  const intakeField = (field, side) =>
    intakeMatch?.fields?.find((f) => f.field === field)?.[side] || '';

  const hasManagerForm = (tags || []).includes(TAG_PARTNER_REQUEST)
    || Boolean(intakeMatch?.fields?.some((field) => (field.leftValue || '').trim()));
  const hasAutoMail = (tags || []).includes(TAG_AUTO_MAIL)
    || Boolean(intakeMatch?.fields?.some((field) => (field.rightValue || '').trim()));

  const requestPersonValues = personValuesFromRequest(requestPerson);

  const includeDirectory = Boolean(directoryRecord || directoryMatch);
  const hasDirectorySender = Boolean(
    (directoryRecord?.managerName || '').trim()
    || (directoryRecord?.managerEmail || '').trim()
    || (directoryRecord?.club || '').trim(),
  );
  const directoryManager = hasDirectorySender
    ? managerCell({
        role: 'Manager',
        name: directoryRecord?.managerName,
        email: directoryRecord?.managerEmail,
        club: directoryRecord?.club,
      })
    : null;
  const requestManagerValue = typeof requestManager === 'object' && requestManager !== null
    ? managerCell({
        role: 'Manager',
        name: requestManager.name,
        email: requestManager.email,
        club: requestManager.club,
      })
    : (() => {
        const parsed = parseManagerValue(requestManager);
        return managerCell({
          role: parsed.name || parsed.email || parsed.club ? 'Manager' : '',
          ...parsed,
        });
      })();
  const autoSenderValue = managerCell({
    role: 'Auto email',
    email: autoSenderEmail,
  });

  const sources = [
    hasManagerForm
      ? {
          key: 'manager',
          title: 'Manager request',
          caption: managerSubmittedAt
            ? formatAdminDateTime(managerSubmittedAt)
            : '',
          values: {
            name: intakeMatch?.fields?.length
              ? intakeField('name', 'leftValue')
              : requestPersonValues?.name || '',
            email: intakeMatch?.fields?.length
              ? intakeField('email', 'leftValue')
              : requestPersonValues?.email || '',
            location: intakeMatch?.fields?.length
              ? intakeField('location', 'leftValue')
              : requestPersonValues?.location || '',
            manager: requestManagerValue,
          },
        }
      : null,
    hasAutoMail
      ? {
          key: 'auto',
          title: 'Automated email',
          caption: autoReceivedAt
            ? formatAdminDateTime(autoReceivedAt)
            : '',
          values: {
            name: intakeMatch?.fields?.length
              ? intakeField('name', 'rightValue')
              : requestPersonValues?.name || '',
            email: intakeMatch?.fields?.length
              ? intakeField('email', 'rightValue')
              : requestPersonValues?.email || '',
            location: intakeMatch?.fields?.length
              ? intakeField('location', 'rightValue')
              : requestPersonValues?.location || '',
            manager: autoSenderValue,
          },
        }
      : null,
    includeDirectory
      ? {
          key: 'directory',
          title: 'Already in Directory',
          caption: directoryRecord?.dateAdded
            ? `Added ${formatAdminDateTime(directoryRecord.dateAdded)}`
            : 'Existing record',
          values: directoryRecord
            ? {
                name: `${directoryRecord.firstName || ''} ${directoryRecord.lastName || ''}`.trim(),
                email: directoryRecord.email,
                location: directoryRecord.location,
                manager: directoryManager,
              }
            : {
                name: directoryMatch?.directoryName || '',
                email: directoryMatch?.fields?.find((f) => f.field === 'email')?.rightValue || '',
                location:
                  directoryMatch?.fields?.find((f) => f.field === 'location')?.rightValue || '',
                manager: directoryManager,
              },
        }
      : null,
  ].filter(Boolean);

  const includeSentByRow = sources.some((source) => hasValue(source.values.manager));

  return (
    <div className={`min-w-0 w-full ${className}`.trim()}>
      <ComparisonMatrix
        sources={sources}
        embedded={embedded}
        includeManagerRow={includeSentByRow || includeDirectory}
      />
    </div>
  );
}
