import { FormEvent, useEffect, useMemo, useRef, useState } from 'react';
import { toBlob } from 'html-to-image';
import { db } from './data/db';
import { calculateBilling } from './domain/billing';
import type { Customer, ReadingRecord } from './domain/models';

const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
type Screen = 'reading' | 'history' | 'daily' | 'folder' | 'receipt';
type FolderFilter = 'all' | 'month' | 'date';

function sameLocalDate(iso: string, date: string) {
  return new Date(iso).toLocaleDateString('en-CA') === date;
}

function receiptText(record: ReadingRecord) {
  return [
    'WATER METER READER ASSISTANT',
    `Customer: ${record.customerName}`,
    `Meter Number: ${record.meterNumber}`,
    `Reading Date: ${new Date(record.capturedAt).toLocaleString()}`,
    `Record ID: ${record.id.toUpperCase()}`,
    '',
    `Previous Reading: ${record.previousReading}`,
    `Current Reading: ${record.currentReading}`,
    `Consumption: ${record.consumption} m³`,
    `Minimum Charge: ${money.format(record.minimumCharge)}`,
    `Excess: ${record.excessConsumption} m³ × ₱2.00`,
    `Excess Charge: ${money.format(record.excessCharge)}`,
    `TOTAL: ${money.format(record.total)}`,
    '',
    `Reading Status: ${record.status}`,
    `Collection Status: ${record.paymentStatus ?? 'UNPAID'}`,
    ...(record.paidAt ? [`Recorded Paid: ${new Date(record.paidAt).toLocaleString()}`] : []),
    ...(record.paymentMethod ? [`Payment Method: ${record.paymentMethod}`] : []),
    ...(record.paymentReference ? [`Reference: ${record.paymentReference}`] : []),
    ...(record.paymentRemarks ? [`Remarks: ${record.paymentRemarks}`] : []),
    ...(record.status === 'FLAGGED' ? ['READING REQUIRES VERIFICATION'] : []),
    '',
    'Field record only. This app does not replace the official billing system.',
  ].join('\n');
}

