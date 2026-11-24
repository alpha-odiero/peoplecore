import { workingDaysBetween } from './working-days';

describe('workingDaysBetween', () => {
  it('counts weekdays and excludes weekends', () => {
    expect(
      workingDaysBetween(new Date('2026-11-23T00:00:00Z'), new Date('2026-11-27T00:00:00Z')),
    ).toBe(5);
  });

  it('excludes weekend-only ranges', () => {
    expect(
      workingDaysBetween(new Date('2026-11-28T00:00:00Z'), new Date('2026-11-29T00:00:00Z')),
    ).toBe(0);
  });
});
