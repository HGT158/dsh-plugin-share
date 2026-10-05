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
    const React = {
      createElement: (type, props, ...children) => ({ type, props, children }),
      useState: (initial) => [initial, () => {}],
      useRef: (initial) => ({ current: initial }),
      useEffect: () => {},
    }
    const primitives = { Button: () => null, Tag: () => null, Menu: () => null }
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
      slots: { inject: (key, callback) => callback(), register: () => {} },
    }
    const plugin = mod.factory(require)
    plugin.apply(ctx)
    return { plugin, dictionaries: dictionaries[Object.keys(dictionaries)[0]] }
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
