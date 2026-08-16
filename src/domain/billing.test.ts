import { describe, expect, it } from 'vitest';
import { calculateBilling } from './billing';

describe('calculateBilling', () => {
  it('charges only the minimum at or below 15 m³', () => {
    expect(calculateBilling(120, 135)).toMatchObject({
      consumption: 15,
      excessConsumption: 0,
      excessCharge: 0,
      total: 15,
      status: 'NORMAL',
    });
  });

  it('charges ₱2 per excess cubic meter', () => {
    expect(calculateBilling(120, 145)).toMatchObject({
      consumption: 25,
      excessConsumption: 10,
      excessCharge: 20,
      total: 35,
      status: 'NORMAL',
    });
  });

  it('preserves a lower current reading and flags it', () => {
    expect(calculateBilling(150, 140)).toMatchObject({
      consumption: -10,
      excessConsumption: 0,
      total: 15,
      status: 'FLAGGED',
    });
  });
});