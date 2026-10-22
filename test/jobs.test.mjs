import assert from 'node:assert/strict'
import test from 'node:test'
import { createImportJobs } from '../src/host/jobs.mjs'

test('host reserves before preview, deduplicates running requests and replays finished receipts', async () => {
  const jobs = createImportJobs()
  let finish
  let writes = 0
  const operation = async () => { writes += 1; return new Promise((resolve) => { finish = resolve }) }
  const first = jobs.run('first', 'same', operation)
  const duplicate = jobs.run('first', 'same', operation)
  assert.equal(first, duplicate)
  assert.equal((await jobs.run('other', 'other', operation)).error, 'import-busy')
  assert.equal((await jobs.run('first', 'different', operation)).error, 'request-id-conflict')
  assert.equal(jobs.status('first').state, 'running')
  finish({ ok: true })
  const result = await first
  assert.equal(result.state, 'finished')
  assert.equal(await jobs.run('first', 'same', operation), result)
  assert.equal(writes, 1)
})

test('cancellation is latched before the operation starts, and failure releases the writer', async () => {
  const jobs = createImportJobs()
  const first = jobs.run('first', 'a', async (signal) => {
    assert.equal(signal.aborted, true)
    throw new Error('import-cancelled')
  })
  jobs.cancel('first')
  assert.equal((await first).error, 'import-cancelled')
  assert.equal(jobs.status('first').state, 'finished')
  assert.equal((await jobs.run('second', 'b', () => ({ ok: true }))).ok, true)
  assert.equal(jobs.cancel('missing'), null)
})

test('only the bounded number of most recent completed receipts is retained', async () => {
  const jobs = createImportJobs({ maxCompleted: 2 })
  for (const id of ['one', 'two', 'three']) await jobs.run(id, id, () => ({ ok: true }))
  assert.equal(jobs.status('one'), null)
  assert.equal(jobs.status('two').state, 'finished')
  assert.equal(jobs.status('three').state, 'finished')
})
