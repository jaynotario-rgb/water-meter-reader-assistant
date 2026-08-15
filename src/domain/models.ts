import type { ReadingStatus } from './billing';

export type PaymentStatus = 'UNPAID' | 'PAID';

export interface Customer {
  id: string;
  name: string;
  meterNumber: string;
  address?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ReadingRecord {
  id: string;
  customerId: string;

  // Snapshot fields preserve what appeared on the record at capture time.
  customerName: string;
  meterNumber: string;

  previousReading: number;
  currentReading: number;
  consumption: number;
  excessConsumption: number;
  minimumCharge: number;
  excessCharge: number;
  total: number;

  status: ReadingStatus;
  paymentStatus: PaymentStatus;
  paidAt?: string;
  paymentMethod?: string;
  paymentReference?: string;
  paymentRemarks?: string;
  capturedAt: string;
  meterPhoto?: Blob;
  notes?: string;
}

export interface AppSettings {
  key: string;
  value: unknown;
}