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
  const { strToU8, zipSync } = await import('fflate');
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

  const escapeXml = (value: unknown) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');
  const columnName = (index: number) => {
    let name = '';
    for (let current = index; current > 0; current = Math.floor((current - 1) / 26)) {
      name = String.fromCharCode(65 + ((current - 1) % 26)) + name;
    }
    return name;
  };
  const sheetXml = (headers: string[], rows: Record<string, unknown>[]) => {
    const cells = [headers.map((header) => header), ...rows.map((row) => headers.map((header) => row[header]))];
    const rowXml = cells.map((row, rowIndex) => `<row r="${rowIndex + 1}">${row.map((value, columnIndex) => {
      const reference = `${columnName(columnIndex + 1)}${rowIndex + 1}`;
      const style = rowIndex === 0 ? ' s="1"' : '';
      return typeof value === 'number' && Number.isFinite(value)
        ? `<c r="${reference}"${style}><v>${value}</v></c>`
        : `<c r="${reference}" t="inlineStr"${style}><is><t xml:space="preserve">${escapeXml(value)}</t></is></c>`;
    }).join('')}</row>`).join('');
    const lastColumn = columnName(headers.length);
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols>${headers.map((header, index) => `<col min="${index + 1}" max="${index + 1}" width="${Math.min(Math.max(header.length + 2, 12), 28)}" customWidth="1"/>`).join('')}</cols><sheetData>${rowXml}</sheetData><autoFilter ref="A1:${lastColumn}${Math.max(cells.length, 1)}"/></worksheet>`;
  };

  const files: Record<string, Uint8Array> = {
    '[Content_Types].xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>'),
    '_rels/.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>'),
    'xl/workbook.xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Summary" sheetId="1" r:id="rId1"/><sheet name="Records" sheetId="2" r:id="rId2"/></sheets></workbook>'),
    'xl/_rels/workbook.xml.rels': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>'),
    'xl/styles.xml': strToU8('<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><color rgb="FFFFFFFF"/><sz val="11"/><name val="Calibri"/></font></fonts><fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/><bgColor indexed="64"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="2"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>'),
    'xl/worksheets/sheet1.xml': strToU8(sheetXml(Object.keys(summary[0]), summary)),
    'xl/worksheets/sheet2.xml': strToU8(sheetXml(CSV_HEADERS, records.map((record) => recordToWorkbookRow(record, identity)))),
  };
  return zipSync(files, { level: 6 });
}

export function recordsWorkbookFileName(scope: string, date = new Date()): string {
  return `water-meter-${fileSafeScope(scope)}-${date.toLocaleDateString('en-CA')}.xlsx`;
}

export async function downloadRecordsReportXlsx(
  records: ReadingRecord[],
  identity: ReportIdentity = {},
  scope = 'records',
): Promise<string> {
  const fileName = recordsWorkbookFileName(scope);
  const workbook = await buildRecordsWorkbook(records, identity);
  const blob = new Blob([new Uint8Array(workbook).buffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
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
