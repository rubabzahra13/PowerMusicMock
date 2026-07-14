import { useState, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { format, isToday, isYesterday, parseISO } from 'date-fns';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Inbox,
  Mail,
  UserMinus,
  UserPlus,
  Users,
} from 'lucide-react';
import PageHeader from '../components/layout/PageHeader';
import { loadWithCache, getDashboard } from '../utils/pilot2Api';
import { PanelListSkeleton } from '../components/ui';
import { TAG_ALREADY_EXISTS } from '../utils/requestTags';

const CHART = {
  pink: '#e94560',
  pinkSoft: 'rgba(233, 69, 96, 0.18)',
  blue: '#3b6ea5',
  blueSoft: 'rgba(59, 110, 165, 0.18)',
  grey: '#9ca3af',
  greySoft: 'rgba(156, 163, 175, 0.22)',
  track: '#e8eaef',
};

const EMPTY_INSIGHTS = {
  pendingAdd: 0,
  pendingRemove: 0,
  awaitingPartner: 0,
  duplicates: 0,
  autoMail: 0,
  partnerReq: 0,
  usersAdded: 0,
  usersRemoved: 0,
  handledThisWeek: 0,
  receivedThisWeek: 0,
  weeklyTrend: [],
};

function formatActivityDate(isoString) {
  try {
    const date = parseISO(isoString);
    if (isToday(date)) return `Today, ${format(date, 'HH:mm')}`;
    if (isYesterday(date)) return `Yesterday, ${format(date, 'HH:mm')}`;
    return format(date, 'dd MMM, HH:mm');
  } catch {
    return isoString;
  }
}

