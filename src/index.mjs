export {
  MAGIC,
  FORMAT_VERSION,
  MAX_FRAME_BYTES,
  DEFLATE_MIN_ENTRIES,
  encodeCode,
  decodeCode,
  decodeCodeOrThrow,
  classifySpec,
  normalizeEntries,
  installSpec,
} from './host/codec.mjs'

export {
  KINDS,
  normalizeEntry,
  validatePackageName,
  validateVersion,
  validateGithubSpec,
} from './shared/entries.mjs'

export { collectEntries } from './host/collect.mjs'
export { previewEntries, applyPreview, selectPreview } from './host/import.mjs'
export { encodeQr, chooseVersion, qrToSvg, dataModules, rsBlocks, maskApplies, EC_LEVELS, MAX_VERSION } from './shared/qr.mjs'
export { scanQrImage } from './shared/qr-scan.mjs'
export { apply, inject } from './host/dsh.mjs'
