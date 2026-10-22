import assert from 'node:assert/strict'
import test from 'node:test'
import { collectEntries } from '../src/host/collect.mjs'
import { applyPreview, previewEntries, selectPreview } from '../src/host/import.mjs'
import { apply, inject } from '../src/host/dsh.mjs'
import { encodeCode, decodeCode } from '../src/host/codec.mjs'

test('collector exports portable removable bundles and optional builtins', () => {
  const result = collectEntries({
    dependencies: {
      'dsh-pocket': '2.10.6',
      'dsh-market': 'github:owner/repo#v1',
      'local-plugin': 'file:../local-plugin',
    },
    bundles: [
      { name: 'dsh-pocket', installed: true, removable: true, enabled: true },
      { name: 'dsh-market', installed: true, removable: true, enabled: false },
      { name: 'official-experimental', optional: true, installed: false, enabled: true },
      { name: 'core', installed: true, removable: false },
      { name: 'local-plugin', installed: true, removable: true },
    ],
  })
  assert.deepEqual(result.entries, [
    { kind: 'npm', value: 'dsh-pocket', version: '2.10.6', enabled: true },
    { kind: 'github', value: 'github:owner/repo#v1', version: null, enabled: false },
    { kind: 'builtin', value: 'official-experimental', version: null, enabled: true },
  ])
  assert.equal(result.skipped[0].reason, 'dependency-spec-not-portable')
})

test('collector refuses unsupported remote and alias dependency specs', () => {
  const result = collectEntries({
    dependencies: {
      'git-plugin': 'git+https://github.com/acme/plugin.git#v1',
      'alias-plugin': 'npm:other-plugin@1.0.0',
    },
    bundles: [
      { name: 'git-plugin', installed: true, removable: true },
      { name: 'alias-plugin', installed: true, removable: true },
    ],
  })
  assert.deepEqual(result.entries, [])
  assert.deepEqual(result.skipped.map(({ name, reason }) => ({ name, reason })), [
    { name: 'git-plugin', reason: 'dependency-spec-not-portable' },
    { name: 'alias-plugin', reason: 'dependency-spec-unsupported' },
  ])
})

test('collector pins the resolved bundle version over a manifest range', () => {
  const result = collectEntries({
    dependencies: { 'range-plugin': '^1.0.0' },
    bundles: [{ name: 'range-plugin', version: '1.4.2', installed: true, removable: true, enabled: true }],
  })
  assert.deepEqual(result.entries, [{ kind: 'npm', value: 'range-plugin', version: '1.4.2', enabled: true }])
})

test('collector accepts the name@range source listBundles reports for npm bundles', () => {
  // The Host synthesizes dependencies from listBundles, whose source field is
  // `name@range`; that must not be confused with an unsupported install spec.
  const result = collectEntries({
    dependencies: {
      'dsh-pocket': 'dsh-pocket@2.10.6',
      '@liustack/modlens': '@liustack/modlens@3.26.6',
    },
    bundles: [
      { name: 'dsh-pocket', version: '2.10.6', installed: true, removable: true, enabled: true },
      { name: '@liustack/modlens', version: '3.26.6', installed: true, removable: true, enabled: true },
    ],
  })
  assert.deepEqual(result.entries, [
    { kind: 'npm', value: 'dsh-pocket', version: '2.10.6', enabled: true },
    { kind: 'npm', value: '@liustack/modlens', version: '3.26.6', enabled: true },
  ])
  assert.deepEqual(result.skipped, [])
})

test('collector exports only enabled optional builtins', () => {
  const result = collectEntries({
    bundles: [
      { name: 'off-by-default', optional: true, installed: false, enabled: false },
      { name: 'opt-in', optional: true, installed: false, enabled: true },
    ],
  })
  assert.deepEqual(result.entries, [{ kind: 'builtin', value: 'opt-in', version: null, enabled: true }])
})

