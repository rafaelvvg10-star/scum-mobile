import assert from 'node:assert/strict';
import test from 'node:test';

import {
  calculateExpression,
  extractUsefulText,
  formatWeather,
  normalizeToolFailure,
  routeLocalTool,
  validatePublicHttpUrl,
} from './local-tools.ts';

test('routes supported tools deterministically', () => {
  assert.equal(routeLocalTool('2 + 3 * 4')?.kind, 'calculator');
  assert.equal(routeLocalTool('Que horas são?')?.kind, 'date_time');
  assert.equal(routeLocalTool('Onde estou?')?.kind, 'location');
  assert.equal(routeLocalTool('Qual é o clima agora?')?.kind, 'weather');
  assert.equal(routeLocalTool('Leia https://example.com/a')?.kind, 'url');
  assert.equal(routeLocalTool('Pesquise isso na internet')?.kind, 'web_search');
  assert.equal(routeLocalTool('Explique recursão'), null);
});

test('calculator respects precedence and rejects unsafe input', () => {
  assert.equal(calculateExpression('2 + 3 * (4 - 1)'), 11);
  assert.equal(calculateExpression('2^3^2'), 512);
  assert.throws(() => calculateExpression('1 / 0'), /dividir por zero/);
  assert.throws(() => calculateExpression('globalThis.alert(1)'), /inválida/);
});

test('URL validation blocks dangerous and private destinations', () => {
  assert.equal(validatePublicHttpUrl('https://example.com/path'), 'https://example.com/path');
  for (const url of ['file:///etc/passwd', 'http://localhost/x', 'http://127.0.0.1', 'http://192.168.1.2']) {
    assert.throws(() => validatePublicHttpUrl(url));
  }
});

test('web extraction removes executable markup and limits output', () => {
  const result = extractUsefulText('<style>x</style><script>alert(1)</script><h1>Olá</h1><p>Mundo &amp; céu</p>', 12);
  assert.equal(result, 'Olá Mundo &');
  assert.doesNotMatch(result, /alert|style/);
});

test('weather parser validates and formats Open-Meteo payload', () => {
  assert.match(formatWeather({
    current: { temperature_2m: 23, apparent_temperature: 24, precipitation: 0 },
    current_units: { temperature_2m: '°C', apparent_temperature: '°C', precipitation: 'mm' },
  }), /Temperatura: 23°C; Sensação: 24°C; Precipitação: 0mm/);
  assert.throws(() => formatWeather({ current: {} }), /dados inválidos/);
});

test('maps offline and invalid-response failures to clear messages', () => {
  assert.match(normalizeToolFailure(new TypeError('Network request failed')), /Sem conexão/);
  assert.match(normalizeToolFailure(new SyntaxError('JSON')), /resposta inválida/);
});
