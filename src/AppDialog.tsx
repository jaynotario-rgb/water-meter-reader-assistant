import { useEffect, useRef, useState } from 'react';

type DialogRequest = {
  title?: string;
  message: string;
  kind: 'confirm' | 'prompt';
  defaultValue?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  resolve: (value: boolean | string | null) => void;
};

let openDialog: ((request: DialogRequest) => void) | undefined;

export function appConfirm(message: string, options?: { title?: string; confirmLabel?: string; cancelLabel?: string }) {
  return new Promise<boolean>((resolve) => {
    if (!openDialog) { resolve(window.confirm(message)); return; }
    openDialog({
      kind: 'confirm',
      message,
      title: options?.title,
      confirmLabel: options?.confirmLabel,
      cancelLabel: options?.cancelLabel,
      resolve: (value) => resolve(Boolean(value)),
    });
  });
}

export function appPrompt(
  message: string,
  defaultValue = '',
  options?: { title?: string; confirmLabel?: string; cancelLabel?: string },
) {
  return new Promise<string | null>((resolve) => {
    if (!openDialog) { resolve(window.prompt(message, defaultValue)); return; }
    openDialog({
      kind: 'prompt',
      message,
      defaultValue,
      title: options?.title,
      confirmLabel: options?.confirmLabel,
      cancelLabel: options?.cancelLabel,
      resolve: (value) => resolve(typeof value === 'string' ? value : null),
    });
  });
}

export function AppDialogHost() {
  const [request, setRequest] = useState<DialogRequest>();
  const [value, setValue] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    openDialog = (next) => {
      setValue(next.defaultValue ?? '');
      setRequest(next);
    };
    return () => { openDialog = undefined; };
  }, []);

  useEffect(() => {
    if (request?.kind === 'prompt') window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [request]);

  if (!request) return null;

  const close = (result: boolean | string | null) => {
    const resolve = request.resolve;
    setRequest(undefined);
    resolve(result);
  };

  return (
    <div className="app-dialog-backdrop" role="presentation" onMouseDown={(event) => {
      if (event.target === event.currentTarget) close(request.kind === 'confirm' ? false : null);
    }}>
      <section className="app-dialog" role="dialog" aria-modal="true" aria-labelledby="app-dialog-title">
        <p className="eyebrow">FIELD ACTION</p>
        <h2 id="app-dialog-title">{request.title ?? 'Water Meter Reader'}</h2>
        <p className="app-dialog-message">{request.message}</p>
        {request.kind === 'prompt' && (
          <input
            ref={inputRef}
            value={value}
            onChange={(event) => setValue(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') close(value);
              if (event.key === 'Escape') close(null);
            }}
          />
        )}
        <div className="app-dialog-actions">
          <button type="button" className="secondary-button" onClick={() => close(request.kind === 'confirm' ? false : null)}>
            {request.cancelLabel ?? 'CANCEL'}
          </button>
          <button type="button" className="save-button" onClick={() => close(request.kind === 'confirm' ? true : value)}>
            {request.confirmLabel ?? (request.kind === 'confirm' ? 'CONTINUE' : 'OK')}
          </button>
        </div>
      </section>
    </div>
  );
}
