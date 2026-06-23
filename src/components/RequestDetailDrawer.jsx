import { useState, useEffect, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { Check } from 'lucide-react';
import { Drawer } from './ui';
import { getManagerDisplayName, isManualEntry } from '../utils/manualEntry';

const panelClass =
  'bg-[var(--color-surface-panel)] border border-[var(--color-border-default)] rounded-lg p-3 flex flex-col gap-1.5 min-h-0';

export default function RequestDetailDrawer({ request, isOpen, onClose, onConfirmAction, ledger = [] }) {
  const [log, setLog] = useState([]);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState('');

  useEffect(() => {
    if (!request) {
      setLog([]);
      setShowNoteInput(false);
      setNoteText('');
      return;
    }

    const timeStr = format(parseISO(request.receivedAt), 'HH:mm');
    const managerName = getManagerDisplayName(request.submittedBy);
    const initialEntries = [
      {
        id: 'sub',
        time: timeStr,
        text: `Request submitted by ${managerName}`
      }
    ];

    if (request.tags?.includes('Already Exists')) {
      initialEntries.push({
        id: 'ae',
        time: timeStr,
        text: 'Already Exists tag applied'
      });
    }

    setLog(initialEntries);
    setShowNoteInput(false);
    setNoteText('');
  }, [request]);

  const formatDateTime = (isoString) => {
    if (!isoString) return '';
    try {
      return format(parseISO(isoString), 'dd MMM yyyy, HH:mm');
    } catch {
      return isoString;
    }
  };

  const formatDate = (dateString) => {
    if (!dateString) return '';
    try {
      return format(parseISO(dateString), 'dd MMM yyyy');
    } catch {
      return dateString;
    }
  };

  const matchedLedgerRecord = useMemo(() => {
    if (!request || !ledger || !request.tags?.includes('Already Exists')) return null;
    return ledger.find(
      (record) => record.email.toLowerCase() === request.person.email.toLowerCase()
    );
  }, [request, ledger]);

  if (!request) return null;

  const managerName = getManagerDisplayName(request.submittedBy);

  const handleNoteKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      const text = noteText.trim();
      if (text !== '') {
        const timeStr = format(new Date(), 'HH:mm');
        setLog((prev) => [
          ...prev,
          {
            id: `note-${Date.now()}`,
            time: timeStr,
            text: `Admin: ${text}`
          }
        ]);
        setNoteText('');
        setShowNoteInput(false);
      }
    }
  };

  const handleConfirmAction = () => {
    onConfirmAction(request);
  };

  return (
    <Drawer isOpen={isOpen} onClose={onClose} title="Request Detail" fill>
      <div className="flex flex-col flex-1 min-h-0 gap-3 text-left select-none">
        <div className="shrink-0 text-xs text-[var(--color-text-secondary)] font-medium flex flex-wrap gap-x-4 gap-y-1 border-b border-[var(--color-border-default)] pb-2.5">
          <span>Received: {formatDateTime(request.receivedAt)}</span>
          <span>Created by: {request.createdBy}</span>
        </div>

        <div className="shrink-0 grid grid-cols-2 gap-3 items-stretch">
          <div className={panelClass}>
            <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
              Manager Details
            </span>
            <div className="text-sm font-semibold text-[var(--color-text-primary)]">{managerName}</div>
            <div className="text-xs text-[var(--color-text-secondary)] space-y-0.5 font-medium mt-auto">
              <div>Email: {request.submittedBy.email}</div>
              <div>Club: {isManualEntry(request.submittedBy) ? 'Manual entry' : request.submittedBy.club}</div>
            </div>
          </div>

          <div className={panelClass}>
            <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
              Person to {request.action === 'Add' ? 'Add' : 'Remove'}
            </span>
            <div className="text-sm font-semibold text-[var(--color-text-primary)]">
              {request.person.firstName} {request.person.lastName}
            </div>
            <div className="text-xs text-[var(--color-text-secondary)] space-y-0.5 font-medium mt-auto">
              <div>Email: {request.person.email}</div>
              <div>Location: {request.person.location}</div>
            </div>
          </div>
        </div>

        <div className={`flex-1 min-h-[72px] ${panelClass}`}>
          <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
            Notes
          </span>
          <p className="text-sm text-[var(--color-text-primary)] leading-snug whitespace-pre-wrap flex-1">
            {request.notes?.trim() ? request.notes : 'No notes provided.'}
          </p>
        </div>

        {request.tags?.includes('Already Exists') && matchedLedgerRecord && (
          <div className="shrink-0 bg-[#fef3c7] border border-amber-300 border-l-4 border-l-[var(--color-already-exists-border)] rounded-lg p-3 space-y-1.5">
            <span className="block text-xs font-bold text-[#92400e]">Already exists in ledger</span>
            <div className="text-xs text-amber-900 font-medium leading-snug">
              {matchedLedgerRecord.firstName} {matchedLedgerRecord.lastName} · {matchedLedgerRecord.email}
            </div>
            <div className="text-[11px] text-amber-800">
              Added: {formatDate(matchedLedgerRecord.dateAdded)} · {matchedLedgerRecord.location}
            </div>
          </div>
        )}

        <div className="shrink-0 rounded-lg border border-[var(--color-border-default)] p-3 space-y-2.5">
          <div>
            <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
              Action Required
            </span>
            <span className="block text-sm font-semibold text-[var(--color-text-primary)] mt-0.5">
              {request.action === 'Add' ? 'Add Person' : 'Remove Person'}
            </span>
          </div>
          <button
            onClick={handleConfirmAction}
            className={`w-full h-10 flex items-center justify-center gap-1.5 text-white font-bold text-sm rounded-lg transition-colors shadow-sm select-none cursor-pointer focus:outline-none ${
              request.action === 'Add'
                ? 'bg-[#16a34a] hover:bg-[#15803d]'
                : 'bg-[#dc2626] hover:bg-[#b91c1c]'
            }`}
          >
            <Check className="w-4 h-4" />
            <span>{request.action === 'Add' ? 'Mark as Added' : 'Mark as Removed'}</span>
          </button>
        </div>

        <div className="flex-1 min-h-[100px] flex flex-col gap-2 pt-1 border-t border-[var(--color-border-default)] overflow-hidden">
          <span className="shrink-0 block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
            Activity Log
          </span>
          <div className="flex-1 min-h-0 overflow-y-auto overscroll-contain divide-y divide-[var(--color-border-default)] font-medium">
            {log.map((entry) => (
              <div key={entry.id} className="py-1.5 flex items-start gap-2.5 text-xs leading-snug">
                <span className="text-[var(--color-text-secondary)] shrink-0 font-semibold">{entry.time}</span>
                <span className="text-[var(--color-text-primary)]">{entry.text}</span>
              </div>
            ))}
          </div>

          <div className="shrink-0 pt-1">
            {showNoteInput ? (
              <div className="space-y-2">
                <textarea
                  value={noteText}
                  onChange={(e) => setNoteText(e.target.value)}
                  onKeyDown={handleNoteKeyPress}
                  placeholder="Type note and press Enter to save..."
                  className="w-full h-14 px-2.5 py-1.5 bg-white border border-[var(--color-border-default)] rounded-lg text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-border-focus)] transition-colors resize-none"
                  autoFocus
                />
                <div className="flex gap-2 justify-end">
                  <button
                    onClick={() => { setShowNoteInput(false); setNoteText(''); }}
                    className="px-2.5 py-1 border border-[var(--color-border-default)] text-[11px] font-semibold text-[var(--color-text-secondary)] rounded-lg hover:bg-gray-50 focus:outline-none"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              <button
                onClick={() => setShowNoteInput(true)}
                className="text-xs font-semibold text-[var(--color-brand-accent)] hover:text-[var(--color-brand-accent-hover)] hover:underline focus:outline-none"
              >
                + Add Note
              </button>
            )}
          </div>
        </div>
      </div>
    </Drawer>
  );
}