test('collector pins spaced npm ranges without weakening the wire format', () => {
  const bundle = { name: '@scope/pkg', source: '@scope/pkg@>=1 <2 || >=3 <4', version: '3.2.1', installed: true, removable: true }
  assert.deepEqual(collectEntries({ bundles: [bundle] }).entries, [
    { kind: 'npm', value: '@scope/pkg', version: '3.2.1', enabled: true },
  ])
  assert.equal(collectEntries({ bundles: [bundle], pin: false }).entries[0].version, null)
  const unresolved = collectEntries({ bundles: [{ ...bundle, version: undefined }] })
  assert.deepEqual(unresolved.entries, [])
  assert.equal(unresolved.skipped[0].reason, 'dependency-version-unresolved')
  for (const source of ['@scope/pkg@npm:other@1', '@scope/pkg@file:../local', '@scope/pkg@https://example.test/pkg.tgz', '@scope/pkg@>=1\n<2']) {
    assert.equal(collectEntries({ bundles: [{ ...bundle, source }] }).entries.length, 0, source)
  }
})

test('collector consistently resolves missing and empty bundle fields', () => {
  const bundles = [
    { name: 'plain', version: '1.2.3' },
    { name: 'resolved', resolvedVersion: '2.3.4' },
    { name: 'range', spec: '', source: 'range@^3', version: '', resolvedVersion: '3.4.5' },
    { name: '', id: '@scope/fallback', dependency: '@scope/fallback@^4', resolvedVersion: '4.5.6', active: false },
    { name: 'repo', spec: ' ', source: 'github:owner/repo#main', resolvedVersion: '5.6.7' },
  ].map((bundle) => ({ installed: true, removable: true, ...bundle }))
  const result = collectEntries({ bundles, dependencies: { range: '' } })
  assert.deepEqual(result.skipped, [])
  assert.deepEqual(result.entries, [
    { kind: 'npm', value: 'plain', version: '1.2.3', enabled: true },
    { kind: 'npm', value: 'resolved', version: '2.3.4', enabled: true },
    { kind: 'npm', value: 'range', version: '3.4.5', enabled: true },
    { kind: 'npm', value: '@scope/fallback', version: '4.5.6', enabled: false },
    { kind: 'github', value: 'github:owner/repo#main', version: '5.6.7', enabled: true },
  ])
})

test('preview marks same version skip and old version upgrade', () => {
  const preview = previewEntries([
    { name: 'same', version: '1.0.0' },
    { name: 'old', version: '2.0.0' },
    { spec: 'github:owner/repo#v1' },
  ], { installed: [
    { name: 'same', version: '1.0.0' },
    { name: 'old', version: '1.0.0' },
  ] })
  assert.deepEqual(preview.map((row) => row.action), ['skip', 'upgrade', 'install'])
  assert.equal(preview[1].verdict.ok, false)
  assert.equal(preview[1].verdict.reason, 'manual-update-required')
})

test('preview treats a versionless entry as manual once that plugin is installed', () => {
  // A null version means "follow the latest release". Once the package is
  // present the host cannot tell whether the installed copy is current, so the
  // row becomes a manual update instead of a silent skip. A missing package
  // still installs normally.
  const installed = [
    { name: 'pkg', source: 'pkg@1.0.0', version: '1.0.0', enabled: true },
    { name: 'repo', source: 'github:owner/repo#main', version: '1.0.0', enabled: true },
  ]
  const [npmInstalled] = previewEntries([{ name: 'pkg' }], { installed })
  assert.equal(npmInstalled.action, 'upgrade')
  assert.equal(npmInstalled.verdict.ok, false)
  assert.equal(npmInstalled.verdict.reason, 'manual-update-required')
  assert.equal(npmInstalled.manualSpec, 'pkg')
  assert.equal(npmInstalled.current.name, 'pkg')

  const [githubInstalled] = previewEntries([{ spec: 'github:owner/repo#main' }], { installed })
  assert.equal(githubInstalled.action, 'upgrade')
  assert.equal(githubInstalled.verdict.ok, false)
  assert.equal(githubInstalled.verdict.reason, 'manual-update-required')
  assert.equal(githubInstalled.manualSpec, 'repo@github:owner/repo#main')

  const [npmMissing] = previewEntries([{ name: 'missing-pkg' }])
  assert.equal(npmMissing.action, 'install')
  const [githubMissing] = previewEntries([{ spec: 'github:owner/missing#main' }])
  assert.equal(githubMissing.action, 'install')
})

