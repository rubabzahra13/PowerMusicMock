import { useNavigate } from 'react-router-dom';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle,
  Clock,
  FileText,
  Flag,
  Inbox,
  Mail,
  UserMinus,
  UserPlus,
  Users
} from 'lucide-react';
import PageHeader from '../components/layout/PageHeader';
import { kpiData, recentActivity, pendingRequests } from '../data/mockData';

const CUSTOMER_ACTIVITY_TYPES = new Set(['template_updated']);
const PARTNER_ACTIVITY_TYPES = new Set([
  'request_submitted',
  'tag_applied',
  'marked_added',
  'marked_removed'
]);

const PANEL = 'bg-white border border-[var(--color-border-default)]';

const COLUMN_THEMES = {
  customer: {
    shell: 'bg-white border-[var(--color-border-default)]',
    panelHeader: 'bg-[#edf4fc] border-[#c5daf3]',
    panelTitle: 'text-[var(--color-text-primary)]',
    panelSubtitle: 'text-[var(--color-text-secondary)]',
    panelIconWell: 'bg-[var(--color-surface-highlight)]',
    panelIconColor: 'text-[var(--color-text-muted)]',
    dot: 'bg-[#6baff0]',
    kpiIconWell: 'bg-[var(--color-surface-highlight)]',
    kpiIconColor: 'text-[var(--color-text-muted)]',
    iconWell: 'bg-[var(--color-surface-highlight)]',
    iconColor: 'text-[var(--color-text-muted)]',
    badge: 'bg-[var(--color-brand-accent)]',
    kpiValueHover: 'group-hover:text-[#4a7eb8]',
    kpiCardHover: 'hover:border-[#c5daf3] hover:bg-[#f5f9fd]',
    alertCardHover: 'hover:border-[#c5daf3] hover:bg-[#f5f9fd]',
    activityHover: 'group-hover:bg-[#f5f9fd]',
    alertBorder: {
      critical: 'border-l-[#4a7eb8]',
      warning: 'border-l-[#8bb8e0]'
    }
  },
  partner: {
    shell: 'bg-white border-[#9fc0e3]',
    panelHeader: 'bg-[var(--color-surface-sidebar)] border-white/10',
    panelTitle: 'text-white',
    panelSubtitle: 'text-white/65',
    panelIconWell: 'bg-white/10',
    panelIconColor: 'text-white',
    dot: 'bg-[#252542]',
    iconWell: 'bg-[#b8d4f0]',
    iconColor: 'text-[#1e558f]',
    badge: 'bg-[var(--color-brand-accent)]',
    kpiValueHover: 'group-hover:text-[#1e558f]',
    kpiCardHover: 'hover:border-[#9fc0e3] hover:bg-[#edf4fc]',
    alertCardHover: 'hover:border-[#9fc0e3] hover:bg-[#edf4fc]',
    activityHover: 'group-hover:bg-[#edf4fc]',
    alertBorder: {
      critical: 'border-l-[#1e558f]',
      warning: 'border-l-[#2f5f94]'
    }
  }
};

function getActivityMeta(type) {
  const icons = {
    request_submitted: Inbox,
    tag_applied: AlertTriangle,
    marked_removed: UserMinus,
    marked_added: UserPlus,
    template_updated: FileText,
    default: Clock
  };

  return { icon: icons[type] || icons.default };
}

