export type ApiConfiguration = { baseUrl: string; token: string };

export class ApiConfigurationError extends Error {
  readonly code = 'configuration';
  constructor(message = 'O modo Online não está configurado neste aplicativo.') {
    super(message);
    this.name = 'ApiConfigurationError';
  }
}

export function normalizeApiUrl(value: string | undefined, production: boolean) {
  const candidate = value?.trim().replace(/\/+$/, '');
  if (!candidate) throw new ApiConfigurationError();

  let parsed: URL;
  try {
    parsed = new URL(candidate);
  } catch {
    throw new ApiConfigurationError();
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new ApiConfigurationError();
  }
  if (production && parsed.protocol !== 'https:') {
    throw new ApiConfigurationError('O modo Online exige uma conexão HTTPS válida.');
  }
  return candidate;
}

export function loadApiConfiguration(options?: {
  production?: boolean; url?: string; token?: string;
}): ApiConfiguration {
  const production = options?.production ??
    (typeof __DEV__ === 'boolean' ? !__DEV__ : process.env.NODE_ENV === 'production');
  const baseUrl = normalizeApiUrl(
    options?.url ?? process.env.EXPO_PUBLIC_SCUM_API_URL,
    production
  );
  const token = (options?.token ?? process.env.EXPO_PUBLIC_SCUM_API_TOKEN)?.trim();
  if (!token) throw new ApiConfigurationError();
  return { baseUrl, token };
}

export const API_CONFIGURATION_ERROR =
  'O modo Online não está configurado neste aplicativo.';
