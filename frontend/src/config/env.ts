export const env = {
  // Relative by default so requests go through the Vite dev/preview proxy to the backend.
  // This works from any host (localhost, LAN IP, another device) without CORS changes.
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL || '/api/v1',
  APP_TITLE: import.meta.env.VITE_APP_TITLE || 'INVTY GHG Portal',
  GOOGLE_CLIENT_ID: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
};
