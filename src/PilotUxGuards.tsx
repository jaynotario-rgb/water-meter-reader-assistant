import { useEffect } from 'react';
import { toBlob } from 'html-to-image';

/**
 * Pilot-only browser-context guards.
 * Core record/filter behavior remains owned by App.tsx.
 */
export function PilotUxGuards() {
  useEffect(() => {
    const root = document.documentElement;
    root.dataset.secureContext = String(window.isSecureContext);

    const ua = navigator.userAgent;
    const mobile = /Android|iPhone|iPad|iPod/i.test(ua) || (window.matchMedia?.('(pointer: coarse)').matches && window.innerWidth <= 900);
    const inAppBrowser = /FBAN|FBAV|Messenger|Instagram|Line\//i.test(ua);
    root.dataset.mobileClient = String(mobile);
    root.dataset.inAppBrowser = String(inAppBrowser);

    let cleanupSelect: (() => void) | undefined;
    let scheduled = false;

    async function receiptFile() {
      const receipt = document.querySelector<HTMLElement>('.receipt-card');
      if (!receipt) throw new Error('Receipt is not rendered.');
      const blob = await toBlob(receipt, { pixelRatio: 2, backgroundColor: '#ffffff' });
      if (!blob) throw new Error('Could not create receipt image.');
      return new File([blob], `water-meter-receipt-${Date.now()}.png`, { type: 'image/png' });
    }

    function openCurrentPageInChrome() {
      if (/Android/i.test(ua)) {
        const schemeLess = window.location.href.replace(/^https?:\/\//, '');
        window.location.href = `intent://${schemeLess}#Intent;scheme=https;package=com.android.chrome;end`;
        return;
      }
      window.alert('Open this page in Chrome or Safari to use the phone share sheet.');
    }

    const onReceiptAction = async (event: Event) => {
      const target = event.target as HTMLElement | null;
      const button = target?.closest<HTMLButtonElement>('.receipt-actions button');
      if (!button) return;
      const label = button.textContent?.trim().toUpperCase() ?? '';

      if (label.startsWith('PRINT') && mobile) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }

      if (label.startsWith('SAVE RECEIPT')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        try {
          const file = await receiptFile();
          const url = URL.createObjectURL(file);
          const a = document.createElement('a');
          a.href = url;
          a.download = file.name;
          a.rel = 'noopener';
          document.body.appendChild(a);
          a.click();
          a.remove();

          if (inAppBrowser) {
            window.setTimeout(() => {
              const opened = window.open(url, '_blank', 'noopener');
              if (!opened) window.location.href = url;
            }, 150);
            window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
          } else {
            window.setTimeout(() => URL.revokeObjectURL(url), 2_000);
          }
        } catch (error) {
          console.error(error);
          window.alert('Could not create the receipt image. Please try again in Chrome.');
        }
        return;
      }

      if (label.startsWith('SHARE') || label.startsWith('OPEN IN CHROME')) {
        event.preventDefault();
        event.stopImmediatePropagation();
        if (!navigator.onLine) {
          window.alert('Offline: save the receipt now and share it later when connected.');
          return;
        }
        try {
          const file = await receiptFile();
          const shareTitle = 'Water Meter Receipt';
          const shareText = `Water Meter Reader receipt\n${window.location.href}`;

          if (navigator.share) {
            if (!navigator.canShare || navigator.canShare({ files: [file] })) {
              await navigator.share({ title: shareTitle, text: shareText, files: [file] });
              return;
            }
            await navigator.share({ title: shareTitle, text: shareText, url: window.location.href });
            return;
          }

          openCurrentPageInChrome();
        } catch (error) {
          if ((error as DOMException).name !== 'AbortError') {
            console.error(error);
            if (inAppBrowser) openCurrentPageInChrome();
            else window.alert('Could not open the phone share sheet. Please try again.');
          }
        }
      }
    };

    function setTextIfChanged(element: HTMLElement, text: string) {
      if (element.textContent?.trim() !== text) element.textContent = text;
    }

    function setDisplayIfChanged(element: HTMLElement, display: string) {
      if (element.style.display !== display) element.style.display = display;
    }

    const syncUi = () => {
      scheduled = false;
      const select = document.querySelector<HTMLSelectElement>('.history-status-select');
      if (select) {
        if (root.dataset.historyStatus !== select.value) root.dataset.historyStatus = select.value;
        if (!select.dataset.guardBound) {
          const onChange = () => { root.dataset.historyStatus = select.value; };
          select.addEventListener('change', onChange);
          select.dataset.guardBound = 'true';
          cleanupSelect = () => select.removeEventListener('change', onChange);
        }
      }

      const receiptButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.receipt-actions button'));
      const shareButton = receiptButtons.find((button) => {
        const text = button.textContent?.trim().toUpperCase() ?? '';
        return text.startsWith('SHARE') || text.startsWith('OPEN IN CHROME');
      });
      const printButton = receiptButtons.find((button) => button.textContent?.trim().startsWith('PRINT'));

      if (printButton) {
        setDisplayIfChanged(printButton, mobile ? 'none' : '');
        const hidden = mobile ? 'true' : 'false';
        if (printButton.getAttribute('aria-hidden') !== hidden) printButton.setAttribute('aria-hidden', hidden);
      }

      document.querySelectorAll<HTMLElement>('.daily-sheet .print-button').forEach((button) => {
        setDisplayIfChanged(button, mobile ? 'none' : '');
      });

      if (shareButton) {
        if (!window.isSecureContext) {
          if (!shareButton.disabled) shareButton.disabled = true;
          setTextIfChanged(shareButton, 'SHARE (HTTPS)');
          if (shareButton.title !== 'Native sharing becomes available on the HTTPS pilot deployment.') {
            shareButton.title = 'Native sharing becomes available on the HTTPS pilot deployment.';
          }
        } else {
          if (shareButton.disabled) shareButton.disabled = false;
          const desiredText = inAppBrowser && !navigator.share ? 'OPEN IN CHROME TO SHARE' : 'SHARE RECEIPT';
          const desiredTitle = inAppBrowser && !navigator.share
            ? 'Messenger in-app browser blocks the native share sheet. Open the same receipt in Chrome to share it.'
            : 'Share using the phone share sheet.';
          setTextIfChanged(shareButton, desiredText);
          if (shareButton.title !== desiredTitle) shareButton.title = desiredTitle;
        }
      }
    };

    const scheduleSync = () => {
      if (scheduled) return;
      scheduled = true;
      window.requestAnimationFrame(syncUi);
    };

    document.addEventListener('click', onReceiptAction, true);
    syncUi();
    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener('click', onReceiptAction, true);
      observer.disconnect();
      cleanupSelect?.();
      delete root.dataset.historyStatus;
      delete root.dataset.secureContext;
      delete root.dataset.mobileClient;
      delete root.dataset.inAppBrowser;
    };
  }, []);

  return null;
}
