import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, ChevronRight, ChevronDown, Check, Database, Clock, Pencil,
  X, Users, Inbox, Trash2,
} from 'lucide-react';
import { Tag, Modal, HoverTip } from './ui';
import { formatAdminDateTime, formatRequestDisplayId } from '../utils/requestDisplayId';
import { getManagerDisplayName, isManualEntry, MANUAL_ENTRY_CLUB } from '../utils/manualEntry';
import { readManagerNotes } from '../utils/managerNotes';
import {
  resolveGroupAdd,
  resolveGroupUpdate,
  resolveGroupKeepExisting,
  unlinkGroupMember,
} from '../utils/duplicateGroupApi';

/* ─── helpers ────────────────────────────────────────────────────────────── */

function initials(person) {
  const parts = [person?.firstName, person?.lastName].filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return '?';
}

function managerFieldsFromMember(member) {
  const managerName =
    member?.createdBy
    || getManagerDisplayName(member?.submittedBy, member?.tags, member);
  const managerEmail = (member?.submittedBy?.email || '').trim();
  const clubRaw = (member?.submittedBy?.club || '').trim();
  const managerClub =
    clubRaw && clubRaw !== MANUAL_ENTRY_CLUB && !isManualEntry(member?.submittedBy)
      ? clubRaw
      : (clubRaw === MANUAL_ENTRY_CLUB ? MANUAL_ENTRY_CLUB : '');
  const notesText = readManagerNotes(member);
  return { managerName, managerEmail, managerClub, notesText };
}

function personFullName(person) {
  return [person?.firstName, person?.lastName].filter(Boolean).join(' ') || 'Unknown';
}

/* ─── sub-components (reusing exact patterns from RequestDetailDrawer) ───── */

function MetaItem({ label, value }) {
  if (!value) return null;
  return (
    <div className="min-w-0">
      <dt className="text-[11px] font-bold uppercase tracking-wide text-[var(--color-brand-secondary)]/75">
        {label}
      </dt>
      <dd className="mt-1 break-words text-sm font-medium text-[var(--color-text-primary)]">
        {value}
      </dd>
    </div>
  );
}

