import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildLocalMessages,
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

test('always includes the current question with empty history', () => {
  assert.deepEqual(
    buildLocalMessages([], { author: 'user', text: 'Pergunta atual' }),
    [{ role: 'user', content: 'Pergunta atual' }]
  );
});

test('keeps a short conversation unchanged before the current question', () => {
  assert.deepEqual(
    buildLocalMessages(
      [
        { author: 'user', text: 'Pergunta anterior' },
        { author: 'sky', text: 'Resposta anterior' },
      ],
      { author: 'user', text: 'Pergunta atual' }
    ),
    [
      { role: 'user', content: 'Pergunta anterior' },
      { role: 'assistant', content: 'Resposta anterior' },
      { role: 'user', content: 'Pergunta atual' },
    ]
  );
});

test('keeps only the four most recent previous messages', () => {
  const previousMessages = Array.from({ length: 6 }, (_, index) => ({
    author: index % 2 === 0 ? 'user' : 'sky',
    text: `mensagem-${index + 1}`,
  }));

  assert.deepEqual(
    buildLocalMessages(previousMessages, { author: 'user', text: 'atual' }),
    [
      { role: 'user', content: 'mensagem-3' },
      { role: 'assistant', content: 'mensagem-4' },
      { role: 'user', content: 'mensagem-5' },
      { role: 'assistant', content: 'mensagem-6' },
      { role: 'user', content: 'atual' },
    ]
  );
});

test('limits previous history to 1200 characters and prioritizes recency', () => {
  const older = 'a'.repeat(800);
  const newer = 'b'.repeat(800);
  const result = buildLocalMessages(
    [
      { author: 'user', text: older },
      { author: 'sky', text: newer },
    ],
    { author: 'user', text: 'atual' }
  );

  assert.equal(result[0].content, older.slice(-400));
  assert.equal(result[1].content, newer);
  assert.equal(result[0].content.length + result[1].content.length, 1200);
  assert.deepEqual(result[2], { role: 'user', content: 'atual' });
});

test('keeps the final 1200 characters when the newest message exceeds the budget', () => {
  const oversizedMessage = `inicio-${'x'.repeat(1300)}-final`;
  const result = buildLocalMessages(
    [{ author: 'sky', text: oversizedMessage }],
    { author: 'user', text: 'atual' }
  );

  assert.equal(result[0].role, 'assistant');
  assert.equal(result[0].content, oversizedMessage.slice(-1200));
  assert.notEqual(result[0].content, '');
  assert.deepEqual(result[1], { role: 'user', content: 'atual' });
});

test('preserves chronological order and roles after limiting history', () => {
  const result = buildLocalMessages(
    [
      { author: 'sky', text: 'resposta antiga' },
      { author: 'user', text: 'pergunta recente' },
      { author: 'sky', text: 'resposta recente' },
    ],
    { author: 'user', text: 'pergunta atual' }
  );

  assert.deepEqual(result, [
    { role: 'assistant', content: 'resposta antiga' },
    { role: 'user', content: 'pergunta recente' },
    { role: 'assistant', content: 'resposta recente' },
    { role: 'user', content: 'pergunta atual' },
  ]);
});

test('does not affect Groq routing', () => {
  assert.equal(resolveChatTransport('groq', false), 'groq');
  assert.equal(resolveChatTransport('groq', true), 'groq');
});

test('prefers filtered content and falls back to raw text', () => {
  assert.equal(extractLocalCompletionText({ content: ' resposta ', text: 'bruta' }), 'resposta');
  assert.equal(extractLocalCompletionText({ content: '', text: ' bruta ' }), 'bruta');
  assert.throws(() => extractLocalCompletionText({ content: '', text: '' }), /local_completion_empty/);
});
