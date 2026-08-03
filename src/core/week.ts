export interface WeekIdentity {
  readonly end: string;
  readonly id: string;
  readonly start: string;
  readonly timezone: string;
}

interface LocalDate {
  readonly day: number;
  readonly month: number;
  readonly year: number;
}

interface LocalDateTime extends LocalDate {
  readonly hour: number;
  readonly minute: number;
  readonly second: number;
}

export function isValidTimeZone(timezone: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: timezone }).format(0);
    return true;
  } catch {
    return false;
  }
}

export function resolveDefaultTimeZone(
  candidate = Intl.DateTimeFormat().resolvedOptions().timeZone,
) {
  return isValidTimeZone(candidate) ? candidate : "UTC";
}

function dateTimeParts(instant: Date, timezone: string): LocalDateTime {
  const formatter = new Intl.DateTimeFormat("en-CA-u-ca-iso8601", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    second: "2-digit",
    timeZone: timezone,
    year: "numeric",
  });
  const values = Object.fromEntries(
    formatter
      .formatToParts(instant)
      .filter((part) => part.type !== "literal")
      .map((part) => [part.type, Number(part.value)]),
  );
  const { day, hour, minute, month, second, year } = values;
  if (
    day === undefined ||
    hour === undefined ||
    minute === undefined ||
    month === undefined ||
    second === undefined ||
    year === undefined
  )
    throw new RangeError("Unable to resolve time zone date parts.");
  return { day, hour, minute, month, second, year };
}

function addDays(date: LocalDate, days: number): LocalDate {
  const value = new Date(Date.UTC(date.year, date.month - 1, date.day + days));
  return {
    day: value.getUTCDate(),
    month: value.getUTCMonth() + 1,
    year: value.getUTCFullYear(),
  };
}

function dateKey(date: LocalDate): string {
  return `${String(date.year).padStart(4, "0")}-${String(date.month).padStart(2, "0")}-${String(date.day).padStart(2, "0")}`;
}

function localMidnightInstant(date: LocalDate, timezone: string): string {
  const target = Date.UTC(date.year, date.month - 1, date.day);
  let guess = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const actual = dateTimeParts(new Date(guess), timezone);
    const actualAsUtc = Date.UTC(
      actual.year,
      actual.month - 1,
      actual.day,
      actual.hour,
      actual.minute,
      actual.second,
    );
    const correction = target - actualAsUtc;
    guess += correction;
    if (correction === 0) break;
  }
  return new Date(guess).toISOString();
}

export function getWeekIdentity(now: Date, timezone: string): WeekIdentity {
  if (!isValidTimeZone(timezone))
    throw new RangeError("Invalid IANA time zone.");
  const local = dateTimeParts(now, timezone);
  const weekday = new Date(
    Date.UTC(local.year, local.month - 1, local.day),
  ).getUTCDay();
  const startDate = addDays(local, -((weekday + 6) % 7));
  const endDate = addDays(startDate, 7);
  return {
    end: localMidnightInstant(endDate, timezone),
    id: `${timezone}:${dateKey(startDate)}/${dateKey(endDate)}`,
    start: localMidnightInstant(startDate, timezone),
    timezone,
  };
}
