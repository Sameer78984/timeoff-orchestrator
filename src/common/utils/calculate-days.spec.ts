import { calculateDays } from './calculate-days';

describe('calculateDays', () => {
  it('should return 1 for the same day', () => {
    expect(calculateDays('2026-05-01', '2026-05-01')).toBe(1);
  });

  it('should return correct number of days for a normal range', () => {
    expect(calculateDays('2026-05-01', '2026-05-05')).toBe(5);
  });

  it('should throw an error if end date is before start date', () => {
    expect(() => calculateDays('2026-05-05', '2026-05-01')).toThrow('End date must not be before start date.');
  });

  it('should throw an error for invalid date formats', () => {
    expect(() => calculateDays('invalid', '2026-05-01')).toThrow('Invalid date format. Expected YYYY-MM-DD.');
    expect(() => calculateDays('2026-05-01', 'invalid')).toThrow('Invalid date format. Expected YYYY-MM-DD.');
  });
});
