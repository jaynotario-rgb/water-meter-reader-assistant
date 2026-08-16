import { useEffect, useState } from 'react';
import { FIELD_IDENTITY_UPDATED } from './FieldIdentity';
import { exportBackup, getSetting, PILOT_VERSION, restoreBackup, setSetting } from './pilot-data';

interface PilotSettingsProps {
  open: boolean;
  onClose: () => void;
}

export function PilotSettings({ open, onClose }: PilotSettingsProps) {
  const [readerName, setReaderName] = useState('');
  const [waterSystemName, setWaterSystemName] = useState('');
  const [lastBackupAt, setLastBackupAt] = useState<string>();
  const [restoreMode, setRestoreMode] = useState<'merge' | 'replace'>('merge');
  const [message, setMessage] = useState<string>();

  useEffect(() => {
    if (!open) return;
    void (async () => {
      setReaderName(await getSetting('readerName', ''));
      setWaterSystemName(await getSetting('waterSystemName', ''));
      setLastBackupAt(await getSetting<string | undefined>('lastBackupAt', undefined));
    })();
  }, [open]);

  if (!open) return null;

  async function saveIdentity() {
    await setSetting('readerName', readerName.trim());
    await setSetting('waterSystemName', waterSystemName.trim());
    window.dispatchEvent(new CustomEvent(FIELD_IDENTITY_UPDATED));
    setMessage('Settings saved and applied to this device.');
  }

  async function handleBackup() {
    try {
      const result = await exportBackup();
      setLastBackupAt(result.exportedAt);
      setMessage(`Backup saved: ${result.fileName}`);
    } catch (error) {
      console.error(error);
      setMessage('Could not create backup. No local records were changed.');
    }
  }

  async function handleRestore(file?: File) {
    if (!file) return;

    if (restoreMode === 'replace') {
      const confirmed = window.confirm(
        'REPLACE LOCAL DATA?\n\nThis will clear the current local customers, readings, photos, and settings before restoring the backup. The backup file itself is not changed.',
      );
      if (!confirmed) return;
      if (!window.confirm('Final confirmation: replace all local Water Meter Reader data with this backup?')) return;
    } else if (!window.confirm('Merge this backup with the records already stored on this device? Existing records with the same IDs will be updated.')) {
      return;
    }

    try {
      const result = await restoreBackup(file, restoreMode);
      setMessage(`Restore complete: ${result.customers} customer(s), ${result.records} record(s). Reloading…`);
      setTimeout(() => window.location.reload(), 600);
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Could not restore backup.');
    }
  }

  return (
    <div className="pilot-overlay" role="dialog" aria-modal="true" aria-label="Pilot settings">
      <section className="pilot-panel">
        <div className="pilot-heading">
          <div>
            <p className="eyebrow">PILOT SETTINGS</p>
            <h2>Field Setup & Data Safety</h2>
          </div>
          <button type="button" className="pilot-close" onClick={onClose}>CLOSE</button>
        </div>

        <div className="pilot-version">
          <strong>Water Meter Reader Assistant</strong>
          <span>{PILOT_VERSION}</span>
        </div>

        <label>
          Reader Name
          <input value={readerName} onChange={(e) => setReaderName(e.target.value)} placeholder="Meter reader name" />
        </label>
        <label>
          Water System / Barangay
          <input value={waterSystemName} onChange={(e) => setWaterSystemName(e.target.value)} placeholder="Water system or barangay name" />
        </label>
        <button type="button" className="secondary-button" onClick={() => void saveIdentity()}>SAVE SETTINGS</button>

        <section className="pilot-safety">
          <div>
            <strong>Local Data Backup</strong>
            <span>Records and photos stay on this device unless you export a backup.</span>
          </div>
          <p className={lastBackupAt ? 'backup-ok' : 'backup-warning'}>
            {lastBackupAt ? `Last backup: ${new Date(lastBackupAt).toLocaleString()}` : 'Last backup: Never'}
          </p>
          <button type="button" className="save-button" onClick={() => void handleBackup()}>EXPORT BACKUP</button>
        </section>

        <section className="pilot-restore">
          <div>
            <strong>Restore Backup</strong>
            <span>Merge is safest. Replace clears this device first and requires two confirmations.</span>
          </div>
          <label>
            Restore Mode
            <select value={restoreMode} onChange={(e) => setRestoreMode(e.target.value as 'merge' | 'replace')}>
              <option value="merge">Merge with existing records</option>
              <option value="replace">Replace all local records</option>
            </select>
          </label>
          <label className="restore-file">
            CHOOSE BACKUP FILE
            <input type="file" accept="application/json,.json" onChange={(e) => {
              const file = e.target.files?.[0];
              void handleRestore(file);
              e.currentTarget.value = '';
            }} />
          </label>
        </section>

        {message && <p className="global-message" role="status">{message}</p>}
      </section>
    </div>
  );
}
