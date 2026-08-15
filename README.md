# Water Meter Reader Assistant

Mobile-first, offline-first PWA for field water meter reading, deterministic charge computation, photo evidence, local record keeping, receipts, and printable daily logs.

## Core workflow

**Read → Capture → Compute → Record → Receipt → Report**

The app is designed for meter readers working from a mobile phone, including areas with unreliable or no connectivity. The device and its local database are the primary working environment; cloud services are optional backup targets, not runtime dependencies.

## v1 principles

- Offline-first and device-first
- Evidence-first: meter photos support the record but never silently determine the reading
- Deterministic and transparent billing computation
- Preserve anomalous input and flag it for verification instead of silently correcting it
- No mandatory account or cloud connection
- Customer and meter data stay on the device by default

## Billing rules

- Minimum consumption: **15 m³**
- Minimum charge: **₱15.00**
- Excess rate: **₱2.00 per m³** above 15 m³
- Consumption = current reading − previous reading
- If current reading is lower than previous reading, preserve the negative consumption and mark the record **FLAGGED**

## Planned v1 stack

- React + TypeScript + Vite
- PWA / Service Worker
- IndexedDB via Dexie
- Camera capture via browser media/file APIs
- Browser print and share capabilities

## v1 screens

1. **Reading** — customer selection, readings, calculation, meter capture, save
2. **History** — saved records, evidence, receipt
3. **Daily Log** — A4-ready field report and totals

## Data ownership

Customer names, meter numbers, readings, photos, and receipts remain on the device by default. Backup/export is explicit and user-initiated.

Development work lands through feature branches and pull requests.