# Water Meter Reader Assistant

Mobile-first, offline-first PWA for field water meter reading, deterministic charge computation, photo evidence, local record keeping, receipts, and printable daily logs.

## Core workflow

**Read → Capture → Compute → Record → Customer Folder → Receipt → Collection Status → Report**

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

## Current field workflow

- Existing meter lookup auto-fills the saved customer and uses the latest active Current Reading as the next Previous Reading
- VOID readings are ignored when carrying forward the next Previous Reading
- Duplicate same-day readings trigger a warning rather than silent rejection
- Customer folders preserve the full reading timeline
- History supports customer/meter search plus All / Pending / Paid / Void filtering
- Folder history can also be filtered by all dates, month, or exact date
- Each active reading carries manual Pending / Paid collection status
- Marking paid can capture optional method, reference/OR number, and remarks
- Meter photo evidence is viewable from the receipt
- Receipts can be printed/PDF, saved as PNG, or shared as a PNG through the device share sheet when supported
- Guarded Edit preserves prior values and marks changed records EDITED
- Guarded VOID replaces destructive deletion and preserves audit evidence
- Daily Log summarizes active records, consumption, amount, pending readings, and flagged readings

## Pilot settings and data safety

- Reader Name and Water System / Barangay are stored in IndexedDB settings
- Saving field identity performs a read-back verification before reporting success
- Saved identity appears in the app and receipt
- Export Backup preserves customers, readings, photos, collection state, edit/void audit data, and settings
- Restore Backup supports Merge and guarded Replace
- App displays the `0.1.0-pilot` version and Last Backup status

## Planned v1 stack

- React + TypeScript + Vite
- PWA / Service Worker
- IndexedDB via Dexie
- Camera capture via browser media/file APIs
- Browser print, PNG rendering, and native share capabilities

## Data ownership

Customer names, meter numbers, readings, photos, collection status, and receipts remain on the device by default. Backup/export is explicit and user-initiated.

`PAID` is a manual field-collection status recorded by the meter reader. It is not a bank/payment-gateway settlement and does not replace official accounting records.

Development work lands through feature branches and pull requests.
Deployment: Cloudflare Pages production.
