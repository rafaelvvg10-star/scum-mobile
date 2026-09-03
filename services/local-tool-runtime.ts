import * as Location from 'expo-location';

import {
  calculateExpression,
  extractUsefulText,
  formatWeather,
  type LocalToolRequest,
  normalizeToolFailure,
  validatePublicHttpUrl,
} from './local-tools';

const REQUEST_TIMEOUT_MS = 10_000;
const MAX_WEB_BYTES = 100_000;

export class LocalToolError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LocalToolError';
  }
}

async function withTimeout<T>(operation: (signal: AbortSignal) => Promise<T>) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  try {
    return await operation(controller.signal);
  } catch (error) {
    if (controller.signal.aborted) throw new LocalToolError('A ferramenta demorou demais para responder.');
    throw error;
  } finally {
    clearTimeout(timeout);
  }
}

async function currentCoordinates() {
  const permission = await Location.requestForegroundPermissionsAsync();
  if (permission.status !== Location.PermissionStatus.GRANTED) {
    throw new LocalToolError('Permissão de localização negada.');
  }
  const servicesEnabled = await Location.hasServicesEnabledAsync();
  if (!servicesEnabled) throw new LocalToolError('Ative a localização do aparelho para continuar.');
  const location = await Location.getCurrentPositionAsync({
    accuracy: Location.Accuracy.Balanced,
  });
  return location.coords;
}

async function readUrl(input: string) {
  const url = validatePublicHttpUrl(input);
  const response = await withTimeout((signal) => fetch(url, {
    headers: { Accept: 'text/html,text/plain;q=0.9' },
    redirect: 'manual',
    signal,
  }));
  if (response.status >= 300 && response.status < 400) {
    throw new LocalToolError('A página tentou redirecionar; abra a URL final diretamente.');
  }
  if (!response.ok) throw new LocalToolError(`A página respondeu com HTTP ${response.status}.`);
  const finalUrl = validatePublicHttpUrl(response.url || url);
  const contentType = response.headers.get('content-type')?.toLowerCase() ?? '';
  if (!contentType.includes('text/html') && !contentType.includes('text/plain')) {
    throw new LocalToolError('A URL não aponta para uma página de texto suportada.');
  }
  const declaredSize = Number(response.headers.get('content-length'));
  if (Number.isFinite(declaredSize) && declaredSize > MAX_WEB_BYTES) {
    throw new LocalToolError('A página é grande demais para leitura segura.');
  }
  const reader = response.body?.getReader();
  if (!reader && !Number.isFinite(declaredSize)) {
    throw new LocalToolError('A página não informou um tamanho seguro para leitura.');
  }
  let raw = '';
  if (reader) {
    const decoder = new TextDecoder();
    let bytes = 0;
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > MAX_WEB_BYTES) {
        await reader.cancel();
        throw new LocalToolError('A página é grande demais para leitura segura.');
      }
      raw += decoder.decode(value, { stream: true });
    }
    raw += decoder.decode();
  } else {
    raw = await response.text();
  }
  const text = extractUsefulText(raw);
  if (!text) throw new LocalToolError('Não foi possível extrair texto útil da página.');
  return `URL consultada: ${finalUrl}\nConteúdo: ${text}`;
}

export async function executeLocalTool(request: LocalToolRequest) {
  try {
    if (request.kind === 'calculator') {
      return `Resultado calculado localmente: ${calculateExpression(request.input)}`;
    }
    if (request.kind === 'date_time') {
      return `Data e hora do aparelho: ${new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'full', timeStyle: 'long',
      }).format(new Date())}`;
    }
    if (request.kind === 'web_search') {
      throw new LocalToolError('Busca web não está configurada: Brave e Tavily exigem uma chave que não pode ser protegida no APK.');
    }
    if (request.kind === 'url') return await readUrl(request.input);

    const coords = await currentCoordinates();
    const coordinates = `Latitude: ${coords.latitude.toFixed(5)}; longitude: ${coords.longitude.toFixed(5)}; precisão aproximada: ${Math.round(coords.accuracy ?? 0)} m`;
    if (request.kind === 'location') return coordinates;

    const query = new URLSearchParams({
      latitude: String(coords.latitude),
      longitude: String(coords.longitude),
      current: 'temperature_2m,apparent_temperature,precipitation,weather_code,wind_speed_10m',
      timezone: 'auto',
    });
    const response = await withTimeout((signal) => fetch(
      `https://api.open-meteo.com/v1/forecast?${query}`,
      { headers: { Accept: 'application/json' }, signal }
    ));
    if (!response.ok) throw new LocalToolError(`O serviço de clima respondeu com HTTP ${response.status}.`);
    return `${coordinates}\nClima atual: ${formatWeather(await response.json())}`;
  } catch (error) {
    if (error instanceof LocalToolError) throw error;
    throw new LocalToolError(normalizeToolFailure(error));
  }
}
