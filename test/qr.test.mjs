import assert from 'node:assert/strict'
import test from 'node:test'
import { chooseVersion, encodeQr, qrToSvg } from '../src/shared/qr.mjs'

// Produced by the independent `qrcode` reference implementation (Python) for the
// same text, version and mask. Any change in placement, error correction,
// masking or format information breaks this.
const GOLDEN_ROWS = [
  '1111111000011010001111111',
  '1000001000111101001000001',
  '1011101010010010001011101',
  '1011101011010101101011101',
  '1011101010010010001011101',
  '1000001010100011101000001',
  '1111111010101010101111111',
  '0000000011011001000000000',
  '1011111000010101101111100',
  '1100000000111010010100001',
  '1101001110000011011100111',
  '1001010111111011001110011',
  '1011101000110101111011001',
  '1000010000001010000000110',
  '1011111000000111111010101',
  '1001000111101001111110001',
  '1010001100001100111111011',
  '0000000010000011100010101',
  '1111111001111110101011011',
  '1000001010010011100010001',
  '1011101011011101111111000',
  '1011101011001111011000011',
  '1011101010000000010101001',
  '1000001001001000101100001',
  '1111111011010100010101011',
]

test('matches the reference implementation module for module', () => {
  const qr = encodeQr('D1GOLDEN-test-0123456789', { level: 'M' })
  assert.equal(qr.version, 2)
  assert.equal(qr.mask, 2)
  assert.equal(qr.size, 25)
  assert.deepEqual(qr.modules, GOLDEN_ROWS)
})

test('lays out finder patterns, timing rows and the dark module', () => {
  const qr = encodeQr('D1AQAFAQAhg3', { level: 'M' })
  const size = qr.size
  const row = (index) => qr.modules[index]
  const col = (index) => qr.modules.map((line) => line[index]).join('')

  assert.equal(size, (qr.version - 1) * 4 + 21)
  for (const [r, c] of [[0, 0], [0, size - 7], [size - 7, 0]]) {
    assert.equal(row(r).slice(c, c + 7), '1111111')
    assert.equal(row(r + 1).slice(c, c + 7), '1000001')
    assert.equal(row(r + 6).slice(c, c + 7), '1111111')
  }
  assert.equal(row(6).slice(8, 14), '101010')
  assert.equal(col(6).slice(8, 14), '101010')
  assert.equal(row(size - 8)[8], '1')
})

test('picks the smallest version that fits and refuses what cannot fit', () => {
  assert.equal(chooseVersion(17, 'L'), 1)
  assert.equal(chooseVersion(18, 'L'), 2)
  assert.equal(chooseVersion(2953, 'L'), 40)
  assert.equal(chooseVersion(2954, 'L'), null)
  assert.equal(chooseVersion(2332, 'M'), null)
  assert.equal(chooseVersion(1274, 'H'), null)
})

test('rejects empty text, unknown levels and oversized payloads', () => {
  assert.throws(() => encodeQr(''), /qr-text-invalid/)
  assert.throws(() => encodeQr('x', { level: 'Z' }), /qr-level-invalid/)
  assert.throws(() => encodeQr('x'.repeat(4000), { level: 'L' }), /qr-too-long/)
})

test('renders one path command per dark module inside a quiet zone', () => {
  const qr = encodeQr('D1AQAFAQAhg3', { level: 'M' })
  const svg = qrToSvg(qr, { margin: 4, moduleSize: 4 })
  const dark = qr.modules.join('').split('').filter((cell) => cell === '1').length
  const extent = (qr.size + 8) * 4

  assert.equal(svg.split('M').length - 1, dark)
  assert.match(svg, new RegExp(`viewBox="0 0 ${extent} ${extent}"`))
  assert.match(svg, /shape-rendering="crispEdges"/)
  assert.match(svg, /fill="#ffffff"/)
  assert.match(svg, /fill="#000000"/)
})

test('every error correction level produces the same payload size class', () => {
  for (const level of ['L', 'M', 'Q', 'H']) {
    const qr = encodeQr('D1AQAFAQAhg3SQz0IZSENKBxARQQQAYedAEI9EEAoJIOggHSRxPUSEMEQzAQsJGEQzkRMBMOQTOQWyE', { level })
    assert.equal(qr.level, level)
    assert.equal(qr.modules.length, qr.size)
    assert.equal(qr.modules.every((line) => line.length === qr.size), true)
  }
})
