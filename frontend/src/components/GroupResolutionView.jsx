import { useState } from 'react';
import { Link } from 'react-router-dom';
import {
  ArrowLeft, ChevronRight, Check, Database, Clock, FileEdit,
  X, AlertTriangle, Users,
} from 'lucide-react';
import { Tag, Modal } from './ui';
import { formatAdminDateTime, formatRequestDisplayId } from '../utils/requestDisplayId';
import {
  resolveGroupAdd,
  resolveGroupUpdate,
  resolveGroupUpdatePreview,
  resolveGroupKeepExisting,
  resolveGroupDeleteFromDirectory,
  resolveGroupMarkRemoved,
  unlinkGroupMember,
} from '../utils/duplicateGroupApi';

/* ─── helpers ────────────────────────────────────────────────────────────── */

function initials(person) {
  const parts = [person?.firstName, person?.lastName].filter(Boolean);
  if (parts.length >= 2) return `${parts[0][0]}${parts[parts.length - 1][0]}`.toUpperCase();
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return '?';
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

function SectionCard({ icon: Icon, title, action, children, className = '' }) {
  return (
    <section className={`py-6 ${className}`}>
      <div className="relative overflow-hidden rounded-r-2xl border-l-[3px] border-l-[var(--color-brand-secondary)] bg-gradient-to-br from-white via-white to-[var(--color-surface-bg)] px-4 py-5 shadow-[0_1px_0_rgba(26,26,46,0.04)] sm:px-5">
        <div className="pointer-events-none absolute -right-8 -top-10 h-28 w-28 rounded-full bg-[var(--color-brand-secondary)]/[0.05]" aria-hidden="true" />
        <div className="relative flex items-center justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white/80 text-[var(--color-brand-secondary)] shadow-[0_1px_0_rgba(26,26,46,0.04)] ring-1 ring-[var(--color-brand-secondary-border)]/45">
              <Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <h2 className="text-sm font-semibold tracking-tight text-[var(--color-brand-secondary)]">
              {title}
            </h2>
          </div>
          {action && <div>{action}</div>}
        </div>
        <div className="relative">{children}</div>
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

  // Update confirmation modal state
  const [showUpdateConfirm, setShowUpdateConfirm] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);
  const [showAddConfirm, setShowAddConfirm] = useState(false);
  const [showMarkRemovedConfirm, setShowMarkRemovedConfirm] = useState(false);
  const [showKeepExistingConfirm, setShowKeepExistingConfirm] = useState(false);
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const isRemoveRequest = repMember?.action === 'Remove';

  const updateDraftField = (field, value) => setDraftForm((f) => ({ ...f, [field]: value }));

  const handleEditClick = () => {
    setDraftForm(form);
    setIsEditing(true);
  };

  const handleSaveClick = () => {
    if (!draftForm.firstName.trim() || !draftForm.lastName.trim()) return;
    setForm(draftForm);
    setIsEditing(false);
  };

  const isFormValid = form.firstName.trim() && form.lastName.trim();

  const executeResolveAdd = async () => {
    if (!isFormValid || submitting) return;
    setShowAddConfirm(false);
    setSubmitting(true);
    try {
      await resolveGroupAdd(group.id, {
        finalValues: {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
          location: form.location.trim(),
        },
        adminNote: adminNote.trim() || null,
      });
      onResolved('add', personFullName(form));
    } catch (err) {
      onResolved('error', err.message || 'Failed to resolve group.');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── resolve & update preview (Case B — step 1) ── */
  const handlePreviewUpdate = async () => {
    if (!isFormValid || submitting || previewLoading) return;
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
      setShowUpdateConfirm(true);
    } catch (err) {
      onResolved('error', err.message || 'Failed to load preview.');
    } finally {
      setPreviewLoading(false);
    }
  };

  /* ── resolve & update confirm (Case B — step 2) ── */
  const handleConfirmUpdate = async () => {
    if (submitting) return;
    setShowUpdateConfirm(false);
    setSubmitting(true);
    try {
      await resolveGroupUpdate(group.id, {
        directoryPersonId: group.directoryPersonId,
        finalValues: {
          firstName: form.firstName.trim(),
          lastName: form.lastName.trim(),
          email: form.email.trim(),
          location: form.location.trim(),
        },
        adminNote: adminNote.trim() || null,
      });
      onResolved('update', personFullName(form));
    } catch (err) {
      onResolved('error', err.message || 'Failed to update Directory.');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── resolve — keep existing (Case C) ── */
  const executeKeepExisting = async () => {
    if (submitting) return;
    setShowKeepExistingConfirm(false);
    setSubmitting(true);
    try {
      await resolveGroupKeepExisting(group.id, {
        adminNote: adminNote.trim() || null,
      });
      onResolved('keep', null);
    } catch (err) {
      onResolved('error', err.message || 'Failed to resolve group.');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── resolve & delete from directory (Case D) ── */
  const handleConfirmDelete = async () => {
    if (submitting) return;
    setShowDeleteConfirm(false);
    setSubmitting(true);
    try {
      await resolveGroupDeleteFromDirectory(group.id, {
        directoryPersonId: group.directoryPersonId,
        adminNote: adminNote.trim() || null,
      });
      onResolved('delete', personFullName(form));
    } catch (err) {
      onResolved('error', err.message || 'Failed to delete from Directory.');
    } finally {
      setSubmitting(false);
    }
  };

  /* ── resolve & mark as removed (Case E) ── */
  const executeMarkRemoved = async () => {
    if (submitting) return;
    setShowMarkRemovedConfirm(false);
    setSubmitting(true);
    try {
      await resolveGroupMarkRemoved(group.id, {
        adminNote: adminNote.trim() || null,
      });
      onResolved('mark_removed', personFullName(form));
    } catch (err) {
      onResolved('error', err.message || 'Failed to mark as removed.');
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

  return (
    <div className="relative z-0 min-w-0 w-full bg-[var(--color-surface-bg)] pb-16 select-none">

      {/* ── breadcrumb ── */}
      <nav aria-label="Breadcrumb" className="mb-8 flex w-full flex-wrap items-center gap-x-3 gap-y-2">
        <Link
          to="/new-requests"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-highlight)] hover:text-[var(--color-text-primary)]"
          aria-label="Back to New requests"
        >
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
        </Link>
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
                    Duplicate group
                  </span>
                </div>
              </div>
              <div className="mt-4 border-t border-[var(--color-border-default)] pt-4">
                <p className="text-xs text-[var(--color-text-muted)]">
                  {members.length} request{members.length !== 1 ? 's' : ''} grouped
                  {group.createdAt && (
                    <>
                      <span className="mx-1.5" aria-hidden="true">·</span>
                      {formatAdminDateTime(group.createdAt)}
                    </>
                  )}
                </p>
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
              Directory record details not available locally - values shown in the confirmation step.
            </p>
          )}
          <p className="mt-4 text-xs text-[var(--color-text-muted)]">
            This is the existing Directory record. Use "Resolve & Update Directory" to update it, or "Resolve & Keep Existing" to leave it unchanged.
          </p>
        </SectionCard>
      )}

      {/* ── Section B: Request History ── */}
      <SectionCard icon={Clock} title={`Request History (${members.length})`}>
        <div className="space-y-3">
          {[...members]
            .sort((a, b) => new Date(a.receivedAt) - new Date(b.receivedAt))
            .map((member) => (
              <div
                key={member.id}
                className={`rounded-xl border bg-white px-4 py-3.5 ${member.isRepresentative
                  ? 'border-[var(--color-brand-secondary-border)] ring-1 ring-[var(--color-brand-secondary-border)]/40'
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
                    {member.isRepresentative && (
                      <Tag variant="new-person" label="Latest" />
                    )}
                  </div>

                  {/* Unlink button — not shown on representative */}
                  {!member.isRepresentative && members.length > 1 && (
                    <button
                      type="button"
                      onClick={() => setUnlinkTargetId(member.id)}
                      className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg text-xs font-semibold text-[var(--color-text-secondary)] hover:text-red-600 hover:bg-red-50 transition-colors cursor-pointer"
                      title="Mark as not the same person"
                    >
                      <X className="h-3.5 w-3.5" />
                      Not the same person
                    </button>
                  )}
                </div>

                <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
                  <MetaItem label="First Name" value={member.person.firstName} />
                  <MetaItem label="Last Name" value={member.person.lastName} />
                  <MetaItem label="Email" value={member.person.email} />
                  <MetaItem label="Location" value={member.person.location} />
                </dl>

                {member.receivedAt && (
                  <p className="mt-3 text-xs text-[var(--color-text-muted)]">
                    Received {formatAdminDateTime(member.receivedAt)}
                  </p>
                )}
              </div>
            ))}
        </div>
      </SectionCard>

      {/* ── Section C: Final Resolved Values ── */}
      <SectionCard
        icon={FileEdit}
        title="Final Resolved Values"
        action={
          !isEditing ? (
            <button
              type="button"
              onClick={handleEditClick}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-[var(--color-border-default)] text-xs font-semibold text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-highlight)] transition-colors cursor-pointer"
            >
              <FileEdit className="h-3.5 w-3.5" />
              Edit
            </button>
          ) : null
        }
      >
        <p className="mb-4 text-xs text-[var(--color-text-secondary)]">
          Pre-filled from the latest request.
          <strong className="text-[var(--color-text-primary)]"> First Name and Last Name are required.</strong>
        </p>

        {!isEditing ? (
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-4">
            <MetaItem label="First Name" value={form.firstName} />
            <MetaItem label="Last Name" value={form.lastName} />
            <MetaItem label="Email" value={form.email} />
            <MetaItem label="Location" value={form.location} />
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
            <div className="col-span-full mt-2 flex justify-end">
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
      </SectionCard>

      {/* ── Action footer ── */}
      <section aria-labelledby="resolve-heading" className="py-6">
        <div className="relative overflow-hidden rounded-2xl border border-[var(--color-border-default)] bg-white py-5 px-4 sm:px-5">
          <div className="mb-5 flex items-center gap-3">
            <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-surface-bg)] text-[var(--color-text-secondary)] ring-1 ring-[var(--color-border-default)]">
              <Check className="h-4 w-4" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <h2 id="resolve-heading" className="text-sm font-semibold tracking-tight text-[var(--color-text-primary)]">
                Resolve this duplicate group
              </h2>
              <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
                {hasDirectory
                  ? 'A matching Directory record exists. Choose how to resolve.'
                  : 'No existing Directory match. Resolving will add a new Directory entry.'}
              </p>
            </div>
          </div>

          {/* Admin note */}
          <label htmlFor="group-resolve-note" className="block w-full">
            <span className="text-[11px] font-medium uppercase tracking-wide text-[var(--color-text-muted)]">
              Admin note <span className="normal-case tracking-normal">(optional)</span>
            </span>
            <textarea
              id="group-resolve-note"
              value={adminNote}
              onChange={(e) => setAdminNote(e.target.value)}
              placeholder="Saved with the resolution record"
              rows={2}
              className="mt-2 w-full resize-none rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-bg)] px-3.5 py-2.5 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] transition-colors focus:border-[var(--color-brand-secondary)] focus:bg-white focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-secondary)]/15"
            />
          </label>

          <div className="mt-5 flex flex-wrap items-center justify-end gap-3 border-t border-[var(--color-border-default)] pt-4">
            {!hasDirectory ? (
              isRemoveRequest ? (
                /* Case E */
                <button
                  type="button"
                  disabled={submitting}
                  onClick={() => setShowMarkRemovedConfirm(true)}
                  className={BTN_PRIMARY}
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {submitting ? 'Resolving…' : 'Resolve & Mark as Removed'}
                </button>
              ) : (
                /* Case A */
                <button
                  type="button"
                  disabled={!isFormValid || submitting}
                  onClick={() => setShowAddConfirm(true)}
                  className={BTN_PRIMARY}
                >
                  <Check className="h-4 w-4" aria-hidden="true" />
                  {submitting ? 'Resolving…' : 'Resolve & Add to Directory'}
                </button>
              )
            ) : (
              isRemoveRequest ? (
                /* Case D / Case C (Remove context) */
                <>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => setShowKeepExistingConfirm(true)}
                    className={BTN_SECONDARY}
                  >
                    {submitting ? 'Resolving…' : 'Resolve & Keep Existing Directory'}
                  </button>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => setShowDeleteConfirm(true)}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-red-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-60 disabled:cursor-not-allowed cursor-pointer"
                  >
                    {submitting ? 'Resolving…' : 'Resolve & Delete from Directory'}
                  </button>
                </>
              ) : (
                /* Case B / Case C (Add context) */
                <>
                  <button
                    type="button"
                    disabled={submitting}
                    onClick={() => setShowKeepExistingConfirm(true)}
                    className={BTN_SECONDARY}
                  >
                    {submitting ? 'Resolving…' : 'Resolve & Keep Existing Directory'}
                  </button>
                  <button
                    type="button"
                    disabled={!isFormValid || submitting || previewLoading}
                    onClick={handlePreviewUpdate}
                    className={BTN_PRIMARY}
                  >
                    <Check className="h-4 w-4" aria-hidden="true" />
                    {previewLoading ? 'Loading preview…' : submitting ? 'Updating…' : 'Resolve & Update Directory'}
                  </button>
                </>
              )
            )}
          </div>
        </div>
      </section>

      {/* ── Update confirmation modal (diff view) ── */}
      <Modal
        isOpen={showUpdateConfirm}
        onClose={() => setShowUpdateConfirm(false)}
        title="Resolve and update directory?"
        wide
        footer={
          <>
            <button
              type="button"
              onClick={() => setShowUpdateConfirm(false)}
              className="px-4 py-2 border border-[var(--color-border-default)] rounded-lg text-sm font-medium text-[var(--color-text-primary)] hover:bg-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmUpdate}
              className="px-4 py-2 text-white text-sm font-semibold rounded-lg bg-[var(--color-brand-primary)] hover:bg-[var(--color-surface-sidebar-hover)] shadow-sm cursor-pointer"
            >
              Confirm and Update
            </button>
          </>
        }
      >
        {previewData && (
          <div className="space-y-3">
            <p className="text-sm text-[var(--color-text-secondary)]">
              This will resolve this request group and update the existing Directory record with the final resolved values shown above. The other requests in this group will no longer remain active.
            </p>

            {previewData.anyChanged && (
              <div className="flex items-center gap-2 rounded-lg border border-[var(--color-tag-review-exists-border)] bg-[var(--color-tag-review-exists-bg)] px-3 py-2 text-xs text-[var(--color-tag-review-exists-text)]">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
                {previewData.fields?.filter((f) => f.changed).length} field(s) will change.
              </div>
            )}

            <table className="w-full text-sm border-collapse">
              <thead>
                <tr>
                  <th className="text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] pb-2 w-1/3">Field</th>
                  <th className="text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] pb-2 w-1/3">Current</th>
                  <th className="text-left text-[11px] font-semibold uppercase tracking-wide text-[var(--color-text-muted)] pb-2 w-1/3">New</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-default)]">
                {(previewData.fields || []).map((f) => (
                  <tr
                    key={f.field}
                    className={f.changed ? 'bg-[var(--color-tag-review-exists-bg)]/50' : ''}
                  >
                    <td className="py-2 pr-3 text-xs font-medium text-[var(--color-text-secondary)]">
                      {f.label}
                    </td>
                    <td className="py-2 pr-3 text-xs text-[var(--color-text-muted)] font-mono">
                      {f.currentValue || <span className="italic">-</span>}
                    </td>
                    <td className={`py-2 text-xs font-mono ${f.changed ? 'font-semibold text-[var(--color-text-primary)]' : 'text-[var(--color-text-muted)]'}`}>
                      {f.proposedValue || <span className="italic">-</span>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Modal>

      {/* ── Delete confirmation modal ── */}
      <Modal
        isOpen={showDeleteConfirm}
        onClose={() => setShowDeleteConfirm(false)}
        title="Resolve and delete from directory?"
        confirm
        footer={
          <>
            <button
              type="button"
              onClick={() => setShowDeleteConfirm(false)}
              className="px-4 py-2 border border-[var(--color-border-default)] rounded-lg text-sm font-medium text-[var(--color-text-primary)] hover:bg-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmDelete}
              className="px-4 py-2 text-white text-sm font-semibold rounded-lg bg-red-600 hover:bg-red-700 shadow-sm cursor-pointer"
            >
              Delete and Resolve
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-secondary)]">
            This will resolve the request and permanently delete the existing Directory record for this person. This action cannot be undone.
          </p>
        </div>
      </Modal>

      {/* ── Add to Directory confirmation modal ── */}
      <Modal
        isOpen={showAddConfirm}
        onClose={() => setShowAddConfirm(false)}
        title="Resolve and add to directory?"
        footer={
          <>
            <button
              type="button"
              onClick={() => setShowAddConfirm(false)}
              className="px-4 py-2 border border-[var(--color-border-default)] rounded-lg text-sm font-medium text-[var(--color-text-primary)] hover:bg-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={executeResolveAdd}
              className="px-4 py-2 text-white text-sm font-semibold rounded-lg bg-[var(--color-brand-primary)] hover:bg-[var(--color-surface-sidebar-hover)] shadow-sm cursor-pointer"
            >
              Confirm and Add
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-secondary)]">
            This will resolve this request group using the final resolved values shown above and add the person to the Directory. The other requests in this group will no longer remain active.
          </p>
        </div>
      </Modal>

      {/* ── Mark as Removed confirmation modal ── */}
      <Modal
        isOpen={showMarkRemovedConfirm}
        onClose={() => setShowMarkRemovedConfirm(false)}
        title="Resolve and mark as removed?"
        footer={
          <>
            <button
              type="button"
              onClick={() => setShowMarkRemovedConfirm(false)}
              className="px-4 py-2 border border-[var(--color-border-default)] rounded-lg text-sm font-medium text-[var(--color-text-primary)] hover:bg-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={executeMarkRemoved}
              className="px-4 py-2 text-white text-sm font-semibold rounded-lg bg-[var(--color-brand-primary)] hover:bg-[var(--color-surface-sidebar-hover)] shadow-sm cursor-pointer"
            >
              Confirm and Mark as Removed
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-secondary)]">
            This will resolve this request group and mark the person as removed. The requests in this group will no longer remain active.
          </p>
        </div>
      </Modal>

      {/* ── Keep Existing confirmation modal ── */}
      <Modal
        isOpen={showKeepExistingConfirm}
        onClose={() => setShowKeepExistingConfirm(false)}
        title="Resolve and keep existing directory?"
        footer={
          <>
            <button
              type="button"
              onClick={() => setShowKeepExistingConfirm(false)}
              className="px-4 py-2 border border-[var(--color-border-default)] rounded-lg text-sm font-medium text-[var(--color-text-primary)] hover:bg-white transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={executeKeepExisting}
              className="px-4 py-2 text-white text-sm font-semibold rounded-lg bg-[var(--color-brand-primary)] hover:bg-[var(--color-surface-sidebar-hover)] shadow-sm cursor-pointer"
            >
              Confirm and Keep Existing
            </button>
          </>
        }
      >
        <div className="space-y-3">
          <p className="text-sm text-[var(--color-text-secondary)]">
            This will resolve this request group without changing the existing Directory record. The current Directory information will remain unchanged, and the other requests in this group will no longer remain active.
          </p>
        </div>
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
