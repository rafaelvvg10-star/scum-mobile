const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

export const API_URL = configuredApiUrl
  ? configuredApiUrl.replace(/\/+$/, '')
  : null;

export const API_CONFIGURATION_ERROR =
  'A URL do cérebro local não foi configurada. Verifique o arquivo .env.';