test('preview recognizes a GitHub bundle recorded by listBundles source', () => {
  // listBundles() reports the recorded spec as `source`, not `spec`; without
  // this match an already-installed GitHub plugin would look like a new install.
  const preview = previewEntries(
    [{ spec: 'github:owner/repo#v1', version: '0.3.17', enabled: true }],
    { installed: [{ name: 'repo', source: 'github:owner/repo#v1', version: '0.3.17', enabled: true }] },
  )
  assert.equal(preview[0].action, 'skip')
})

test('preview matches GitHub repository identity while keeping refs distinct', () => {
  const installed = [{ name: 'repo', spec: '', source: 'repo@github:Owner/Repo#main', resolvedVersion: '1.2.3', enabled: true }]
  const [same, changed] = previewEntries([
    { spec: 'github:owner/repo#main', version: '1.2.3' },
    { spec: 'github:owner/repo#v2', version: '1.2.3' },
  ], { installed })
  assert.equal(same.action, 'skip')
  assert.equal(changed.current.name, 'repo')
  assert.equal(changed.action, 'upgrade')
  assert.equal(changed.verdict.reason, 'manual-update-required')
  assert.equal(changed.manualSpec, 'repo@github:owner/repo#v2')
})

test('preview refuses ambiguous GitHub matches and prefers a unique exact ref', () => {
  const installed = [
    { name: 'first', source: 'github:owner/repo#v1', version: '1.0.0' },
    { name: 'second', source: 'github:owner/repo#v2', version: '2.0.0' },
  ]
  const [exact, ambiguous] = previewEntries([
    { spec: 'github:owner/repo#v2', version: '2.0.0' },
    { spec: 'github:owner/repo#v3', version: '3.0.0' },
  ], { installed })
  assert.equal(exact.current.name, 'second')
  assert.equal(exact.action, 'skip')
  assert.equal(ambiguous.current, undefined)
  assert.equal(ambiguous.verdict.reason, 'installed-source-ambiguous')
})

test('preview requires manual replacement when a same-name package has another source', () => {
  for (const source of ['github:owner/pkg#v1', 'file:../pkg', 'pkg@npm:other@1']) {
    const [row] = previewEntries([{ name: 'pkg', version: '1.0.0' }], {
      installed: [{ name: 'pkg', source, version: '1.0.0', enabled: true }],
    })
    assert.equal(row.action, 'upgrade', source)
    assert.equal(row.verdict.reason, 'manual-update-required', source)
  }
  const [missing] = previewEntries([{ name: 'pkg', version: '1.0.0' }], {
    installed: [{ name: 'pkg', version: '1.0.0', installed: false }],
  })
  assert.equal(missing.action, 'install')
})

test('preview applies an enabled-state change without reinstalling', () => {
  const preview = previewEntries([
    { name: 'same', version: '1.0.0', enabled: false },
  ], { installed: [
    { name: 'same', version: '1.0.0', enabled: true },
  ] })
  assert.equal(preview[0].action, 'set-enabled')
})

test('preview keeps a stable index so one row can be applied alone', () => {
  const preview = previewEntries([
    { name: 'first', version: '1.0.0' },
    { name: 'second', version: '1.0.0' },
    { name: 'third', version: '1.0.0' },
  ])
  assert.deepEqual(preview.map((row) => row.index), [0, 1, 2])
  assert.deepEqual(selectPreview(preview, [1]).map((row) => row.entry.value), ['second'])
  assert.deepEqual(selectPreview(preview, undefined).map((row) => row.index), [0, 1, 2])
  assert.deepEqual(selectPreview(preview, []).length, 0)
  assert.deepEqual(selectPreview(preview, [1, 1, 99, -1]).map((row) => row.index), [1])
})

