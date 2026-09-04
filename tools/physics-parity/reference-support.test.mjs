import assert from 'node:assert/strict'
import { test } from 'node:test'
import {
  assertReferenceMatches,
  normalizeReferenceText,
  requireReferenceRuntime,
} from './reference-support.mjs'

test('accepts the frozen Node 24 runtime and rejects unsupported major versions', () => {
  for (const version of ['24.18.0', '24.19.0']) {
    assert.doesNotThrow(() => requireReferenceRuntime(version))
  }
  for (const version of ['20.19.0', '22.14.0', '25.0.0', 'invalid']) {
    assert.throws(() => requireReferenceRuntime(version), /requires Node 24/)
  }
})

test('LF and CRLF references compare identically without mutating numbers', () => {
  const lf = '{\n  "value": 0.03111524511175199\n}\n'
  const crlf = lf.replaceAll('\n', '\r\n')
  assert.equal(normalizeReferenceText(crlf), lf)
  assert.doesNotThrow(() => assertReferenceMatches(crlf, lf, 'Reference'))
  assert.doesNotThrow(() => assertReferenceMatches(lf, crlf, 'Reference'))
})

test('still rejects changed physics numbers, source hashes and missing data', () => {
  const stored = '{\n"value":0.03111524511175199,"source":"abc"\n}\n'
  for (const altered of [
    stored.replace('0.03111524511175199', '0.031115245111751993'),
    stored.replace('abc', 'def'),
    '{}\n',
  ]) {
    assert.throws(() => assertReferenceMatches(stored, altered, 'Reference'), /is stale/)
  }
})

test('does not ignore whitespace, malformed line breaks or a missing final newline', () => {
  assert.throws(() => assertReferenceMatches('{}\n', '{}', 'Reference'), /is stale/)
  assert.throws(() => assertReferenceMatches('{}\n', '{ }\n', 'Reference'), /is stale/)
  assert.throws(() => assertReferenceMatches('{}\n', '{}\r', 'Reference'), /is stale/)
})
