import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { getSetting } from './pilot-data';

type Identity = {
  readerName: string;
  waterSystemName: string;
};

export const FIELD_IDENTITY_UPDATED = 'water-meter-reader:field-identity-updated';

export function FieldIdentity() {
  const [identity, setIdentity] = useState<Identity>({ readerName: '', waterSystemName: '' });
  const [receiptTarget, setReceiptTarget] = useState<Element | null>(null);

  async function refreshIdentity() {
    setIdentity({
      readerName: await getSetting('readerName', ''),
      waterSystemName: await getSetting('waterSystemName', ''),
    });
  }

  useEffect(() => {
    void refreshIdentity();
    const onUpdated = () => void refreshIdentity();
    window.addEventListener(FIELD_IDENTITY_UPDATED, onUpdated);
    return () => window.removeEventListener(FIELD_IDENTITY_UPDATED, onUpdated);
  }, []);

  useEffect(() => {
    const findTarget = () => setReceiptTarget(document.querySelector('.receipt-card'));
    findTarget();
    const observer = new MutationObserver(findTarget);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  const hasIdentity = Boolean(identity.readerName || identity.waterSystemName);
  if (!hasIdentity) return null;

  const receiptIdentity = receiptTarget ? createPortal(
    <div className="field-identity-receipt">
      {identity.waterSystemName && <div><span>Water System / Barangay</span><strong>{identity.waterSystemName}</strong></div>}
      {identity.readerName && <div><span>Meter Reader</span><strong>{identity.readerName}</strong></div>}
    </div>,
    receiptTarget,
  ) : null;

  return (
    <>
      <aside className="field-identity-banner no-print" aria-label="Current field identity">
        {identity.waterSystemName && <strong>{identity.waterSystemName}</strong>}
        {identity.readerName && <span>Reader: {identity.readerName}</span>}
      </aside>
      {receiptIdentity}
    </>
  );
}
