import { useState, useMemo, useEffect } from 'react';
import { Zap, CheckCircle, Search } from 'lucide-react';
import { format, parseISO } from 'date-fns';
import { directoryData } from '../data/mockData';
import { Toast, useToast } from '../components/ui';
import { getApiUrl } from '../utils/api';

export default function ManagerForm() {
  const { showToast } = useToast();
  const [liveDirectoryData, setLiveDirectoryData] = useState([]);

  useEffect(() => {
    fetch(getApiUrl('/api/persons'))
      .then((res) => res.json())
      .then((data) => setLiveDirectoryData(data))
      .catch((err) => console.error(err));
  }, []);

  const [submitted, setSubmitted] = useState(false);
  const [action, setAction] = useState('Add');
  const [notes, setNotes] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // Manager state
  const [managerForm, setManagerForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    club: ''
  });

  // Person state
  const [personForm, setPersonForm] = useState({
    firstName: '',
    lastName: '',
    email: '',
    location: ''
  });

  // Duplicate Check logic — match either Added or Removed
  const duplicateMatch = useMemo(() => {
    const email = personForm.email.trim().toLowerCase();
    const first = personForm.firstName.trim().toLowerCase();
    const last = personForm.lastName.trim().toLowerCase();

    if (!email && (!first || !last)) return null;

    return liveDirectoryData.find((record) => {
      const emailMatch = email !== '' && record.email.toLowerCase() === email;
      const nameMatch =
        first !== '' &&
        last !== '' &&
        record.firstName.toLowerCase() === first &&
        record.lastName.toLowerCase() === last;

      return emailMatch || nameMatch;
    });
  }, [personForm]);

  // Manager details input handlers
  const handleManagerChange = (field, val) => {
    setManagerForm((prev) => ({ ...prev, [field]: val }));
  };

  // Person details input handlers
  const handlePersonChange = (field, val) => {
    setPersonForm((prev) => ({ ...prev, [field]: val }));
  };

  // Manager email domain validation — must be @puregym.com
  const managerEmailValid = useMemo(() => {
    const email = managerForm.email.trim();
    if (email === '') return true; // don't show error until something is typed
    return email.toLowerCase().endsWith('@puregym.com');
  }, [managerForm.email]);

  // Submit check
  const isFormValid = useMemo(() => {
    return (
      managerForm.firstName.trim() !== '' &&
      managerForm.lastName.trim() !== '' &&
      managerForm.email.trim() !== '' &&
      managerEmailValid &&
      managerForm.club.trim() !== '' &&
      personForm.firstName.trim() !== '' &&
      personForm.lastName.trim() !== '' &&
      personForm.email.trim() !== '' &&
      personForm.location.trim() !== ''
    );
  }, [managerForm, personForm, managerEmailValid]);

  // Form submit trigger
  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!isFormValid) return;

    try {
      const response = await fetch(getApiUrl('/api/requests'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          submittedBy: managerForm,
          person: personForm,
          action: action,
          notes: notes
        })
      });
      if (!response.ok) throw new Error('Failed to submit request');

      // Toast and set success state
      showToast('Request submitted.', 'success');
      setSubmitted(true);
    } catch (err) {
      console.error(err);
      showToast('Failed to submit request.', 'error');
    }
  };

  // Live search lookup
  const filteredUsers = useMemo(() => {
    const query = searchInput.trim().toLowerCase();
    if (query === '') {
      return liveDirectoryData.slice(0, 4);
    }
    return liveDirectoryData
      .filter(
        (record) =>
          record.firstName.toLowerCase().includes(query) ||
          record.lastName.toLowerCase().includes(query) ||
          record.email.toLowerCase().includes(query)
      )
      .slice(0, 5);
  }, [searchInput]);

  const formatDate = (dateStr) => {
    try {
      return format(parseISO(dateStr), 'dd MMM yyyy');
    } catch {
      return dateStr;
    }
  };

  return (
    <div className="min-h-screen bg-[var(--color-surface-bg)] flex flex-col antialiased font-sans select-none">
      <Toast />
      
      {/* Standalone Header */}
      <header className="h-14 bg-white border-b border-[var(--color-border-default)] flex items-center px-6 shrink-0 z-10">
        <div className="flex items-center gap-2">
          <Zap className="w-5 h-5 text-[var(--color-brand-accent)] fill-[var(--color-brand-accent)]" />
          <span className="text-[15px] font-bold text-[var(--color-text-primary)] tracking-wide">
            Power Music
          </span>
        </div>
      </header>

      {/* Main Column Containers */}
      <main className="flex-1 w-full max-w-[1100px] mx-auto p-6 md:p-8 flex flex-col md:flex-row gap-8">
        
        {/* LEFT COLUMN: Submit a Request */}
        <section className="w-full md:w-[55%] flex flex-col">
          {submitted ? (
            /* Success confirmation screen */
            <div className="flex-1 bg-white border border-[var(--color-border-default)] rounded-lg p-10 flex flex-col items-center justify-center text-center shadow-[var(--shadow-card)] my-auto">
              <CheckCircle className="w-12 h-12 text-[var(--color-signal-green)] mb-4 animate-bounce" />
              <h2 className="text-lg font-bold text-[var(--color-text-primary)]">
                Request submitted successfully.
              </h2>
              <p className="text-sm text-[var(--color-text-secondary)] mt-1.5 font-medium">
                A Power Music admin will action this shortly.
              </p>
              <span className="text-xs text-[var(--color-text-muted)] mt-6">
                You can close this window.
              </span>
            </div>
          ) : (
            /* Form Fields */
            <form onSubmit={handleSubmit} className="bg-white border border-[var(--color-border-default)] rounded-lg shadow-[var(--shadow-card)] p-6 space-y-6">
              {/* Top Toggle & Dynamic Title */}
              <div className="flex flex-col gap-4 border-b border-[var(--color-border-default)] pb-4">
                <div className="flex items-center bg-white rounded-lg p-0.5 gap-0.5 ring-1 ring-[rgba(26,26,46,0.08)] shadow-sm w-fit">
                  {[['Add', 'Add'], ['Remove', 'Remove']].map(([val, label]) => (
                    <button
                      key={val}
                      type="button"
                      onClick={() => setAction(val)}
                      className={`px-4 py-1.5 rounded-md text-sm font-semibold transition-all cursor-pointer ${
                        action === val
                          ? val === 'Add'
                            ? 'bg-[var(--color-tag-add-action-bg)] text-[var(--color-tag-add-action-text)] shadow-sm'
                            : 'bg-[var(--color-tag-remove-action-bg)] text-[var(--color-tag-remove-action-text)] shadow-sm'
                          : 'text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)]'
                      }`}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <div>
                  <h2 className="text-[15px] font-bold text-[var(--color-text-primary)]">
                    {action === 'Add' ? 'Add a Person' : 'Remove a Person'}
                  </h2>
                  <p className="text-xs text-[var(--color-text-secondary)] mt-1 font-medium">
                    {action === 'Add'
                      ? 'Submit a request to add a new person to the system.'
                      : 'Submit a request to remove an existing person from the system.'}
                  </p>
                </div>
              </div>

              {/* Section 1: YOUR DETAILS */}
              <div className="space-y-4">
                <span className="block text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                  Your Details (Manager)
                </span>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
                      First Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={managerForm.firstName}
                      onChange={(e) => handleManagerChange('firstName', e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-[var(--color-border-default)] rounded-md text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-focus)] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={managerForm.lastName}
                      onChange={(e) => handleManagerChange('lastName', e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-[var(--color-border-default)] rounded-md text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-focus)] transition-colors"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
                      Email *
                    </label>
                    <input
                      type="email"
                      required
                      value={managerForm.email}
                      onChange={(e) => handleManagerChange('email', e.target.value)}
                      className={`w-full px-3 py-1.5 bg-white border rounded-md text-sm text-[var(--color-text-primary)] focus:outline-none transition-colors ${
                        !managerEmailValid && managerForm.email.trim() !== ''
                          ? 'border-red-400 focus:border-red-500 bg-red-50'
                          : 'border-[var(--color-border-default)] focus:border-[var(--color-border-focus)]'
                      }`}
                    />
                    {!managerEmailValid && managerForm.email.trim() !== '' && (
                      <p className="mt-1 text-[11px] font-medium text-red-600 leading-snug">
                        Manager email address must use a @puregym.com domain. Other domains are not permitted.
                      </p>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
                      Club Location *
                    </label>
                    <input
                      type="text"
                      required
                      value={managerForm.club}
                      onChange={(e) => handleManagerChange('club', e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-[var(--color-border-default)] rounded-md text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-focus)] transition-colors"
                    />
                  </div>
                </div>
              </div>

              {/* Section 2: PERSON TO ADD / REMOVE — label is dynamic */}
              <div className="space-y-4">
                <span className="block text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                  {action === 'Add' ? 'Person to add' : 'Person to remove'}
                </span>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
                      First Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={personForm.firstName}
                      onChange={(e) => handlePersonChange('firstName', e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-[var(--color-border-default)] rounded-md text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-focus)] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
                      Last Name *
                    </label>
                    <input
                      type="text"
                      required
                      value={personForm.lastName}
                      onChange={(e) => handlePersonChange('lastName', e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-[var(--color-border-default)] rounded-md text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-focus)] transition-colors"
                    />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
                      Email *
                    </label>
                    <input
                      type="email"
                      required
                      value={personForm.email}
                      onChange={(e) => handlePersonChange('email', e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-[var(--color-border-default)] rounded-md text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-focus)] transition-colors"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-[var(--color-text-secondary)] mb-1">
                      Location *
                    </label>
                    <input
                      type="text"
                      required
                      value={personForm.location}
                      onChange={(e) => handlePersonChange('location', e.target.value)}
                      className="w-full px-3 py-1.5 bg-white border border-[var(--color-border-default)] rounded-md text-sm text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-border-focus)] transition-colors"
                    />
                  </div>
                </div>

                {/* Duplicate match warning block */}
                {duplicateMatch && (
                  <div className={`border border-l-4 rounded-md p-4 space-y-1 animate-fade-in text-left ${
                    duplicateMatch.status === 'Removed'
                      ? 'bg-[#fee2e2] border-red-300 border-l-red-500'
                      : 'bg-[#fef3c7] border-amber-300 border-l-[var(--color-already-exists-border)]'
                  }`}>
                    <span className={`block text-sm font-semibold ${
                      duplicateMatch.status === 'Removed' ? 'text-[#991b1b]' : 'text-[#92400e]'
                    }`}>
                      {duplicateMatch.status === 'Removed' ? '🔴' : '⚠️'} This person may already be in the system.
                    </span>
                    <span className={`block text-xs font-medium ${
                      duplicateMatch.status === 'Removed' ? 'text-red-800' : 'text-amber-800'
                    }`}>
                      {duplicateMatch.firstName} {duplicateMatch.lastName} · {duplicateMatch.email} · {duplicateMatch.location}
                    </span>
                    <span className={`block text-xs font-medium ${
                      duplicateMatch.status === 'Removed' ? 'text-red-800' : 'text-amber-800'
                    }`}>
                      Status: <strong>{duplicateMatch.status}</strong> · {duplicateMatch.status === 'Removed' ? 'Removed on' : 'Added on'} {formatDate(duplicateMatch.dateAdded)}
                    </span>
                    <span className={`block text-[11px] font-medium pt-1 ${
                      duplicateMatch.status === 'Removed' ? 'text-red-700' : 'text-amber-700'
                    }`}>
                      Please review before submitting. You can still proceed.
                    </span>
                  </div>
                )}
              </div>



              {/* Section 4: ADDITIONAL NOTES */}
              <div className="space-y-2">
                <span className="block text-[11px] font-semibold text-[var(--color-text-secondary)] uppercase tracking-wider">
                  Additional Notes (optional)
                </span>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="Any additional information for the admin..."
                  className="w-full h-20 px-3 py-1.5 bg-white border border-[var(--color-border-default)] rounded-md text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-border-focus)] transition-colors resize-none"
                />
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                disabled={!isFormValid}
                className={`w-full h-11 flex items-center justify-center font-semibold text-white rounded-md transition-all shadow-[var(--shadow-card)] ${
                  isFormValid
                    ? 'bg-[var(--color-brand-primary)] hover:bg-[var(--color-surface-sidebar-hover)] cursor-pointer'
                    : 'bg-gray-300 cursor-not-allowed'
                }`}
              >
                Submit Request
              </button>
            </form>
          )}
        </section>

        {/* RIGHT COLUMN: Existing Users */}
        <section className="w-full md:w-[45%] bg-white border border-[var(--color-border-default)] rounded-lg shadow-[var(--shadow-card)] p-6 flex flex-col space-y-4 self-start">
          <div>
            <h2 className="text-[15px] font-bold text-[var(--color-text-primary)]">
              Existing Users
            </h2>
            <p className="text-xs text-[var(--color-text-secondary)] font-medium mt-0.5">
              Search to check before submitting.
            </p>
          </div>

          {/* Search Box */}
          <div className="relative">
            <span className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
              <Search className="h-4 w-4 text-[var(--color-text-secondary)]" />
            </span>
            <input
              type="text"
              placeholder="Search by name or email..."
              value={searchInput}
              onChange={(e) => setSearchInput(e.target.value)}
              className="block w-full pl-9 pr-3 py-1.5 bg-white border border-[var(--color-border-default)] rounded-md text-sm text-[var(--color-text-primary)] placeholder-[var(--color-text-muted)] focus:outline-none focus:border-[var(--color-border-focus)] transition-colors"
            />
          </div>

          {/* Results Table */}
          <div className="overflow-x-auto">
            <table className="w-full border-collapse text-left text-xs">
              <thead>
                <tr className="border-b border-[var(--color-border-default)]">
                  <th className="py-2.5 font-semibold text-[var(--color-text-secondary)] uppercase">Name</th>
                  <th className="py-2.5 font-semibold text-[var(--color-text-secondary)] uppercase">Email</th>
                  <th className="py-2.5 font-semibold text-[var(--color-text-secondary)] uppercase">Location</th>
                  <th className="py-2.5 font-semibold text-[var(--color-text-secondary)] uppercase">Status</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--color-border-default)] font-medium">
                {filteredUsers.map((user) => {
                  const isPersonMatch =
                    personForm.firstName.trim().toLowerCase() === user.firstName.toLowerCase() &&
                    personForm.lastName.trim().toLowerCase() === user.lastName.toLowerCase() &&
                    personForm.firstName.trim() !== '';
                  const isEmailMatch =
                    personForm.email.trim().toLowerCase() === user.email.toLowerCase() &&
                    personForm.email.trim() !== '';
                  const isMatch = isPersonMatch || isEmailMatch;
                  return (
                    <tr key={user.id} className={`text-[var(--color-text-primary)] transition-colors ${
                      isMatch ? (user.status === 'Added' ? 'bg-green-50' : 'bg-red-50') : ''
                    }`}>
                      <td className="py-2.5 pr-2">
                        <div className="flex flex-col gap-0.5">
                          <span className={`truncate max-w-[120px] ${isMatch ? 'font-bold' : ''}`}>
                            {user.firstName} {user.lastName}
                          </span>
                          {isMatch && (
                            <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full self-start leading-none ${
                              user.status === 'Added'
                                ? 'bg-[#dcfce7] text-[#166534]'
                                : 'bg-[#fee2e2] text-[#991b1b]'
                            }`}>
                              {user.status === 'Added' ? 'person already added' : 'person already removed'}
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="py-2.5 pr-2 truncate max-w-[160px] text-gray-500 font-normal">{user.email}</td>
                      <td className="py-2.5 text-gray-500 font-normal">{user.location}</td>
                      <td className="py-2.5">
                        <span className={`inline-block px-1.5 py-0.5 rounded-full text-[10px] font-bold leading-none ${
                          user.status === 'Added'
                            ? 'bg-[#dcfce7] text-[#166534]'
                            : 'bg-[#fee2e2] text-[#991b1b]'
                        }`}>
                          {user.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Table Count Label */}
          <span className="text-[11px] text-[var(--color-text-muted)] font-medium">
            ℹ Showing {filteredUsers.length} of 47 users.
          </span>

          {/* Helper Footnote */}
          <p className="text-xs text-[var(--color-text-secondary)] italic leading-normal border-t border-[var(--color-border-default)] pt-3 select-none">
            If the person you're adding already appears here, a warning will show on the form.
          </p>
        </section>

      </main>
    </div>
  );
}
