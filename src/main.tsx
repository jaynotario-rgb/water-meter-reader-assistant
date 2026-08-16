import './compat';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { AppDialogHost } from './AppDialog';
import { FieldIdentity } from './FieldIdentity';
import { PilotControls } from './PilotControls';
import { PilotUxGuards } from './PilotUxGuards';
import './styles.css';
import './enhancements.css';
import './audit.css';
import './pilot.css';
import './app-dialog.css';

registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <AppDialogHost />
    <FieldIdentity />
    <PilotControls />
    <PilotUxGuards />
  </React.StrictMode>,
);
