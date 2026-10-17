import { installSpec, normalizeEntries, classifySpec } from '../shared/entries.mjs'
import { bundleName, bundleVersion, bundleEnabled, bundleSource, isRegistryRange } from './bundles.mjs'

function githubSource(spec) {
  const source = classifySpec(spec)
  if (!source.ok || source.kind !== 'github') return null
  return { repository: `${source.owner}/${source.repo}`.toLowerCase(), ref: source.ref }
}

function findCurrent(entry, installed) {
  if (entry.kind !== 'github') {
    const matches = installed.filter((bundle) => bundleName(bundle) === entry.value
      && (entry.kind === 'builtin' || bundle.installed !== false))
    return { current: matches.length === 1 ? matches[0] : undefined, ambiguous: matches.length > 1 }
  }
  const wanted = githubSource(entry.value)
  const matches = installed.filter((bundle) => bundle?.installed !== false
    && githubSource(bundleSource(bundle))?.repository === wanted.repository)
  const exact = matches.filter((bundle) => githubSource(bundleSource(bundle)).ref === wanted.ref)
  const candidates = exact.length > 0 ? exact : matches
  return { current: candidates.length === 1 ? candidates[0] : undefined, ambiguous: candidates.length > 1 }
}

function sameSource(entry, current) {
  const source = bundleSource(current)
  if (entry.kind === 'github') {
    const wanted = githubSource(entry.value)
    const existing = githubSource(source)
    return existing?.repository === wanted.repository && existing.ref === wanted.ref
  }
  return source === null || isRegistryRange(source)
}

/** Build a preview without touching the filesystem or package manager. */
export function previewEntries(entries, { installed = [] } = {}) {
  if (!Array.isArray(installed)) throw new TypeError('installed must be an array')
  const normalized = normalizeEntries(entries)
  return normalized.map((entry, index) => {
    const spec = installSpec(entry)
    let verdict = entry.kind === 'github' ? classifySpec(entry.value) : { ok: true, kind: entry.kind === 'builtin' ? 'builtin' : 'npm' }
    const { current, ambiguous } = findCurrent(entry, installed)
    let action = entry.kind === 'builtin' ? 'set-enabled' : 'install'
    if (current) {
      if (entry.kind === 'builtin') {
        action = bundleEnabled(current) === entry.enabled ? 'skip' : 'set-enabled'
      } else if (sameSource(entry, current) && entry.version && bundleVersion(current) === entry.version) {
        action = bundleEnabled(current) === undefined || bundleEnabled(current) === entry.enabled ? 'skip' : 'set-enabled'
      } else if (entry.kind !== 'builtin') {
        action = 'upgrade'
      }
    }
    // DSH's live installBundle API rejects already-installed packages and has
    // no non-destructive update operation. Refuse before changing any rows.
    if (action === 'upgrade') verdict = { ...verdict, ok: false, reason: 'manual-update-required' }
    if (ambiguous) verdict = { ...verdict, ok: false, reason: 'installed-source-ambiguous' }
    // pnpm needs the dependency name on GitHub replacements; a bare GitHub
    // shortcut can otherwise be interpreted as a new dependency name.
    const manualSpec = action === 'upgrade' && entry.kind === 'github' ? `${bundleName(current)}@${spec}` : spec
    return { index, entry, spec, verdict, current, action, ...(action === 'upgrade' ? { manualSpec } : {}) }
  })
}

/**
 * Keep the preview rows a caller selected by their stable preview index.
 * Omitting `only` selects every row, so a whole-code import stays the default.
 */
export function selectPreview(preview, only) {
  if (!Array.isArray(preview)) throw new TypeError('preview must be an array')
  if (only === undefined || only === null) return preview.slice()
  if (!Array.isArray(only)) throw new TypeError('only must be an array')
  const wanted = new Set(only.filter((value) => Number.isInteger(value) && value >= 0 && value < preview.length))
  return preview.filter((row, index) => wanted.has(Number.isInteger(row?.index) ? row.index : index))
}

