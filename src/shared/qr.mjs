/**
 * Minimal, dependency-free QR encoder in byte mode.
 *
 * A D1 share code is ASCII, so byte mode with the version-appropriate
 * character count is enough. Everything here runs offline: the matrix is
 * computed from the standard Reed-Solomon and BCH tables, no service involved.
 *
 * The block table below is the standard ISO/IEC 18004 layout, listed per
 * version as [L, M, Q, H], where each entry is either
 * `[count, totalCodewords, dataCodewords]` or the two-group form
 * `[count1, total1, data1, count2, total2, data2]`.
 */

export const EC_LEVELS = Object.freeze({ L: 0, M: 1, Q: 2, H: 3 })
export const MAX_VERSION = 40

// The two-bit level code the format information carries. It is not the table
// order above: L is 01, M is 00, Q is 11 and H is 10.
const EC_LEVEL_BITS = Object.freeze({ L: 0b01, M: 0b00, Q: 0b11, H: 0b10 })

const RS_BLOCK_TABLE = [
  [[1, 26, 19], [1, 26, 16], [1, 26, 13], [1, 26, 9]],
  [[1, 44, 34], [1, 44, 28], [1, 44, 22], [1, 44, 16]],
  [[1, 70, 55], [1, 70, 44], [2, 35, 17], [2, 35, 13]],
  [[1, 100, 80], [2, 50, 32], [2, 50, 24], [4, 25, 9]],
  [[1, 134, 108], [2, 67, 43], [2, 33, 15, 2, 34, 16], [2, 33, 11, 2, 34, 12]],
  [[2, 86, 68], [4, 43, 27], [4, 43, 19], [4, 43, 15]],
  [[2, 98, 78], [4, 49, 31], [2, 32, 14, 4, 33, 15], [4, 39, 13, 1, 40, 14]],
  [[2, 121, 97], [2, 60, 38, 2, 61, 39], [4, 40, 18, 2, 41, 19], [4, 40, 14, 2, 41, 15]],
  [[2, 146, 116], [3, 58, 36, 2, 59, 37], [4, 36, 16, 4, 37, 17], [4, 36, 12, 4, 37, 13]],
  [[2, 86, 68, 2, 87, 69], [4, 69, 43, 1, 70, 44], [6, 43, 19, 2, 44, 20], [6, 43, 15, 2, 44, 16]],
  [[4, 101, 81], [1, 80, 50, 4, 81, 51], [4, 50, 22, 4, 51, 23], [3, 36, 12, 8, 37, 13]],
  [[2, 116, 92, 2, 117, 93], [6, 58, 36, 2, 59, 37], [4, 46, 20, 6, 47, 21], [7, 42, 14, 4, 43, 15]],
  [[4, 133, 107], [8, 59, 37, 1, 60, 38], [8, 44, 20, 4, 45, 21], [12, 33, 11, 4, 34, 12]],
  [[3, 145, 115, 1, 146, 116], [4, 64, 40, 5, 65, 41], [11, 36, 16, 5, 37, 17], [11, 36, 12, 5, 37, 13]],
  [[5, 109, 87, 1, 110, 88], [5, 65, 41, 5, 66, 42], [5, 54, 24, 7, 55, 25], [11, 36, 12, 7, 37, 13]],
  [[5, 122, 98, 1, 123, 99], [7, 73, 45, 3, 74, 46], [15, 43, 19, 2, 44, 20], [3, 45, 15, 13, 46, 16]],
  [[1, 135, 107, 5, 136, 108], [10, 74, 46, 1, 75, 47], [1, 50, 22, 15, 51, 23], [2, 42, 14, 17, 43, 15]],
  [[5, 150, 120, 1, 151, 121], [9, 69, 43, 4, 70, 44], [17, 50, 22, 1, 51, 23], [2, 42, 14, 19, 43, 15]],
  [[3, 141, 113, 4, 142, 114], [3, 70, 44, 11, 71, 45], [17, 47, 21, 4, 48, 22], [9, 39, 13, 16, 40, 14]],
  [[3, 135, 107, 5, 136, 108], [3, 67, 41, 13, 68, 42], [15, 54, 24, 5, 55, 25], [15, 43, 15, 10, 44, 16]],
  [[4, 144, 116, 4, 145, 117], [17, 68, 42], [17, 50, 22, 6, 51, 23], [19, 46, 16, 6, 47, 17]],
  [[2, 139, 111, 7, 140, 112], [17, 74, 46], [7, 54, 24, 16, 55, 25], [34, 37, 13]],
  [[4, 151, 121, 5, 152, 122], [4, 75, 47, 14, 76, 48], [11, 54, 24, 14, 55, 25], [16, 45, 15, 14, 46, 16]],
  [[6, 147, 117, 4, 148, 118], [6, 73, 45, 14, 74, 46], [11, 54, 24, 16, 55, 25], [30, 46, 16, 2, 47, 17]],
  [[8, 132, 106, 4, 133, 107], [8, 75, 47, 13, 76, 48], [7, 54, 24, 22, 55, 25], [22, 45, 15, 13, 46, 16]],
  [[10, 142, 114, 2, 143, 115], [19, 74, 46, 4, 75, 47], [28, 50, 22, 6, 51, 23], [33, 46, 16, 4, 47, 17]],
  [[8, 152, 122, 4, 153, 123], [22, 73, 45, 3, 74, 46], [8, 53, 23, 26, 54, 24], [12, 45, 15, 28, 46, 16]],
  [[3, 147, 117, 10, 148, 118], [3, 73, 45, 23, 74, 46], [4, 54, 24, 31, 55, 25], [11, 45, 15, 31, 46, 16]],
  [[7, 146, 116, 7, 147, 117], [21, 73, 45, 7, 74, 46], [1, 53, 23, 37, 54, 24], [19, 45, 15, 26, 46, 16]],
  [[5, 145, 115, 10, 146, 116], [19, 75, 47, 10, 76, 48], [15, 54, 24, 25, 55, 25], [23, 45, 15, 25, 46, 16]],
  [[13, 145, 115, 3, 146, 116], [2, 74, 46, 29, 75, 47], [42, 54, 24, 1, 55, 25], [23, 45, 15, 28, 46, 16]],
  [[17, 145, 115], [10, 74, 46, 23, 75, 47], [10, 54, 24, 35, 55, 25], [19, 45, 15, 35, 46, 16]],
  [[17, 145, 115, 1, 146, 116], [14, 74, 46, 21, 75, 47], [29, 54, 24, 19, 55, 25], [11, 45, 15, 46, 46, 16]],
  [[13, 145, 115, 6, 146, 116], [14, 74, 46, 23, 75, 47], [44, 54, 24, 7, 55, 25], [59, 46, 16, 1, 47, 17]],
  [[12, 151, 121, 7, 152, 122], [12, 75, 47, 26, 76, 48], [39, 54, 24, 14, 55, 25], [22, 45, 15, 41, 46, 16]],
  [[6, 151, 121, 14, 152, 122], [6, 75, 47, 34, 76, 48], [46, 54, 24, 10, 55, 25], [2, 45, 15, 64, 46, 16]],
  [[17, 152, 122, 4, 153, 123], [29, 74, 46, 14, 75, 47], [49, 54, 24, 10, 55, 25], [24, 45, 15, 46, 46, 16]],
  [[4, 152, 122, 18, 153, 123], [13, 74, 46, 32, 75, 47], [48, 54, 24, 14, 55, 25], [42, 45, 15, 32, 46, 16]],
  [[20, 147, 117, 4, 148, 118], [40, 75, 47, 7, 76, 48], [43, 54, 24, 22, 55, 25], [10, 45, 15, 67, 46, 16]],
  [[19, 148, 118, 6, 149, 119], [18, 75, 47, 31, 76, 48], [34, 54, 24, 34, 55, 25], [20, 45, 15, 61, 46, 16]],
]

