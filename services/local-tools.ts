export type LocalToolKind =
  | 'calculator'
  | 'date_time'
  | 'location'
  | 'weather'
  | 'url'
  | 'web_search';

export type LocalToolRequest = {
  kind: LocalToolKind;
  input: string;
};

export function localToolLabel(kind: LocalToolKind) {
  return {
    calculator: 'calculadora',
    date_time: 'data e hora',
    location: 'localização',
    weather: 'clima',
    url: 'leitura web',
    web_search: 'busca web',
  }[kind];
}

export function normalizeToolFailure(error: unknown) {
  if (error instanceof TypeError) {
    return 'Sem conexão com a internet para executar esta ferramenta.';
  }
  if (error instanceof SyntaxError) {
    return 'A ferramenta recebeu uma resposta inválida.';
  }
  return error instanceof Error && error.message.trim()
    ? error.message
    : 'A ferramenta falhou por um motivo desconhecido.';
}

const URL_PATTERN = /https?:\/\/[^\s<>"']+/iu;
const PRIVATE_IPV4 = /^(?:127\.|10\.|0\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/u;
const MAX_EXPRESSION_LENGTH = 200;

export function routeLocalTool(input: string): LocalToolRequest | null {
  const text = input.trim();
  const normalized = text.toLocaleLowerCase('pt-BR');
  const url = text.match(URL_PATTERN)?.[0]?.replace(/[),.!?]+$/u, '');

  if (url) return { kind: 'url', input: url };
  if (/\b(?:clima|tempo|temperatura|previs[aã]o)\b/u.test(normalized)) {
    return { kind: 'weather', input: text };
  }
  if (/\b(?:onde estou|minha localiza[cç][aã]o|coordenadas?)\b/u.test(normalized)) {
    return { kind: 'location', input: text };
  }
  if (/\b(?:que horas|qual(?: é| e)? a hora|data de hoje|que dia é hoje|que dia e hoje)\b/u.test(normalized)) {
    return { kind: 'date_time', input: text };
  }
  if (/\b(?:pesquise|pesquisar|busque na web|buscar na web|procure na internet)\b/u.test(normalized)) {
    return { kind: 'web_search', input: text };
  }

  const requestedCalculation = normalized.match(
    /^(?:calcule|quanto (?:é|e)|resolva)\s+(.+?)[?.!]*$/u
  )?.[1];
  const expression = requestedCalculation ?? text;
  if (/^[\d\s()+\-*/%^.,]+$/u.test(expression) && /\d/u.test(expression)) {
    return { kind: 'calculator', input: expression };
  }

  return null;
}

class MathParser {
  private index = 0;
  private readonly source: string;

  constructor(source: string) {
    this.source = source;
  }

  parse() {
    const value = this.expression();
    this.skipSpaces();
    if (this.index !== this.source.length || !Number.isFinite(value)) {
      throw new Error('Expressão matemática inválida.');
    }
    return value;
  }

  private expression(): number {
    let value = this.term();
    while (true) {
      if (this.take('+')) value += this.term();
      else if (this.take('-')) value -= this.term();
      else return value;
    }
  }

  private term(): number {
    let value = this.power();
    while (true) {
      if (this.take('*')) value *= this.power();
      else if (this.take('/')) {
        const divisor = this.power();
        if (divisor === 0) throw new Error('Não é possível dividir por zero.');
        value /= divisor;
      } else if (this.take('%')) {
        const divisor = this.power();
        if (divisor === 0) throw new Error('Não é possível dividir por zero.');
        value %= divisor;
      } else return value;
    }
  }

  private power(): number {
    const value = this.unary();
    return this.take('^') ? value ** this.power() : value;
  }

  private unary(): number {
    if (this.take('+')) return this.unary();
    if (this.take('-')) return -this.unary();
    return this.primary();
  }

  private primary(): number {
    if (this.take('(')) {
      const value = this.expression();
      if (!this.take(')')) throw new Error('Parênteses incompletos.');
      return value;
    }
    this.skipSpaces();
    const match = this.source.slice(this.index).match(/^\d+(?:\.\d+)?/u);
    if (!match) throw new Error('Expressão matemática inválida.');
    this.index += match[0].length;
    return Number(match[0]);
  }

  private take(character: string) {
    this.skipSpaces();
    if (this.source[this.index] !== character) return false;
    this.index += 1;
    return true;
  }

  private skipSpaces() {
    while (/\s/u.test(this.source[this.index] ?? '')) this.index += 1;
  }
}

export function calculateExpression(input: string) {
  const expression = input.trim().replace(/,/gu, '.');
  if (
    !expression ||
    expression.length > MAX_EXPRESSION_LENGTH ||
    !/^[\d\s()+\-*/%^.]+$/u.test(expression)
  ) {
    throw new Error('Expressão matemática inválida.');
  }
  return new MathParser(expression).parse();
}

export function validatePublicHttpUrl(input: string) {
  let url: URL;
  try {
    url = new URL(input);
  } catch {
    throw new Error('URL inválida.');
  }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('Somente URLs HTTP ou HTTPS públicas são permitidas.');
  }
  const hostname = url.hostname.toLowerCase().replace(/^\[|\]$/gu, '');
  if (
    hostname === 'localhost' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname === '::1' ||
    (hostname.includes(':') && hostname.startsWith('fc')) ||
    (hostname.includes(':') && hostname.startsWith('fd')) ||
    hostname.startsWith('fe80:') ||
    PRIVATE_IPV4.test(hostname)
  ) {
    throw new Error('Endereços locais ou privados não são permitidos.');
  }
  return url.toString();
}

export function extractUsefulText(html: string, limit = 6_000) {
  return html
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/giu, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/giu, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/giu, ' ')
    .replace(/<[^>]+>/gu, ' ')
    .replace(/&nbsp;/giu, ' ')
    .replace(/&amp;/giu, '&')
    .replace(/&lt;/giu, '<')
    .replace(/&gt;/giu, '>')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&quot;/giu, '"')
    .replace(/\s+/gu, ' ')
    .trim()
    .slice(0, limit)
    .trimEnd();
}

export type WeatherPayload = {
  current?: {
    temperature_2m?: unknown;
    apparent_temperature?: unknown;
    precipitation?: unknown;
    weather_code?: unknown;
    wind_speed_10m?: unknown;
  };
  current_units?: Record<string, unknown>;
};

export function formatWeather(payload: WeatherPayload) {
  const current = payload.current;
  if (!current || typeof current.temperature_2m !== 'number') {
    throw new Error('O serviço de clima retornou dados inválidos.');
  }
  const optional = (label: string, value: unknown, unit: unknown) =>
    typeof value === 'number' ? `${label}: ${value}${typeof unit === 'string' ? unit : ''}` : null;
  return [
    `Temperatura: ${current.temperature_2m}${typeof payload.current_units?.temperature_2m === 'string' ? payload.current_units.temperature_2m : '°C'}`,
    optional('Sensação', current.apparent_temperature, payload.current_units?.apparent_temperature),
    optional('Precipitação', current.precipitation, payload.current_units?.precipitation),
    optional('Vento', current.wind_speed_10m, payload.current_units?.wind_speed_10m),
    typeof current.weather_code === 'number' ? `Código meteorológico WMO: ${current.weather_code}` : null,
  ].filter(Boolean).join('; ');
}
