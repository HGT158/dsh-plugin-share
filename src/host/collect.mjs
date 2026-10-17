import { normalizeEntry } from '../shared/entries.mjs'
import { bundleName, bundleVersion, bundleEnabled, bundleSource, dependencyRange, isRegistryRange } from './bundles.mjs'

const LOCAL_OR_REMOTE_RE = /^(?:link:|file:|portal:|workspace:|https?:\/\/|git(?:\+(?:https?|ssh))?:\/\/|git@|ssh:\/\/|(?:\.\.?)[\\/]|[A-Za-z]:[\\/])/iu

function dependencyFor(name, dependencies) {
  if (!dependencies || typeof dependencies !== 'object') return null
  return Object.prototype.hasOwnProperty.call(dependencies, name) ? dependencies[name] : null
}

function portableDependency(bundle, dependencies) {
  const name = bundleName(bundle)
  const declared = dependencyRange(name, dependencyFor(name, dependencies))
  if (declared !== null) return declared
  const spec = bundleSource(bundle)
  if (spec !== null) return spec
  // listBundles() intentionally returns a compact public record and does not
  // repeat package.json dependencies. An npm name plus its resolved version is
  // still a deterministic portable install spec in that case.
  return bundleVersion(bundle)
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
    const enabled = bundleEnabled(bundle) ?? true
    if (bundle.optional === true && bundle.installed !== true) {
      // Only an enabled optional builtin carries state worth sharing: the
      // default is off, so exporting every available experimental bundle would
      // fill the code with rows that change nothing on the receiving side.
      if (includeOptional && enabled) {
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
      const version = bundleVersion(bundle)
      // Spaced manifest ranges are portable when a resolved version can be
      // pinned (or pinning is off). Never put whitespace into the wire format.
      if (pin && !version && isRegistryRange(spec) && spec.includes(' ')) {
        skipped.push({ name, spec, reason: 'dependency-version-unresolved' })
        continue
      }
      const input = spec.startsWith('github:')
        ? { spec, version: pin ? version : null, enabled }
        : isRegistryRange(spec)
          ? { name, version: pin ? (version ?? spec) : null, enabled }
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
