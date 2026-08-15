import { FormEvent, useEffect, useMemo, useState } from 'react';
import { db } from './data/db';
import { calculateBilling } from './domain/billing';
import type { Customer, ReadingRecord } from './domain/models';

const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
type Screen = 'reading' | 'history' | 'daily' | 'folder' | 'receipt';

function receiptText(record: ReadingRecord) {
  const excess = `${record.excessConsumption} m³ × ₱2.00`;
  return [
    'WATER METER READER ASSISTANT',
    '',
    `Customer: ${record.customerName}`,
    `Meter Number: ${record.meterNumber}`,
    `Date: ${new Date(record.capturedAt).toLocaleString()}`,
    `Record ID: ${record.id.toUpperCase()}`,
    '',
    `Previous Reading: ${record.previousReading}`,
    `Current Reading: ${record.currentReading}`,
    `Consumption: ${record.consumption} m³`,
    `Minimum Charge: ${money.format(record.minimumCharge)}`,
    `Excess: ${excess}`,
    `Excess Charge: ${money.format(record.excessCharge)}`,
    `TOTAL: ${money.format(record.total)}`,
    '',
    `Reading Status: ${record.status}`,
    `Collection Status: ${record.paymentStatus ?? 'UNPAID'}`,
    ...(record.paidAt ? [`Recorded Paid: ${new Date(record.paidAt).toLocaleString()}`] : []),
    ...(record.status === 'FLAGGED' ? ['', 'READING REQUIRES VERIFICATION'] : []),
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
    const saved = await db.records.orderBy('capturedAt').reverse().toArray();
    setRecords(saved);
  }

  useEffect(() => { void refreshRecords(); }, [screen]);

  const previous = Number(previousReading);
  const current = Number(currentReading);
  const hasReadings = previousReading !== '' && currentReading !== '';
  const result = useMemo(
    () => (hasReadings ? calculateBilling(previous, current) : undefined),
    [hasReadings, previous, current],
  );

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

  async function setPaymentStatus(record: ReadingRecord, paid: boolean) {
    await db.records.update(record.id, {
      paymentStatus: paid ? 'PAID' : 'UNPAID',
      ...(paid ? { paidAt: new Date().toISOString() } : { paidAt: undefined }),
    });
    await refreshRecords();
  }

  function openFolder(customerId: string) {
    setSelectedCustomerId(customerId);
    setScreen('folder');
  }

  function openReceipt(recordId: string) {
    setSelectedRecordId(recordId);
    setScreen('receipt');
  }

  const selectedRecord = records.find((r) => r.id === selectedRecordId);
  const folderRecords = records.filter((r) => r.customerId === selectedCustomerId);
  const folderCustomer = folderRecords[0];

  const customerFolders = useMemo(() => {
    const map = new Map<string, ReadingRecord[]>();
    for (const record of records) {
      const current = map.get(record.customerId) ?? [];
      current.push(record);
      map.set(record.customerId, current);
    }
    return Array.from(map.entries()).map(([customerId, customerRecords]) => ({
      customerId,
      latest: customerRecords[0],
      count: customerRecords.length,
      unpaid: customerRecords.filter((r) => (r.paymentStatus ?? 'UNPAID') === 'UNPAID').length,
    }));
  }, [records]);

  const filteredFolders = customerFolders.filter(({ latest }) => {
    const query = search.trim().toLowerCase();
    if (!query) return true;
    return latest.customerName.toLowerCase().includes(query) || latest.meterNumber.toLowerCase().includes(query);
  });

  const today = new Date().toLocaleDateString('en-CA');
  const todayRecords = records.filter((r) => new Date(r.capturedAt).toLocaleDateString('en-CA') === today);
  const dailyTotals = todayRecords.reduce((a, r) => ({
    consumption: a.consumption + r.consumption,
    amount: a.amount + r.total,
    flagged: a.flagged + (r.status === 'FLAGGED' ? 1 : 0),
    unpaid: a.unpaid + ((r.paymentStatus ?? 'UNPAID') === 'UNPAID' ? 1 : 0),
  }), { consumption: 0, amount: 0, flagged: 0, unpaid: 0 });

  async function shareReceipt(record: ReadingRecord) {
    if (!online) {
      setMessage('Offline: save or print the receipt on this device, then share it later when connected.');
      return;
    }
    const text = receiptText(record);
    if (navigator.share) {
      try {
        await navigator.share({ title: `Water Receipt - ${record.customerName}`, text });
        return;
      } catch (error) {
        if ((error as DOMException).name === 'AbortError') return;
      }
    }
    await navigator.clipboard?.writeText(text);
    setMessage('Receipt copied. Paste it into Messenger, email, or another app.');
  }

  function emailReceipt(record: ReadingRecord) {
    if (!online) {
      setMessage('Email needs an internet connection. Save the receipt first and send it later.');
      return;
    }
    const subject = encodeURIComponent(`Water Meter Receipt - ${record.customerName}`);
    const body = encodeURIComponent(receiptText(record));
    window.location.href = `mailto:?subject=${subject}&body=${body}`;
  }

  function saveReceipt(record: ReadingRecord) {
    const text = receiptText(record);
    const blob = new Blob([text], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `water-receipt-${record.meterNumber}-${record.id.slice(0, 8)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <main className="app-shell">
      <header className="topbar no-print">
        <div><p className="eyebrow">FIELD TOOL</p><h1>Water Meter Reader</h1></div>
        <span className={`network ${online ? 'online' : 'offline'}`}><span aria-hidden="true">●</span> {online ? 'ONLINE' : 'OFFLINE'}</span>
      </header>
      <p className="device-note no-print">Records are saved on this device.</p>

      {screen === 'reading' && (
        <form className="reading-card" onSubmit={saveReading}>
          <label>Customer / Account Name<input autoComplete="name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} placeholder="Juan Dela Cruz" /></label>
          <label>Meter Number<input value={meterNumber} onChange={(e) => setMeterNumber(e.target.value)} placeholder="WM-00423" /></label>
          <div className="reading-grid">
            <label>Previous<input className="number-input" type="number" inputMode="decimal" step="any" value={previousReading} onChange={(e) => setPreviousReading(e.target.value)} placeholder="120" /></label>
            <label>Current<input className="number-input" type="number" inputMode="decimal" step="any" value={currentReading} onChange={(e) => setCurrentReading(e.target.value)} placeholder="145" /></label>
          </div>
          {result && <section className="calculation" aria-live="polite">
            {result.status === 'FLAGGED' && <div className="warning"><strong>Reading requires verification.</strong><span>Current reading is lower than previous reading.</span></div>}
            <div><span>Consumption</span><strong>{result.consumption} m³</strong></div>
            <div><span>Minimum ({result.minimumConsumption} m³)</span><strong>{money.format(result.minimumCharge)}</strong></div>
            <div><span>Excess ({result.excessConsumption} m³ × ₱2.00)</span><strong>{money.format(result.excessCharge)}</strong></div>
            <div className="total"><span>TOTAL</span><strong>{money.format(result.total)}</strong></div>
          </section>}
          <label className="capture-button"><span>{photo ? '✓ METER PHOTO ATTACHED' : 'CAPTURE METER'}</span><input className="visually-hidden" type="file" accept="image/*" capture="environment" onChange={(e) => setPhoto(e.target.files?.[0])} /></label>
          <p className="evidence-note">Photo is evidence only. The entered reading remains the source of truth.</p>
          {message && <p className="save-message" role="status">{message}</p>}
          <button className="save-button" type="submit" disabled={saving}>{saving ? 'SAVING…' : 'SAVE READING'}</button>
          {selectedRecordId && <button className="secondary-button" type="button" onClick={() => setScreen('receipt')}>VIEW LAST RECEIPT</button>}
        </form>
      )}

      {screen === 'history' && <section className="screen-card">
        <div className="section-heading"><div><p className="eyebrow">CUSTOMER RECORDS</p><h2>History</h2></div><strong>{customerFolders.length}</strong></div>
        <input className="search-input" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search customer or meter number" />
        {filteredFolders.length === 0 ? <p className="empty-state">No matching customer records.</p> : <div className="folder-list">{filteredFolders.map(({ customerId, latest, count, unpaid }) => <button className="folder-row" key={customerId} type="button" onClick={() => openFolder(customerId)}>
          <div><strong>{latest.customerName}</strong><span>{latest.meterNumber}</span></div>
          <div className="folder-meta"><strong>{count} reading{count === 1 ? '' : 's'}</strong><span>{unpaid ? `${unpaid} unpaid` : 'All marked paid'}</span></div>
        </button>)}</div>}
      </section>}

      {screen === 'folder' && <section className="screen-card">
        <button className="back-button" type="button" onClick={() => setScreen('history')}>← BACK TO HISTORY</button>
        <div className="section-heading"><div><p className="eyebrow">CUSTOMER FOLDER</p><h2>{folderCustomer?.customerName ?? 'Customer'}</h2><span>{folderCustomer?.meterNumber}</span></div><strong>{folderRecords.length}</strong></div>
        {folderRecords.map((r) => <article className="record-row" key={r.id}>
          <div><strong>{new Date(r.capturedAt).toLocaleDateString()}</strong><span>{new Date(r.capturedAt).toLocaleTimeString()} · {r.id.slice(0, 8).toUpperCase()}</span></div>
          <div className="record-amount"><strong>{money.format(r.total)}</strong><span className={(r.paymentStatus ?? 'UNPAID') === 'PAID' ? 'status-paid' : 'status-unpaid'}>{r.paymentStatus ?? 'UNPAID'}</span></div>
          <dl><div><dt>Previous</dt><dd>{r.previousReading}</dd></div><div><dt>Current</dt><dd>{r.currentReading}</dd></div><div><dt>Consumption</dt><dd>{r.consumption} m³</dd></div></dl>
          <div className="record-actions">
            <button type="button" onClick={() => openReceipt(r.id)}>RECEIPT</button>
            {(r.paymentStatus ?? 'UNPAID') === 'UNPAID'
              ? <button type="button" onClick={() => void setPaymentStatus(r, true)}>MARK PAID</button>
              : <button type="button" onClick={() => void setPaymentStatus(r, false)}>MARK UNPAID</button>}
          </div>
        </article>)}
      </section>}

      {screen === 'receipt' && selectedRecord && <section className="screen-card receipt-card">
        <button className="back-button no-print" type="button" onClick={() => selectedCustomerId ? setScreen('folder') : setScreen('history')}>← BACK</button>
        <div className="receipt-header"><p className="eyebrow">FIELD RECEIPT</p><h2>Water Meter Reader Assistant</h2><span>Record {selectedRecord.id.slice(0, 8).toUpperCase()}</span></div>
        {selectedRecord.status === 'FLAGGED' && <div className="warning"><strong>READING REQUIRES VERIFICATION</strong><span>Current reading is lower than previous reading.</span></div>}
        <div className="receipt-info"><div><span>Customer</span><strong>{selectedRecord.customerName}</strong></div><div><span>Meter Number</span><strong>{selectedRecord.meterNumber}</strong></div><div><span>Date</span><strong>{new Date(selectedRecord.capturedAt).toLocaleString()}</strong></div></div>
        <div className="receipt-breakdown">
          <div><span>Previous Reading</span><strong>{selectedRecord.previousReading}</strong></div>
          <div><span>Current Reading</span><strong>{selectedRecord.currentReading}</strong></div>
          <div><span>Consumption</span><strong>{selectedRecord.consumption} m³</strong></div>
          <div><span>Minimum Charge</span><strong>{money.format(selectedRecord.minimumCharge)}</strong></div>
          <div><span>Excess ({selectedRecord.excessConsumption} m³ × ₱2.00)</span><strong>{money.format(selectedRecord.excessCharge)}</strong></div>
          <div className="receipt-total"><span>TOTAL</span><strong>{money.format(selectedRecord.total)}</strong></div>
        </div>
        <div className="collection-panel"><span>Collection status</span><strong className={(selectedRecord.paymentStatus ?? 'UNPAID') === 'PAID' ? 'status-paid' : 'status-unpaid'}>{selectedRecord.paymentStatus ?? 'UNPAID'}</strong>{selectedRecord.paidAt && <small>Recorded paid {new Date(selectedRecord.paidAt).toLocaleString()}</small>}</div>
        <p className="receipt-note">Field record only. Payment status is manually recorded by the meter reader and does not replace the official billing/accounting system.</p>
        <div className="receipt-actions no-print">
          <button type="button" onClick={() => window.print()}>PRINT / SAVE PDF</button>
          <button type="button" onClick={() => saveReceipt(selectedRecord)}>SAVE RECEIPT</button>
          <button type="button" onClick={() => void shareReceipt(selectedRecord)} disabled={!online}>SHARE</button>
          <button type="button" onClick={() => emailReceipt(selectedRecord)} disabled={!online}>EMAIL</button>
        </div>
        {message && <p className="save-message no-print" role="status">{message}</p>}
      </section>}

      {screen === 'daily' && <section className="screen-card daily-sheet">
        <div className="section-heading"><div><p className="eyebrow">FIELD REPORT</p><h2>Daily Log</h2><span>{new Date().toLocaleDateString()}</span></div><button className="print-button no-print" type="button" onClick={() => window.print()}>PRINT / PDF</button></div>
        <div className="summary-grid"><div><span>Records</span><strong>{todayRecords.length}</strong></div><div><span>Consumption</span><strong>{dailyTotals.consumption} m³</strong></div><div><span>Amount</span><strong>{money.format(dailyTotals.amount)}</strong></div><div><span>Unpaid</span><strong>{dailyTotals.unpaid}</strong></div><div><span>Flagged</span><strong>{dailyTotals.flagged}</strong></div></div>
        {todayRecords.length === 0 ? <p className="empty-state">No readings saved today.</p> : <div className="table-wrap"><table><thead><tr><th>Customer</th><th>Meter</th><th>Prev</th><th>Current</th><th>Use</th><th>Amount</th><th>Reading</th><th>Collection</th></tr></thead><tbody>{todayRecords.map((r) => <tr key={r.id}><td>{r.customerName}</td><td>{r.meterNumber}</td><td>{r.previousReading}</td><td>{r.currentReading}</td><td>{r.consumption}</td><td>{money.format(r.total)}</td><td>{r.status}</td><td>{r.paymentStatus ?? 'UNPAID'}</td></tr>)}</tbody></table></div>}
      </section>}

      <nav className="bottom-nav no-print" aria-label="Primary navigation">
        <button className={screen === 'reading' ? 'active' : ''} type="button" onClick={() => setScreen('reading')}>Reading</button>
        <button className={screen === 'history' || screen === 'folder' || screen === 'receipt' ? 'active' : ''} type="button" onClick={() => setScreen('history')}>Records</button>
        <button className={screen === 'daily' ? 'active' : ''} type="button" onClick={() => setScreen('daily')}>Daily Log</button>
      </nav>
    </main>
  );
}