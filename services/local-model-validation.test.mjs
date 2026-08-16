import assert from 'node:assert/strict';
import test from 'node:test';

import {
  fileUriToNativePath,
  isFileUriInsideDirectory,
  sanitizeLocalModelDiagnostic,
  validateCopiedModel,
} from './local-model-validation.ts';

const ggufHeader = new Uint8Array([0x47, 0x47, 0x55, 0x46]);

test('accepts a complete file with a GGUF header', () => {
  assert.equal(
    validateCopiedModel({
      expectedSize: 100,
      copiedSize: 100,
      actualSize: 100,
      header: ggufHeader,
    }),
    null
  );
});

test('rejects an incomplete copy', () => {
  assert.match(
    validateCopiedModel({
      expectedSize: 100,
      copiedSize: 90,
      actualSize: 90,
      header: ggufHeader,
    }) ?? '',
    /size mismatch/
  );
});

test('rejects a file without GGUF magic', () => {
  assert.equal(
    validateCopiedModel({
      expectedSize: 4,
      copiedSize: 4,
      actualSize: 4,
      header: new Uint8Array([0, 0, 0, 0]),
    }),
    'invalid GGUF magic'
  );
});

test('normalizes file URIs for both llama.rn entry points', () => {
  assert.equal(
    fileUriToNativePath('file:///data/user/0/app/model.gguf'),
    '/data/user/0/app/model.gguf'
  );
  assert.equal(
    fileUriToNativePath('/data/user/0/app/model.gguf'),
    '/data/user/0/app/model.gguf'
  );
});

test('only identifies file URIs contained by the cache directory', () => {
  const cacheUri = 'file:///data/user/0/app/cache/';

  assert.equal(
    isFileUriInsideDirectory(`${cacheUri}picked.gguf`, cacheUri),
    true
  );
  assert.equal(
    isFileUriInsideDirectory(
      'file:///data/user/0/app/cache-other/model.gguf',
      cacheUri
    ),
    false
  );
  assert.equal(
    isFileUriInsideDirectory(
      'content://provider/document/model.gguf',
      cacheUri
    ),
    false
  );
});

test('redacts Android URIs and private paths from diagnostics', () => {
  assert.equal(
    sanitizeLocalModelDiagnostic(
      new Error(
        'failed file:///data/user/0/app/model.gguf from content://provider/document/secret'
      )
    ),
    'Error: failed <private-file> from <content-uri>'
  );
});
