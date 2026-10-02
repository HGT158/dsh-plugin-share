/**
 * QR scanner for clean, upright images — the PNG or screenshot this plugin
 * produces. It is deliberately not a general-purpose reader: phone photos with
 * strong perspective, blur or damage are out of scope, and that is stated in the
 * README instead of being guessed at.
 *
 * Two properties keep a misread from ever producing a wrong result:
 *
 * - the grid is read with the same module traversal the encoder writes with
 *   (`dataModules` in `./qr.mjs`), so the two halves cannot disagree;
 * - the caller validates the decoded text as a D1 code, so its CRC32 is the
 *   final acceptance test. A garbled read fails loudly instead of quietly
 *   pasting a broken code.
 */

import { dataModules, maskApplies, rsBlocks } from './qr.mjs'

const MAX_CANDIDATES = 64

/** Otsu's threshold over a grayscale histogram. */
function otsuThreshold(gray) {
  const histogram = new Uint32Array(256)
  for (let i = 0; i < gray.length; i += 1) histogram[gray[i]] += 1
  const total = gray.length
  let sum = 0
  for (let value = 0; value < 256; value += 1) sum += value * histogram[value]
  let sumBackground = 0
  let weightBackground = 0
  let best = 0
  let bestVariance = -1
  for (let value = 0; value < 256; value += 1) {
    weightBackground += histogram[value]
    if (weightBackground === 0) continue
    const weightForeground = total - weightBackground
    if (weightForeground === 0) break
    sumBackground += value * histogram[value]
    const meanBackground = sumBackground / weightBackground
    const meanForeground = (sum - sumBackground) / weightForeground
    const variance = weightBackground * weightForeground * (meanBackground - meanForeground) ** 2
    if (variance > bestVariance) {
      bestVariance = variance
      best = value
    }
  }
  return best
}

function binarize(gray, threshold) {
  const binary = new Uint8Array(gray.length)
  for (let i = 0; i < gray.length; i += 1) binary[i] = gray[i] <= threshold ? 1 : 0
  return binary
}

function matchFinderRatio(runs) {
  const total = runs[0] + runs[1] + runs[2] + runs[3] + runs[4]
  if (total < 7) return null
  const module = total / 7
  const tolerance = module * 0.6
  const expected = [1, 1, 3, 1, 1]
  for (let i = 0; i < 5; i += 1) {
    if (Math.abs(runs[i] - expected[i] * module) > tolerance) return null
  }
  return module
}

/** Horizontal 1:1:3:1:1 runs, verified vertically, clustered into centres. */
function findFinderPatterns(binary, width, height) {
  const candidates = []
  for (let y = 0; y < height; y += 1) {
    const base = y * width
    // `recent` keeps the last five completed runs, oldest first, so a window
    // that ends on a dark run reads dark, light, dark, light, dark.
    const recent = []
    let color = binary[base]
    let length = 1
    for (let x = 1; x < width; x += 1) {
      const value = binary[base + x]
      if (value === color) {
        length += 1
        continue
      }
      recent.push(length)
      if (recent.length > 5) recent.shift()
      if (color === 1 && recent.length === 5) {
        const module = matchFinderRatio(recent)
        if (module) {
          const centerX = x - recent[4] - recent[3] - recent[2] / 2
          const vertical = verifyVertical(binary, width, height, Math.round(centerX), y, module)
          if (vertical) candidates.push(vertical)
        }
      }
      color = value
      length = 1
    }
    recent.push(length)
    if (recent.length > 5) recent.shift()
    if (color === 1 && recent.length === 5) {
      const module = matchFinderRatio(recent)
      if (module) {
        const centerX = width - recent[4] - recent[3] - recent[2] / 2
        const vertical = verifyVertical(binary, width, height, Math.round(centerX), y, module)
        if (vertical) candidates.push(vertical)
      }
    }
  }

  const clusters = []
  for (const point of candidates) {
    const near = clusters.find((cluster) => Math.abs(cluster.x - point.x) <= cluster.module * 2
      && Math.abs(cluster.y - point.y) <= cluster.module * 2)
    if (near) {
      const count = near.count + 1
      near.x = (near.x * near.count + point.x) / count
      near.y = (near.y * near.count + point.y) / count
      near.module = (near.module * near.count + point.module) / count
      near.count = count
      continue
    }
    if (clusters.length >= MAX_CANDIDATES) continue
    clusters.push({ x: point.x, y: point.y, module: point.module, count: 1 })
  }
  // A real finder centre is hit by several adjacent rows; single hits are noise.
  return clusters.filter((cluster) => cluster.count >= 2).sort((a, b) => b.count - a.count)
}

