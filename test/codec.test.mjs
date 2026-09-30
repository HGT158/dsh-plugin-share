import assert from 'node:assert/strict'
import test from 'node:test'
import { encodeCode, decodeCode, decodeCodeOrThrow } from '../src/host/codec.mjs'
import { classifySpec, normalizeEntry } from '../src/shared/entries.mjs'
import { crc32, encodeEntries } from '../src/shared/np1.mjs'

function rawD1(payload) {
  const frame = new Uint8Array(2 + payload.length + 4)
  frame[0] = 1
  frame[1] = 0
  frame.set(payload, 2)
  const checksum = crc32(payload)
  frame[frame.length - 4] = checksum & 0xff
  frame[frame.length - 3] = (checksum >>> 8) & 0xff
  frame[frame.length - 2] = (checksum >>> 16) & 0xff
  frame[frame.length - 1] = (checksum >>> 24) & 0xff
  return `D1${Buffer.from(frame).toString('base64url')}`
}

const sample = [
  { name: 'dsh-pocket', version: '2.10.6', enabled: true },
  { name: '@liustack/modlens', version: '0.3.1', enabled: true },
  { spec: 'github:uluckystar/dsh-plugin-market#v1.2.3', enabled: true },
  { name: '@modelcontextprotocol/server-filesystem', version: '^0.6.2', enabled: false },
  { name: '@deepseek-ai/dsh-experimental-schedule-bundle', kind: 'builtin', enabled: true },
]

test('round trips npm, GitHub, builtin and disabled entries', () => {
  const code = encodeCode(sample)
  const result = decodeCode(code)
  assert.equal(result.ok, true)
  assert.equal(code.startsWith('D1'), true)
  assert.deepEqual(result.entries.map(({ kind, installSpec, enabled }) => ({ kind, installSpec, enabled })), [
    { kind: 'npm', installSpec: 'dsh-pocket@2.10.6', enabled: true },
    { kind: 'npm', installSpec: '@liustack/modlens@0.3.1', enabled: true },
    { kind: 'github', installSpec: 'github:uluckystar/dsh-plugin-market#v1.2.3', enabled: true },
    { kind: 'npm', installSpec: '@modelcontextprotocol/server-filesystem@^0.6.2', enabled: false },
    { kind: 'builtin', installSpec: '@deepseek-ai/dsh-experimental-schedule-bundle', enabled: true },
  ])
})

test('keeps a typical short set in raw NP1 binary', () => {
  const result = decodeCode(encodeCode(sample))
  assert.equal(result.ok, true)
  assert.equal(result.compressed, false)
})

test('uses deflate-raw for a long list only when it is shorter', () => {
  const entries = Array.from({ length: 50 }, (_, index) => ({
    name: `@demo/plugin-${String(index + 1).padStart(2, '0')}`,
    version: `1.${index % 4}.${index % 8}`,
    enabled: index % 5 !== 0,
  }))
  const result = decodeCode(encodeCode(entries))
  assert.equal(result.ok, true)
  assert.equal(result.compressed, true)
})

test('supports latest-version entries and semver prerelease', () => {
  const code = encodeCode([
    { name: 'dsh-pocket' },
    { name: 'dsh-other', version: '1.2.3-beta.1+build.7' },
  ])
  const entries = decodeCodeOrThrow(code)
  assert.equal(entries[0].version, null)
  assert.equal(entries[1].version, '1.2.3-beta.1+build.7')
})

test('rejects unsafe or unsupported sources before encoding', () => {
  for (const spec of ['file:///tmp/x', 'link:../x', 'portal:./x', 'workspace:*', 'https://evil/x.tgz']) {
    assert.equal(classifySpec(spec).ok, false)
    assert.throws(() => encodeCode([{ spec }]))
  }
  assert.throws(() => encodeCode([{ name: 'x', version: '1.0.0', config: {} }]), /unsupported plugin field/)
})

test('normalizes public inputs without carrying secrets', () => {
  assert.deepEqual(normalizeEntry({ optional: true, name: '@deepseek-ai/dsh-off', enabled: false }), {
    kind: 'builtin', value: '@deepseek-ai/dsh-off', version: null, enabled: false,
  })
  assert.throws(() => normalizeEntry({ name: 'x', version: '1.0.0', apiKey: 'secret' }), /unsupported plugin field/)
})

test('detects checksum tampering, truncation and unknown frames', () => {
  const code = encodeCode(sample)
  const body = code.slice(0, -1) + (code.at(-1) === 'A' ? 'B' : 'A')
  assert.equal(decodeCode(body).ok, false)
  assert.equal(decodeCode(code.slice(0, -1)).ok, false)
  assert.match(decodeCode('D1' + 'AQI' + 'A').reason, /frame|checksum|base64|truncated|entries/i)
})

test('revalidates decoded wire values before exposing install specs', () => {
  const payload = encodeEntries([{ kind: 0, value: 'file:x', version: null, enabled: true }])
  const result = decodeCode(rawD1(payload))
  assert.equal(result.ok, false)
})

test('accepts copy-paste whitespace but does not throw on arbitrary input', () => {
  const code = encodeCode(sample)
  assert.equal(decodeCode(code.replace(/(.{24})/gu, '$1\n')).ok, true)
  for (const bad of ['', 'garbage', null, 42, {}, 'D1!!!!', 'D1AAAA']) {
    assert.doesNotThrow(() => decodeCode(bad))
    assert.equal(typeof decodeCode(bad).ok, 'boolean')
  }
})

test('round trips repeated versions and many shared names', () => {
  const entries = Array.from({ length: 50 }, (_, index) => ({
    name: `@demo/plugin-${String(index + 1).padStart(2, '0')}`,
    version: `1.${index % 4}.${index % 8}`,
    enabled: index % 5 !== 0,
  }))
  const code = encodeCode(entries)
  assert.deepEqual(decodeCodeOrThrow(code).map(({ name, version, enabled }) => ({ name, version, enabled })), entries.map(({ name, version, enabled }) => ({ name, version, enabled })))
  assert.ok(code.length < 500)
})
