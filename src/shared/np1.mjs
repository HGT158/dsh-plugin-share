/**
 * NP1-inspired binary record codec used inside the D1 envelope.
 * It keeps NP1's varints, prefix-delta names, 6-bit alphabet and compact
 * version tokens, while adding source kind and enabled state.
 */

import { KINDS, MAX_VALUE_LENGTH, MAX_VERSION_LENGTH } from './entries.mjs'

export const MAX_ENTRIES = 512
export const MAX_PAYLOAD_BYTES = 256 * 1024

const NAME_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789-_.@/'
const NAME_CODES = new Map([...NAME_ALPHABET].map((char, index) => [char, index]))

class Writer {
  constructor() { this.data = [] }
  byte(value) { this.data.push(value & 0xff) }
  varint(value) {
    if (!Number.isSafeInteger(value) || value < 0 || value > 0xffffffff) throw new Error('integer-out-of-range')
    do {
      let byte = value % 128
      value = Math.floor(value / 128)
      if (value) byte |= 0x80
      this.byte(byte)
    } while (value)
  }
  bytes(values) { for (const value of values) this.byte(value) }
  result() { return Uint8Array.from(this.data) }
}

class Reader {
  constructor(bytes) { this.bytes = bytes; this.offset = 0 }
  byte() {
    if (this.offset >= this.bytes.length) throw new Error('truncated')
    return this.bytes[this.offset++]
  }
  varint() {
    let value = 0
    let multiplier = 1
    for (let i = 0; i < 5; i += 1) {
      const byte = this.byte()
      value += (byte & 0x7f) * multiplier
      if (value > 0xffffffff) throw new Error('integer-out-of-range')
      if (!(byte & 0x80)) {
        if (i > 0 && byte === 0) throw new Error('non-canonical-varint')
        return value
      }
      multiplier *= 128
    }
    throw new Error('overlong-varint')
  }
  take(length) {
    if (!Number.isSafeInteger(length) || length < 0 || length > this.bytes.length - this.offset) throw new Error('truncated')
    const result = this.bytes.subarray(this.offset, this.offset + length)
    this.offset += length
    return result
  }
  eof() { return this.offset === this.bytes.length }
}

function validateValue(value) {
  if (typeof value !== 'string' || value.length === 0 || value.length > MAX_VALUE_LENGTH) throw new Error('value-invalid')
  if (/[^\x20-\x7e]/u.test(value) || /\s/u.test(value)) throw new Error('value-unsafe')
}

function validateVersion(version) {
  if (version === null) return
  if (typeof version !== 'string' || version.length === 0 || version.length > MAX_VERSION_LENGTH) throw new Error('version-invalid')
  if (/[^\x20-\x7e]/u.test(version) || /\s/u.test(version)) throw new Error('version-unsafe')
}

function writeSixBit(writer, text) {
  let buffer = 0
  let bits = 0
  for (const char of text) {
    buffer |= NAME_CODES.get(char) << bits
    bits += 6
    while (bits >= 8) {
      writer.byte(buffer & 0xff)
      buffer >>>= 8
      bits -= 8
    }
  }
  if (bits) writer.byte(buffer & 0xff)
}

function readSixBit(reader, length) {
  let result = ''
  let buffer = 0
  let bits = 0
  for (let i = 0; i < length; i += 1) {
    while (bits < 6) {
      buffer |= reader.byte() << bits
      bits += 8
    }
    const id = buffer & 0x3f
    buffer >>>= 6
    bits -= 6
    if (id >= NAME_ALPHABET.length) throw new Error('invalid-six-bit-symbol')
    result += NAME_ALPHABET[id]
  }
  return result
}

function writeValue(writer, previous, value) {
  const shared = commonPrefixLength(previous, value)
  const suffix = value.slice(shared)
  const sixBit = [...suffix].every((char) => NAME_CODES.has(char))
  writer.varint(shared)
  writer.varint(suffix.length * 2 + (sixBit ? 1 : 0))
  if (sixBit) writeSixBit(writer, suffix)
  else writer.bytes([...suffix].map((char) => char.charCodeAt(0)))
}

function readValue(reader, previous) {
  const shared = reader.varint()
  const suffixToken = reader.varint()
  const sixBit = (suffixToken & 1) === 1
  const length = Math.floor(suffixToken / 2)
  if (shared > previous.length || shared + length > MAX_VALUE_LENGTH) throw new Error('value-prefix-invalid')
  let suffix
  if (sixBit) suffix = readSixBit(reader, length)
  else suffix = String.fromCharCode(...reader.take(length))
  const value = previous.slice(0, shared) + suffix
  validateValue(value)
  return value
}