/** Walk the column away from a finder's core and measure the next two runs. */
function runsFrom(binary, width, height, x, startY, step) {
  let cursor = startY
  let light = 0
  while (cursor >= 0 && cursor < height && binary[cursor * width + x] === 0) {
    light += 1
    cursor += step
  }
  if (cursor < 0 || cursor >= height) return null
  let dark = 0
  while (cursor >= 0 && cursor < height && binary[cursor * width + x] === 1) {
    dark += 1
    cursor += step
  }
  if (cursor < 0 || cursor >= height) return null
  return [light, dark]
}

function verifyVertical(binary, width, height, x, y, module) {
  if (x < 0 || x >= width || binary[y * width + x] !== 1) return null
  const near = (value, expected) => Math.abs(value - expected) <= module * 0.7
  let top = y
  while (top - 1 >= 0 && binary[(top - 1) * width + x] === 1) top -= 1
  let bottom = y
  while (bottom + 1 < height && binary[(bottom + 1) * width + x] === 1) bottom += 1
  const core = bottom - top + 1
  if (!near(core, module * 3)) return null
  const up = runsFrom(binary, width, height, x, top - 1, -1)
  const down = runsFrom(binary, width, height, x, bottom + 1, 1)
  if (!up || !down) return null
  if (!near(up[0], module) || !near(up[1], module)) return null
  if (!near(down[0], module) || !near(down[1], module)) return null
  const refined = (core + up[0] + up[1] + down[0] + down[1]) / 7
  return { x, y: (top + bottom) / 2, module: refined }
}

function distance(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y)
}

/**
 * Read a QR symbol out of an upright grayscale image.
 * @param gray - one byte per pixel, row major
 * @returns `{ ok: true, text }`, or `{ ok: false, reason }`
 */
export function scanQrImage(gray, width, height) {
  if (!(gray instanceof Uint8Array) || gray.length !== width * height) return { ok: false, reason: 'qr-image-invalid' }
  if (width < 21 || height < 21) return { ok: false, reason: 'qr-image-too-small' }

  const binary = binarize(gray, otsuThreshold(gray))
  const patterns = findFinderPatterns(binary, width, height)
  const trio = pickTrio(patterns)
  if (!trio) return { ok: false, reason: 'qr-not-found' }

  const { corner, right, bottom } = trio
  const span = distance(corner, right)
  const moduleSize = (corner.module + right.module + bottom.module) / 3
  if (moduleSize <= 0) return { ok: false, reason: 'qr-not-found' }

  const modulesAcross = span / moduleSize + 7
  const size = Math.round((modulesAcross - 17) / 4) * 4 + 17
  if (size < 21 || size > 177 || Math.abs(size - modulesAcross) > 3) return { ok: false, reason: 'qr-not-found' }
  const version = (size - 17) / 4

  const matrix = sampleMatrix(binary, width, height, { corner, right, bottom, size })
  if (!matrix) return { ok: false, reason: 'qr-unreadable' }

  const order = dataModules(version)
  const totalCodewords = rsBlocks(version, 'L').reduce((sum, block) => sum + block.total, 0)
  const bits = order.map(([row, col]) => (matrix[row][col] ? 1 : 0))

  let firstText = null
  for (const level of ['L', 'M', 'Q', 'H']) {
    let blocks
    try {
      blocks = rsBlocks(version, level)
    } catch {
      continue
    }
    const expected = blocks.reduce((sum, block) => sum + block.total, 0)
    if (expected !== totalCodewords) continue
    for (let mask = 0; mask < 8; mask += 1) {
      const codewords = readCodewords(bits, order, mask, totalCodewords)
      const text = decodePayload(codewords, blocks, version)
      if (text === null) continue
      if (firstText === null) firstText = text
      if (looksLikeShareCode(text)) return { ok: true, text, version, level, mask }
    }
  }
  if (firstText !== null) return { ok: false, reason: 'qr-not-a-share-code', text: firstText }
  return { ok: false, reason: 'qr-unreadable' }
}

