import { useNavigate } from 'react-router-dom';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import { ArrowRight, Clock, AlertTriangle, Inbox, Flag, Users, FileText, CheckCircle } from 'lucide-react';
import { kpiData, recentActivity, pendingRequests } from '../data/mockData';

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
      actionText: 'Review Request',
      onClick: () => navigate('/new-requests')
    }));

  // Mock flagged email alert for dashboard purposes
  const flaggedEmailAlerts = kpiData.flaggedEmails > 0 ? [{
    id: 'flag-001',
    title: 'Flagged Email Requires Review',
    subtitle: 'System detected aggressive or unhandled intent',
    time: 'Today, 08:30',
    type: 'critical',
    actionText: 'View Email',
    onClick: () => navigate('/flagged-emails') // Assuming this route still exists, or wherever it goes
  }] : [];

  const alerts = [...flaggedEmailAlerts, ...duplicateAlerts];

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
          className="bg-white border border-[var(--color-border-default)] rounded-xl p-5 flex items-center justify-between shadow-sm cursor-pointer hover:border-[var(--color-border-focus)] transition-colors group"
        >
          <div>
            <h3 className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Pending Requests</h3>
            <p className="text-3xl font-bold text-[var(--color-text-primary)] mt-1.5 group-hover:text-blue-600 transition-colors">{kpiData.pendingRequests}</p>
          </div>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-blue-50 group-hover:bg-blue-100 transition-colors">
            <Inbox className="w-6 h-6 text-blue-600" />
          </div>
        </div>

        {/* Flagged Emails */}
        <div 
          onClick={() => navigate('/flagged-emails')}
          className="bg-white border border-[var(--color-border-default)] rounded-xl p-5 flex items-center justify-between shadow-sm cursor-pointer hover:border-[var(--color-border-focus)] transition-colors group"
        >
          <div>
            <h3 className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Flagged Emails</h3>
            <p className="text-3xl font-bold text-[var(--color-text-primary)] mt-1.5 group-hover:text-red-600 transition-colors">{kpiData.flaggedEmails}</p>
          </div>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-red-50 group-hover:bg-red-100 transition-colors">
            <Flag className="w-6 h-6 text-red-600" />
          </div>
        </div>

        {/* Active Templates */}
        <div 
          onClick={() => navigate('/templates')}
          className="bg-white border border-[var(--color-border-default)] rounded-xl p-5 flex items-center justify-between shadow-sm cursor-pointer hover:border-[var(--color-border-focus)] transition-colors group"
        >
          <div>
            <h3 className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Active Templates</h3>
            <p className="text-3xl font-bold text-[var(--color-text-primary)] mt-1.5 group-hover:text-[var(--color-brand-accent)] transition-colors">{kpiData.templatesActive}</p>
          </div>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-pink-50 group-hover:bg-pink-100 transition-colors">
            <FileText className="w-6 h-6 text-[var(--color-brand-accent)]" />
          </div>
        </div>

        {/* Handled This Month (Mocking value based on ledger) */}
        <div 
          onClick={() => navigate('/user-ledger')}
          className="bg-white border border-[var(--color-border-default)] rounded-xl p-5 flex items-center justify-between shadow-sm cursor-pointer hover:border-[var(--color-border-focus)] transition-colors group"
        >
          <div>
            <h3 className="text-xs font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Users In Ledger</h3>
            <p className="text-3xl font-bold text-[var(--color-text-primary)] mt-1.5 group-hover:text-emerald-600 transition-colors">{kpiData.usersInLedger}</p>
          </div>
          <div className="w-12 h-12 rounded-xl flex items-center justify-center bg-emerald-50 group-hover:bg-emerald-100 transition-colors">
            <Users className="w-6 h-6 text-emerald-600" />
          </div>
        </div>
      </div>

      {/* Main Dashboard Split */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        
        {/* Left Column: Priority Alerts */}
        <div className="lg:col-span-1 flex flex-col gap-4">
          <h3 className="text-[11px] font-bold tracking-wider text-[var(--color-text-secondary)] uppercase flex items-center gap-2">
            <AlertTriangle className="w-3.5 h-3.5" />
            Priority Alerts
          </h3>
          
          <div className="flex flex-col gap-3">
            {alerts.length === 0 ? (
              <div className="bg-white border border-[var(--color-border-default)] rounded-xl p-6 flex flex-col items-center justify-center text-center shadow-sm h-full">
                <CheckCircle className="w-10 h-10 text-emerald-400 mb-3" />
                <h4 className="text-sm font-bold text-[var(--color-text-primary)]">All caught up</h4>
                <p className="text-xs text-[var(--color-text-secondary)] mt-1">No pending warnings or flagged items.</p>
              </div>
            ) : (
              alerts.map((alert) => (
                <div 
                  key={alert.id}
                  className={`bg-white border-l-4 rounded-xl p-4 shadow-sm flex flex-col gap-3 transition-colors ${
                    alert.type === 'critical' 
                      ? 'border-l-red-500 border border-y-[var(--color-border-default)] border-r-[var(--color-border-default)] hover:bg-red-50/50' 
                      : 'border-l-amber-400 border border-y-[var(--color-border-default)] border-r-[var(--color-border-default)] hover:bg-amber-50/50'
                  }`}
                >
                  <div>
                    <div className="flex items-start justify-between gap-2">
                      <h4 className={`text-sm font-bold ${alert.type === 'critical' ? 'text-red-700' : 'text-amber-700'}`}>
                        {alert.title}
                      </h4>
                      <span className="text-[10px] font-semibold text-[var(--color-text-muted)] whitespace-nowrap">
                        {alert.time}
                      </span>
                    </div>
                    <p className="text-xs font-medium text-[var(--color-text-secondary)] mt-1">
                      {alert.subtitle}
                    </p>
                  </div>
                  <button 
                    onClick={alert.onClick}
                    className="self-start text-xs font-bold text-[var(--color-text-primary)] hover:text-blue-600 flex items-center gap-1 transition-colors"
                  >
                    {alert.actionText} <ArrowRight className="w-3 h-3" />
                  </button>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Right Column: Activity Summary */}
        <div className="lg:col-span-2 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h3 className="text-[11px] font-bold tracking-wider text-[var(--color-text-secondary)] uppercase flex items-center gap-2">
              <Clock className="w-3.5 h-3.5" />
              Activity Summary
            </h3>
            <button 
              onClick={() => navigate('/new-requests')}
              className="text-xs font-semibold text-blue-600 hover:text-blue-700 transition-colors"
            >
              View all requests &rarr;
            </button>
          </div>
          
          <div className="bg-white border border-[var(--color-border-default)] rounded-xl shadow-sm overflow-hidden flex-1">
            <div className="divide-y divide-[var(--color-border-default)]">
              {visibleActivity.map((activity) => {
                const isClickable = !!activity.link;
                return (
                  <div
                    key={activity.id}
                    onClick={() => isClickable && handleActivityClick(activity.link)}
                    className={`p-4 flex items-start gap-4 transition-colors duration-150 ${
                      isClickable ? 'cursor-pointer hover:bg-gray-50 group' : ''
                    }`}
                  >
                    {/* Timeline dot */}
                    <div className="mt-1 shrink-0 relative">
                      <div className="w-2.5 h-2.5 rounded-full bg-[var(--color-border-default)] group-hover:bg-blue-400 transition-colors" />
                    </div>
                    
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-semibold text-[var(--color-text-primary)]">
                        {activity.description}
                      </p>
                      <p className="text-xs font-medium text-[var(--color-text-muted)] mt-1">
                        {formatActivityDate(activity.timestamp)}
                      </p>
                    </div>

                    {isClickable && (
                      <div className="shrink-0 self-center">
                        <ArrowRight className="w-4 h-4 text-[var(--color-text-muted)] group-hover:text-blue-500 transition-colors" />
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
            
            {visibleActivity.length === 0 && (
              <div className="p-8 text-center">
                <p className="text-sm font-medium text-[var(--color-text-muted)]">No recent activity to display.</p>
              </div>
            )}
          </div>
        </div>
        
      </div>
    </div>
  );
}
