import { useEffect } from 'react';
import { toBlob } from 'html-to-image';
import { appConfirm, appPrompt } from './AppDialog';

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
    let replayingRecordAction = false;

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

    function replayRecordAction(button: HTMLButtonElement, confirms: boolean[], prompts: string[]) {
      const nativeConfirm = window.confirm;
      const nativePrompt = window.prompt;
      let confirmIndex = 0;
      let promptIndex = 0;

      replayingRecordAction = true;
      window.confirm = () => confirms[confirmIndex++] ?? false;
      window.prompt = () => prompts[promptIndex++] ?? null;
      try {
        button.click();
      } finally {
        window.confirm = nativeConfirm;
        window.prompt = nativePrompt;
        replayingRecordAction = false;
      }
    }

    async function handleRecordAction(event: Event, button: HTMLButtonElement, label: string) {
      if (replayingRecordAction) return false;
      if (!button.closest('.record-actions')) return false;

      if (label === 'EDIT') {
        event.preventDefault();
        event.stopImmediatePropagation();
        const proceed = await appConfirm(
          'You are about to edit a saved field record. The original values will remain in the audit history.',
          { title: 'Water Meter Reader', confirmLabel: 'EDIT RECORD' },
        );
        if (!proceed) return true;

        const reason = (await appPrompt('Reason for editing this record (required)', '', {
          title: 'Water Meter Reader', confirmLabel: 'NEXT',
        }))?.trim();
        if (!reason) return true;

        const card = button.closest<HTMLElement>('.record-row');
        const readings = card?.querySelectorAll('dd');
        const previousDefault = readings?.[0]?.textContent?.trim() ?? '';
        const currentDefault = readings?.[1]?.textContent?.trim() ?? '';
        const previous = await appPrompt('Previous Reading', previousDefault, {
          title: 'Water Meter Reader', confirmLabel: 'NEXT',
        });
        if (previous === null) return true;
        const current = await appPrompt('Current Reading', currentDefault, {
          title: 'Water Meter Reader', confirmLabel: 'REVIEW',
        });
        if (current === null) return true;

        const finalConfirm = await appConfirm(
          `Confirm this edit?\n\nPrevious: ${previousDefault} → ${previous}\nCurrent: ${currentDefault} → ${current}\n\nThe record will be marked EDITED.`,
          { title: 'Water Meter Reader', confirmLabel: 'SAVE EDIT' },
        );
        if (!finalConfirm) return true;

        replayRecordAction(button, [true, true], [reason, previous, current]);
        return true;
      }

      if (label === 'VOID RECORD') {
        event.preventDefault();
        event.stopImmediatePropagation();
        const proceed = await appConfirm(
          'Void this saved record? It will be excluded from active totals but preserved as audit evidence.',
          { title: 'Water Meter Reader', confirmLabel: 'CONTINUE' },
        );
        if (!proceed) return true;
        const reason = (await appPrompt('Reason for voiding this record (required)', '', {
          title: 'Water Meter Reader', confirmLabel: 'NEXT',
        }))?.trim();
        if (!reason) return true;
        const finalConfirm = await appConfirm(
          'Final confirmation: mark this record VOID? This does not permanently delete the record.',
          { title: 'Water Meter Reader', confirmLabel: 'MARK VOID' },
        );
        if (!finalConfirm) return true;
        replayRecordAction(button, [true, true], [reason]);
        return true;
      }

      if (label === 'MARK PENDING') {
        event.preventDefault();
        event.stopImmediatePropagation();
        const proceed = await appConfirm(
          'Mark this record PENDING again? The meter reading itself will not be changed.',
          { title: 'Water Meter Reader', confirmLabel: 'MARK PENDING' },
        );
        if (proceed) replayRecordAction(button, [true], []);
        return true;
      }

      if (label === 'MARK PAID') {
        event.preventDefault();
        event.stopImmediatePropagation();
        const method = await appPrompt('Payment method (optional: Cash, GCash, etc.)', '', {
          title: 'Water Meter Reader', confirmLabel: 'NEXT',
        });
        if (method === null) return true;
        const reference = await appPrompt('Payment reference / OR number (optional)', '', {
          title: 'Water Meter Reader', confirmLabel: 'NEXT',
        });
        if (reference === null) return true;
        const remarks = await appPrompt('Remarks (optional)', '', {
          title: 'Water Meter Reader', confirmLabel: 'MARK PAID',
        });
        if (remarks === null) return true;
        replayRecordAction(button, [], [method, reference, remarks]);
        return true;
      }

      return false;
    }

    const onAction = async (event: Event) => {
      const target = event.target as HTMLElement | null;
      const anyButton = target?.closest<HTMLButtonElement>('button');
      if (!anyButton) return;
      const label = anyButton.textContent?.trim().toUpperCase() ?? '';

      if (await handleRecordAction(event, anyButton, label)) return;

      const button = anyButton.closest('.receipt-actions') ? anyButton : null;
      if (!button) return;

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
          const shareText = 'Water Meter Reader receipt';

          if (navigator.share) {
            if (!navigator.canShare || navigator.canShare({ files: [file] })) {
              await navigator.share({ title: shareTitle, text: shareText, files: [file] });
              return;
            }
            await navigator.share({ title: shareTitle, text: shareText });
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

    document.addEventListener('click', onAction, true);
    syncUi();
    const observer = new MutationObserver(scheduleSync);
    observer.observe(document.body, { childList: true, subtree: true });

    return () => {
      document.removeEventListener('click', onAction, true);
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