/** Choose the three finder centres that form the best right angle. */
function pickTrio(patterns) {
  const pool = patterns.slice(0, 8)
  let best = null
  for (let i = 0; i < pool.length; i += 1) {
    for (let j = 0; j < pool.length; j += 1) {
      if (j === i) continue
      for (let k = 0; k < pool.length; k += 1) {
        if (k === i || k === j) continue
        const corner = pool[i]
        const right = pool[j]
        const bottom = pool[k]
        const legA = distance(corner, right)
        const legB = distance(corner, bottom)
        const hypotenuse = distance(right, bottom)
        if (legA < 8 || legB < 8) continue
        // Right angle at the corner, equal legs, and the leg ratio near 1.
        const ratio = legA / legB
        if (ratio < 0.7 || ratio > 1.4) continue
        const score = Math.abs(legA - legB) / Math.max(legA, legB)
          + Math.abs(hypotenuse - Math.hypot(legA, legB)) / Math.max(legA, legB)
        // The corner must be the top-left: its direction to the others must be
        // right-and-down, which the cross product's sign decides.
        const cross = (right.x - corner.x) * (bottom.y - corner.y) - (right.y - corner.y) * (bottom.x - corner.x)
        if (cross <= 0) continue
        if (best === null || score < best.score) best = { corner, right, bottom, score }
      }
    }
  }
  return best
}

function sampleMatrix(binary, width, height, { corner, right, bottom, size }) {
  const span = size - 7
  const matrix = []
  for (let row = 0; row < size; row += 1) {
    const line = new Uint8Array(size)
    for (let col = 0; col < size; col += 1) {
      const fx = (col - 3) / span
      const fy = (row - 3) / span
      const x = corner.x + fx * (right.x - corner.x) + fy * (bottom.x - corner.x)
      const y = corner.y + fx * (right.y - corner.y) + fy * (bottom.y - corner.y)
      const px = Math.round(x)
      const py = Math.round(y)
      if (px < 0 || py < 0 || px >= width || py >= height) return null
      line[col] = binary[py * width + px]
    }
    matrix.push(line)
  }
  return matrix
}

function readCodewords(bits, order, mask, totalCodewords) {
  const codewords = new Uint8Array(totalCodewords)
  for (let i = 0; i < bits.length && i < totalCodewords * 8; i += 1) {
    const [row, col] = order[i]
    const value = bits[i] ^ (maskApplies(mask, row, col) ? 1 : 0)
    if (value) codewords[i >> 3] |= 0x80 >> (i & 7)
  }
  return codewords
}

/** Undo the encoder's block interleaving and read the byte-mode payload. */
function decodePayload(codewords, blocks, version) {
  const totalData = blocks.reduce((sum, block) => sum + block.data, 0)
  const data = codewords.subarray(0, totalData)
  const out = new Uint8Array(totalData)
  const longest = Math.max(...blocks.map((block) => block.data))
  let source = 0
  let target = 0
  const starts = []
  for (const block of blocks) {
    starts.push(target)
    target += block.data
  }
  for (let i = 0; i < longest; i += 1) {
    for (let b = 0; b < blocks.length; b += 1) {
      if (i >= blocks[b].data) continue
      if (source >= data.length) return null
      out[starts[b] + i] = data[source]
      source += 1
    }
  }

  const countBits = version < 10 ? 8 : 16
  let bit = 0
  const read = (length) => {
    let value = 0
    for (let i = 0; i < length; i += 1) {
      const byte = out[bit >> 3]
      if (byte === undefined) throw new Error('qr-short')
      value = (value << 1) | ((byte >> (7 - (bit & 7))) & 1)
      bit += 1
    }
    return value
  }

  try {
    const mode = read(4)
    if (mode !== 0b0100) return null
    const length = read(countBits)
    if (length <= 0 || length * 8 > out.length * 8 - bit) return null
    const bytes = new Uint8Array(length)
    for (let i = 0; i < length; i += 1) bytes[i] = read(8)
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes)
  } catch {
    return null
  }
}

function looksLikeShareCode(text) {
  return typeof text === 'string' && /^D1[0-9A-Za-z_-]+$/.test(text.trim())
}
