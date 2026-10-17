/** Normalize the public bundle record once for collection and import. */
function firstText(...values) {
  return values.find((value) => typeof value === 'string' && value.trim() !== '') ?? null
}

export function bundleName(bundle) {
  return firstText(bundle?.name, bundle?.id, bundle?.packageName)
}

export function bundleVersion(bundle) {
  return firstText(bundle?.version, bundle?.resolvedVersion)
}

export function bundleEnabled(bundle) {
  if (typeof bundle?.enabled === 'boolean') return bundle.enabled
  if (typeof bundle?.active === 'boolean') return bundle.active
  return undefined
}

/** A manifest stores a range; listBundles may prefix it with the package name. */
export function dependencyRange(name, raw) {
  if (firstText(raw) === null) return null
  const prefix = `${name}@`
  return raw.startsWith(prefix) ? raw.slice(prefix.length) : raw
}

export function bundleSource(bundle) {
  return dependencyRange(bundleName(bundle), firstText(bundle?.spec, bundle?.source, bundle?.dependency))
}

/** Classify recorded registry ranges/tags without accepting aliases or URLs. */
export function isRegistryRange(value) {
  return typeof value === 'string' && /^[0-9A-Za-z.*+<>=^~|_ -]+$/u.test(value)
}
