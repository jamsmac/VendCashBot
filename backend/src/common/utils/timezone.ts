/**
 * Timezone utilities for VendCash.
 *
 * The application operates in Asia/Tashkent (UTC+5, no DST).
 * Frontend sends date-only strings like "2025-02-10" meaning local Tashkent dates.
 * Database stores timestamps in UTC.
 *
 * These helpers convert local date strings to correct UTC Date objects
 * so that SQL queries match the user's intended date range.
 */

/** UTC offset for Asia/Tashkent in hours. Uzbekistan has no DST. */
const TASHKENT_OFFSET_HOURS = 5;

/**
 * Convert a date-only string (YYYY-MM-DD) to the START of that day
 * in Tashkent timezone, expressed as a UTC Date.
 *
 * "2025-02-10" → midnight Tashkent → 2025-02-09T19:00:00.000Z
 */
export function startOfDayTashkent(dateStr: string): Date {
  // Parse as UTC midnight
  const d = new Date(dateStr);
  // Subtract offset to get UTC equivalent of Tashkent midnight
  d.setUTCHours(0 - TASHKENT_OFFSET_HOURS, 0, 0, 0);
  return d;
}

/**
 * Convert a date-only string (YYYY-MM-DD) to the END of that day
 * in Tashkent timezone, expressed as a UTC Date.
 *
 * "2025-02-10" → 23:59:59.999 Tashkent → 2025-02-10T18:59:59.999Z
 */
export function endOfDayTashkent(dateStr: string): Date {
  const d = new Date(dateStr);
  // 23:59:59.999 Tashkent = (23 - 5):59:59.999 UTC
  d.setUTCHours(23 - TASHKENT_OFFSET_HOURS, 59, 59, 999);
  return d;
}

/**
 * Get start of "today" in Tashkent, expressed as UTC Date.
 */
export function startOfTodayTashkent(): Date {
  const now = new Date();
  // Current Tashkent date: get UTC hours + offset
  const tashkentHours = now.getUTCHours() + TASHKENT_OFFSET_HOURS;
  const d = new Date(now);
  // If tashkent hours >= 24, it's next day in Tashkent
  if (tashkentHours >= 24) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  d.setUTCHours(0 - TASHKENT_OFFSET_HOURS, 0, 0, 0);
  return d;
}

/**
 * Get end of "today" in Tashkent, expressed as UTC Date.
 */
export function endOfTodayTashkent(): Date {
  const now = new Date();
  const tashkentHours = now.getUTCHours() + TASHKENT_OFFSET_HOURS;
  const d = new Date(now);
  if (tashkentHours >= 24) {
    d.setUTCDate(d.getUTCDate() + 1);
  }
  d.setUTCHours(23 - TASHKENT_OFFSET_HOURS, 59, 59, 999);
  return d;
}

/**
 * Get start of current month in Tashkent, expressed as UTC Date.
 */
export function startOfMonthTashkent(): Date {
  const now = new Date();
  const tashkentHours = now.getUTCHours() + TASHKENT_OFFSET_HOURS;
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth();
  // If past midnight in Tashkent but not in UTC, adjust date
  if (tashkentHours >= 24) {
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    year = tomorrow.getUTCFullYear();
    month = tomorrow.getUTCMonth();
  }
  // 1st of month, midnight Tashkent = (0 - 5) UTC on 1st = 19:00 UTC prev day
  const d = new Date(Date.UTC(year, month, 1, 0 - TASHKENT_OFFSET_HOURS, 0, 0, 0));
  return d;
}

/**
 * Get end of current month in Tashkent, expressed as UTC Date.
 */
export function endOfMonthTashkent(): Date {
  const now = new Date();
  const tashkentHours = now.getUTCHours() + TASHKENT_OFFSET_HOURS;
  let year = now.getUTCFullYear();
  let month = now.getUTCMonth();
  if (tashkentHours >= 24) {
    const tomorrow = new Date(now);
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    year = tomorrow.getUTCFullYear();
    month = tomorrow.getUTCMonth();
  }
  // Last day of month: month+1, day 0
  const lastDay = new Date(Date.UTC(year, month + 1, 0));
  // 23:59:59.999 Tashkent on last day
  lastDay.setUTCHours(23 - TASHKENT_OFFSET_HOURS, 59, 59, 999);
  return lastDay;
}

/**
 * PostgreSQL AT TIME ZONE expression for Tashkent.
 * Use in raw SQL: `DATE(column AT TIME ZONE 'Asia/Tashkent')`
 */
export const PG_TASHKENT_TZ = 'Asia/Tashkent';