const ALIGNMENT_TABLE = [
  [], [6, 18], [6, 22], [6, 26], [6, 30], [6, 34], [6, 22, 38], [6, 24, 42],
  [6, 26, 46], [6, 28, 50], [6, 30, 54], [6, 32, 58], [6, 34, 62], [6, 26, 46, 66],
  [6, 26, 48, 70], [6, 26, 50, 74], [6, 30, 54, 78], [6, 30, 56, 82], [6, 30, 58, 86],
  [6, 34, 62, 90], [6, 28, 50, 72, 94], [6, 26, 50, 74, 98], [6, 30, 54, 78, 102],
  [6, 28, 54, 80, 106], [6, 32, 58, 84, 110], [6, 30, 58, 86, 114], [6, 34, 62, 90, 118],
  [6, 26, 50, 74, 98, 122], [6, 30, 54, 78, 102, 126], [6, 26, 52, 78, 104, 130],
  [6, 30, 56, 82, 108, 134], [6, 34, 60, 86, 112, 138], [6, 30, 58, 86, 114, 142],
  [6, 34, 62, 90, 118, 146], [6, 30, 54, 78, 102, 126, 150], [6, 24, 50, 76, 102, 128, 154],
  [6, 28, 54, 80, 106, 132, 158], [6, 32, 58, 84, 110, 136, 162], [6, 26, 54, 82, 110, 138, 166],
  [6, 30, 58, 86, 114, 142, 170],
]

