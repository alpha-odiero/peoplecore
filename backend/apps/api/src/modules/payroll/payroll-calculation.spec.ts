import { calculatePayslip } from './payroll-calculation';

describe('calculatePayslip', () => {
  it('calculates gross, tax, deductions, and net in minor units', () => {
    const result = calculatePayslip({
      baseMinor: 500_000n,
      allowanceMinor: 50_000n,
      taxRateBps: 1000,
      otherDeductionsMinor: 2_500n,
    });
    expect(result.grossMinor).toBe(550_000n);
    expect(result.taxMinor).toBe(55_000n);
    expect(result.deductionsMinor).toBe(57_500n);
    expect(result.netMinor).toBe(492_500n);
  });

  it('supports a zero tax rate and no deductions', () => {
    const result = calculatePayslip({
      baseMinor: 100n,
      allowanceMinor: 50n,
      taxRateBps: 0,
      otherDeductionsMinor: 0n,
    });
    expect(result.taxMinor).toBe(0n);
    expect(result.netMinor).toBe(150n);
  });
});
