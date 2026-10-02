import assert from 'node:assert/strict'
import test from 'node:test'
import { encodeQr } from '../src/shared/qr.mjs'
import { scanQrImage } from '../src/shared/qr-scan.mjs'

const SAMPLE = 'D1AQAFAQAhg3SQz0IZSENKBxARQQQAYedAEI9EEAoJIOggHSRxPUSEMEQzAQsJGEQzkRMBMOQTOQWyEAAEHh-ScBADtRBkQDXDQgAABB4llYMIBIk0DzWRAdUMCwEABB4XADU5ZERUCGEBAPlmXvg'
const MIXED = 'D1AQAFAQAVg3SQjyMoxASJNQEAI-eCUNIECArKOMNCNBLBCQMAVGdpdGh1Yjp1bHVja3lzdGFyL2RzaC1wbHVnaW4tbWFya2V0I3YxLjIuMwAAAE8n4wzEIjjNRFzTEzmTIzgLKhFRRURkgSyEhEkTwQADBl4wLjYuMgUBWQNBPBJBKCSAoIN0kMT1EBHCEM0ELKQkHMRALQQZUM2wEAAL9cXz'

/** Rasterise a matrix into the grayscale buffer the scanner consumes. */
function render(qr, { moduleSize = 4, margin = 4, padding = 0, distractors = false } = {}) {
  const size = qr.size
  const extent = (size + margin * 2) * moduleSize + padding * 2
  const gray = new Uint8Array(extent * extent).fill(255)
  const paint = (x0, y0, w, h, value) => {
    for (let y = y0; y < y0 + h; y += 1) {
      if (y < 0 || y >= extent) continue
      for (let x = x0; x < x0 + w; x += 1) {
        if (x < 0 || x >= extent) continue
        gray[y * extent + x] = value
      }
    }
  }
  const left = padding + margin * moduleSize
  const top = padding + margin * moduleSize
  const span = size * moduleSize
  if (distractors) {
    // Chrome around the symbol — the shape of a screenshot — never over it.
    paint(0, 0, extent, Math.max(0, top - 8), 235)
    for (let i = 0; i < 5; i += 1) paint(12, top + span + 14 + i * 12, 80 + i * 24, 5, 70)
    paint(extent - 60, top, 40, span, 238)
  }
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (qr.modules[row][col] !== '1') continue
      paint(left + col * moduleSize, top + row * moduleSize, moduleSize, moduleSize, 0)
    }
  }
  return { gray, extent }
}

test('reads back a symbol it rendered, at several scales and offsets', () => {
  for (const text of [SAMPLE, MIXED]) {
    const qr = encodeQr(text, { level: 'M' })
    for (const moduleSize of [3, 4, 6]) {
      for (const margin of [2, 4]) {
        for (const padding of [0, 37]) {
          const { gray, extent } = render(qr, { moduleSize, margin, padding })
          const result = scanQrImage(gray, extent, extent)
          assert.equal(result.ok, true, `scan failed for module=${moduleSize} margin=${margin} pad=${padding}`)
          assert.equal(result.text, text)
          assert.equal(result.version, qr.version)
        }
      }
    }
  }
})

test('finds the symbol inside a busier image', () => {
  const qr = encodeQr(SAMPLE, { level: 'M' })
  const { gray, extent } = render(qr, { moduleSize: 5, margin: 4, padding: 90, distractors: true })
  const result = scanQrImage(gray, extent, extent)
  assert.equal(result.ok, true, `scan failed: ${result.reason}`)
  assert.equal(result.text, SAMPLE)
})

test('reports why an image cannot be read instead of guessing', () => {
  const noise = new Uint8Array(400 * 400)
  for (let i = 0; i < noise.length; i += 1) noise[i] = (i * 2654435761) % 256
  assert.equal(scanQrImage(noise, 400, 400).ok, false)
  assert.equal(scanQrImage(noise, 400, 400).reason, 'qr-not-found')

  const blank = new Uint8Array(400 * 400).fill(255)
  assert.equal(scanQrImage(blank, 400, 400).reason, 'qr-not-found')

  const tiny = new Uint8Array(10 * 10)
  assert.equal(scanQrImage(tiny, 10, 10).reason, 'qr-image-too-small')

  assert.equal(scanQrImage(new Uint8Array(4), 3, 3).reason, 'qr-image-invalid')
})

test('flags a readable symbol that is not a share code', () => {
  const foreign = encodeQr('https://example.com/not-a-share-code', { level: 'M' })
  const { gray, extent } = render(foreign, { moduleSize: 4, margin: 4 })
  const result = scanQrImage(gray, extent, extent)
  assert.equal(result.ok, false)
  assert.equal(result.reason, 'qr-not-a-share-code')
  assert.equal(result.text, 'https://example.com/not-a-share-code')
})
