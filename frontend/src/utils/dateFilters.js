import {
  startOfWeek,
  endOfWeek,
  subDays,
  startOfMonth,
  endOfMonth,
  startOfYear,
  endOfYear,
  startOfDay,
  endOfDay,
  parseISO
} from 'date-fns';

/**
 * Calculate the start and end Date objects for a given filter.
 * Returns { start: Date|null, end: Date|null }.
 */
export function calculateDateBounds(type, value) {
  const now = new Date();

  switch (type) {
    case 'all':
      return { start: null, end: null };
    case 'thisWeek':
      return {
        start: startOfWeek(now, { weekStartsOn: 1 }),
        end: endOfWeek(now, { weekStartsOn: 1 })
      };
    case 'last30Days':
      return {
        start: startOfDay(subDays(now, 29)), // 30 days including today
        end: endOfDay(now)
      };
    case 'thisMonth':
      return {
        start: startOfMonth(now),
        end: endOfDay(now)
      };
    case 'month': {
      // value is like '2026-08'
      if (!value) return { start: null, end: null };
      const [yearStr, monthStr] = value.split('-');
      const target = new Date(parseInt(yearStr, 10), parseInt(monthStr, 10) - 1, 1);
      return {
        start: startOfMonth(target),
        end: endOfMonth(target)
      };
    }
    case 'year': {
      // value is like '2026'
      if (!value) return { start: null, end: null };
      const target = new Date(parseInt(value, 10), 0, 1);
      return {
        start: startOfYear(target),
        end: endOfYear(target)
      };
    }
    case 'custom': {
      // value is like { start: '2026-08-01', end: '2026-08-12' }
      if (!value?.start || !value?.end) return { start: null, end: null };
      // Note: passing just 'YYYY-MM-DD' to Date constructor uses UTC at midnight.
      // Better to split and use local Date constructor to avoid time zone shifts.
      const parseLocal = (ymd) => {
        const [y, m, d] = ymd.split('-');
        return new Date(parseInt(y, 10), parseInt(m, 10) - 1, parseInt(d, 10));
      };
      return {
        start: startOfDay(parseLocal(value.start)),
        end: endOfDay(parseLocal(value.end))
      };
    }
    default:
      return { start: null, end: null };
  }
}

/**
 * Filter an array of items based on a date range.
 * @param {Array} items
 * @param {Function} timestampGetter - function(item) returns ISO string or Date
 * @param {Object} bounds - { start, end } Date objects
 */
export function filterByDateRange(items, timestampGetter, bounds) {
  if (!Array.isArray(items)) return items;
  if (!bounds || (!bounds.start && !bounds.end)) return items;

  const startMs = bounds.start ? bounds.start.getTime() : -Infinity;
  const endMs = bounds.end ? bounds.end.getTime() : Infinity;

  return items.filter((item) => {
    const ts = timestampGetter(item);
    if (!ts) return false;
    
    let timeMs;
    if (ts instanceof Date) {
      timeMs = ts.getTime();
    } else {
      const parsed = parseISO(ts);
      if (isNaN(parsed.getTime())) return false;
      timeMs = parsed.getTime();
    }
    
    return timeMs >= startMs && timeMs <= endMs;
  });
}
