import { normalizeEntry } from '../shared/entries.mjs'

const LOCAL_OR_REMOTE_RE = /^(?:link:|file:|portal:|workspace:|https?:\/\/|git(?:\+(?:https?|ssh))?:\/\/|git@|ssh:\/\/|(?:\.\.?)[\\/]|[A-Za-z]:[\\/])/iu

function dependencyFor(name, dependencies) {
  if (!dependencies || typeof dependencies !== 'object') return null
  return Object.prototype.hasOwnProperty.call(dependencies, name) ? dependencies[name] : null
}

function portableDependency(bundle, dependencies) {
  const declared = dependencyFor(bundleName(bundle), dependencies)
  if (typeof declared === 'string' && declared) return declared
  const spec = bundle?.spec ?? bundle?.source ?? bundle?.dependency
  if (typeof spec === 'string' && spec) return spec
  // listBundles() intentionally returns a compact public record and does not
  // repeat package.json dependencies. An npm name plus its resolved version is
  // still a deterministic portable install spec in that case.
  const name = bundleName(bundle)
  const version = bundle?.version ?? bundle?.resolvedVersion
  if (typeof name === 'string' && typeof version === 'string' && version) return `${name}@${version}`
  return null
}

function bundleName(bundle) {
  return bundle?.name ?? bundle?.id ?? bundle?.packageName ?? null
}

/**
 * Turn pluginManager.listBundles() plus profile dependencies into public D1
 * entries. The collector never reads patch/config/credential files.
 */
export function collectEntries({ bundles, dependencies = {}, includeOptional = true, pin = true } = {}) {
  if (!Array.isArray(bundles)) throw new TypeError('bundles must be an array')
  const entries = []
  const skipped = []
  for (const bundle of bundles) {
    const name = bundleName(bundle)
    if (typeof name !== 'string' || !name) {
      skipped.push({ name: null, reason: 'bundle-name-missing' })
      continue
    }
    const enabled = bundle.enabled !== false && bundle.active !== false
    if (bundle.optional === true && bundle.installed !== true) {
      if (includeOptional) {
        try { entries.push(normalizeEntry({ name, kind: 'builtin', enabled })) } catch (error) { skipped.push({ name, reason: error.code ?? 'builtin-invalid' }) }
      }
      continue
    }
    if (bundle.installed !== true || bundle.removable === false) continue

    const spec = portableDependency(bundle, dependencies)
    if (typeof spec !== 'string' || !spec) {
      skipped.push({ name, reason: 'dependency-spec-missing' })
      continue
    }
    if (LOCAL_OR_REMOTE_RE.test(spec)) {
      skipped.push({ name, reason: 'dependency-spec-not-portable', spec })
      continue
    }
    try {
      const input = spec.startsWith('github:')
        ? { spec, version: pin ? (bundle.version ?? null) : null, enabled }
        : isVersionLike(spec)
          ? { name, version: pin ? (bundle.version ?? spec) : null, enabled }
          : null
      if (!input) {
        skipped.push({ name, reason: 'dependency-spec-unsupported', spec })
        continue
      }
      entries.push(normalizeEntry(input))
    } catch (error) {
      skipped.push({ name, spec, reason: error.code ?? 'entry-invalid' })
    }
  }
  return { entries, skipped }
}

function isVersionLike(value) {
  return /^[0-9A-Za-z.*+<>=^~|_-]+$/u.test(value) && !value.includes('/')
}
