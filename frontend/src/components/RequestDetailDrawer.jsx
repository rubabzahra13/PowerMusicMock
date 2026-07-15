import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft,
  Check,
  AlertTriangle,
  CheckCircle2,
  Mail,
  MapPin,
} from 'lucide-react';
import { Tag } from './ui';
import RequestComparison from './RequestComparison';
import { hasAnyDataDiffs, hasComparisonContext } from '../utils/requestComparison';
import { getManagerDisplayName, isManualEntry } from '../utils/manualEntry';
import {
  TAG_ALREADY_EXISTS,
  TAG_AUTO_MAIL,
  visibleTableRequestTags,
  requestTagLabel,
  requestTagVariant,
  isAwaitingManagerSubmission,
  isAutomatedIntakeRequest,
} from '../utils/requestTags';
import { formatRequestDisplayId, formatAdminDateTime } from '../utils/requestDisplayId';
import { formatManagerNotes, readAutomatedNotes, readManagerNotes } from '../utils/managerNotes';

function initials(first, last) {
  return `${(first || '')[0] || ''}${(last || '')[0] || ''}`.toUpperCase() || '?';
}

function MetaItem({ label, value, mono = false, showEmpty = false }) {
  if (!value && !showEmpty) return null;
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
        {label}
      </dt>
      <dd
        className={`mt-0.5 break-words text-sm text-[var(--color-text-primary)] ${
          mono ? 'font-mono text-[13px]' : 'font-medium'
        }`}
      >
        {value || <span className="text-[var(--color-text-muted)]">-</span>}
      </dd>
    </div>
  );
}

function formatManagerDetails(name, email) {
  const displayName = (name || '').trim();
  const displayEmail = (email || '').trim();
  if (displayName && displayEmail) return `${displayName} (${displayEmail})`;
  return displayName || displayEmail || '';
}