function InsightCard({ label, value, hint, icon: Icon, accent, onClick }) {
  const accents = {
    pink: { well: 'bg-[var(--color-brand-accent)]/10', icon: 'text-[var(--color-brand-accent)]' },
    blue: { well: 'bg-[#3b6ea5]/10', icon: 'text-[#3b6ea5]' },
    grey: { well: 'bg-[var(--color-surface-highlight)]', icon: 'text-[var(--color-text-secondary)]' },
  };
  const tone = accents[accent] || accents.grey;
  const Tag = onClick ? 'button' : 'div';

  return (
    <Tag
      type={onClick ? 'button' : undefined}
      onClick={onClick}
      className={`h-full rounded-2xl border border-[var(--color-border-default)] bg-white p-3.5 text-left shadow-sm transition-colors sm:p-4 ${
        onClick ? 'cursor-pointer hover:border-[#c5daf3] hover:bg-[#f7fafc]' : ''
      }`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[11px] font-semibold uppercase tracking-wider text-[var(--color-text-muted)]">
            {label}
          </p>
          <p className="mt-1 text-xl font-bold tabular-nums text-[var(--color-text-primary)] sm:text-2xl">
            {value}
          </p>
          {hint && (
            <p className="mt-0.5 text-xs text-[var(--color-text-secondary)] leading-snug">{hint}</p>
          )}
        </div>
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${tone.well}`}>
          <Icon className={`h-4 w-4 ${tone.icon}`} aria-hidden="true" />
        </div>
      </div>
    </Tag>
  );
}

function ChartCard({ title, subtitle, legend, children, className = '' }) {
  return (
    <section
      className={`flex h-full min-h-0 flex-col rounded-2xl border border-[var(--color-border-default)] bg-white p-4 shadow-sm ${className}`}
    >
      <div className="mb-4 shrink-0 space-y-2">
        <div className="flex items-center justify-between gap-3">
          <h2 className="min-w-0 text-sm font-bold text-[var(--color-text-primary)]">{title}</h2>
          {legend ? <div className="shrink-0">{legend}</div> : null}
        </div>
        {subtitle ? (
          <p className="text-xs leading-snug text-[var(--color-text-secondary)]">{subtitle}</p>
        ) : null}
      </div>
      <div className="flex min-h-0 flex-1 flex-col">{children}</div>
    </section>
  );
}

function PanelHeader({ title, subtitle, action }) {
  return (
    <div className="mb-3 flex shrink-0 items-start justify-between gap-3">
      <div className="min-w-0">
        <h2 className="text-sm font-bold text-[var(--color-text-primary)]">{title}</h2>
        {subtitle ? (
          <p className="mt-0.5 text-xs leading-snug text-[var(--color-text-secondary)]">{subtitle}</p>
        ) : null}
      </div>
      {action ? <div className="shrink-0 pt-0.5">{action}</div> : null}
    </div>
  );
}

function QueueLink({ onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="whitespace-nowrap text-xs font-semibold text-[#3b6ea5] hover:underline"
    >
      Open queue
    </button>
  );
}

function LegendDot({ color, label }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-[11px] font-medium text-[var(--color-text-secondary)]">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} aria-hidden="true" />
      {label}
    </span>
  );
}

function niceTicks(maxValue, count = 3) {
  const capped = Math.max(1, maxValue);
  const rough = capped / Math.max(1, count - 1);
  const magnitude = 10 ** Math.floor(Math.log10(rough));
  const normalized = rough / magnitude;
  const stepBase = normalized <= 1.5 ? 1 : normalized <= 3 ? 2 : normalized <= 7 ? 5 : 10;
  const step = stepBase * magnitude;
  const top = Math.ceil(capped / step) * step;
  const ticks = [];
  for (let value = 0; value <= top + 1e-9; value += step) {
    ticks.push(Math.round(value));
  }
  if (ticks[ticks.length - 1] !== top) ticks.push(top);
  return { ticks, top: Math.max(top, 1) };
}

function WeeklyTrendChart({ days }) {
  const rawMax = Math.max(1, ...days.flatMap((d) => [d.received, d.handled]));
  const { ticks, top } = niceTicks(rawMax, 4);
  const chartH = 110;
  const topPad = 6;
  const leftPad = 36;
  const bottomPad = 24;
  const barW = 10;
  const gap = 14;
  const groupW = barW * 2 + 4;
  const plotW = Math.max(days.length * (groupW + gap), 260);
  const width = leftPad + plotW;
  const height = chartH + topPad + bottomPad;

  return (
    <div className="flex h-full w-full min-h-[9.5rem] items-end">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="h-[9.5rem] w-full"
        role="img"
        aria-label="Weekly received versus handled requests"
        preserveAspectRatio="xMidYMid meet"
      >
        {ticks.map((tick) => {
          const y = topPad + chartH - (tick / top) * chartH;
          return (
            <g key={tick}>
              <line
                x1={leftPad}
                x2={width}
                y1={y}
                y2={y}
                stroke={CHART.track}
                strokeWidth="1"
              />
              <text
                x={leftPad - 8}
                y={y + 3}
                textAnchor="end"
                className="fill-[var(--color-text-muted)]"
                style={{ fontSize: 10, fontWeight: 600 }}
              >
                {tick}
              </text>
            </g>
          );
        })}
        <line
          x1={leftPad}
          x2={leftPad}
          y1={topPad}
          y2={topPad + chartH}
          stroke={CHART.track}
          strokeWidth="1"
        />
        {days.map((day, index) => {
          const x = leftPad + index * (groupW + gap) + 6;
          const receivedH = (day.received / top) * chartH;
          const handledH = (day.handled / top) * chartH;
          const receivedY = topPad + chartH - receivedH;
          const handledY = topPad + chartH - handledH;
          return (
            <g key={day.date}>
              <rect
                x={x}
                y={receivedY}
                width={barW}
                height={Math.max(receivedH, day.received ? 3 : 0)}
                rx="3"
                fill={CHART.blue}
              >
                <title>{`${day.label}: ${day.received} received`}</title>
              </rect>
              <rect
                x={x + barW + 3}
                y={handledY}
                width={barW}
                height={Math.max(handledH, day.handled ? 3 : 0)}
                rx="3"
                fill={CHART.pink}
              >
                <title>{`${day.label}: ${day.handled} handled`}</title>
              </rect>
              <text
                x={x + groupW / 2 - 1}
                y={topPad + chartH + 16}
                textAnchor="middle"
                className="fill-[var(--color-text-muted)]"
                style={{ fontSize: 10, fontWeight: 600 }}
              >
                {day.label}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function DonutChart({ segments, centerLabel, centerValue }) {
  const size = 128;
  const stroke = 14;
  const radius = (size - stroke) / 2;
  const circumference = 2 * Math.PI * radius;
  const total = segments.reduce((sum, s) => sum + s.value, 0) || 1;

  let offset = 0;
  const arcs = segments.map((segment) => {
    const length = (segment.value / total) * circumference;
    const arc = {
      ...segment,
      dasharray: `${length} ${circumference - length}`,
      dashoffset: -offset,
    };
    offset += length;
    return arc;
  });

  return (
    <div className="flex h-full min-h-[9.5rem] flex-col items-center justify-center gap-4 sm:flex-row sm:justify-center sm:gap-8">
      <div className="relative shrink-0">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} role="img" aria-label={centerLabel}>
          <circle
            cx={size / 2}
            cy={size / 2}
            r={radius}
            fill="none"
            stroke={CHART.track}
            strokeWidth={stroke}
          />
          {arcs.map((arc) => (
            <circle
              key={arc.label}
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke={arc.color}
              strokeWidth={stroke}
              strokeDasharray={arc.dasharray}
              strokeDashoffset={arc.dashoffset}
              strokeLinecap="butt"
              transform={`rotate(-90 ${size / 2} ${size / 2})`}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center">
          <p className="text-xl font-bold tabular-nums text-[var(--color-text-primary)]">{centerValue}</p>
          <p className="text-[10px] font-medium text-[var(--color-text-muted)]">{centerLabel}</p>
        </div>
      </div>
      <ul className="w-full max-w-[9rem] space-y-2.5">
        {segments.map((segment) => (
          <li key={segment.label} className="flex items-center justify-between gap-3 text-sm">
            <span className="inline-flex items-center gap-2 text-[var(--color-text-secondary)]">
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: segment.color }} />
              {segment.label}
            </span>
            <span className="font-semibold tabular-nums text-[var(--color-text-primary)]">
              {segment.value}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function ArrivalSourceList({ partnerReq, autoMail, onOpenQueue }) {
  const total = Math.max(partnerReq + autoMail, 1);
  const rows = [
    {
      key: 'partner',
      label: 'Partner requests',
      detail: `${Math.round((partnerReq / total) * 100)}% of pending`,
      value: partnerReq,
      pct: (partnerReq / total) * 100,
      color: CHART.blue,
      Icon: Inbox,
      accent: 'border-l-[#3b6ea5]',
      well: 'bg-[#3b6ea5]/10',
      iconClass: 'text-[#3b6ea5]',
    },
    {
      key: 'auto',
      label: 'Automated email',
      detail: `${Math.round((autoMail / total) * 100)}% of pending`,
      value: autoMail,
      pct: (autoMail / total) * 100,
      color: CHART.pink,
      Icon: Mail,
      accent: 'border-l-[var(--color-brand-accent)]',
      well: 'bg-[var(--color-brand-accent)]/10',
      iconClass: 'text-[var(--color-brand-accent)]',
    },
  ];

  return (
    <ul className="flex min-h-0 flex-1 flex-col justify-start space-y-1.5">
      {rows.map((row) => {
        const Icon = row.Icon;
        return (
          <li key={row.key}>
            <button
              type="button"
              onClick={onOpenQueue}
              className={`flex w-full items-start gap-2.5 rounded-xl border border-[var(--color-border-default)] border-l-[3px] ${row.accent} bg-white px-2.5 py-2 text-left transition-colors hover:bg-[var(--color-surface-panel)]`}
            >
              <div className={`mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${row.well}`}>
                <Icon className={`h-3.5 w-3.5 ${row.iconClass}`} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
                    {row.label}
                  </p>
                  <p className="shrink-0 text-sm font-bold tabular-nums text-[var(--color-text-primary)]">
                    {row.value}
                  </p>
                </div>
                <p className="mt-0.5 text-xs text-[var(--color-text-secondary)]">{row.detail}</p>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-[var(--color-surface-highlight)]">
                  <div
                    className="h-full rounded-full"
                    style={{ width: `${row.pct}%`, backgroundColor: row.color }}
                  />
                </div>
              </div>
            </button>
          </li>
        );
      })}
    </ul>
  );
}

export default function Home() {
  const navigate = useNavigate();
  const location = useLocation();

  const [pendingRequests, setPendingRequests] = useState([]);
  const [kpis, setKpis] = useState({ pendingRequests: 0, usersInLedger: 0 });
  const [insights, setInsights] = useState(EMPTY_INSIGHTS);
  const [activity, setActivity] = useState([]);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const applyDashboard = (data) => {
      setPendingRequests(data.pendingRequests || []);
      setKpis(data.kpis || { pendingRequests: 0, usersInLedger: 0 });
      setInsights(data.insights || EMPTY_INSIGHTS);
      setActivity(data.activity || []);
      setReady(true);
    };
    const load = () => {
      loadWithCache('home_dashboard_v2', getDashboard, applyDashboard).catch((err) => {
        console.error(err);
        setReady(true);
      });
    };
    load();
    const refresh = () => { if (!document.hidden) load(); };
    window.addEventListener('focus', refresh);
    return () => window.removeEventListener('focus', refresh);
  }, [location.key]);

  const duplicateAlerts = useMemo(
    () => (Array.isArray(pendingRequests) ? pendingRequests : [])
      .filter((req) => req.tags?.includes(TAG_ALREADY_EXISTS))
      .sort((a, b) => new Date(b.receivedAt) - new Date(a.receivedAt))
      .slice(0, 4),
    [pendingRequests],
  );

  const recentActivity = useMemo(
    () => (Array.isArray(activity) ? activity : []).slice(0, 5),
    [activity],
  );

  const actionSegments = [
    { label: 'Add', value: insights.pendingAdd, color: CHART.blue },
    { label: 'Remove', value: insights.pendingRemove, color: CHART.pink },
  ];

  const trendDays = insights.weeklyTrend?.length
    ? insights.weeklyTrend
    : Array.from({ length: 7 }, (_, i) => ({
        date: `d${i}`,
        label: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'][i],
        received: 0,
        handled: 0,
      }));

  const activityIcon = (type) => {
    if (type === 'marked_added') return UserPlus;
    if (type === 'marked_removed') return UserMinus;
    if (type === 'automated_email') return Mail;
    if (type === 'tag_applied') return AlertTriangle;
    return Inbox;
  };

  return (
    <div className="mx-auto flex min-h-0 w-full max-w-7xl flex-1 flex-col overflow-y-auto overscroll-contain select-none">
      <PageHeader
        section="Overview"
        title="Hello Andrea."
        description="A live view of partner requests, ledger health, and what needs your attention."
        className="mb-3 shrink-0"
      />

      {!ready ? (
        <div className="space-y-4 pb-6">
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {[0, 1, 2, 3].map((key) => (
              <div key={key} className="h-24 animate-pulse rounded-2xl bg-[var(--color-surface-highlight)]" />
            ))}
          </div>
          <PanelListSkeleton rows={3} />
        </div>
      ) : (
        <div className="flex min-h-0 flex-1 flex-col gap-3 pb-4 xl:overflow-hidden">
          <div className="grid shrink-0 grid-cols-1 gap-2.5 sm:grid-cols-2 xl:grid-cols-4">
            <InsightCard
              label="Pending requests"
              value={kpis.pendingRequests}
              hint={`${insights.awaitingPartner} awaiting partner confirmation`}
              icon={Inbox}
              accent="blue"
              onClick={() => navigate('/new-requests')}
            />
            <InsightCard
              label="Users in ledger"
              value={kpis.usersInLedger}
              hint={`${insights.usersRemoved} removed on record`}
              icon={Users}
              accent="grey"
              onClick={() => navigate('/directory')}
            />
            <InsightCard
              label="Handled this week"
              value={insights.handledThisWeek}
              hint={`${insights.receivedThisWeek} new requests received`}
              icon={CheckCircle2}
              accent="pink"
              onClick={() => navigate('/directory')}
            />
            <InsightCard
              label="Needs review"
              value={insights.duplicates}
              hint="Possible duplicates in the queue"
              icon={AlertTriangle}
              accent="pink"
              onClick={() => navigate('/new-requests')}
            />
          </div>

          <div className="grid min-h-0 shrink-0 grid-cols-1 gap-3 xl:grid-cols-5">
            <div className="min-h-[16rem] xl:col-span-3">
              <ChartCard
                title="This week’s flow"
                subtitle="Requests received vs requests you handled"
                legend={(
                  <div className="flex items-center gap-3">
                    <LegendDot color={CHART.blue} label="Received" />
                    <LegendDot color={CHART.pink} label="Handled" />
                  </div>
                )}
              >
                <WeeklyTrendChart days={trendDays} />
              </ChartCard>
            </div>

            <div className="min-h-[16rem] xl:col-span-2">
              <ChartCard
                title="Pending by action"
                subtitle="What’s waiting in New requests"
              >
                <DonutChart
                  segments={actionSegments}
                  centerValue={kpis.pendingRequests}
                  centerLabel="pending"
                />
              </ChartCard>
            </div>
          </div>

          <div className="grid min-h-0 flex-1 grid-cols-1 gap-3 lg:grid-cols-3 lg:items-stretch">
            <section className="flex min-h-[18rem] flex-col rounded-2xl border border-[var(--color-border-default)] bg-white p-4 shadow-sm lg:h-full">
              <PanelHeader
                title="How pending requests arrived"
                subtitle="Partner form vs automated email"
                action={<QueueLink onClick={() => navigate('/new-requests')} />}
              />
              <ArrivalSourceList
                partnerReq={insights.partnerReq}
                autoMail={insights.autoMail}
                onOpenQueue={() => navigate('/new-requests')}
              />
            </section>

            <section className="flex min-h-[18rem] flex-col rounded-2xl border border-[var(--color-border-default)] bg-white p-4 shadow-sm lg:h-full">
              <PanelHeader
                title="Priority alerts"
                subtitle={duplicateAlerts.length ? 'Possible duplicate people' : 'All clear'}
                action={<QueueLink onClick={() => navigate('/new-requests')} />}
              />
              {duplicateAlerts.length === 0 ? (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl bg-[var(--color-surface-panel)] px-3 py-4 text-center">
                  <CheckCircle2 className="mb-1.5 h-6 w-6 text-[var(--color-signal-green)]" />
                  <p className="text-sm font-medium text-[var(--color-text-secondary)]">No duplicate alerts</p>
                </div>
              ) : (
                <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
                  {duplicateAlerts.map((req) => (
                    <li key={req.id}>
                      <button
                        type="button"
                        onClick={() => navigate(`/new-requests/${encodeURIComponent(req.id)}`)}
                        className="flex w-full items-start gap-2.5 rounded-xl border border-[var(--color-border-default)] border-l-[3px] border-l-[var(--color-brand-accent)] bg-white px-2.5 py-2 text-left transition-colors hover:bg-[#fff7f8]"
                      >
                        <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-brand-accent)]/10">
                          <AlertTriangle className="h-3.5 w-3.5 text-[var(--color-brand-accent)]" />
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-semibold text-[var(--color-text-primary)]">
                            {`${req.person?.firstName || ''} ${req.person?.lastName || ''}`.trim() || 'Unknown'}
                          </p>
                          <p className="truncate text-xs text-[var(--color-text-secondary)]">{req.person?.email}</p>
                          <p className="mt-0.5 text-[10px] font-semibold text-[var(--color-text-muted)]">
                            {formatActivityDate(req.receivedAt)}
                          </p>
                        </div>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            <section className="flex min-h-[18rem] flex-col rounded-2xl border border-[var(--color-border-default)] bg-white p-4 shadow-sm lg:h-full">
              <PanelHeader
                title="Recent activity"
                subtitle="Latest request events"
                action={<QueueLink onClick={() => navigate('/new-requests')} />}
              />
              {recentActivity.length === 0 ? (
                <div className="flex min-h-0 flex-1 flex-col items-center justify-center rounded-xl bg-[var(--color-surface-panel)] px-3 py-4 text-center">
                  <p className="text-sm font-medium text-[var(--color-text-secondary)]">No recent activity</p>
                </div>
              ) : (
                <ul className="min-h-0 flex-1 space-y-1.5 overflow-y-auto">
                  {recentActivity.map((item) => {
                    const Icon = activityIcon(item.type);
                    const clickable = Boolean(item.linkedRequestId);
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          disabled={!clickable}
                          onClick={() => {
                            if (!item.linkedRequestId) return;
                            const handled = item.type === 'marked_added' || item.type === 'marked_removed';
                            navigate(
                              handled
                                ? `/directory?id=${encodeURIComponent(item.linkedRequestId)}`
                                : `/new-requests/${encodeURIComponent(item.linkedRequestId)}`,
                            );
                          }}
                          className={`flex w-full items-start gap-2.5 rounded-xl border border-[var(--color-border-default)] bg-white px-2.5 py-2 text-left transition-colors ${
                            clickable ? 'cursor-pointer hover:bg-[var(--color-surface-panel)]' : 'cursor-default'
                          }`}
                        >
                          <div className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-[var(--color-surface-highlight)]">
                            <Icon className="h-3.5 w-3.5 text-[#3b6ea5]" />
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="flex items-start justify-between gap-2">
                              <p className="truncate text-sm font-semibold leading-snug text-[var(--color-text-primary)]">
                                {item.description}
                              </p>
                              {clickable ? (
                                <ArrowRight className="mt-0.5 h-3.5 w-3.5 shrink-0 text-[var(--color-text-muted)]" />
                              ) : null}
                            </div>
                            <p className="mt-0.5 text-[10px] font-medium text-[var(--color-text-muted)]">
                              {formatActivityDate(item.timestamp)}
                            </p>
                          </div>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
