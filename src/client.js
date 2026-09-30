window.__ModuleLoader__.load({
  id: 'dsh-plugin-share',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'dshPluginShare'

    const zh = {
      tab: '插件分享',
      intro: '组合码只包含插件来源、版本和启用状态，不包含配置或密钥。',
      export: '从当前 profile 导出',
      parse: '解析组合码',
      install: '确认安装',
      copy: '复制',
      codePlaceholder: '在这里粘贴 D1 组合码…',
      empty: '还没有解析结果。',
      entries: '插件清单',
      skipped: '已跳过',
      installSpec: '安装规格',
      same: '已是当前版本',
      upgrade: '升级',
      setEnabled: '同步启用状态',
      installAction: '安装',
      cancel: '取消',
      refused: '被拒绝',
      build: '安装需要运行构建脚本：',
      approveAndRetry: '允许脚本并重试',
      copied: '已复制',
      success: '导入完成',
      failure: '操作失败',
      exportFailed: '当前 profile 没有可导出的可移植插件。',
    }
    const en = {
      tab: 'Plugin share',
      intro: 'Codes contain plugin sources, versions, and enablement only; no settings or secrets.',
      export: 'Export current profile',
      parse: 'Parse code',
      install: 'Confirm install',
      copy: 'Copy',
      codePlaceholder: 'Paste a D1 share code here…',
      empty: 'Nothing parsed yet.',
      entries: 'Plugin list',
      skipped: 'Skipped',
      installSpec: 'Install spec',
      same: 'Already current',
      upgrade: 'Upgrade',
      setEnabled: 'Sync enablement',
      installAction: 'Install',
      cancel: 'Cancel',
      refused: 'Refused',
      build: 'Installation requests build scripts:',
      approveAndRetry: 'Allow scripts and retry',
      copied: 'Copied',
      success: 'Import complete',
      failure: 'Operation failed',
      exportFailed: 'No portable plugins are available in this profile.',
    }

    function publicLabel(entry) {
      if (entry.kind === 'github') return entry.spec
      return entry.name
    }

    function actionLabel(action, t) {
      return {
        skip: t('same'),
        upgrade: t('upgrade'),
        'set-enabled': t('setEnabled'),
        install: t('installAction'),
      }[action] ?? action
    }

    async function request(path, body) {
      const response = await fetch(`/api/plugin-share/${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
      })
      const result = await response.json()
      return { ...result, httpStatus: response.status }
    }

    function Preview({ rows, t }) {
      if (!Array.isArray(rows) || rows.length === 0) return h('p', { style: { color: 'var(--dsw-alias-label-tertiary)' } }, t('empty'))
      return h('div', { style: { display: 'grid', gap: 8 } }, rows.map((row, index) => {
        const entry = row.entry ?? {}
        const refused = row.verdict && row.verdict.ok === false
        return h('div', {
          key: `${publicLabel(entry)}-${index}`,
          style: {
            border: '0.5px solid var(--dsw-alias-border-l3)',
            borderRadius: 'var(--dsw-radius-md)',
            padding: '9px 11px',
            display: 'grid',
            gap: 3,
          },
        },
        h('strong', null, publicLabel(entry)),
        h('code', { style: { color: 'var(--dsw-alias-label-secondary)', overflowWrap: 'anywhere' } }, row.spec),
        h('span', { style: { color: refused ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-label-tertiary)' } }, refused ? `${t('refused')}: ${row.verdict.reason}` : actionLabel(row.action, t)))
      }))
    }

    function PluginShareTab({ t }) {
      const [code, setCode] = React.useState('')
      const [preview, setPreview] = React.useState(null)
      const [pendingBuilds, setPendingBuilds] = React.useState([])
      const [message, setMessage] = React.useState('')
      const [busy, setBusy] = React.useState(false)
      const [requestId, setRequestId] = React.useState('')

      const run = async (operation) => {
        setBusy(true)
        setMessage('')
        try {
          const result = await operation()
          if (result.preview) setPreview(result.preview)
          if (result.code) setCode(result.code)
          if (result.pendingBuilds) setPendingBuilds(result.pendingBuilds)
          else if (result.ok) setPendingBuilds([])
          if (result.ok) setMessage(result.report ? t('success') : '')
          else if (result.error) setMessage(`${t('failure')}: ${result.error}`)
        } catch (error) {
          setMessage(`${t('failure')}: ${error.message}`)
        } finally {
          setBusy(false)
        }
      }

      const parse = () => run(() => request('parse', { code }))
      const exportCurrent = () => run(async () => {
        const result = await request('export', {})
        if (!result.ok && result.error === 'entries-invalid') result.error = t('exportFailed')
        return result
      })
      const install = (approvedBuilds) => {
        const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
        setRequestId(id)
        return run(() => request('import', { code, confirm: true, requestId: id, ...(approvedBuilds ? { approvedBuilds } : {}) }))
      }
      const cancel = () => run(() => request('cancel', { requestId }))
      const copy = async () => {
        await navigator.clipboard.writeText(code)
        setMessage(t('copied'))
      }

      return h('section', {
        style: {
          width: '100%',
          maxWidth: 760,
          color: 'var(--dsw-alias-label-primary)',
          display: 'grid',
          gap: 14,
        },
      },
      h('p', { style: { margin: 0, color: 'var(--dsw-alias-label-tertiary)', lineHeight: 1.5 } }, t('intro')),
      h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap' } },
        h('button', { type: 'button', disabled: busy, onClick: exportCurrent }, t('export')),
        h('button', { type: 'button', disabled: busy || !code.trim(), onClick: parse }, t('parse')),
        h('button', { type: 'button', disabled: busy || !code.trim(), onClick: copy }, t('copy')),
        h('button', { type: 'button', disabled: busy || !code.trim() || !preview, onClick: () => install() }, t('install')),
        requestId && busy ? h('button', { type: 'button', onClick: cancel }, t('cancel')) : null),
      h('textarea', {
        value: code,
        onChange: (event) => setCode(event.target.value),
        placeholder: t('codePlaceholder'),
        spellCheck: false,
        rows: 6,
        style: {
          width: '100%',
          boxSizing: 'border-box',
          resize: 'vertical',
          border: '0.5px solid var(--dsw-alias-border-l3)',
          borderRadius: 'var(--dsw-radius-md)',
          background: 'var(--dsw-alias-bg-layer-1)',
          color: 'var(--dsw-alias-label-primary)',
          padding: 10,
          fontFamily: 'var(--ds-font-family-code)',
        },
      }),
      preview ? h('div', null, h('h3', { style: { margin: '0 0 8px' } }, t('entries')), h(Preview, { rows: preview, t })) : null,
      pendingBuilds.length ? h('div', {
        style: {
          borderRadius: 'var(--dsw-radius-md)',
          background: 'color-mix(in srgb, var(--dsw-alias-state-warning-primary) 10%, transparent)',
          padding: 10,
          display: 'grid',
          gap: 8,
        },
      }, h('strong', null, t('build')), h('code', null, pendingBuilds.join(', ')), h('button', { type: 'button', disabled: busy, onClick: () => install(pendingBuilds) }, t('approveAndRetry'))) : null,
      message ? h('p', { role: 'status', style: { margin: 0, color: 'var(--dsw-alias-label-secondary)' } }, message) : null)
    }

    return {
      inject: ['slots', 'locale'],
      apply(ctx) {
        const t = ctx.locale.bind(NS)
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-plugin-share: dictionaries')
        ctx.slots.inject('settings.plugins.tab', () => ctx.slots.register({
          name: 'settings.plugins.tab',
          id: 'plugin-share',
          order: 20,
          label: () => t('tab'),
          locale: NS,
          inject: () => ({ t }),
        }, PluginShareTab))
      },
    }
  },
})