export default function RequestDetailView({
  request,
  directory = [],
  onConfirmAction,
}) {
  const [noteText, setNoteText] = useState('');

  useEffect(() => {
    setNoteText('');
  }, [request?.id]);

  if (!request) return null;

  const awaitingManager = isAwaitingManagerSubmission(request.tags);
  const hasAutoMail = isAutomatedIntakeRequest(request.tags)
    || Boolean(request.automatedEmail)
    || (request.tags || []).includes(TAG_AUTO_MAIL);
  const isAdd = request.action === 'Add';
  const personFullName = `${request.person.firstName} ${request.person.lastName}`.trim();
  const notesText = readManagerNotes(request);
  const automatedDetails = readAutomatedNotes(request);
  const showComparison = hasComparisonContext(request.intakeMatch, request.directoryMatch);
  const hasConflicts = hasAnyDataDiffs(request.intakeMatch, request.directoryMatch);
  const clubLabel = awaitingManager
    ? null
    : isManualEntry(request.submittedBy)
      ? 'Manual entry'
      : request.submittedBy?.club;
  const secondaryTags = visibleTableRequestTags(request.tags || []);
  const managerDetails = awaitingManager
    ? ''
    : formatManagerDetails(
      getManagerDisplayName(request.submittedBy, request.tags),
      request.submittedBy?.email,
    );
  const noManagerMessage = `No manager requested to ${isAdd ? 'add' : 'remove'} this user.`;
  const autoFromEmail = (request.automatedEmail?.fromEmail || '').trim();
  const autoInboxEmail = (request.automatedEmail?.inboxEmail || '').trim();
  const autoReceivedAt = request.automatedEmail?.receivedAt || (hasAutoMail ? request.receivedAt : null);

  return (
    <div className="relative z-0 min-w-0 w-full bg-[var(--color-surface-bg)] pb-16 select-none">
      <Link
        to="/new-requests"
        className="mb-8 inline-flex items-center gap-1.5 text-sm font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        New requests
      </Link>

      <header className="relative z-[1] border-b border-[var(--color-border-default)] bg-[var(--color-surface-bg)] pb-8">
        <div className="flex items-start gap-5">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-brand-primary)] text-xl font-semibold tracking-tight text-white"
            aria-hidden="true"
          >
            {initials(request.person.firstName, request.person.lastName)}
          </div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
              <div className="min-w-0">
                <h1 className="text-[1.75rem] font-semibold leading-tight tracking-tight text-[var(--color-text-primary)]">
                  {personFullName}
                </h1>

                <div className="mt-2 flex flex-col gap-1.5 text-sm text-[var(--color-text-secondary)] sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-3 sm:gap-y-1">
                  {request.person.email ? (
                    <span className="inline-flex min-w-0 items-center gap-1.5">
                      <Mail className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
                      <span className="truncate font-mono text-[13px] text-[var(--color-text-primary)]">
                        {request.person.email}
                      </span>
                    </span>
                  ) : null}
                  {request.person.location ? (
                    <span className="inline-flex items-center gap-1.5">
                      <MapPin className="h-3.5 w-3.5 shrink-0 opacity-70" aria-hidden="true" />
                      <span className="text-[var(--color-text-primary)]">{request.person.location}</span>
                    </span>
                  ) : null}
                </div>

                <p className="mt-2 text-xs text-[var(--color-text-secondary)]">
                  {formatRequestDisplayId(request.displayId)}
                  <span className="mx-1.5 text-[var(--color-border-default)]" aria-hidden="true">
                    |
                  </span>
                  {formatAdminDateTime(request.receivedAt)}
                </p>
              </div>

              <Tag
                variant={isAdd ? 'add-action' : 'remove-action'}
                label={isAdd ? 'Add person' : 'Remove person'}
                compact
              />
            </div>

            {secondaryTags.length > 0 ? (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                {secondaryTags.map((tag) => (
                  <Tag
                    key={tag}
                    variant={requestTagVariant(tag)}
                    label={requestTagLabel(tag)}
                    compact={tag === TAG_ALREADY_EXISTS}
                  />
                ))}
              </div>
            ) : null}
          </div>
        </div>

        <div
          className={`mt-6 flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5 text-sm ${
            hasConflicts
              ? 'border-[#f0d9a8] bg-white text-[#92400e]'
              : 'border-[var(--color-border-default)] bg-white text-[var(--color-text-secondary)]'
          }`}
          role="status"
        >
          {hasConflicts ? (
            <AlertTriangle className="h-4 w-4 shrink-0" aria-hidden="true" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0" aria-hidden="true" />
          )}
          <p>
            {hasConflicts
              ? `Sources disagree. Compare below, then ${isAdd ? 'add' : 'remove'} in Power Music and mark complete.`
              : `No conflicts. ${isAdd ? 'Add' : 'Remove'} in Power Music, then mark complete.`}
          </p>
        </div>
      </header>

      {showComparison ? (
        <section aria-labelledby="comparison-heading" className="min-w-0 border-b border-[var(--color-border-default)] py-8">
          <h2
            id="comparison-heading"
            className="mb-4 text-sm font-semibold text-[var(--color-text-primary)]"
          >
            Source comparison
          </h2>
          <RequestComparison
            intakeMatch={request.intakeMatch}
            directoryMatch={request.directoryMatch}
            directory={directory}
            requestPerson={request.person}
            requestManager={managerDetails}
            tags={request.tags}
            variant="detail"
          />
        </section>
      ) : null}

      <section aria-labelledby="manager-heading" className="border-b border-[var(--color-border-default)] py-8">
        <h2
          id="manager-heading"
          className="mb-4 text-sm font-semibold text-[var(--color-text-primary)]"
        >
          Manager for this request
        </h2>

        {awaitingManager ? (
          <p className="text-sm text-[var(--color-text-secondary)]">{noManagerMessage}</p>
        ) : (
          <>
            <dl className="mb-5 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
              <MetaItem label="Manager name" value={getManagerDisplayName(request.submittedBy, request.tags)} />
              <MetaItem label="Manager email" value={request.submittedBy?.email} mono />
              <MetaItem label="Manager club" value={clubLabel} />
            </dl>

            <h3 className="mb-1.5 text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
              Manager notes
            </h3>
            <p
              className={`max-w-3xl text-sm leading-relaxed whitespace-pre-wrap ${
                notesText
                  ? 'text-[var(--color-text-primary)]'
                  : 'text-[var(--color-text-secondary)] italic'
              }`}
            >
              {formatManagerNotes(request)}
            </p>
          </>
        )}
      </section>

      <section aria-labelledby="automated-email-heading" className="border-b border-[var(--color-border-default)] py-8">
        <h2
          id="automated-email-heading"
          className="mb-4 text-sm font-semibold text-[var(--color-text-primary)]"
        >
          Auto email linked to this request
        </h2>

        {hasAutoMail ? (
          <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <MetaItem
              label="Received from"
              value={autoFromEmail || null}
              mono
              showEmpty
            />
            <MetaItem
              label="Inbox"
              value={autoInboxEmail || null}
              mono
              showEmpty
            />
            <MetaItem
              label="Received at"
              value={autoReceivedAt ? formatAdminDateTime(autoReceivedAt) : null}
              showEmpty
            />
            {automatedDetails ? (
              <div className="min-w-0 sm:col-span-2">
                <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-secondary)]">
                  Details
                </dt>
                <dd className="mt-0.5 max-w-3xl whitespace-pre-wrap text-sm leading-relaxed text-[var(--color-text-primary)]">
                  {automatedDetails}
                </dd>
              </div>
            ) : null}
          </dl>
        ) : (
          <p className="text-sm text-[var(--color-text-secondary)]">
            No auto email linked to this request.
          </p>
        )}
      </section>

      <section aria-labelledby="finish-heading" className="py-8">
        <h2
          id="finish-heading"
          className="mb-4 text-sm font-semibold text-[var(--color-text-primary)]"
        >
          {isAdd ? 'Mark as added' : 'Mark as removed'}
        </h2>

        <label htmlFor="request-detail-note" className="block max-w-2xl">
          <span className="text-sm text-[var(--color-text-secondary)]">
            Admin note <span className="text-[var(--color-text-muted)]">(optional)</span>
          </span>
          <textarea
            id="request-detail-note"
            value={noteText}
            onChange={(e) => setNoteText(e.target.value)}
            placeholder="Saved with the directory record"
            rows={2}
            className="mt-2 w-full resize-none rounded-lg border border-[var(--color-border-default)] bg-white px-3 py-2.5 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-secondary)] focus:border-[var(--color-brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-primary)]/12"
          />
        </label>

        <div className="mt-4 flex max-w-2xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-xs text-[var(--color-text-secondary)]">
            Confirm only after you’ve {isAdd ? 'added' : 'removed'} {personFullName} in Power Music.
          </p>
          <button
            type="button"
            onClick={() => onConfirmAction(request, noteText.trim())}
            className={`inline-flex shrink-0 items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-sm font-semibold text-white shadow-sm transition-colors ${
              isAdd
                ? 'bg-[var(--color-brand-primary)] hover:bg-[var(--color-surface-sidebar-hover)]'
                : 'bg-[#dc2626] hover:bg-[#b91c1c]'
            }`}
          >
            <Check className="h-4 w-4" aria-hidden="true" />
            {isAdd ? 'Mark as added' : 'Mark as removed'}
          </button>
        </div>
      </section>
    </div>
  );
}