function parseCoreSemver(version) {
  const match = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)$/u.exec(version)
  if (!match) return null
  const values = match.slice(1).map(Number)
  return values.every(Number.isSafeInteger) ? values : null
}

function writeVersion(writer, version, versions, indexes) {
  if (version === null) {
    writer.varint(0)
    return
  }
  if (indexes.has(version)) {
    writer.varint((indexes.get(version) + 1) * 4)
    return
  }
  const triple = parseCoreSemver(version)
  if (triple && triple.every((value) => value < 16)) {
    const packed = triple[0] | (triple[1] << 4) | (triple[2] << 8)
    writer.varint(1 + 4 * packed)
  } else if (triple && triple.every((value) => value <= 0xffffffff)) {
    writer.varint(2)
    for (const value of triple) writer.varint(value)
  } else {
    writer.varint(3)
    writer.varint(version.length)
    writer.bytes([...version].map((char) => char.charCodeAt(0)))
  }
  indexes.set(version, versions.length)
  versions.push(version)
}

function readVersion(reader, versions) {
  const token = reader.varint()
  if (token === 0) return null
  const kind = token % 4
  if (kind === 0) {
    const index = token / 4 - 1
    if (!Number.isInteger(index) || index < 0 || index >= versions.length) throw new Error('version-ref-invalid')
    return versions[index]
  }
  let version
  if (kind === 1) {
    const packed = Math.floor(token / 4)
    if (packed >= 4096) throw new Error('version-invalid')
    version = `${packed & 0xf}.${(packed >> 4) & 0xf}.${(packed >> 8) & 0xf}`
  } else if (kind === 2) {
    if (token !== 2) throw new Error('version-invalid')
    version = `${reader.varint()}.${reader.varint()}.${reader.varint()}`
  } else {
    if (token !== 3) throw new Error('version-invalid')
    const length = reader.varint()
    if (length > MAX_VERSION_LENGTH) throw new Error('version-too-long')
    version = String.fromCharCode(...reader.take(length))
  }
  validateVersion(version)
  versions.push(version)
  return version
}

export function encodeEntries(entries) {
  if (!Array.isArray(entries) || entries.length === 0 || entries.length > MAX_ENTRIES) throw new Error('entries-invalid')
  const writer = new Writer()
  writer.varint(entries.length)
  let previous = ''
  const versions = []
  const indexes = new Map()
  for (const entry of entries) {
    if (!entry || !Number.isInteger(entry.kind) || entry.kind < 0 || entry.kind > 2) throw new Error('kind-invalid')
    validateValue(entry.value)
    validateVersion(entry.version ?? null)
    if (typeof entry.enabled !== 'boolean') throw new Error('enabled-invalid')
    writer.varint((entry.kind << 1) | (entry.enabled ? 1 : 0))
    writeValue(writer, previous, entry.value)
    writeVersion(writer, entry.version ?? null, versions, indexes)
    previous = entry.value
  }
  const payload = writer.result()
  if (payload.length > MAX_PAYLOAD_BYTES) throw new Error('payload-too-large')
  return payload
}

export function decodeEntries(bytes) {
  const payload = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes ?? [])
  if (payload.length > MAX_PAYLOAD_BYTES) throw new Error('payload-too-large')
  const reader = new Reader(payload)
  const count = reader.varint()
  if (count === 0 || count > MAX_ENTRIES) throw new Error('entries-invalid')
  const entries = []
  let previous = ''
  const versions = []
  for (let i = 0; i < count; i += 1) {
    const meta = reader.varint()
    const kind = meta >> 1
    if (kind > 2) throw new Error('kind-invalid')
    const value = readValue(reader, previous)
    const version = readVersion(reader, versions)
    entries.push({ kind, value, version, enabled: (meta & 1) === 1 })
    previous = value
  }
  if (!reader.eof()) throw new Error('trailing-payload')
  return entries
}

function commonPrefixLength(a, b) {
  const max = Math.min(a.length, b.length)
  let index = 0
  while (index < max && a.charCodeAt(index) === b.charCodeAt(index)) index += 1
  return index
}

const CRC32_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i += 1) {
    let value = i
    for (let bit = 0; bit < 8; bit += 1) value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) >>> 0 : value >>> 1
    table[i] = value >>> 0
  }
  return table
})()

export function crc32(bytes) {
  let value = 0xffffffff
  for (const byte of bytes) value = CRC32_TABLE[(value ^ byte) & 0xff] ^ (value >>> 8)
  return (value ^ 0xffffffff) >>> 0
}

