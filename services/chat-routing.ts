import type { RNLlamaOAICompatibleMessage } from 'llama.rn';

export type ChatMode = 'groq' | 'local';

export type RoutableChatMessage = {
  author: 'sky' | 'user';
  text: string;
};

export function resolveChatTransport(mode: ChatMode, isLocalModelLoaded: boolean) {
  if (mode === 'local' && !isLocalModelLoaded) {
    throw new Error('local_model_not_loaded');
  }

  return mode;
}

export function toLocalMessages(
  messages: RoutableChatMessage[]
): RNLlamaOAICompatibleMessage[] {
  return messages
    .filter((message) => message.text.trim())
    .map((message) => ({
      role: message.author === 'user' ? 'user' : 'assistant',
      content: message.text.trim(),
    }));
}

export function extractLocalCompletionText(result: {
  content?: unknown;
  text?: unknown;
}) {
  const content = typeof result.content === 'string' ? result.content.trim() : '';
  const text = typeof result.text === 'string' ? result.text.trim() : '';
  const response = content || text;

  if (!response) {
    throw new Error('local_completion_empty');
  }

  return response;
}
