import { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  Home,
  Mail,
  FileText,
  Settings,
  Inbox,
  Users,
  LogOut,
  Loader2,
  ChevronUp,
  X,
  Ban,
} from 'lucide-react';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../ui/useToast';
import { Modal } from '../ui';

export default function Sidebar({ mobileOpen = false, onMobileClose }) {
  const { logout, user } = useAuth();
  const { clearToasts } = useToast();
  const navigate = useNavigate();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const accountRef = useRef(null);

  const displayName =
    user?.user_metadata?.full_name
    || user?.user_metadata?.firstName
    || user?.email?.split('@')[0]
    || 'Admin';

  useEffect(() => {
    if (!menuOpen) return;
    const onClickOutside = (event) => {
      if (accountRef.current && !accountRef.current.contains(event.target)) {
        setMenuOpen(false);
      }
    };
    const onKeyDown = (event) => {
      if (event.key === 'Escape') setMenuOpen(false);
    };
    document.addEventListener('mousedown', onClickOutside);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onClickOutside);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [menuOpen]);

  const handleConfirmLogout = async () => {
    if (signingOut) return;
    setSigningOut(true);
    try {
      await logout();
      clearToasts();
      setConfirmOpen(false);
      sessionStorage.setItem(
        'adminSignedOut',
        JSON.stringify({ name: displayName }),
      );
      navigate('/admin/login', { replace: true });
    } catch (err) {
      console.error('Failed to log out:', err);
      setSigningOut(false);
    }
  };

  const navItemClass = ({ isActive }) =>
    `flex items-center gap-3 h-9 px-3 rounded-md transition-all duration-200 text-sm font-medium ${
      isActive
        ? 'bg-[var(--color-brand-accent)] text-white opacity-100 shadow-sm'
        : 'text-white/85 hover:bg-[var(--color-surface-sidebar-hover)] hover:text-white hover:opacity-100'
    }`;

  const handleNavClick = () => {
    onMobileClose?.();
  };

  return (
    <>
      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-[min(280px,88vw)] flex-col border-r border-white/5 bg-[var(--color-surface-sidebar)] text-white transition-transform duration-300 ease-out md:w-[240px] md:translate-x-0 ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
      >
        <div className="flex h-14 shrink-0 items-center justify-between gap-2 px-4">
          <div className="flex min-w-0 items-center gap-2">
            <img
              src="/image.png"
              alt="Power Music"
              className="h-5 w-5 shrink-0 object-contain object-top"
            />
            <span className="truncate text-[15px] font-semibold tracking-wide text-white">
              Power Music Ops
            </span>
          </div>
          <button
            type="button"
            onClick={onMobileClose}
            className="inline-flex h-8 w-8 items-center justify-center rounded-lg text-white/70 transition-colors hover:bg-white/10 hover:text-white focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20 md:hidden"
            aria-label="Close navigation menu"
          >
            <X className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="h-px bg-white/10 mx-4 shrink-0" />

        {/* Nav Groups */}
        <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6">
          <div className="space-y-1">
            <NavLink to="/" end className={navItemClass} onClick={handleNavClick}>
              <Home className="w-4 h-4 shrink-0" />
              <span>Overview</span>
            </NavLink>
          </div>

          <div className="space-y-1">
            <span className="block px-3 text-[11px] font-semibold tracking-wider text-[var(--color-text-muted)] uppercase mb-2">
              Customer support
            </span>
            <NavLink to="/email-responses" className={navItemClass} onClick={handleNavClick}>
              <Mail className="w-4 h-4 shrink-0" />
              <span>Email responses</span>
            </NavLink>
            <NavLink to="/templates" className={navItemClass} onClick={handleNavClick}>
              <FileText className="w-4 h-4 shrink-0" />
              <span>Templates</span>
            </NavLink>
            <NavLink to="/email-accounts" className={navItemClass} onClick={handleNavClick}>
              <Settings className="w-4 h-4 shrink-0" />
              <span>Email accounts</span>
            </NavLink>
            <NavLink to="/ignore-list" className={navItemClass} onClick={handleNavClick}>
              <Ban className="w-4 h-4 shrink-0" />
              <span>Ignore list</span>
            </NavLink>
          </div>

          <div className="space-y-1">
            <span className="block px-3 text-[11px] font-semibold tracking-wider text-white/40 uppercase mb-2">
              Partner support
            </span>
            <NavLink to="/new-requests" className={navItemClass} onClick={handleNavClick}>
              <Inbox className="w-4 h-4 shrink-0" />
              <span>New requests</span>
            </NavLink>
            <NavLink to="/directory" className={navItemClass} onClick={handleNavClick}>
              <Users className="w-4 h-4 shrink-0" />
              <span>Directory</span>
            </NavLink>
          </div>
        </div>

        {/* Account — Notion/Slack-style menu trigger + popover */}
        <div className="shrink-0 border-t border-white/[0.06] p-3" ref={accountRef}>
          <div className="relative">
            <button
              type="button"
              onClick={() => setMenuOpen((open) => !open)}
              aria-expanded={menuOpen}
              aria-haspopup="menu"
              className="flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-left transition-colors hover:bg-white/[0.06] focus:outline-none focus-visible:ring-2 focus-visible:ring-white/20"
            >
              <div
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-[var(--color-brand-accent)] to-[#c73652] text-sm font-semibold text-white"
                aria-hidden="true"
              >
                {displayName.substring(0, 1).toUpperCase()}
              </div>

              <div className="min-w-0 flex-1">
                <span className="block text-sm font-medium leading-snug text-white">
                  {displayName}
                </span>
                <span className="block text-xs leading-snug text-white/45">
                  Administrator
                </span>
              </div>

              <ChevronUp
                className={`h-4 w-4 shrink-0 text-white/40 transition-transform duration-200 ${
                  menuOpen ? '' : 'rotate-180'
                }`}
                aria-hidden="true"
              />
            </button>

            {menuOpen && (
              <div
                role="menu"
                aria-label="Account menu"
                className="absolute bottom-[calc(100%+6px)] left-0 right-0 z-50 overflow-hidden rounded-xl border border-[var(--color-border-default)] bg-white shadow-[var(--shadow-modal)]"
              >
                <div className="border-b border-[var(--color-border-default)] bg-[var(--color-surface-panel)]/50 px-3.5 py-3">
                  <p className="text-sm font-semibold leading-snug text-[var(--color-text-primary)] break-words">
                    {displayName}
                  </p>
                  {user?.email && (
                    <p className="mt-1 text-xs leading-relaxed text-[var(--color-text-secondary)] break-all">
                      {user.email}
                    </p>
                  )}
                  <p className="mt-2 text-[10px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
                    Administrator
                  </p>
                </div>

                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setMenuOpen(false);
                    onMobileClose?.();
                    setConfirmOpen(true);
                  }}
                  className="flex w-full items-center gap-2.5 px-3.5 py-2.5 text-sm font-medium text-[var(--color-text-primary)] transition-colors hover:bg-[var(--color-surface-highlight)] focus:outline-none focus-visible:bg-[var(--color-surface-highlight)]"
                >
                  <LogOut className="h-4 w-4 shrink-0 text-[var(--color-text-secondary)]" aria-hidden="true" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </aside>

      <Modal
        isOpen={confirmOpen}
        onClose={() => !signingOut && setConfirmOpen(false)}
        title="Sign out?"
        confirm
        footer={
          <>
            <button
              type="button"
              onClick={() => setConfirmOpen(false)}
              disabled={signingOut}
              className="px-4 py-2 text-sm font-semibold rounded-lg border border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:bg-[var(--color-surface-highlight)] transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmLogout}
              disabled={signingOut}
              className="inline-flex min-w-[7.5rem] items-center justify-center gap-2 px-4 py-2 text-sm font-semibold rounded-lg bg-[var(--color-brand-primary)] text-white hover:bg-[var(--color-surface-sidebar-hover)] transition-colors disabled:opacity-50"
            >
              {signingOut ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  Signing out…
                </>
              ) : (
                'Sign out'
              )}
            </button>
          </>
        }
      >
        <p>
          You&apos;ll return to the sign-in page. Any unsaved work in open tabs may be lost.
        </p>
      </Modal>
    </>
  );
}
