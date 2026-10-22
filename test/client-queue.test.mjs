import assert from 'node:assert/strict'
import test from 'node:test'

let mod
globalThis.window = { __ModuleLoader__: { load: (value) => { mod = value } } }
await import('../src/client.js')
const { createImportQueue, createResultHistory } = mod.factory(() => ({}))
const tick = () => new Promise((resolve) => setImmediate(resolve))
const finished = (extra = {}) => ({ ok: true, state: 'finished', report: [], ...extra })
const rows = Array.from({ length: 4 }, (_, index) => ({ index,
  entry: { kind: 'npm', value: `plugin-${index}`, version: '1.0.0' },
  spec: `plugin-${index}@1.0.0`, action: 'install', verdict: { ok: true } }))

function deferred() {
  let resolve
  const promise = new Promise((done) => { resolve = done })
  return { promise, resolve }
}

function harness(options) {
  const calls = []
  const queue = createImportQueue((path, body) => {
    const pending = deferred()
    calls.push({ path, body, ...pending })
    return pending.promise
  }, options)
  queue.configure('D1original', rows)
  return { queue, calls }
}

test('rapid enqueue keeps FIFO order, deduplicates, and allows removing waiting items', async () => {
  const { queue, calls } = harness()
  queue.enqueue([0], queue.snapshot().code)
  queue.enqueue([2, 2, 1, 0], queue.snapshot().code)
  assert.deepEqual(queue.snapshot().waiting, [2, 1])
  assert.equal(calls.length, 1)
  assert.equal(queue.configure('D1replacement', rows), false)
  queue.remove(2)
  queue.enqueue([3], queue.snapshot().code)
  calls[0].resolve(finished())
  await tick()
  assert.deepEqual(calls.map((call) => call.body.only), [[0], [1]])
  assert.equal(calls[1].body.code, 'D1original')
  calls[1].resolve(finished())
  await tick()
  assert.deepEqual(calls[2].body.only, [3])
  calls[2].resolve(finished())
  await tick()
  assert.deepEqual(queue.snapshot().done, [0, 1, 3])
  assert.equal(queue.locked(), false)
})

test('queue-all excludes refused, manual, current, completed and already queued rows', async () => {
  const { queue, calls } = harness()
  queue.configure('code', [rows[0], { ...rows[1], action: 'upgrade' },
    { ...rows[2], verdict: { ok: false } }, { ...rows[3], action: 'skip' }])
  queue.enqueue([0, 1, 2, 3, 99], queue.snapshot().code)
  queue.enqueue([0, 1, 2, 3], queue.snapshot().code)
  assert.deepEqual(queue.snapshot().waiting, [])
  calls[0].resolve(finished())
  await tick()
  queue.enqueue([0], queue.snapshot().code)
  assert.equal(calls.length, 1)
})

test('enqueue rejects a mismatched or missing share code without dispatching or changing the queue', async () => {
  const { queue, calls } = harness()
  assert.equal(queue.enqueue([0], 'D1different'), false)
  assert.equal(queue.enqueue([0]), false)
  assert.deepEqual(queue.snapshot().waiting, [])
  assert.equal(queue.snapshot().current, null)
  assert.equal(calls.length, 0)
  assert.equal(queue.enqueue([1], 'D1original'), true)
  assert.equal(calls[0].body.code, 'D1original')
  assert.deepEqual(calls[0].body.only, [1])
  calls[0].resolve(finished())
  await tick()
})

test('failure pauses without undoing completed items; retry uses a fresh request id', async () => {
  const { queue, calls } = harness()
  queue.enqueue([0, 1, 2], queue.snapshot().code)
  calls[0].resolve(finished())
  await tick()
  calls[1].resolve(finished({ ok: false, error: 'download-failed' }))
  await tick()
  assert.equal(queue.snapshot().phase, 'paused')
  assert.deepEqual(queue.snapshot().done, [0])
  assert.deepEqual(queue.snapshot().waiting, [2])
  assert.equal(calls.length, 2)
  queue.retry()
  assert.notEqual(calls[2].body.requestId, calls[1].body.requestId)
  assert.deepEqual(calls[2].body.only, [1])
  calls[2].resolve(finished())
  await tick()
  calls[3].resolve(finished())
  await tick()
  assert.deepEqual(queue.snapshot().done, [0, 1, 2])
  assert.deepEqual(queue.snapshot().history.items.map((item) => item.outcome), ['success', 'failed', 'success', 'success'])
  assert.equal(queue.snapshot().history.items[1].reason, 'download-failed')
  queue.configure('new-code', rows)
  assert.equal(queue.snapshot().history.items.length, 4)
})

