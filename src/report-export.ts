import type { ReadingRecord } from './domain/models';

export interface ReportIdentity {
  readerName?: string;
  waterSystemName?: string;
}

const CSV_HEADERS = [
  'Record ID',
  'Date',
  'Time',
  'Customer Name',
  'Meter Number',
  'Previous Reading',
  'Current Reading',
  'Consumption (m3)',
  'Minimum Charge (PHP)',
  'Excess Consumption (m3)',
  'Excess Charge (PHP)',
  'Total (PHP)',
  'Reading Status',
  'Collection Status',
  'Paid At',
  'Payment Method',
  'Payment Reference / OR',
  'Payment Remarks',
  'Record State',
  'Audit State',
  'Edit Reason',
  'Void Reason',
  'Photo Available',
  'Notes',
  'Meter Reader',
  'Water System / Barangay',
];

function spreadsheetSafe(value: unknown): string {
  const text = value == null ? '' : String(value);
  // Prevent user-entered text from becoming an Excel/Sheets formula.
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}

function csvCell(value: unknown): string {
  return `"${spreadsheetSafe(value).replace(/"/g, '""')}"`;
}

function localDateParts(iso: string) {
  const value = new Date(iso);
  return {
    date: value.toLocaleDateString('en-CA'),
    time: value.toLocaleTimeString('en-PH'),
  };
}

export function buildRecordsReportCsv(records: ReadingRecord[], identity: ReportIdentity = {}): string {
  const rows = records.map((record) => {
    const captured = localDateParts(record.capturedAt);
    return [
      record.id,
      captured.date,
      captured.time,
      record.customerName,
      record.meterNumber,
      record.previousReading,
      record.currentReading,
      record.consumption,
      record.minimumCharge.toFixed(2),
      record.excessConsumption,
      record.excessCharge.toFixed(2),
      record.total.toFixed(2),
      record.status,
      record.paymentStatus ?? 'UNPAID',
      record.paidAt ? new Date(record.paidAt).toLocaleString('en-PH') : '',
      record.paymentMethod,
      record.paymentReference,
      record.paymentRemarks,
      record.recordState ?? 'ACTIVE',
      record.voidedAt ? 'VOID' : record.editedAt ? 'EDITED' : 'ORIGINAL',
      record.editReason,
      record.voidReason,
      record.meterPhoto ? 'YES' : 'NO',
      record.notes,
      identity.readerName,
      identity.waterSystemName,
    ].map(csvCell).join(',');
  });

  // UTF-8 BOM keeps Filipino names and the peso sign readable in Excel.
  return `\uFEFF${[CSV_HEADERS.map(csvCell).join(','), ...rows].join('\r\n')}`;
}

function fileSafeScope(scope: string): string {
  return scope.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'records';
}

export function recordsReportFileName(scope: string, date = new Date()): string {
  return `water-meter-${fileSafeScope(scope)}-${date.toLocaleDateString('en-CA')}.csv`;
}

