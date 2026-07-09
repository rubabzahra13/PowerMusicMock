import { useMemo, useState } from 'react';
import Modal from './ui/Modal';
import Tag from './ui/Tag';
import { formatAdminDate } from '../utils/requestDisplayId';
import {
  differingFields,
  getMatchStatusLabel,
  hasDiffs,
} from '../utils/requestComparison';
import { directoryReviewTag, intakeMismatchReviewTag } from '../utils/requestTags';

function getDirectoryStatus(record) {
  const status = record?.status;
  if (status === 'Added' || status === 'Removed') return status;
  return 'In directory';
}

function getTriggerSummary(rows) {
  const diffRows = rows.filter((row) => row.hasDiffs);
  if (diffRows.length === 0) {
    const directoryRow = rows.find((row) => row.key === 'directory');
    return directoryRow ? `${directoryRow.shortLabel} · No difference found` : 'No difference found';
  }
  return diffRows.map((row) => row.shortLabel).join(' · ');
}

function ComparisonSideBySideModal({
  isOpen,
  onClose,
  title,
  description,
  leftTitle,
  rightTitle,
  match,
}) {
  const fields = differingFields(match);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={title} wide belowDrawer>
      {description ? (
        <p className="mb-4 text-sm leading-relaxed text-[var(--color-text-secondary)]">{description}</p>
      ) : null}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {[leftTitle, rightTitle].map((heading, index) => (
          <div
            key={heading}
            className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-panel)]/70 p-4"
          >
            <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
              {heading}
            </p>
            <dl className="mt-3 space-y-3">
              {fields.map((field) => (
                <div key={`${heading}-${field.field}`}>
                  <dt className="text-[11px] font-medium text-[var(--color-text-muted)]">{field.label}</dt>
                  <dd className="mt-0.5 break-words text-sm font-semibold text-[var(--color-text-primary)]">
                    {(index === 0 ? field.leftValue : field.rightValue) || '—'}
                  </dd>
                </div>
              ))}
            </dl>
          </div>
        ))}
      </div>
    </Modal>
  );
}

function ExistingUserModal({ isOpen, onClose, directoryRecord, match, requestPerson }) {
  const fields = differingFields(match);

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Data difference with directory" wide belowDrawer>
      <p className="mb-4 text-sm leading-relaxed text-[var(--color-text-secondary)]">
        View details of the difference in data between the directory record and this request.
      </p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-panel)]/70 p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
            Existing user
          </p>
          {directoryRecord ? (
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-[11px] text-[var(--color-text-muted)]">Name</dt>
                <dd className="font-semibold">{directoryRecord.firstName} {directoryRecord.lastName}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-[var(--color-text-muted)]">Email</dt>
                <dd className="font-medium break-all">{directoryRecord.email}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-[var(--color-text-muted)]">Location</dt>
                <dd className="font-medium">{directoryRecord.location || '—'}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-[var(--color-text-muted)]">Status</dt>
                <dd className="font-medium">{getDirectoryStatus(directoryRecord)}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-[var(--color-text-muted)]">Handled</dt>
                <dd className="font-medium">{formatAdminDate(directoryRecord.dateAdded)}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-[var(--color-text-muted)]">Directory record unavailable.</p>
          )}
        </div>

        <div className="rounded-xl border border-[var(--color-border-default)] bg-white p-4">
          <p className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
            Current request
          </p>
          <dl className="mt-3 space-y-3">
            {fields.map((field) => (
              <div key={field.field}>
                <dt className="text-[11px] font-medium text-[var(--color-text-muted)]">{field.label}</dt>
                <dd className="mt-0.5 break-words text-sm font-semibold text-[var(--color-text-primary)]">
                  {field.rightValue || '—'}
                </dd>
                <p className="mt-1 text-[11px] text-[var(--color-text-secondary)]">
                  Directory: {field.leftValue || '—'}
                </p>
              </div>
            ))}
          </dl>
          {requestPerson ? (
            <p className="mt-4 text-[11px] text-[var(--color-text-muted)]">
              Request person: {requestPerson.firstName} {requestPerson.lastName}
            </p>
          ) : null}
        </div>
      </div>
    </Modal>
  );
}

function ComparisonRow({ titleTag, status, hasDiffs: showDiffDetails, onAction, actionLabel, compact }) {
  const statusClass = compact ? 'text-[10px] leading-tight' : 'text-[11px] leading-tight';

  const body = (
    <span className="block min-w-0">
      <span className="block">
        <Tag variant={titleTag.variant} label={titleTag.label} prefix={titleTag.prefix} compact={titleTag.compact ?? compact} />
      </span>
      {status ? (
        <span
          className={`mt-0.5 block whitespace-normal break-words text-[var(--color-text-secondary)] ${statusClass}`}
        >
          {status}
        </span>
      ) : null}
    </span>
  );

  if (showDiffDetails) {
    return (
      <button
        type="button"
        onClick={onAction}
        aria-label={actionLabel}
        className="block w-full min-w-0 rounded-md px-0.5 py-0.5 text-left hover:bg-[var(--color-surface-panel)]/80"
      >
        {body}
      </button>
    );
  }

  return <div className="min-w-0 px-0.5 py-0.5">{body}</div>;
}

