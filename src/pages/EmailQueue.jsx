import { useState, useMemo } from 'react';
import { Flag, Search, Info } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { emailQueue, templates } from '../data/mockData';
import { DataTable, Tag, Drawer, Toast, useToast } from '../components/ui';

export default function EmailQueue() {
  const [emails, setEmails] = useState(emailQueue);
  const [search, setSearch] = useState('');
  const [filterInbox, setFilterInbox] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [selectedEmail, setSelectedEmail] = useState(null);
  
  const { showToast } = useToast();

  // Helper: truncate string
  const truncate = (str, len) => {
    if (!str) return '';
    return str.length > len ? str.substring(0, len) + '...' : str;
  };

  // Helper: format received time for table
  const formatReceivedTime = (receivedStr) => {
    if (!receivedStr) return '';
    try {
      // If it is from the latest date context (2025-06-24), show only time
      if (receivedStr.startsWith('2025-06-24')) {
        return format(parseISO(receivedStr), 'HH:mm');
      }
      return 'Yesterday';
    } catch {
      return receivedStr;
    }
  };

  // Helper: format received datetime for drawer
  const formatDetailReceived = (dateStr) => {
    if (!dateStr) return '';
    try {
      const parsed = parseISO(dateStr);
      return format(parsed, 'dd MMM yyyy at HH:mm');
    } catch {
      return dateStr;
    }
  };

  // Helper: get intent pill CSS styles
  const getIntentClass = (intent) => {
    switch (intent) {
      case 'Enquiry':
        return 'bg-[#dbeafe] text-[#1e40af]';
      case 'Renewal':
        return 'bg-[#dcfce7] text-[#166534]';
      case 'Cancellation':
        return 'bg-[#fee2e2] text-[#991b1b]';
      case 'Partnership':
        return 'bg-[#f3e8ff] text-[#7c3aed]';
      case 'Finance':
        return 'bg-[#fef9c3] text-[#713f12]';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  // Helper: resolve template body placeholders
  const getDraftText = (email) => {
    if (!email.templateUsed) {
      return 'No draft available — email has been flagged for manual review.';
    }
    const foundTemplate = templates.find((t) => t.name === email.templateUsed);
    if (foundTemplate) {
      const firstName = email.from ? email.from.split(' ')[0] : 'there';
      const inboxShort = email.inbox ? email.inbox.split('@')[0] + '@' : '';
      return foundTemplate.body
        .replace(/\{\{first_name\}\}/g, firstName)
        .replace(/\{\{inbox_name\}\}/g, inboxShort);
    }

    // Default template text fallback if template is missing from data
    const firstName = email.from ? email.from.split(' ')[0] : 'there';
    return `Hi ${firstName},\n\nThank you for your ${email.intent.toLowerCase()} enquiry.\n\nKind regards,\nPower Music Team`;
  };

  // Filter application
  const filteredEmails = useMemo(() => {
    return emails.filter((email) => {
      // 1. Search sender or subject
      const query = search.trim().toLowerCase();
      const matchesSearch =
        query === '' ||
        email.from.toLowerCase().includes(query) ||
        email.subject.toLowerCase().includes(query);

      // 2. Inbox filter
      const matchesInbox = filterInbox === 'All' || email.inbox === filterInbox;

      // 3. Status filter
      const matchesStatus = filterStatus === 'All' || email.draftStatus === filterStatus;

      return matchesSearch && matchesInbox && matchesStatus;
    });
  }, [emails, search, filterInbox, filterStatus]);

  // Handle workflow action buttons
  const handleAction = (id, action) => {
    let toastMsg = '';
    let toastType = 'success';

    setEmails((prev) =>
      prev.map((email) => {
        if (email.id === id) {
          if (action === 'reviewed') {
            toastMsg = 'Email marked as reviewed.';
            return { ...email, draftStatus: 'Reviewed', flagged: false };
          } else if (action === 'sent') {
            toastMsg = 'Draft marked as sent.';
            return { ...email, draftStatus: 'Sent', flagged: false };
          } else if (action === 'flagged') {
            toastMsg = 'Email flagged for manual review.';
            toastType = 'warning';
            return {
              ...email,
              draftStatus: 'Flagged',
              flagged: true,
              flagReason: 'Manual override'
            };
          }
        }
        return email;
      })
    );

    // Sync selectedEmail context for immediate UI updates in drawer
    setSelectedEmail((prev) => {
      if (!prev) return null;
      if (action === 'reviewed') return { ...prev, draftStatus: 'Reviewed', flagged: false };
      if (action === 'sent') return { ...prev, draftStatus: 'Sent', flagged: false };
      if (action === 'flagged') {
        return {
          ...prev,
          draftStatus: 'Flagged',
          flagged: true,
          flagReason: 'Manual override'
        };
      }
      return prev;
    });

    showToast(toastMsg, toastType);
  };

  // Table column definition
  const columns = [
    {
      key: 'flagged',
      label: 'Flag',
      render: (val) =>
        val ? (
          <span className="flagged-row-indicator inline-flex items-center text-[var(--color-signal-red)]">
            <Flag className="w-4 h-4 fill-[var(--color-signal-red)] text-[var(--color-signal-red)]" />
          </span>
        ) : null
    },
    {
      key: 'from',
      label: 'From',
      render: (_, row) => (
        <div className="flex flex-col">
          <span className="font-semibold text-sm text-[var(--color-text-primary)]">
            {row.from}
          </span>
          <span className="text-xs text-[var(--color-text-secondary)] font-normal text-gray-500 mt-0.5">
            {row.fromEmail}
          </span>
        </div>
      )
    },
    {
      key: 'subject',
      label: 'Subject',
      render: (val) => (
        <span className="font-semibold text-sm text-[var(--color-text-primary)]">
          {truncate(val, 60)}
        </span>
      )
    },
    {
      key: 'inbox',
      label: 'Inbox',
      render: (val) => (
        <span className="text-sm font-semibold text-[var(--color-text-primary)]">
          {val ? val.split('@')[0] + '@' : ''}
        </span>
      )
    },
    {
      key: 'intent',
      label: 'AI Intent',
      render: (val, row) => (
        <div className="flex items-center gap-2">
          <span
            className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${getIntentClass(
              val
            )}`}
          >
            {val}
          </span>
          <span className="text-xs text-[var(--color-text-secondary)] font-semibold">
            ({row.intentConfidence}%)
          </span>
        </div>
      )
    },
    {
      key: 'templateUsed',
      label: 'Template Used',
      render: (val) => (
        <span className="text-sm font-medium text-[var(--color-text-primary)]">
          {val ? truncate(val, 30) : '—'}
        </span>
      )
    },
    {
      key: 'draftStatus',
      label: 'Draft Status',
      render: (val) => (
        <Tag
          variant={val === 'Draft Created' ? 'active' : val === 'Flagged' ? 'flagged' : 'archived'}
          label={val}
        />
      )
    },
    {
      key: 'receivedAt',
      label: 'Received',
      render: (val) => (
        <span className="text-xs font-medium text-[var(--color-text-secondary)]">
          {formatReceivedTime(val)}
        </span>
      )
    }
  ];

  return (
    <div className="email-queue-container max-w-7xl mx-auto space-y-6 select-none relative">
      {/* Inject custom CSS styles for overriding Drawer width and styling flagged row border-left */}
      <style>{`
        /* Overrides max-width to 520px inside the email-queue page */
        .email-queue-container .max-w-\\[480px\\] {
          max-width: 520px !important;
        }

        /* Targets first td in rows containing a flagged indicator */
        tr:has(.flagged-row-indicator) td:first-child {
          border-left: 3px solid var(--color-signal-red) !important;
        }
      `}</style>

      {/* Header Row */}
      <div className="flex items-center justify-between border-b border-[var(--color-border-default)] pb-4">
        <div className="flex items-center gap-3">
          <h2 className="text-xl font-bold text-[var(--color-text-primary)]">
            Email Queue
          </h2>
          <span className="px-2 py-0.5 rounded-full text-xs font-semibold bg-gray-150 text-gray-700">
            6 emails
          </span>
        </div>
      </div>

      {/* Filter Bar */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3 w-full bg-white p-4 rounded-md border border-[var(--color-border-default)]">
        {/* Search */}
        <div className="relative flex-1">
          <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
            <Search className="h-4 w-4 text-[var(--color-text-secondary)]" />
          </span>
          <input
            type="text"
            placeholder="Search sender or subject..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="block w-full pl-9 pr-3 py-1.5 bg-white border border-[var(--color-border-default)] rounded-md text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-border-focus)] transition-colors"
          />
        </div>

        {/* Inbox Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase">
            Inbox:
          </span>
          <select
            value={filterInbox}
            onChange={(e) => setFilterInbox(e.target.value)}
            className="border border-[var(--color-border-default)] rounded-md px-3 py-1.5 bg-white text-sm text-[var(--color-text-primary)] font-medium focus:outline-none focus:border-[var(--color-border-focus)] cursor-pointer"
          >
            <option value="All">All Inboxes</option>
            <option value="info@powermusic.com">info@</option>
            <option value="support@powermusic.com">support@</option>
          </select>
        </div>

        {/* Status Filter */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-[var(--color-text-secondary)] uppercase">
            Status:
          </span>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-[var(--color-border-default)] rounded-md px-3 py-1.5 bg-white text-sm text-[var(--color-text-primary)] font-medium focus:outline-none focus:border-[var(--color-border-focus)] cursor-pointer"
          >
            <option value="All">All Statuses</option>
            <option value="Draft Created">Draft Created</option>
            <option value="Flagged">Flagged</option>
          </select>
        </div>
      </div>

      {/* Table */}
      <div className="w-full">
        <DataTable
          columns={columns}
          rows={filteredEmails}
          onRowClick={(row) => setSelectedEmail(row)}
          emptyMessage="No emails matching your search."
        />
      </div>

      {/* Footer statistics */}
      <div className="flex items-center justify-between px-2 text-xs font-semibold text-[var(--color-text-secondary)]">
        <span>{filteredEmails.length} records shown</span>
      </div>

      {/* Detail Drawer */}
      <Drawer
        isOpen={selectedEmail !== null}
        onClose={() => setSelectedEmail(null)}
        title={selectedEmail ? truncate(selectedEmail.subject, 40) : ''}
      >
        {selectedEmail && (
          <div className="flex flex-col h-full space-y-6 text-left select-none pb-20">
            {/* Drawer Body Layout Split */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
              {/* Column A — Original Email */}
              <div className="space-y-4 pr-1">
                <div>
                  <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider mb-2">
                    Original Email
                  </span>
                  <div className="text-sm font-semibold text-[var(--color-text-primary)]">
                    From: {selectedEmail.from} &lt;{selectedEmail.fromEmail}&gt;
                  </div>
                  <div className="text-xs text-[var(--color-text-secondary)] font-medium mt-0.5">
                    Received: {formatDetailReceived(selectedEmail.receivedAt)}
                  </div>
                </div>

                <div className="border-t border-[var(--color-border-default)] pt-3">
                  <div className="bg-[#f9fafb] border border-[var(--color-border-default)] rounded-md p-3 text-sm text-[var(--color-text-primary)] font-medium leading-relaxed font-sans whitespace-pre-wrap max-h-[220px] overflow-y-auto">
                    {selectedEmail.body}
                  </div>
                </div>

                <div className="space-y-2 pt-3 border-t border-[var(--color-border-default)]">
                  <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                    AI Classification
                  </span>
                  <div className="flex flex-col gap-1.5">
                    <div>
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-semibold ${getIntentClass(
                          selectedEmail.intent
                        )}`}
                      >
                        {selectedEmail.intent}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-1">
                      <div className="w-[100px] h-2 bg-gray-100 rounded-full overflow-hidden shrink-0">
                        <div
                          className="h-full bg-[var(--color-brand-accent)] rounded-full"
                          style={{ width: `${selectedEmail.intentConfidence}%` }}
                        />
                      </div>
                      <span className="text-xs text-[var(--color-text-secondary)] font-semibold">
                        {selectedEmail.intentConfidence}% confidence
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Column B — AI Draft */}
              <div className="space-y-4 border-t md:border-t-0 md:border-l border-[var(--color-border-default)] pt-4 md:pt-0 md:pl-5 flex flex-col justify-between">
                <div className="space-y-3 flex-1">
                  <div>
                    <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider mb-1">
                      AI Draft Preview
                    </span>
                    <span className="text-xs text-[var(--color-text-secondary)] font-medium">
                      Template:{' '}
                      {selectedEmail.templateUsed ? (
                        <span className="font-semibold text-[var(--color-text-primary)]">
                          {selectedEmail.templateUsed}
                        </span>
                      ) : (
                        <span className="italic text-[var(--color-text-muted)]">
                          No template matched
                        </span>
                      )}
                    </span>
                  </div>

                  <div className="bg-white border border-[var(--color-border-default)] rounded-md p-3 text-sm text-[var(--color-text-primary)] font-medium leading-relaxed font-sans whitespace-pre-wrap min-h-[140px] max-h-[220px] overflow-y-auto bg-gray-50/20">
                    {getDraftText(selectedEmail)}
                  </div>
                </div>

                <div className="bg-[#eff6ff] border border-[#bfdbfe] rounded-md p-3 flex items-start gap-2 mt-3 shrink-0">
                  <Info className="w-4 h-4 text-blue-500 shrink-0 mt-0.5" />
                  <span className="text-xs text-blue-800 font-semibold leading-normal">
                    Open your email client to review and send this draft.
                  </span>
                </div>
              </div>
            </div>

            {/* Simulated Activity Log */}
            <div className="space-y-2.5 pt-4 border-t border-[var(--color-border-default)]">
              <span className="block text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">
                Activity Log
              </span>
              <div className="space-y-1.5">
                <div className="text-xs text-[var(--color-text-secondary)] font-medium">
                  {formatReceivedTime(selectedEmail.receivedAt)} — Email received, AI
                  classification complete
                </div>
                <div className="text-xs text-[var(--color-text-secondary)] font-medium">
                  {formatReceivedTime(selectedEmail.receivedAt)} —{' '}
                  {selectedEmail.templateUsed ? (
                    <span>Draft created using {selectedEmail.templateUsed}</span>
                  ) : (
                    <span className="text-amber-600 font-semibold">
                      Draft creation skipped — flagged for manual review
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Action Buttons Row */}
            <div className="absolute bottom-0 left-0 right-0 bg-white border-t border-[var(--color-border-default)] py-4 flex items-center gap-2">
              <button
                onClick={() => handleAction(selectedEmail.id, 'reviewed')}
                className="px-4 py-2 border border-gray-300 rounded-md text-sm font-semibold text-gray-700 bg-white hover:bg-gray-50 focus:outline-none transition-colors cursor-pointer"
              >
                Mark as Reviewed
              </button>
              <button
                onClick={() => handleAction(selectedEmail.id, 'sent')}
                className="px-4 py-2 border border-transparent rounded-md text-sm font-semibold text-white bg-[var(--color-brand-accent)] hover:bg-[var(--color-brand-accent-hover)] focus:outline-none transition-colors cursor-pointer"
              >
                Mark as Sent
              </button>
              {!selectedEmail.flagged && (
                <button
                  onClick={() => handleAction(selectedEmail.id, 'flagged')}
                  className="px-4 py-2 border border-red-300 rounded-md text-sm font-semibold text-red-700 bg-white hover:bg-red-50 focus:outline-none transition-colors cursor-pointer"
                >
                  Flag for Review
                </button>
              )}
            </div>
          </div>
        )}
      </Drawer>

      <Toast />
    </div>
  );
}
