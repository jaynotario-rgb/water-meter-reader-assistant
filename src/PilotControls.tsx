import { useState } from 'react';
import { PilotSettings } from './PilotSettings';
import { PILOT_VERSION } from './pilot-data';

export function PilotControls() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button className="pilot-launcher no-print" type="button" onClick={() => setOpen(true)}>
        SETTINGS <span>{PILOT_VERSION}</span>
      </button>
      <PilotSettings open={open} onClose={() => setOpen(false)} />
    </>
  );
}
