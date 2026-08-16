import { useEffect } from 'react';

/**
 * Small pilot-only presentation guards around browser-context limitations.
 * Core record/filter behavior remains owned by App.tsx.
 */
export function PilotUxGuards() {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.secureContext = String(window.isSecureContext);

    let cleanupSelect: (() => void) | undefined;

    const syncUi = () => {
      const select = document.querySelector<HTMLSelectElement>('.history-status-select');
      if (select) {
        root.dataset.historyStatus = select.value;
        if (!select.dataset.guardBound) {
          const onChange = () => { root.dataset.historyStatus = select.value; };
          select.addEventListener('change', onChange);
          select.dataset.guardBound = 'true';
          cleanupSelect = () => select.removeEventListener('change', onChange);
        }
      }

      const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>('.receipt-actions button'));
      const shareButton = buttons.find((button) => button.textContent?.trim().startsWith('SHARE'));
      if (shareButton && !window.isSecureContext) {
        shareButton.disabled = true;
        shareButton.textContent = 'SHARE (HTTPS)';
        shareButton.title = 'Native sharing becomes available on the HTTPS pilot deployment.';
      }
    };

    syncUi();
    const observer = new MutationObserver(syncUi);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      observer.disconnect();
      cleanupSelect?.();
      delete root.dataset.historyStatus;
      delete root.dataset.secureContext;
    };
  }, []);

  return null;
}