test('script approval pauses and applies only to the approved row', async () => {
  const { queue, calls } = harness()
  queue.enqueue([0, 1], queue.snapshot().code)
  calls[0].resolve(finished({ ok: false, pendingBuilds: ['build-dependency'] }))
  await tick()
  queue.retry()
  assert.equal(calls.length, 1)
  queue.retry(['build-dependency'])
  assert.deepEqual(calls[1].body.approvedBuilds, ['build-dependency'])
  calls[1].resolve(finished())
  await tick()
  assert.equal(calls[2].body.approvedBuilds, undefined)
  calls[2].resolve(finished())
  await tick()
})

test('skipping a failed row resumes the remaining queue and preserves its error', async () => {
  const { queue, calls } = harness()
  queue.enqueue([0, 1], queue.snapshot().code)
  calls[0].resolve(finished({ ok: false, error: 'bad-package' }))
  await tick()
  queue.skip()
  assert.deepEqual(calls[1].body.only, [1])
  calls[1].resolve(finished())
  await tick()
  assert.equal(queue.snapshot().errors[0].error, 'bad-package')
  assert.deepEqual(queue.snapshot().done, [1])
})

test('a timeout waits for a finished host receipt before starting the next row', async () => {
  const wait = deferred()
  const { queue, calls } = harness({ wait: () => wait.promise })
  queue.enqueue([0, 1], queue.snapshot().code)
  calls[0].resolve({ ok: false, error: 'request-timeout' })
  await tick()
  assert.equal(calls[1].path, 'import-status')
  calls[1].resolve({ ok: true, state: 'running' })
  await tick()
  assert.equal(calls.length, 2)
  assert.equal(queue.snapshot().phase, 'checking')
  wait.resolve()
  await tick()
  calls[2].resolve(finished())
  await tick()
  assert.equal(calls[3].path, 'import')
  assert.deepEqual(calls[3].body.only, [1])
  calls[3].resolve(finished())
  await tick()
})

test('an unknown result locks the code and reconnects with the same request id and body', async () => {
  const { queue, calls } = harness()
  queue.enqueue([0, 1], queue.snapshot().code)
  calls[0].resolve({ ok: false, error: 'connection-lost' })
  await tick()
  calls[1].resolve({ state: 'unknown' })
  await tick()
  queue.skip()
  queue.retry()
  assert.equal(queue.snapshot().phase, 'uncertain')
  assert.equal(queue.configure('changed', rows), false)
  queue.reconnect()
  assert.deepEqual(calls[2].body, calls[0].body)
  calls[2].resolve(finished())
  await tick()
  calls[3].resolve(finished())
  await tick()
})

test('cancel waits for settlement and never starts the next queued install', async () => {
  const { queue, calls } = harness()
  queue.enqueue([0, 1, 2], queue.snapshot().code)
  const cancellation = queue.cancel()
  // The host may already have settled cancellation while the import reply is
  // still in transit. That receipt is not a failure of the cancel request.
  calls[1].resolve(finished({ ok: false, error: 'install-cancelled' }))
  await cancellation
  assert.equal(queue.snapshot().cancelError, '')
  assert.equal(queue.snapshot().phase, 'running')
  assert.equal(calls.length, 2)
  calls[0].resolve(finished({ ok: false, error: 'install-cancelled' }))
  await tick()
  assert.equal(queue.snapshot().phase, 'paused')
  assert.equal(calls.length, 2)
  queue.clearWaiting()
  queue.skip()
  assert.equal(queue.locked(), false)
  assert.equal(queue.snapshot().history.items[0].outcome, 'cancelled')
})

