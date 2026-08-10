import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, ChevronRight, ChevronDown, Check, Database, Clock, Pencil,
  X, AlertTriangle, Users, Inbox,
} from 'lucide-react';
import { Tag, Modal, HoverTip } from './ui';
import { formatAdminDateTime, formatRequestDisplayId } from '../utils/requestDisplayId';
import { getManagerDisplayName, isManualEntry, MANUAL_ENTRY_CLUB } from '../utils/manualEntry';
import { readManagerNotes } from '../utils/managerNotes';
import {
  resolveGroupAdd,
  resolveGroupUpdate,
  resolveGroupUpdatePreview,
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
      <dt className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-brand-secondary)]/75">
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
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyExpanded, setHistoryExpanded] = useState(false);

  // Update / resolve confirmation modal state
  const [confirmAction, setConfirmAction] = useState(null); // 'keep' | 'merge' | null
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [modalValues, setModalValues] = useState(null);

  const updateDraftField = (field, value) => setDraftForm((f) => ({ ...f, [field]: value }));
  const updateModalField = (field, value) => setModalValues((f) => ({ ...f, [field]: value }));

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
    setPreviewData(null);
    setModalValues(null);
  };

  /* ── keep existing — open confirm (Case C) ── */
  const openKeepConfirm = () => {
    if (submitting) return;
    setConfirmAction('keep');
  };

  /* ── merge — open confirm; load overwrite preview only when Directory exists ── */
  const openMergeConfirm = async () => {
    if (!isFormValid || submitting || previewLoading) return;

    if (!hasDirectory) {
      setPreviewData(null);
      setModalValues({ ...form });
      setConfirmAction('merge');
      return;
    }

    setPreviewLoading(true);
    try {
      const preview = await resolveGroupUpdatePreview(group.id, {
        directoryPersonId: group.directoryPersonId,
        finalValues: {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
          location: form.location.trim(),
        },
      });
      setPreviewData(preview);
      setModalValues({
        firstName: preview.proposedValues?.firstName ?? form.firstName,
        lastName: preview.proposedValues?.lastName ?? form.lastName,
        email: preview.proposedValues?.email ?? form.email,
        location: preview.proposedValues?.location ?? form.location,
      });
      setConfirmAction('merge');
    } catch (err) {
      onResolved('error', err.message || 'Failed to load preview.');
    } finally {
      setPreviewLoading(false);
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
      onResolved('update', personFullName(values));
    } catch (err) {
      onResolved('error', err.message || 'Failed to update Directory.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleConfirmMerge = async () => {
    const values = modalValues || form;
    if (hasDirectory) {
      await handleConfirmUpdate(values);
    } else {
      await handleResolveAdd(values);
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
            This is the existing Directory record. Use "Add this Record" on the current request, or "Merge Record" with the final values, or "Keep Existing and Delete New Request" to leave it unchanged.
          </p>
        </SectionCard>
      )}

      {/* ── New Request (latest only) ── */}
      {currentRequest && (
        <SectionCard
          icon={Inbox}
          title="New Request"
          action={
            <button
              type="button"
              disabled={!isFormValid || submitting || previewLoading || isEditing}
              onClick={openMergeConfirm}
              className={BTN_PRIMARY}
            >
              <Check className="h-4 w-4" aria-hidden="true" />
              {previewLoading ? 'Loading preview…' : submitting ? 'Updating…' : 'Add this Record'}
            </button>
          }
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
            <MetaItem label="Manager notes" value={currentManager.notesText} />
          </dl>

          {currentRequest.receivedAt && (
            <p className="mt-3 text-xs text-[var(--color-text-muted)]">
              Received {formatAdminDateTime(currentRequest.receivedAt)}
            </p>
          )}
        </SectionCard>
      )}

      {/* ── Request History ── */}
      <SectionCard
        icon={Clock}
        title={`View Request History (${members.length})`}
        collapsible
        open={historyOpen}
        onToggle={() => setHistoryOpen((open) => !open)}
      >
        <div className="space-y-3">
          <p className="mb-2 text-sm text-[var(--color-text-secondary)]">
            {hasDirectory
              ? 'Review matching requests below, set final values, then choose Keep or Merge. Field changes only appear in the modal when overwriting Directory.'
              : 'Review matching requests below, set final values, then choose Keep or Merge. You’ll confirm before anything is written.'}
          </p>

          <div className="space-y-3 rounded-xl border border-[var(--color-border-default)] bg-[var(--color-surface-bg)]/70 p-3 sm:p-4">
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
                <div className="space-y-3">
                  {visibleMembers.map((member) => {
                    const isLatest = member.id === latestId;
                    const role = isLatest
                      ? { variant: 'new-person', label: 'Current request' }
                      : { variant: 'neutral', label: 'Older' };
                    return (
                      <div
                        key={member.id}
                        className={`relative rounded-xl border px-4 py-3.5 ${isLatest
                          ? 'border-[var(--color-surface-sidebar)] bg-white ring-2 ring-[var(--color-surface-sidebar)]/20'
                          : 'border-[var(--color-border-default)] bg-white'
                          } ${!isLatest && members.length > 1 ? 'pr-44' : ''}`}
                      >
                        {!isLatest && members.length > 1 && (
                          <button
                            type="button"
                            onClick={() => setUnlinkTargetId(member.id)}
                            className="absolute right-4 top-1/2 z-10 inline-flex -translate-y-1/2 items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--color-border-default)] bg-white text-xs font-semibold text-[var(--color-text-secondary)] hover:border-red-300 hover:bg-red-50 hover:text-red-700 transition-colors cursor-pointer"
                            title="Mark as not the same person"
                          >
                            <X className="h-3.5 w-3.5" />
                            Not the same person
                          </button>
                        )}

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

                        {(() => {
                          const {
                            managerName,
                            managerEmail,
                            managerClub,
                            notesText,
                          } = managerFieldsFromMember(member);
                          return (
                            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
                              <MetaItem label="First Name" value={member.person.firstName} />
                              <MetaItem label="Last Name" value={member.person.lastName} />
                              <MetaItem label="Email" value={member.person.email} />
                              <MetaItem label="Location" value={member.person.location} />
                              <MetaItem label="Manager name" value={managerName} />
                              <MetaItem label="Manager email" value={managerEmail} />
                              <MetaItem label="Manager location" value={managerClub} />
                              <MetaItem label="Manager notes" value={notesText} />
                            </dl>
                          );
                        })()}

                        {member.receivedAt && (
                          <p className="mt-3 text-xs text-[var(--color-text-muted)]">
                            Received {formatAdminDateTime(member.receivedAt)}
                          </p>
                        )}
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

          {/* Final Resolved Values — collapsed accordion */}
          <div className="overflow-hidden rounded-xl border border-[var(--color-border-default)] bg-white">
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

                <label htmlFor="group-resolve-note" className="mt-5 block w-full border-t border-[var(--color-border-default)] pt-4">
                  <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
                    Admin note <span className="normal-case tracking-normal">(optional)</span>
                  </span>
                  <textarea
                    id="group-resolve-note"
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

          {/* Resolve actions */}
          <div className="grid grid-cols-1 gap-3 pt-2 sm:grid-cols-2">
            <button
              type="button"
              disabled={submitting}
              onClick={openKeepConfirm}
              className="group flex flex-col items-start gap-2 rounded-xl border border-[var(--color-border-default)] bg-white px-4 py-4 text-left transition-colors hover:border-[var(--color-brand-secondary-border)] hover:bg-[var(--color-surface-highlight)] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-[var(--color-surface-bg)] text-[var(--color-text-secondary)] ring-1 ring-[var(--color-border-default)] group-hover:text-[var(--color-brand-secondary)]">
                <Database className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="text-sm font-semibold text-[var(--color-text-primary)]">
                Keep Existing and Delete New Request
              </span>
              <span className="text-xs leading-snug text-[var(--color-text-secondary)]">
                {hasDirectory
                  ? 'Leave Directory unchanged and close the new requests.'
                  : 'Discard these requests without adding anyone to Directory.'}
              </span>
            </button>

            <button
              type="button"
              disabled={!isFormValid || submitting || previewLoading || isEditing}
              onClick={openMergeConfirm}
              className="group flex flex-col items-start gap-2 rounded-xl border border-[var(--color-brand-primary)]/20 bg-[var(--color-brand-primary)] px-4 py-4 text-left text-white transition-colors hover:bg-[var(--color-surface-sidebar-hover)] disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
            >
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-full bg-white/15 text-white">
                <Check className="h-4 w-4" aria-hidden="true" />
              </span>
              <span className="text-sm font-semibold">
                {previewLoading ? 'Loading preview…' : 'Merge Record'}
              </span>
              <span className="text-xs leading-snug text-white/80">
                {hasDirectory
                  ? 'Overwrite Directory with resolved values — review the diff in the modal.'
                  : 'Create a Directory record from the final resolved values.'}
              </span>
            </button>
          </div>
        </div>
      </SectionCard>

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

      {/* ── Merge confirmation ── */}
      <Modal
        isOpen={confirmAction === 'merge'}
        onClose={closeConfirmModal}
        title={hasDirectory ? 'Merge into Directory record?' : 'Merge and add to Directory?'}
        wide={hasDirectory}
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
              disabled={
                submitting
                || !(modalValues?.firstName || '').trim()
                || !(modalValues?.lastName || '').trim()
              }
              onClick={handleConfirmMerge}
              className="px-4 py-2 text-white text-sm font-semibold rounded-lg bg-[var(--color-brand-primary)] hover:bg-[var(--color-surface-sidebar-hover)] shadow-sm cursor-pointer disabled:opacity-60"
            >
              {submitting
                ? 'Resolving…'
                : hasDirectory
                  ? 'Confirm Merge'
                  : 'Add to Directory'}
            </button>
          </>
        }
      >
        {hasDirectory && previewData && modalValues ? (
          <div className="space-y-4">
            <p className="text-sm text-[var(--color-text-secondary)]">
              This will overwrite{' '}
              <strong className="text-[var(--color-text-primary)]">
                {personFullName(previewData.currentValues || form)}
              </strong>
              {' '}
              in Directory. Adjust resolved values below before confirming.
            </p>

            {previewData.anyChanged && (
              <div className="flex items-center gap-2 rounded-lg border border-[var(--color-tag-review-exists-border)] bg-[var(--color-tag-review-exists-bg)] px-3 py-2 text-xs text-[var(--color-tag-review-exists-text)]">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {previewData.fields?.filter((f) => f.changed).length} field(s) differ from Directory.
              </div>
            )}

            <div className="overflow-x-auto">
              <table className="w-full min-w-[28rem] text-sm border-collapse">
                <thead>
                  <tr>
                    <th className="text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] pb-2 w-[20%]">Field</th>
                    <th className="text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] pb-2 w-[28%]">Directory</th>
                    <th className="text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] pb-2 w-[28%]">Proposed</th>
                    <th className="text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] pb-2 w-[24%]">Resolved</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-default)]">
                  {(previewData.fields || []).map((f) => (
                    <tr
                      key={f.field}
                      className={f.changed ? 'bg-[var(--color-tag-review-exists-bg)]/40' : ''}
                    >
                      <td className="py-2.5 pr-3 text-xs font-medium text-[var(--color-text-secondary)] align-middle">
                        {f.label}
                      </td>
                      <td className="py-2.5 pr-3 text-xs text-[var(--color-text-muted)] font-mono align-middle">
                        {f.currentValue || <span className="italic">—</span>}
                      </td>
                      <td className="py-2.5 pr-3 text-xs font-mono align-middle text-[var(--color-text-muted)]">
                        {f.proposedValue || <span className="italic">—</span>}
                      </td>
                      <td className="py-2 align-middle">
                        <input
                          type="text"
                          value={modalValues[f.field] ?? ''}
                          onChange={(e) => updateModalField(f.field, e.target.value)}
                          className={`${INPUT_CLASS} py-1.5 text-xs`}
                          aria-label={`Resolved ${f.label}`}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        ) : (
          <p className="text-sm text-[var(--color-text-secondary)]">
            This will create a new Directory record from the final resolved values and close the requests in this group.
          </p>
        )}
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
