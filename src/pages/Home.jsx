import { useNavigate } from 'react-router-dom';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import {
  ArrowRight,
  Clock,
  AlertTriangle,
  Inbox,
  Flag,
  Users,
  FileText,
  CheckCircle,
  UserPlus,
  UserMinus,
  ChevronRight
} from 'lucide-react';
import { kpiData, recentActivity, pendingRequests } from '../data/mockData';

const getActivityMeta = (type) => {
  switch (type) {
    case 'request_submitted':
      return {
        icon: Inbox,
        iconBg: 'bg-[var(--color-surface-highlight)]',
        iconColor: 'text-[var(--color-brand-primary)]'
      };
    case 'tag_applied':
      return {
        icon: AlertTriangle,
        iconBg: 'bg-[var(--color-tag-already-exists-bg)]',
        iconColor: 'text-[var(--color-tag-already-exists-text)]'
      };
    case 'marked_removed':
      return {
        icon: UserMinus,
        iconBg: 'bg-[var(--color-tag-remove-action-bg)]',
        iconColor: 'text-[var(--color-tag-remove-action-text)]'
      };
    case 'marked_added':
      return {
        icon: UserPlus,
        iconBg: 'bg-[var(--color-tag-add-action-bg)]',
        iconColor: 'text-[var(--color-tag-add-action-text)]'
      };
    case 'template_updated':
      return {
        icon: FileText,
        iconBg: 'bg-[var(--color-surface-highlight)]',
        iconColor: 'text-[var(--color-brand-primary)]'
      };
    default:
      return {
        icon: Clock,
        iconBg: 'bg-[var(--color-surface-highlight)]',
        iconColor: 'text-[var(--color-text-secondary)]'
      };
  }
};

