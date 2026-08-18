import { forwardRef } from 'react';
import { Tag } from '../ui';
import {
  MANAGER_UPDATE_HIGHLIGHT_CLASS,
  formatRequestTimestamp,
  personName,
  requestStatusMeta,
} from '../../utils/managerRequestHistory';

export const MANAGER_REQUEST_HISTORY_GRID =
  'grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)]';

function highlightKind(request) {
  if (request.status === 'handled') return 'handled';
  if (request.status === 'new') return 'pending';
  return null;
}

function statusTagVariant(request) {
  return request.status === 'handled' ? 'neutral' : 'draft';
}

function rowTimestamp(request) {
  const value = request.status === 'handled' ? request.handledAt : request.receivedAt;
  const formatted = formatRequestTimestamp(value);
  if (!formatted) return request.status === 'handled' ? 'Handled' : 'Awaiting';
  return formatted;
}

function rowAriaLabel(request, meta, highlighted, kind, rowNumber) {
  const action = request.action === 'Add' ? 'addition' : 'removal';
  const parts = [
    `Row ${rowNumber}`,
    personName(request.person),
    `${action} request number ${request.displayId}`,
    meta.label,
    rowTimestamp(request),
  ];
  if (request.person?.email) parts.push(request.person.email);
  if (request.person?.location) parts.push(request.person.location);
  if (highlighted && kind === 'handled') parts.push('unread update, press to mark as seen');
  if (highlighted && kind === 'pending') parts.push('new submission');
  return parts.join(', ');
}

const rowInteractionClass =
  'w-full transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-brand-primary)]/35';

const ManagerRequestHistoryRow = forwardRef(function ManagerRequestHistoryRow(
  { request, onOpen, showAsNew = false, rowNumber = 1 },
  ref,
) {
  const meta = requestStatusMeta(request);
  const kind = highlightKind(request);
  const highlighted = showAsNew;
  const isAdd = request.action === 'Add';
  const contactLine = [request.person?.email, request.person?.location].filter(Boolean).join(' · ');
  const highlightClass = highlighted
    ? MANAGER_UPDATE_HIGHLIGHT_CLASS
    : 'hover:bg-[var(--color-surface-panel)]/50';
  const ariaLabel = rowAriaLabel(request, meta, highlighted, kind, rowNumber);
  const handleOpen = () => onOpen?.(request);

  return (
    <li ref={ref} className="list-none">
      <button
        type="button"
        onClick={handleOpen}
        title={contactLine || undefined}
        aria-label={ariaLabel}
        className={`${rowInteractionClass} flex flex-col gap-2 px-4 py-3 text-left sm:hidden ${highlightClass}`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
              {personName(request.person)}
            </p>
            {contactLine && (
              <p className="mt-0.5 truncate text-[11px] text-[var(--color-text-muted)]">{contactLine}</p>
            )}
          </div>
          <span className="shrink-0 text-[11px] font-semibold tabular-nums text-[var(--color-text-secondary)]">
            #{rowNumber}
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Tag variant={isAdd ? 'add-action' : 'remove-action'} label={isAdd ? 'Add' : 'Remove'} compact />
          <Tag variant={statusTagVariant(request)} label={meta.label} compact />
          {highlighted && (
            <span className="inline-flex rounded-full bg-[var(--color-brand-primary)] px-1.5 py-px text-[10px] font-semibold leading-none text-white">
              New
            </span>
          )}
          <span className="text-[11px] tabular-nums text-[var(--color-text-muted)]">{rowTimestamp(request)}</span>
        </div>
      </button>

      <button
        type="button"
        onClick={handleOpen}
        title={contactLine || undefined}
        aria-label={ariaLabel}
        className={`${rowInteractionClass} hidden sm:grid ${MANAGER_REQUEST_HISTORY_GRID} items-center gap-x-4 px-3 py-2.5 ${highlightClass}`}
      >
        <span className="text-left text-[11px] font-semibold tabular-nums text-[var(--color-text-secondary)]">
          {rowNumber}
        </span>

        <span className="flex justify-center">
          <Tag variant={isAdd ? 'add-action' : 'remove-action'} label={isAdd ? 'Add' : 'Remove'} compact />
        </span>

        <span className="truncate text-center text-[11px] tabular-nums leading-tight text-[var(--color-text-muted)]">
          {rowTimestamp(request)}
        </span>

        <span className="min-w-0 text-left">
          <span className="block truncate text-sm font-semibold leading-tight text-[var(--color-text-primary)]">
            {personName(request.person)}
          </span>
          {contactLine && (
            <span className="mt-0.5 block truncate text-[10px] leading-tight text-[var(--color-text-muted)]">
              {contactLine}
            </span>
          )}
        </span>

        <span className="flex items-center justify-center gap-1">
          {highlighted && (
            <span className="inline-flex rounded-full bg-[var(--color-brand-primary)] px-1.5 py-px text-[10px] font-semibold leading-none text-white">
              New
            </span>
          )}
          <Tag variant={statusTagVariant(request)} label={meta.label} compact />
        </span>
      </button>
    </li>
  );
});

export default ManagerRequestHistoryRow;
