type ParsedRange = {
  startUtc: Date;
  endUtcExclusive: Date;
  timezone: string;
  startDate: string;
  endDate: string;
};

const DEFAULT_TIMEZONE = 'Asia/Shanghai';
const DATE_ONLY_REGEX = /^\d{4}-\d{2}-\d{2}$/;

function isValidTimezone(timezone: string): boolean {
  try {
    Intl.DateTimeFormat('en-US', { timeZone: timezone }).format(new Date());
    return true;
  } catch {
    return false;
  }
}

function getOffsetMs(date: Date, timezone: string): number {
  const formatter = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    hour12: false,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });
  const parts = formatter.formatToParts(date);
  const map = new Map(parts.map((part) => [part.type, part.value]));
  const year = Number(map.get('year'));
  const month = Number(map.get('month'));
  const day = Number(map.get('day'));
  const hour = Number(map.get('hour'));
  const minute = Number(map.get('minute'));
  const second = Number(map.get('second'));
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  return asUtc - date.getTime();
}

function zonedMidnightToUtc(dateOnly: string, timezone: string): Date {
  const [year, month, day] = dateOnly.split('-').map(Number);
  const guessUtc = new Date(Date.UTC(year, month - 1, day, 0, 0, 0));
  const offsetMs = getOffsetMs(guessUtc, timezone);
  return new Date(guessUtc.getTime() - offsetMs);
}

function formatDateInTimezone(date: Date, timezone: string): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).format(date);
}

function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function weekdayInTimezone(date: Date, timezone: string): number {
  const label = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone,
    weekday: 'short',
  }).format(date);
  const map: Record<string, number> = {
    Sun: 0,
    Mon: 1,
    Tue: 2,
    Wed: 3,
    Thu: 4,
    Fri: 5,
    Sat: 6,
  };
  return map[label] ?? 0;
}

export function parseTimezone(searchParams: URLSearchParams): string {
  const timezone = searchParams.get('timezone')?.trim() || DEFAULT_TIMEZONE;
  return isValidTimezone(timezone) ? timezone : DEFAULT_TIMEZONE;
}

export function parseDateRange(searchParams: URLSearchParams): ParsedRange {
  const timezone = parseTimezone(searchParams);
  const endDateParam = searchParams.get('endDate')?.trim();
  const startDateParam = searchParams.get('startDate')?.trim();

  const now = new Date();
  const defaultEndDate = formatDateInTimezone(now, timezone);
  const safeEndDate =
    endDateParam && DATE_ONLY_REGEX.test(endDateParam) ? endDateParam : defaultEndDate;

  const defaultStartUtc = addDays(zonedMidnightToUtc(safeEndDate, timezone), -29);
  const defaultStartDate = formatDateInTimezone(defaultStartUtc, timezone);
  const safeStartDate =
    startDateParam && DATE_ONLY_REGEX.test(startDateParam) ? startDateParam : defaultStartDate;

  const startUtc = zonedMidnightToUtc(safeStartDate, timezone);
  const endUtcExclusive = addDays(zonedMidnightToUtc(safeEndDate, timezone), 1);

  if (startUtc.getTime() >= endUtcExclusive.getTime()) {
    const fallbackStartUtc = addDays(endUtcExclusive, -1);
    return {
      startUtc: fallbackStartUtc,
      endUtcExclusive,
      timezone,
      startDate: formatDateInTimezone(fallbackStartUtc, timezone),
      endDate: safeEndDate,
    };
  }

  return {
    startUtc,
    endUtcExclusive,
    timezone,
    startDate: safeStartDate,
    endDate: safeEndDate,
  };
}

export function parseFilters(searchParams: URLSearchParams): {
  provider?: string;
  model?: string;
  onlyError: boolean;
} {
  const provider = searchParams.get('provider')?.trim() || undefined;
  const model = searchParams.get('model')?.trim() || undefined;
  const onlyErrorRaw = searchParams.get('onlyError')?.trim().toLowerCase();
  const onlyError = onlyErrorRaw === '1' || onlyErrorRaw === 'true';
  return { provider, model, onlyError };
}

export function toIsoWeekStart(date: Date, timezone: string): Date {
  const dayInTz = formatDateInTimezone(date, timezone);
  const localMidnightUtc = zonedMidnightToUtc(dayInTz, timezone);
  const weekday = weekdayInTimezone(localMidnightUtc, timezone);
  const offsetDays = weekday === 0 ? -6 : 1 - weekday;
  return addDays(localMidnightUtc, offsetDays);
}

export function formatBucketDate(date: Date, timezone: string): string {
  return formatDateInTimezone(date, timezone);
}

export function buildWhereForStats(input: {
  startUtc: Date;
  endUtcExclusive: Date;
  provider?: string;
  model?: string;
}) {
  const { startUtc, endUtcExclusive, provider, model } = input;
  return {
    bucketDate: {
      gte: startUtc,
      lt: endUtcExclusive,
    },
    ...(provider ? { provider } : {}),
    ...(model ? { model } : {}),
  };
}