export default function Home() {
  const navigate = useNavigate();

  // Dynamic activity date formatting
  const formatActivityDate = (isoString) => {
    try {
      const date = parseISO(isoString);
      if (isToday(date)) return `Today, ${format(date, 'HH:mm')}`;
      if (isYesterday(date)) return `Yesterday, ${format(date, 'HH:mm')}`;
      return format(date, 'dd MMM yyyy, HH:mm');
    } catch {
      return isoString;
    }
  };

  // Activity click handler
  const handleActivityClick = (link) => {
    if (!link) return;
    if (link.startsWith('req-h')) {
      navigate('/new-requests'); // Redirects to handled via unified page but user will use toggle
    } else {
      navigate('/new-requests');
    }
  };

  const visibleActivity = recentActivity.slice(0, 8);
  
  // Priority Alerts derived from mockData
  const duplicateAlerts = pendingRequests
    .filter(req => req.tags?.includes('Already Exists'))
    .map(req => ({
      id: req.id,
      title: 'Potential Duplicate Entry',
      subtitle: `${req.person.firstName} ${req.person.lastName} (${req.person.email})`,
      time: formatActivityDate(req.receivedAt),
      type: 'warning',
      isNew: true,
    }));

  // Mock flagged email alert for dashboard purposes
  const flaggedEmailAlerts = kpiData.flaggedEmails > 0 ? [{
    id: 'flag-001',
    title: 'Flagged Email Requires Review',
    subtitle: 'System detected aggressive or unhandled intent',
    time: 'Today, 08:30',
    type: 'critical',
    isNew: true,
  }] : [];

  const alerts = [...flaggedEmailAlerts, ...duplicateAlerts];

  const handleAlertClick = (alert) => {
    if (alert.type === 'critical') return;
    navigate('/new-requests');
  };

  return (
    <div className="max-w-7xl mx-auto space-y-8 select-none pb-12">
      {/* Welcome Title */}
      <div>
        <h2 className="text-2xl font-bold text-[var(--color-text-primary)]">
          Good morning, Andrea.
        </h2>
        <p className="text-sm text-[var(--color-text-secondary)] mt-1">
          Here's your operational overview for today.
        </p>
      </div>

      {/* Quick Stats Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Pending Requests */}
        <div 
          onClick={() => navigate('/new-requests')}
          className="bg-white border border-[var(--color-border-default)] rounded-xl p-5 flex items-center justify-between shadow-sm cursor-pointer hover:border-[var(--color-surface-highlight-strong)] hover:bg-[var(--color-surface-panel)] transition-colors group"
        >
          <div>
            <h3 className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Pending Requests</h3>
            <p className="text-3xl font-bold text-[var(--color-text-primary)] mt-1.5 group-hover:text-[var(--color-brand-primary)] transition-colors">{kpiData.pendingRequests}</p>
          </div>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[var(--color-surface-highlight)] group-hover:bg-[var(--color-surface-highlight-strong)] transition-colors">
            <Inbox className="w-6 h-6 text-[var(--color-brand-primary)]" />
          </div>
        </div>

        {/* Flagged Emails */}
        <div 
          className="bg-white border border-[var(--color-border-default)] rounded-xl p-5 flex items-center justify-between shadow-sm"
        >
          <div>
            <h3 className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Flagged Emails</h3>
            <p className="text-3xl font-bold text-[var(--color-text-primary)] mt-1.5">{kpiData.flaggedEmails}</p>
          </div>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[var(--color-surface-highlight)]">
            <Flag className="w-6 h-6 text-[var(--color-brand-primary)]" />
          </div>
        </div>

        {/* Active Templates */}
        <div 
          onClick={() => navigate('/templates')}
          className="bg-white border border-[var(--color-border-default)] rounded-xl p-5 flex items-center justify-between shadow-sm cursor-pointer hover:border-[var(--color-surface-highlight-strong)] hover:bg-[var(--color-surface-panel)] transition-colors group"
        >
          <div>
            <h3 className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Active Templates</h3>
            <p className="text-3xl font-bold text-[var(--color-text-primary)] mt-1.5 group-hover:text-[var(--color-brand-primary)] transition-colors">{kpiData.templatesActive}</p>
          </div>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[var(--color-surface-highlight)] group-hover:bg-[var(--color-surface-highlight-strong)] transition-colors">
            <FileText className="w-6 h-6 text-[var(--color-brand-primary)]" />
          </div>
        </div>

        {/* Users In Ledger */}
        <div 
          onClick={() => navigate('/user-ledger')}
          className="bg-white border border-[var(--color-border-default)] rounded-xl p-5 flex items-center justify-between shadow-sm cursor-pointer hover:border-[var(--color-surface-highlight-strong)] hover:bg-[var(--color-surface-panel)] transition-colors group"
        >
          <div>
            <h3 className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Users In Ledger</h3>
            <p className="text-3xl font-bold text-[var(--color-text-primary)] mt-1.5 group-hover:text-[var(--color-brand-primary)] transition-colors">{kpiData.usersInLedger}</p>
          </div>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-[var(--color-surface-highlight)] group-hover:bg-[var(--color-surface-highlight-strong)] transition-colors">
            <Users className="w-6 h-6 text-[var(--color-brand-primary)]" />
          </div>
        </div>
      </div>

      {/* Main Dashboard Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">

        {/* Priority Alerts */}
        <div className="lg:col-span-1 bg-white border border-[var(--color-border-default)] rounded-2xl shadow-[var(--shadow-card)] overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-[var(--color-border-default)] bg-[var(--color-surface-panel)] flex items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-9 h-9 rounded-xl bg-[var(--color-surface-highlight-strong)] flex items-center justify-center shrink-0">
                <AlertTriangle className="w-4 h-4 text-[var(--color-brand-primary)]" />
              </div>
              <div className="min-w-0">
                <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Priority Alerts</h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">
                  {alerts.length === 0 ? 'Nothing urgent right now' : `${alerts.length} item${alerts.length === 1 ? '' : 's'} need attention`}
                </p>
              </div>
            </div>
            {alerts.length > 0 && (
              <span className="shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full bg-[var(--color-brand-primary)] text-white">
                {alerts.length}
              </span>
            )}
          </div>

          <div className="p-3 flex flex-col gap-2 flex-1">
            {alerts.length === 0 ? (
              <div className="flex flex-col items-center justify-center text-center px-4 py-10">
                <div className="w-12 h-12 rounded-2xl bg-[var(--color-surface-highlight)] flex items-center justify-center mb-3">
                  <CheckCircle className="w-6 h-6 text-[var(--color-signal-green)]" />
                </div>
                <h4 className="text-sm font-bold text-[var(--color-text-primary)]">All caught up</h4>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1 max-w-[200px]">
                  No pending warnings or flagged items.
                </p>
              </div>
            ) : (
              alerts.map((alert) => {
                const isClickable = alert.type !== 'critical';

                return (
                <button
                  key={alert.id}
                  type="button"
                  onClick={isClickable ? () => handleAlertClick(alert) : undefined}
                  className={`w-full text-left rounded-xl border border-[var(--color-border-default)] p-4 transition-all ${
                    isClickable
                      ? 'cursor-pointer hover:border-[var(--color-surface-highlight-strong)] hover:bg-[var(--color-surface-panel)] group'
                      : 'cursor-default'
                  } ${
                    alert.type === 'critical'
                      ? 'border-l-[3px] border-l-[var(--color-signal-red)]'
                      : 'border-l-[3px] border-l-[var(--color-already-exists-border)]'
                  }`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      alert.type === 'critical'
                        ? 'bg-[var(--color-tag-remove-action-bg)]'
                        : 'bg-[var(--color-tag-already-exists-bg)]'
                    }`}>
                      {alert.type === 'critical' ? (
                        <Flag className="w-4 h-4 text-[var(--color-tag-remove-action-text)]" />
                      ) : (
                        <Users className="w-4 h-4 text-[var(--color-tag-already-exists-text)]" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0 flex-wrap">
                          <h4 className="text-sm font-semibold text-[var(--color-text-primary)] leading-snug">
                            {alert.title}
                          </h4>
                          {alert.isNew && (
                            <span className="shrink-0 text-[9px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded-md bg-[var(--color-surface-highlight-strong)] text-[var(--color-brand-primary)] leading-none">
                              New
                            </span>
                          )}
                        </div>
                        <ChevronRight className={`w-4 h-4 text-[var(--color-text-muted)] shrink-0 mt-0.5 transition-all ${
                          isClickable ? 'opacity-0 group-hover:opacity-100 group-hover:translate-x-0.5' : 'hidden'
                        }`} />
                      </div>
                      <p className="text-xs text-[var(--color-text-secondary)] mt-1 leading-relaxed">
                        {alert.subtitle}
                      </p>
                      <p className="text-[10px] font-semibold text-[var(--color-text-muted)] mt-2">
                        {alert.time}
                      </p>
                    </div>
                  </div>
                </button>
                );
              })
            )}
          </div>
        </div>

        {/* Activity Summary */}
        <div className="lg:col-span-2 bg-white border border-[var(--color-border-default)] rounded-2xl shadow-[var(--shadow-card)] overflow-hidden flex flex-col">
          <div className="px-5 py-4 border-b border-[var(--color-border-default)] bg-[var(--color-surface-panel)] flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-9 h-9 rounded-xl bg-[var(--color-surface-highlight-strong)] flex items-center justify-center shrink-0">
                <Clock className="w-4 h-4 text-[var(--color-brand-primary)]" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-[var(--color-text-primary)]">Activity Summary</h3>
                <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">Recent operational events</p>
              </div>
            </div>
            <span className="text-[11px] font-semibold text-[var(--color-text-muted)]">
              Last {visibleActivity.length} events
            </span>
          </div>

          {visibleActivity.length === 0 ? (
            <div className="p-10 text-center">
              <p className="text-sm font-medium text-[var(--color-text-muted)]">No recent activity to display.</p>
            </div>
          ) : (
            <div className="p-4">
              {visibleActivity.map((activity, index) => {
                const isClickable = !!activity.link;
                const meta = getActivityMeta(activity.type);
                const Icon = meta.icon;
                const isLast = index === visibleActivity.length - 1;

                return (
                  <div
                    key={activity.id}
                    onClick={() => isClickable && handleActivityClick(activity.link)}
                    className={`relative flex gap-4 ${isLast ? '' : 'pb-5'} ${
                      isClickable ? 'cursor-pointer group' : ''
                    }`}
                  >
                    {!isLast && (
                      <div className="absolute left-[18px] top-10 bottom-0 w-px bg-[var(--color-border-default)]" />
                    )}

                    <div className={`relative z-10 w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${meta.iconBg} ${
                      isClickable ? 'group-hover:ring-2 group-hover:ring-[rgba(26,26,46,0.08)] transition-shadow' : ''
                    }`}>
                      <Icon className={`w-4 h-4 ${meta.iconColor}`} />
                    </div>

                    <div className={`flex-1 min-w-0 rounded-xl px-3 py-2 -mx-1 transition-colors ${
                      isClickable ? 'group-hover:bg-[var(--color-surface-panel)]' : ''
                    }`}>
                      <div className="flex items-start justify-between gap-3">
                        <p className="text-sm font-semibold text-[var(--color-text-primary)] leading-snug">
                          {activity.description}
                        </p>
                        {isClickable && (
                          <ArrowRight className="w-4 h-4 text-[var(--color-text-muted)] shrink-0 mt-0.5 opacity-0 group-hover:opacity-100 group-hover:text-[var(--color-brand-primary)] transition-all" />
                        )}
                      </div>
                      <p className="text-xs font-medium text-[var(--color-text-muted)] mt-1">
                        {formatActivityDate(activity.timestamp)}
                      </p>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

      </div>
    </div>
  );
}
