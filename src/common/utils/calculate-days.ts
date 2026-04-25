/**
 * Calculates inclusive day count between two YYYY-MM-DD date strings.
 * This is the single source of truth for day calculation across the entire system.
 *
 * Formula: floor((end - start) / 86400000) + 1
 * Range: inclusive on both ends (2026-05-01 to 2026-05-05 = 5 days)
 * Input: date-only strings, no timezone dependency
 */
export function calculateDays(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);

  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('Invalid date format. Expected YYYY-MM-DD.');
  }

  if (end < start) {
    throw new Error('End date must not be before start date.');
  }

  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
}
