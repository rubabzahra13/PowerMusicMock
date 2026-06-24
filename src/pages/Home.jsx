import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { format, isToday, parseISO, subDays } from 'date-fns';
import {
  ChevronRight,
  CalendarDays,
  Headphones,
  Handshake
} from 'lucide-react';
import { pendingRequests, handledRequests } from '../data/mockData';

// Mock emails for Customer Service
const mockEmails = [
  // Today (2026-06-24)
  { id: 'e1', receivedAt: '2026-06-24T08:15:00', flagged: false },
  { id: 'e2', receivedAt: '2026-06-24T09:30:00', flagged: true },
  { id: 'e3', receivedAt: '2026-06-24T10:45:00', flagged: false },
  { id: 'e4', receivedAt: '2026-06-24T11:20:00', flagged: false },
  { id: 'e5', receivedAt: '2026-06-24T13:10:00', flagged: false },
  { id: 'e6', receivedAt: '2026-06-24T14:40:00', flagged: false },
  { id: 'e7', receivedAt: '2026-06-24T16:05:00', flagged: false },
  
  // Yesterday (2026-06-23)
  { id: 'e8', receivedAt: '2026-06-23T08:00:00', flagged: false },
  { id: 'e9', receivedAt: '2026-06-23T10:00:00', flagged: false },
  { id: 'e10', receivedAt: '2026-06-23T11:30:00', flagged: true },
  { id: 'e11', receivedAt: '2026-06-23T14:00:00', flagged: false },
  { id: 'e12', receivedAt: '2026-06-23T15:30:00', flagged: false },
  { id: 'e13', receivedAt: '2026-06-23T16:45:00', flagged: false },
  
  // June 22
  { id: 'e14', receivedAt: '2026-06-22T09:00:00', flagged: false },
  { id: 'e15', receivedAt: '2026-06-22T11:00:00', flagged: false },
  { id: 'e16', receivedAt: '2026-06-22T13:00:00', flagged: false },
  { id: 'e17', receivedAt: '2026-06-22T15:00:00', flagged: true },
  
  // June 21
  { id: 'e18', receivedAt: '2026-06-21T10:00:00', flagged: false },
  { id: 'e19', receivedAt: '2026-06-21T14:00:00', flagged: false },
  
  // June 20
  { id: 'e20', receivedAt: '2026-06-20T11:00:00', flagged: false },
  { id: 'e21', receivedAt: '2026-06-20T16:00:00', flagged: false },
  
  // June 19
  { id: 'e22', receivedAt: '2026-06-19T09:00:00', flagged: false },
  { id: 'e23', receivedAt: '2026-06-19T14:00:00', flagged: true },
  
  // June 18
  { id: 'e24', receivedAt: '2026-06-18T10:00:00', flagged: false },
  { id: 'e25', receivedAt: '2026-06-18T15:00:00', flagged: false },
  
  // Older dates for 30d
  { id: 'e26', receivedAt: '2026-06-15T12:00:00', flagged: false },
  { id: 'e27', receivedAt: '2026-06-12T12:00:00', flagged: false },
  { id: 'e28', receivedAt: '2026-06-10T12:00:00', flagged: true },
  { id: 'e29', receivedAt: '2026-06-05T12:00:00', flagged: false },
  { id: 'e30', receivedAt: '2026-05-30T12:00:00', flagged: false }
];

// Helper to determine start and end date of period
const getRangeInterval = (rangeType, customStart, customEnd) => {
  const now = new Date();
  let start, end;
  end = now;
  
  if (rangeType === 'today') {
    start = new Date();
    start.setHours(0, 0, 0, 0);
    end = new Date();
    end.setHours(23, 59, 59, 999);
  } else if (rangeType === '7d') {
    start = subDays(now, 6);
    start.setHours(0, 0, 0, 0);
    end = new Date();
    end.setHours(23, 59, 59, 999);
  } else if (rangeType === '30d') {
    start = subDays(now, 29);
    start.setHours(0, 0, 0, 0);
    end = new Date();
    end.setHours(23, 59, 59, 999);
  } else if (rangeType === 'custom') {
    start = customStart ? new Date(customStart + 'T00:00:00') : subDays(now, 6);
    end = customEnd ? new Date(customEnd + 'T23:59:59') : now;
  }
  return { start, end };
};

