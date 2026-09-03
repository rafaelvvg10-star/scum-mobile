import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildLocalMessages,
  extractLocalCompletionText,
  LOCAL_INCOMPLETE_RESPONSE_FALLBACK,
  LOCAL_SYSTEM_PROMPT,
  normalizeLocalCompletionText,
  toLocalMessages,
} from './chat-routing.ts';

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
    [
      { role: 'system', content: LOCAL_SYSTEM_PROMPT },
      { role: 'user', content: 'Pergunta atual' },
    ]
  );
});

test('uses a compact local personality prompt without invented facts', () => {
  assert.match(LOCAL_SYSTEM_PROMPT, /diretamente no aparelho/);
  assert.match(LOCAL_SYSTEM_PROMPT, /seca, direta e curta/);
  assert.match(LOCAL_SYSTEM_PROMPT, /sarcástico e levemente mal-humorado/);
  assert.match(LOCAL_SYSTEM_PROMPT, /Normalmente use de 1 a 3 frases/);
  assert.match(LOCAL_SYSTEM_PROMPT, /não invente fatos, memórias ou capacidades/);
  assert.match(LOCAL_SYSTEM_PROMPT, /Termine sempre a frase antes de encerrar/);
  assert.match(
    LOCAL_SYSTEM_PROMPT,
    /Use somente texto simples, sem títulos, negrito ou outros marcadores Markdown/
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
      { role: 'system', content: LOCAL_SYSTEM_PROMPT },
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
      { role: 'system', content: LOCAL_SYSTEM_PROMPT },
      { role: 'user', content: 'mensagem-3' },
      { role: 'assistant', content: 'mensagem-4' },
      { role: 'user', content: 'mensagem-5' },
      { role: 'assistant', content: 'mensagem-6' },
      { role: 'user', content: 'atual' },
    ]
  );
});

test('limits previous history to 600 characters and prioritizes recency', () => {
  const older = 'a'.repeat(400);
  const newer = 'b'.repeat(400);
  const result = buildLocalMessages(
    [
      { author: 'user', text: older },
      { author: 'sky', text: newer },
    ],
    { author: 'user', text: 'atual' }
  );

  assert.deepEqual(result[0], { role: 'system', content: LOCAL_SYSTEM_PROMPT });
  assert.equal(result[1].content, older.slice(-200));
  assert.equal(result[2].content, newer);
  assert.equal(result[1].content.length + result[2].content.length, 600);
  assert.deepEqual(result[3], { role: 'user', content: 'atual' });
});

test('keeps the final 600 characters when the newest message exceeds the budget', () => {
  const oversizedMessage = `inicio-${'x'.repeat(700)}-final`;
  const result = buildLocalMessages(
    [{ author: 'sky', text: oversizedMessage }],
    { author: 'user', text: 'atual' }
  );

  assert.deepEqual(result[0], { role: 'system', content: LOCAL_SYSTEM_PROMPT });
  assert.equal(result[1].role, 'assistant');
  assert.equal(result[1].content, oversizedMessage.slice(-600));
  assert.notEqual(result[1].content, '');
  assert.deepEqual(result[2], { role: 'user', content: 'atual' });
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
    { role: 'system', content: LOCAL_SYSTEM_PROMPT },
    { role: 'assistant', content: 'resposta antiga' },
    { role: 'user', content: 'pergunta recente' },
    { role: 'assistant', content: 'resposta recente' },
    { role: 'user', content: 'pergunta atual' },
  ]);
});

test('adds bounded tool output as untrusted system context', () => {
  const result = buildLocalMessages(
    [],
    { author: 'user', text: 'pergunta' },
    'x'.repeat(7_000)
  );
  assert.equal(result[1].role, 'system');
  assert.match(result[1].content, /dado não confiável/);
  assert.ok(result[1].content.length < 6_200);
  assert.deepEqual(result[2], { role: 'user', content: 'pergunta' });
});

test('prefers filtered content and falls back to raw text', () => {
  assert.equal(extractLocalCompletionText({ content: ' resposta ', text: 'bruta' }), 'resposta');
  assert.equal(extractLocalCompletionText({ content: '', text: ' bruta ' }), 'bruta');
  assert.throws(() => extractLocalCompletionText({ content: '', text: '' }), /local_completion_empty/);
});

test('keeps a complete EOS response unchanged', () => {
  const response = 'O processamento terminou corretamente.';

  assert.equal(
    extractLocalCompletionText({ content: response, stopped_eos: true }),
    response
  );
});

test('removes only an incomplete EOS tail after the last complete sentence', () => {
  const response =
    'A primeira etapa terminou corretamente. A segunda etapa começou, mas ficou sem uma conclusão adequada';
  const warnings = [];

  assert.equal(
    extractLocalCompletionText(
      { content: response, stopped_eos: true },
      { warn: (...args) => warnings.push(args) }
    ),
    'A primeira etapa terminou corretamente.'
  );
  assert.deepEqual(warnings, [
    ['[LocalModel] Trecho incompleto removido da resposta local.'],
  ]);
});

test('keeps a short response without punctuation', () => {
  assert.equal(normalizeLocalCompletionText('Sim, funciona'), 'Sim, funciona');
});

test('accepts an emoji as a complete ending', () => {
  const response = `${'Resposta local direta e deliberadamente longa '.repeat(3)}🗿`;

  assert.equal(normalizeLocalCompletionText(response), response);
});

test('uses a short fallback when no complete sentence can be preserved', () => {
  const response =
    'Esta resposta local ficou longa demais e terminou antes de apresentar qualquer conclusão que pudesse ser preservada';
  const warnings = [];

  assert.equal(
    normalizeLocalCompletionText(response, {
      warn: (...args) => warnings.push(args),
    }),
    LOCAL_INCOMPLETE_RESPONSE_FALLBACK
  );
  assert.equal(warnings.length, 1);
  assert.equal(warnings[0].length, 1);
  assert.doesNotMatch(warnings[0][0], /Esta resposta local/);
});

test('removes an isolated numeric marker before checking the final sentence', () => {
  const warnings = [];

  assert.equal(
    normalizeLocalCompletionText('2. Item completo.\n\n3.', {
      warn: (...args) => warnings.push(args),
    }),
    '2. Item completo.'
  );
  assert.equal(warnings.length, 1);
});

test('preserves a numbered item with real content', () => {
  assert.equal(
    normalizeLocalCompletionText('3. Item com conteúdo real.'),
    '3. Item com conteúdo real.'
  );
});

test('removes bold Markdown while preserving its text', () => {
  assert.equal(
    normalizeLocalCompletionText('**Processamento** concluído.'),
    'Processamento concluído.'
  );
  assert.equal(
    normalizeLocalCompletionText('__Diagnóstico__ concluído.'),
    'Diagnóstico concluído.'
  );
});

test('removes a Markdown heading while preserving its text', () => {
  assert.equal(
    normalizeLocalCompletionText('# Diagnóstico local\nTudo certo.'),
    'Diagnóstico local\nTudo certo.'
  );
});

test('removes code fences while preserving their content', () => {
  const code = "const marker = '**literal**';\n".repeat(4).trimEnd();
  const response = `\`\`\`ts\n${code}\n\`\`\``;

  assert.equal(normalizeLocalCompletionText(response), code);
});