test('applying a selected preview touches only that row', async () => {
  const calls = []
  const manager = {
    async installBundle(spec) { calls.push(spec); return { installed: true } },
    async removeBundle(spec) { calls.push(`remove:${spec}`) },
  }
  const preview = previewEntries([
    { name: 'keep', version: '1.0.0' },
    { name: 'chosen', version: '2.0.0' },
    { name: 'later', version: '3.0.0' },
  ])
  const result = await applyPreview(selectPreview(preview, [1]), manager)
  assert.equal(result.ok, true)
  assert.deepEqual(calls, ['chosen@2.0.0'])
  assert.deepEqual(result.report.map((row) => row.status), ['installed'])
})

test('applyPreview stops on build approval and rolls back new installs', async () => {
  const calls = []
  const manager = {
    async installBundle(spec) {
      calls.push(['install', spec])
      if (spec === 'needs-build@1.0.0') return { pendingBuilds: ['needs-build'] }
      return { installed: true }
    },
    async removeBundle(spec) { calls.push(['remove', spec]) },
  }
  const preview = previewEntries([{ name: 'first', version: '1.0.0' }, { name: 'needs-build', version: '1.0.0' }])
  const result = await applyPreview(preview, manager)
  assert.equal(result.ok, false)
  assert.equal(result.error, 'build-approval-required')
  assert.deepEqual(calls, [['install', 'first@1.0.0'], ['install', 'needs-build@1.0.0'], ['remove', 'first']])
})

test('applyPreview restores builtin state on failure', async () => {
  const calls = []
  const manager = {
    async setBundleEnabled(name, enabled) {
      calls.push(['enabled', name, enabled])
    },
    async installBundle(spec) {
      calls.push(['install', spec])
      if (spec === 'broken@1.0.0') throw new Error('registry-down')
      return { installed: true }
    },
    async removeBundle(spec) { calls.push(['remove', spec]) },
  }
  const preview = previewEntries([
    { name: 'official', kind: 'builtin', enabled: false },
    { name: 'broken', version: '1.0.0' },
  ], { installed: [
    { name: 'official', enabled: true },
  ] })
  const result = await applyPreview(preview, manager)
  assert.equal(result.ok, false)
  assert.equal(result.error, 'registry-down')
  assert.deepEqual(calls, [
    ['enabled', 'official', false],
    ['install', 'broken@1.0.0'],
    ['enabled', 'official', true],
  ])
})

test('applyPreview uses the installed GitHub package name for enablement and rollback', async () => {
  const calls = []
  const preview = previewEntries([
    { spec: 'github:owner/repo#main', version: '1.2.3', enabled: false },
    { name: 'broken', version: '1.0.0' },
  ], { installed: [{ name: 'actual-package-name', source: 'github:owner/repo#main', version: '1.2.3', enabled: true }] })
  const result = await applyPreview(preview, {
    async setBundleEnabled(name, enabled) {
      assert.equal(name, 'actual-package-name')
      calls.push([name, enabled])
      return { application: 'applied' }
    },
    async installBundle() { throw new Error('registry-down') },
  })
  assert.equal(result.error, 'registry-down')
  assert.deepEqual(calls, [['actual-package-name', false], ['actual-package-name', true]])
  assert.deepEqual(result.rollback, [{ spec: 'actual-package-name', enabled: true, ok: true }])
})

