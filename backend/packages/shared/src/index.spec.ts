import {
  CONTRACT_STATUSES,
  CONTRACT_STATUS_TRANSITIONS,
  EMPLOYEE_STATUSES,
  EMPLOYEE_STATUS_TRANSITIONS,
  canTransitionContractStatus,
  canTransitionEmployeeStatus,
  toMinorUnits,
} from './index';

describe('employee lifecycle state machine', () => {
  describe.each(EMPLOYEE_STATUSES)('from %s', (from) => {
    it.each(EMPLOYEE_STATUSES)('evaluates transition to %s', (to) => {
      expect(canTransitionEmployeeStatus(from, to)).toBe(
        EMPLOYEE_STATUS_TRANSITIONS[from].includes(to),
      );
    });
  });
});

describe('contract lifecycle state machine', () => {
  describe.each(CONTRACT_STATUSES)('from %s', (from) => {
    it.each(CONTRACT_STATUSES)('evaluates transition to %s', (to) => {
      expect(canTransitionContractStatus(from, to)).toBe(
        CONTRACT_STATUS_TRANSITIONS[from].includes(to),
      );
    });
  });
});

describe('money conversion', () => {
  it('converts decimal strings to integer minor units', () => {
    expect(toMinorUnits('1234.56')).toBe(123456n);
    expect(toMinorUnits('0.05')).toBe(5n);
    expect(toMinorUnits('-12.30')).toBe(-1230n);
    expect(toMinorUnits(42)).toBe(4200n);
  });

  it.each(['1.234', 'abc', '', '1,23', '1.2.3'])('rejects invalid amount %s', (amount) => {
    expect(() => toMinorUnits(amount)).toThrow();
  });
});