/* ---------------------------------------------------------------- GF(256) */

const EXP = new Uint8Array(512)
const LOG = new Uint8Array(256)
{
  let x = 1
  for (let i = 0; i < 255; i += 1) {
    EXP[i] = x
    LOG[x] = i
    x <<= 1
    if (x & 0x100) x ^= 0x11d
  }
  for (let i = 255; i < 512; i += 1) EXP[i] = EXP[i - 255]
}

function gfMul(a, b) {
  if (a === 0 || b === 0) return 0
  return EXP[LOG[a] + LOG[b]]
}

const GENERATORS = new Map()

function generatorPolynomial(degree) {
  const cached = GENERATORS.get(degree)
  if (cached) return cached
  let poly = [1]
  for (let i = 0; i < degree; i += 1) {
    const factor = EXP[i]
    const next = new Array(poly.length + 1).fill(0)
    for (let j = 0; j < poly.length; j += 1) {
      next[j] ^= poly[j]
      next[j + 1] ^= gfMul(poly[j], factor)
    }
    poly = next
  }
  GENERATORS.set(degree, poly)
  return poly
}

function reedSolomon(data, ecLength) {
  const generator = generatorPolynomial(ecLength)
  const buffer = new Uint8Array(data.length + ecLength)
  buffer.set(data, 0)
  for (let i = 0; i < data.length; i += 1) {
    const factor = buffer[i]
    if (factor === 0) continue
    for (let j = 0; j < generator.length; j += 1) buffer[i + j] ^= gfMul(generator[j], factor)
  }
  return buffer.subarray(data.length)
}

/* ------------------------------------------------------------- capacities */

function blocksFor(version, levelIndex) {
  const spec = RS_BLOCK_TABLE[version - 1][levelIndex]
  const blocks = []
  for (let i = 0; i < spec.length; i += 3) {
    for (let n = 0; n < spec[i]; n += 1) blocks.push({ total: spec[i + 1], data: spec[i + 2] })
  }
  return blocks
}

function dataCodewords(version, levelIndex) {
  return blocksFor(version, levelIndex).reduce((sum, block) => sum + block.data, 0)
}

function charCountBits(version) {
  return version < 10 ? 8 : 16
}

/** Smallest version whose byte-mode capacity holds `byteLength`, or null. */
export function chooseVersion(byteLength, level = 'M') {
  const levelIndex = EC_LEVELS[level]
  if (levelIndex === undefined) throw new Error('qr-level-invalid')
  for (let version = 1; version <= MAX_VERSION; version += 1) {
    const capacityBits = dataCodewords(version, levelIndex) * 8
    const neededBits = 4 + charCountBits(version) + byteLength * 8
    if (neededBits <= capacityBits) return version
  }
  return null
}

/* ------------------------------------------------------------------- BCH */

function bchRemainder(value, generator, generatorBits) {
  let remainder = value
  for (let bit = 31; bit >= generatorBits - 1; bit -= 1) {
    if (((remainder >>> bit) & 1) === 1) remainder ^= generator << (bit - (generatorBits - 1))
  }
  return remainder
}

function formatInfoBits(levelBits, mask) {
  const data = (levelBits << 3) | mask
  return ((data << 10) | bchRemainder(data << 10, 0x537, 11)) ^ 0x5412
}

function versionInfoBits(version) {
  return (version << 12) | bchRemainder(version << 12, 0x1f25, 13)
}

/* ----------------------------------------------------------------- matrix */

function blankMatrix(size) {
  return Array.from({ length: size }, () => new Array(size).fill(false))
}

function reservedMatrix(size) {
  return Array.from({ length: size }, () => new Array(size).fill(false))
}

