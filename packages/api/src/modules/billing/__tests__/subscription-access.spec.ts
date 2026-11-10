import { MAX_DAILY_SCAN_LIMIT } from '../subscription-access';

describe('subscription access', () => {
  it('keeps the canonical daily Premium limit bounded', () => {
    expect(MAX_DAILY_SCAN_LIMIT).toBe(5);
  });
});
