/**
 * Calculates the inclusive number of days between two date strings.
 * 
 * **Business Logic:**
 * - Input must be YYYY-MM-DD strings.
 * - Both start and end dates are inclusive.
 * - Used as the authoritative calculator for all balance reservations and HCM syncs.
 * 
 * @param startDate Starting date in YYYY-MM-DD format.
 * @param endDate Ending date in YYYY-MM-DD format.
 * @returns Total number of days (inclusive).
 * @throws Error if date format is invalid or end is before start.
 */
export function calculateDays(startDate: string, endDate: string): number {
  const start = new Date(startDate);
  const end = new Date(endDate);

  // Validate that strings are parseable into valid dates
  if (isNaN(start.getTime()) || isNaN(end.getTime())) {
    throw new Error('Invalid date format. Expected YYYY-MM-DD.');
  }

  // Ensure logical chronological order
  if (end < start) {
    throw new Error('End date must not be before start date.');
  }

  // 86,400,000 ms per day. +1 makes the calculation inclusive.
  return Math.floor((end.getTime() - start.getTime()) / 86_400_000) + 1;
}
