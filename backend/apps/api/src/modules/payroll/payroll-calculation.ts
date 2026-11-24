export interface PayrollCalculationInput {
  baseMinor: bigint;
  allowanceMinor: bigint;
  taxRateBps: number;
  otherDeductionsMinor: bigint;
}

export interface PayrollCalculationResult {
  baseMinor: bigint;
  allowanceMinor: bigint;
  grossMinor: bigint;
  taxMinor: bigint;
  otherDeductionsMinor: bigint;
  deductionsMinor: bigint;
  netMinor: bigint;
}

export function calculatePayslip(input: PayrollCalculationInput): PayrollCalculationResult {
  const grossMinor = input.baseMinor + input.allowanceMinor;
  const taxMinor = (grossMinor * BigInt(input.taxRateBps)) / 10_000n;
  const deductionsMinor = taxMinor + input.otherDeductionsMinor;
  return {
    baseMinor: input.baseMinor,
    allowanceMinor: input.allowanceMinor,
    grossMinor,
    taxMinor,
    otherDeductionsMinor: input.otherDeductionsMinor,
    deductionsMinor,
    netMinor: grossMinor - deductionsMinor,
  };
}