function ComparisonStack({ children, compact, className }) {
  return (
    <div
      className={`${compact ? 'space-y-0.5' : 'space-y-1.5'} min-w-0 ${className}`.trim()}
      onClick={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      {children}
    </div>
  );
}

function ComparisonTrigger({ rows, onOpen, className }) {
  const hasAnyDiffs = rows.some((row) => row.hasDiffs);
  const summary = getTriggerSummary(rows);
  const badgeClass = hasAnyDiffs
    ? 'bg-[var(--color-tag-review-mismatch-bg)] text-[var(--color-tag-review-mismatch-text)] ring-[var(--color-tag-review-mismatch-border)]'
    : 'bg-[var(--color-tag-added-bg)] text-[var(--color-tag-added-text)] ring-emerald-200';

  return (
    <button
      type="button"
      onClick={(event) => {
        event.stopPropagation();
        onOpen();
      }}
      className={`flex min-h-[36px] w-full items-center gap-2 rounded-md border border-[var(--color-border-default)] bg-white px-2 py-1.5 text-left shadow-[0_1px_2px_rgba(26,26,46,0.04)] transition-colors hover:border-[var(--color-text-muted)]/60 hover:bg-[var(--color-surface-panel)] ${className}`.trim()}
      aria-label="View comparison details"
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[11px] font-bold text-[var(--color-text-primary)]">
          View comparison
        </span>
        <span className="block truncate text-[10px] font-semibold text-[var(--color-text-secondary)]">
          {summary}
        </span>
      </span>
      <span className={`inline-flex shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-bold ring-1 ${badgeClass}`}>
        {hasAnyDiffs ? 'Review' : 'OK'}
      </span>
    </button>
  );
}

function ComparisonOverviewModal({ isOpen, onClose, rows }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Comparison" wide belowDrawer>
      <ComparisonStack compact={false}>
        {rows.map((row) => (
          <ComparisonRow
            key={row.key}
            titleTag={{ ...row.titleTag, compact: false }}
            status={row.status}
            hasDiffs={row.hasDiffs}
            actionLabel={row.actionLabel}
            onAction={row.onAction}
            compact={false}
          />
        ))}
      </ComparisonStack>
    </Modal>
  );
}

export default function RequestComparison({
  intakeMatch,
  directoryMatch,
  directory = [],
  requestPerson,
  variant = 'table',
  className = '',
}) {
  const [intakeOpen, setIntakeOpen] = useState(false);
  const [directoryOpen, setDirectoryOpen] = useState(false);
  const [overviewOpen, setOverviewOpen] = useState(false);
  const compact = variant === 'table';

  const directoryRecord = useMemo(
    () => directory.find((record) => record.id === directoryMatch?.directoryId) || null,
    [directory, directoryMatch?.directoryId],
  );

  const intakeHasDiffs = Boolean(intakeMatch && hasDiffs(intakeMatch));
  const directoryHasDiffs = Boolean(directoryMatch && hasDiffs(directoryMatch));

  const rows = [
    directoryMatch
      ? {
          key: 'directory',
          titleTag: directoryReviewTag(directoryRecord, compact),
          status: getMatchStatusLabel(directoryMatch, !directoryHasDiffs, 'directory'),
          match: directoryMatch,
          hasDiffs: directoryHasDiffs,
          shortLabel: directoryHasDiffs ? 'DB differs' : `${getDirectoryStatus(directoryRecord)} in DB`,
          actionLabel: 'View details of data difference between directory record and this request',
          onAction: () => {
            setOverviewOpen(false);
            setDirectoryOpen(true);
          },
        }
      : null,
    intakeMatch
      ? {
          key: 'email',
          titleTag: intakeHasDiffs
            ? intakeMismatchReviewTag(compact)
            : { variant: 'auto-mail', label: 'Auto Mail', prefix: '', compact },
          status: getMatchStatusLabel(intakeMatch, !intakeHasDiffs, 'intake'),
          match: intakeMatch,
          hasDiffs: intakeHasDiffs,
          shortLabel: intakeHasDiffs ? 'Auto Mail differs' : 'Auto Mail',
          actionLabel: 'View details of data difference between manager request and Auto Mail',
          onAction: () => {
            setOverviewOpen(false);
            setIntakeOpen(true);
          },
        }
      : null,
  ].filter(Boolean);

  if (rows.length === 0) {
    return compact ? (
      <span className={`text-[11px] text-[var(--color-text-muted)] ${className}`.trim()}>No review needed.</span>
    ) : null;
  }

  return (
    <>
      {compact ? (
        <ComparisonTrigger rows={rows} onOpen={() => setOverviewOpen(true)} className={className} />
      ) : (
        <ComparisonStack compact={compact} className={className}>
          {rows.map((row) => (
            <ComparisonRow
              key={row.key}
              titleTag={row.titleTag}
              status={row.status}
              hasDiffs={row.hasDiffs}
              actionLabel={row.actionLabel}
              onAction={row.onAction}
              compact={compact}
            />
          ))}
        </ComparisonStack>
      )}

      <ComparisonOverviewModal
        isOpen={overviewOpen}
        onClose={() => setOverviewOpen(false)}
        rows={rows}
      />

      {intakeHasDiffs ? (
        <ComparisonSideBySideModal
          isOpen={intakeOpen}
          onClose={() => setIntakeOpen(false)}
          title="Data difference between requests"
          description="View how the manager request and Auto Mail data differ."
          leftTitle="Manager request"
          rightTitle="Auto Mail data"
          match={intakeMatch}
        />
      ) : null}

      {directoryHasDiffs ? (
        <ExistingUserModal
          isOpen={directoryOpen}
          onClose={() => setDirectoryOpen(false)}
          directoryRecord={directoryRecord}
          match={directoryMatch}
          requestPerson={requestPerson}
        />
      ) : null}
    </>
  );
}