function placeFinder(modules, reserved, row, col) {
  for (let r = -1; r <= 7; r += 1) {
    for (let c = -1; c <= 7; c += 1) {
      const y = row + r
      const x = col + c
      if (y < 0 || x < 0 || y >= modules.length || x >= modules.length) continue
      const inRing = r >= 0 && r <= 6 && c >= 0 && c <= 6
      const dark = inRing && (r === 0 || r === 6 || c === 0 || c === 6 || (r >= 2 && r <= 4 && c >= 2 && c <= 4))
      modules[y][x] = dark
      reserved[y][x] = true
    }
  }
}

function placeAlignment(modules, reserved, row, col) {
  for (let r = -2; r <= 2; r += 1) {
    for (let c = -2; c <= 2; c += 1) {
      const dark = Math.abs(r) === 2 || Math.abs(c) === 2 || (r === 0 && c === 0)
      modules[row + r][col + c] = dark
      reserved[row + r][col + c] = true
    }
  }
}

function placeFunctionPatterns(version) {
  const size = version * 4 + 17
  const modules = blankMatrix(size)
  const reserved = reservedMatrix(size)

  placeFinder(modules, reserved, 0, 0)
  placeFinder(modules, reserved, 0, size - 7)
  placeFinder(modules, reserved, size - 7, 0)

  for (let i = 8; i < size - 8; i += 1) {
    const dark = i % 2 === 0
    modules[6][i] = dark
    reserved[6][i] = true
    modules[i][6] = dark
    reserved[i][6] = true
  }

  const centers = ALIGNMENT_TABLE[version - 1]
  for (const row of centers) {
    for (const col of centers) {
      const nearFinder = (row === 6 && col === 6)
        || (row === 6 && col === size - 7)
        || (row === size - 7 && col === 6)
      if (nearFinder) continue
      placeAlignment(modules, reserved, row, col)
    }
  }

  // Reserve the format strips and the dark module before data placement.
  for (let i = 0; i < 9; i += 1) {
    if (!reserved[8][i]) reserved[8][i] = true
    if (!reserved[i][8]) reserved[i][8] = true
  }
  for (let i = 0; i < 8; i += 1) {
    reserved[8][size - 1 - i] = true
    reserved[size - 1 - i][8] = true
  }
  reserved[size - 8][8] = true
  modules[size - 8][8] = true

  if (version >= 7) {
    for (let i = 0; i < 18; i += 1) {
      const row = Math.floor(i / 3)
      const col = size - 8 - 3 + (i % 3)
      reserved[row][col] = true
      reserved[col][row] = true
    }
  }

  return { modules, reserved }
}

function placeData(modules, reserved, codewords) {
  const size = modules.length
  const total = codewords.length * 8
  let bit = 0
  let upward = true
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let i = 0; i < size; i += 1) {
      const row = upward ? size - 1 - i : i
      for (let c = 0; c < 2; c += 1) {
        const col = right - c
        if (reserved[row][col]) continue
        let value = false
        if (bit < total) value = ((codewords[bit >> 3] >>> (7 - (bit & 7))) & 1) === 1
        modules[row][col] = value
        bit += 1
      }
    }
    upward = !upward
  }
}

const MASKS = [
  (row, col) => (row + col) % 2 === 0,
  (row) => row % 2 === 0,
  (_, col) => col % 3 === 0,
  (row, col) => (row + col) % 3 === 0,
  (row, col) => (Math.floor(row / 2) + Math.floor(col / 3)) % 2 === 0,
  (row, col) => ((row * col) % 2) + ((row * col) % 3) === 0,
  (row, col) => (((row * col) % 2) + ((row * col) % 3)) % 2 === 0,
  (row, col) => (((row + col) % 2) + ((row * col) % 3)) % 2 === 0,
]

/**
 * The data modules of a version, in the exact order the encoder writes them.
 * Encoder and scanner share this traversal so the two cannot drift apart.
 */
export function dataModules(version) {
  const { reserved } = placeFunctionPatterns(version)
  const size = reserved.length
  const order = []
  let upward = true
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5
    for (let i = 0; i < size; i += 1) {
      const row = upward ? size - 1 - i : i
      for (let c = 0; c < 2; c += 1) {
        const col = right - c
        if (reserved[row][col]) continue
        order.push([row, col])
      }
    }
    upward = !upward
  }
  return order
}

