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
    return dictionaries[Object.keys(dictionaries)[0]]
  })()
  return loaded
}

test('registers a Chinese and an English dictionary with identical keys', async () => {
  const dictionaries = await loadClient()
  assert.deepEqual(Object.keys(dictionaries).sort(), ['en', 'zh'])
  assert.deepEqual(Object.keys(dictionaries.zh).sort(), Object.keys(dictionaries.en).sort())
})

test('every label the client asks for is registered in both languages', async () => {
  const dictionaries = await loadClient()
  const source = readFileSync(new URL('../src/client.js', import.meta.url), 'utf8')
  const keys = new Set([...source.matchAll(/\bt\('([A-Za-z0-9_]+)'\)/g)].map((match) => match[1]))
  assert.ok(keys.size > 30, `expected many labels, found ${keys.size}`)
  const missingZh = [...keys].filter((key) => !(key in dictionaries.zh))
  const missingEn = [...keys].filter((key) => !(key in dictionaries.en))
  assert.deepEqual(missingZh, [], `missing Chinese labels: ${missingZh.join(', ')}`)
  assert.deepEqual(missingEn, [], `missing English labels: ${missingEn.join(', ')}`)
})
