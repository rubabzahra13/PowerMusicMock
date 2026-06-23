import { NavLink } from 'react-router-dom';
import {
  Zap,
  Home,
  Inbox,
  Users,
  FileText,
  Mail
} from 'lucide-react';

export default function Sidebar() {
  const navItemClass = ({ isActive }) =>
    `flex items-center gap-3 h-9 px-3 rounded-md transition-all duration-200 text-sm font-medium ${
      isActive
        ? 'bg-[var(--color-surface-sidebar-active)] text-white opacity-100'
        : 'text-white/85 hover:bg-[var(--color-surface-sidebar-hover)] hover:text-white hover:opacity-100'
    }`;

  return (
    <aside className="fixed left-0 top-0 bottom-0 w-[200px] bg-[var(--color-surface-sidebar)] flex flex-col border-r border-white/5 z-20 text-white select-none">
      {/* Logo Section */}
      <div className="h-14 flex items-center gap-2 px-4">
        <Zap className="w-5 h-5 text-[var(--color-brand-accent)] fill-[var(--color-brand-accent)] animate-pulse" />
        <span className="text-[15px] font-semibold tracking-wide text-white">
          Power Music Ops
        </span>
      </div>

      {/* Gray Divider */}
      <div className="h-[1px] bg-white/10 mx-4"></div>

      {/* Navigation Groups Container */}
      <div className="flex-1 overflow-y-auto px-3 py-4 space-y-6 scrollbar-thin scrollbar-thumb-white/10 scrollbar-track-transparent">

        {/* Group 1: General Navigation */}
        <div className="space-y-1">
          <NavLink to="/" className={navItemClass}>
            <Home className="w-4 h-4 shrink-0" />
            <span>Dashboard</span>
          </NavLink>
        </div>

        {/* Group 2: Partner Onboarding */}
        <div className="space-y-1">
          <span className="block px-3 text-[11px] font-semibold tracking-wider text-[var(--color-text-muted)] uppercase mb-2">
            Partner onboarding
          </span>
          <NavLink to="/new-requests" className={navItemClass}>
            <Inbox className="w-4 h-4 shrink-0" />
            <span>New requests</span>
          </NavLink>
          <NavLink to="/user-ledger" className={navItemClass}>
            <Users className="w-4 h-4 shrink-0" />
            <span>User Ledger</span>
          </NavLink>
        </div>

        {/* Group 3: Template Management */}
        <div className="space-y-1">
          <span className="block px-3 text-[11px] font-semibold tracking-wider text-[var(--color-text-muted)] uppercase mb-2">
            Template
          </span>
          <NavLink to="/templates" className={navItemClass}>
            <FileText className="w-4 h-4 shrink-0" />
            <span>Manage templates</span>
          </NavLink>
        </div>

        {/* Group 4: Gmail Accounts */}
        <div className="space-y-1">
          <span className="block px-3 text-[11px] font-semibold tracking-wider text-[var(--color-text-muted)] uppercase mb-2">
            Gmail Accounts
          </span>
          <NavLink to="/gmail-accounts" className={navItemClass}>
            <Mail className="w-4 h-4 shrink-0" />
            <span>Manage Gmail</span>
          </NavLink>
        </div>
      </div>

      {/* Bottom Profile Section */}
      <div className="p-4 border-t border-white/10 bg-black/10 flex items-center gap-3">
        <div className="w-8 h-8 rounded-full bg-[var(--color-brand-accent)] flex items-center justify-center font-bold text-sm text-white shrink-0 shadow-inner">
          A
        </div>
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-medium text-white truncate">Andrea</span>
          <span className="text-xs text-[var(--color-text-muted)] truncate">Administrator</span>
        </div>
      </div>
    </aside>
  );
}
