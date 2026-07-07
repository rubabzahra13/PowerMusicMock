import { useState, useMemo, useEffect, useRef, useId } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  LogOut,
  Plus,
  Search,
  Trash2,
  UserMinus,
  UserPlus,
} from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { Toast, useToast } from '../components/ui';
import { fetchJson } from '../utils/api';
import { clearCache } from '../utils/pilot2Api';
import { waitForSubmissionJob } from '../utils/managerSubmissionJobs';
import { useAuth } from '../context/AuthContext';
import {
  readManagerFormDraft,
  writeManagerFormDraft,
  clearManagerFormDraft,
  EMPTY_PERSON_FORM,
  MAX_MANAGER_PERSON_ROWS,
  normalizePersonFormsFromDraft,
} from '../utils/managerFormDraft';
import {
  filterDirectorySearch,
  findFormMatchCandidates,
  formHasMatchCriteria,
  getSearchQueryHint,
  isUsableSearchQuery,
} from '../utils/managerDirectory';
import {
  PERSON_FIELD_LIMITS,
  sanitizePersonFieldInput,
  validatePersonForms,
  firstInvalidPersonField,
} from '../utils/managerFormValidation';
import ManagerRequestHistory from '../components/manager/ManagerRequestHistory';
import { useManagerDirectory } from '../hooks/useManagerDirectory';

const cardClass =
  'rounded-xl border border-[var(--color-border-default)] bg-white shadow-[var(--shadow-card)]';

const inputClass =
  'w-full h-9 rounded-lg border border-[var(--color-border-default)] bg-white px-3 text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] transition-[border-color,box-shadow] focus:border-[var(--color-brand-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-brand-primary)]/15 disabled:cursor-not-allowed disabled:bg-[var(--color-surface-panel)]';

const invalidInputClass =
  'border-red-300 focus:border-red-400 focus:ring-red-200/60';

const textareaClass = `${inputClass} h-auto resize-none py-2`;

const readonlyInputClass = `${inputClass} cursor-default bg-[var(--color-surface-panel)] read-only:cursor-default focus:ring-0`;

const labelClass = 'mb-1.5 block text-xs font-medium text-[var(--color-text-primary)]';

const sectionTitleClass =
  'text-[11px] font-semibold tracking-wide text-[var(--color-text-secondary)]';

const formGridClass = 'grid grid-cols-1 gap-3 sm:grid-cols-2';

