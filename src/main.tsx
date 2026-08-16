import React from 'react';
import ReactDOM from 'react-dom/client';
import { registerSW } from 'virtual:pwa-register';
import { App } from './App';
import { PilotControls } from './PilotControls';
import './styles.css';
import './enhancements.css';
import './audit.css';
import './pilot.css';

registerSW({ immediate: true });

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <App />
    <PilotControls />
  </React.StrictMode>,
);