/** Reed-Solomon block layout for a version and level, as `{ total, data }` entries. */
export function rsBlocks(version, level) {
  const levelIndex = EC_LEVELS[level]
  if (levelIndex === undefined) throw new Error('qr-level-invalid')
  if (!Number.isInteger(version) || version < 1 || version > MAX_VERSION) throw new Error('qr-version-invalid')
  return blocksFor(version, levelIndex)
}

/** Whether mask `maskIndex` flips the module at `(row, col)`. */
export function maskApplies(maskIndex, row, col) {
  const test = MASKS[maskIndex]
  if (!test) throw new Error('qr-mask-invalid')
  return test(row, col)
}

function applyMask(modules, reserved, maskIndex) {
  const test = MASKS[maskIndex]
  for (let row = 0; row < modules.length; row += 1) {
    for (let col = 0; col < modules.length; col += 1) {
      if (!reserved[row][col] && test(row, col)) modules[row][col] = !modules[row][col]
    }
  }
}

function placeFormatInfo(modules, levelBits, maskIndex) {
  const size = modules.length
  const bits = formatInfoBits(levelBits, maskIndex)
  for (let i = 0; i < 15; i += 1) {
    const dark = ((bits >> i) & 1) === 1
    if (i < 6) modules[i][8] = dark
    else if (i < 8) modules[i + 1][8] = dark
    else modules[size - 15 + i][8] = dark
  }
  for (let i = 0; i < 15; i += 1) {
    const dark = ((bits >> i) & 1) === 1
    if (i < 8) modules[8][size - i - 1] = dark
    else if (i < 9) modules[8][15 - i - 1 + 1] = dark
    else modules[8][15 - i - 1] = dark
  }
  modules[size - 8][8] = true
}

function placeVersionInfo(modules, version) {
  if (version < 7) return
  const size = modules.length
  const bits = versionInfoBits(version)
  for (let i = 0; i < 18; i += 1) {
    const dark = ((bits >> i) & 1) === 1
    modules[Math.floor(i / 3)][(i % 3) + size - 8 - 3] = dark
    modules[(i % 3) + size - 8 - 3][Math.floor(i / 3)] = dark
  }
}

/* ---------------------------------------------------------------- penalty */

function penalty(modules) {
  const size = modules.length
  let score = 0

  const runScore = (line) => {
    let total = 0
    let run = 1
    for (let i = 1; i < line.length; i += 1) {
      if (line[i] === line[i - 1]) run += 1
      else {
        if (run >= 5) total += 3 + (run - 5)
        run = 1
      }
    }
    if (run >= 5) total += 3 + (run - 5)
    return total
  }

  for (let row = 0; row < size; row += 1) score += runScore(modules[row])
  for (let col = 0; col < size; col += 1) {
    score += runScore(modules.map((line) => line[col]))
  }

  for (let row = 0; row < size - 1; row += 1) {
    for (let col = 0; col < size - 1; col += 1) {
      const value = modules[row][col]
      if (value === modules[row][col + 1] && value === modules[row + 1][col] && value === modules[row + 1][col + 1]) score += 3
    }
  }

  const finderLike = [true, false, true, true, true, false, true, false, false, false, false]
  const reversed = [...finderLike].reverse()
  const matches = (line, at, pattern) => pattern.every((value, offset) => line[at + offset] === value)
  const patternScore = (line) => {
    let total = 0
    for (let i = 0; i + 11 <= line.length; i += 1) {
      if (matches(line, i, finderLike) || matches(line, i, reversed)) total += 40
    }
    return total
  }
  for (let row = 0; row < size; row += 1) score += patternScore(modules[row])
  for (let col = 0; col < size; col += 1) score += patternScore(modules.map((line) => line[col]))

  const dark = modules.reduce((sum, line) => sum + line.filter(Boolean).length, 0)
  const percent = (dark * 100) / (size * size)
  score += Math.floor(Math.abs(percent - 50) / 5) * 10

  return score
}

/* -------------------------------------------------------------- public API */