/**
 * Install a preview serially. A failure stops the transaction and attempts to
 * remove only bundles installed by this call.
 */
export async function applyPreview(preview, manager, { requestId = undefined, approvedBuilds = undefined, signal } = {}) {
  if (!manager || typeof manager !== 'object') throw new TypeError('plugin manager is required')
  const blocked = preview.find((row) => row.action === 'upgrade' || row.verdict?.reason === 'installed-source-ambiguous')
  if (blocked) {
    return { ok: false, error: blocked.verdict?.reason ?? 'manual-update-required', report: [], rollback: [] }
  }
  const completed = []
  const report = []
  try {
    for (const row of preview) {
      if (signal?.aborted) throw Object.assign(new Error('import-cancelled'), { code: 'import-cancelled' })
      if (!row.verdict.ok) {
        report.push({ row, status: 'refused', reason: row.verdict.reason })
        continue
      }
      if (row.action === 'skip') {
        report.push({ row, status: 'skipped' })
        continue
      }
      let result
      if (row.action === 'set-enabled') {
        if (typeof manager.setBundleEnabled !== 'function') throw new Error('setBundleEnabled-unavailable')
        const target = bundleName(row.current) ?? row.entry.value
        result = await manager.setBundleEnabled(target, row.entry.enabled)
        if (result?.application === 'failed') {
          throw Object.assign(new Error(result.error?.code ?? 'bundle-enable-failed'), { code: result.error?.code ?? 'bundle-enable-failed', result })
        }
        const previousEnabled = bundleEnabled(row.current)
        if (typeof previousEnabled === 'boolean' && previousEnabled !== row.entry.enabled) {
          completed.push({ type: 'enabled', row, target, previousEnabled })
        }
      } else {
        if (typeof manager.installBundle !== 'function') throw new Error('installBundle-unavailable')
        result = await manager.installBundle(row.spec, {
          enabled: row.entry.enabled,
          requestId,
          ...(approvedBuilds === undefined ? {} : { approvedBuilds }),
        })
        if (result?.pendingBuilds?.length && approvedBuilds === undefined) {
          throw Object.assign(new Error('build-approval-required'), { code: 'build-approval-required', pendingBuilds: result.pendingBuilds })
        }
        if (result?.application === 'failed' || result?.application === 'cancelled') {
          const code = result.application === 'cancelled'
            ? 'install-cancelled'
            : result.error?.code ?? result.packageResult?.kind ?? 'bundle-install-failed'
          throw Object.assign(new Error(code), { code, result })
        }
        // Only packages newly installed by this transaction may be removed.
        if (row.action === 'install') completed.push({ type: 'install', row, target: result?.bundle ?? row.entry.value })
      }
      report.push({ row, status: row.action === 'set-enabled' ? 'enabled' : 'installed', result })
    }
    return { ok: true, report }
  } catch (error) {
    const rollback = []
    if (typeof manager.removeBundle === 'function' || typeof manager.setBundleEnabled === 'function') {
      for (const item of completed.reverse()) {
        try {
          if (item.type === 'install') {
            // removeBundle takes the installed package name, not an npm
            // version range or a GitHub install spec.
            const target = item.target ?? item.row.entry.value
            await manager.removeBundle(target)
            rollback.push({ spec: target, ok: true })
          } else if (typeof manager.setBundleEnabled === 'function') {
            const restored = await manager.setBundleEnabled(item.target, item.previousEnabled)
            if (restored?.application === 'failed') throw new Error(restored.error?.code ?? 'bundle-enable-failed')
            rollback.push({ spec: item.target, enabled: item.previousEnabled, ok: true })
          }
        } catch (rollbackError) {
          const spec = item.target ?? item.row.entry.value
          rollback.push({ spec, ok: false, reason: rollbackError.message })
        }
      }
    }
    return {
      ok: false,
      error: error.code ?? error.message,
      pendingBuilds: error.pendingBuilds,
      operation: error.result,
      report,
      rollback,
    }
  }
}
