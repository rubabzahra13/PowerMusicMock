import { useState, useMemo, useEffect, useRef, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  LogOut,
  Search,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Toast, useToast } from '../components/ui';
import { fetchJson } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import {
  readManagerFormDraft,
  writeManagerFormDraft,
  clearManagerFormDraft,
  EMPTY_MANAGER_FORM,
  EMPTY_PERSON_FORM,
} from '../utils/managerFormDraft';
import {
  filterDirectorySearch,
  findFormMatchCandidates,
  formHasMatchCriteria,
  getSearchQueryHint,
  isUsableSearchQuery,
  normalizeDirectoryPerson,
} from '../utils/managerDirectory';

const cardClass =
  'rounded-xl border border-[var(--color-border-default)] bg-white shadow-[var(--shadow-card)]';

const inputClass =
  'w-full h-9 rounded-lg border border-[var(--color-border-default)] bg-white px-3 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] transition-[border-color,box-shadow] focus:border-[var(--color-brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-primary)]/15 disabled:cursor-not-allowed disabled:bg-[var(--color-surface-panel)]';

const labelClass = 'mb-1.5 block text-xs font-medium text-[var(--color-text-primary)]';

const sectionTitleClass =
  'text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-secondary)]';

function Field({ id, label, required, hint, children }) {
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div>
      <label htmlFor={id} className={labelClass}>
        {label}
        {required && (
          <>
            <span className="text-[var(--color-brand-accent)]" aria-hidden="true">
              {' '}
              *
            </span>
            <span className="sr-only"> (required)</span>
          </>
        )}
      </label>
      {children}
      {hint && (
        <p id={hintId} className="mt-1 text-[11px] text-[var(--color-text-secondary)]">
          {hint}
        </p>
      )}
    </div>
  );
}

function FormSection({ title, children }) {
  return (
    <fieldset className="space-y-3 border-0 p-0 m-0">
      <legend className={sectionTitleClass}>{title}</legend>
      {children}
    </fieldset>
  );
}

function directoryRowMatchesForm(row) {
  return Array.isArray(row.matchReasons) && row.matchReasons.length > 0;
}

function formatDirectoryDate(dateStr) {
  if (!dateStr) return null;
  try {
    return format(parseISO(dateStr), 'dd MMM yyyy');
  } catch {
    return null;
  }
}

