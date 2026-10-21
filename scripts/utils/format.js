/**
 * Formatting utilities
 * Dates, relative times, numbers, file sizes, initials, search normalisation.
 */

/** Vietnamese day names, index 0 = Sunday. */
export const WEEKDAY_SHORT = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
export const WEEKDAY_FULL = [
  'Chủ Nhật',
  'Thứ Hai',
  'Thứ Ba',
  'Thứ Tư',
  'Thứ Năm',
  'Thứ Sáu',
  'Thứ Bảy',
];

/**
 * Format an absolute date.
 * @param {Date|string|number} value
 * @param {'short'|'medium'|'long'|'time'|'datetime'} style
 */
export function formatDate(value, style = 'medium') {
  const date = toDate(value);
  if (!date) return '';

  switch (style) {
    case 'short':
      return `${pad(date.getDate())}/${pad(date.getMonth() + 1)}/${date.getFullYear()}`;
    case 'long':
      return `${WEEKDAY_FULL[date.getDay()]}, ngày ${date.getDate()} tháng ${date.getMonth() + 1} năm ${date.getFullYear()}`;
    case 'time':
      return formatTime(date);
    case 'datetime':
      return `${formatDate(date, 'short')} · ${formatTime(date)}`;
    default:
      return `${pad(date.getDate())} tháng ${pad(date.getMonth() + 1)}, ${date.getFullYear()}`;
  }
}

/** Format a Date as HH:MM (24-hour). */
export function formatTime(value) {
  const date = toDate(value);
  if (!date) return '';
  return `${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

/**
 * Human-friendly relative time in Vietnamese.
 * @param {Date|string|number} value
 */
export function timeAgo(value) {
  const date = toDate(value);
  if (!date) return '';

  const diff = Date.now() - date.getTime();
  const abs = Math.abs(diff);
  const future = diff < 0;
  const suffix = future ? 'nữa' : 'trước';

  const minute = 60_000;
  const hour = 3_600_000;
  const day = 86_400_000;

  if (abs < 45_000) return 'vừa xong';
  if (abs < hour) return `${Math.round(abs / minute)} phút ${suffix}`;
  if (abs < day) return `${Math.round(abs / hour)} giờ ${suffix}`;
  if (abs < day * 2) return future ? 'ngày mai' : 'hôm qua';

  if (abs < day * 7) return `${Math.round(abs / day)} ngày ${suffix}`;
  if (abs < day * 30) return `${Math.round(abs / (day * 7))} tuần ${suffix}`;
  if (abs < day * 365) return `${Math.round(abs / (day * 30))} tháng ${suffix}`;
  return `${Math.round(abs / (day * 365))} năm ${suffix}`;
}

/** Calendar-friendly day bucket label used by chat separators. */
export function dayLabel(value) {
  const date = toDate(value);
  if (!date) return '';

  const today = startOfDay(new Date()).getTime();
  const target = startOfDay(date).getTime();
  const diffDays = Math.round((target - today) / 86_400_000);

  if (diffDays === 0) return 'Hôm nay';
  if (diffDays === -1) return 'Hôm qua';
  if (diffDays === 1) return 'Ngày mai';
  if (diffDays > 1 && diffDays < 7) return WEEKDAY_FULL[date.getDay()];
  return `${date.getDate()}/${date.getMonth() + 1}/${date.getFullYear()}`;
}

/** Midnight of a date. */
export function startOfDay(value) {
  const date = toDate(value) ?? new Date();
  date.setHours(0, 0, 0, 0);
  return date;
}

/** Add whole days to a date. */
export function addDays(value, days) {
  const date = new Date(toDate(value));
  date.setDate(date.getDate() + days);
  return date;
}

/**
 * School day number, matching the convention used by UTC timetables:
 * Thứ 2 = 2 (Monday) … Thứ 7 = 7 (Saturday), Chủ Nhật = 1 (Sunday).
 *
 * Note this is deliberately NOT ISO-8601 (which numbers Monday as 1); the
 * schedule data, the day rail and the agenda all key off the school number.
 */
export function schoolDay(value = new Date()) {
  const date = toDate(value);
  if (!date) return 1;
  return date.getDay() === 0 ? 1 : date.getDay() + 1;
}

/** Human label for a school day number. */
export function schoolDayLabel(day) {
  return WEEKDAY_FULL[day] ?? '';
}

/** Minutes since midnight. */
export function minutesOfDay(value) {
  const date = toDate(value);
  return date.getHours() * 60 + date.getMinutes();
}

/** Minutes between two clock times given as "HH:MM". */
export function minutesBetween(start, end) {
  return toMinutes(end) - toMinutes(start);
}

/** "HH:MM" -> minutes. */
export function toMinutes(time) {
  const [h, m] = String(time).split(':').map(Number);
  return h * 60 + (m || 0);
}

/** Countdown parts between now and a future date. */
export function countdownParts(target) {
  const diff = Math.max(0, toDate(target).getTime() - Date.now());
  return {
    total: diff,
    days: Math.floor(diff / 86_400_000),
    hours: Math.floor((diff / 3_600_000) % 24),
    minutes: Math.floor((diff / 60_000) % 60),
    seconds: Math.floor((diff / 1000) % 60),
    done: diff === 0,
  };
}

/* -------------------------------------------------------------------------- */
/* Numbers, text, files                                                        */
/* -------------------------------------------------------------------------- */

/** 1200 -> "1.200" */
export function formatNumber(value) {
  return new Intl.NumberFormat('vi-VN').format(value ?? 0);
}

/** Compact count for reaction chips: 1200 -> "1,2K". */
export function formatCompact(value) {
  const n = value ?? 0;
  if (n < 1000) return String(n);
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0).replace('.', ',')}K`;
  return `${(n / 1_000_000).toFixed(1).replace('.', ',')}M`;
}

