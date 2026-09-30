import { installSpec, normalizeEntries, classifySpec } from '../shared/entries.mjs'

function nameOf(entry) {
  return entry.value
}

function installedName(bundle) {
  return bundle?.name ?? bundle?.id ?? bundle?.packageName ?? null
}

function installedVersion(bundle) {
  return bundle?.version ?? bundle?.resolvedVersion ?? null
}

function installedEnabled(bundle) {
  return bundle?.enabled ?? bundle?.active
}

/** Build a preview without touching the filesystem or package manager. */
export function previewEntries(entries, { installed = [] } = {}) {
  if (!Array.isArray(installed)) throw new TypeError('installed must be an array')
  const normalized = normalizeEntries(entries)
  return normalized.map((entry) => {
    const spec = installSpec(entry)
    const verdict = entry.kind === 'github' ? classifySpec(entry.value) : { ok: true, kind: entry.kind === 'builtin' ? 'builtin' : 'npm' }
    const current = installed.find((bundle) => installedName(bundle) === nameOf(entry) || bundle?.spec === spec)
    let action = entry.kind === 'builtin' ? 'set-enabled' : 'install'
    if (current) {
      if (entry.kind === 'builtin') {
        action = installedEnabled(current) === entry.enabled ? 'skip' : 'set-enabled'
      } else if (entry.version && installedVersion(current) === entry.version) {
        action = installedEnabled(current) === undefined || installedEnabled(current) === entry.enabled ? 'skip' : 'set-enabled'
      } else if (entry.kind !== 'builtin') {
        action = 'upgrade'
      }
    }
    return { entry, spec, verdict, current, action }
  })
}

/**
 * Install a preview serially. A failure stops the transaction and attempts to
 * remove only bundles installed by this call.
 */
export async function applyPreview(preview, manager, { requestId = undefined, approvedBuilds = undefined, signal } = {}) {
  if (!manager || typeof manager !== 'object') throw new TypeError('plugin manager is required')
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
        result = await manager.setBundleEnabled(row.entry.value, row.entry.enabled)
        if (result?.application === 'failed') {
          throw Object.assign(new Error(result.error?.code ?? 'bundle-enable-failed'), { code: result.error?.code ?? 'bundle-enable-failed', result })
        }
        const previousEnabled = installedEnabled(row.current)
        if (typeof previousEnabled === 'boolean' && previousEnabled !== row.entry.enabled) {
          completed.push({ type: 'builtin', row, previousEnabled })
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
        // A new install can be removed safely. An upgrade replaces an existing
        // bundle and is left in place because removeBundle would be destructive.
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
            await manager.setBundleEnabled(item.row.entry.value, item.previousEnabled)
            rollback.push({ spec: item.row.entry.value, enabled: item.previousEnabled, ok: true })
          }
        } catch (rollbackError) {
          const spec = item.type === 'install' ? (item.target ?? item.row.entry.value) : item.row.entry.value
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