test('applyPreview blocks updates before any selected row changes and still allows other single rows', async () => {
  const calls = []
  const manager = {
    async installBundle(spec) { calls.push(spec); return { application: 'applied' } },
    async removeBundle(name) { calls.push(`remove:${name}`) },
  }
  const preview = previewEntries([
    { name: 'new-plugin', version: '1.0.0' },
    { name: 'old', version: '2.0.0' },
  ], { installed: [{ name: 'old', source: 'old@1.0.0', version: '1.0.0' }] })
  // Even a preview built by an older caller must never route an upgrade to
  // installBundle (the real live manager would reject it as already-installed).
  preview[1].verdict = { ok: true, kind: 'npm' }
  const blocked = await applyPreview(preview, manager)
  assert.equal(blocked.error, 'manual-update-required')
  assert.deepEqual(blocked.report, [])
  assert.deepEqual(calls, [])
  assert.equal((await applyPreview(selectPreview(preview, [0]), manager)).ok, true)
  assert.deepEqual(calls, ['new-plugin@1.0.0'])
})

test('applyPreview blocks a versionless entry that matches an installed plugin', async () => {
  const calls = []
  const preview = previewEntries([
    { name: 'pkg' },
    { spec: 'github:owner/repo#main' },
  ], { installed: [
    { name: 'pkg', source: 'pkg@1.0.0', version: '1.0.0' },
    { name: 'repo', source: 'github:owner/repo#main', version: '1.0.0' },
  ] })
  const result = await applyPreview(preview, {
    async installBundle(spec) { calls.push(spec); return { application: 'applied' } },
    async removeBundle() { calls.push('remove') },
  })
  assert.equal(result.ok, false)
  assert.equal(result.error, 'manual-update-required')
  assert.deepEqual(result.report, [])
  assert.deepEqual(result.rollback, [])
  assert.deepEqual(calls, [])
})

test('applyPreview reports a failed enablement rollback rather than claiming success', async () => {
  const preview = previewEntries([
    { name: 'pkg', version: '1.0.0', enabled: false },
    { name: 'broken', version: '1.0.0' },
  ], { installed: [{ name: 'pkg', version: '1.0.0', enabled: true }] })
  const result = await applyPreview(preview, {
    async setBundleEnabled(_name, enabled) { return enabled ? { application: 'failed', error: { code: 'restore-failed' } } : { application: 'applied' } },
    async installBundle() { throw new Error('install-failed') },
  })
  assert.equal(result.rollback[0].ok, false)
  assert.equal(result.rollback[0].reason, 'restore-failed')
})

test('applyPreview treats manager failure results as failed imports', async () => {
  const preview = previewEntries([{ name: 'broken', version: '1.0.0' }])
  const result = await applyPreview(preview, {
    async installBundle() {
      return { application: 'failed', error: { code: 'network' }, pendingBuilds: [] }
    },
  })
  assert.equal(result.ok, false)
  assert.equal(result.error, 'network')
  assert.equal(result.operation.application, 'failed')
})

/** Minimal ServerResponse stand-in: only what the host half touches. */
function fakeResponse() {
  return {
    statusCode: 0,
    headersSent: false,
    headers: {},
    writeHead(status, headers) {
      this.statusCode = status
      this.headersSent = true
      Object.assign(this.headers, headers ?? {})
      return this
    },
    setHeader(name, value) {
      this.headers[name] = value
    },
    end(body) {
      this.body = body ?? ''
      return this
    },
  }
}

/** Register the plugin against a fake context and hand back the route handler. */
function registerRoute({ rejection, manager }) {
  let handler = null
  const asked = []
  const ctx = {
    connection: {
      requestRejection(request) {
        asked.push(request.headers)
        return rejection
      },
    },
    pluginManager: manager ?? {
      listBundles() {
        throw new Error('the plugin manager must not be reached before the trust fence')
      },
    },
    effect(callback) {
      callback()
    },
    webServer: {
      register(route) {
        handler = route.handler
        return () => {}
      },
    },
  }
  apply(ctx)
  return { handler, asked }
}

test('routes are registered behind the connection trust fence', async () => {
  const { handler, asked } = registerRoute({ rejection: 401 })
  assert.equal(typeof handler, 'function')
  const response = fakeResponse()
  await handler({ method: 'GET', url: '/api/plugin-share/state', headers: { host: 'evil.example' } }, response)
  // The refusal owns the response and nothing downstream ran.
  assert.equal(response.statusCode, 401)
  assert.equal(response.body, '')
  assert.deepEqual(asked, [{ host: 'evil.example' }])
})