export function downloadRecordsReportCsv(
  records: ReadingRecord[],
  identity: ReportIdentity = {},
  scope = 'records',
): string {
  const fileName = recordsReportFileName(scope);
  const blob = new Blob([buildRecordsReportCsv(records, identity)], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = 'noopener';
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  return fileName;
}

export function downloadDailyReportCsv(records: ReadingRecord[], identity: ReportIdentity = {}): string {
  return downloadRecordsReportCsv(records, identity, 'daily-log');
}

function recordToWorkbookRow(record: ReadingRecord, identity: ReportIdentity) {
  const captured = localDateParts(record.capturedAt);
  return {
    'Record ID': record.id,
    Date: captured.date,
    Time: captured.time,
    'Customer Name': spreadsheetSafe(record.customerName),
    'Meter Number': spreadsheetSafe(record.meterNumber),
    'Previous Reading': record.previousReading,
    'Current Reading': record.currentReading,
    'Consumption (m3)': record.consumption,
    'Minimum Charge (PHP)': record.minimumCharge,
    'Excess Consumption (m3)': record.excessConsumption,
    'Excess Charge (PHP)': record.excessCharge,
    'Total (PHP)': record.total,
    'Reading Status': record.status,
    'Collection Status': record.paymentStatus ?? 'UNPAID',
    'Paid At': record.paidAt ? new Date(record.paidAt).toLocaleString('en-PH') : '',
    'Payment Method': spreadsheetSafe(record.paymentMethod),
    'Payment Reference / OR': spreadsheetSafe(record.paymentReference),
    'Payment Remarks': spreadsheetSafe(record.paymentRemarks),
    'Record State': record.recordState ?? 'ACTIVE',
    'Audit State': record.voidedAt ? 'VOID' : record.editedAt ? 'EDITED' : 'ORIGINAL',
    'Edit Reason': spreadsheetSafe(record.editReason),
    'Void Reason': spreadsheetSafe(record.voidReason),
    'Photo Available': record.meterPhoto ? 'YES' : 'NO',
    Notes: spreadsheetSafe(record.notes),
    'Meter Reader': spreadsheetSafe(identity.readerName),
    'Water System / Barangay': spreadsheetSafe(identity.waterSystemName),
  };
}

export async function buildRecordsWorkbook(records: ReadingRecord[], identity: ReportIdentity = {}) {
  const XLSX = await import('xlsx');
  const active = records.filter((record) => (record.recordState ?? 'ACTIVE') === 'ACTIVE');
  const summary = [{
    'Exported Records': records.length,
    'Active Records': active.length,
    'Paid Records': active.filter((record) => (record.paymentStatus ?? 'UNPAID') === 'PAID').length,
    'Pending Records': active.filter((record) => (record.paymentStatus ?? 'UNPAID') === 'UNPAID').length,
    'Void Records': records.length - active.length,
    'Flagged Records': active.filter((record) => record.status === 'FLAGGED').length,
    'Total Consumption (m3)': active.reduce((sum, record) => sum + record.consumption, 0),
    'Total Amount (PHP)': active.reduce((sum, record) => sum + record.total, 0),
    'Meter Reader': spreadsheetSafe(identity.readerName),
    'Water System / Barangay': spreadsheetSafe(identity.waterSystemName),
    'Generated At': new Date().toLocaleString('en-PH'),
  }];

  const workbook = XLSX.utils.book_new();
  const recordsSheet = XLSX.utils.json_to_sheet(records.map((record) => recordToWorkbookRow(record, identity)));
  const summarySheet = XLSX.utils.json_to_sheet(summary);
  recordsSheet['!freeze'] = { xSplit: 0, ySplit: 1 };
  recordsSheet['!autofilter'] = { ref: recordsSheet['!ref'] ?? 'A1:A1' };
  recordsSheet['!cols'] = CSV_HEADERS.map((header) => ({ wch: Math.min(Math.max(header.length + 2, 12), 28) }));
  summarySheet['!cols'] = Object.keys(summary[0]).map((header) => ({ wch: Math.min(Math.max(header.length + 2, 14), 28) }));
  XLSX.utils.book_append_sheet(workbook, summarySheet, 'Summary');
  XLSX.utils.book_append_sheet(workbook, recordsSheet, 'Records');
  return workbook;
}

export function recordsWorkbookFileName(scope: string, date = new Date()): string {
  return `water-meter-${fileSafeScope(scope)}-${date.toLocaleDateString('en-CA')}.xlsx`;
}

export async function downloadRecordsReportXlsx(
  records: ReadingRecord[],
  identity: ReportIdentity = {},
  scope = 'records',
): Promise<string> {
  const XLSX = await import('xlsx');
  const fileName = recordsWorkbookFileName(scope);
  XLSX.writeFile(await buildRecordsWorkbook(records, identity), fileName, { compression: true });
  return fileName;
}
