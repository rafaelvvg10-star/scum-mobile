export type StoredChatMessage = {
  id: string;
  author: 'sky' | 'user';
  text: string;
  source?: 'local';
};

export const MAX_STORED_MESSAGES = 40;

export function validateStoredHistory(value: unknown): StoredChatMessage[] {
  if (!Array.isArray(value)) return [];
  return value
    .filter((message): message is StoredChatMessage => {
      if (!message || typeof message !== 'object') return false;
      const candidate = message as Record<string, unknown>;
      return (
        typeof candidate.id === 'string' &&
        (candidate.author === 'sky' || candidate.author === 'user') &&
        typeof candidate.text === 'string' &&
        candidate.text.trim().length > 0 &&
        (candidate.source === undefined || candidate.source === 'local')
      );
    })
    .slice(-MAX_STORED_MESSAGES);
}
