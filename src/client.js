window.__ModuleLoader__.load({
  id: 'dsh-plugin-share',
  factory(require) {
    const React = require('react')
    const h = React.createElement
    const NS = 'dshPluginShare'
    const REQUEST_TIMEOUT_MS = 180000

    const zh = {
      tab: '插件分享',
      intro: '组合码只包含插件来源、版本和启用状态，不包含配置或密钥。',
      export: '从当前 profile 导出',
      parse: '解析组合码',
      installAll: '全部安装',
      copy: '复制',
      codePlaceholder: '在这里粘贴 D1 组合码…',
      empty: '还没有解析结果。',
      entries: '插件清单',
      cancel: '取消',
      refused: '被拒绝',
      build: '安装需要运行构建脚本：',
      approveAndRetry: '允许脚本并重试',
      copied: '已复制',
      success: '导入完成',
      successSkipped: '没有需要变更的条目，所有插件都已是当前状态。',
      exported: '已生成组合码，长度',
      failure: '操作失败',
      exportFailed: '当前 profile 没有可导出的可移植插件。',
      rowInstall: '安装',
      rowUpgrade: '升级',
      rowEnable: '启用',
      rowDisable: '停用',
      rowCurrent: '已是当前版本',
      working: '正在处理…',
      rowWorking: '处理中…',
      rowDone: '已完成',
      rowFailed: '失败',
      hintSingle: '每个插件都可以单独处理，或点「全部安装」一次装完。',
      hostOld: '宿主半不支持单独安装，请重启 DSH 后再试（当前只能「全部安装」）。',
      needCode: '先在下面粘贴组合码',
      needParse: '再点击「解析组合码」',
      stale: '组合码已改动，请重新解析',
      total: '共',
      willRun: '项待处理',
    }
    const en = {
      tab: 'Plugin share',
      intro: 'Codes contain plugin sources, versions, and enablement only; no settings or secrets.',
      export: 'Export current profile',
      parse: 'Parse code',
      installAll: 'Install all',
      copy: 'Copy',
      codePlaceholder: 'Paste a D1 share code here…',
      empty: 'Nothing parsed yet.',
      entries: 'Plugin list',
      cancel: 'Cancel',
      refused: 'Refused',
      build: 'Installation requests build scripts:',
      approveAndRetry: 'Allow scripts and retry',
      copied: 'Copied',
      success: 'Import complete',
      successSkipped: 'Nothing to change; every plugin is already current.',
      exported: 'Share code generated, length',
      failure: 'Operation failed',
      exportFailed: 'No portable plugins are available in this profile.',
      rowInstall: 'Install',
      rowUpgrade: 'Upgrade',
      rowEnable: 'Enable',
      rowDisable: 'Disable',
      rowCurrent: 'Already current',
      working: 'Working…',
      rowWorking: 'Working…',
      rowDone: 'done',
      rowFailed: 'failed',
      hintSingle: 'Apply any plugin on its own, or use Install all.',
      hostOld: 'This host half cannot apply single rows; restart DSH to retry. Only Install all is available.',
      needCode: 'Paste a share code below first',
      needParse: 'then click "Parse code"',
      stale: 'The code changed; parse it again',
      total: 'Total',
      willRun: 'to apply',
    }

    function publicLabel(entry) {
      if (entry.kind === 'github') return entry.spec
      return entry.name
    }

    function sourceLabel(entry) {
      if (entry.kind === 'github') return 'github.com'
      if (entry.kind === 'builtin') return 'builtin'
      return 'npm'
    }

    /** The per-row button label and whether that row is actionable. */
    function rowButton(row, t) {
      if (row.verdict && row.verdict.ok === false) return { label: t('refused'), disabled: true, refused: true }
      if (row.action === 'skip') return { label: t('rowCurrent'), disabled: true }
      if (row.action === 'upgrade') return { label: t('rowUpgrade'), disabled: false }
      if (row.action === 'set-enabled') return { label: row.entry.enabled ? t('rowEnable') : t('rowDisable'), disabled: false }
      return { label: t('rowInstall'), disabled: false }
    }

    /** A request always resolves, so a hung network call can never freeze the tab. */
    async function request(path, body) {
      const controller = typeof AbortController === 'function' ? new AbortController() : null
      const timer = controller ? setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS) : null
      try {
        const response = await fetch(`/api/plugin-share/${path}`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(body),
          ...(controller ? { signal: controller.signal } : {}),
        })
        const text = await response.text()
        let result
        try {
          result = JSON.parse(text)
        } catch {
          result = { ok: false, error: `unreadable-response-${response.status}` }
        }
        if (!result || typeof result !== 'object') result = { ok: false, error: `unreadable-response-${response.status}` }
        return { ...result, httpStatus: response.status }
      } catch (error) {
        const aborted = error?.name === 'AbortError'
        return { ok: false, error: aborted ? 'request-timeout' : (error?.message || 'request-failed') }
      } finally {
        if (timer) clearTimeout(timer)
      }
    }

    function Preview({ rows, t, busy, busyRow, canSelect, onApply }) {
      if (!Array.isArray(rows) || rows.length === 0) {
        return h('p', { style: { margin: 0, color: 'var(--dsw-alias-label-tertiary)' } }, t('empty'))
      }
      return h('div', { style: { display: 'grid', gap: 8 } }, rows.map((row, position) => {
        const entry = row.entry ?? {}
        const button = rowButton(row, t)
        const working = busyRow !== null && (busyRow === (row.index ?? position))
        return h('div', {
          key: `${position}-${publicLabel(entry)}`,
          style: {
            border: '0.5px solid var(--dsw-alias-border-l3)',
            borderRadius: 'var(--dsw-radius-md)',
            padding: '9px 11px',
            display: 'grid',
            gap: 6,
          },
        },
        h('div', { style: { display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' } },
          h('span', {
            style: {
              fontSize: 11,
              padding: '1px 6px',
              borderRadius: 'var(--dsw-radius-sm)',
              border: '0.5px solid var(--dsw-alias-border-l3)',
              color: 'var(--dsw-alias-label-tertiary)',
            },
          }, sourceLabel(entry)),
          h('strong', { style: { overflowWrap: 'anywhere' } }, publicLabel(entry)),
          h('button', {
            type: 'button',
            disabled: busy || button.disabled || !canSelect,
            title: button.refused ? (row.verdict?.reason ?? t('refused')) : (canSelect ? button.label : t('hostOld')),
            onClick: () => onApply(row, position),
            style: { marginLeft: 'auto' },
          }, working ? t('rowWorking') : button.label)),
        h('code', { style: { color: 'var(--dsw-alias-label-secondary)', overflowWrap: 'anywhere' } }, row.spec),
        button.refused ? h('span', { style: { color: 'var(--dsw-alias-state-error-primary)' } }, `${t('refused')}: ${row.verdict.reason}`) : null)
      }))
    }

    function PluginShareTab({ t }) {
      const [code, setCode] = React.useState('')
      const [parsedCode, setParsedCode] = React.useState('')
      const [preview, setPreview] = React.useState(null)
      const [status, setStatus] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [busyRow, setBusyRow] = React.useState(null)
      const [pending, setPending] = React.useState(null)
      const [selection, setSelection] = React.useState(false)
      const [requestId, setRequestId] = React.useState('')

      const trimmed = code.trim()
      const parsed = preview !== null && parsedCode !== '' && parsedCode === trimmed
      const stale = preview !== null && parsedCode !== trimmed

      const clear = () => {
        setPreview(null)
        setParsedCode('')
        setPending(null)
        setSelection(false)
      }

      const newRequestId = () => {
        const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`
        setRequestId(id)
        return id
      }

      const refresh = async () => {
        const result = await request('parse', { code: trimmed })
        if (result.ok && result.preview) {
          setPreview(result.preview)
          setParsedCode(trimmed)
          setPending(null)
          setSelection(result.selection === true)
        }
      }

      /** Apply one preview row: `index === null` means the whole list. */
      const apply = async (index, approvedBuilds) => {
        setBusy(true)
        setBusyRow(index)
        setStatus(null)
        try {
          const id = newRequestId()
          const result = await request('import', {
            code: parsedCode,
            confirm: true,
            requestId: id,
            ...(index === null ? {} : { only: [index] }),
            ...(approvedBuilds ? { approvedBuilds } : {}),
          })
          if (result.pendingBuilds?.length) {
            setPending({ index, builds: result.pendingBuilds })
            setStatus({ kind: 'error', text: `${t('build')} ${result.pendingBuilds.join(', ')}` })
            return
          }
          if (result.ok) {
            setPending(null)
            const acted = (result.report ?? []).filter((row) => row.status !== 'skipped' && row.status !== 'refused')
            const label = index === null ? t('success') : `${t('rowDone')} · ${publicLabel(preview?.[index]?.entry ?? {})}`
            setStatus({ kind: 'ok', text: acted.length === 0 ? t('successSkipped') : label })
            await refresh()
            return
          }
          setStatus({
            kind: 'error',
            text: `${t('failure')}: ${result.error}${result.httpStatus ? ` (HTTP ${result.httpStatus})` : ''}`,
          })
        } finally {
          setBusy(false)
          setBusyRow(null)
        }
      }

      const exportCurrent = async () => {
        setBusy(true)
        setStatus(null)
        try {
          const result = await request('export', {})
          if (result.ok && result.code) {
            setCode(result.code)
            // A fresh export replaces the code, so any parsed list no longer
            // describes what is in the box.
            clear()
            setStatus({ kind: 'ok', text: `${t('exported')} · ${result.code.length}` })
          } else {
            const reason = result.error === 'entries-invalid' ? t('exportFailed') : result.error
            setStatus({ kind: 'error', text: `${t('failure')}: ${reason}` })
          }
        } finally {
          setBusy(false)
        }
      }

      const parse = async () => {
        setBusy(true)
        setStatus(null)
        try {
          const result = await request('parse', { code: trimmed })
          if (result.ok && result.preview) {
            setPreview(result.preview)
            setParsedCode(trimmed)
            setPending(null)
            setSelection(result.selection === true)
          } else {
            clear()
            setStatus({
              kind: 'error',
              text: `${t('failure')}: ${result.error}${result.httpStatus ? ` (HTTP ${result.httpStatus})` : ''}`,
            })
          }
        } finally {
          setBusy(false)
        }
      }

      const copy = async () => {
        try {
          await navigator.clipboard.writeText(code)
          setStatus({ kind: 'ok', text: t('copied') })
        } catch (error) {
          setStatus({ kind: 'error', text: `${t('failure')}: ${error.message}` })
        }
      }

      const pendingRows = preview ? preview.filter((row) => row.action !== 'skip' && row.verdict?.ok !== false).length : 0
      const hint = busy
        ? t('working')
        : !trimmed
          ? t('needCode')
          : stale
            ? t('stale')
            : !parsed
              ? t('needParse')
              : !selection
                ? t('hostOld')
                : `${t('total')} ${preview.length} · ${pendingRows} ${t('willRun')} · ${t('hintSingle')}`

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
      h('div', { style: { display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' } },
        h('button', { type: 'button', disabled: busy, onClick: exportCurrent }, t('export')),
        h('button', { type: 'button', disabled: busy || !trimmed, onClick: parse }, t('parse')),
        h('button', { type: 'button', disabled: busy || !trimmed, onClick: copy }, t('copy')),
        h('button', {
          type: 'button',
          disabled: busy || !parsed || pendingRows === 0,
          onClick: () => apply(null),
        }, t('installAll')),
        busy ? h('button', { type: 'button', onClick: () => request('cancel', { requestId }), disabled: !requestId }, t('cancel')) : null),
      h('p', { style: { margin: 0, fontSize: 12, color: 'var(--dsw-alias-label-tertiary)' } }, hint),
      status ? h('p', {
        role: 'status',
        'aria-live': 'polite',
        style: {
          margin: 0,
          color: status.kind === 'error' ? 'var(--dsw-alias-state-error-primary)' : 'var(--dsw-alias-state-success-primary, var(--dsw-alias-label-primary))',
        },
      }, status.text) : null,
      h('textarea', {
        value: code,
        onChange: (event) => {
          const next = event.target.value
          setCode(next)
          if (next.trim() !== parsedCode) clear()
        },
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
      preview ? h('div', null, h('h3', { style: { margin: '0 0 8px' } }, t('entries')),
        h(Preview, {
          rows: preview,
          t,
          busy,
          busyRow,
          canSelect: selection,
          onApply: (row, position) => apply(Number.isInteger(row.index) ? row.index : position),
        })) : null,
      pending ? h('div', {
        style: {
          borderRadius: 'var(--dsw-radius-md)',
          background: 'color-mix(in srgb, var(--dsw-alias-state-warning-primary) 10%, transparent)',
          padding: 10,
          display: 'grid',
          gap: 8,
        },
      },
      h('strong', null, t('build')),
      h('code', null, pending.builds.join(', ')),
      h('button', { type: 'button', disabled: busy, onClick: () => apply(pending.index, pending.builds) }, t('approveAndRetry'))) : null)
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
