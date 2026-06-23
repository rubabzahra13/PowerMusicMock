import React from 'react';
import { Mail, Link2, Unlink } from 'lucide-react';

const accounts = [
  {
    id: 1,
    title: 'Customer Care',
    email: 'cc@powermusic.com',
    date: '21 Jun 2026',
    status: 'Connected',
  },
  {
    id: 2,
    title: 'Music Apps',
    email: 'cc@powermusicapp.com',
    date: '21 Jun 2026',
    status: 'Connected',
  },
  {
    id: 3,
    title: 'General Info',
    email: 'info@powermusic.com',
    date: '21 Jun 2026',
    status: 'Connected',
  },
  {
    id: 4,
    title: 'Tracks',
    email: 'tracks@powermusic.com',
    date: '21 Jun 2026',
    status: 'Connected',
  },
  {
    id: 5,
    title: 'Royalty Free Music',
    email: 'royaltyfree@powermusic.com',
    date: '21 Jun 2026',
    status: 'Connected',
  },
];

export default function GmailAccounts() {
  return (
    <div className="max-w-4xl mx-auto py-6">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Gmail Account Management</h1>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">Manage connected Gmail inboxes for each vertical.</p>
      </div>

      <div className="flex flex-col gap-6">
        {accounts.map((account) => (
          <div
            key={account.id}
            className="group bg-white border border-[var(--color-border-default)] rounded-xl shadow-sm p-6 flex flex-col hover:border-[var(--color-surface-highlight-strong)] hover:bg-[var(--color-surface-panel)] transition-colors"
          >
            {/* Top Section */}
            <div className="flex items-start justify-between mb-5">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 bg-[var(--color-surface-highlight)] group-hover:bg-[var(--color-surface-highlight-strong)] rounded-xl flex items-center justify-center shrink-0 transition-colors">
                  <Mail className="w-6 h-6 text-[var(--color-brand-primary)]" />
                </div>
                <div>
                  <h2 className="text-lg font-bold text-[var(--color-text-primary)] leading-tight group-hover:text-[var(--color-brand-primary)] transition-colors">{account.title}</h2>
                  <p className="text-xs text-[var(--color-text-muted)] mt-0.5">Connect the Gmail inbox used for this vertical</p>
                </div>
              </div>
              <span className="inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-bold bg-[var(--color-surface-highlight-strong)] text-[var(--color-brand-primary)]">
                {account.status}
              </span>
            </div>

            {/* Divider */}
            <div className="h-px bg-[var(--color-border-default)] w-full mb-5" />

            {/* Bottom Section */}
            <div className="flex items-center justify-between">
              <div>
                <div className="text-sm font-bold text-[var(--color-text-primary)]">{account.email}</div>
                <div className="text-xs text-[var(--color-text-muted)] mt-0.5">Connected {account.date}</div>
              </div>
              <div className="flex items-center gap-3">
                <button className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-[var(--color-text-primary)] bg-white border border-[var(--color-border-default)] rounded-lg hover:bg-gray-50 transition-colors shadow-sm cursor-pointer">
                  <Link2 className="w-4 h-4 text-[var(--color-text-secondary)]" />
                  Reconnect
                </button>
                <button className="inline-flex items-center gap-2 px-4 py-2 text-sm font-semibold text-red-600 bg-white border border-[var(--color-border-default)] rounded-lg hover:bg-red-50 hover:border-red-200 transition-colors shadow-sm cursor-pointer">
                  <Unlink className="w-4 h-4 text-red-500" />
                  Disconnect
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
