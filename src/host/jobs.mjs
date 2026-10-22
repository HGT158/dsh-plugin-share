/** One writer per host half, with bounded receipts for reconnecting clients. */
export function createImportJobs({ maxCompleted = 100 } = {}) {
  const jobs = new Map()
  let active = null

  const status = (requestId) => {
    const job = jobs.get(requestId)
    if (!job) return null
    return job.result ?? { ok: true, requestId, state: 'running' }
  }

  return {
    status,
    cancel(requestId) {
      const job = jobs.get(requestId)
      if (!job) return null
      if (!job.result) job.controller.abort()
      return status(requestId)
    },
    run(requestId, fingerprint, operation) {
      const existing = jobs.get(requestId)
      if (existing) {
        return existing.fingerprint === fingerprint
          ? existing.promise
          : Promise.resolve({ ok: false, error: 'request-id-conflict', state: 'rejected', requestId })
      }
      if (active !== null) {
        return Promise.resolve({ ok: false, error: 'import-busy', state: 'rejected', requestId })
      }
      const job = { fingerprint, controller: new AbortController(), result: null, promise: null }
      jobs.set(requestId, job)
      active = requestId
      // Reserve before any await, including the fresh preview of installed bundles.
      job.promise = Promise.resolve().then(() => operation(job.controller.signal))
        .catch((error) => ({ ok: false, error: error.code ?? error.message ?? 'import-failed' }))
        .then((result) => {
          job.result = { ...result, requestId, state: 'finished' }
          active = null
          const completed = [...jobs].filter(([, value]) => value.result)
          for (const [id] of completed.slice(0, Math.max(0, completed.length - maxCompleted))) jobs.delete(id)
          return job.result
        })
      return job.promise
    },
  }
}
