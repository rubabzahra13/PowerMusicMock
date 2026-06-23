import { useState, useEffect, useMemo } from 'react';
import { format, parseISO } from 'date-fns';
import { X, Check } from 'lucide-react';
import { Drawer, Modal } from './ui';

export default function RequestDetailDrawer({ request, isOpen, onClose, onAction, ledger = [] }) {
  const [showConfirmModal, setShowConfirmModal] = useState(false);
  const [log, setLog] = useState([]);
  const [showNoteInput, setShowNoteInput] = useState(false);
  const [noteText, setNoteText] = useState('');

  // Reset states when a new request is selected
  useEffect(() => {
    if (!request) {
      setLog([]);
      setShowNoteInput(false);
      setNoteText('');
      return;
    }

    const timeStr = format(parseISO(request.receivedAt), 'HH:mm');
    const initialEntries = [
      {
        id: 'sub',
        time: timeStr,
        text: `Request submitted by ${request.submittedBy.firstName} ${request.submittedBy.lastName}`
      }
    ];

    if (request.tags && request.tags.includes('Already Exists')) {
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

  // Date parsing formatting
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

  // Find duplicates in user ledger
  const matchedLedgerRecord = useMemo(() => {
    if (!request || !ledger || !request.tags.includes('Already Exists')) return null;
    return ledger.find(
      (record) => record.email.toLowerCase() === request.person.email.toLowerCase()
    );
  }, [request, ledger]);

  if (!request) return null;

  // Add notes triggers
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
    onAction(request.id, request.action);
    setShowConfirmModal(false);
    onClose();
  };

  return (
    <>
      <Drawer isOpen={isOpen} onClose={onClose} title="Request Detail">
        <div className="space-y-6 text-left select-none">
          {/* Section 1: Meta row */}
          <div className="text-xs text-[var(--color-text-secondary)] font-medium space-y-0.5 border-b border-[var(--color-border-default)] pb-3">
            <div>Received: {formatDateTime(request.receivedAt)}</div>
            <div>Created by: {request.createdBy}</div>
          </div>

          {/* Section 2: MANAGER DETAILS card */}
          <div className="bg-[#f9fafb] border border-[var(--color-border-default)] rounded-md p-4 space-y-2">
            <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
              Manager Details
            </span>
            <div className="text-sm font-semibold text-[var(--color-text-primary)]">
              {request.submittedBy.firstName} {request.submittedBy.lastName}
            </div>
            <div className="text-xs text-[var(--color-text-secondary)] space-y-0.5 font-medium">
              <div>Email: {request.submittedBy.email}</div>
              <div>Club: {request.submittedBy.club}</div>
            </div>
          </div>

          {/* Section 3: PERSON DETAILS card */}
          <div className="bg-[#f9fafb] border border-[var(--color-border-default)] rounded-md p-4 space-y-2">
            <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
              Person to {request.action === 'Add' ? 'Add' : 'Remove'}
            </span>
            <div className="text-sm font-semibold text-[var(--color-text-primary)]">
              {request.person.firstName} {request.person.lastName}
            </div>
            <div className="text-xs text-[var(--color-text-secondary)] space-y-0.5 font-medium">
              <div>Email: {request.person.email}</div>
              <div>Location: {request.person.location}</div>
            </div>
          </div>

          {/* Section 4: NOTES section */}
          {request.notes && (
            <div className="space-y-1.5 px-1">
              <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                Notes
              </span>
              <p className="text-sm italic text-[var(--color-text-primary)] leading-normal bg-gray-50 border border-dashed border-[var(--color-border-default)] rounded-md p-3">
                "{request.notes}"
              </p>
            </div>
          )}

          {/* Section 5: ALREADY EXISTS WARNING */}
          {request.tags && request.tags.includes('Already Exists') && matchedLedgerRecord && (
            <div className="bg-[#fef3c7] border border-amber-300 border-l-4 border-l-[var(--color-already-exists-border)] rounded-md p-4 space-y-2">
              <span className="block text-sm font-bold text-[#92400e]">
                ⚠️ ALREADY EXISTS
              </span>
              <p className="text-xs text-amber-800 font-semibold leading-normal">
                A person matching this name and email was found in the User Ledger.
              </p>
              <div className="bg-amber-100/60 rounded border border-amber-250 p-2.5 space-y-0.5 text-xs text-amber-900 font-medium">
                <div>
                  {matchedLedgerRecord.firstName} {matchedLedgerRecord.lastName} · {matchedLedgerRecord.email}
                </div>
                <div className="text-amber-800 font-normal">
                  Added: {formatDate(matchedLedgerRecord.dateAdded)} · {matchedLedgerRecord.location}
                </div>
              </div>
              <button
                onClick={() => alert('This would navigate to the User Ledger record.')}
                className="text-xs font-semibold text-[var(--color-brand-accent)] hover:text-[var(--color-brand-accent-hover)] underline block mt-2 focus:outline-none"
              >
                [View Record →]
              </button>
            </div>
          )}

          {/* Section 6 & 7: ACTION REQUIRED section */}
          <div className="space-y-4 pt-2">
            <div className="h-[1px] bg-[var(--color-border-default)]"></div>
            <div className="space-y-1">
              <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                Action Required in Power Music
              </span>
              <span className="block text-base font-semibold text-[var(--color-text-primary)]">
                {request.action === 'Add' ? 'Add Person' : 'Remove Person'}
              </span>
            </div>
            <div className="h-[1px] bg-[var(--color-border-default)]"></div>
            <p className="text-xs text-[var(--color-text-secondary)] leading-normal font-medium">
              Once you have completed the action in Power Music, click the button below. This cannot be undone.
            </p>

            {/* Action button trigger confirmation */}
            <button
              onClick={() => setShowConfirmModal(true)}
              className={`w-full h-11 flex items-center justify-center gap-1.5 text-white font-bold text-sm rounded-md transition-colors shadow-sm select-none cursor-pointer focus:outline-none ${
                request.action === 'Add'
                  ? 'bg-[var(--color-brand-accent)] hover:bg-[var(--color-brand-accent-hover)]'
                  : 'bg-[#374151] hover:bg-gray-800'
              }`}
            >
              <Check className="w-4 h-4" />
              <span>{request.action === 'Add' ? 'Mark as Added' : 'Mark as Removed'}</span>
            </button>
          </div>

          {/* Section 8: ACTIVITY LOG section */}
          <div className="space-y-3 pt-3 border-t border-[var(--color-border-default)]">
            <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
              Activity Log
            </span>
            <div className="divide-y divide-[var(--color-border-default)] font-medium">
              {log.map((entry) => (
                <div key={entry.id} className="py-2 flex items-start gap-3 text-xs leading-normal">
                  <span className="text-[var(--color-text-secondary)] shrink-0 font-semibold">{entry.time}</span>
                  <span className="text-[var(--color-text-primary)]">{entry.text}</span>
                </div>
              ))}
            </div>

            {/* Add Note Trigger */}
            <div className="pt-1.5">
              {showNoteInput ? (
                <div className="space-y-2">
                  <textarea
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    onKeyDown={handleNoteKeyPress}
                    placeholder="Type note and press Enter to save..."
                    className="w-full h-16 px-2.5 py-1.5 bg-white border border-[var(--color-border-default)] rounded text-xs text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-border-focus)] transition-colors resize-none"
                    autoFocus
                  />
                  <div className="flex gap-2 justify-end">
                    <button
                      onClick={() => { setShowNoteInput(false); setNoteText(''); }}
                      className="px-2.5 py-1 border border-[var(--color-border-default)] text-[11px] font-semibold text-[var(--color-text-secondary)] rounded hover:bg-gray-50 focus:outline-none"
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

      {/* Confirmation Modal */}
      <Modal
        isOpen={showConfirmModal}
        onClose={() => setShowConfirmModal(false)}
        title="Confirm action"
        footer={
          <>
            <button
              onClick={() => setShowConfirmModal(false)}
              className="px-4 py-2 border border-[var(--color-border-default)] rounded-md text-sm font-medium text-[var(--color-text-primary)] hover:bg-gray-50 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleConfirmAction}
              className="px-4 py-2 text-white text-sm font-semibold rounded-md bg-[var(--color-brand-accent)] hover:bg-[var(--color-brand-accent-hover)] shadow-sm cursor-pointer"
            >
              Confirm
            </button>
          </>
        }
      >
        <p className="text-sm text-[var(--color-text-secondary)] leading-relaxed text-left">
          Confirm you have {request.action === 'Add' ? 'added' : 'removed'}{' '}
          <strong className="text-[var(--color-text-primary)] font-bold">
            {request.person.firstName} {request.person.lastName}
          </strong>{' '}
          in Power Music before continuing. This cannot be undone.
        </p>
      </Modal>
    </>
  );
}
