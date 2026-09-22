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
