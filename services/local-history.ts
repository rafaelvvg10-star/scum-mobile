import { File, Paths } from 'expo-file-system';

import {
  MAX_STORED_MESSAGES,
  type StoredChatMessage,
  validateStoredHistory,
} from './local-history-validation';

const historyFile = new File(Paths.document, 'chat-history.json');

export async function loadLocalHistory() {
  try {
    if (!historyFile.exists) return [];
    return validateStoredHistory(JSON.parse(await historyFile.text()));
  } catch {
    return [];
  }
}

export function saveLocalHistory(messages: StoredChatMessage[]) {
  historyFile.create({ overwrite: true, intermediates: true });
  historyFile.write(JSON.stringify(messages.slice(-MAX_STORED_MESSAGES)));
}

export function clearLocalHistory() {
  if (historyFile.exists) historyFile.delete();
}
