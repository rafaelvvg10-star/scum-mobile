import type { RNLlamaOAICompatibleMessage } from 'llama.rn';

export type ChatMode = 'groq' | 'local';

export type RoutableChatMessage = {
  author: 'sky' | 'user';
  text: string;
};

type LocalTextMessage = {
  role: 'user' | 'assistant';
  content: string;
};

const LOCAL_HISTORY_MESSAGE_LIMIT = 4;
const LOCAL_HISTORY_CHARACTER_BUDGET = 1200;

export function resolveChatTransport(mode: ChatMode, isLocalModelLoaded: boolean) {
  if (mode === 'local' && !isLocalModelLoaded) {
    throw new Error('local_model_not_loaded');
  }

  return mode;
}

export function toLocalMessages(
  messages: RoutableChatMessage[]
): LocalTextMessage[] {
  return messages
    .filter((message) => message.text.trim())
    .map((message) => ({
      role: message.author === 'user' ? 'user' : 'assistant',
      content: message.text.trim(),
    }));
}

export function buildLocalMessages(
  previousMessages: RoutableChatMessage[],
  currentQuestion: RoutableChatMessage
): RNLlamaOAICompatibleMessage[] {
  const recentMessages = toLocalMessages(
    previousMessages.slice(-LOCAL_HISTORY_MESSAGE_LIMIT)
  );
  const selectedHistory: LocalTextMessage[] = [];
  let remainingCharacters = LOCAL_HISTORY_CHARACTER_BUDGET;

  for (let index = recentMessages.length - 1; index >= 0; index -= 1) {
    const message = recentMessages[index];

    if (message.content.length <= remainingCharacters) {
      selectedHistory.push(message);
      remainingCharacters -= message.content.length;
      continue;
    }

    if (remainingCharacters > 0) {
      selectedHistory.push({
        ...message,
        content: message.content.slice(-remainingCharacters),
      });
    }

    break;
  }

  const [question] = toLocalMessages([currentQuestion]);

  return [
    ...selectedHistory.reverse(),
    ...(question ? [question] : []),
  ];
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