function Field({ id, label, required, hint, error, children }) {
  const hintId = hint ? `${id}-hint` : undefined;
  const errorId = error ? `${id}-error` : undefined;
  const describedBy = [errorId, hintId].filter(Boolean).join(' ') || undefined;

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
      {typeof children === 'function'
        ? children({ errorId, describedBy, invalid: Boolean(error) })
        : children}
      {error && (
        <p id={errorId} role="alert" className="mt-1 text-[11px] text-red-600">
          {error}
        </p>
      )}
      {hint && !error && (
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

  const [submitted, setSubmitted] = useState(false);
  const [submittedCount, setSubmittedCount] = useState(1);
  const [requestRefreshToken, setRequestRefreshToken] = useState(0);
  const [submitting, setSubmitting] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [action, setAction] = useState('Add');
  const directoryOutcome = action === 'Remove' ? 'Removed' : 'Added';
  const { people: directoryPeople, loading: directoryLoading, error: directoryError } =
    useManagerDirectory(user?.id, session?.access_token, {
      enabled: !submitted && Boolean(user?.id && session?.access_token),
      outcome: directoryOutcome,
    });
  const [searchInput, setSearchInput] = useState('');

  const [personForms, setPersonForms] = useState([{ ...EMPTY_PERSON_FORM }]);
  const [touchedFields, setTouchedFields] = useState({});
  const [submitAttempted, setSubmitAttempted] = useState(false);
  const personFieldRefs = useRef({});

  const managerDetails = useMemo(() => {
    const nameParts = (profile?.full_name || '').trim().split(/\s+/).filter(Boolean);
    const club = user?.user_metadata?.club;
    return {
      firstName: nameParts[0] || '',
      lastName: nameParts.slice(1).join(' ') || '',
      email: profile?.email || user?.email || '',
      club: typeof club === 'string' ? club.trim() : '',
    };
  }, [profile, user]);

  const personFieldIds = (index) => ({
    first: `${formId}-person-${index}-first`,
    last: `${formId}-person-${index}-last`,
    email: `${formId}-person-${index}-email`,
    location: `${formId}-person-${index}-location`,
    notes: `${formId}-person-${index}-notes`,
  });

  const personValidation = useMemo(
    () => validatePersonForms(personForms),
    [personForms],
  );

  const touchKey = (index, field) => `${index}.${field}`;

  const shouldShowFieldError = (index, field) =>
    submitAttempted || Boolean(touchedFields[touchKey(index, field)]);

  const getFieldError = (index, field) => {
    if (!shouldShowFieldError(index, field)) return '';
    return personValidation.errorsByRow[index]?.[field] || '';
  };

  const setPersonFieldRef = (index, field, node) => {
    personFieldRefs.current[touchKey(index, field)] = node;
  };

  const ids = {
    managerFirst: `${formId}-manager-first`,
    managerLast: `${formId}-manager-last`,
    managerEmail: `${formId}-manager-email`,
    managerClub: `${formId}-manager-club`,
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
    setPersonForms(normalizePersonFormsFromDraft(draft));
    if (draft.action) setAction(draft.action);
    if (typeof draft.searchInput === 'string') setSearchInput(draft.searchInput);
  }, [user?.id, submitted]);

  useEffect(() => {
    if (!user?.id || submitted) return undefined;

    const persistDraft = () => {
      const hasContent =
        personForms.some((person) => Object.values(person).some((v) => String(v).trim())) ||
        searchInput.trim();

      if (!hasContent) {
        clearManagerFormDraft(user.id);
        return;
      }

      writeManagerFormDraft(user.id, {
        personForms,
        action,
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
  }, [user?.id, personForms, action, searchInput, submitted]);

  const handlePersonChange = (index, field, val) => {
    const sanitized = sanitizePersonFieldInput(field, val);
    setPersonForms((prev) =>
      prev.map((person, rowIndex) =>
        rowIndex === index ? { ...person, [field]: sanitized } : person,
      ),
    );
  };

  const handlePersonBlur = (index, field) => {
    setTouchedFields((prev) => ({ ...prev, [touchKey(index, field)]: true }));
    if (field === 'email') {
      setPersonForms((prev) =>
        prev.map((person, rowIndex) =>
          rowIndex === index
            ? { ...person, email: person.email.trim().toLowerCase() }
            : person,
        ),
      );
    }
  };

  const handleAddPersonRow = () => {
    setPersonForms((prev) => {
      if (prev.length >= MAX_MANAGER_PERSON_ROWS) return prev;
      return [...prev, { ...EMPTY_PERSON_FORM }];
    });
  };

  const handleRemovePersonRow = (index) => {
    setPersonForms((prev) => {
      if (prev.length <= 1) return prev;
      return prev.filter((_, rowIndex) => rowIndex !== index);
    });
  };

  const isFormValid = useMemo(
    () =>
      managerDetails.firstName.trim() !== '' &&
      managerDetails.lastName.trim() !== '' &&
      managerDetails.email.trim() !== '' &&
      managerDetails.club.trim() !== '' &&
      personForms.length > 0 &&
      personValidation.ok,
    [managerDetails, personForms.length, personValidation.ok],
  );

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitAttempted(true);

    const validation = validatePersonForms(personForms);
    if (
      !managerDetails.firstName.trim() ||
      !managerDetails.lastName.trim() ||
      !managerDetails.email.trim() ||
      !managerDetails.club.trim() ||
      !validation.ok
    ) {
      const firstInvalid = firstInvalidPersonField(validation.errorsByRow);
      if (firstInvalid) {
        const ref = personFieldRefs.current[touchKey(firstInvalid.rowIndex, firstInvalid.field)];
        ref?.focus?.();
        ref?.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
        showToast(firstInvalid.message, 'error');
      } else {
        showToast('Fill all required fields to submit.', 'error');
      }
      return;
    }

    if (submitting) return;

    const normalizedPeople = validation.normalizedForms;

    setSubmitting(true);
    try {
      const endpoint =
        normalizedPeople.length === 1 ? '/api/requests' : '/api/requests/batch';
      const body =
        normalizedPeople.length === 1
          ? {
              submittedBy: managerDetails,
              person: {
                firstName: normalizedPeople[0].firstName,
                lastName: normalizedPeople[0].lastName,
                email: normalizedPeople[0].email,
                location: normalizedPeople[0].location,
              },
              action,
              notes: normalizedPeople[0].notes?.trim() || undefined,
            }
          : {
              submittedBy: managerDetails,
              people: normalizedPeople.map(({ firstName, lastName, email, location, notes }) => ({
                firstName,
                lastName,
                email,
                location,
                notes: notes?.trim() || undefined,
              })),
              action,
            };

      if (normalizedPeople.length === 1) {
        await fetchJson(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
      } else {
        const queued = await fetchJson(endpoint, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (queued?.status === 'pending' || queued?.status === 'processing') {
          showToast('Processing your requests…', 'success');
          await waitForSubmissionJob(queued.jobId);
        } else if (queued?.status === 'failed') {
          throw new Error(queued.error || 'Could not process your batch submission.');
        }
      }

      const count = normalizedPeople.length;
      showToast(
        count === 1 ? 'Request submitted.' : `${count} requests submitted.`,
        'success',
      );
      if (user?.id) clearManagerFormDraft(user.id);
      clearCache('manager_requests_all');
      clearCache('manager_requests_summary');
      setSubmittedCount(count);
      setRequestRefreshToken((token) => token + 1);
      setSearchInput('');
      setPersonForms([{ ...EMPTY_PERSON_FORM }]);
      setTouchedFields({});
      setSubmitAttempted(false);
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

  const handleStartAnotherRequest = () => {
    setSubmitted(false);
    setSubmittedCount(1);
    setPersonForms([{ ...EMPTY_PERSON_FORM }]);
    setTouchedFields({});
    setSubmitAttempted(false);
    setSearchInput('');
    setAction('Add');
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

  const formMatchResults = useMemo(() => {
    const byId = new Map();

    for (const personForm of personForms) {
      for (const row of findFormMatchCandidates(directoryPeople, personForm)) {
        if (!row?.id) continue;
        const existing = byId.get(row.id);
        const reasons = new Set([
          ...(existing?.matchReasons || []),
          ...(row.matchReasons || []),
        ]);
        byId.set(row.id, {
          ...(existing || {}),
          ...row,
          matchReasons: [...reasons],
        });
      }
    }

    return Array.from(byId.values());
  }, [directoryPeople, personForms]);

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
    !submitted &&
    (hasSearchQuery ||
      formMatchResults.length > 0 ||
      personForms.some(formHasMatchCriteria));
  const showInitialDirectoryLoading = directoryLoading && directoryPeople.length === 0;
  const multipleUsers = personForms.length > 1;
  const userSectionTitle =
    action === 'Add'
      ? multipleUsers
        ? 'Users to add'
        : 'User to add'
      : multipleUsers
        ? 'Users to remove'
        : 'User to remove';
  const actionOptions = [
    { value: 'Add', label: 'Request addition', icon: UserPlus },
    { value: 'Remove', label: 'Request removal', icon: UserMinus },
  ];
  const isRemoveAction = action === 'Remove';
  const directoryPanelTitle = isRemoveAction ? 'Removed users' : 'Existing Users';
  const directoryPanelDescription = isRemoveAction
    ? 'Search removed users by name or email. Person details on the form are checked automatically.'
    : 'Search by name or email. Person details on the form are checked automatically.';
  const directoryDateColumnLabel = isRemoveAction ? 'Removed' : 'Added';
  const directoryLoadingLabel = isRemoveAction ? 'Loading removed users…' : 'Loading directory…';
  const directoryFooterText = isRemoveAction
    ? 'Rows that share any name, email, or location detail with your form are also listed here from removed users.'
    : 'Rows that share any name, email, or location detail with your form are also listed here.';

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
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between gap-3 px-4 sm:gap-4 sm:px-6">
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
              aria-label={signingOut ? 'Signing out' : 'Sign out'}
              className="inline-flex h-8 items-center gap-1.5 rounded-lg bg-[var(--color-brand-primary)] px-2.5 text-xs font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-surface-sidebar-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]/35 focus-visible:ring-offset-1 disabled:cursor-not-allowed disabled:opacity-50 sm:px-3"
            >
              <LogOut className="h-3.5 w-3.5" aria-hidden="true" />
              <span className="hidden min-[420px]:inline">{signingOut ? 'Signing out…' : 'Sign out'}</span>
            </button>
          </div>
        </div>
      </header>

      <main className="mx-auto flex w-full max-w-[1400px] flex-1 flex-col gap-4 p-4 sm:gap-6 sm:p-6 md:flex-row md:items-start md:p-8">
        <section className="flex w-full min-w-0 flex-col md:w-[44%] lg:w-[42%]">
          {submitted ? (
            <div
              className={`${cardClass} flex flex-1 flex-col items-center justify-center p-6 text-center sm:p-10`}
            >
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-50">
                <CheckCircle2 className="h-7 w-7 text-[var(--color-signal-green)]" aria-hidden="true" />
              </div>
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                {submittedCount === 1
                  ? 'Request submitted successfully'
                  : `${submittedCount} requests submitted successfully`}
              </h2>
              <p className="mt-1.5 text-sm text-[var(--color-text-secondary)]">
                Power Music admin will action {submittedCount === 1 ? 'this' : 'these'} shortly.
                Open <span className="font-medium text-[var(--color-text-primary)]">Your requests</span> to track progress.
              </p>
              <button
                type="button"
                onClick={handleStartAnotherRequest}
                className="mt-8 flex h-11 w-full max-w-xs items-center justify-center gap-2 rounded-lg bg-[var(--color-brand-primary)] px-6 text-sm font-semibold text-white shadow-sm transition-colors hover:bg-[var(--color-surface-sidebar-hover)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]/35 focus-visible:ring-offset-1"
              >
                Submit another request
              </button>
            </div>
          ) : (
            <form
              id="manager-request-form"
              onSubmit={handleSubmit}
              className={`${cardClass} space-y-5 p-4 sm:p-6`}
            >
              <div className="space-y-4 border-b border-[var(--color-border-default)] pb-5">
                <div
                  role="radiogroup"
                  aria-labelledby={actionGroupId}
                  className="mx-auto flex w-full max-w-md flex-col gap-1 rounded-lg bg-[var(--color-surface-panel)] p-1 ring-1 ring-[var(--color-border-default)] sm:flex-row sm:gap-0 sm:p-0.5"
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
                        className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-md px-3 py-2.5 text-xs font-semibold transition-all focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]/30 focus-visible:ring-offset-1 sm:py-2 sm:text-sm ${
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
                    {action === 'Add'
                      ? multipleUsers
                        ? 'Add users'
                        : 'Add a user'
                      : multipleUsers
                        ? 'Remove users'
                        : 'Remove a user'}
                  </h1>
                  <p className="mt-1 text-xs text-[var(--color-text-secondary)]">
                    {action === 'Add'
                      ? multipleUsers
                        ? 'Ask Power Music to add several people in one submission.'
                        : 'Ask Power Music to add someone to the system.'
                      : multipleUsers
                        ? 'Ask Power Music to remove several people in one submission.'
                        : 'Ask Power Music to remove someone from the system.'}
                  </p>
                </div>
              </div>

              <FormSection title="Manager details">
                <p className="-mt-1 text-[11px] text-[var(--color-text-secondary)]">
                  Taken from your signed-in account and cannot be changed here.
                </p>
                <div className={formGridClass}>
                  <Field id={ids.managerFirst} label="Manager first name" required>
                    <input
                      id={ids.managerFirst}
                      type="text"
                      required
                      readOnly
                      aria-readonly="true"
                      autoComplete="given-name"
                      value={managerDetails.firstName}
                      className={readonlyInputClass}
                    />
                  </Field>
                  <Field id={ids.managerLast} label="Manager last name" required>
                    <input
                      id={ids.managerLast}
                      type="text"
                      required
                      readOnly
                      aria-readonly="true"
                      autoComplete="family-name"
                      value={managerDetails.lastName}
                      className={readonlyInputClass}
                    />
                  </Field>
                </div>
                <div className={formGridClass}>
                  <Field id={ids.managerEmail} label="Manager email" required>
                    <input
                      id={ids.managerEmail}
                      type="email"
                      required
                      readOnly
                      aria-readonly="true"
                      autoComplete="email"
                      value={managerDetails.email}
                      className={readonlyInputClass}
                    />
                  </Field>
                  <Field id={ids.managerClub} label="Manager club location" required>
                    <input
                      id={ids.managerClub}
                      type="text"
                      required
                      readOnly
                      aria-readonly="true"
                      autoComplete="organization"
                      value={managerDetails.club}
                      className={readonlyInputClass}
                    />
                  </Field>
                </div>
              </FormSection>

              <FormSection title={userSectionTitle}>
                <div className="space-y-4">
                  {personForms.map((personForm, index) => {
                    const rowIds = personFieldIds(index);
                    const rowMatches = findFormMatchCandidates(directoryPeople, personForm);
                    const showRowLabel = personForms.length > 1;

                    return (
                      <div
                        key={`person-row-${index}`}
                        className={
                          showRowLabel
                            ? 'space-y-3 rounded-lg border border-[var(--color-border-default)] bg-[var(--color-surface-panel)]/40 p-3'
                            : 'space-y-3'
                        }
                      >
                        {showRowLabel && (
                          <div className="flex items-center justify-between gap-2">
                            <p className="text-[11px] font-semibold text-[var(--color-text-secondary)]">
                              User {index + 1}
                            </p>
                            <button
                              type="button"
                              onClick={() => handleRemovePersonRow(index)}
                              className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-[11px] font-medium text-[var(--color-text-secondary)] transition-colors hover:bg-white hover:text-[var(--color-tag-remove-action-text)] focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]/30"
                            >
                              <Trash2 className="h-3.5 w-3.5" aria-hidden="true" />
                              Remove
                            </button>
                          </div>
                        )}
                        <div className={formGridClass}>
                          <Field
                            id={rowIds.first}
                            label="User first name"
                            required
                            error={getFieldError(index, 'firstName')}
                          >
                            {({ errorId, describedBy, invalid }) => (
                              <input
                                ref={(node) => setPersonFieldRef(index, 'firstName', node)}
                                id={rowIds.first}
                                type="text"
                                required
                                autoComplete="given-name"
                                spellCheck={false}
                                maxLength={PERSON_FIELD_LIMITS.firstName}
                                value={personForm.firstName}
                                onChange={(e) =>
                                  handlePersonChange(index, 'firstName', e.target.value)
                                }
                                onBlur={() => handlePersonBlur(index, 'firstName')}
                                aria-invalid={invalid || undefined}
                                aria-describedby={describedBy}
                                className={`${inputClass}${invalid ? ` ${invalidInputClass}` : ''}`}
                              />
                            )}
                          </Field>
                          <Field
                            id={rowIds.last}
                            label="User last name"
                            required
                            error={getFieldError(index, 'lastName')}
                          >
                            {({ errorId, describedBy, invalid }) => (
                              <input
                                ref={(node) => setPersonFieldRef(index, 'lastName', node)}
                                id={rowIds.last}
                                type="text"
                                required
                                autoComplete="family-name"
                                spellCheck={false}
                                maxLength={PERSON_FIELD_LIMITS.lastName}
                                value={personForm.lastName}
                                onChange={(e) =>
                                  handlePersonChange(index, 'lastName', e.target.value)
                                }
                                onBlur={() => handlePersonBlur(index, 'lastName')}
                                aria-invalid={invalid || undefined}
                                aria-describedby={describedBy}
                                className={`${inputClass}${invalid ? ` ${invalidInputClass}` : ''}`}
                              />
                            )}
                          </Field>
                        </div>
                        <div className={formGridClass}>
                          <Field
                            id={rowIds.email}
                            label="User email"
                            required
                            error={getFieldError(index, 'email')}
                          >
                            {({ describedBy, invalid }) => (
                              <input
                                ref={(node) => setPersonFieldRef(index, 'email', node)}
                                id={rowIds.email}
                                type="email"
                                required
                                inputMode="email"
                                autoComplete="email"
                                autoCapitalize="none"
                                autoCorrect="off"
                                spellCheck={false}
                                maxLength={PERSON_FIELD_LIMITS.email}
                                value={personForm.email}
                                onChange={(e) => handlePersonChange(index, 'email', e.target.value)}
                                onBlur={() => handlePersonBlur(index, 'email')}
                                aria-invalid={invalid || undefined}
                                aria-describedby={describedBy}
                                className={`${inputClass}${invalid ? ` ${invalidInputClass}` : ''}`}
                              />
                            )}
                          </Field>
                          <Field
                            id={rowIds.location}
                            label="User location"
                            required
                            error={getFieldError(index, 'location')}
                          >
                            {({ describedBy, invalid }) => (
                              <input
                                ref={(node) => setPersonFieldRef(index, 'location', node)}
                                id={rowIds.location}
                                type="text"
                                required
                                autoComplete="organization"
                                maxLength={PERSON_FIELD_LIMITS.location}
                                value={personForm.location}
                                onChange={(e) =>
                                  handlePersonChange(index, 'location', e.target.value)
                                }
                                onBlur={() => handlePersonBlur(index, 'location')}
                                aria-invalid={invalid || undefined}
                                aria-describedby={describedBy}
                                className={`${inputClass}${invalid ? ` ${invalidInputClass}` : ''}`}
                              />
                            )}
                          </Field>
                        </div>

                        {rowMatches.length > 0 && (
                          <div
                            role="alert"
                            className="flex gap-2.5 rounded-lg border border-amber-200 bg-[var(--color-tag-already-exists-bg)] px-3.5 py-3 text-xs text-[var(--color-tag-already-exists-text)]"
                          >
                            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                            <div className="space-y-1">
                              <p className="font-semibold">
                                {showRowLabel ? `User ${index + 1}: ` : ''}
                                {rowMatches.length === 1
                                  ? isRemoveAction
                                    ? 'This person may already be removed from the system.'
                                    : 'This person may already be in the system.'
                                  : `${rowMatches.length} possible matches found in the ${isRemoveAction ? 'removed users' : 'directory'}.`}
                              </p>
                              <p className="opacity-90">
                                Please review before submitting. You can still proceed.
                              </p>
                            </div>
                          </div>
                        )}

                        <Field
                          id={rowIds.notes}
                          label={
                            showRowLabel
                              ? `Additional notes for User ${index + 1} (optional)`
                              : 'Additional notes for this request (optional)'
                          }
                          error={getFieldError(index, 'notes')}
                        >
                          {({ describedBy, invalid }) => (
                            <textarea
                              ref={(node) => setPersonFieldRef(index, 'notes', node)}
                              id={rowIds.notes}
                              value={personForm.notes}
                              onChange={(e) => handlePersonChange(index, 'notes', e.target.value)}
                              onBlur={() => handlePersonBlur(index, 'notes')}
                              placeholder="Any additional information for this request..."
                              rows={2}
                              maxLength={PERSON_FIELD_LIMITS.notes}
                              aria-invalid={invalid || undefined}
                              aria-describedby={describedBy}
                              className={`${textareaClass}${invalid ? ` ${invalidInputClass}` : ''}`}
                            />
                          )}
                        </Field>
                      </div>
                    );
                  })}
                </div>

                {personForms.length < MAX_MANAGER_PERSON_ROWS && (
                  <button
                    type="button"
                    onClick={handleAddPersonRow}
                    className="inline-flex h-9 items-center gap-1.5 rounded-lg border border-dashed border-[var(--color-border-default)] px-3 text-xs font-semibold text-[var(--color-brand-primary)] transition-colors hover:border-[var(--color-brand-primary)] hover:bg-[var(--color-brand-primary)]/5 focus:outline-none focus-visible:ring-2 focus-visible:ring-[var(--color-brand-primary)]/30"
                  >
                    <Plus className="h-3.5 w-3.5" aria-hidden="true" />
                    Add another user
                  </button>
                )}
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
                  ) : personForms.length === 1 ? (
                    'Submit request'
                  ) : (
                    `Submit ${personForms.length} requests`
                  )}
                </button>
                {!isFormValid && (
                  <p className="text-center text-[11px] text-[var(--color-text-muted)]">
                    {submitAttempted
                      ? 'Fix the highlighted fields to submit.'
                      : 'Fill all required fields with valid details to submit.'}
                  </p>
                )}
              </div>
            </form>
          )}
        </section>

        <aside
          className={`${cardClass} flex w-full min-w-0 flex-col gap-4 self-start p-4 sm:gap-5 sm:p-5 md:w-[56%] md:p-6 lg:w-[58%]`}
        >
          <ManagerRequestHistory refreshToken={requestRefreshToken} />

          <section aria-labelledby="directory-search-heading" className="space-y-4">
          <div>
            <h2
              id="directory-search-heading"
              className="text-base font-semibold text-[var(--color-text-primary)]"
            >
              {directoryPanelTitle}
            </h2>
            <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">
              {directoryPanelDescription}
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
              disabled={submitted}
              aria-label="Search by name or email"
              className={`${inputClass} pl-9`}
            />
          </div>

          {searchQueryHint && !submitted && (
            <p className="text-[11px] leading-relaxed text-[var(--color-text-secondary)]" role="status">
              {searchQueryHint}
            </p>
          )}

          <div className="overflow-hidden rounded-lg border border-[var(--color-border-default)] sm:hidden">
            {!showDirectoryResults && !showInitialDirectoryLoading && !isSearchTooBroad && (
              <p className="px-3 py-8 text-center text-xs text-[var(--color-text-muted)]">
                Type at least 2 characters to search, or enter person details to check for matches.
              </p>
            )}
            {showInitialDirectoryLoading && (
              <p className="flex items-center justify-center gap-2 px-3 py-8 text-xs text-[var(--color-text-muted)]">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {directoryLoadingLabel}
              </p>
            )}
            {!showInitialDirectoryLoading && directoryError && displayResults.length === 0 && (
              <p className="px-3 py-8 text-center text-xs text-red-600">{directoryError}</p>
            )}
            {isSearchTooBroad && !showInitialDirectoryLoading && displayResults.length === 0 && (
              <p className="px-3 py-8 text-center text-xs text-[var(--color-text-muted)]">
                Nothing matched that search. Try a name or email address.
              </p>
            )}
            {!showInitialDirectoryLoading &&
              !directoryError &&
              showDirectoryResults &&
              !isSearchTooBroad &&
              displayResults.length === 0 && (
                <p className="px-3 py-8 text-center text-xs text-[var(--color-text-muted)]">
                  No one matched that search.
                </p>
              )}
            {!submitted && !showInitialDirectoryLoading && displayResults.length > 0 && (
              <ul className="divide-y divide-[var(--color-border-default)]">
                {displayResults.map((row) => {
                  const isMatch = directoryRowMatchesForm(row);
                  const isAdded = row.status === 'Added';
                  const dateLabel = formatDirectoryDate(row.dateAdded);

                  return (
                    <li
                      key={row.id}
                      className={`px-3 py-3 ${isMatch ? (isAdded ? 'bg-emerald-50/80' : 'bg-red-50/80') : ''}`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className={`truncate text-sm font-medium ${isMatch ? 'font-semibold' : ''}`}>
                            {row.firstName} {row.lastName}
                          </p>
                          {row.email && (
                            <p className="mt-0.5 truncate text-xs text-[var(--color-text-secondary)]">{row.email}</p>
                          )}
                          {row.location && (
                            <p className="mt-0.5 truncate text-[11px] text-[var(--color-text-muted)]">{row.location}</p>
                          )}
                        </div>
                        <span
                          className={`inline-flex shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                            isAdded
                              ? 'bg-[var(--color-tag-added-bg)] text-[var(--color-tag-added-text)]'
                              : 'bg-[var(--color-tag-removed-bg)] text-[var(--color-tag-removed-text)]'
                          }`}
                        >
                          {row.status}
                        </span>
                      </div>
                      {dateLabel && (
                        <p className="mt-2 text-[11px] text-[var(--color-text-muted)]">
                          {directoryDateColumnLabel}: {dateLabel}
                        </p>
                      )}
                    </li>
                  );
                })}
              </ul>
            )}
          </div>

          <div className="hidden overflow-hidden rounded-lg border border-[var(--color-border-default)] sm:block">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[520px] table-fixed border-collapse text-left text-xs">
                <caption className="sr-only">
                  {isRemoveAction ? 'Removed users search results' : 'Directory search results'}
                </caption>
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
                      {directoryDateColumnLabel}
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
                          {directoryLoadingLabel}
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
                  {!submitted &&
                    !showInitialDirectoryLoading &&
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
            {directoryFooterText}
          </p>
          </section>
        </aside>
      </main>
    </div>
  );
}
