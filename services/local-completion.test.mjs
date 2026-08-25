import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildLocalCompletionParams,
  LOCAL_STOP_WORDS,
  logLocalCompletionDiagnostic,
  runLocalGeneration,
} from './local-completion.ts';

const expectedStopWords = [
  '</s>',
  '<|end|>',
  '<|eot_id|>',
  '<|end_of_text|>',
  '<|im_end|>',
  '<|EOT|>',
  '<|END_OF_TURN_TOKEN|>',
  '<|end_of_turn|>',
  '<|endoftext|>',
];

function createLogger() {
  const info = [];
  const warnings = [];

  return {
    info,
    warnings,
    logger: {
      info: (...args) => info.push(args),
      warn: (...args) => warnings.push(args),
    },
  };
}

test('configures the local token limit, temperature and stop words', () => {
  const messages = [{ role: 'user', content: 'Pergunta' }];
  const params = buildLocalCompletionParams(messages);

  assert.equal(params.n_predict, 220);
  assert.equal(params.temperature, 0.3);
  assert.deepEqual(params.stop, expectedStopWords);
  assert.deepEqual(LOCAL_STOP_WORDS, expectedStopWords);
  assert.strictEqual(params.messages, messages);
});

test('diagnoses a token limit and does not start an automatic continuation', async () => {
  const calls = [];
  const result = {
    content: 'Resposta parcial',
    text: 'Resposta parcial',
    stopped_eos: false,
    stopped_limit: 1,
    stopped_word: '',
    stopping_word: '',
    tokens_predicted: 220,
    truncated: false,
    context_full: false,
    interrupted: false,
  };
  const { info, logger, warnings } = createLogger();
  const localContext = {
    completion: async (params) => {
      calls.push(params);
      return result;
    },
  };

  const returned = await runLocalGeneration(
    localContext,
    [{ role: 'user', content: 'Pergunta' }],
    logger
  );

  assert.strictEqual(returned, result);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].n_predict, 220);
  assert.equal(calls[0].temperature, 0.3);
  assert.deepEqual(calls[0].stop, expectedStopWords);
  assert.equal(info.length, 0);
  assert.equal(warnings.length, 1);
  assert.deepEqual(warnings[0][1], {
    reason: 'token_limit',
    stopped_eos: false,
    stopped_limit: 1,
    stopped_word: '',
    stopping_word: '',
    tokens_predicted: 220,
    truncated: false,
    context_full: false,
    interrupted: false,
  });
});

test('records a normal EOS completion without warning or retry', async () => {
  let completionCalls = 0;
  const result = {
    content: 'Resposta completa.',
    text: 'Resposta completa.',
    stopped_eos: true,
    stopped_limit: 0,
    stopped_word: '',
    stopping_word: '',
    tokens_predicted: 18,
    truncated: false,
    context_full: false,
    interrupted: false,
  };
  const { info, logger, warnings } = createLogger();

  const returned = await runLocalGeneration(
    {
      completion: async () => {
        completionCalls += 1;
        return result;
      },
    },
    [{ role: 'user', content: 'Pergunta' }],
    logger
  );

  assert.strictEqual(returned, result);
  assert.equal(completionCalls, 1);
  assert.equal(warnings.length, 0);
  assert.equal(info.length, 1);
  assert.equal(info[0][1].reason, 'eos');
});

test('keeps truncated and context-full indicators in warning diagnostics', () => {
  const baseResult = {
    stopped_eos: false,
    stopped_limit: 0,
    stopped_word: '',
    stopping_word: '',
    tokens_predicted: 12,
    truncated: false,
    context_full: false,
    interrupted: false,
  };
  const cases = [
    { field: 'truncated', reason: 'truncated_context' },
    { field: 'context_full', reason: 'context_full' },
  ];

  for (const testCase of cases) {
    const { logger, warnings } = createLogger();
    const result = { ...baseResult, [testCase.field]: true };
    const diagnostic = logLocalCompletionDiagnostic(result, logger);

    assert.equal(diagnostic[testCase.field], true);
    assert.equal(diagnostic.reason, testCase.reason);
    assert.equal(warnings.length, 1);
  }
});
