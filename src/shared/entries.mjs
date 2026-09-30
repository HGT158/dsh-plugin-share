/**
 * Canonical DSH plugin-share entries.
 *
 * The wire format only carries these fields. Configuration, credentials,
 * comments and arbitrary package-manager options are deliberately rejected.
 */

export const KINDS = Object.freeze({
  npm: 0,
  github: 1,
  builtin: 2,
})

export const MAX_VALUE_LENGTH = 512
export const MAX_VERSION_LENGTH = 256

const PACKAGE_NAME_RE = /^(?:@[A-Za-z0-9!~*'()._-]+\/)?[A-Za-z0-9!~*'()._-]+$/u
const GITHUB_RE = /^github:([A-Za-z0-9_.-]+)\/([A-Za-z0-9_.-]+)(?:#([^\s\u0000-\u001f\u007f]+))?$/u
const VERSION_RE = /^[0-9A-Za-z.*+<>=^~|_-]+$/u
const FORBIDDEN_SPEC_RE = /^(?:link:|file:|portal:|workspace:|(?:\.\.?)[\\/]|[A-Za-z]:[\\/]|https?:\/\/)/iu

function invalid(message, code = 'invalid-entry') {
  const error = new TypeError(message)
  error.code = code
  throw error
}

function validateText(value, label, max) {
  if (typeof value !== 'string' || value.length === 0 || value.length > max) {
    invalid(`${label} must be a non-empty string of at most ${max} characters`, `${label}-invalid`)
  }
  if (/[^\x20-\x7e]/u.test(value) || /\s/u.test(value)) {
    invalid(`${label} must not contain whitespace or control characters`, `${label}-unsafe`)
  }
}

export function validatePackageName(name) {
  validateText(name, 'package name', MAX_VALUE_LENGTH)
  if (!PACKAGE_NAME_RE.test(name)) invalid(`invalid npm package name: ${name}`, 'name-invalid')
  return name
}

export function validateVersion(version) {
  if (version === null || version === undefined) return null
  validateText(version, 'version', MAX_VERSION_LENGTH)
  if (!VERSION_RE.test(version)) invalid(`unsupported version expression: ${version}`, 'version-invalid')
  return version
}

export function validateGithubSpec(spec) {
  validateText(spec, 'GitHub spec', MAX_VALUE_LENGTH)
  const match = GITHUB_RE.exec(spec)
  if (!match) invalid(`invalid GitHub spec: ${spec}`, 'github-invalid')
  return { spec, owner: match[1], repo: match[2], ref: match[3] ?? null }
}

function splitNpmSpec(raw) {
  if (raw.startsWith('@')) {
    const slash = raw.indexOf('/')
    const at = slash >= 0 ? raw.indexOf('@', slash) : -1
    return at > 0 ? [raw.slice(0, at), raw.slice(at + 1)] : [raw, null]
  }
  const at = raw.lastIndexOf('@')
  return at > 0 ? [raw.slice(0, at), raw.slice(at + 1)] : [raw, null]
}

/** Classify a user/package-manager spec before it reaches an installer. */
export function classifySpec(raw) {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > MAX_VALUE_LENGTH) {
    return { ok: false, kind: null, reason: 'spec-empty-or-too-long' }
  }
  if (FORBIDDEN_SPEC_RE.test(raw)) {
    return { ok: false, kind: null, reason: 'spec-is-not-portable' }
  }
  if (raw.startsWith('github:')) {
    try {
      const github = validateGithubSpec(raw)
      return { ok: true, kind: 'github', ...github }
    } catch (error) {
      return { ok: false, kind: 'github', reason: error.code ?? 'github-invalid' }
    }
  }
  const [name, version] = splitNpmSpec(raw)
  try {
    validatePackageName(name)
    validateVersion(version)
    return { ok: true, kind: 'npm', name, version: version ?? null }
  } catch (error) {
    return { ok: false, kind: 'npm', reason: error.code ?? 'spec-invalid' }
  }
}

const ALLOWED_KEYS = new Set(['kind', 'source', 'name', 'spec', 'version', 'enabled', 'optional'])

/** Normalize supported API inputs into the compact wire-model. */
export function normalizeEntry(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) invalid('each plugin must be an object')
  for (const key of Object.keys(input)) {
    if (!ALLOWED_KEYS.has(key)) invalid(`unsupported plugin field: ${key}`, 'unsupported-field')
  }

  const source = input.kind ?? input.source ?? (input.optional === true ? 'builtin' : null)
  const enabled = input.enabled === undefined ? true : input.enabled
  if (typeof enabled !== 'boolean') invalid('enabled must be boolean', 'enabled-invalid')
  if (input.optional !== undefined && typeof input.optional !== 'boolean') invalid('optional must be boolean', 'optional-invalid')
  if (input.kind !== undefined && input.source !== undefined && input.kind !== input.source) invalid('kind and source must match', 'source-mismatch')
  if (input.optional === true && source !== 'builtin') invalid('optional entry must be builtin', 'source-mismatch')

  if (source === 'builtin' || input.optional === true) {
    if (input.spec !== undefined) invalid('builtin entry cannot have a spec', 'builtin-spec')
    const name = input.name
    validatePackageName(name)
    if (input.version !== undefined && input.version !== null) invalid('builtin entry cannot have a version', 'builtin-version')
    return { kind: 'builtin', value: name, version: null, enabled }
  }

  if (input.spec !== undefined) {
    if (typeof input.spec !== 'string') invalid('spec must be a string', 'spec-invalid')
    if (input.spec.startsWith('github:')) {
      if (source !== null && source !== 'github') invalid('source does not match GitHub spec', 'source-mismatch')
      validateGithubSpec(input.spec)
      const version = validateVersion(input.version ?? null)
      return { kind: 'github', value: input.spec, version, enabled }
    }
    if (FORBIDDEN_SPEC_RE.test(input.spec)) invalid(`unsupported or unsafe spec: ${input.spec}`, 'spec-not-portable')
    if (source !== null && source !== 'npm') invalid('source does not match npm spec', 'source-mismatch')
    const [nameFromSpec, versionFromSpec] = splitNpmSpec(input.spec)
    const name = input.name ?? nameFromSpec
    const version = input.version ?? versionFromSpec
    if (input.name !== undefined && input.name !== nameFromSpec) invalid('name does not match spec', 'name-mismatch')
    if (input.version !== undefined && versionFromSpec !== null && input.version !== versionFromSpec) invalid('version does not match spec', 'version-mismatch')
    validatePackageName(name)
    return { kind: 'npm', value: name, version: validateVersion(version ?? null), enabled }
  }

  if (source !== null && source !== 'npm') invalid('npm entry requires name or spec', 'name-required')
  validatePackageName(input.name)
  return { kind: 'npm', value: input.name, version: validateVersion(input.version ?? null), enabled }
}

export function normalizeEntries(entries) {
  if (!Array.isArray(entries)) invalid('plugins must be an array', 'plugins-invalid')
  if (entries.length === 0) invalid('plugins must not be empty', 'plugins-empty')
  if (entries.length > 512) invalid('too many plugins', 'plugins-too-many')
  return entries.map(normalizeEntry)
}

export function installSpec(entry) {
  if (entry.kind === 'builtin') return entry.value
  if (entry.kind === 'github') return entry.value
  return entry.version ? `${entry.value}@${entry.version}` : entry.value
}
