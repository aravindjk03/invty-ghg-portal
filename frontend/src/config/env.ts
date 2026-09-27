export const env = {
  API_BASE_URL: import.meta.env.VITE_API_BASE_URL || 'http://localhost:5000/api/v1',
  PCF_API_BASE_URL: import.meta.env.VITE_PCF_API_BASE_URL || 'http://localhost:8000',
  ASSISTANT_NAME: import.meta.env.VITE_ASSISTANT_NAME || 'INSITY EDGE AI',
  APP_TITLE: import.meta.env.VITE_APP_TITLE || 'IINVTY GHG Portal',
  GOOGLE_CLIENT_ID: import.meta.env.VITE_GOOGLE_CLIENT_ID || '',
};
