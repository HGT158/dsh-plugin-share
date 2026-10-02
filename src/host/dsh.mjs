import { randomUUID } from 'node:crypto'
import { collectEntries } from './collect.mjs'
import { applyPreview, previewEntries, selectPreview } from './import.mjs'
import { decodeCode, encodeCode } from './codec.mjs'
import { encodeQr } from '../shared/qr.mjs'
import { scanQrImage } from '../shared/qr-scan.mjs'

const ROUTE = '/api/plugin-share'
// A 1400x1400 grayscale scan payload is about 1.9 MB before base64, so the
// ceiling covers one screenshot with room to spare. Local endpoint only.
const MAX_BODY_BYTES = 8 * 1024 * 1024
// M fits a typical share code and is the friendlier level for a phone camera;
// L is the fallback that still holds the longest code we can turn into a symbol.
const QR_LEVELS = ['M', 'L']
const MAX_SCAN_PIXELS = 4 * 1024 * 1024

function buildQr(code) {
  for (const level of QR_LEVELS) {
    try {
      return encodeQr(code, { level })
    } catch (error) {
      if (error?.message !== 'qr-too-long') throw error
    }
  }
  return null
}

function compactCode(value) {
  return value.replace(/\s+/gu, '')
}

function sendJson(res, status, value) {
  const body = JSON.stringify(value)
  res.writeHead(status, {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'content-length': Buffer.byteLength(body),
  })
  res.end(body)
}

async function readJson(req) {
  const chunks = []
  let size = 0
  for await (const chunk of req) {
    size += chunk.length
    if (size > MAX_BODY_BYTES) throw Object.assign(new Error('request-too-large'), { status: 413 })
    chunks.push(chunk)
  }
  if (chunks.length === 0) return {}
  const text = Buffer.concat(chunks).toString('utf8')
  try {
    const value = JSON.parse(text)
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('request-json-object-required')
    return value
  } catch (error) {
    throw Object.assign(new Error(error.message === 'request-json-object-required' ? error.message : 'request-json-invalid'), { status: 400 })
  }
}

async function listBundles(pluginManager) {
  if (!pluginManager || typeof pluginManager.listBundles !== 'function') throw new Error('plugin-manager-unavailable')
  const value = await pluginManager.listBundles()
  if (Array.isArray(value)) return value
  if (Array.isArray(value?.bundles)) return value.bundles
  throw new Error('plugin-manager-invalid-bundles')
}

function dependencyMap(bundles) {
  const dependencies = {}
  for (const bundle of bundles) {
    const name = bundle?.name ?? bundle?.id ?? bundle?.packageName
    if (typeof name !== 'string' || !name) continue
    const spec = bundle.spec ?? bundle.source ?? bundle.dependency
    if (typeof spec === 'string' && spec) dependencies[name] = spec
    else if (typeof bundle.version === 'string' && bundle.version) dependencies[name] = bundle.version
  }
  return dependencies
}

function collectForBundles(bundles, options = {}) {
  return collectEntries({
    bundles,
    dependencies: dependencyMap(bundles),
    includeOptional: options.includeOptional !== false,
    pin: options.pin !== false,
  })
}

function publicEntry(entry) {
  if (entry.kind === 'npm') return { name: entry.name ?? entry.value, version: entry.version, enabled: entry.enabled }
  if (entry.kind === 'github') return { spec: entry.spec ?? entry.value, version: entry.version, enabled: entry.enabled }
  return { name: entry.name ?? entry.value, kind: 'builtin', enabled: entry.enabled }
}

async function previewCode(code, pluginManager) {
  const decoded = decodeCode(code)
  if (!decoded.ok) return { ok: false, error: decoded.reason }
  const bundles = await listBundles(pluginManager)
  const preview = previewEntries(decoded.entries.map(publicEntry), { installed: bundles })
  // `selection` tells the client this host half understands `only`, so a
  // per-row button can never be answered by an older host as "apply all".
  return { ok: true, selection: true, decoded, bundles, preview }
}

