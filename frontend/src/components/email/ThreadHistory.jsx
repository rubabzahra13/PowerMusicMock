import { useState } from 'react';
import { format, parseISO } from 'date-fns';
import { ChevronDown, ChevronUp, CornerDownRight, Forward } from 'lucide-react';
import SafeHtml from './SafeHtml';
import AttachmentChips from './AttachmentChips';

function fmt(iso) {
  if (!iso) return '';
  try {
    return format(parseISO(iso), 'EEE, d MMM · HH:mm');
  } catch {
    return iso;
  }
}

function shortPreview(text) {
  if (!text) return '';
  const line = text.replace(/\s+/g, ' ').trim();
  return line.length > 120 ? `${line.slice(0, 120)}...` : line;
}

function isOutbound(msg) {
  return Boolean(msg.gmailIsOutbound) || msg.draftStatus === 'Sent';
}

// Small pill Andrea sees at the top of a forwarded-in message so she knows the
// message she's replying to originated with a *different* person.
function ForwardedInBanner({ message }) {
  if (!message.isForward) return null;
  const forwarder = message.forwardedByName || message.forwardedByEmail || message.from;
  const original =
    message.originalFromName ||
    message.originalFromEmail ||
    'the original sender';
  return (
    <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50/80 px-3 py-2 text-[11px] text-amber-900">
      <Forward className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
      <p className="min-w-0">
        <span className="font-semibold">Forwarded by {forwarder}</span>
        {' · original from '}
        <span className="font-semibold">{original}</span>. A reply will be sent to the
        original sender.
      </p>
    </div>
  );
}

function MessageMeta({ message }) {
  return (
    <div className="text-[11px] text-[var(--color-text-secondary)] space-y-0.5">
      <p>
        <span className="font-semibold text-[var(--color-text-primary)]">From:</span>{' '}
        {message.from} &lt;{message.fromEmail}&gt;
      </p>
      {message.toEmails?.length ? (
        <p>
          <span className="font-semibold text-[var(--color-text-primary)]">To:</span>{' '}
          {message.toEmails.join(', ')}
        </p>
      ) : null}
      {message.ccEmails?.length ? (
        <p>
          <span className="font-semibold text-[var(--color-text-primary)]">Cc:</span>{' '}
          {message.ccEmails.join(', ')}
        </p>
      ) : null}
      <p>
        <span className="font-semibold text-[var(--color-text-primary)]">
          {isOutbound(message) ? 'Sent:' : 'Received:'}
        </span>{' '}
        {fmt(message.receivedAt)}
      </p>
    </div>
  );
}

function ExpandedMessage({ message, onCollapse, onAttachmentError }) {
  const outbound = isOutbound(message);
  const body = outbound ? (message.sentBody || message.draftBody || '') : message.body;
  // Andrea's own outbound copies are plain text; inbound messages may carry a
  // richer HTML body we sanitize before rendering.
  const showHtml = !outbound && message.htmlBody;

  return (
    <div
      className={`rounded-xl border shadow-sm overflow-hidden ${
        outbound
          ? 'border-[var(--color-brand-primary)]/25 bg-[var(--color-surface-highlight)]/40'
          : 'border-[var(--color-border-default)] bg-white'
      }`}
    >
      <div className="flex items-start justify-between gap-3 px-4 py-2.5 border-b border-[var(--color-border-default)]/70">
        <div className="min-w-0 flex-1 space-y-2">
          <ForwardedInBanner message={message} />
          <MessageMeta message={message} />
        </div>
        {onCollapse && (
          <button
            type="button"
            onClick={onCollapse}
            className="shrink-0 inline-flex items-center gap-1 text-[11px] font-semibold text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] cursor-pointer"
            aria-label="Collapse message"
          >
            <ChevronUp className="w-3.5 h-3.5" />
            Hide
          </button>
        )}
      </div>
      <div className="px-4 py-3 space-y-3">
        {showHtml ? (
          <SafeHtml html={message.htmlBody} className="text-sm text-[var(--color-text-primary)] leading-relaxed" />
        ) : (
          <div className="text-sm text-[var(--color-text-primary)] leading-relaxed whitespace-pre-wrap">
            {body || <span className="italic text-[var(--color-text-muted)]">(empty)</span>}
          </div>
        )}
        {message.attachments?.length ? (
          <AttachmentChips
            emailId={message.id}
            attachments={message.attachments}
            onError={onAttachmentError}
          />
        ) : null}
      </div>
    </div>
  );
}

function CollapsedMessage({ message, onExpand }) {
  const outbound = isOutbound(message);
  const sender = outbound ? 'You' : message.from;
  const preview = shortPreview(message.snippet || (outbound ? message.sentBody || message.draftBody : message.body));
  return (
    <button
      type="button"
      onClick={onExpand}
      className={`w-full text-left rounded-lg border transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]/40 ${
        outbound
          ? 'border-[var(--color-brand-primary)]/20 bg-[var(--color-surface-highlight)]/30 hover:bg-[var(--color-surface-highlight)]/60'
          : 'border-[var(--color-border-default)] bg-white hover:bg-[var(--color-surface-panel)]/60'
      }`}
    >
      <div className="flex items-center gap-2 px-3 py-2 min-w-0">
        {outbound && (
          <CornerDownRight className="w-3.5 h-3.5 shrink-0 text-[var(--color-brand-primary)]" aria-hidden="true" />
        )}
        <span className={`text-xs font-semibold shrink-0 ${outbound ? 'text-[var(--color-brand-primary)]' : 'text-[var(--color-text-primary)]'}`}>
          {sender}
        </span>
        <span className="text-[11px] text-[var(--color-text-muted)] truncate flex-1 min-w-0">
          {preview}
        </span>
        <span className="text-[11px] tabular-nums text-[var(--color-text-muted)] shrink-0">
          {fmt(message.receivedAt)}
        </span>
        <ChevronDown className="w-3.5 h-3.5 shrink-0 text-[var(--color-text-muted)]" aria-hidden="true" />
      </div>
    </button>
  );
}

/**
 * Renders the thread's messages chronologically. The `activeMessageId` message
 * is skipped (the caller renders it inside the composer/reply block). All
 * other messages default to collapsed except the newest customer message so
 * Andrea sees what she's replying to without extra clicks — matching Gmail.
 */
export default function ThreadHistory({ thread, activeMessageId, initiallyExpandedIds = [], onAttachmentError }) {
  const [expanded, setExpanded] = useState(() => new Set(initiallyExpandedIds));

  const toggle = (id) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const messages = thread.messages.filter((m) => m.id !== activeMessageId);
  if (messages.length === 0) return null;

  return (
    <section className="space-y-2">
      <h3 className="text-xs font-bold uppercase tracking-wide text-[var(--color-text-muted)]">
        Thread history
        <span className="ml-1 font-medium normal-case text-[var(--color-text-secondary)]">
          · {messages.length} earlier message{messages.length === 1 ? '' : 's'}
        </span>
      </h3>
      <div className="space-y-2">
        {messages.map((m) =>
          expanded.has(m.id) ? (
            <ExpandedMessage
              key={m.id}
              message={m}
              onCollapse={() => toggle(m.id)}
              onAttachmentError={onAttachmentError}
            />
          ) : (
            <CollapsedMessage key={m.id} message={m} onExpand={() => toggle(m.id)} />
          ),
        )}
      </div>
    </section>
  );
}

export { ForwardedInBanner };
