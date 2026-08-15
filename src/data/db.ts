import Dexie, { type EntityTable } from 'dexie';
import type { AppSettings, Customer, ReadingRecord } from '../domain/models';

export class WaterMeterDatabase extends Dexie {
  customers!: EntityTable<Customer, 'id'>;
  records!: EntityTable<ReadingRecord, 'id'>;
  settings!: EntityTable<AppSettings, 'key'>;

  constructor() {
    super('water-meter-reader-assistant');

    this.version(1).stores({
      customers: 'id, name, &meterNumber, updatedAt',
      records: 'id, customerId, meterNumber, capturedAt, status',
      settings: 'key',
    });

    this.version(2).stores({
      customers: 'id, name, &meterNumber, updatedAt',
      records: 'id, customerId, meterNumber, capturedAt, status, paymentStatus',
      settings: 'key',
    }).upgrade(async (tx) => {
      await tx.table('records').toCollection().modify((record) => {
        if (!record.paymentStatus) record.paymentStatus = 'UNPAID';
      });
    });
  }
}

export const db = new WaterMeterDatabase();