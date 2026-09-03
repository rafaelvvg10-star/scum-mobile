import assert from 'node:assert/strict';
import test from 'node:test';

import {
  MAX_STORED_MESSAGES,
  validateStoredHistory,
} from './local-history-validation.ts';

test('accepts only valid local chat messages', () => {
  assert.deepEqual(validateStoredHistory([
    { id: '1', author: 'user', text: 'oi' },
    { id: '2', author: 'sky', text: 'olá', source: 'local' },
    { id: 3, author: 'user', text: 'inválida' },
    { id: '4', author: 'remote', text: 'inválida' },
  ]), [
    { id: '1', author: 'user', text: 'oi' },
    { id: '2', author: 'sky', text: 'olá', source: 'local' },
  ]);
});

test('limits persisted history to recent messages', () => {
  const messages = Array.from({ length: MAX_STORED_MESSAGES + 5 }, (_, index) => ({
    id: String(index), author: 'user', text: `mensagem ${index}`,
  }));
  const result = validateStoredHistory(messages);
  assert.equal(result.length, MAX_STORED_MESSAGES);
  assert.equal(result[0].id, '5');
});