function SectionCard({
  icon: Icon,
  title,
  action,
  children,
  className = '',
  collapsible = false,
  open = true,
  onToggle,
}) {
  const header = (
    <div className="flex min-w-0 items-center gap-3">
      <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/80 text-[var(--color-brand-secondary)] shadow-[0_1px_0_rgba(26,26,46,0.04)] ring-1 ring-[var(--color-brand-secondary-border)]/45">
        <Icon className="h-4 w-4" aria-hidden="true" />
      </span>
      <h2 className="text-sm font-semibold tracking-tight text-[var(--color-brand-secondary)]">
        {title}
      </h2>
    </div>
  );

  return (
    <section className={`py-6 ${className}`}>
      <div className="relative overflow-hidden rounded-r-2xl border-l-[3px] border-l-[var(--color-brand-secondary)] bg-gradient-to-br from-white via-white to-[var(--color-surface-bg)] px-4 py-5 shadow-[0_1px_0_rgba(26,26,46,0.04)] sm:px-5">
        <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-[var(--color-brand-secondary)]/[0.05]" aria-hidden="true" />
        <div className={`relative flex items-center justify-between ${open || !collapsible ? 'mb-4' : ''}`}>
          {collapsible ? (
            <button
              type="button"
              onClick={onToggle}
              className="flex min-w-0 flex-1 items-center justify-between gap-3 text-left cursor-pointer rounded-lg -mx-1 px-1 py-0.5 hover:bg-white/50 transition-colors"
              aria-expanded={open}
            >
              {header}
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-[var(--color-text-muted)] transition-transform ${open ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>
          ) : (
            header
          )}
          {action && !collapsible && <div>{action}</div>}
          {action && collapsible && open && <div className="ml-3 shrink-0">{action}</div>}
        </div>
        {(!collapsible || open) && <div className="relative">{children}</div>}
      </div>
    </section>
  );
}

function classificationTag(classification) {
  if (classification === 'confirmed_duplicate') return { variant: 'duplicate-confirmed', label: 'Confirmed Duplicate' };
  if (classification === 'potential_duplicate') return { variant: 'duplicate-potential', label: 'Potential Duplicate' };
  if (classification === 'already_exists' || classification === 'already_exists_conflict') return { variant: 'already-exists', label: 'Already Exists' };
  return { variant: 'neutral', label: classification };
}

const INPUT_CLASS =
  'w-full px-3 py-2 bg-white border border-[var(--color-border-default)] rounded-lg text-sm focus:outline-none focus:border-[var(--color-border-focus)] focus:ring-2 focus:ring-[rgba(233,69,96,0.08)] transition-all';

const LABEL_CLASS = 'block text-[11px] font-semibold text-[var(--color-text-secondary)] mb-1';

const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 rounded-lg bg-[var(--color-brand-primary)] px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-[var(--color-surface-sidebar-hover)] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer';

const BTN_SECONDARY =
  'inline-flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg border border-[var(--color-border-default)] text-sm font-semibold text-[var(--color-text-primary)] hover:bg-[var(--color-surface-highlight)] transition-colors disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer';

/* ─── main export ────────────────────────────────────────────────────────── */

export default function GroupResolutionView({
  group,
  directory = [],
  onResolved,
}) {
  const repMember = group.members.find((m) => m.isRepresentative) || group.members[0];
  const hasDirectory = Boolean(group.directoryPersonId);

  // Find Directory person for Section A by email match
  const dirPerson =
    hasDirectory
      ? directory.find((d) => d.id === group.directoryPersonId) ||
      directory.find(
        (d) =>
          (d.email || '').toLowerCase() ===
          (repMember?.person?.email || '').toLowerCase(),
      )
      : null;

  // Final values form state — pre-filled from representative
  const [form, setForm] = useState({
    firstName: repMember?.person?.firstName || '',
    lastName: repMember?.person?.lastName || '',
    email: repMember?.person?.email || '',
    location: repMember?.person?.location || '',
  });
  const [isEditing, setIsEditing] = useState(false);
  const [draftForm, setDraftForm] = useState(form);
  const [unlinkTargetId, setUnlinkTargetId] = useState(null);

  const [adminNote, setAdminNote] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Members list (local — remove unlinked members instantly)
  const [members, setMembers] = useState(group.members);
  const [valuesOpen, setValuesOpen] = useState(true);
  const [historyExpanded, setHistoryExpanded] = useState(false);
  const [mergePageOpen, setMergePageOpen] = useState(false);

  // Keep confirmation + merge-page values
  const [confirmAction, setConfirmAction] = useState(null); // 'keep' | null
  const [modalValues, setModalValues] = useState(null);

  const updateDraftField = (field, value) => setDraftForm((f) => ({ ...f, [field]: value }));

  const handleEditClick = () => {
    setDraftForm(form);
    setIsEditing(true);
    setValuesOpen(true);
  };

  const handleSaveClick = () => {
    if (!draftForm.firstName.trim() || !draftForm.lastName.trim()) return;
    setForm(draftForm);
    setIsEditing(false);
  };

  const isFormValid = form.firstName.trim() && form.lastName.trim();

  const closeConfirmModal = () => {
    setConfirmAction(null);
  };

  const closeMergePage = () => {
    setMergePageOpen(false);
    setModalValues(null);
  };

  /* ── keep existing — open confirm (Case C) ── */
  const openKeepConfirm = () => {
    if (submitting) return;
    setConfirmAction('keep');
  };

  /* ── merge — open clear on-page merge view (no modal) ── */
  const openMergePage = () => {
    if (submitting) return;
    setHistoryExpanded(true);
    setValuesOpen(true);
    setModalValues({ ...form });
    setMergePageOpen(true);
  };

  const openMergeConfirm = async () => {
    if (!isFormValid || submitting) return;
    openMergePage();
  };

  const handleSaveResolved = () => {
    if (isEditing) {
      if (!draftForm.firstName.trim() || !draftForm.lastName.trim()) return;
      setForm(draftForm);
      setIsEditing(false);
      setModalValues({ ...draftForm });
      return;
    }
    setModalValues({ ...form });
  };

  const handleConfirmMerge = async () => {
    const values = isEditing ? draftForm : (modalValues || form);
    if (hasDirectory) {
      await handleConfirmUpdate(values);
    } else {
      await handleResolveAdd(values);
    }
  };

  /* ── resolve & add (Case A) ── */
  const handleResolveAdd = async (values = form) => {
    if (!values.firstName.trim() || !values.lastName.trim() || submitting) return;
    setSubmitting(true);
    try {
      await resolveGroupAdd(group.id, {
        finalValues: {
          firstName: values.firstName.trim(),
          lastName: values.lastName.trim(),
          email: (values.email || '').trim(),
          location: (values.location || '').trim(),
        },
        adminNote: adminNote.trim() || null,
      });
      closeConfirmModal();
      closeMergePage();
      onResolved('add', personFullName(values));
    } catch (err) {
      onResolved('error', err.message || 'Failed to resolve group.');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── resolve & update (Case B) ── */
  const handleConfirmUpdate = async (values = form) => {
    if (submitting) return;
    if (!values.firstName.trim() || !values.lastName.trim()) return;
    setSubmitting(true);
    try {
      await resolveGroupUpdate(group.id, {
        directoryPersonId: group.directoryPersonId,
        finalValues: {
          firstName: values.firstName.trim(),
          lastName: values.lastName.trim(),
          email: (values.email || '').trim(),
          location: (values.location || '').trim(),
        },
        adminNote: adminNote.trim() || null,
      });
      closeConfirmModal();
      closeMergePage();
      onResolved('update', personFullName(values));
    } catch (err) {
      onResolved('error', err.message || 'Failed to update Directory.');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── resolve — keep existing (Case C) ── */
  const handleKeepExisting = async () => {
    if (submitting) return;
    setSubmitting(true);
    try {
      await resolveGroupKeepExisting(group.id, {
        adminNote: adminNote.trim() || null,
      });
      closeConfirmModal();
      onResolved('keep', null);
    } catch (err) {
      onResolved('error', err.message || 'Failed to resolve group.');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── unlink member ── */
  const handleUnlink = async (memberId) => {
    const repId = group.representativeRequestId || repMember?.id;
    try {
      await unlinkGroupMember(group.id, {
        requestId1: repId,
        requestId2: memberId,
      });

      const nextMembers = members.filter((m) => m.id !== memberId);
      if (nextMembers.length <= 1 && !hasDirectory) {
        // Group has dissolved completely
        onResolved('unlinked_dissolved', null);
      } else {
        setMembers(nextMembers);
      }
    } catch (err) {
      onResolved('error', err.message || 'Failed to unlink member.');
    }
  };

  const tag = classificationTag(group.classification);
  const personName = personFullName(repMember?.person);
  const currentRequest = [...members].sort(
    (a, b) => new Date(b.receivedAt || 0) - new Date(a.receivedAt || 0),
  )[0] || repMember;
  const currentManager = managerFieldsFromMember(currentRequest);

  return (
    <div className="relative z-0 min-w-0 w-full bg-[var(--color-surface-bg)] pb-16 select-none">

      {/* ── breadcrumb ── */}
      <nav aria-label="Breadcrumb" className="mb-8 flex w-full flex-wrap items-center gap-x-3 gap-y-2">
        <HoverTip label="Back to New requests">
          <Link
            to="/new-requests"
            className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-highlight)] hover:text-[var(--color-text-primary)]"
            aria-label="Back to New requests"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          </Link>
        </HoverTip>
        <ol className="flex min-w-0 flex-wrap items-center gap-1.5 text-sm">
          <li>
            <Link
              to="/new-requests"
              className="font-medium text-[var(--color-text-secondary)] transition-colors hover:text-[var(--color-text-primary)]"
            >
              New requests
            </Link>
          </li>
          <li aria-hidden="true" className="text-[var(--color-text-muted)]">
            <ChevronRight className="h-3.5 w-3.5" />
          </li>
          <li aria-current="page" className="min-w-0 truncate font-medium text-[var(--color-text-primary)]">
            {personName}
          </li>
        </ol>
        <div className="ml-auto flex flex-wrap items-center gap-1.5">
          <span className="mr-1.5 hidden h-4 w-px shrink-0 self-center bg-[var(--color-border-default)] sm:block" aria-hidden="true" />
          <Tag variant={tag.variant} label={tag.label} />
          {members.length > 1 && (
            <Tag variant="neutral" label={`${members.length} requests`} />
          )}
        </div>
      </nav>

      {/* ── header card ── */}
      <header className="relative z-[1]">
        <div className="rounded-2xl border border-[var(--color-border-default)] bg-white px-5 py-5 sm:px-6 sm:py-6">
          <div className="flex items-start gap-4 sm:gap-5">
            <div
              className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-[var(--color-surface-bg)] text-lg font-semibold tracking-tight text-[var(--color-brand-secondary)] ring-1 ring-[var(--color-border-default)] sm:h-16 sm:w-16 sm:text-xl"
              aria-hidden="true"
            >
              {initials(repMember?.person)}
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <h1 className="text-2xl font-semibold leading-tight tracking-tight text-[var(--color-text-primary)] sm:text-[1.75rem]">
                    {personName}
                  </h1>
                  {repMember?.person?.email && (
                    <p className="mt-1.5 text-sm text-[var(--color-text-secondary)] font-mono">
                      {repMember.person.email}
                    </p>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-2">
                  <Tag
                    variant={repMember?.action === 'Add' ? 'add-action' : 'remove-action'}
                    label={repMember?.action === 'Add' ? 'Add person' : 'Remove person'}
                  />
                  <Users className="h-4 w-4 text-[var(--color-text-muted)]" aria-hidden="true" />
                  <span className="text-sm text-[var(--color-text-secondary)]">
                    Duplicate exists
                  </span>
                </div>
              </div>
              <div className="mt-4 border-t border-[var(--color-border-default)] pt-4">
                {repMember?.receivedAt && (
                  <p className="text-xs text-[var(--color-text-muted)]">
                    Received {formatAdminDateTime(repMember.receivedAt)}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>
      </header>


      {mergePageOpen ? (
        <SectionCard
          icon={Clock}
          title={`Request History (${members.length})`}
          action={
            <button
              type="button"
              onClick={closeMergePage}
              className="inline-flex items-center gap-1.5 text-sm font-semibold text-[var(--color-brand-primary)] transition-colors hover:text-[var(--color-surface-sidebar-hover)] cursor-pointer"
            >
              ← Back to Current Request
            </button>
          }
        >
          <div className="relative space-y-4 pl-6 sm:pl-8">
            <div
              className="pointer-events-none absolute bottom-4 left-[0.7rem] top-4 w-px bg-[var(--color-brand-secondary)]/35 sm:left-[0.95rem]"
              aria-hidden="true"
            />
            {(() => {
              const sortedByNewest = [...members].sort(
                (a, b) => new Date(b.receivedAt) - new Date(a.receivedAt),
              );
              const latestId = sortedByNewest[0]?.id || null;
              const historyCollapsible = members.length > 2;
              const hiddenCount = sortedByNewest.length - 2;
              const visibleMembers =
                historyCollapsible && !historyExpanded
                  ? sortedByNewest.slice(0, 2)
                  : sortedByNewest;

              return (
                <div className="space-y-4">
                  {visibleMembers.map((member) => {
                    const isLatest = member.id === latestId;
                    const role = isLatest
                      ? { variant: 'new-person', label: 'Current request' }
                      : { variant: 'neutral', label: 'Older' };
                    const {
                      managerName,
                      managerEmail,
                      managerClub,
                      notesText,
                    } = managerFieldsFromMember(member);
                    return (
                      <div key={member.id} className="relative">
                        <span
                          className="absolute -left-6 top-5 z-[1] h-3 w-3 rounded-sm border-2 border-[var(--color-brand-secondary)] bg-white sm:-left-7"
                          aria-hidden="true"
                        />
                        <div
                          className={`rounded-xl border bg-white px-4 py-3.5 ${isLatest
                            ? 'border-[var(--color-surface-sidebar)] ring-2 ring-[var(--color-surface-sidebar)]/20'
                            : 'border-[var(--color-border-default)]'
                            }`}
                        >
                          <div className="flex flex-wrap items-start justify-between gap-2">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs font-bold tabular-nums text-[var(--color-text-muted)]">
                                {formatRequestDisplayId(member.displayId)}
                              </span>
                              <Tag
                                variant={member.action === 'Add' ? 'add-action' : 'remove-action'}
                                label={member.action}
                              />
                              <Tag variant={role.variant} label={role.label} />
                            </div>
                            {!isLatest && members.length > 1 && (
                              <div className="flex w-[11.5rem] shrink-0 flex-col overflow-hidden rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-bg)]/80 shadow-[0_1px_0_rgba(26,26,46,0.04)]">
                                <button
                                  type="button"
                                  onClick={() => setUnlinkTargetId(member.id)}
                                  className="inline-flex w-full items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-[var(--color-text-secondary)] transition-colors hover:bg-white hover:text-[var(--color-text-primary)] cursor-pointer"
                                >
                                  <X className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                  Not the same person
                                </button>
                                <div className="h-px bg-[var(--color-border-default)]" aria-hidden="true" />
                                <button
                                  type="button"
                                  onClick={() => setUnlinkTargetId(member.id)}
                                  className="inline-flex w-full items-center justify-center gap-1.5 px-2.5 py-2 text-xs font-semibold text-red-600 transition-colors hover:bg-red-50 hover:text-red-700 cursor-pointer"
                                >
                                  <Trash2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                                  Delete
                                </button>
                              </div>
                            )}
                          </div>

                          <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
                            <MetaItem label="First Name" value={member.person.firstName || '—'} />
                            <MetaItem label="Last Name" value={member.person.lastName || '—'} />
                            <MetaItem label="Email" value={member.person.email || '—'} />
                            <MetaItem label="Location" value={member.person.location || '—'} />
                            <MetaItem label="Manager name" value={managerName || '—'} />
                            <MetaItem label="Manager email" value={managerEmail || '—'} />
                            <MetaItem label="Manager location" value={managerClub || '—'} />
                            <MetaItem label="Manager notes" value={notesText || 'No notes'} />
                          </dl>

                          {member.receivedAt && (
                            <p className="mt-3 text-xs text-[var(--color-text-muted)]">
                              Received {formatAdminDateTime(member.receivedAt)}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}

                  {historyCollapsible && (
                    <button
                      type="button"
                      onClick={() => setHistoryExpanded((open) => !open)}
                      className="flex w-full items-center justify-center gap-1.5 rounded-xl border border-dashed border-[var(--color-border-default)] bg-white/70 px-3 py-2.5 text-xs font-semibold text-[var(--color-text-secondary)] hover:border-[var(--color-brand-secondary-border)] hover:bg-[var(--color-surface-highlight)] hover:text-[var(--color-brand-secondary)] transition-colors cursor-pointer"
                      aria-expanded={historyExpanded}
                    >
                      {historyExpanded
                        ? 'Show less'
                        : `View ${hiddenCount} more request${hiddenCount === 1 ? '' : 's'}`}
                      <ChevronDown
                        className={`h-3.5 w-3.5 transition-transform ${historyExpanded ? 'rotate-180' : ''}`}
                        aria-hidden="true"
                      />
                    </button>
                  )}
                </div>
              );
            })()}
          </div>

          <div className="mt-6 overflow-hidden rounded-xl border border-[var(--color-border-default)] bg-white">
            <button
              type="button"
              onClick={() => setValuesOpen((open) => !open)}
              className="flex w-full items-center justify-between gap-3 px-4 py-3.5 text-left transition-colors hover:bg-[var(--color-surface-highlight)] cursor-pointer sm:px-5"
              aria-expanded={valuesOpen}
            >
              <div className="flex min-w-0 items-center gap-3">
                <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-bg)] text-[var(--color-brand-secondary)] ring-1 ring-[var(--color-border-default)]">
                  <Pencil className="h-4 w-4" aria-hidden="true" />
                </span>
                <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                  {valuesOpen ? 'Hide Final Resolved Values' : 'Final Resolved Values'}
                </p>
              </div>
              <ChevronDown
                className={`h-4 w-4 shrink-0 text-[var(--color-text-muted)] transition-transform ${valuesOpen ? 'rotate-180' : ''}`}
                aria-hidden="true"
              />
            </button>

            {valuesOpen && (
              <div className="border-t border-[var(--color-border-default)] bg-[var(--color-surface-bg)]/70 px-4 py-4 sm:px-5">
                <div className="mb-4 flex items-start justify-between gap-3">
                  <p className="text-xs text-[var(--color-text-secondary)]">
                    Pre-filled from the latest request.
                    <strong className="text-[var(--color-text-primary)]"> First Name and Last Name are required.</strong>
                  </p>
                  {!isEditing && (
                    <HoverTip label="Edit">
                      <button
                        type="button"
                        onClick={handleEditClick}
                        className="inline-flex items-center justify-center rounded-md border border-[var(--color-border-default)] bg-white p-1.5 text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-panel)] hover:text-[var(--color-brand-primary)] transition-colors cursor-pointer"
                        aria-label="Edit final resolved values"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </button>
                    </HoverTip>
                  )}
                </div>

                {!isEditing ? (
                  <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
                    <MetaItem label="First Name" value={form.firstName || '—'} />
                    <MetaItem label="Last Name" value={form.lastName || '—'} />
                    <MetaItem label="Email" value={form.email || '—'} />
                    <MetaItem label="Location" value={form.location || '—'} />
                  </dl>
                ) : (
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div>
                      <label className={LABEL_CLASS}>First Name *</label>
                      <input
                        type="text"
                        value={draftForm.firstName}
                        onChange={(e) => updateDraftField('firstName', e.target.value)}
                        className={INPUT_CLASS}
                        placeholder="First name"
                      />
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>Last Name *</label>
                      <input
                        type="text"
                        value={draftForm.lastName}
                        onChange={(e) => updateDraftField('lastName', e.target.value)}
                        className={INPUT_CLASS}
                        placeholder="Last name"
                      />
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>Email</label>
                      <input
                        type="email"
                        value={draftForm.email}
                        onChange={(e) => updateDraftField('email', e.target.value)}
                        className={INPUT_CLASS}
                        placeholder="Email address"
                      />
                    </div>
                    <div>
                      <label className={LABEL_CLASS}>Location</label>
                      <input
                        type="text"
                        value={draftForm.location}
                        onChange={(e) => updateDraftField('location', e.target.value)}
                        className={INPUT_CLASS}
                        placeholder="Location"
                      />
                    </div>
                    <div className="col-span-full mt-1 flex justify-end">
                      <button
                        type="button"
                        onClick={handleSaveClick}
                        disabled={!draftForm.firstName.trim() || !draftForm.lastName.trim()}
                        className={BTN_PRIMARY}
                      >
                        Save
                      </button>
                    </div>
                  </div>
                )}

                <label htmlFor="merge-page-resolve-note" className="mt-5 block w-full border-t border-[var(--color-border-default)] pt-4">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                    Admin note <span className="normal-case tracking-normal">(optional)</span>
                  </span>
                  <textarea
                    id="merge-page-resolve-note"
                    value={adminNote}
                    onChange={(e) => setAdminNote(e.target.value)}
                    placeholder="Saved with the resolution record"
                    rows={2}
                    className="mt-2 w-full resize-none rounded-lg border border-[var(--color-border-default)] bg-white px-3.5 py-2.5 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] transition-colors focus:border-[var(--color-brand-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-secondary)]/15"
                  />
                </label>
              </div>
            )}
          </div>

          <div className="mt-6 flex flex-wrap items-center justify-end gap-3 border-t border-[var(--color-border-default)] pt-4">
            <button
              type="button"
              disabled={submitting || !isFormValid || isEditing}
              onClick={handleSaveResolved}
              className={BTN_SECONDARY}
            >
              Save
            </button>
            <button
              type="button"
              disabled={submitting || !isFormValid || isEditing}
              onClick={handleConfirmMerge}
              className={BTN_PRIMARY}
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              {submitting ? 'Merging…' : 'Merge'}
            </button>
          </div>
        </SectionCard>
      ) : (
        <>
      {/* ── Section A: Current Directory Record (only if already_exists) ── */}
      {hasDirectory && (
        <SectionCard icon={Database} title="Current Directory Record">
          {dirPerson ? (
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2 sm:gap-x-8">
              <MetaItem label="First Name" value={dirPerson.firstName} />
              <MetaItem label="Last Name" value={dirPerson.lastName} />
              <MetaItem label="Email" value={dirPerson.email} />
              <MetaItem label="Location" value={dirPerson.location} />
              {dirPerson.status && <MetaItem label="Status" value={dirPerson.status} />}
            </dl>
          ) : (
            <p className="text-sm text-[var(--color-text-muted)] italic">
              Directory record details not available locally. Values shown in the confirmation step.
            </p>
          )}
          <p className="mt-4 text-xs text-[var(--color-text-muted)]">
            This is the existing Directory record. Keep leaves it unchanged; Merge opens history so you can review and update it with final values.
          </p>
        </SectionCard>
      )}

      {/* ── New Request (latest only) ── */}
      {currentRequest && (
        <SectionCard
          icon={Inbox}
          title="New Request"
        >
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <span className="text-xs font-bold tabular-nums text-[var(--color-text-muted)]">
              {formatRequestDisplayId(currentRequest.displayId)}
            </span>
            <Tag
              variant={currentRequest.action === 'Add' ? 'add-action' : 'remove-action'}
              label={currentRequest.action}
            />
            <Tag variant="new-person" label="Current request" />
          </div>

          <dl className="grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
            <MetaItem label="First Name" value={currentRequest.person?.firstName} />
            <MetaItem label="Last Name" value={currentRequest.person?.lastName} />
            <MetaItem label="Email" value={currentRequest.person?.email} />
            <MetaItem label="Location" value={currentRequest.person?.location} />
            <MetaItem label="Manager name" value={currentManager.managerName} />
            <MetaItem label="Manager email" value={currentManager.managerEmail} />
            <MetaItem label="Manager location" value={currentManager.managerClub} />
            <MetaItem label="Manager notes" value={currentManager.notesText || 'No notes'} />
          </dl>

          {currentRequest.receivedAt && (
            <p className="mt-3 text-xs text-[var(--color-text-muted)]">
              Received {formatAdminDateTime(currentRequest.receivedAt)}
            </p>
          )}

          <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--color-border-default)] pt-4">
            <button
              type="button"
              onClick={openMergePage}
              className="inline-flex items-center gap-2 rounded-lg border border-[var(--color-border-default)] bg-white px-3.5 py-2 text-sm font-semibold text-[var(--color-text-primary)] shadow-[0_1px_0_rgba(26,26,46,0.04)] transition-colors hover:bg-[var(--color-surface-highlight)] hover:border-[var(--color-brand-secondary-border)] hover:text-[var(--color-brand-secondary)] cursor-pointer"
            >
              <Clock className="h-4 w-4 shrink-0 text-[var(--color-brand-secondary)]" aria-hidden="true" />
              View Request History ({members.length})
            </button>

            <div className="flex flex-wrap items-center justify-end gap-3">
              <button
                type="button"
                disabled={submitting}
                onClick={openKeepConfirm}
                className={BTN_SECONDARY}
              >
                Keep Existing and Delete New Request
              </button>
              <button
                type="button"
                disabled={!isFormValid || submitting || isEditing}
                onClick={openMergeConfirm}
                className={BTN_PRIMARY}
              >
                <Check className="h-4 w-4" aria-hidden="true" />
                Merge & Update Request in Directory
              </button>
            </div>
          </div>
        </SectionCard>
      )}

        </>
      )}

      {/* ── Keep confirmation ── */}
      <Modal
        isOpen={confirmAction === 'keep'}
        onClose={closeConfirmModal}
        title="Keep existing and delete new request?"
        footer={
          <>
            <button
              type="button"
              onClick={closeConfirmModal}
              className="px-4 py-2 border border-[var(--color-border-default)] rounded-lg text-sm font-medium text-[var(--color-text-primary)] hover:bg-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={submitting}
              onClick={handleKeepExisting}
              className="px-4 py-2 text-white text-sm font-semibold rounded-lg bg-[var(--color-brand-primary)] hover:bg-[var(--color-surface-sidebar-hover)] shadow-sm cursor-pointer disabled:opacity-60"
            >
              {submitting ? 'Resolving…' : 'Keep Existing'}
            </button>
          </>
        }
      >
        <p className="text-sm text-[var(--color-text-secondary)]">
          {hasDirectory
            ? 'The Directory record will stay unchanged. Incoming requests in this group will be closed without writing new values.'
            : 'No Directory record will be created. Incoming requests in this group will be closed and discarded.'}
        </p>
      </Modal>

      {/* ── Unlink confirmation modal ── */}
      <Modal
        isOpen={!!unlinkTargetId}
        onClose={() => setUnlinkTargetId(null)}
        confirm
        title="Are you sure this is not the same person?"
        footer={
          <>
            <button
              type="button"
              onClick={() => setUnlinkTargetId(null)}
              className="px-4 py-2 border border-[var(--color-border-default)] rounded-lg text-sm font-medium text-[var(--color-text-primary)] hover:bg-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => {
                const target = unlinkTargetId;
                setUnlinkTargetId(null);
                handleUnlink(target);
              }}
              className="px-4 py-2 text-white text-sm font-semibold rounded-lg bg-[var(--color-brand-primary)] hover:bg-[var(--color-surface-sidebar-hover)] shadow-sm cursor-pointer"
            >
              Confirm
            </button>
          </>
        }
      >
        <p className="text-sm text-[var(--color-text-secondary)]">
          This will unlink this request from the current request history and create it as a separate new request.
        </p>
      </Modal>
    </div>
  );
}
