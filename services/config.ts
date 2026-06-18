export const BACKEND_URL = 'https://cryptoedgeai-1.onrender.com';

export const BACKEND_WS_URL = BACKEND_URL
  .replace('https://', 'wss://')
  .replace('http://', 'ws://');