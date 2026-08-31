import assert from 'node:assert/strict';
import test from 'node:test';

import { loadApiConfiguration, normalizeApiUrl } from '../config/api.ts';
import { createScumApiClient, ScumApiError } from './scum-api.ts';

const configuration = { baseUrl: 'https://scum.example', token: 'token-super-secreto' };
const jsonResponse = (body, status = 200) => new Response(
  body === undefined ? '' : JSON.stringify(body),
  { status, headers: { 'Content-Type': 'application/json' } }
);

test('normalizes URL and validates protocol and production HTTPS', () => {
  assert.equal(normalizeApiUrl(' https://scum.example/// ', true), 'https://scum.example');
  assert.equal(normalizeApiUrl('http://localhost:8000/', false), 'http://localhost:8000');
  assert.throws(() => normalizeApiUrl('ftp://scum.example', false));
  assert.throws(() => normalizeApiUrl('not a URL', false));
  assert.throws(() => normalizeApiUrl('http://scum.example', true));
  assert.throws(() => loadApiConfiguration({ production: true, url: '', token: '' }));
});

test('sends Bearer and Accept without owner_id', async () => {
  let request;
  const client = createScumApiClient({
    configuration,
    fetchFn: async (url, init) => {
      request = { url: String(url), init };
      return jsonResponse({ pergunta: 'oi', resposta: 'olá', desempenho: {} });
    },
  });
  await client.chat('oi');
  const headers = new Headers(request.init.headers);
  assert.equal(headers.get('Authorization'), `Bearer ${configuration.token}`);
  assert.equal(headers.get('Accept'), 'application/json');
  assert.doesNotMatch(request.url, /token-super-secreto|owner_id/);
  assert.equal(request.init.method, 'POST');
});

test('missing token is a safe configuration error', async () => {
  const client = createScumApiClient({
    configuration: undefined,
    fetchFn: async () => { throw new Error('must not fetch'); },
  });
  await assert.rejects(client.chat('oi'), (error) => {
    assert.equal(error.code, 'configuration');
    assert.doesNotMatch(error.message, /token|undefined/i);
    return true;
  });
});

test('timeout aborts the request', async () => {
  let signal;
  const client = createScumApiClient({
    configuration,
    timeoutMs: 5,
    fetchFn: (_url, init) => new Promise((_resolve, reject) => {
      signal = init.signal;
      signal.addEventListener('abort', () => reject(new Error('aborted')));
    }),
  });
  await assert.rejects(client.chat('oi'), (error) => error.code === 'timeout');
  assert.equal(signal.aborted, true);
});

test('differentiates 401, other 4xx and 5xx without exposing token', async () => {
  for (const [status, code] of [[401, 'unauthorized'], [404, 'client'], [503, 'server']]) {
    const client = createScumApiClient({
      configuration,
      fetchFn: async () => jsonResponse({ detail: configuration.token }, status),
    });
    await assert.rejects(client.chat('oi'), (error) => {
      assert.equal(error.code, code);
      assert.doesNotMatch(error.message, new RegExp(configuration.token));
      return true;
    });
  }
});

test('differentiates network, empty response and invalid JSON', async () => {
  const network = createScumApiClient({ configuration, fetchFn: async () => { throw new TypeError('offline'); } });
  await assert.rejects(network.chat('oi'), (error) => error.code === 'network');
  const empty = createScumApiClient({ configuration, fetchFn: async () => new Response('', { status: 200 }) });
  await assert.rejects(empty.chat('oi'), (error) => error.code === 'empty_response');
  const invalid = createScumApiClient({ configuration, fetchFn: async () => new Response('{', { status: 200 }) });
  await assert.rejects(invalid.chat('oi'), (error) => error.code === 'invalid_json');
});

test('POST chat has no automatic retry', async () => {
  let calls = 0;
  const client = createScumApiClient({
    configuration,
    fetchFn: async () => { calls += 1; return jsonResponse({}, 503); },
  });
  await assert.rejects(client.chat('uma vez'), ScumApiError);
  assert.equal(calls, 1);
});

test('memory requests use authentication and encoded paths', async () => {
  const requests = [];
  const client = createScumApiClient({
    configuration,
    fetchFn: async (url, init) => {
      requests.push({ url: String(url), headers: new Headers(init.headers) });
      return jsonResponse(requests.length === 1 ? { total: 0, memorias: [] } : { apagada: true });
    },
  });
  await client.getMemories();
  await client.deleteMemory('nome usuário');
  assert.equal(requests.length, 2);
  assert.ok(requests.every(({ headers }) => headers.get('Authorization') === `Bearer ${configuration.token}`));
  assert.match(requests[1].url, /nome%20usu%C3%A1rio$/);
  assert.ok(requests.every(({ url }) => !url.includes('owner_id')));
});
