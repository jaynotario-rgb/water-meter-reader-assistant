# Water Meter Reader Assistant

Mobile-first, offline-first PWA for field water meter reading, deterministic charge computation, photo evidence, local record keeping, receipts, collection tracking, and printable daily logs.

## Core workflow

**Read → Capture → Compute → Record → Receipt → Report**

The app is designed for meter readers working from a mobile phone, including areas with unreliable or no connectivity. The device and its local database are the primary working environment; cloud services are optional backup targets, not runtime dependencies.

## Pilot v0.1

The current pilot build includes:

- deterministic billing and anomaly warnings
- camera/file meter-photo evidence
- IndexedDB local persistence
- customer/meter folders and historical reading timeline
- search plus **All / Pending / Paid / Void** history filtering
- month and exact-date lookup inside customer folders
- manual Paid/Pending collection state and optional payment details
- guarded edit with revision history and an EDITED marker
- guarded VOID workflow instead of destructive hard delete
- PNG receipt save, print/PDF, share, and email handoff
- printable Daily Log
- Reader Name and Water System / Barangay pilot settings
- explicit local **Export Backup** and **Restore Backup** workflows
- Merge restore by default; Replace requires explicit destructive confirmations
- last-backup reminder and visible pilot version

## Data safety

Records, photographs, audit history, and settings stay on the device by default. The pilot's backup export packages customers, readings, photos, statuses, audit fields, and settings into a JSON backup file. Restore never runs silently: the reader explicitly chooses Merge or Replace.

For field use, export backups regularly and copy the backup file to another safe location such as phone storage, Drive, Dropbox, or iCloud when available.

## Billing rules

- Minimum consumption: **15 m³**
- Minimum charge: **₱15.00**
- Excess rate: **₱2.00 per m³** above 15 m³
- Consumption = current reading − previous reading
- If current reading is lower than previous reading, preserve the negative consumption and mark the record **FLAGGED**

## Stack

- React + TypeScript + Vite
- PWA / Service Worker
- IndexedDB via Dexie
- Camera capture via browser media/file APIs
- Browser print, download, and share capabilities

## Product boundaries

The application is a field-record assistant, not the official billing/accounting system. `PAID` is a manual collection status recorded by the meter reader. OCR, mandatory accounts, payment gateways, cloud sync, and supervisor roles are intentionally deferred until a real workflow requires them.

Development work lands through feature branches and pull requests.