function utf8(text) {
  if (typeof TextEncoder === 'function') return new TextEncoder().encode(text)
  const bytes = []
  for (const char of text) {
    const code = char.codePointAt(0)
    if (code < 0x80) bytes.push(code)
    else if (code < 0x800) bytes.push(0xc0 | (code >> 6), 0x80 | (code & 0x3f))
    else if (code < 0x10000) bytes.push(0xe0 | (code >> 12), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
    else bytes.push(0xf0 | (code >> 18), 0x80 | ((code >> 12) & 0x3f), 0x80 | ((code >> 6) & 0x3f), 0x80 | (code & 0x3f))
  }
  return Uint8Array.from(bytes)
}

function buildCodewords(version, levelIndex, data) {
  const blocks = blocksFor(version, levelIndex)
  const capacity = blocks.reduce((sum, block) => sum + block.data, 0)
  const bits = []
  const push = (value, length) => {
    for (let i = length - 1; i >= 0; i -= 1) bits.push((value >>> i) & 1)
  }

  push(0b0100, 4)
  push(data.length, charCountBits(version))
  for (const byte of data) push(byte, 8)

  const capacityBits = capacity * 8
  for (let i = 0; i < 4 && bits.length < capacityBits; i += 1) bits.push(0)
  while (bits.length % 8 !== 0) bits.push(0)

  const dataCodewordBytes = []
  for (let i = 0; i < bits.length; i += 8) {
    let byte = 0
    for (let j = 0; j < 8; j += 1) byte = (byte << 1) | bits[i + j]
    dataCodewordBytes.push(byte)
  }
  let pad = 0
  while (dataCodewordBytes.length < capacity) {
    dataCodewordBytes.push(pad % 2 === 0 ? 0xec : 0x11)
    pad += 1
  }

  const dataBlocks = []
  const ecBlocks = []
  let offset = 0
  for (const block of blocks) {
    const chunk = Uint8Array.from(dataCodewordBytes.slice(offset, offset + block.data))
    offset += block.data
    dataBlocks.push(chunk)
    ecBlocks.push(reedSolomon(chunk, block.total - block.data))
  }

  const result = []
  const maxData = Math.max(...dataBlocks.map((block) => block.length))
  for (let i = 0; i < maxData; i += 1) {
    for (const block of dataBlocks) if (i < block.length) result.push(block[i])
  }
  const maxEc = Math.max(...ecBlocks.map((block) => block.length))
  for (let i = 0; i < maxEc; i += 1) {
    for (const block of ecBlocks) if (i < block.length) result.push(block[i])
  }
  return Uint8Array.from(result)
}

/**
 * Encode `text` as a QR symbol.
 * @returns `{ version, size, level, mask, modules }` where `modules` is an
 * array of `size` strings of `0`/`1`, row by row, without the quiet zone.
 */
export function encodeQr(text, { level = 'M' } = {}) {
  if (typeof text !== 'string' || text.length === 0) throw new Error('qr-text-invalid')
  const levelIndex = EC_LEVELS[level]
  if (levelIndex === undefined) throw new Error('qr-level-invalid')
  const data = utf8(text)
  const version = chooseVersion(data.length, level)
  if (version === null) throw new Error('qr-too-long')

  const codewords = buildCodewords(version, levelIndex, data)
  const { modules: base, reserved } = placeFunctionPatterns(version)
  placeData(base, reserved, codewords)

  let best = null
  for (let mask = 0; mask < 8; mask += 1) {
    const candidate = base.map((line) => [...line])
    applyMask(candidate, reserved, mask)
    placeFormatInfo(candidate, EC_LEVEL_BITS[level], mask)
    placeVersionInfo(candidate, version)
    const score = penalty(candidate)
    if (best === null || score < best.score) best = { score, mask, modules: candidate }
  }

  return {
    version,
    size: best.modules.length,
    level,
    mask: best.mask,
    modules: best.modules.map((line) => line.map((value) => (value ? '1' : '0')).join('')),
  }
}

/** Render a matrix as a standalone SVG string (used by tests and the CLI). */
export function qrToSvg({ size, modules }, { margin = 4, moduleSize = 4 } = {}) {
  const extent = (size + margin * 2) * moduleSize
  const path = []
  for (let row = 0; row < size; row += 1) {
    for (let col = 0; col < size; col += 1) {
      if (modules[row][col] !== '1') continue
      const x = (col + margin) * moduleSize
      const y = (row + margin) * moduleSize
      path.push(`M${x} ${y}h${moduleSize}v${moduleSize}h-${moduleSize}z`)
    }
  }
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${extent} ${extent}" width="${extent}" height="${extent}" shape-rendering="crispEdges">`
    + `<rect width="${extent}" height="${extent}" fill="#ffffff"/>`
    + `<path d="${path.join('')}" fill="#000000"/></svg>`
}
