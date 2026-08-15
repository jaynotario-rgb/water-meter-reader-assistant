import { FormEvent, useEffect, useMemo, useState } from 'react';
import { db } from './data/db';
import { calculateBilling } from './domain/billing';
import type { Customer, ReadingRecord } from './domain/models';

const money = new Intl.NumberFormat('en-PH', { style: 'currency', currency: 'PHP' });
type Screen = 'reading' | 'history' | 'daily';

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
        total: result.total, status: result.status, capturedAt: now,
        ...(photo ? { meterPhoto: photo } : {}),
      };

      await db.transaction('rw', db.customers, db.records, async () => {
        await db.customers.put(customer);
        await db.records.add(record);
      });
      await refreshRecords();
      setMessage(`Saved on this device. Record ${record.id.slice(0, 8).toUpperCase()}.`);
      setCurrentReading('');
      setPreviousReading(String(record.currentReading));
      setPhoto(undefined);
    } catch (error) {
      console.error(error);
      setMessage('Could not save the reading. No record was intentionally changed.');
    } finally { setSaving(false); }
  }

  const today = new Date().toLocaleDateString('en-CA');
  const todayRecords = records.filter((r) => new Date(r.capturedAt).toLocaleDateString('en-CA') === today);
  const dailyTotals = todayRecords.reduce((a, r) => ({
    consumption: a.consumption + r.consumption,
    amount: a.amount + r.total,
    flagged: a.flagged + (r.status === 'FLAGGED' ? 1 : 0),
  }), { consumption: 0, amount: 0, flagged: 0 });

  return (
    <main className="app-shell">
      <header className="topbar">
        <div><p className="eyebrow">FIELD TOOL</p><h1>Water Meter Reader</h1></div>
        <span className={`network ${online ? 'online' : 'offline'}`}><span aria-hidden="true">●</span> {online ? 'ONLINE' : 'OFFLINE'}</span>
      </header>
      <p className="device-note">Records are saved on this device.</p>

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
        </form>
      )}

      {screen === 'history' && <section className="screen-card">
        <div className="section-heading"><div><p className="eyebrow">LOCAL RECORDS</p><h2>History</h2></div><strong>{records.length}</strong></div>
        {records.length === 0 ? <p className="empty-state">No saved readings yet.</p> : <div className="record-list">{records.map((r) => <article className="record-row" key={r.id}>
          <div><strong>{r.customerName}</strong><span>{r.meterNumber} · {new Date(r.capturedAt).toLocaleString()}</span></div>
          <div className="record-amount"><strong>{money.format(r.total)}</strong><span className={r.status === 'FLAGGED' ? 'status-flagged' : ''}>{r.status}</span></div>
          <dl><div><dt>Previous</dt><dd>{r.previousReading}</dd></div><div><dt>Current</dt><dd>{r.currentReading}</dd></div><div><dt>Consumption</dt><dd>{r.consumption} m³</dd></div></dl>
        </article>)}</div>}
      </section>}

      {screen === 'daily' && <section className="screen-card daily-sheet">
        <div className="section-heading"><div><p className="eyebrow">FIELD REPORT</p><h2>Daily Log</h2><span>{new Date().toLocaleDateString()}</span></div><button className="print-button" type="button" onClick={() => window.print()}>PRINT / PDF</button></div>
        <div className="summary-grid"><div><span>Records</span><strong>{todayRecords.length}</strong></div><div><span>Consumption</span><strong>{dailyTotals.consumption} m³</strong></div><div><span>Amount</span><strong>{money.format(dailyTotals.amount)}</strong></div><div><span>Flagged</span><strong>{dailyTotals.flagged}</strong></div></div>
        {todayRecords.length === 0 ? <p className="empty-state">No readings saved today.</p> : <div className="table-wrap"><table><thead><tr><th>Customer</th><th>Meter</th><th>Prev</th><th>Current</th><th>Use</th><th>Amount</th><th>Status</th></tr></thead><tbody>{todayRecords.map((r) => <tr key={r.id}><td>{r.customerName}</td><td>{r.meterNumber}</td><td>{r.previousReading}</td><td>{r.currentReading}</td><td>{r.consumption}</td><td>{money.format(r.total)}</td><td>{r.status}</td></tr>)}</tbody></table></div>}
      </section>}

      <nav className="bottom-nav" aria-label="Primary navigation">
        <button className={screen === 'reading' ? 'active' : ''} type="button" onClick={() => setScreen('reading')}>Reading</button>
        <button className={screen === 'history' ? 'active' : ''} type="button" onClick={() => setScreen('history')}>History</button>
        <button className={screen === 'daily' ? 'active' : ''} type="button" onClick={() => setScreen('daily')}>Daily Log</button>
      </nav>
    </main>
  );
}