import assert from 'node:assert/strict';
import test from 'node:test';

import {
  extractLocalCompletionText,
  resolveChatTransport,
  toLocalMessages,
} from './chat-routing.ts';

test('routes Groq independently of local state', () => {
  assert.equal(resolveChatTransport('groq', false), 'groq');
});

test('routes Local only with a loaded context', () => {
  assert.equal(resolveChatTransport('local', true), 'local');
  assert.throws(() => resolveChatTransport('local', false), /local_model_not_loaded/);
});

test('maps chat history to llama.rn roles', () => {
  assert.deepEqual(
    toLocalMessages([
      { author: 'sky', text: 'Olá' },
      { author: 'user', text: ' Responda offline ' },
    ]),
    [
      { role: 'assistant', content: 'Olá' },
      { role: 'user', content: 'Responda offline' },
    ]
  );
});

test('prefers filtered content and falls back to raw text', () => {
  assert.equal(extractLocalCompletionText({ content: ' resposta ', text: 'bruta' }), 'resposta');
  assert.equal(extractLocalCompletionText({ content: '', text: ' bruta ' }), 'bruta');
  assert.throws(() => extractLocalCompletionText({ content: '', text: '' }), /local_completion_empty/);
});
