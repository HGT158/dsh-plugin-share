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
export { apply, inject } from './host/dsh.mjs'