test('export and parse routes use the same bundle normalization as the collector', async () => {
  const bundles = [
    { name: '@scope/pkg', source: '@scope/pkg@>=1 <2', resolvedVersion: '1.2.3', enabled: true },
    { name: 'repo', spec: '', dependency: 'github:owner/repo#main', resolvedVersion: '2.3.4', active: false },
    { name: 'fallback', resolvedVersion: '3.4.5', enabled: true },
  ].map((bundle) => ({ installed: true, removable: true, ...bundle }))
  const { handler } = registerRoute({ manager: { listBundles: () => bundles } })
  const exported = fakeResponse()
  await handler({ method: 'POST', url: '/api/plugin-share/export', headers: {}, async *[Symbol.asyncIterator]() {} }, exported)
  assert.equal(exported.statusCode, 200)
  const result = JSON.parse(exported.body)
  assert.deepEqual(result.skipped, [])
  assert.deepEqual(decodeCode(result.code).entries.map(({ kind, name, spec, version, enabled }) => ({
    kind, value: name ?? spec, version, enabled,
  })), collectEntries({ bundles }).entries)
  const parsed = fakeResponse()
  await handler({ method: 'POST', url: '/api/plugin-share/parse', headers: {}, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ code: result.code })) } }, parsed)
  assert.equal(parsed.statusCode, 200)
  assert.deepEqual(JSON.parse(parsed.body).preview.map((row) => row.action), ['skip', 'skip', 'skip'])
})

test('import route preflights manual updates before invoking the manager', async () => {
  const calls = []
  const { handler } = registerRoute({ manager: {
    listBundles: () => [{ name: 'old', source: 'old@1.0.0', version: '1.0.0' }],
    installBundle: (...args) => { calls.push(args); throw new Error('must-not-install') },
  } })
  const code = encodeCode([{ name: 'new-plugin', version: '1.0.0' }, { name: 'old', version: '2.0.0' }])
  const response = fakeResponse()
  await handler({ method: 'POST', url: '/api/plugin-share/import', headers: {}, async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify({ code, confirm: true })) } }, response)
  assert.equal(response.statusCode, 409)
  assert.equal(JSON.parse(response.body).error, 'manual-update-required')
  assert.deepEqual(calls, [])
})

test('export preview lists portable entries and selected export preserves only their versions and states', async () => {
  const bundles = [
    { name: 'one', source: 'one@1.0.0', version: '1.0.0', enabled: false },
    { name: 'two', source: 'github:owner/two#main', version: '2.0.0', enabled: true },
    { name: 'local', source: 'link:./local', version: '1.0.0', enabled: true },
  ].map((bundle) => ({ installed: true, removable: true, ...bundle }))
  const { handler } = registerRoute({ manager: { listBundles: () => bundles } })
  const invoke = async (action, body) => {
    const res = fakeResponse()
    await handler({ method: 'POST', url: `/api/plugin-share/${action}`, headers: {},
      async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)) } }, res)
    return { status: res.statusCode, ...JSON.parse(res.body) }
  }
  const preview = await invoke('export-preview', {})
  assert.equal(preview.entries.length, 2)
  assert.equal(preview.skipped.length, 1)
  assert.equal(preview.code, undefined)
  for (const entry of preview.entries) {
    const exported = await invoke('export', { entries: [entry] })
    const decoded = decodeCode(exported.code).entries
    assert.equal(decoded.length, 1)
    assert.equal(decoded[0].name ?? decoded[0].spec, entry.value)
    assert.equal(decoded[0].version, entry.version)
    assert.equal(decoded[0].enabled, entry.enabled)
  }
  assert.equal((await invoke('export', { entries: [] })).ok, false)
  assert.equal((await invoke('export', { entries: 'invalid' })).status, 400)
  const guarded = registerRoute({ rejection: 401 }).handler
  const refused = fakeResponse()
  await guarded({ method: 'POST', url: '/api/plugin-share/export-preview', headers: {} }, refused)
  assert.equal(refused.statusCode, 401)
})