test('history survives a new queue, bounds records, deduplicates receipts and stores only public summaries', () => {
  const data = new Map()
  const storage = () => ({ getItem: (key) => data.get(key), setItem: (key, value) => data.set(key, value) })
  const history = createResultHistory(storage)
  const record = { label: 'plugin', spec: 'plugin@1.0.0', at: new Date().toISOString(),
    action: 'install', outcome: 'failed', enabled: true, reason: 'network-failed', diagnostic: 'secret-output', code: 'D1secret' }
  for (let i = 0; i < 102; i += 1) history.add({ ...record, id: String(i) })
  history.add({ ...record, id: '101' })
  const queue = createImportQueue(() => {}, { history: createResultHistory(storage) })
  assert.equal(queue.snapshot().history.items.length, 100)
  assert.equal(queue.snapshot().history.items[0].id, '2')
  assert.equal(queue.snapshot().history.storageWarning, false)
  assert.doesNotMatch([...data.values()][0], /secret-output|D1secret/)
  queue.clearHistory()
  assert.deepEqual(createResultHistory(storage).snapshot().items, [])
})

test('blocked storage or damaged history never prevents queue operations', async () => {
  const broken = createResultHistory(() => { throw new Error('denied') })
  const { queue, calls } = harness({ history: broken })
  queue.enqueue([0], queue.snapshot().code)
  calls[0].resolve(finished())
  await tick()
  assert.equal(queue.locked(), false)
  assert.equal(queue.snapshot().history.items.length, 1)
  assert.equal(queue.snapshot().history.storageWarning, true)
  assert.deepEqual(createResultHistory(() => ({ getItem: () => '{bad json' })).snapshot().items, [])
  assert.deepEqual(createResultHistory(() => ({ getItem: () => JSON.stringify({ version: 1, items: [null, {}, { outcome: 'success' }] }) })).snapshot().items, [])
})

test('history keeps a useful package error code without persisting its diagnostic', async () => {
  const { queue, calls } = harness()
  queue.enqueue([0], queue.snapshot().code)
  calls[0].resolve(finished({ ok: false, error: 'operation-error', operation: { application: 'failed',
    error: { diagnostic: 'Error: ERR_PNPM_FETCH_404\nprivate diagnostic content' } } }))
  await tick()
  assert.equal(queue.snapshot().history.items[0].reason, 'ERR_PNPM_FETCH_404')
  assert.doesNotMatch(JSON.stringify(queue.snapshot().history), /private diagnostic content/)
})

test('a cancel racing with success keeps that success and pauses before the next row', async () => {
  const { queue, calls } = harness()
  queue.enqueue([0, 1], queue.snapshot().code)
  const cancellation = queue.cancel()
  calls[0].resolve(finished({ report: [{ result: { application: 'restart-required' } }] }))
  calls[1].resolve({ ok: true })
  await cancellation
  await tick()
  assert.deepEqual(queue.snapshot().done, [0])
  assert.equal(queue.snapshot().current, null)
  assert.equal(queue.snapshot().phase, 'paused')
  assert.equal(queue.snapshot().restartRequired, true)
  queue.skip()
  assert.deepEqual(calls[2].body.only, [1])
  calls[2].resolve(finished())
  await tick()
})

test('unsubscribing a settings view leaves the queue running and a new view receives its state', async () => {
  const { queue, calls } = harness()
  const states = []
  const unsubscribe = queue.subscribe((value) => states.push(value))
  queue.enqueue([0, 1], queue.snapshot().code)
  unsubscribe()
  const count = states.length
  calls[0].resolve(finished())
  await tick()
  assert.equal(states.length, count)
  let restored
  const close = queue.subscribe((value) => { restored = value })
  assert.equal(restored.current.index, 1)
  assert.deepEqual(restored.done, [0])
  queue.clearWaiting()
  calls[1].resolve(finished())
  await tick()
  close()
})
