export const env = {
  // Relative by default so requests go through the Vite dev/preview proxy to the backend.
  // This works from any host (localhost, LAN IP, another device) without CORS changes.
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  // Empty in a published build that was given no service address. It used to
  // fall back to http://localhost:8000 everywhere, so the live site probed
  // each visitor's own machine — and would have trusted whatever happened to
  // be listening on that port as the calculation engine.
  PCF_API_BASE_URL: import.meta.env.VITE_PCF_API_BASE_URL
    || (import.meta.env.DEV ? 'http://localhost:8000' : ''),
  ASSISTANT_NAME: import.meta.env.VITE_ASSISTANT_NAME || 'INSITY EDGE AI',
  APP_TITLE: import.meta.env.VITE_APP_TITLE || 'IINVTY GHG Portal',
  GOOGLE_CLIENT_ID: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
  // There is deliberately no AI key here. Anything in this file is inlined
  // into the published JavaScript, so a key would be public. The operator's
  // key belongs to the estimate service; see services/browserAi.ts.
};