test('an admitted caller reaches the share routes', async () => {
  const { handler } = registerRoute({ rejection: undefined })
  const response = fakeResponse()
  // Async-iterable so the route can read an (empty) body, exactly as it does
  // for a real request.
  const request = {
    method: 'POST',
    url: '/api/plugin-share/no-such-action',
    headers: { host: '127.0.0.1:19388' },
    async *[Symbol.asyncIterator]() {},
  }
  await handler(request, response)
  assert.equal(response.statusCode, 404)
  assert.equal(JSON.parse(response.body).error, 'route-not-found')
})

test('the host half declares the connection dependency it fences with', () => {
  assert.ok(inject.includes('connection'), 'connection must be injected, not read opportunistically')
  assert.ok(inject.includes('webServer'))
  assert.ok(inject.includes('pluginManager'))
})

test('import receipts, cancellation and the writer lock share the same host job', async () => {
  let releasePreview
  let installs = 0
  const cancelled = []
  const { handler } = registerRoute({ manager: {
    listBundles: () => new Promise((resolve) => { releasePreview = () => resolve([]) }),
    installBundle: () => { installs += 1; return { application: 'applied' } },
    cancelInstall: (id) => { cancelled.push(id); return true },
  } })
  const invoke = async (action, body) => {
    const res = fakeResponse()
    await handler({ method: 'POST', url: `/api/plugin-share/${action}`, headers: {},
      async *[Symbol.asyncIterator]() { yield Buffer.from(JSON.stringify(body)) } }, res)
    return { status: res.statusCode, ...JSON.parse(res.body) }
  }
  const body = { code: encodeCode([{ name: 'fixture', version: '1.0.0' }]), confirm: true, requestId: 'job-one', only: [0] }
  const first = invoke('import', body)
  await new Promise((resolve) => setImmediate(resolve))
  const duplicate = invoke('import', body)
  assert.equal((await invoke('import', { ...body, requestId: 'job-two' })).error, 'import-busy')
  assert.equal((await invoke('import-status', { requestId: 'job-one' })).state, 'running')
  assert.equal((await invoke('cancel', { requestId: 'job-one' })).cancelRequested, true)
  releasePreview()
  const result = await first
  assert.equal(result.state, 'finished')
  assert.equal(result.error, 'import-cancelled')
  assert.deepEqual(await duplicate, result)
  assert.equal((await invoke('import-status', { requestId: 'job-one' })).error, 'import-cancelled')
  assert.equal((await invoke('import-status', { requestId: 'missing' })).state, 'unknown')
  assert.deepEqual(cancelled, ['job-one'])
  assert.equal(installs, 0)
})

test('job receipt and cancellation endpoints remain behind the trust fence', async () => {
  const { handler } = registerRoute({ rejection: 401 })
  for (const action of ['import-status', 'cancel']) {
    const res = fakeResponse()
    await handler({ method: 'POST', url: `/api/plugin-share/${action}`, headers: {},
      async *[Symbol.asyncIterator]() { throw new Error('must not read unauthenticated bodies') } }, res)
    assert.equal(res.statusCode, 401)
  }
})

test('an approval retry that still requests builds must not count as an installation', async () => {
  const preview = previewEntries([{ name: 'build-fixture', version: '1.0.0' }])
  const result = await applyPreview(preview, {
    installBundle: () => ({ pendingBuilds: ['another-build'] }),
  }, { approvedBuilds: ['first-build'] })
  assert.equal(result.ok, false)
  assert.equal(result.error, 'build-approval-required')
  assert.deepEqual(result.pendingBuilds, ['another-build'])
  assert.deepEqual(result.report, [])
})
