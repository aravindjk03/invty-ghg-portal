import React from 'react';
import ReactDOM from 'react-dom/client';
import App from './App';
import './index.css';
import { takeKeyFromLink } from './services/browserAi';
import { startEngine } from './engine/engineCache';

takeKeyFromLink();
// Begin downloading and starting the calculation engine now, while the page
// and the sign-in form load, instead of after sign-in.
void startEngine();

ReactDOM.createRoot(document.getElementById('root') as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