function KpiCard({ label, value, icon: Icon, onClick, theme }) {
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`${PANEL} rounded-xl p-3.5 flex items-center justify-between shadow-sm w-full text-left transition-colors ${
        onClick ? `cursor-pointer group ${theme.kpiCardHover}` : ''
      }`}
    >
      <div>
        <h3 className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">{label}</h3>
        <p className={`text-xl font-bold text-[var(--color-text-primary)] mt-0.5 tabular-nums ${
          onClick ? `${theme.kpiValueHover} transition-colors` : ''
        }`}>
          {value}
        </p>
      </div>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${theme.kpiIconWell || theme.iconWell}`}>
        <Icon className={`w-5 h-5 ${theme.kpiIconColor || theme.iconColor}`} />
      </div>
    </Tag>
  );
}

function ServiceColumn({
  title,
  description,
  kpis,
  alertsTitle,
  alertsSubtitle,
  alerts,
  alertEmptyText,
  onAlertClick,
  activities,
  activityEmptyText,
  formatActivityDate,
  onActivityClick,
  themeKey
}) {
  const theme = COLUMN_THEMES[themeKey];

  return (
    <div className={`flex flex-col gap-3 h-full min-h-0 overflow-hidden rounded-2xl p-4 xl:p-5 border ${theme.shell}`}>
      <div className="shrink-0">
        <div className="flex items-center gap-2">
          <span className={`w-2 h-2 rounded-full shrink-0 ${theme.dot}`} />
          <h2 className="text-base font-bold uppercase tracking-wide text-[var(--color-text-primary)]">{title}</h2>
        </div>
        <p className="text-xs text-[var(--color-text-secondary)] mt-0.5 ml-4">{description}</p>
      </div>

      <div className={`grid gap-2.5 shrink-0 ${kpis.length >= 3 ? 'grid-cols-3' : 'grid-cols-2'}`}>
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} theme={theme} />
        ))}
      </div>

      <div className="flex-1 flex flex-col gap-3 min-h-0">
        <div className={`${PANEL} rounded-xl shadow-[var(--shadow-card)] overflow-hidden flex flex-col flex-1 min-h-0`}>
          <div className={`px-3.5 py-2.5 border-b flex items-center justify-between gap-3 shrink-0 ${theme.panelHeader}`}>
            <div className="flex items-center gap-2.5 min-w-0">
              <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${theme.panelIconWell}`}>
                <AlertTriangle className={`w-4 h-4 ${theme.panelIconColor}`} />
              </div>
              <div className="min-w-0">
                <h3 className={`text-sm font-bold ${theme.panelTitle}`}>{alertsTitle}</h3>
                <p className={`text-xs truncate ${theme.panelSubtitle}`}>{alertsSubtitle}</p>
              </div>
            </div>
            {alerts.length > 0 && (
              <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full text-white ${theme.badge}`}>
                {alerts.length}
              </span>
            )}
          </div>

          <div className="p-2.5 flex-1 min-h-0 overflow-y-auto">
            {alerts.length === 0 ? (
              <div className="h-full min-h-[72px] flex flex-col items-center justify-center text-center px-3 py-4">
                <CheckCircle className="w-7 h-7 text-[var(--color-signal-green)] mb-1.5" />
                <p className="text-sm font-medium text-[var(--color-text-secondary)]">{alertEmptyText}</p>
              </div>
            ) : (
              <div className="space-y-1.5">
                {alerts.map((alert) => {
                  const isClickable = Boolean(onAlertClick);
                  const alertBorder = theme.alertBorder[alert.type] || theme.alertBorder.warning;
                  const AlertIcon = alert.type === 'critical' ? Flag : Users;

                  return (
                    <button
                      key={alert.id}
                      type="button"
                      onClick={isClickable ? () => onAlertClick(alert) : undefined}
                      className={`w-full text-left rounded-lg border border-[var(--color-border-default)] bg-white p-2.5 transition-all border-l-[3px] ${alertBorder} ${
                        isClickable
                          ? `cursor-pointer group ${theme.alertCardHover}`
                          : 'cursor-default'
                      }`}
                    >
                      <div className="flex items-start gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${theme.iconWell}`}>
                          <AlertIcon className={`w-4 h-4 ${theme.iconColor}`} />
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-semibold text-[var(--color-text-primary)]">{alert.title}</p>
                          <p className="text-xs text-[var(--color-text-secondary)] mt-0.5 leading-relaxed">{alert.subtitle}</p>
                          <p className="text-[10px] font-semibold text-[var(--color-text-muted)] mt-1.5">{alert.time}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        <div className={`${PANEL} rounded-xl shadow-[var(--shadow-card)] overflow-hidden flex flex-col flex-1 min-h-0`}>
          <div className={`px-3.5 py-2.5 border-b flex items-center gap-2.5 shrink-0 ${theme.panelHeader}`}>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${theme.panelIconWell}`}>
              <Clock className={`w-4 h-4 ${theme.panelIconColor}`} />
            </div>
            <div>
              <h3 className={`text-sm font-bold ${theme.panelTitle}`}>Recent activity</h3>
              <p className={`text-xs ${theme.panelSubtitle}`}>Latest events</p>
            </div>
          </div>

          <div className="p-3 flex-1 min-h-0 overflow-y-auto">
            {activities.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)] text-center py-4">{activityEmptyText}</p>
            ) : (
              <div className="space-y-0">
                {activities.map((activity, index) => {
                  const isClickable = Boolean(activity.link) || activity.type === 'template_updated';
                  const meta = getActivityMeta(activity.type);
                  const Icon = meta.icon;
                  const isLast = index === activities.length - 1;

                  return (
                    <div
                      key={activity.id}
                      onClick={() => isClickable && onActivityClick(activity)}
                      className={`relative flex gap-2.5 ${isLast ? '' : 'pb-3'} ${
                        isClickable ? 'cursor-pointer group' : ''
                      }`}
                    >
                      {!isLast && (
                        <div className="absolute left-[15px] top-8 bottom-0 w-px bg-[var(--color-border-default)]" />
                      )}
                      <div className={`relative z-10 w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${theme.iconWell} ${
                        isClickable ? 'group-hover:ring-2 group-hover:ring-[rgba(26,26,46,0.06)] transition-shadow' : ''
                      }`}>
                        <Icon className={`w-4 h-4 ${theme.iconColor}`} />
                      </div>
                      <div className={`flex-1 min-w-0 rounded-lg px-2 py-1 -mx-1 transition-colors ${
                        isClickable ? theme.activityHover : ''
                      }`}>
                        <div className="flex items-start justify-between gap-2">
                          <p className="text-sm font-semibold text-[var(--color-text-primary)] leading-snug">
                            {activity.description}
                          </p>
                          {isClickable && (
                            <ArrowRight className={`w-3.5 h-3.5 shrink-0 opacity-0 group-hover:opacity-100 transition-all ${theme.iconColor}`} />
                          )}
                        </div>
                        <p className="text-xs font-medium text-[var(--color-text-muted)] mt-0.5">
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
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();

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

  const goToFlaggedEmails = () => navigate('/email-responses?mailbox=flagged');

  const handleActivityClick = (activity) => {
    if (activity.type === 'template_updated') {
      navigate('/templates');
      return;
    }
    if (activity.link) navigate('/new-requests');
  };

  const duplicateAlerts = pendingRequests
    .filter((req) => req.tags?.includes('Already Exists'))
    .map((req) => ({
      id: req.id,
      title: 'Potential duplicate entry',
      subtitle: `${req.person.firstName} ${req.person.lastName} (${req.person.email})`,
      time: formatActivityDate(req.receivedAt),
      type: 'warning',
      isNew: true
    }));

  const flaggedEmailAlerts = kpiData.flaggedEmails > 0 ? [{
    id: 'flag-001',
    title: 'Flagged email requires review',
    subtitle: 'System detected aggressive or unhandled intent',
    time: 'Today, 08:30',
    type: 'critical',
    isNew: true
  }] : [];

  const customerActivity = recentActivity
    .filter((a) => CUSTOMER_ACTIVITY_TYPES.has(a.type))
    .slice(0, 4);

  const partnerActivity = recentActivity
    .filter((a) => PARTNER_ACTIVITY_TYPES.has(a.type))
    .slice(0, 4);

  return (
    <div className="max-w-7xl mx-auto select-none flex flex-col h-[calc(100vh-3rem)] max-h-[calc(100vh-3rem)] overflow-hidden">
      <PageHeader
        section="Overview"
        title="Good morning, Andrea."
        description="Here's your operational overview for today."
        className="mb-4 shrink-0"
      />

      <div className="grid grid-cols-1 xl:grid-cols-2 grid-rows-2 xl:grid-rows-1 gap-4 flex-1 min-h-0 items-stretch">
        <ServiceColumn
          themeKey="customer"
          title="Customer Support"
          description="Gmail templates, connected inboxes, and flagged emails."
          kpis={[
            { label: 'New Emails', value: kpiData.newEmails, icon: Mail, onClick: () => navigate('/email-responses') },
            { label: 'Flagged', value: kpiData.flaggedEmails, icon: Flag, onClick: goToFlaggedEmails },
            { label: 'Active Templates', value: kpiData.templatesActive, icon: FileText, onClick: () => navigate('/templates') }
          ]}
          alertsTitle="Flagged emails"
          alertsSubtitle={flaggedEmailAlerts.length ? 'Requires review' : 'All clear'}
          alerts={flaggedEmailAlerts}
          alertEmptyText="No flagged emails to review."
          onAlertClick={goToFlaggedEmails}
          activities={customerActivity}
          activityEmptyText="No recent template activity."
          formatActivityDate={formatActivityDate}
          onActivityClick={handleActivityClick}
        />

        <ServiceColumn
          themeKey="partner"
          title="Partner Support"
          description="New user requests and the partner user ledger."
          kpis={[
            { label: 'Pending requests', value: kpiData.pendingRequests, icon: Inbox, onClick: () => navigate('/new-requests') },
            { label: 'Users in ledger', value: kpiData.usersInLedger, icon: Users, onClick: () => navigate('/user-ledger') }
          ]}
          alertsTitle="Priority alerts"
          alertsSubtitle={duplicateAlerts.length ? 'Items need attention' : 'Nothing urgent'}
          alerts={duplicateAlerts}
          alertEmptyText="No duplicate warnings right now."
          onAlertClick={() => navigate('/new-requests')}
          activities={partnerActivity}
          activityEmptyText="No recent partner activity."
          formatActivityDate={formatActivityDate}
          onActivityClick={handleActivityClick}
        />
      </div>
    </div>
  );
}
