export const BILLING_RULES = {
  minimumConsumption: 15,
  minimumCharge: 15,
  excessRate: 2,
} as const;

export type ReadingStatus = 'NORMAL' | 'FLAGGED';

export interface BillingResult {
  previousReading: number;
  currentReading: number;
  consumption: number;
  minimumConsumption: number;
  excessConsumption: number;
  minimumCharge: number;
  excessCharge: number;
  total: number;
  status: ReadingStatus;
  verificationMessage?: string;
}

/**
 * Computes a reading exactly from the supplied meter values.
 * Negative consumption is deliberately preserved as evidence and flagged.
 */
export function calculateBilling(
  previousReading: number,
  currentReading: number,
): BillingResult {
  const consumption = currentReading - previousReading;
  const excessConsumption =
    consumption > BILLING_RULES.minimumConsumption
      ? consumption - BILLING_RULES.minimumConsumption
      : 0;
  const excessCharge = excessConsumption * BILLING_RULES.excessRate;
  const flagged = currentReading < previousReading;

  return {
    previousReading,
    currentReading,
    consumption,
    minimumConsumption: BILLING_RULES.minimumConsumption,
    excessConsumption,
    minimumCharge: BILLING_RULES.minimumCharge,
    excessCharge,
    total: BILLING_RULES.minimumCharge + excessCharge,
    status: flagged ? 'FLAGGED' : 'NORMAL',
    ...(flagged
      ? {
          verificationMessage:
            'Reading requires verification: current reading is lower than previous reading.',
        }
      : {}),
  };
}