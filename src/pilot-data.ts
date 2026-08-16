import { db } from './data/db';
import type { AppSettings, Customer, ReadingRecord } from './domain/models';

export const PILOT_VERSION = '0.1.0-pilot';

type BackupRecord = Omit<ReadingRecord, 'meterPhoto'> & {
  meterPhoto?: { type: string; dataUrl: string };
};

interface BackupPayload {
  product: 'water-meter-reader-assistant';
  schemaVersion: 1;
  appVersion: string;
  exportedAt: string;
  customers: Customer[];
  records: BackupRecord[];
  settings: AppSettings[];
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('Could not read photo.'));
    reader.readAsDataURL(blob);
  });
}

async function dataUrlToBlob(dataUrl: string): Promise<Blob> {
  const response = await fetch(dataUrl);
  return response.blob();
}

export async function exportBackup(): Promise<{ fileName: string; exportedAt: string }> {
  const customers = await db.customers.toArray();
  const records = await db.records.toArray();
  const settings = await db.settings.toArray();
  const exportedAt = new Date().toISOString();

  const serializedRecords: BackupRecord[] = [];
  for (const record of records) {
    const { meterPhoto, ...rest } = record;
    serializedRecords.push({
      ...rest,
      ...(meterPhoto
        ? { meterPhoto: { type: meterPhoto.type || 'image/jpeg', dataUrl: await blobToDataUrl(meterPhoto) } }
        : {}),
    });
  }

  const payload: BackupPayload = {
    product: 'water-meter-reader-assistant',
    schemaVersion: 1,
    appVersion: PILOT_VERSION,
    exportedAt,
    customers,
    records: serializedRecords,
    settings,
  };

  const blob = new Blob([JSON.stringify(payload)], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  const stamp = exportedAt.slice(0, 19).replace(/[:T]/g, '-');
  const fileName = `water-meter-reader-backup-${stamp}.json`;
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);

  await db.settings.put({ key: 'lastBackupAt', value: exportedAt });
  return { fileName, exportedAt };
}

function validateBackup(value: unknown): BackupPayload {
  const backup = value as Partial<BackupPayload>;
  if (
    backup?.product !== 'water-meter-reader-assistant' ||
    backup.schemaVersion !== 1 ||
    !Array.isArray(backup.customers) ||
    !Array.isArray(backup.records) ||
    !Array.isArray(backup.settings)
  ) {
    throw new Error('This is not a valid Water Meter Reader Assistant backup file.');
  }
  return backup as BackupPayload;
}

export async function restoreBackup(file: File, mode: 'merge' | 'replace') {
  const payload = validateBackup(JSON.parse(await file.text()));
  const records: ReadingRecord[] = [];

  for (const item of payload.records) {
    const { meterPhoto, ...rest } = item;
    records.push({
      ...rest,
      ...(meterPhoto ? { meterPhoto: await dataUrlToBlob(meterPhoto.dataUrl) } : {}),
    });
  }

  await db.transaction('rw', db.customers, db.records, db.settings, async () => {
    if (mode === 'replace') {
      await db.records.clear();
      await db.customers.clear();
      await db.settings.clear();
    }

    await db.customers.bulkPut(payload.customers);
    await db.records.bulkPut(records);
    await db.settings.bulkPut(payload.settings);
    await db.settings.put({ key: 'lastRestoreAt', value: new Date().toISOString() });
  });

  return {
    customers: payload.customers.length,
    records: records.length,
    exportedAt: payload.exportedAt,
  };
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const setting = await db.settings.get(key);
  return (setting?.value as T | undefined) ?? fallback;
}

export async function setSetting(key: string, value: unknown) {
  await db.settings.put({ key, value });
}
