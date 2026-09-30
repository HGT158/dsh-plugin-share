import { deflateRawSync, inflateRawSync } from 'node:zlib'
import { KINDS, normalizeEntry, normalizeEntries, installSpec, classifySpec } from '../shared/entries.mjs'
import { crc32, decodeEntries, encodeEntries, MAX_PAYLOAD_BYTES } from '../shared/np1.mjs'

export const MAGIC = 'D1'
export const FORMAT_VERSION = 1
export const MAX_FRAME_BYTES = 64 * 1024

const ALGO_RAW = 0
const ALGO_DEFLATE = 1

// Keep short lists directly readable as NP1-style binary. Compression is a
// candidate only for longer lists, and is selected only when it saves bytes.
export const DEFLATE_MIN_ENTRIES = 8

function toBase64Url(bytes) {
  return Buffer.from(bytes).toString('base64url')
}

function fromBase64Url(text) {
  if (!/^[A-Za-z0-9_-]+$/u.test(text) || text.length % 4 === 1) throw new Error('invalid-base64url')
  const bytes = Buffer.from(text, 'base64url')
  if (bytes.toString('base64url') !== text) throw new Error('non-canonical-base64url')
  return new Uint8Array(bytes)
}

function writeUint32LE(out, offset, value) {
  out[offset] = value & 0xff
  out[offset + 1] = (value >>> 8) & 0xff
  out[offset + 2] = (value >>> 16) & 0xff
  out[offset + 3] = (value >>> 24) & 0xff
}

function readUint32LE(bytes, offset) {
  return (bytes[offset] | (bytes[offset + 1] << 8) | (bytes[offset + 2] << 16) | (bytes[offset + 3] << 24)) >>> 0
}

/** Encode normalized or public plugin entries into a D1 code. */
export function encodeCode(entries) {
  const normalized = normalizeEntries(entries)
  const wireEntries = normalized.map((entry) => ({
    kind: KINDS[entry.kind],
    value: entry.value,
    version: entry.version,
    enabled: entry.enabled,
  }))
  const payload = encodeEntries(wireEntries)
  const compressed = new Uint8Array(deflateRawSync(Buffer.from(payload), { level: 9 }))
  const canTryCompression = normalized.length >= DEFLATE_MIN_ENTRIES
  const algorithm = canTryCompression && compressed.length < payload.length ? ALGO_DEFLATE : ALGO_RAW
  const body = algorithm === ALGO_DEFLATE ? compressed : payload
  const frame = new Uint8Array(2 + body.length + 4)
  frame[0] = FORMAT_VERSION
  frame[1] = algorithm
  frame.set(body, 2)
  writeUint32LE(frame, 2 + body.length, crc32(payload))
  if (frame.length > MAX_FRAME_BYTES) throw new Error('code-too-large')
  return MAGIC + toBase64Url(frame)
}

function decodeFrame(code) {
  if (typeof code !== 'string') throw new Error('code-not-a-string')
  const compact = code.trim().replace(/\s+/gu, '')
  if (!compact.startsWith(MAGIC)) throw new Error('code-unknown-magic')
  const encoded = compact.slice(MAGIC.length)
  if (!encoded || encoded.length > Math.ceil((MAX_FRAME_BYTES * 4) / 3)) throw new Error('code-too-large')
  const frame = fromBase64Url(encoded)
  if (frame.length < 6 || frame.length > MAX_FRAME_BYTES) throw new Error('frame-size-invalid')
  if (frame[0] !== FORMAT_VERSION) throw new Error(`unsupported-format-version:${frame[0]}`)
  const algorithm = frame[1]
  if (algorithm !== ALGO_RAW && algorithm !== ALGO_DEFLATE) throw new Error('algorithm-unsupported')
  const body = frame.subarray(2, frame.length - 4)
  const storedChecksum = readUint32LE(frame, frame.length - 4)
  let payload
  if (algorithm === ALGO_RAW) payload = body
  else payload = new Uint8Array(inflateRawSync(Buffer.from(body), { maxOutputLength: MAX_PAYLOAD_BYTES }))
  if (payload.length > MAX_PAYLOAD_BYTES) throw new Error('payload-too-large')
  if (crc32(payload) !== storedChecksum) throw new Error('checksum-mismatch')
  return { payload, algorithm, frameBytes: frame.length }
}

/** Total decoder for pasted input. It never throws on attacker-controlled text. */
export function decodeCode(code) {
  try {
    const frame = decodeFrame(code)
    const wireEntries = decodeEntries(frame.payload)
    const entries = wireEntries.map((entry) => {
      const publicInput = entry.kind === 0
        ? { name: entry.value, version: entry.version, enabled: entry.enabled }
        : entry.kind === 1
          ? { spec: entry.value, version: entry.version, enabled: entry.enabled }
          : { name: entry.value, kind: 'builtin', enabled: entry.enabled }
      const canonical = normalizeEntry(publicInput)
      const kind = canonical.kind
      const publicEntry = kind === 'npm'
        ? { name: canonical.value, version: canonical.version, enabled: canonical.enabled }
        : kind === 'github'
          ? { spec: canonical.value, version: canonical.version, enabled: canonical.enabled }
          : { name: canonical.value, kind: 'builtin', enabled: canonical.enabled }
      const spec = installSpec(canonical)
      return {
        kind,
        ...publicEntry,
        installSpec: spec,
        verdict: kind === 'builtin' ? { ok: true, kind: 'builtin' } : classifySpec(spec),
      }
    })
    return { ok: true, entries, compressed: frame.algorithm === ALGO_DEFLATE, frameBytes: frame.frameBytes }
  } catch (error) {
    return { ok: false, reason: error?.message ?? 'code-undecodable' }
  }
}

export function decodeCodeOrThrow(code) {
  const result = decodeCode(code)
  if (!result.ok) {
    const error = new Error(result.reason)
    error.code = result.reason
    throw error
  }
  return result.entries
}

export { classifySpec, normalizeEntries, installSpec }
