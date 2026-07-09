import { useState, useEffect } from 'react';
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
import { adminPageShellClass } from '../utils/responsiveLayout';
import { loadWithCache, getDashboard, getPilot2Overview } from '../utils/pilot2Api';
import DottedScroll from '../components/ui/DottedScroll';
import { PanelListSkeleton, ActivitySkeleton } from '../components/ui';

const PANEL_VISIBLE_ITEMS = 3;
const ALERT_LIST_SCROLL_CLASS = 'max-h-[15.5rem] overflow-y-scroll scrollbar-hide pr-5';
const ACTIVITY_LIST_SCROLL_CLASS = 'max-h-[12.75rem] overflow-y-scroll scrollbar-hide pr-5';
import { TAG_ALREADY_EXISTS } from '../utils/requestTags';

const CUSTOMER_ACTIVITY_TYPES = new Set(['template_updated']);
const PARTNER_ACTIVITY_TYPES = new Set([
  'request_submitted',
  'tag_applied',
  'marked_added',
  'marked_removed',
  'automated_email',
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
    kpiIconWell: 'bg-[var(--color-surface-highlight)]',
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

function KpiCard({ label, value, hint, icon: Icon, onClick, theme }) {
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
        {hint && (
          <p className="text-[10px] font-medium text-[var(--color-text-muted)] mt-0.5">{hint}</p>
        )}
      </div>
      <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${theme.kpiIconWell || theme.iconWell}`}>
        <Icon className={`w-5 h-5 ${theme.kpiIconColor || theme.iconColor}`} />
      </div>
    </Tag>
  );
}

function groupAlertsByPartition(alerts) {
  const groups = [];
  for (const alert of alerts) {
    const label = alert.partitionLabel || null;
    const last = groups[groups.length - 1];
    if (last && last.label === label) {
      last.items.push(alert);
    } else {
      groups.push({ label, items: [alert] });
    }
  }
  return groups;
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
  showAlertCount = true,
  activities,
  activityTitle = 'Recent activity',
  activitySubtitle = 'Latest events',
  activityEmptyText,
  formatActivityDate,
  onActivityClick,
  themeKey,
  alertsLoading = false,
  activityLoading = false,
}) {
  const theme = COLUMN_THEMES[themeKey];

  return (
    <div className={`flex flex-col gap-3 h-full min-h-0 overflow-hidden rounded-2xl p-4 xl:p-5 border ${theme.shell}`}>
      <div className="shrink-0">
        <h2 className="text-base font-bold uppercase tracking-wide text-[var(--color-text-primary)]">{title}</h2>
        <p className="text-xs text-[var(--color-text-secondary)] mt-0.5">{description}</p>
      </div>

      <div className={`grid gap-2.5 shrink-0 ${kpis.length >= 3 ? 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'}`}>
        {kpis.map((kpi) => (
          <KpiCard key={kpi.label} {...kpi} theme={theme} />
        ))}
      </div>

      <div className="flex-1 flex flex-col gap-3 min-h-0">
        <div className={`${PANEL} rounded-xl shadow-[var(--shadow-card)] overflow-hidden flex flex-col shrink-0`}>
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
            {showAlertCount && alerts.length > 0 && (
              <span className={`shrink-0 text-[11px] font-bold px-2 py-0.5 rounded-full text-white ${theme.badge}`}>
                {alerts.length}
              </span>
            )}
          </div>

          <DottedScroll
            scrollClassName={ALERT_LIST_SCROLL_CLASS}
            contentClassName="space-y-2.5 p-2.5"
          >
            {alertsLoading ? (
              <PanelListSkeleton rows={PANEL_VISIBLE_ITEMS} />
            ) : alerts.length === 0 ? (
              <div className="min-h-[72px] flex flex-col items-center justify-center text-center px-3 py-4">
                <CheckCircle className="w-7 h-7 text-[var(--color-signal-green)] mb-1.5" />
                <p className="text-sm font-medium text-[var(--color-text-secondary)]">{alertEmptyText}</p>
              </div>
            ) : (
              groupAlertsByPartition(alerts).map((group) => (
                <section key={group.label || group.items[0]?.id} className="space-y-1.5">
                  {group.label && (
                    <div className="flex items-center gap-2 px-1 pb-0.5">
                      <h4 className="text-[11px] font-medium text-[var(--color-text-secondary)] shrink-0">
                        {group.label}
                      </h4>
                      <div className="flex-1 h-px bg-[var(--color-border-default)]/80" aria-hidden="true" />
                    </div>
                  )}
                  {group.items.map((alert) => {
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
                </section>
              ))
            )}
          </DottedScroll>
        </div>

        <div className={`${PANEL} rounded-xl shadow-[var(--shadow-card)] overflow-hidden flex flex-col shrink-0`}>
          <div className={`px-3.5 py-2.5 border-b flex items-center gap-2.5 shrink-0 ${theme.panelHeader}`}>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${theme.panelIconWell}`}>
              <Clock className={`w-4 h-4 ${theme.panelIconColor}`} />
            </div>
            <div>
              <h3 className={`text-sm font-bold ${theme.panelTitle}`}>{activityTitle}</h3>
              <p className={`text-xs ${theme.panelSubtitle}`}>{activitySubtitle}</p>
            </div>
          </div>

          <DottedScroll
            scrollClassName={ACTIVITY_LIST_SCROLL_CLASS}
            contentClassName="space-y-0 p-3"
          >
            {activityLoading ? (
              <ActivitySkeleton rows={PANEL_VISIBLE_ITEMS} />
            ) : activities.length === 0 ? (
              <p className="text-sm text-[var(--color-text-muted)] text-center py-4">{activityEmptyText}</p>
            ) : (
              activities.map((activity, index) => {
                const isClickable = Boolean(activity.link);
                const meta = getActivityMeta(activity.type);
                const Icon = meta.icon;
                const isLast = index === activities.length - 1;

                return (
                  <button
                    key={activity.id}
                    type="button"
                    onClick={isClickable ? () => onActivityClick(activity) : undefined}
                    disabled={!isClickable}
                    className={`relative flex gap-2.5 w-full text-left ${
                      isLast ? '' : 'pb-3'
                    } ${
                      isClickable
                        ? `cursor-pointer group ${theme.alertCardHover} rounded-lg border border-transparent px-1 -mx-1`
                        : 'cursor-default'
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
                    <div className={`flex-1 min-w-0 rounded-lg px-2 py-1 transition-colors ${
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
                  </button>
                );
              })
            )}
          </DottedScroll>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();

  const [livePendingRequests, setLivePendingRequests] = useState([]);
  const [liveKpis, setLiveKpis] = useState({ pendingRequests: 0, usersInLedger: 0 });
  const [livePartnerActivity, setLivePartnerActivity] = useState([]);
  const [liveCustomerKpis, setLiveCustomerKpis] = useState({
    newEmails: 0,
    flaggedEmails: 0,
    templatesActive: 0,
  });
  const [liveCustomerActivity, setLiveCustomerActivity] = useState([]);
  const [liveFlaggedAlerts, setLiveFlaggedAlerts] = useState([]);
  const [partnerReady, setPartnerReady] = useState(false);
  const [customerReady, setCustomerReady] = useState(false);

  useEffect(() => {
    const applyDashboard = (data) => {
      setLivePendingRequests(data.pendingRequests);
      setLiveKpis(data.kpis);
      setLivePartnerActivity(data.activity);
      setPartnerReady(true);
    };
    const applyCustomerOverview = (data) => {
      setLiveCustomerKpis({
        newEmails: data.newEmails ?? 0,
        flaggedEmails: data.flaggedEmails ?? 0,
        templatesActive: data.templatesActive ?? 0,
      });
      setLiveCustomerActivity(
        (Array.isArray(data.activity) ? data.activity : []).map((entry) => ({
          id: `act-${entry.id}`,
          timestamp: entry.timestamp,
          type: entry.type,
          description: entry.description,
          link: entry.emailId ? `/templates?id=${encodeURIComponent(entry.emailId)}` : null,
        })),
      );
      setLiveFlaggedAlerts(
        (Array.isArray(data.flaggedAlerts) ? data.flaggedAlerts : []).map((alert) => ({
          id: alert.id,
          title: alert.title,
          subtitle: alert.subtitle || 'Requires manual review',
          partitionLabel: alert.inboxTitle || null,
          timestamp: alert.timestamp,
          type: 'critical',
          isNew: true,
        })),
      );
      setCustomerReady(true);
    };
    const load = () => {
      loadWithCache('home_dashboard', getDashboard, applyDashboard)
        .catch((err) => console.error(err));
      loadWithCache('home_customer_overview', getPilot2Overview, applyCustomerOverview)
        .catch((err) => console.error(err));
    };
    load();
    const refresh = () => { if (!document.hidden) load(); };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, []);

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

  const goToFlaggedEmail = (alert) => {
    if (alert?.id) {
      navigate(`/email-responses?mailbox=flagged&emailId=${encodeURIComponent(alert.id)}`);
      return;
    }
    navigate('/email-responses?mailbox=flagged');
  };

  const handleActivityClick = (activity) => {
    if (activity.link) navigate(activity.link);
  };

  const handlePartnerAlertClick = (alert) => {
    if (alert?.id) {
      navigate(`/new-requests?id=${encodeURIComponent(alert.id)}`);
      return;
    }
    navigate('/new-requests');
  };

  const duplicateAlerts = (Array.isArray(livePendingRequests) ? livePendingRequests : [])
    .filter((req) => req.tags?.includes(TAG_ALREADY_EXISTS))
    .sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt))
    .slice(0, 2)
    .map((req) => ({
      id: req.id,
      title: `${req.person.firstName} ${req.person.lastName}`.trim(),
      subtitle: req.person.email,
      time: formatActivityDate(req.receivedAt),
      type: 'warning',
      isNew: true
    }));

  const flaggedEmailAlerts = liveFlaggedAlerts.map((alert) => ({
    ...alert,
    time: alert.timestamp ? formatActivityDate(alert.timestamp) : '',
  }));

  const customerActivity = liveCustomerActivity
    .filter((a) => CUSTOMER_ACTIVITY_TYPES.has(a.type));

  const partnerActivity = (Array.isArray(livePartnerActivity) ? livePartnerActivity : [])
    .filter((a) => PARTNER_ACTIVITY_TYPES.has(a.type))
    .map((a) => ({
      ...a,
      link: a.linkedRequestId ? `/new-requests?id=${a.linkedRequestId}` : null
    }));

  return (
    <div className={`${adminPageShellClass} select-none`}>
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
          description="Totals across all connected inboxes."
          alertsLoading={!customerReady}
          activityLoading={!customerReady}
          kpis={[
            { label: 'New Emails', value: liveCustomerKpis.newEmails, hint: 'All inboxes', icon: Mail, onClick: () => navigate('/email-responses') },
            { label: 'Flagged', value: liveCustomerKpis.flaggedEmails, hint: 'All inboxes', icon: Flag, onClick: () => navigate('/email-responses?mailbox=flagged') },
            { label: 'Active Templates', value: liveCustomerKpis.templatesActive, hint: 'All inboxes', icon: FileText, onClick: () => navigate('/templates') }
          ]}
          alertsTitle="Flagged recently"
          alertsSubtitle={flaggedEmailAlerts.length ? 'Latest across connected inboxes' : 'All clear'}
          alerts={flaggedEmailAlerts}
          alertEmptyText="No flagged emails to review."
          showAlertCount={false}
          onAlertClick={goToFlaggedEmail}
          activities={customerActivity}
          activityEmptyText="No recent template activity."
          formatActivityDate={formatActivityDate}
          onActivityClick={handleActivityClick}
        />

        <ServiceColumn
          themeKey="partner"
          title="Partner Support"
          description="New user requests and the partner user ledger."
          alertsLoading={!partnerReady}
          activityLoading={!partnerReady}
          kpis={[
            { label: 'Pending requests', value: liveKpis.pendingRequests, icon: Inbox, onClick: () => navigate('/new-requests') },
            { label: 'Users in ledger', value: liveKpis.usersInLedger, icon: Users, onClick: () => navigate('/directory') }
          ]}
          alertsTitle="New priority alerts"
          alertsSubtitle={duplicateAlerts.length ? 'Latest potential duplicates' : 'Nothing urgent'}
          alerts={duplicateAlerts}
          alertEmptyText="No duplicate warnings right now."
          showAlertCount={false}
          onAlertClick={handlePartnerAlertClick}
          activities={partnerActivity}
          activityTitle="Recent Requests"
          activitySubtitle="Latest requests"
          activityEmptyText="No recent partner activity."
          formatActivityDate={formatActivityDate}
          onActivityClick={handleActivityClick}
        />
      </div>
    </div>
  );
}