export function App() {
  const [screen, setScreen] = useState<Screen>('reading');
  const [online, setOnline] = useState(navigator.onLine);
  const [customerName, setCustomerName] = useState('');
  const [meterNumber, setMeterNumber] = useState('');
  const [previousReading, setPreviousReading] = useState('');
  const [currentReading, setCurrentReading] = useState('');
  const [photo, setPhoto] = useState<File>();
  const [message, setMessage] = useState<string>();
  const [saving, setSaving] = useState(false);
  const [records, setRecords] = useState<ReadingRecord[]>([]);
  const [search, setSearch] = useState('');
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>();
  const [selectedRecordId, setSelectedRecordId] = useState<string>();
  const [folderFilter, setFolderFilter] = useState<FolderFilter>('all');
  const [folderMonth, setFolderMonth] = useState(new Date().toISOString().slice(0, 7));
  const [folderDate, setFolderDate] = useState(new Date().toLocaleDateString('en-CA'));
  const receiptRef = useRef<HTMLElement>(null);

  useEffect(() => {
    const updateStatus = () => setOnline(navigator.onLine);
    window.addEventListener('online', updateStatus);
    window.addEventListener('offline', updateStatus);
    return () => {
      window.removeEventListener('online', updateStatus);
      window.removeEventListener('offline', updateStatus);
    };
  }, []);

  async function refreshRecords() {
    setRecords(await db.records.orderBy('capturedAt').reverse().toArray());
  }
  useEffect(() => { void refreshRecords(); }, [screen]);

  const previous = Number(previousReading);
  const current = Number(currentReading);
  const hasReadings = previousReading !== '' && currentReading !== '';
  const result = useMemo(
    () => (hasReadings ? calculateBilling(previous, current) : undefined),
    [hasReadings, previous, current],
  );

  async function lookupMeter(raw = meterNumber) {
    const meter = raw.trim();
    if (!meter) return;
    const customer = await db.customers.where('meterNumber').equals(meter).first();
    if (!customer) return;
    const latest = await db.records.where('customerId').equals(customer.id).reverse().sortBy('capturedAt');
    setCustomerName(customer.name);
    if (latest[0]) setPreviousReading(String(latest[0].currentReading));
    setMessage(`Existing meter found. Latest reading loaded for ${customer.name}.`);
  }

  async function saveReading(event: FormEvent) {
    event.preventDefault();
    setMessage(undefined);
    if (!customerName.trim() || !meterNumber.trim() || !result) {
      setMessage('Complete the customer, meter number, and both readings.');
      return;
    }

    setSaving(true);
    try {
      const now = new Date().toISOString();
      const cleanMeter = meterNumber.trim();
      const existing = await db.customers.where('meterNumber').equals(cleanMeter).first();
      const customerId = existing?.id ?? crypto.randomUUID();
      const duplicates = await db.records.where('meterNumber').equals(cleanMeter).toArray();
      const alreadyToday = duplicates.find((r) => sameLocalDate(r.capturedAt, new Date().toLocaleDateString('en-CA')));
      if (alreadyToday && !window.confirm('May existing reading na ang meter na ito today. Save another reading anyway?')) {
        setMessage('Save cancelled. Existing reading was preserved.');
        return;
      }

      const customer: Customer = {
        id: customerId,
        name: customerName.trim(),
        meterNumber: cleanMeter,
        address: existing?.address,
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
      };
      const record: ReadingRecord = {
        id: crypto.randomUUID(), customerId,
        customerName: customer.name, meterNumber: cleanMeter,
        previousReading: result.previousReading, currentReading: result.currentReading,
        consumption: result.consumption, excessConsumption: result.excessConsumption,
        minimumCharge: result.minimumCharge, excessCharge: result.excessCharge,
        total: result.total, status: result.status, paymentStatus: 'UNPAID', capturedAt: now,
        ...(photo ? { meterPhoto: photo } : {}),
      };

      await db.transaction('rw', db.customers, db.records, async () => {
        await db.customers.put(customer);
        await db.records.add(record);
      });
      await refreshRecords();
      setSelectedCustomerId(customerId);
      setSelectedRecordId(record.id);
      setMessage(`Saved on this device. Record ${record.id.slice(0, 8).toUpperCase()}.`);
      setCurrentReading('');
      setPreviousReading(String(record.currentReading));
      setPhoto(undefined);
    } catch (error) {
      console.error(error);
      setMessage('Could not save the reading. No record was intentionally changed.');
    } finally { setSaving(false); }
  }

  async function markPaid(record: ReadingRecord) {
    const method = window.prompt('Payment method (optional: Cash, GCash, etc.)', record.paymentMethod ?? '') ?? '';
    const reference = window.prompt('Payment reference / OR number (optional)', record.paymentReference ?? '') ?? '';
    const remarks = window.prompt('Remarks (optional)', record.paymentRemarks ?? '') ?? '';
    await db.records.update(record.id, {
      paymentStatus: 'PAID', paidAt: new Date().toISOString(),
      paymentMethod: method.trim() || undefined,
      paymentReference: reference.trim() || undefined,
      paymentRemarks: remarks.trim() || undefined,
    });
    await refreshRecords();
  }

  async function markUnpaid(record: ReadingRecord) {
    if (!window.confirm('Mark this record UNPAID again? The reading itself will not be changed.')) return;
    await db.records.update(record.id, {
      paymentStatus: 'UNPAID', paidAt: undefined,
      paymentMethod: undefined, paymentReference: undefined, paymentRemarks: undefined,
    });
    await refreshRecords();
  }

  function openFolder(customerId: string) {
    setSelectedCustomerId(customerId);
    setFolderFilter('all');
    setScreen('folder');
  }
  function openReceipt(recordId: string) {
    setSelectedRecordId(recordId);
    setScreen('receipt');
  }

  const selectedRecord = records.find((r) => r.id === selectedRecordId);
  const folderRecords = records.filter((r) => r.customerId === selectedCustomerId);
  const folderCustomer = folderRecords[0];
  const filteredFolderRecords = folderRecords.filter((r) => {
    if (folderFilter === 'all') return true;
    const local = new Date(r.capturedAt).toLocaleDateString('en-CA');
    if (folderFilter === 'date') return local === folderDate;
    return local.startsWith(folderMonth);
  });

  const customerFolders = useMemo(() => {
    const map = new Map<string, ReadingRecord[]>();
    for (const record of records) map.set(record.customerId, [...(map.get(record.customerId) ?? []), record]);
    return Array.from(map.entries()).map(([customerId, customerRecords]) => ({
      customerId, latest: customerRecords[0], count: customerRecords.length,
      unpaid: customerRecords.filter((r) => (r.paymentStatus ?? 'UNPAID') === 'UNPAID').length,
    }));
  }, [records]);

  const filteredFolders = customerFolders.filter(({ latest }) => {
    const q = search.trim().toLowerCase();
    return !q || latest.customerName.toLowerCase().includes(q) || latest.meterNumber.toLowerCase().includes(q);
  });

  const today = new Date().toLocaleDateString('en-CA');
  const todayRecords = records.filter((r) => sameLocalDate(r.capturedAt, today));
  const dailyTotals = todayRecords.reduce((a, r) => ({
    consumption: a.consumption + r.consumption,
    amount: a.amount + r.total,
    flagged: a.flagged + (r.status === 'FLAGGED' ? 1 : 0),
    unpaid: a.unpaid + ((r.paymentStatus ?? 'UNPAID') === 'UNPAID' ? 1 : 0),
  }), { consumption: 0, amount: 0, flagged: 0, unpaid: 0 });

  async function receiptPng(record: ReadingRecord) {
    if (!receiptRef.current) throw new Error('Receipt is not rendered.');
    const blob = await toBlob(receiptRef.current, { pixelRatio: 2, backgroundColor: '#ffffff' });
    if (!blob) throw new Error('Could not render receipt image.');
    return new File([blob], `water-receipt-${record.meterNumber}-${record.id.slice(0, 8)}.png`, { type: 'image/png' });
  }

  async function saveReceipt(record: ReadingRecord) {
    try {
      const file = await receiptPng(record);
      const url = URL.createObjectURL(file);
      const a = document.createElement('a');
      a.href = url; a.download = file.name; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
      setMessage('PNG receipt saved on this device.');
    } catch (error) {
      console.error(error); setMessage('Could not create the PNG receipt.');
    }
  }

  async function shareReceipt(record: ReadingRecord) {
    if (!online) {
      setMessage('Offline: save the PNG receipt now and share it later when connected.');
      return;
    }
    try {
      const file = await receiptPng(record);
      if (navigator.share && (!navigator.canShare || navigator.canShare({ files: [file] }))) {
        await navigator.share({ title: `Water Receipt - ${record.customerName}`, text: receiptText(record), files: [file] });
        return;
      }
      await navigator.clipboard?.writeText(receiptText(record));
      setMessage('Image sharing is not supported here. Receipt details copied instead.');
    } catch (error) {
      if ((error as DOMException).name !== 'AbortError') setMessage('Could not open the share sheet.');
    }
  }

  function emailReceipt(record: ReadingRecord) {
    if (!online) { setMessage('Email needs internet. Save the PNG receipt and send it later.'); return; }
    window.location.href = `mailto:?subject=${encodeURIComponent(`Water Meter Receipt - ${record.customerName}`)}&body=${encodeURIComponent(receiptText(record))}`;
  }

  const meterPhotoUrl = useMemo(() => selectedRecord?.meterPhoto ? URL.createObjectURL(selectedRecord.meterPhoto) : undefined, [selectedRecord]);
  useEffect(() => () => { if (meterPhotoUrl) URL.revokeObjectURL(meterPhotoUrl); }, [meterPhotoUrl]);

  return <main className="app-shell">
    <header className="topbar no-print"><div><p className="eyebrow">FIELD TOOL</p><h1>Water Meter Reader</h1></div><span className={`network ${online ? 'online' : 'offline'}`}><span>●</span> {online ? 'ONLINE' : 'OFFLINE'}</span></header>
    <p className="device-note no-print">Records are saved on this device.</p>
    {message && <p className="global-message no-print" role="status">{message}</p>}

    {screen === 'reading' && <form className="reading-card" onSubmit={saveReading}>
      <label>Meter Number<input value={meterNumber} onChange={(e) => setMeterNumber(e.target.value)} onBlur={() => void lookupMeter()} placeholder="WM-00423" /></label>
      <label>Customer / Account Name<input autoComplete="name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Juan Dela Cruz" /></label>
      <div className="reading-grid">
        <label>Previous<input className="number-input" type="number" inputMode="decimal" step="any" value={previousReading} onChange={(e) => setPreviousReading(e.target.value)} placeholder="120" /></label>
        <label>Current<input className="number-input" type="number" inputMode="decimal" step="any" value={currentReading} onChange={(e) => setCurrentReading(e.target.value)} placeholder="145" /></label>
      </div>
      {result && <section className="calculation">
        {result.status === 'FLAGGED' && <div className="warning"><strong>Reading requires verification.</strong><span>Current reading is lower than previous reading.</span></div>}
        <div><span>Consumption</span><strong>{result.consumption} m³</strong></div><div><span>Minimum ({result.minimumConsumption} m³)</span><strong>{money.format(result.minimumCharge)}</strong></div><div><span>Excess ({result.excessConsumption} m³ × ₱2.00)</span><strong>{money.format(result.excessCharge)}</strong></div><div className="total"><span>TOTAL</span><strong>{money.format(result.total)}</strong></div>
      </section>}
      <label className="capture-button"><span>{photo ? '✓ METER PHOTO ATTACHED' : 'CAPTURE METER'}</span><input className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0])} /></label>
      <p className="evidence-note">Photo is evidence only. Manual reading remains the source of truth.</p>
      <button className="save-button" type="submit" disabled={saving}>{saving ? 'SAVING…' : 'SAVE READING'}</button>
      {selectedRecordId && <button className="secondary-button" type="button" onClick={() => setScreen('receipt')}>VIEW LAST RECEIPT</button>}
    </form>}

    {screen === 'history' && <section className="screen-card"><div className="section-heading"><div><p className="eyebrow">CUSTOMER RECORDS</p><h2>History</h2></div><strong>{customerFolders.length}</strong></div><input className="search-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer or meter number" />
      {filteredFolders.length === 0 ? <p className="empty-state">No matching customer records.</p> : <div className="folder-list">{filteredFolders.map(({ customerId, latest, count, unpaid }) => <button className="folder-row" key={customerId} type="button" onClick={() => openFolder(customerId)}><div><strong>{latest.customerName}</strong><span className="meter-emphasis">{latest.meterNumber}</span><span>Latest: {new Date(latest.capturedAt).toLocaleDateString()}</span></div><div className="folder-meta"><strong>{count} reading{count === 1 ? '' : 's'}</strong><span>{unpaid ? `${unpaid} unpaid` : 'All marked paid'}</span></div></button>)}</div>}
    </section>}

    {screen === 'folder' && <section className="screen-card"><button className="back-button" type="button" onClick={() => setScreen('history')}>← BACK TO HISTORY</button><div className="section-heading"><div><p className="eyebrow">CUSTOMER FOLDER</p><h2>{folderCustomer?.customerName ?? 'Customer'}</h2><span className="meter-emphasis">{folderCustomer?.meterNumber}</span></div><strong>{folderRecords.length}</strong></div>
      <div className="filter-bar"><button className={folderFilter === 'all' ? 'active' : ''} type="button" onClick={() => setFolderFilter('all')}>ALL</button><button className={folderFilter === 'month' ? 'active' : ''} type="button" onClick={() => setFolderFilter('month')}>MONTH</button><button className={folderFilter === 'date' ? 'active' : ''} type="button" onClick={() => setFolderFilter('date')}>DATE</button></div>
      {folderFilter === 'month' && <input type="month" value={folderMonth} onChange={(e) => setFolderMonth(e.target.value)} />}{folderFilter === 'date' && <input type="date" value={folderDate} onChange={(e) => setFolderDate(e.target.value)} />}
      {filteredFolderRecords.length === 0 ? <p className="empty-state">No readings for the selected period.</p> : filteredFolderRecords.map((r) => <article className="record-row" key={r.id}><div><strong>{new Date(r.capturedAt).toLocaleDateString()}</strong><span>{new Date(r.capturedAt).toLocaleTimeString()} · {r.id.slice(0, 8).toUpperCase()}</span>{r.paidAt && <span>Paid: {new Date(r.paidAt).toLocaleString()}</span>}</div><div className="record-amount"><strong>{money.format(r.total)}</strong><span className={(r.paymentStatus ?? 'UNPAID') === 'PAID' ? 'status-paid' : 'status-unpaid'}>{r.paymentStatus ?? 'UNPAID'}</span></div><dl><div><dt>Previous</dt><dd>{r.previousReading}</dd></div><div><dt>Current</dt><dd>{r.currentReading}</dd></div><div><dt>Consumption</dt><dd>{r.consumption} m³</dd></div></dl><div className="record-actions"><button type="button" onClick={() => openReceipt(r.id)}>RECEIPT</button>{(r.paymentStatus ?? 'UNPAID') === 'UNPAID' ? <button type="button" onClick={() => void markPaid(r)}>MARK PAID</button> : <button type="button" onClick={() => void markUnpaid(r)}>MARK UNPAID</button>}</div></article>)}
    </section>}

    {screen === 'receipt' && selectedRecord && <section className="screen-card receipt-shell"><button className="back-button no-print" type="button" onClick={() => selectedCustomerId ? setScreen('folder') : setScreen('history')}>← BACK</button><section ref={receiptRef} className="receipt-card"><div className="receipt-header"><p className="eyebrow">FIELD RECEIPT</p><h2>Water Meter Reader Assistant</h2><span>Record {selectedRecord.id.slice(0, 8).toUpperCase()}</span><strong className={`receipt-status ${(selectedRecord.paymentStatus ?? 'UNPAID').toLowerCase()}`}>{selectedRecord.paymentStatus ?? 'UNPAID'}</strong></div>{selectedRecord.status === 'FLAGGED' && <div className="warning"><strong>READING REQUIRES VERIFICATION</strong></div>}
      <div className="receipt-info"><div><span>Customer</span><strong>{selectedRecord.customerName}</strong></div><div><span>Meter Number</span><strong>{selectedRecord.meterNumber}</strong></div><div><span>Reading Date</span><strong>{new Date(selectedRecord.capturedAt).toLocaleString()}</strong></div>{selectedRecord.paidAt && <div><span>Recorded Paid</span><strong>{new Date(selectedRecord.paidAt).toLocaleString()}</strong></div>}</div>
      <div className="receipt-breakdown"><div><span>Previous Reading</span><strong>{selectedRecord.previousReading}</strong></div><div><span>Current Reading</span><strong>{selectedRecord.currentReading}</strong></div><div><span>Consumption</span><strong>{selectedRecord.consumption} m³</strong></div><div><span>Minimum Charge</span><strong>{money.format(selectedRecord.minimumCharge)}</strong></div><div><span>Excess ({selectedRecord.excessConsumption} m³ × ₱2.00)</span><strong>{money.format(selectedRecord.excessCharge)}</strong></div><div className="receipt-total"><span>TOTAL</span><strong>{money.format(selectedRecord.total)}</strong></div></div>
      {(selectedRecord.paymentMethod || selectedRecord.paymentReference || selectedRecord.paymentRemarks) && <div className="payment-evidence"><strong>PAYMENT DETAILS</strong>{selectedRecord.paymentMethod && <span>Method: {selectedRecord.paymentMethod}</span>}{selectedRecord.paymentReference && <span>Reference: {selectedRecord.paymentReference}</span>}{selectedRecord.paymentRemarks && <span>Remarks: {selectedRecord.paymentRemarks}</span>}</div>}
      {meterPhotoUrl && <div className="meter-evidence"><strong>METER PHOTO EVIDENCE</strong><img src={meterPhotoUrl} alt={`Meter evidence for ${selectedRecord.meterNumber}`} /></div>}
      <p className="receipt-footnote">Field record only. This app does not replace the official billing system.</p></section>
      <div className="receipt-actions no-print"><button type="button" onClick={() => window.print()}>PRINT / PDF</button><button type="button" onClick={() => void saveReceipt(selectedRecord)}>SAVE PNG</button><button type="button" onClick={() => void shareReceipt(selectedRecord)} disabled={!online}>SHARE PNG</button><button type="button" onClick={() => emailReceipt(selectedRecord)} disabled={!online}>EMAIL</button></div>
    </section>}

    {screen === 'daily' && <section className="screen-card daily-sheet"><div className="section-heading"><div><p className="eyebrow">FIELD REPORT</p><h2>Daily Log</h2><span>{new Date().toLocaleDateString()}</span></div><button className="print-button" type="button" onClick={() => window.print()}>PRINT / PDF</button></div><div className="summary-grid"><div><span>Records</span><strong>{todayRecords.length}</strong></div><div><span>Consumption</span><strong>{dailyTotals.consumption} m³</strong></div><div><span>Amount</span><strong>{money.format(dailyTotals.amount)}</strong></div><div><span>Unpaid</span><strong>{dailyTotals.unpaid}</strong></div><div><span>Flagged</span><strong>{dailyTotals.flagged}</strong></div></div>{todayRecords.length === 0 ? <p className="empty-state">No readings saved today.</p> : <div className="table-wrap"><table><thead><tr><th>Customer</th><th>Meter</th><th>Prev</th><th>Current</th><th>Use</th><th>Amount</th><th>Collection</th><th>Reading</th></tr></thead><tbody>{todayRecords.map((r) => <tr key={r.id}><td>{r.customerName}</td><td>{r.meterNumber}</td><td>{r.previousReading}</td><td>{r.currentReading}</td><td>{r.consumption}</td><td>{money.format(r.total)}</td><td>{r.paymentStatus ?? 'UNPAID'}</td><td>{r.status}</td></tr>)}</tbody></table></div>}</section>}

    <nav className="bottom-nav no-print"><button className={screen === 'reading' ? 'active' : ''} type="button" onClick={() => setScreen('reading')}>Reading</button><button className={['history','folder','receipt'].includes(screen) ? 'active' : ''} type="button" onClick={() => setScreen('history')}>History</button><button className={screen === 'daily' ? 'active' : ''} type="button" onClick={() => setScreen('daily')}>Daily Log</button></nav>
  </main>;
}