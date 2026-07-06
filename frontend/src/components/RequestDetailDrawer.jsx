import { useState, useMemo, useEffect } from 'react';
import { AlertTriangle, Check, MessageSquarePlus, User, UserRound } from 'lucide-react';
import { Drawer, Tag } from './ui';
import RequestComparison from './RequestComparison';
import { hasComparisonContext } from '../utils/requestComparison';
import { getManagerDisplayName, isManualEntry, AWAITING_MANAGER_HINT } from '../utils/manualEntry';
import { TAG_ALREADY_EXISTS, visibleTableRequestTags, requestTagLabel, requestTagVariant, isAwaitingManagerSubmission } from '../utils/requestTags';
import { formatRequestDisplayId, formatAdminDateTime, formatAdminDate } from '../utils/requestDisplayId';

function DetailSection({ icon: Icon, title, id, children }) {
  return (
    <section
      aria-labelledby={id}
      className="rounded-lg border border-[var(--color-border-default)] bg-white shadow-[0_1px_2px_rgba(26,26,46,0.04)]"
    >
      <div className="flex items-center gap-2 border-b border-[var(--color-border-default)] px-3 py-2">
        {Icon ? (
          <Icon className="h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" aria-hidden="true" />
        ) : null}
        <h3
          id={id}
          className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]"
        >
          {title}
        </h3>
      </div>
      <dl className="divide-y divide-[var(--color-border-default)]/70 px-3">{children}</dl>
    </section>
  );
}