export default function ManagerForm() {
  const formId = useId();
  const actionGroupId = `${formId}-action`;
  const { showToast } = useToast();
  const { profile, user, session, logout } = useAuth();
  const navigate = useNavigate();
  const draftRestoredRef = useRef(false);

  const [directoryPeople, setDirectoryPeople] = useState([]);
  const [directoryLoading, setDirectoryLoading] = useState(true);
  const [directoryError, setDirectoryError] = useState(null);

  const [submitted, setSubmitted] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [action, setAction] = useState('Add');
  const [notes, setNotes] = useState('');
  const [searchInput, setSearchInput] = useState('');

  const [managerForm, setManagerForm] = useState(EMPTY_MANAGER_FORM);
  const [personForm, setPersonForm] = useState(EMPTY_PERSON_FORM);

  const ids = {
    managerFirst: `${formId}-manager-first`,
    managerLast: `${formId}-manager-last`,
    managerEmail: `${formId}-manager-email`,
    managerClub: `${formId}-manager-club`,
    personFirst: `${formId}-person-first`,
    personLast: `${formId}-person-last`,
    personEmail: `${formId}-person-email`,
    personLocation: `${formId}-person-location`,
    notes: `${formId}-notes`,
    search: `${formId}-search`,
  };

  useEffect(() => {
    if (!user?.id || submitted) return;

    const draft = readManagerFormDraft(user.id);
    if (!draft) {
      draftRestoredRef.current = false;
      return;
    }

    draftRestoredRef.current = true;
    if (draft.managerForm) setManagerForm({ ...EMPTY_MANAGER_FORM, ...draft.managerForm });
    if (draft.personForm) setPersonForm({ ...EMPTY_PERSON_FORM, ...draft.personForm });
    if (draft.action) setAction(draft.action);
    if (typeof draft.notes === 'string') setNotes(draft.notes);
    if (typeof draft.searchInput === 'string') setSearchInput(draft.searchInput);
  }, [user?.id, submitted]);

  useEffect(() => {
    if (!profile || !user?.id || draftRestoredRef.current) return;

    const nameParts = (profile.full_name || '').trim().split(/\s+/).filter(Boolean);
    const club = user?.user_metadata?.club;

    setManagerForm((prev) => {
      const hasEdits =
        prev.firstName.trim() ||
        prev.lastName.trim() ||
        prev.email.trim() ||
        prev.club.trim();
      if (hasEdits) return prev;

      return {
        ...prev,
        email: profile.email || prev.email,
        firstName: nameParts[0] || prev.firstName,
        lastName: nameParts.slice(1).join(' ') || prev.lastName,
        club: (typeof club === 'string' && club.trim()) || prev.club,
      };
    });
  }, [profile, user]);

  useEffect(() => {
    if (!user?.id || submitted) return undefined;

    const persistDraft = () => {
      const hasContent =
        Object.values(managerForm).some((v) => String(v).trim()) ||
        Object.values(personForm).some((v) => String(v).trim()) ||
        notes.trim() ||
        searchInput.trim();

      if (!hasContent) {
        clearManagerFormDraft(user.id);
        return;
      }

      writeManagerFormDraft(user.id, {
        managerForm,
        personForm,
        action,
        notes,
        searchInput,
      });
      draftRestoredRef.current = true;
    };

    const timer = window.setTimeout(persistDraft, 400);

    const handleHidden = () => {
      if (document.visibilityState === 'hidden') persistDraft();
    };
    window.addEventListener('visibilitychange', handleHidden);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('visibilitychange', handleHidden);
    };
  }, [user?.id, managerForm, personForm, action, notes, searchInput, submitted]);

  useEffect(() => {
    if (!user?.id || !session?.access_token) return undefined;

    let cancelled = false;
    setDirectoryLoading(true);

    fetchJson('/api/manager/persons/directory')
      .then((data) => {
        if (cancelled) return;
        setDirectoryPeople(
          Array.isArray(data)
            ? data.map(normalizeDirectoryPerson).filter(Boolean)
            : [],
        );
        setDirectoryError(null);
      })
      .catch((err) => {
        if (cancelled) return;
        console.error(err);
        setDirectoryPeople([]);
        const msg = err.message || 'Could not load the directory.';
        if (msg.includes('Too many requests')) {
          setDirectoryError('The directory is busy. Wait a moment, then refresh the page.');
        } else {
          setDirectoryError(
            msg.includes('Authorization header')
              ? 'We could not load the directory. Sign out and sign in again.'
              : msg,
          );
        }
      })
      .finally(() => {
        // Always clear the loading flag, even if this effect run was superseded
        // (e.g. React StrictMode's dev double-invoke) — otherwise a stale
        // "cancelled" run can leave the UI stuck showing the loading state.
        setDirectoryLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user?.id, session?.access_token]);

  const handleManagerChange = (field, val) => {
    setManagerForm((prev) => ({ ...prev, [field]: val }));
  };

  const handlePersonChange = (field, val) => {
    setPersonForm((prev) => ({ ...prev, [field]: val }));
  };

  const isFormValid = useMemo(
    () =>
      managerForm.firstName.trim() !== '' &&
      managerForm.lastName.trim() !== '' &&
      managerForm.email.trim() !== '' &&
      managerForm.club.trim() !== '' &&
      personForm.firstName.trim() !== '' &&
      personForm.lastName.trim() !== '' &&
      personForm.email.trim() !== '' &&
      personForm.location.trim() !== '',
    [managerForm, personForm],
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isFormValid || submitting) return;

    setSubmitting(true);
    try {
      await fetchJson('/api/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submittedBy: managerForm,
          person: personForm,
          action,
          notes,
        }),
      });

      showToast('Request submitted.', 'success');
      if (user?.id) clearManagerFormDraft(user.id);
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      const msg = err.message || 'Failed to submit request.';
      showToast(
        msg.includes('429') || msg.includes('Too many')
          ? 'Too many submissions. Please try again later.'
          : msg,
        'error',
      );
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      if (user?.id) clearManagerFormDraft(user.id);
      await logout();
      navigate('/submit/signup', { replace: true });
    } catch (err) {
      console.error(err);
      showToast('Could not sign out. Please try again.', 'error');
    } finally {
      setSigningOut(false);
    }
  };

  const hasSearchInput = searchInput.trim().length >= 2;
  const hasSearchQuery = isUsableSearchQuery(searchInput);
  const searchQueryHint = getSearchQueryHint(searchInput);
  const isSearchTooBroad = hasSearchInput && !hasSearchQuery;

  const searchResults = useMemo(
    () => filterDirectorySearch(directoryPeople, searchInput),
    [directoryPeople, searchInput],
  );

  const formMatchResults = useMemo(
    () => findFormMatchCandidates(directoryPeople, personForm),
    [directoryPeople, personForm],
  );

  const displayResults = useMemo(() => {
    const byId = new Map();

    const mergeRow = (row, source) => {
      if (!row?.id) return;
      const existing = byId.get(row.id);
      const reasons = new Set([
        ...(existing?.matchReasons || []),
        ...(row.matchReasons || []),
      ]);

      byId.set(row.id, {
        ...(existing || {}),
        ...row,
        matchReasons: [...reasons],
        fromFormMatch: source === 'form' || existing?.fromFormMatch,
        fromManualSearch: source === 'search' || existing?.fromManualSearch,
      });
    };

    for (const row of searchResults) {
      mergeRow(row, 'search');
    }
    for (const row of formMatchResults) {
      mergeRow(row, 'form');
    }

    return Array.from(byId.values()).sort((a, b) => {
      if (hasSearchQuery) {
        const aSearch = a.fromManualSearch ? 1 : 0;
        const bSearch = b.fromManualSearch ? 1 : 0;
        if (bSearch !== aSearch) return bSearch - aSearch;
      }

      const aScore = a.matchReasons?.length || 0;
      const bScore = b.matchReasons?.length || 0;
      if (bScore !== aScore) return bScore - aScore;
      return 0;
    });
  }, [searchResults, formMatchResults, hasSearchQuery]);

  const showDirectoryResults =
    hasSearchQuery || formMatchResults.length > 0 || formHasMatchCriteria(personForm);
  const showInitialDirectoryLoading = directoryLoading && directoryPeople.length === 0;
  const actionOptions = [
    { value: 'Add', label: 'Add', icon: UserPlus },
    { value: 'Remove', label: 'Remove', icon: UserMinus },
  ];

  return (
    <div className="flex min-h-screen flex-col bg-[var(--color-surface-bg)] font-sans antialiased">
      <Toast />
      <a
        href="#manager-request-form"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-lg focus:bg-white focus:px-4 focus:py-2 focus:text-sm focus:font-medium focus:shadow-lg"
      >
        Skip to form
      </a>

      <header className="shrink-0 border-b border-[var(--color-border-default)] bg-white">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between gap-4 px-6">
          <div className="flex min-w-0 items-center gap-3">
            <img
              src="/image.png"
              alt=""
              className="h-6 w-auto shrink-0 object-contain"
              width={24}
              height={24}
            />
            <div className="min-w-0 border-l border-[var(--color-border-default)] pl-3">
              <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
                Power Music
              </p>
              <p className="truncate text-[11px] text-[var(--color-text-secondary)]">
                Submit a request
              </p>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {profile?.email && (
              <p className="hidden max-w-[200px] truncate text-xs text-[var(--color-text-secondary)] sm:block">
                {profile.email}
              </p>
            )}
            <button
              type="button"
              onClick={handleSignOut}
              disabled={signingOut}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-[var(--color-border-default)] px-3 text-xs font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-[var(--color-surface-highlight)] hover:text-[var(--color-text-primary)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]/25 disabled:opacity-50"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              {signingOut ? 'Signing out…' : 'Sign out'}
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-6 p-6 md:flex-row md:items-start md:p-8">
        <section className="flex w-full min-w-0 flex-col md:w-[44%] lg:w-[42%]">
          {submitted ? (
            <div
              className={`${cardClass} flex flex-1 flex-col items-center justify-center p-10 text-center`}
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
                <CheckCircle2 className="h-7 w-7 text-[var(--color-signal-green)]" aria-hidden="true" />
              </div>
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                Request submitted successfully
              </h2>
              <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
                A Power Music admin will action this shortly.
              </p>
              <p className="mt-6 text-xs text-[var(--color-text-muted)]">
                You can close this window.
              </p>
            </div>
          ) : (
            <form
              id="manager-request-form"
              onSubmit={handleSubmit}
              className={`${cardClass} space-y-5 p-6`}
            >
              <div className="space-y-4 border-b border-[var(--color-border-default)] pb-5">
                <div
                  role="radiogroup"
                  aria-labelledby={actionGroupId}
                  className="inline-flex w-full max-w-xs rounded-lg bg-[var(--color-surface-panel)] p-0.5 ring-1 ring-[var(--color-border-default)]"
                >
                  <p id={actionGroupId} className="sr-only">
                    Request type
                  </p>
                  {actionOptions.map(({ value, label, icon: Icon }) => {
                    const selected = action === value;
                    const isAdd = value === 'Add';
                    return (
                      <button
                        key={value}
                        type="button"
                        role="radio"
                        aria-checked={selected}
                        onClick={() => setAction(value)}
                        className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2 text-sm font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]/30 focus-visible:ring-offset-1 ${
                          selected
                            ? isAdd
                              ? 'bg-white text-[var(--color-tag-add-action-text)] shadow-sm ring-1 ring-[var(--color-border-default)]'
                              : 'bg-white text-[var(--color-tag-remove-action-text)] shadow-sm ring-1 ring-[var(--color-border-default)]'
                            : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                        }`}
                      >
                        <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                        {label}
                      </button>
                    );
                  })}
                </div>
                <div>
                  <h1 className="text-base font-semibold text-[var(--color-text-primary)]">
                    {action === 'Add' ? 'Add a Person' : 'Remove a Person'}
                  </h1>
                  <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                    {action === 'Add'
                      ? 'Submit a request to add a new person to the system.'
                      : 'Submit a request to remove an existing person from the system.'}
                  </p>
                </div>
              </div>

              <FormSection title="Your Details (Manager)">
                <div className="grid grid-cols-2 gap-3">
                  <Field id={ids.managerFirst} label="First Name" required>
                    <input
                      id={ids.managerFirst}
                      type="text"
                      required
                      autoComplete="given-name"
                      value={managerForm.firstName}
                      onChange={(e) => handleManagerChange('firstName', e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field id={ids.managerLast} label="Last Name" required>
                    <input
                      id={ids.managerLast}
                      type="text"
                      required
                      autoComplete="family-name"
                      value={managerForm.lastName}
                      onChange={(e) => handleManagerChange('lastName', e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field
                    id={ids.managerEmail}
                    label="Email"
                    required
                    hint={profile?.email ? 'Taken from your signed-in account.' : undefined}
                  >
                    <input
                      id={ids.managerEmail}
                      type="email"
                      required
                      autoComplete="email"
                      readOnly={Boolean(profile?.email)}
                      aria-readonly={Boolean(profile?.email)}
                      value={managerForm.email}
                      onChange={(e) => handleManagerChange('email', e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field id={ids.managerClub} label="Club Location" required>
                    <input
                      id={ids.managerClub}
                      type="text"
                      required
                      autoComplete="organization"
                      value={managerForm.club}
                      onChange={(e) => handleManagerChange('club', e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                </div>
              </FormSection>

              <FormSection title={action === 'Add' ? 'Person to add' : 'Person to remove'}>
                <div className="grid grid-cols-2 gap-3">
                  <Field id={ids.personFirst} label="First Name" required>
                    <input
                      id={ids.personFirst}
                      type="text"
                      required
                      value={personForm.firstName}
                      onChange={(e) => handlePersonChange('firstName', e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field id={ids.personLast} label="Last Name" required>
                    <input
                      id={ids.personLast}
                      type="text"
                      required
                      value={personForm.lastName}
                      onChange={(e) => handlePersonChange('lastName', e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Field id={ids.personEmail} label="Email" required>
                    <input
                      id={ids.personEmail}
                      type="email"
                      required
                      value={personForm.email}
                      onChange={(e) => handlePersonChange('email', e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                  <Field id={ids.personLocation} label="Location" required>
                    <input
                      id={ids.personLocation}
                      type="text"
                      required
                      value={personForm.location}
                      onChange={(e) => handlePersonChange('location', e.target.value)}
                      className={inputClass}
                    />
                  </Field>
                </div>

                {formMatchResults.length > 0 && (
                  <div
                    role="alert"
                    className="flex gap-2.5 rounded-lg border border-amber-200 bg-[var(--color-tag-already-exists-bg)] px-3.5 py-3 text-xs text-[var(--color-tag-already-exists-text)]"
                  >
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <div className="space-y-1">
                      <p className="font-semibold">
                        {formMatchResults.length === 1
                          ? 'This person may already be in the system.'
                          : `${formMatchResults.length} possible matches found in the directory.`}
                      </p>
                      <p className="opacity-90">Please review before submitting. You can still proceed.</p>
                    </div>
                  </div>
                )}
              </FormSection>

              <FormSection title="Additional Notes (optional)">
                <textarea
                  id={ids.notes}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any additional information for the admin..."
                  rows={3}
                  className={`${inputClass} h-auto resize-none py-2`}
                />
              </FormSection>

              <div className="space-y-2 border-t border-[var(--color-border-default)] pt-4">
                <button
                  type="submit"
                  disabled={!isFormValid || submitting}
                  aria-busy={submitting}
                  className="flex h-11 w-full items-center justify-center gap-2 rounded-lg bg-[var(--color-brand-primary)] text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-surface-sidebar-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]/35 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:bg-[var(--color-text-muted)] disabled:opacity-70"
                >
                  {submitting ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      Submitting…
                    </>
                  ) : (
                    'Submit Request'
                  )}
                </button>
                {!isFormValid && (
                  <p className="text-center text-[11px] text-[var(--color-text-muted)]">
                    Fill all required fields to submit.
                  </p>
                )}
              </div>
            </form>
          )}
        </section>

        <aside
          className={`${cardClass} flex w-full min-w-0 flex-col gap-4 self-start p-5 md:w-[56%] md:p-6 lg:w-[58%]`}
          aria-labelledby="directory-search-heading"
        >
          <div>
            <h2
              id="directory-search-heading"
              className="text-base font-semibold text-[var(--color-text-primary)]"
            >
              Existing Users
            </h2>
            <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
              Search by name or email. Person details on the form are checked automatically.
            </p>
          </div>

          <div className="relative">
            <Search
              className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--color-text-muted)]"
              aria-hidden="true"
            />
            <input
              id={ids.search}
              type="search"
              placeholder="Search by name or email..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              aria-label="Search by name or email"
              className={`${inputClass} pl-9`}
            />
          </div>

          {searchQueryHint && (
            <p className="text-[11px] leading-relaxed text-[var(--color-text-secondary)]" role="status">
              {searchQueryHint}
            </p>
          )}

          <div className="overflow-hidden rounded-lg border border-[var(--color-border-default)]">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] table-fixed border-collapse text-left text-xs">
                <caption className="sr-only">Directory search results</caption>
                <colgroup>
                  <col className="w-[22%]" />
                  <col className="w-[30%]" />
                  <col className="w-[18%]" />
                  <col className="w-[14%]" />
                  <col className="w-[16%]" />
                </colgroup>
                <thead>
                  <tr className="border-b border-[var(--color-border-default)] bg-[var(--color-surface-panel)]">
                    <th
                      scope="col"
                      className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]"
                    >
                      Name
                    </th>
                    <th
                      scope="col"
                      className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]"
                    >
                      Email
                    </th>
                    <th
                      scope="col"
                      className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]"
                    >
                      Location
                    </th>
                    <th
                      scope="col"
                      className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]"
                    >
                      Added
                    </th>
                    <th
                      scope="col"
                      className="px-2 py-2 text-[10px] font-semibold uppercase tracking-wide text-[var(--color-text-secondary)]"
                    >
                      Status
                    </th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--color-border-default)]">
                  {!showDirectoryResults && !showInitialDirectoryLoading && !isSearchTooBroad && (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-[var(--color-text-muted)]">
                        Type at least 2 characters to search, or enter person details to check for
                        matches.
                      </td>
                    </tr>
                  )}
                  {showInitialDirectoryLoading && (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-[var(--color-text-muted)]">
                        <span className="inline-flex items-center gap-2">
                          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                          Loading directory…
                        </span>
                      </td>
                    </tr>
                  )}
                  {!showInitialDirectoryLoading && directoryError && displayResults.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-red-600">
                        {directoryError}
                      </td>
                    </tr>
                  )}
                  {isSearchTooBroad && !showInitialDirectoryLoading && displayResults.length === 0 && (
                    <tr>
                      <td colSpan={5} className="px-3 py-8 text-center text-[var(--color-text-muted)]">
                        Nothing matched that search. Try a name or email address.
                      </td>
                    </tr>
                  )}
                  {!showInitialDirectoryLoading &&
                    !directoryError &&
                    showDirectoryResults &&
                    !isSearchTooBroad &&
                    displayResults.length === 0 && (
                      <tr>
                        <td colSpan={5} className="px-3 py-8 text-center text-[var(--color-text-muted)]">
                          No one matched that search.
                        </td>
                      </tr>
                    )}
                  {!showInitialDirectoryLoading &&
                    displayResults.map((row) => {
                      const isMatch = directoryRowMatchesForm(row);
                      const isAdded = row.status === 'Added';
                      const dateLabel = formatDirectoryDate(row.dateAdded);

                      return (
                        <tr
                          key={row.id}
                          className={
                            isMatch ? (isAdded ? 'bg-emerald-50/80' : 'bg-red-50/80') : undefined
                          }
                        >
                          <td className="px-2 py-2 align-top">
                            <span
                              className={`break-words font-medium leading-snug ${isMatch ? 'font-semibold' : ''}`}
                            >
                              {row.firstName} {row.lastName}
                            </span>
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 font-normal text-[var(--color-text-secondary)]">
                            {row.email || '—'}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 font-normal text-[var(--color-text-secondary)]">
                            {row.location || '—'}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2 font-normal text-[var(--color-text-secondary)]">
                            {dateLabel || '—'}
                          </td>
                          <td className="whitespace-nowrap px-2 py-2">
                            <span
                              className={`inline-flex rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                                isAdded
                                  ? 'bg-[var(--color-tag-added-bg)] text-[var(--color-tag-added-text)]'
                                  : 'bg-[var(--color-tag-removed-bg)] text-[var(--color-tag-removed-text)]'
                              }`}
                            >
                              {row.status}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                </tbody>
              </table>
            </div>
          </div>

          {showDirectoryResults && !directoryError && (
            <p className="text-[11px] text-[var(--color-text-muted)]">
              {displayResults.length === 0
                ? 'No results to show yet.'
                : `${displayResults.length} result${displayResults.length === 1 ? '' : 's'}`}
              {hasSearchQuery && formMatchResults.length > 0
                ? ` (${searchResults.length} from search, ${formMatchResults.length} from form)`
                : ''}
              {formMatchResults.length > 0 && !hasSearchQuery ? ' from your form details' : ''}
              {hasSearchQuery && formMatchResults.length === 0 && displayResults.length > 0
                ? ' from search'
                : ''}
            </p>
          )}

          {directoryError && displayResults.length > 0 && (
            <p className="text-[11px] text-red-600">{directoryError}</p>
          )}

          <p className="border-t border-[var(--color-border-default)] pt-3 text-xs leading-relaxed text-[var(--color-text-secondary)]">
            Rows that share any name, email, or location detail with your form are also listed here.
          </p>
        </aside>
      </main>
    </div>
  );
}
