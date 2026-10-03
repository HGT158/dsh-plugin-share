import assert from 'node:assert/strict'
import test from 'node:test'
import { collectEntries } from '../src/host/collect.mjs'
import { applyPreview, previewEntries, selectPreview } from '../src/host/import.mjs'
import { apply, inject } from '../src/host/dsh.mjs'

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

test('applyPreview restores builtin state and does not remove upgrades on failure', async () => {
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
    { name: 'old', version: '2.0.0' },
    { name: 'broken', version: '1.0.0' },
  ], { installed: [
    { name: 'official', enabled: true },
    { name: 'old', version: '1.0.0' },
  ] })
  const result = await applyPreview(preview, manager)
  assert.equal(result.ok, false)
  assert.equal(result.error, 'registry-down')
  assert.deepEqual(calls, [
    ['enabled', 'official', false],
    ['install', 'old@2.0.0'],
    ['install', 'broken@1.0.0'],
    ['enabled', 'official', true],
  ])
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
function registerRoute({ rejection }) {
  let handler = null
  const asked = []
  const ctx = {
    connection: {
      requestRejection(request) {
        asked.push(request.headers)
        return rejection
      },
    },
    pluginManager: {
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
