import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'

/**
 * The tab renders every label through `t('key')`, and the locale service has no
 * language fallback: an unregistered key shows up in the UI as the raw key. This
 * test loads the real client module, captures the dictionaries it registers and
 * checks both directions, so a typo cannot reach a user.
 */
let loaded = null

/** Load the client module once: ESM caches it, so the side effect runs once. */
function loadClient() {
  if (loaded) return loaded
  loaded = (async () => {
    let mod = null
    globalThis.window = { __ModuleLoader__: { load: (value) => { mod = value } } }
    await import('../src/client.js')
    let state = []
    let cursor = 0
    let component
    const React = {
      createElement: (type, props, ...children) => ({ type, props, children }),
      useState: (initial) => {
        const index = cursor++
        if (!(index in state)) state[index] = typeof initial === 'function' ? initial() : initial
        return [state[index], (next) => { state[index] = typeof next === 'function' ? next(state[index]) : next }]
      },
      useRef: (initial) => {
        const index = cursor++
        if (!(index in state)) state[index] = { current: initial }
        return state[index]
      },
      useEffect: (callback, deps) => {
        const index = cursor++
        if (state[index]?.deps?.every((value, i) => Object.is(value, deps[i]))) return
        state[index]?.cleanup?.()
        state[index] = { deps, cleanup: callback() }
      },
    }
    const primitives = { Button: () => null, Tag: () => null, Menu: () => null, Checkbox: () => null }
    const require = (name) => {
      if (name === 'react') return React
      if (name === '@deepseek-ai/dsh-client-ui-primitives') return primitives
      throw new Error(`unexpected module request: ${name}`)
    }
    const dictionaries = {}
    const ctx = {
      locale: {
        bind: () => (key) => key,
        register: (namespace, values) => { dictionaries[namespace] = values },
      },
      effect: (callback) => { callback() },
      slots: { inject: (key, callback) => callback(), register: (_info, value) => { component = value } },
    }
    const plugin = mod.factory(require)
    plugin.apply(ctx)
    return {
      plugin,
      dictionaries: dictionaries[Object.keys(dictionaries)[0]],
      mountTab() {
        for (const hook of state) hook?.cleanup?.()
        state = []
        return () => { cursor = 0; return component({ t: (key) => key }) }
      },
    }
  })()
  return loaded
}

test('registers a Chinese and an English dictionary with identical keys', async () => {
  const { dictionaries } = await loadClient()
  assert.deepEqual(Object.keys(dictionaries).sort(), ['en', 'zh'])
  assert.deepEqual(Object.keys(dictionaries.zh).sort(), Object.keys(dictionaries.en).sort())
})

test('every label the client asks for is registered in both languages', async () => {
  const { dictionaries } = await loadClient()
  const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
  const keys = new Set([...source.matchAll(/\bt\('([A-Za-z0-9_]+)'\)/g)].map((match) => match[1]))
  assert.ok(keys.size > 30, `expected many labels, found ${keys.size}`)
  const missingZh = [...keys].filter((key) => !(key in dictionaries.zh))
  const missingEn = [...keys].filter((key) => !(key in dictionaries.en))
  assert.deepEqual(missingZh, [], `missing Chinese labels: ${missingZh.join(', ')}`)
  assert.deepEqual(missingEn, [], `missing English labels: ${missingEn.join(', ')}`)
})

test('a failed install is reported with the package manager reason', async () => {
  const { plugin } = await loadClient()
  // The shape the plugin manager produces, with the chatter pnpm prints first.
  const diagnostic = [
    '\u001b[32m✓\u001b[0m Lockfile passes supply-chain policies (verified 4d ago)',
    'Progress: resolved 1, reused 0, downloaded 0, added 0',
    'Error: ERR_PNPM_NO_MATCHING_VERSION',
    '',
    '  × adding a new package',
    '  ╰─▶ Failed to resolve dependency tree: No matching version found for',
    '      @liustack/modlens@0.3.1 while fetching it from https://registry',
    '  help: The latest release of "@liustack/modlens" is "3.26.6".',
  ].join('\n')
  const text = plugin.failureReason({
    ok: false,
    error: 'operation-error',
    operation: { application: 'failed', error: { code: 'operation-error', diagnostic } },
  })
  // The reason and the remedy survive; the lockfile chatter does not.
  assert.match(text, /ERR_PNPM_NO_MATCHING_VERSION/)
  assert.match(text, /No matching version found for/)
  assert.match(text, /help: The latest release/)
  assert.doesNotMatch(text, /Lockfile passes/)
  assert.doesNotMatch(text, /Progress:/)
  assert.doesNotMatch(text, /\u001b/)
})

