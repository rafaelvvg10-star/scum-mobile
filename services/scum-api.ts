import { loadApiConfiguration, type ApiConfiguration } from '../config/api.ts';

export type ScumApiErrorCode =
  | 'configuration' | 'network' | 'timeout' | 'unauthorized'
  | 'client' | 'server' | 'invalid_json' | 'empty_response';

export class ScumApiError extends Error {
  readonly code: ScumApiErrorCode;

  constructor(code: ScumApiErrorCode, message: string) {
    super(message);
    this.name = 'ScumApiError';
    this.code = code;
  }
}

export type ChatResponse = { pergunta: string; resposta: string; [key: string]: unknown };
export type Memory = { categoria: string; chave: string; valor: string };
export type MemoriesResponse = { total: number; memorias: Memory[] };
type ClientOptions = { configuration?: ApiConfiguration; fetchFn?: typeof fetch; timeoutMs?: number };

function messageFor(code: ScumApiErrorCode) {
  if (code === 'unauthorized') return 'A autenticação do modo Online falhou.';
  if (code === 'timeout') return 'O modo Online demorou demais. Tente novamente.';
  if (code === 'network') return 'Sem conexão com o Scum. Verifique a rede e tente novamente.';
  if (code === 'configuration') return 'O modo Online não está configurado neste aplicativo.';
  return 'O Scum Online não conseguiu responder. Tente novamente.';
}

export function toSafeApiMessage(error: unknown) {
  return error instanceof ScumApiError
    ? error.message
    : 'O Scum Online não conseguiu responder. Tente novamente.';
}

export function createScumApiClient(options: ClientOptions = {}) {
  const fetchFn = options.fetchFn ?? fetch;
  const timeoutMs = options.timeoutMs ?? 15_000;

  async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
    let configuration: ApiConfiguration;
    try {
      configuration = options.configuration ?? loadApiConfiguration();
    } catch {
      throw new ScumApiError('configuration', messageFor('configuration'));
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    let response: Response;
    try {
      response = await fetchFn(`${configuration.baseUrl}${path}`, {
        ...init,
        headers: {
          Accept: 'application/json',
          Authorization: `Bearer ${configuration.token}`,
          ...init.headers,
        },
        signal: controller.signal,
      });
    } catch {
      if (controller.signal.aborted) {
        throw new ScumApiError('timeout', messageFor('timeout'));
      }
      throw new ScumApiError('network', messageFor('network'));
    } finally {
      clearTimeout(timeout);
    }

    if (!response.ok) {
      const code: ScumApiErrorCode = response.status === 401
        ? 'unauthorized' : response.status >= 500 ? 'server' : 'client';
      throw new ScumApiError(code, messageFor(code));
    }

    const text = await response.text();
    if (!text.trim()) throw new ScumApiError('empty_response', messageFor('empty_response'));
    try {
      return JSON.parse(text) as T;
    } catch {
      throw new ScumApiError('invalid_json', messageFor('invalid_json'));
    }
  }

  return {
    async chat(question: string) {
      const data = await request<ChatResponse>(
        `/chat?pergunta=${encodeURIComponent(question)}`,
        { method: 'POST' }
      );
      if (typeof data.resposta !== 'string' || !data.resposta.trim()) {
        throw new ScumApiError('empty_response', messageFor('empty_response'));
      }
      return { ...data, resposta: data.resposta.trim() };
    },
    getMemories: () => request<MemoriesResponse>('/memorias'),
    deleteMemory: (key: string) => request<unknown>(
      `/memorias/${encodeURIComponent(key)}`, { method: 'DELETE' }
    ),
    getEpisodes: () => request<unknown>('/episodios'),
    deleteEpisode: (id: number) => request<unknown>(
      `/episodios/${id}`, { method: 'DELETE' }
    ),
  };
}

export const scumApi = createScumApiClient();
