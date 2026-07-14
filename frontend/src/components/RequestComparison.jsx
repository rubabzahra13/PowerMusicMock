import { useMemo } from 'react';
import { AlertTriangle } from 'lucide-react';
import { formatAdminDate } from '../utils/requestDisplayId';
import {
  hasAnyDataDiffs,
  hasComparisonContext,
} from '../utils/requestComparison';

const norm = (value) => (value || '').trim().toLowerCase();

const FIELD_ROWS = [
  { key: 'name', label: 'Name' },
  { key: 'email', label: 'Email', mono: true },
  { key: 'location', label: 'Location' },
];

/**
 * One matrix: fields as rows, sources as columns.
 * The "This request" column is the anchor; cells that differ from it are highlighted.
 */
function ComparisonMatrix({ sources, embedded = false }) {
  const rows = FIELD_ROWS.filter(({ key }) =>
    sources.some((source) => source.values[key]),
  );

  const anchor = sources[0];

  return (
    <div
      className={
        embedded
          ? 'overflow-hidden bg-white'
          : 'overflow-hidden rounded-xl border border-[var(--color-border-default)] bg-white'
      }
    >
      <div className="overflow-x-auto">
        <table className="w-full min-w-[40rem] border-collapse text-sm">
          <caption className="sr-only">
            Person details from each source. Highlighted values differ from this request.
          </caption>
          <thead>
            <tr className="border-b border-[var(--color-border-default)] bg-white">
              <th
                scope="col"
                className="sticky left-0 z-[1] w-28 bg-white px-4 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]"
              >
                Field
              </th>
              {sources.map((source) => (
                <th
                  key={source.key}
                  scope="col"
                  className="bg-white px-4 py-3 text-left align-top"
                >
                  <span className="block text-[13px] font-semibold text-[var(--color-text-primary)]">
                    {source.title}
                  </span>
                  <span className="mt-0.5 block text-[11px] font-normal normal-case text-[var(--color-text-secondary)]">
                    {source.caption}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-[var(--color-border-default)]">
            {rows.map(({ key, label, mono }) => {
              const presentValues = sources
                .map((s) => s.values[key])
                .filter((v) => (v || '').trim() !== '');
              const conflict =
                presentValues.length > 1 &&
                new Set(presentValues.map(norm)).size > 1;

              return (
                <tr key={key}>
                  <th
                    scope="row"
                    className="sticky left-0 z-[1] bg-white px-4 py-3.5 text-left align-top text-sm font-medium text-[var(--color-text-secondary)]"
                  >
                    {label}
                    {conflict ? (
                      <span className="mt-1 flex items-center gap-1 text-[11px] font-semibold text-[#92400e]">
                        <AlertTriangle className="h-3 w-3" aria-hidden="true" />
                        Conflict
                      </span>
                    ) : null}
                  </th>
                  {sources.map((source, i) => {
                    const value = source.values[key];
                    const differs =
                      conflict &&
                      i !== 0 &&
                      (value || '').trim() !== '' &&
                      norm(value) !== norm(anchor.values[key]);

                    return (
                      <td
                        key={`${source.key}-${key}`}
                        className={`px-4 py-3.5 align-top ${
                          differs ? 'bg-[#fef3c7]' : 'bg-white'
                        }`}
                      >
                        <span
                          className={`break-words ${
                            mono ? 'font-mono text-[13px]' : ''
                          } ${
                            differs
                              ? 'font-semibold text-[#92400e]'
                              : 'font-medium text-[var(--color-text-primary)]'
                          }`}
                        >
                          {value || <span className="text-[var(--color-text-muted)]">—</span>}
                          {differs ? (
                            <span className="sr-only"> (differs from this request)</span>
                          ) : null}
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
    </div>
  );
}

function TableReviewCell({ hasDiffs: showYes, onViewDetails }) {
  if (!showYes) {
    return (
      <span className="block text-center text-xs font-medium text-[var(--color-text-muted)]">No</span>
    );
  }

  if (onViewDetails) {
    return (
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          onViewDetails();
        }}
        className="mx-auto block text-center text-xs font-semibold text-[var(--color-brand-secondary)] hover:underline"
      >
        Yes · View details
      </button>
    );
  }

  return (
    <span className="block text-center text-xs font-semibold text-[var(--color-text-primary)]">
      Yes · View details
    </span>
  );
}

export default function RequestComparison({
  intakeMatch,
  directoryMatch,
  directory = [],
  requestPerson,
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
        className={`flex min-w-0 justify-center ${className}`.trim()}
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

  const sources = [
    requestPerson
      ? {
          key: 'request',
          title: 'This request',
          caption: 'Being reviewed',
          values: {
            name: `${requestPerson.firstName || ''} ${requestPerson.lastName || ''}`.trim(),
            email: requestPerson.email,
            location: requestPerson.location,
          },
        }
      : null,
    intakeMatch?.fields?.length
      ? {
          key: 'partner',
          title: 'Manager form',
          caption: 'Entered by manager',
          values: {
            name: intakeField('name', 'leftValue'),
            email: intakeField('email', 'leftValue'),
            location: intakeField('location', 'leftValue'),
          },
        }
      : null,
    intakeMatch?.fields?.length
      ? {
          key: 'auto',
          title: 'Automated email',
          caption: 'From roster email',
          values: {
            name: intakeField('name', 'rightValue'),
            email: intakeField('email', 'rightValue'),
            location: intakeField('location', 'rightValue'),
          },
        }
      : null,
    directoryRecord || directoryMatch
      ? {
          key: 'directory',
          title: 'Directory',
          caption: directoryRecord?.dateAdded
            ? `Added ${formatAdminDate(directoryRecord.dateAdded)}`
            : 'Existing record',
          values: directoryRecord
            ? {
                name: `${directoryRecord.firstName || ''} ${directoryRecord.lastName || ''}`.trim(),
                email: directoryRecord.email,
                location: directoryRecord.location,
              }
            : {
                name: directoryMatch?.directoryName || '',
                email: directoryMatch?.fields?.find((f) => f.field === 'email')?.rightValue || '',
                location:
                  directoryMatch?.fields?.find((f) => f.field === 'location')?.rightValue || '',
              },
        }
      : null,
  ].filter(Boolean);

  return (
    <div className={className}>
      <ComparisonMatrix sources={sources} embedded={embedded} />
    </div>
  );
}