test('a failure without a diagnostic still says something specific', async () => {
  const { plugin } = await loadClient()
  assert.equal(plugin.failureReason({
    ok: false,
    error: 'operation-error',
    operation: { application: 'failed', packageResult: { kind: 'no-matching-version' } },
  }), 'no-matching-version')
  assert.equal(plugin.failureReason({ ok: false, error: 'build-approval-required' }), 'build-approval-required')
  assert.equal(plugin.failureReason(undefined), '')
})

function* nodes(tree) {
  if (!tree || typeof tree !== 'object') return
  yield tree
  // Expand the plugin's preview component while leaving primitive buttons as
  // elements so their real event handlers and disabled flags can be exercised.
  if (typeof tree.type === 'function' && tree.type.name === 'Preview') yield* nodes(tree.type(tree.props))
  for (const child of (tree.children ?? []).flat(Infinity)) yield* nodes(child)
}

function button(tree, label) {
  return [...nodes(tree)].find((node) => typeof node.props?.onClick === 'function' && node.children.includes(label))
}

test('export click handles absent or invalid skipped fields and shows an actual skipped count', async () => {
  const { mountTab } = await loadClient()
  const previousFetch = globalThis.fetch
  try {
    for (const skipped of [undefined, null, {}, [], [{ name: 'local' }]]) {
      const render = mountTab()
      globalThis.fetch = async () => ({ status: 200, text: async () => JSON.stringify({ ok: true, code: 'D1test',
        entries: [{ kind: 'npm', value: 'plugin', version: '1.0.0', enabled: true }], skipped }) })
      await button(render(), 'export').props.onClick()
      await button(render(), 'exportGenerate').props.onClick()
      const tree = render()
      const status = [...nodes(tree)].find((node) => node.props?.className === 'dps-statusOk')
      assert.ok(status)
      assert.ok(status.children.includes(Array.isArray(skipped) && skipped.length ? '1 exportSelected · exported · 6 · 1 exportedSkipped' : '1 exportSelected · exported · 6'))
      assert.equal(button(tree, 'export').props.disabled, false)
    }
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('manual updates stay disabled while available rows can still be queued together', async () => {
  const { mountTab } = await loadClient()
  const previousFetch = globalThis.fetch
  const render = mountTab()
  const preview = [
    { index: 0, entry: { kind: 'npm', value: 'old', version: '2.0.0' }, spec: 'old@2.0.0', action: 'upgrade', verdict: { ok: false, reason: 'manual-update-required' } },
    { index: 1, entry: { kind: 'npm', value: 'new', version: '1.0.0' }, spec: 'new@1.0.0', action: 'install', verdict: { ok: true } },
  ]
  try {
    globalThis.fetch = async () => ({ status: 200, text: async () => JSON.stringify({ ok: true, selection: true, queue: true, preview }) })
    const input = [...nodes(render())].find((node) => node.type === 'textarea')
    input.props.onChange({ target: { value: 'D1test' } })
    await button(render(), 'parse').props.onClick()
    const tree = render()
    assert.equal(button(tree, 'rowManualUpdate').props.disabled, true)
    assert.equal(button(tree, 'installAll').props.disabled, false)
    assert.equal(button(tree, 'rowInstall').props.disabled, false)
    assert.ok([...nodes(tree)].some((node) => node.children.includes('manualUpdateReason')))
    assert.ok([...nodes(tree)].some((node) => node.children.includes('manualRequired')))
  } finally {
    globalThis.fetch = previousFetch
  }
})

test('selective export sends only checked entries and never silently exports all on an empty selection', async () => {
  const { mountTab } = await loadClient()
  const render = mountTab()
  const previousFetch = globalThis.fetch
  const entries = [
    { kind: 'npm', value: 'one', version: '1.0.0', enabled: false },
    { kind: 'github', value: 'github:owner/two#main', version: '2.0.0', enabled: true },
  ]
  const calls = []
  const checks = () => [...nodes(render())].filter((node) => typeof node.props?.checked === 'boolean')
  try {
    globalThis.fetch = async (url, options) => {
      const body = JSON.parse(options.body)
      calls.push({ url, body })
      return { status: 200, text: async () => JSON.stringify(url.endsWith('/export-preview')
        ? { ok: true, entries, skipped: [] } : { ok: true, code: 'D1selected' }) }
    }
    await button(render(), 'export').props.onClick()
    assert.equal(calls.length, 1)
    assert.deepEqual(checks().map((node) => node.props.checked), [true, true])
    button(render(), 'exportNone').props.onClick()
    assert.equal(button(render(), 'exportGenerate').props.disabled, true)
    await button(render(), 'exportGenerate').props.onClick()
    assert.equal(calls.length, 1)
    button(render(), 'exportAll').props.onClick()
    checks()[1].props.onChange(false)
    await button(render(), 'exportGenerate').props.onClick()
    assert.deepEqual(calls[1].body.entries, [entries[0]])
    assert.equal([...nodes(render())].find((node) => node.type === 'textarea').props.value, 'D1selected')
    assert.equal(checks().length, 0)
  } finally { globalThis.fetch = previousFetch }
})

test('queue controls stay usable while code replacement is locked, including after remount', async () => {
  const { mountTab } = await loadClient()
  const previousFetch = globalThis.fetch
  let render = mountTab()
  const preview = [0, 1].map((index) => ({ index, action: 'install', verdict: { ok: true },
    spec: `plugin-${index}@1.0.0`, entry: { kind: 'npm', value: `plugin-${index}`, version: '1.0.0' } }))
  const imports = []
  const reply = (value) => ({ status: 200, text: async () => JSON.stringify(value) })
  const rowActions = (tree) => [...nodes(tree)].filter((node) => node.type === 'li')
    .map((row) => [...nodes(row)].find((node) => node.props?.onClick))
    .filter(Boolean)
  const tick = () => new Promise((resolve) => setImmediate(resolve))
  try {
    globalThis.fetch = async (url, options) => {
      if (url.endsWith('/parse')) return reply({ ok: true, selection: true, queue: true, preview })
      assert.ok(url.endsWith('/import'), `unexpected request: ${url}`)
      return new Promise((resolve) => imports.push({ body: JSON.parse(options.body), resolve }))
    }
    const input = [...nodes(render())].find((node) => node.type === 'textarea')
    input.props.onChange({ target: { value: 'D1queue' } })
    await button(render(), 'parse').props.onClick()
    rowActions(render())[0].props.onClick()
    let tree = render()
    assert.equal(rowActions(tree)[0].props.disabled, true)
    assert.equal(rowActions(tree)[1].props.disabled, false)
    const lockedInput = [...nodes(tree)].find((node) => node.type === 'textarea')
    assert.equal(lockedInput.props.readOnly, true)
    lockedInput.props.onChange({ target: { value: 'replacement' } })
    await button(tree, 'export').props.onClick()
    const picker = [...nodes(tree)].find((node) => node.type === 'input' && node.props.type === 'file')
    picker.props.onChange({ target: { files: [{}], value: 'ignored.png' } })
    rowActions(tree)[1].props.onClick()
    rowActions(tree)[1].props.onClick() // A stale double click still enqueues only once.
    assert.equal(imports.length, 1)
    assert.deepEqual(imports[0].body.only, [0])
    render = mountTab()
    tree = render()
    assert.equal([...nodes(tree)].find((node) => node.type === 'textarea').props.value, 'D1queue')
    assert.ok(button(tree, 'queueRemove'))
    imports[0].resolve(reply({ ok: true, state: 'finished', report: [] }))
    await tick()
    assert.equal(imports.length, 2)
    assert.deepEqual(imports[1].body.only, [1])
    imports[1].resolve(reply({ ok: true, state: 'finished', report: [] }))
    await tick()
    assert.equal([...nodes(render())].find((node) => node.type === 'textarea').props.readOnly, false)
    const history = () => [...nodes(render())].find((node) => node.props?.['aria-label'] === 'resultHistory')
    assert.ok([...nodes(history())].some((node) => node.children.includes('plugin-0')))
    const historyCount = [...nodes(history())].filter((node) => node.type === 'li').length
    await button(render(), 'parse').props.onClick()
    render = mountTab()
    assert.equal([...nodes(history())].filter((node) => node.type === 'li').length, historyCount)
    button(render(), 'resultClear').props.onClick()
    assert.equal([...nodes(history())].filter((node) => node.type === 'li').length, 0)
  } finally {
    for (const item of imports) item.resolve(reply({ ok: true, state: 'finished' }))
    globalThis.fetch = previousFetch
  }
})

test('an older host cannot enable queue actions without the receipt capability', async () => {
  const { mountTab } = await loadClient()
  const previousFetch = globalThis.fetch
  const render = mountTab()
  try {
    globalThis.fetch = async () => ({ status: 200, text: async () => JSON.stringify({ ok: true, selection: true,
      preview: [{ index: 0, action: 'install', verdict: { ok: true }, entry: { value: 'old-host' } }] }) })
    const input = [...nodes(render())].find((node) => node.type === 'textarea')
    input.props.onChange({ target: { value: 'D1legacy' } })
    await button(render(), 'parse').props.onClick()
    assert.equal(button(render(), 'rowInstall').props.disabled, true)
    assert.equal(button(render(), 'installAll').props.disabled, true)
    assert.ok([...nodes(render())].some((node) => node.children.includes('hostOld')))
  } finally {
    globalThis.fetch = previousFetch
  }
})