async function handle(req, res, pluginManager) {
  const pathname = new URL(req.url ?? '/', 'http://dsh.local').pathname
  const action = pathname.slice(ROUTE.length).replace(/^\//u, '') || 'state'
  if (req.method === 'GET' && action === 'state') {
    const bundles = await listBundles(pluginManager)
    const collected = collectForBundles(bundles)
    sendJson(res, 200, { ok: true, bundles, ...collected })
    return
  }
  if (req.method !== 'POST') {
    sendJson(res, 405, { ok: false, error: 'method-not-allowed' })
    return
  }
  const body = await readJson(req)
  if (action === 'export') {
    const bundles = await listBundles(pluginManager)
    const collected = Array.isArray(body.entries)
      ? { entries: body.entries, skipped: [] }
      : collectForBundles(bundles, body)
    const publicEntries = collected.entries.map(publicEntry)
    let code
    try {
      code = encodeCode(publicEntries)
    } catch (error) {
      sendJson(res, 422, { ok: false, error: error.code ?? error.message ?? 'entries-invalid', skipped: collected.skipped })
      return
    }
    sendJson(res, 200, { ok: true, code, bundles, entries: publicEntries, skipped: collected.skipped })
    return
  }
  if (action === 'parse') {
    const result = await previewCode(body.code, pluginManager)
    sendJson(res, result.ok ? 200 : 400, result)
    return
  }
  if (action === 'scan') {
    const { width, height } = body
    if (!Number.isInteger(width) || !Number.isInteger(height)
      || width < 21 || height < 21 || width * height > MAX_SCAN_PIXELS
      || typeof body.gray !== 'string' || body.gray === '') {
      sendJson(res, 400, { ok: false, error: 'qr-image-invalid' })
      return
    }
    const gray = new Uint8Array(Buffer.from(body.gray, 'base64'))
    if (gray.length !== width * height) {
      sendJson(res, 400, { ok: false, error: 'qr-image-invalid' })
      return
    }
    const scanned = scanQrImage(gray, width, height)
    if (!scanned.ok) {
      sendJson(res, 422, { ok: false, error: scanned.reason, ...(scanned.text ? { text: scanned.text } : {}) })
      return
    }
    // The D1 checksum is the acceptance test: a garbled read can never come
    // back as a usable code.
    const decoded = decodeCode(scanned.text)
    if (!decoded.ok) {
      sendJson(res, 422, { ok: false, error: 'qr-not-a-share-code', text: scanned.text, reason: decoded.reason })
      return
    }
    sendJson(res, 200, {
      ok: true,
      code: scanned.text,
      version: scanned.version,
      level: scanned.level,
      mask: scanned.mask,
      entries: decoded.entries.length,
    })
    return
  }
  if (action === 'qr') {
    if (typeof body.code !== 'string' || body.code.trim() === '') {
      sendJson(res, 400, { ok: false, error: 'code-required' })
      return
    }
    // Encode the canonical, whitespace-free code so a scan pastes cleanly.
    const code = compactCode(body.code)
    const decoded = decodeCode(code)
    if (!decoded.ok) {
      sendJson(res, 400, { ok: false, error: decoded.reason })
      return
    }
    const qr = buildQr(code)
    if (!qr) {
      sendJson(res, 413, { ok: false, error: 'code-too-long-for-qr' })
      return
    }
    sendJson(res, 200, {
      ok: true,
      version: qr.version,
      size: qr.size,
      level: qr.level,
      mask: qr.mask,
      modules: qr.modules,
    })
    return
  }
  if (action === 'import') {
    const result = await previewCode(body.code, pluginManager)
    if (!result.ok) {
      sendJson(res, 400, result)
      return
    }
    if (body.only !== undefined && (!Array.isArray(body.only) || body.only.some((value) => !Number.isInteger(value)))) {
      sendJson(res, 400, { ok: false, error: 'only-invalid' })
      return
    }
    if (body.confirm !== true) {
      sendJson(res, 200, { ...result, error: 'confirmation-required' })
      return
    }
    // `only` carries preview indices so the UI can apply a single row.
    const selected = selectPreview(result.preview, body.only)
    if (selected.length === 0) {
      sendJson(res, 400, { ok: false, error: 'selection-empty', preview: result.preview })
      return
    }
    const requestId = typeof body.requestId === 'string' && body.requestId ? body.requestId : randomUUID()
    const applied = await applyPreview(selected, pluginManager, {
      requestId,
      ...(Array.isArray(body.approvedBuilds) ? { approvedBuilds: body.approvedBuilds } : {}),
    })
    sendJson(res, applied.ok ? 200 : 409, { ...applied, requestId, preview: result.preview })
    return
  }
  if (action === 'cancel') {
    if (typeof pluginManager.cancelInstall !== 'function') {
      sendJson(res, 501, { ok: false, error: 'cancel-install-unavailable' })
      return
    }
    if (typeof body.requestId !== 'string' || !body.requestId) {
      sendJson(res, 400, { ok: false, error: 'request-id-required' })
      return
    }
    sendJson(res, 200, { ok: true, result: await pluginManager.cancelInstall(body.requestId) })
    return
  }
  sendJson(res, 404, { ok: false, error: 'route-not-found' })
}

export const inject = ['webServer', 'pluginManager']

/** DSH Host half: exposes the local D1 share workflow over same-origin routes. */
export function apply(ctx) {
  ctx.effect(() => ctx.webServer.register({
    kind: 'prefix',
    path: ROUTE,
    handler: (req, res) => handle(req, res, ctx.pluginManager).catch((error) => {
      if (res.headersSent) {
        res.destroy(error)
        return
      }
      sendJson(res, error.status ?? 500, { ok: false, error: error.code ?? error.message ?? 'plugin-share-failed' })
    }),
  }), 'dsh-plugin-share: routes')
}
