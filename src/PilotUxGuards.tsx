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

          // Some Messenger/in-app browsers ignore the download attribute.
          // Open the generated PNG as a visible fallback so the user can
          // long-press/download it instead of receiving no feedback.
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

      if (label.startsWith('SHARE')) {
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

            // Some Android/WebView combinations support the native share sheet
            // but not file attachments. Still open the system share targets.
            await navigator.share({ title: shareTitle, text: shareText, url: window.location.href });
            return;
          }

          // Messenger's embedded browser may expose no Web Share API at all.
          // Do not silently copy: send the user to full Chrome where the native
          // Android share sheet (Messenger, Messages, Gmail, etc.) is available.
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

      const receiptButtons = Array.from(document.querySelectorAll<HTMLButtonElement>('.receipt-actions button'));
      const shareButton = receiptButtons.find((button) => button.textContent?.trim().startsWith('SHARE'));
      const printButton = receiptButtons.find((button) => button.textContent?.trim().startsWith('PRINT'));

      if (printButton) {
        printButton.style.display = mobile ? 'none' : '';
        printButton.setAttribute('aria-hidden', mobile ? 'true' : 'false');
      }

      // Daily Log print is useful on desktop but confusing/unreliable in phone webviews.
      document.querySelectorAll<HTMLElement>('.daily-sheet .print-button').forEach((button) => {
        button.style.display = mobile ? 'none' : '';
      });

      if (shareButton) {
        if (!window.isSecureContext) {
          shareButton.disabled = true;
          shareButton.textContent = 'SHARE (HTTPS)';
          shareButton.title = 'Native sharing becomes available on the HTTPS pilot deployment.';
        } else {
          shareButton.disabled = false;
          shareButton.textContent = inAppBrowser && !navigator.share ? 'OPEN IN CHROME TO SHARE' : 'SHARE RECEIPT';
          shareButton.title = inAppBrowser && !navigator.share
            ? 'Messenger in-app browser blocks the native share sheet. Open the same receipt in Chrome to share it.'
            : 'Share using the phone share sheet.';
        }
      }
    };

    document.addEventListener('click', onReceiptAction, true);
    syncUi();
    const observer = new MutationObserver(syncUi);
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