/** Bytes -> human readable. */
export function formatBytes(bytes) {
  if (!bytes) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB'];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / 1024 ** index;
  return `${value.toFixed(index === 0 ? 0 : 1).replace('.', ',')} ${units[index]}`;
}

/**
 * Initials for an avatar, max 2 characters.
 *
 * Vietnamese names are written family-first ("Nguyễn Văn An"), so the pair is the
 * first and last word — "NA". Taking the last two words instead yields "VA",
 * which reads as the given name and is the wrong half of the name.
 */
export function initials(name = '') {
  const parts = String(name).trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '?';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

/** Strip Vietnamese diacritics for accent-insensitive search. */
export function deaccent(text = '') {
  return String(text)
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
}

/** Lowercase + deaccented, for search comparisons. */
export function normalizeSearch(text = '') {
  return deaccent(text).toLowerCase().trim();
}

/** True when `needle` occurs in `haystack`, accent-insensitive. */
export function matches(haystack, needle) {
  if (!needle) return true;
  return normalizeSearch(haystack).includes(normalizeSearch(needle));
}

/** Join truthy class names. */
export function cx(...parts) {
  return parts.filter(Boolean).join(' ');
}

/** Percentage helper, clamped to 0–100. */
export function percent(part, whole) {
  if (!whole) return 0;
  return Math.max(0, Math.min(100, Math.round((part / whole) * 100)));
}

/** Two-digit zero pad. */
export function pad(value) {
  return String(value).padStart(2, '0');
}

/** Safe Date coercion. */
function toDate(value) {
  if (value instanceof Date) return Number.isNaN(value.getTime()) ? null : value;
  if (typeof value === 'number') return new Date(value);
  if (typeof value === 'string') {
    /**
     * The UTC portal returns birthdays as "18/09/2008". `new Date()` only
     * reliably accepts ISO, and silently yields Invalid Date for this shape in
     * Chrome — which surfaces as a blank field with no error anywhere. Rewrite
     * it to ISO before parsing.
     */
    const dayFirst = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(value.trim());
    if (dayFirst) {
      const [, d, m, y] = dayFirst;
      return new Date(Number(y), Number(m) - 1, Number(d));
    }

    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? null : parsed;
  }
  return null;
}