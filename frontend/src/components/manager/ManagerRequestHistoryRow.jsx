import { forwardRef } from 'react';
import { Tag } from '../ui';
import {
  MANAGER_UPDATE_HIGHLIGHT_CLASS,
  formatRequestTimestamp,
  personName,
  requestStatusMeta,
} from '../../utils/managerRequestHistory';
import { isManagerHandledRequestUnseen, isManagerPendingRequestUnseen } from '../../utils/managerUiHighlights';

export const MANAGER_REQUEST_HISTORY_GRID =
  'grid-cols-[1.75rem_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.25fr)_minmax(0,1fr)]';

function isRequestHighlighted(request) {
  if (request.status === 'handled') {
    return isManagerHandledRequestUnseen(request.id);
  }
  if (request.status === 'new') {
    return isManagerPendingRequestUnseen(request.id);
  }
  return false;
}

function highlightKind(request) {
  if (request.status === 'handled') return 'handled';
  if (request.status === 'new') return 'pending';
  return null;
}

function statusTagVariant(request, meta) {
  if (request.status === 'handled') {
    return meta.label === 'Added' ? 'added' : 'removed';
  }
  return 'draft';
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

const ManagerRequestHistoryRow = forwardRef(function ManagerRequestHistoryRow(
  { request, onOpen, highlightVersion = 0, rowNumber = 1 },
  ref,
) {
  void highlightVersion;
  const meta = requestStatusMeta(request);
  const kind = highlightKind(request);
  const highlighted = isRequestHighlighted(request);
  const isAdd = request.action === 'Add';
  const contactLine = [request.person?.email, request.person?.location].filter(Boolean).join(' · ');

  return (
    <li className="list-none">
      <button
        ref={ref}
        type="button"
        onClick={() => onOpen?.(request)}
        title={contactLine || undefined}
        aria-label={rowAriaLabel(request, meta, highlighted, kind, rowNumber)}
        className={`grid w-full ${MANAGER_REQUEST_HISTORY_GRID} items-center gap-x-4 px-3 py-2 transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--color-brand-primary)]/35 ${
          highlighted
            ? MANAGER_UPDATE_HIGHLIGHT_CLASS
            : 'hover:bg-[var(--color-surface-panel)]/50'
        }`}
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
          <Tag variant={statusTagVariant(request, meta)} label={meta.label} compact />
        </span>
      </button>
    </li>
  );
});

export default ManagerRequestHistoryRow;
