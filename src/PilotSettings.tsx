import { useEffect, useState } from 'react';
import { FIELD_IDENTITY_UPDATED } from './FieldIdentity';
import { appConfirm, appPrompt } from './AppDialog';
import { exportBackup, getSetting, PILOT_VERSION, resetPilotData, restoreBackup, setSetting } from './pilot-data';

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
  const [savingIdentity, setSavingIdentity] = useState(false);
  const [resetting, setResetting] = useState(false);

  useEffect(() => {
    if (!open) return;
    void (async () => {
      setReaderName(await getSetting('readerName', ''));
      setWaterSystemName(await getSetting('waterSystemName', ''));
      setLastBackupAt(await getSetting<string | undefined>('lastBackupAt', undefined));
      setMessage(undefined);
    })();
  }, [open]);

  if (!open) return null;

  async function saveIdentity() {
    setSavingIdentity(true);
    setMessage(undefined);
    try {
      const nextReader = readerName.trim();
      const nextSystem = waterSystemName.trim();
      await Promise.all([
        setSetting('readerName', nextReader),
        setSetting('waterSystemName', nextSystem),
      ]);

      const [savedReader, savedSystem] = await Promise.all([
        getSetting('readerName', ''),
        getSetting('waterSystemName', ''),
      ]);

      if (savedReader !== nextReader || savedSystem !== nextSystem) throw new Error('Saved values could not be verified.');
      window.dispatchEvent(new CustomEvent(FIELD_IDENTITY_UPDATED));
      setMessage('Settings saved on this device.');
    } catch (error) {
      console.error(error);
      setMessage('Could not save field settings. Existing records were not changed.');
    } finally { setSavingIdentity(false); }
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
      const confirmed = await appConfirm('This will clear the current local customers, readings, photos, and settings before restoring the backup.', { title: 'Water Meter Reader', confirmLabel: 'CONTINUE' });
      if (!confirmed) return;
      if (!await appConfirm('Final confirmation: replace all local Water Meter Reader data with this backup?', { title: 'Water Meter Reader', confirmLabel: 'REPLACE DATA' })) return;
    } else if (!await appConfirm('Merge this backup with the records already stored on this device? Existing records with the same IDs will be updated.', { title: 'Water Meter Reader', confirmLabel: 'MERGE BACKUP' })) return;

    try {
      const result = await restoreBackup(file, restoreMode);
      setMessage(`Restore complete: ${result.customers} customer(s), ${result.records} record(s). Reloading…`);
      setTimeout(() => window.location.reload(), 600);
    } catch (error) {
      console.error(error);
      setMessage(error instanceof Error ? error.message : 'Could not restore backup.');
    }
  }

  async function handleReset() {
    const confirmed = await appConfirm(
      'This permanently removes all reading history, daily logs, customer/meter memory, and saved meter photos from this device. Reader Name and Water System / Barangay will be kept.',
      { title: 'Water Meter Reader', confirmLabel: 'CONTINUE' },
    );
    if (!confirmed) return;
    const phrase = await appPrompt('Type RESET DATA to confirm.', '', { title: 'Water Meter Reader', confirmLabel: 'VERIFY' });
    if (phrase?.trim().toUpperCase() !== 'RESET DATA') {
      setMessage('Reset cancelled. No data was removed.');
      return;
    }
    if (!await appConfirm('Final confirmation: permanently clear the field records on this device?', { title: 'Water Meter Reader', confirmLabel: 'RESET DATA' })) return;

    setResetting(true);
    try {
      await resetPilotData();
      setMessage('Field records cleared. Reader and Water System settings were kept. Reloading…');
      setTimeout(() => window.location.reload(), 700);
    } catch (error) {
      console.error(error);
      setMessage('Could not reset field records. No further action was taken.');
      setResetting(false);
    }
  }

  return (
    <div className="pilot-overlay" role="dialog" aria-modal="true" aria-label="Pilot settings">
      <section className="pilot-panel">
        <div className="pilot-heading"><div><p className="eyebrow">PILOT SETTINGS</p><h2>Field Setup & Data Safety</h2></div><button type="button" className="pilot-close" onClick={onClose}>CLOSE</button></div>
        <div className="pilot-version"><strong>Water Meter Reader Assistant</strong><span>{PILOT_VERSION}</span></div>

        <label>Reader Name<input value={readerName} onChange={(e) => setReaderName(e.target.value)} placeholder="Meter reader name" /></label>
        <label>Water System / Barangay<input value={waterSystemName} onChange={(e) => setWaterSystemName(e.target.value)} placeholder="Water system or barangay name" /></label>
        <button type="button" className="secondary-button" disabled={savingIdentity} onClick={() => void saveIdentity()}>{savingIdentity ? 'SAVING…' : 'SAVE SETTINGS'}</button>

        <section className="pilot-safety"><div><strong>Local Data Backup</strong><span>Records and photos stay on this device unless you export a backup.</span></div><p className={lastBackupAt ? 'backup-ok' : 'backup-warning'}>{lastBackupAt ? `Last backup: ${new Date(lastBackupAt).toLocaleString()}` : 'Last backup: Never'}</p><button type="button" className="save-button" onClick={() => void handleBackup()}>EXPORT BACKUP</button></section>

        <section className="pilot-restore"><div><strong>Restore Backup</strong><span>Merge is safest. Replace clears this device first and requires two confirmations.</span></div><label>Restore Mode<select value={restoreMode} onChange={(e) => setRestoreMode(e.target.value as 'merge' | 'replace')}><option value="merge">Merge with existing records</option><option value="replace">Replace all local records</option></select></label><label className="restore-file">CHOOSE BACKUP FILE<input type="file" accept="application/json,.json" onChange={(e) => { const file = e.target.files?.[0]; void handleRestore(file); e.currentTarget.value = ''; }} /></label></section>

        <section className="pilot-restore"><div><strong>Reset Field Records</strong><span>Use before a fresh field pilot. Permanently clears readings, logs, customer memory, and photos on this device. Reader and Water System settings are kept.</span></div><button type="button" className="danger-button" disabled={resetting} onClick={() => void handleReset()}>{resetting ? 'RESETTING…' : 'RESET PILOT DATA'}</button></section>

        {message && <p className="global-message" role="status">{message}</p>}
      </section>
    </div>
  );
}