function DetailRow({ label, value, mono = false }) {
  if (!value) return null;

  return (
    <div className="grid grid-cols-[88px_1fr] gap-2 py-2 text-xs leading-snug">
      <dt className="text-[var(--color-text-muted)]">{label}</dt>
      <dd
        className={`min-w-0 font-medium text-[var(--color-text-primary)] break-words ${
          mono ? 'font-mono text-[11px]' : ''
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

export default function RequestDetailDrawer({
  request,
  isOpen,
  onClose,
  onConfirmAction,
  directory = [],
}) {
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState('');

  useEffect(() => {
    setShowNoteInput(false);
    setNoteText('');
  }, [request?.id]);

  const formatDateTime = formatAdminDateTime;

  const formatDate = formatAdminDate;

  const matchedDirectoryRecord = useMemo(() => {
    if (!request?.directoryMatch?.directoryId || !directory?.length) return null;
    return directory.find((record) => record.id === request.directoryMatch.directoryId) || null;
  }, [request, directory]);

  if (!request) return null;

  const managerName = getManagerDisplayName(request.submittedBy, request.tags);
  const awaitingManager = isAwaitingManagerSubmission(request.tags);
  const submittedByLabel = awaitingManager
    ? 'PureGym automated email'
    : (request.createdBy || managerName);
  const isAdd = request.action === 'Add';
  const personActionLabel = isAdd ? 'Add' : 'Remove';
  const notesText = request.notes?.trim();

  const handleNoteKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = noteText.trim();
      if (text !== '') {
        setShowNoteInput(false);
      }
    }
  };

  const handleConfirmAction = () => {
    onConfirmAction(request, noteText.trim());
  };

  const footer = (
    <div className="space-y-2.5">
      {showNoteInput ? (
        <div className="space-y-2">
          <label htmlFor="request-detail-note" className="sr-only">
            Admin note
          </label>
          <textarea
            id="request-detail-note"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            onKeyDown={handleNoteKeyPress}
            placeholder="Optional note saved when you mark as added/removed"
            rows={2}
            className="w-full resize-none rounded-lg border border-[var(--color-border-default)] bg-white px-3 py-2 text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:border-[var(--color-brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-primary)]/15"
            autoFocus
          />
          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={() => {
                setShowNoteInput(false);
                setNoteText('');
              }}
              className="rounded-md px-2.5 py-1 text-[11px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-panel)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]/20"
            >
              Discard
            </button>
          </div>
        </div>
      ) : (
        <button
          type="button"
          onClick={() => setShowNoteInput(true)}
          className="inline-flex items-center gap-1.5 rounded-md px-1 py-0.5 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]/20"
        >
          <MessageSquarePlus className="h-3.5 w-3.5" aria-hidden="true" />
          Add admin note
        </button>
      )}

      <button
        type="button"
        onClick={handleConfirmAction}
        className="flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-brand-primary)] text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-surface-sidebar-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]/40 focus-visible:ring-offset-2"
      >
        <Check className="h-4 w-4" aria-hidden="true" />
        {isAdd ? 'Mark as added' : 'Mark as removed'}
      </button>
    </div>
  );

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Request detail" fill footer={footer}>
      <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden">
        <div className="shrink-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <Tag
              variant={isAdd ? 'add-action' : 'remove-action'}
              label={`${personActionLabel} person`}
              compact
            />
            {visibleTableRequestTags(request.tags || []).map((tag) => (
              <Tag
                key={tag}
                variant={requestTagVariant(tag)}
                label={requestTagLabel(tag)}
                compact={tag === TAG_ALREADY_EXISTS}
              />
            ))}
          </div>

          <div className="space-y-0.5">
            <p className="text-sm font-semibold text-[var(--color-text-primary)]">
              {request.person.firstName} {request.person.lastName}
            </p>
            <p className="text-xs text-[var(--color-text-secondary)]">
              <span className="font-semibold text-[var(--color-text-primary)]">
                {formatRequestDisplayId(request.displayId)}
              </span>
              <span aria-hidden="true"> · </span>
              <time dateTime={request.receivedAt}>Received {formatDateTime(request.receivedAt)}</time>
              <span aria-hidden="true"> · </span>
              <span>Submitted by {submittedByLabel}</span>
            </p>
          </div>
        </div>

        <div className="grid min-h-0 flex-1 grid-rows-[auto_auto_auto] gap-3 overflow-hidden">
          <DetailSection icon={UserRound} title="Manager" id="request-manager-details">
            <DetailRow label="Name" value={managerName} />
            {awaitingManager ? (
              <DetailRow label="Status" value={AWAITING_MANAGER_HINT} />
            ) : (
              <>
                <DetailRow label="Email" value={request.submittedBy.email} mono />
                <DetailRow
                  label="Club"
                  value={isManualEntry(request.submittedBy) ? 'Manual entry' : request.submittedBy.club}
                />
              </>
            )}
          </DetailSection>

          <DetailSection icon={User} title={`Person to ${personActionLabel.toLowerCase()}`} id="request-person-details">
            <DetailRow label="Name" value={`${request.person.firstName} ${request.person.lastName}`.trim()} />
            <DetailRow label="Email" value={request.person.email} mono />
            <DetailRow label="Location" value={request.person.location} />
          </DetailSection>

          {hasComparisonContext(request.intakeMatch, request.directoryMatch) ? (
            <section
              aria-labelledby="request-remarks-heading"
              className="rounded-lg border border-[var(--color-border-default)] bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(26,26,46,0.04)]"
            >
              <h3
                id="request-remarks-heading"
                className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]"
              >
                Comparison
              </h3>
              <div className="mt-2">
                <RequestComparison
                  intakeMatch={request.intakeMatch}
                  directoryMatch={request.directoryMatch}
                  directory={directory}
                  requestPerson={request.person}
                  variant="detail"
                />
              </div>
            </section>
          ) : null}

          <section
            aria-labelledby="request-notes-heading"
            className="shrink-0 rounded-lg border border-[var(--color-border-default)] bg-white px-3 py-2.5 shadow-[0_1px_2px_rgba(26,26,46,0.04)]"
          >
            <h3
              id="request-notes-heading"
              className="text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]"
            >
              Notes from manager
            </h3>
            <p
              className={`mt-1.5 text-xs leading-relaxed text-[var(--color-text-primary)] ${
                notesText ? 'line-clamp-3' : 'text-[var(--color-text-muted)]'
              }`}
            >
              {notesText || 'No notes from manager.'}
            </p>
          </section>

          {request.directoryMatch && matchedDirectoryRecord ? (
            <div
              role="alert"
              className="flex shrink-0 gap-2.5 rounded-lg border border-amber-200 bg-[var(--color-tag-already-exists-bg)] px-3 py-2.5"
            >
              <AlertTriangle
                className="mt-0.5 h-4 w-4 shrink-0 text-[var(--color-tag-already-exists-text)]"
                aria-hidden="true"
              />
              <div className="min-w-0 text-xs leading-snug text-[var(--color-tag-already-exists-text)]">
                <p className="font-semibold">Already in directory</p>
                <p className="mt-0.5">
                  {matchedDirectoryRecord.firstName} {matchedDirectoryRecord.lastName} ·{' '}
                  {matchedDirectoryRecord.email}
                </p>
                <p className="mt-0.5 opacity-90">
                  {matchedDirectoryRecord.status === 'Removed' ? 'Removed' : 'Added'}{' '}
                  {formatDate(matchedDirectoryRecord.dateAdded)} · {matchedDirectoryRecord.location}
                </p>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </Drawer>
  );
}
