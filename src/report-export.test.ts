import { describe, expect, it } from 'vitest';
import type { ReadingRecord } from './domain/models';
import { buildDailyReportCsv, dailyReportFileName } from './report-export';

const record: ReadingRecord = {
  id: 'record-1',
  customerId: 'customer-1',
  customerName: 'Juan, Dela Cruz',
  meterNumber: 'WM-001',
  previousReading: 150,
  currentReading: 175,
  consumption: 25,
  excessConsumption: 10,
  minimumCharge: 15,
  excessCharge: 20,
  total: 35,
  status: 'NORMAL',
  paymentStatus: 'PAID',
  recordState: 'ACTIVE',
  capturedAt: '2026-09-22T08:30:00.000Z',
  paymentReference: '=DANGEROUS()',
  meterPhoto: new Blob(['photo'], { type: 'image/jpeg' }),
};

describe('daily report CSV', () => {
  it('exports complete report fields with Excel-safe user input', () => {
    const csv = buildDailyReportCsv([record], {
      readerName: 'Maria Santos',
      waterSystemName: 'Barangay Malinis',
    });

    expect(csv.startsWith('\uFEFF')).toBe(true);
    expect(csv).toContain('"Juan, Dela Cruz"');
    expect(csv).toContain('"35.00"');
    expect(csv).toContain('"YES"');
    expect(csv).toContain('"\'=DANGEROUS()"');
    expect(csv).toContain('"Maria Santos"');
    expect(csv).toContain('"Barangay Malinis"');
  });

  it('uses a predictable date-based file name', () => {
    expect(dailyReportFileName(new Date('2026-09-22T12:00:00')))
      .toBe('water-meter-daily-log-2026-09-22.csv');
  });
});