function TrendChart({ title, data, labels, color = 'violet' }) {
  const maxVal = Math.max(...data, 1);
  const height = 160;
  const width = 500;
  const paddingLeft = 32;
  const paddingRight = 10;
  const paddingTop = 20;
  const paddingBottom = 30;
  
  const chartWidth = width - paddingLeft - paddingRight;
  const chartHeight = height - paddingTop - paddingBottom;
  
  const points = data.map((val, idx) => {
    const x = paddingLeft + (idx / (data.length - 1 || 1)) * chartWidth;
    const y = paddingTop + chartHeight - (val / maxVal) * chartHeight;
    return { x, y };
  });
  
  const linePath = points.map((p, idx) => `${idx === 0 ? 'M' : 'L'} ${p.x} ${p.y}`).join(' ');
  const areaPath = points.length > 0 
    ? `${linePath} L ${points[points.length - 1].x} ${paddingTop + chartHeight} L ${points[0].x} ${paddingTop + chartHeight} Z`
    : '';

  const strokeColor = color === 'violet' ? 'var(--color-brand-primary, #7c3aed)' : 'var(--color-brand-accent, #2563eb)';
  const gradientId = `chart-grad-${color}`;
  const labelInterval = data.length > 10 ? Math.ceil(data.length / 5) : 1;

  return (
    <div className="bg-white border border-[var(--color-border-default)] rounded-xl p-5 shadow-sm">
      <div className="flex items-center justify-between mb-4">
        <h4 className="text-xs font-bold uppercase tracking-wider text-[var(--color-text-secondary)]">{title}</h4>
      </div>
      
      <div className="relative">
        <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto overflow-visible select-none">
          <defs>
            <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor={strokeColor} stopOpacity="0.15" />
              <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
            </linearGradient>
          </defs>
          
          {/* Horizontal Grid Lines */}
          {[0, 0.5, 1].map((ratio, idx) => {
            const y = paddingTop + ratio * chartHeight;
            const gridVal = ratio === 0 ? maxVal : ratio === 0.5 ? Math.round(maxVal / 2) : 0;
            return (
              <g key={idx}>
                <line 
                  x1={paddingLeft} 
                  y1={y} 
                  x2={width - paddingRight} 
                  y2={y} 
                  stroke="var(--color-border-default)" 
                  strokeWidth="1" 
                  strokeDasharray="4 4" 
                />
                <text 
                  x={paddingLeft - 8} 
                  y={y + 4} 
                  textAnchor="end" 
                  className="text-[10px] font-semibold fill-[var(--color-text-muted)] font-sans"
                >
                  {gridVal}
                </text>
              </g>
            );
          })}
          
          {/* Chart Line & Fill */}
          {points.length > 0 && (
            <>
              <path d={areaPath} fill={`url(#${gradientId})`} />
              <path d={linePath} fill="none" stroke={strokeColor} strokeWidth="2" />
            </>
          )}
          
          {/* Points */}
          {points.map((p, idx) => (
            <circle 
              key={idx} 
              cx={p.x} 
              cy={p.y} 
              r={data.length > 15 ? "2" : "3.5"} 
              className="fill-white cursor-pointer hover:r-5 transition-all"
              stroke={strokeColor}
              strokeWidth="2"
            >
              <title>{`${labels[idx]}: ${data[idx]}`}</title>
            </circle>
          ))}
          
          {/* X Axis Labels */}
          {labels.map((lbl, idx) => {
            if (idx % labelInterval !== 0 && idx !== labels.length - 1) return null;
            const p = points[idx];
            if (!p) return null;
            return (
              <text 
                key={idx} 
                x={p.x} 
                y={height - 8} 
                textAnchor="middle" 
                className="text-[9px] font-semibold fill-[var(--color-text-muted)] font-sans"
              >
                {lbl}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const [dateRange, setDateRange] = useState('7d');
  
  // Custom Date Range Pickers (default to last 7 days)
  const [customStartDate, setCustomStartDate] = useState(() => 
    format(subDays(new Date(), 6), 'yyyy-MM-dd')
  );
  const [customEndDate, setCustomEndDate] = useState(() => 
    format(new Date(), 'yyyy-MM-dd')
  );

  // Combine and format requests
  const mockRequests = useMemo(() => [
    // Today (2026-06-24)
    { id: 'req-today-1', receivedAt: '2026-06-24T08:30:00', status: 'Pending' },
    { id: 'req-today-2', receivedAt: '2026-06-24T10:15:00', status: 'Handled' },
    { id: 'req-today-3', receivedAt: '2026-06-24T14:20:00', status: 'Pending' },
    
    // From mockData
    ...pendingRequests.map(r => ({ ...r, status: 'Pending' })),
    ...handledRequests.map(r => ({ ...r, status: 'Handled' })),
    
    // Extra older requests for 30d trend
    { id: 'req-old-1', receivedAt: '2026-06-15T09:00:00', status: 'Handled' },
    { id: 'req-old-2', receivedAt: '2026-06-12T14:30:00', status: 'Handled' },
    { id: 'req-old-3', receivedAt: '2026-06-08T11:00:00', status: 'Handled' },
    { id: 'req-old-4', receivedAt: '2026-06-05T16:00:00', status: 'Handled' },
    { id: 'req-old-5', receivedAt: '2026-06-01T10:00:00', status: 'Handled' },
    { id: 'req-old-6', receivedAt: '2026-05-28T09:00:00', status: 'Handled' }
  ], [pendingRequests, handledRequests]);

  // Compute metrics based on selected range
  const filteredEmails = useMemo(() => {
    const { start, end } = getRangeInterval(dateRange, customStartDate, customEndDate);
    return mockEmails.filter(e => {
      const d = new Date(e.receivedAt);
      return d >= start && d <= end;
    });
  }, [dateRange, customStartDate, customEndDate]);

  const filteredRequests = useMemo(() => {
    const { start, end } = getRangeInterval(dateRange, customStartDate, customEndDate);
    return mockRequests.filter(r => {
      const d = new Date(r.receivedAt);
      return d >= start && d <= end;
    });
  }, [dateRange, customStartDate, customEndDate]);

  // Metric calculation values
  const emailsReceivedCount = filteredEmails.length;
  const flaggedEmailsCount = filteredEmails.filter(e => e.flagged).length;
  
  const newRequestsCount = filteredRequests.length;
  const pendingRequestsCount = filteredRequests.filter(r => r.status === 'Pending').length;

  // Trend chart groupings
  const chartData = useMemo(() => {
    const { start, end } = getRangeInterval(dateRange, customStartDate, customEndDate);
    const diffTime = Math.abs(end - start);
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
    
    if (dateRange === 'today') {
      const hours = [8, 10, 12, 14, 16, 18, 20];
      const labels = ['08:00', '10:00', '12:00', '14:00', '16:00', '18:00', '20:00'];
      
      const emailData = hours.map(hour => {
        return mockEmails.filter(e => {
          const d = new Date(e.receivedAt);
          if (!isToday(d)) return false;
          const h = d.getHours();
          return h >= hour && h < hour + 2;
        }).length;
      });
      
      const requestData = hours.map(hour => {
        return mockRequests.filter(r => {
          const d = new Date(r.receivedAt);
          if (!isToday(d)) return false;
          const h = d.getHours();
          return h >= hour && h < hour + 2;
        }).length;
      });
      
      return { labels, emailData, requestData };
    } else {
      const numDays = dateRange === '7d' ? 7 : dateRange === '30d' ? 30 : Math.max(1, diffDays);
      const labels = [];
      const emailData = [];
      const requestData = [];
      
      for (let i = numDays - 1; i >= 0; i--) {
        const dayDate = subDays(end, i);
        const dayStr = format(dayDate, 'yyyy-MM-dd');
        
        labels.push(format(dayDate, 'dd MMM'));
        
        const dayEmailsCount = mockEmails.filter(e => {
          const d = new Date(e.receivedAt);
          return format(d, 'yyyy-MM-dd') === dayStr;
        }).length;
        emailData.push(dayEmailsCount);
        
        const dayRequestsCount = mockRequests.filter(r => {
          const d = new Date(r.receivedAt);
          return format(d, 'yyyy-MM-dd') === dayStr;
        }).length;
        requestData.push(dayRequestsCount);
      }
      
      return { labels, emailData, requestData };
    }
  }, [dateRange, customStartDate, customEndDate, mockRequests]);

  const now = new Date();

  return (
    <div className="max-w-[1200px] mx-auto select-none pb-12 space-y-8">
      {/* Welcome Header */}
      <div className="flex items-end justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-[var(--color-text-primary)]">Good morning, Andrea.</h1>
          <p className="text-sm text-[var(--color-text-secondary)] mt-1">Here is your operational overview for today.</p>
        </div>
        <p className="text-xs font-medium text-[var(--color-text-muted)]">{format(now, 'EEEE, d MMMM yyyy')}</p>
      </div>

      {/* Global Filter Bar */}
      <div className="bg-white border border-[var(--color-border-default)] rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 shadow-sm">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 shrink-0">
            <CalendarDays className="w-4 h-4 text-[var(--color-text-muted)]" />
            <span className="text-sm font-bold text-[var(--color-text-primary)]">Viewing period:</span>
          </div>
          <div className="flex gap-2 flex-wrap">
            {[
              { key: 'today', label: 'Today' },
              { key: '7d', label: 'Last 7 Days' },
              { key: '30d', label: 'Last 30 Days' },
              { key: 'custom', label: 'Custom Range' },
            ].map(opt => (
              <button
                key={opt.key}
                onClick={() => setDateRange(opt.key)}
                className={`px-4 py-1.5 text-sm font-semibold rounded-lg border transition-all cursor-pointer ${
                  dateRange === opt.key
                    ? 'bg-[var(--color-text-primary)] text-white border-[var(--color-text-primary)] shadow-sm'
                    : 'bg-white border-[var(--color-border-default)] text-[var(--color-text-secondary)] hover:border-[var(--color-text-secondary)]'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>

        {/* Custom Range Date Pickers */}
        {dateRange === 'custom' && (
          <div className="flex items-center gap-3 bg-gray-50 p-2 rounded-lg border border-[var(--color-border-default)] shrink-0 self-start md:self-auto">
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase">Start:</span>
              <input 
                type="date" 
                value={customStartDate} 
                onChange={(e) => setCustomStartDate(e.target.value)} 
                className="bg-white border border-[var(--color-border-default)] rounded px-2.5 py-1 text-xs font-semibold text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-text-secondary)]"
              />
            </div>
            <div className="flex items-center gap-1.5">
              <span className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase">End:</span>
              <input 
                type="date" 
                value={customEndDate} 
                onChange={(e) => setCustomEndDate(e.target.value)} 
                className="bg-white border border-[var(--color-border-default)] rounded px-2.5 py-1 text-xs font-semibold text-[var(--color-text-primary)] focus:outline-none focus:border-[var(--color-text-secondary)]"
              />
            </div>
          </div>
        )}
      </div>

      {/* Two Column Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 items-stretch">
        
        {/* Customer Service Card Container */}
        <div className="bg-white border border-[var(--color-border-default)] rounded-xl p-6 shadow-sm flex flex-col justify-between space-y-6">
          <div className="space-y-6">
            {/* Typography Header */}
            <div className="border-b border-[var(--color-border-default)] pb-4 flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-[var(--color-text-primary)] flex items-center gap-2">
                  <Headphones className="w-5 h-5 text-[var(--color-brand-primary)]" />
                  Customer Service
                </h2>
                <p className="text-xs font-semibold text-[var(--color-text-muted)] mt-1 uppercase tracking-wider">
                  Email Operations
                </p>
              </div>
              <button
                onClick={() => navigate('/templates')}
                className="text-xs font-semibold text-[var(--color-brand-primary)] hover:underline flex items-center gap-1 cursor-pointer"
              >
                Manage Templates <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Metric Cards Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-[var(--color-surface-panel)] border border-[var(--color-border-default)] rounded-xl p-4 flex flex-col shadow-sm">
                <span className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Emails Received</span>
                <span className="text-3xl font-extrabold text-[var(--color-text-primary)] mt-1">{emailsReceivedCount}</span>
                <span className="text-[10px] font-medium text-[var(--color-text-muted)] mt-1.5">AI processed this period</span>
              </div>
              
              <div 
                onClick={() => navigate('/gmail-accounts')}
                className="bg-[var(--color-surface-panel)] border border-[var(--color-border-default)] rounded-xl p-4 flex flex-col shadow-sm cursor-pointer hover:border-[var(--color-brand-primary)] transition-all group"
              >
                <span className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Flagged Emails</span>
                <span className="text-3xl font-extrabold text-[var(--color-text-primary)] mt-1 group-hover:text-[var(--color-brand-primary)] transition-colors">{flaggedEmailsCount}</span>
                <span className="text-[10px] font-medium text-[var(--color-text-muted)] mt-1.5">Require review</span>
              </div>
            </div>
          </div>

          {/* Email Volume Trend Chart */}
          <div className="pt-2">
            <TrendChart 
              title="Email Volume Trend" 
              data={chartData.emailData} 
              labels={chartData.labels}
              color="violet"
            />
          </div>
        </div>

        {/* Partner Management Card Container */}
        <div className="bg-white border border-[var(--color-border-default)] rounded-xl p-6 shadow-sm flex flex-col justify-between space-y-6">
          <div className="space-y-6">
            {/* Typography Header */}
            <div className="border-b border-[var(--color-border-default)] pb-4 flex items-start justify-between">
              <div>
                <h2 className="text-xl font-bold text-[var(--color-text-primary)] flex items-center gap-2">
                  <Handshake className="w-5 h-5 text-blue-600" />
                  Partner Management
                </h2>
                <p className="text-xs font-semibold text-[var(--color-text-muted)] mt-1 uppercase tracking-wider">
                  Member Access Requests
                </p>
              </div>
              <button
                onClick={() => navigate('/new-requests')}
                className="text-xs font-semibold text-blue-600 hover:underline flex items-center gap-1 cursor-pointer"
              >
                View Requests <ChevronRight className="w-3.5 h-3.5" />
              </button>
            </div>

            {/* Metric Cards Grid */}
            <div className="grid grid-cols-2 gap-4">
              <div 
                onClick={() => navigate('/new-requests')}
                className="bg-[var(--color-surface-panel)] border border-[var(--color-border-default)] rounded-xl p-4 flex flex-col shadow-sm cursor-pointer hover:border-blue-600 transition-all group"
              >
                <span className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">New Requests</span>
                <span className="text-3xl font-extrabold text-[var(--color-text-primary)] mt-1 group-hover:text-blue-600 transition-colors">{newRequestsCount}</span>
                <span className="text-[10px] font-medium text-[var(--color-text-muted)] mt-1.5">Submitted in period</span>
              </div>
              
              <div 
                onClick={() => navigate('/user-ledger')}
                className="bg-[var(--color-surface-panel)] border border-[var(--color-border-default)] rounded-xl p-4 flex flex-col shadow-sm cursor-pointer hover:border-blue-600 transition-all group"
              >
                <span className="text-[10px] font-bold text-[var(--color-text-secondary)] uppercase tracking-wider">Pending Requests</span>
                <span className="text-3xl font-extrabold text-[var(--color-text-primary)] mt-1 group-hover:text-blue-600 transition-colors">{pendingRequestsCount}</span>
                <span className="text-[10px] font-medium text-[var(--color-text-muted)] mt-1.5">Awaiting ledger entry</span>
              </div>
            </div>
          </div>

          {/* Request Volume Trend Chart */}
          <div className="pt-2">
            <TrendChart 
              title="Request Volume Trend" 
              data={chartData.requestData} 
              labels={chartData.labels}
              color="blue"
            />
          </div>
        </div>

      </div>
    </div>
  );
}

