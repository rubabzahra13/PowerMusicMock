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
    <Modal isOpen={isOpen} onClose={onClose} title={title} wide>
      <div className="space-y-5">
        {description ? (
          <p className="text-sm leading-relaxed text-[var(--color-text-secondary)]">{description}</p>
        ) : null}

        <div className="space-y-3">
          {fields.map((field) => (
            <article
              key={field.field}
              className="overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-white shadow-[0_1px_2px_rgba(26,26,46,0.04)]"
            >
              <header className="border-b border-[var(--color-border-default)]/70 bg-[var(--color-surface-panel)]/50 px-4 py-2.5">
                <p className="text-xs font-semibold text-[var(--color-text-primary)]">{field.label}</p>
              </header>
              <div className="grid grid-cols-1 sm:grid-cols-2 sm:divide-x divide-[var(--color-border-default)]/70">
                <div className="px-4 py-3.5">
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-text-muted)]">
                    {leftTitle}
                  </p>
                  <p className="break-words text-sm font-medium leading-relaxed text-[var(--color-text-primary)]">
                    {field.leftValue || '—'}
                  </p>
                </div>
                <div className="border-t border-[var(--color-border-default)]/70 bg-[var(--color-tag-review-mismatch-bg)]/20 px-4 py-3.5 sm:border-t-0">
                  <p className="mb-1.5 text-[10px] font-bold uppercase tracking-wider text-[var(--color-tag-review-mismatch-text)]">
                    {rightTitle}
                  </p>
                  <p className="break-words text-sm font-semibold leading-relaxed text-[var(--color-text-primary)]">
                    {field.rightValue || '—'}
                  </p>
                </div>
              </div>
            </article>
          ))}
        </div>
      </div>
    </Modal>
  );
}

function ExistingUserModal({ isOpen, onClose, directoryRecord, match, requestPerson }) {
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Data difference with directory" wide>
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
          {requestPerson ? (
            <dl className="mt-3 space-y-2 text-sm">
              <div>
                <dt className="text-[11px] text-[var(--color-text-muted)]">Name</dt>
                <dd className="font-semibold">{requestPerson.firstName} {requestPerson.lastName}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-[var(--color-text-muted)]">Email</dt>
                <dd className="font-medium break-all">{requestPerson.email || '—'}</dd>
              </div>
              <div>
                <dt className="text-[11px] text-[var(--color-text-muted)]">Location</dt>
                <dd className="font-medium">{requestPerson.location || '—'}</dd>
              </div>
            </dl>
          ) : (
            <p className="mt-3 text-sm text-[var(--color-text-muted)]">Request details unavailable.</p>
          )}
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
      {showDiffDetails && status ? (
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
          actionLabel: 'View details of data difference between directory record and this request',
          onAction: () => setDirectoryOpen(true),
        }
      : null,
    intakeHasDiffs
      ? {
          key: 'email',
          titleTag: intakeMismatchReviewTag(compact),
          status: getMatchStatusLabel(intakeMatch, false, 'intake'),
          match: intakeMatch,
          hasDiffs: true,
          actionLabel: 'View details of data difference between manager request and Auto Mail',
          onAction: () => setIntakeOpen(true),
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
