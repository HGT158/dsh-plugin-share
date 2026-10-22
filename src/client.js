window.__ModuleLoader__.load({
  id: 'dsh-plugin-share',
  factory(require) {
    const React = require('react')
    const { Button, Tag, Menu, Checkbox } = require('@deepseek-ai/dsh-client-ui-primitives')
    const h = React.createElement
    const NS = 'dshPluginShare'
    const REQUEST_TIMEOUT_MS = 180000
    const CSS_TAG_ID = 'dsh-plugin-share/PluginShareTab.module.css'

    // Same shape the shipped settings plugins use: one deduped <style> tag that
    // the client run removes again, styled only through --dsw-* tokens.
    const CSS = `
.dps-root{display:grid;gap:14px;width:100%;max-width:760px;color:var(--dsw-alias-label-primary)}
.dps-intro{margin:0;font-size:13px;line-height:1.5;color:var(--dsw-alias-label-tertiary)}
.dps-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px}
.dps-hint{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-label-tertiary)}
.dps-status{display:flex;align-items:flex-start;gap:8px;margin:0;font-size:13px;line-height:20px}
.dps-statusError{color:var(--dsw-alias-state-error-primary);white-space:pre-line}
.dps-statusOk{color:var(--dsw-alias-label-secondary)}
.dps-code{box-sizing:border-box;width:100%;padding:10px 12px;border:.5px solid var(--dsw-alias-border-l2);border-radius:12px;background:var(--dsw-alias-bg-layer-1);color:var(--dsw-alias-label-primary);font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;line-height:1.6;resize:vertical}
.dps-code:focus-visible{outline:2px solid var(--dsw-focus-ring-color,var(--dsw-alias-brand-primary));outline-offset:2px}
.dps-heading{margin:0 0 8px;font-size:13px;font-weight:600;line-height:20px}
.dps-cards{display:flex;flex-direction:column;gap:10px;margin:0;padding:0;list-style:none}
.dps-card{display:grid;gap:6px;padding:12px;border:.5px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}
.dps-cardHead{display:flex;flex-wrap:wrap;align-items:center;gap:8px;min-width:0}
.dps-name{min-width:0;font-size:13px;font-weight:600;line-height:20px;overflow-wrap:anywhere}
.dps-rowAction{margin-left:auto;flex:none}
.dps-history{max-height:360px;overflow:auto}
.dps-spec{font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.dps-reason{margin:0;font-size:12px;line-height:18px;white-space:pre-line;color:var(--dsw-alias-state-error-primary)}
.dps-notice{display:grid;gap:8px;padding:12px;border:.5px solid var(--dsw-alias-border-l1);border-radius:12px;background:color-mix(in srgb,var(--dsw-alias-state-warn-primary) 10%,transparent)}
.dps-noticeText{margin:0;font-size:13px;line-height:20px}
.dps-qr{display:flex;gap:16px;align-items:flex-start;padding:12px;border:.5px solid var(--dsw-alias-border-l1);border-radius:12px;background:var(--dsw-alias-bg-layer-1)}
.dps-qrCanvas{flex:none;line-height:0;border-radius:8px;overflow:hidden;background:#ffffff}
.dps-qrSide{display:grid;gap:8px;min-width:0}
.dps-qrMeta{margin:0;font-size:13px;font-weight:600;line-height:20px}
.dps-qrActions{display:flex;flex-wrap:wrap;gap:8px}
.dps-dropping{outline:2px dashed var(--dsw-alias-brand-primary);outline-offset:6px;border-radius:12px}
`

    const zh = {
      tab: '插件分享',
      intro: '组合码只包含插件来源、版本和启用状态，不包含配置或密钥。',
      export: '从当前 profile 导出',
      exportSelect: '选择要分享的插件',
      exportGenerate: '生成所选组合码',
      exportSelected: '项已选择',
      exportAll: '全选',
      exportNone: '取消全选',
      exportClose: '收起选择',
      exportEmpty: '请至少选择一个插件。',
      exportHint: '只包含勾选项的来源、版本与启用状态。生成后可复制或展示二维码。',
      exportOld: '请重启 DSH 以加载支持勾选导出的宿主半。',
      resultHistory: '逐项结果',
      resultClear: '清空结果记录',
      resultEmpty: '还没有操作结果。',
      resultHint: '本浏览器保留最近 100 次已返回结果的操作，包含重试记录；重新解析和刷新网页不会清除。记录不代表插件当前状态。',
      resultStorageWarning: '浏览器存储不可用，结果仅在当前页面保留。',
      resultSuccess: '成功',
      resultCancelled: '已取消',
      resultSkipped: '无需变更',
      parse: '解析组合码',
      installAll: '全部可处理项加入队列',
      copy: '复制',
      cancel: '取消当前安装',
      queueAdd: '加入队列',
      queueRemove: '移出队列',
      queuePosition: '排队第',
      queueWaiting: '项排队',
      queueDone: '项完成',
      queueClear: '清空等待项',
      queuePaused: '队列已暂停',
      queueFinished: '本轮队列已结束',
      queueRetry: '重试当前项',
      queueSkip: '跳过并继续',
      queueResume: '继续队列',
      queueChecking: '正在确认后台安装结果…',
      queueUnknown: '连接中断，尚未确认安装结果。后续项目已暂停，请重新连接。',
      queueReconnect: '重新连接',
      queueCancelling: '正在取消，等待当前操作结束…',
      queueApproval: '等待脚本授权',
      queueBusy: '另一项导入正在进行，请稍后重试。',
      queueRestart: '部分变更需要重启 DSH 后生效。',
      queueHint: '按点击顺序逐项处理；失败时暂停，已完成项目保留。',
      codePlaceholder: '在这里粘贴 D1 组合码…',
      entries: '插件清单',
      refused: '被拒绝',
      build: '安装需要运行构建脚本：',
      approveAndRetry: '允许脚本并重试',
      doneTag: '已完成',
      failedTag: '失败',
      copied: '已复制',
      success: '导入完成',
      successSkipped: '没有需要变更的条目，所有插件都已是当前状态。',
      exported: '已生成组合码，长度',
      exportedSkipped: '个插件未导出（本地路径或来源不支持）',
      failure: '操作失败',
      exportFailed: '当前 profile 没有可导出的可移植插件。',
      rowInstall: '安装',
      rowManualUpdate: '需手动更新',
      manualUpdateReason: '该插件已安装，需先更新版本或来源。Web profile 请退出 DSH 后用 CLI 更新到上方规格；桌面 profile 请在应用内处理。完成后重新解析组合码。',
      ambiguousSourceReason: '多个已安装插件对应这个来源，无法确定目标。请先在插件管理中核对，再重新解析。',
      manualRequired: '需手动处理的条目不会加入队列，其他插件可以继续安装。处理完成后重新解析。',
      rowEnable: '启用',
      rowDisable: '停用',
      rowCurrent: '已是当前版本',
      rowWorking: '处理中…',
      rowDone: '已完成',
      working: '正在处理…',
      hintSingle: '安装期间可继续点选其他插件加入队列。',
      hostOld: '请重启 DSH 以加载支持安装队列的宿主半，再重新解析。',
      needCode: '先在下面粘贴组合码',
      needParse: '再点击「解析组合码」',
      stale: '组合码已改动，请重新解析',
      total: '共',
      willRun: '项待处理',
      qr: '展示二维码',
      qrHide: '收起二维码',
      qrSave: '保存 SVG',
      qrSavePng: '保存 PNG',
      qrAlt: '组合码二维码',
      qrVersion: '版本',
      qrNote: '用手机相机扫码即可把组合码带走，扫出来就是文本框里这段码。',
      qrTooLong: '组合码太长，做不成二维码；可先精简插件清单，或直接用文本分享。',
      scan: '扫码导入',
      scanFromFile: '选择图片…',
      scanDropHint: '也可以把图片直接拖进这个面板',
      scanBusy: '识别中…',
      scanDone: '已识别组合码并解析',
      scanDrop: '松手即识别',
      scanTooSmall: '图片太小，识别不了',
      scanUnreadable: '二维码不完整或太模糊，识别失败',
      scanNotFound: '图片里没找到二维码',
      scanNotCode: '认出二维码了，但内容不是插件分享码',
      scanBadImage: '图片数据无效',
    }
    const en = {
      tab: 'Plugin share',
      intro: 'Codes contain plugin sources, versions, and enablement only; no settings or secrets.',
      export: 'Export current profile',
      exportSelect: 'Select plugins to share',
      exportGenerate: 'Generate selected code',
      exportSelected: 'selected',
      exportAll: 'Select all',
      exportNone: 'Deselect all',
      exportClose: 'Close selection',
      exportEmpty: 'Select at least one plugin.',
      exportHint: 'Only checked plugins and their sources, versions and enablement are included. Then copy the code or show its QR code.',
      exportOld: 'Restart DSH to load the host half with selective export support.',
      resultHistory: 'Item results',
      resultClear: 'Clear result history',
      resultEmpty: 'No operation results yet.',
      resultHint: 'This browser keeps the last 100 operations with a returned result, including retries, across parsing and page reloads. History does not represent the current plugin state.',
      resultStorageWarning: 'Browser storage is unavailable. Results are kept only on this page.',
      resultSuccess: 'Succeeded',
      resultCancelled: 'Cancelled',
      resultSkipped: 'No change needed',
      parse: 'Parse code',
      installAll: 'Queue all available',
      copy: 'Copy',
      cancel: 'Cancel current install',
      queueAdd: 'Add to queue',
      queueRemove: 'Remove from queue',
      queuePosition: 'Queue position',
      queueWaiting: 'queued',
      queueDone: 'completed',
      queueClear: 'Clear waiting items',
      queuePaused: 'Queue paused',
      queueFinished: 'Queue finished',
      queueRetry: 'Retry current item',
      queueSkip: 'Skip and continue',
      queueResume: 'Resume queue',
      queueChecking: 'Checking the installation result on the host…',
      queueUnknown: 'Connection lost; the installation result is not yet confirmed. The queue is paused. Reconnect to continue.',
      queueReconnect: 'Reconnect',
      queueCancelling: 'Cancelling; waiting for the current operation to finish…',
      queueApproval: 'Awaiting script approval',
      queueBusy: 'Another import is running. Retry when it finishes.',
      queueRestart: 'Some changes require a DSH restart to take effect.',
      queueHint: 'Items run in click order. A failure pauses the queue; completed items are kept.',
      codePlaceholder: 'Paste a D1 share code here…',
      entries: 'Plugin list',
      refused: 'Refused',
      build: 'Installation requests build scripts:',
      approveAndRetry: 'Allow scripts and retry',
      doneTag: 'Done',
      failedTag: 'Failed',
      copied: 'Copied',
      success: 'Import complete',
      successSkipped: 'Nothing to change; every plugin is already current.',
      exported: 'Share code generated, length',
      exportedSkipped: 'plugin(s) not exported (local paths or unsupported sources)',
      failure: 'Operation failed',
      exportFailed: 'No portable plugins are available in this profile.',
      rowInstall: 'Install',
      rowManualUpdate: 'Manual update needed',
      manualUpdateReason: 'This plugin is installed and needs a version or source change. For a Web profile, stop DSH and use the CLI to apply the spec above; manage desktop profiles in the app. Then parse the code again.',
      ambiguousSourceReason: 'Several installed plugins match this source. Check them in plugin management, then parse the code again.',
      manualRequired: 'Entries needing manual attention stay out of the queue. Other plugins can still be installed. Parse again after resolving these entries.',
      rowEnable: 'Enable',
      rowDisable: 'Disable',
      rowCurrent: 'Already current',
      rowWorking: 'Working…',
      rowDone: 'Done',
      working: 'Working…',
      hintSingle: 'While an installation runs, click other plugins to queue them.',
      hostOld: 'Restart DSH to load the host half with queue support, then parse again.',
      needCode: 'Paste a share code below first',
      needParse: 'then click "Parse code"',
      stale: 'The code changed; parse it again',
      total: 'Total',
      willRun: 'to apply',
      qr: 'Show QR code',
      qrHide: 'Hide QR code',
      qrSave: 'Save SVG',
      qrSavePng: 'Save PNG',
      qrAlt: 'Share code QR',
      qrVersion: 'Version',
      qrNote: 'Point a phone camera at it to carry the code away; it decodes to exactly the text in the box.',
      qrTooLong: 'This code is too long for a QR code. Trim the plugin list or share it as text.',
      scan: 'Scan a code',
      scanFromFile: 'Choose an image…',
      scanDropHint: 'or drop an image straight onto this panel',
      scanBusy: 'Reading…',
      scanDone: 'Scanned the code and parsed it',
      scanDrop: 'Drop to read it',
      scanTooSmall: 'That image is too small to read',
      scanUnreadable: 'The QR code is incomplete or too blurry to read',
      scanNotFound: 'No QR code found in that image',
      scanNotCode: 'Found a QR code, but it is not a plugin share code',
      scanBadImage: 'That image data is not usable',
    }

    function publicLabel(entry) {
      if (!entry) return ''
      if (entry.kind === 'github') return entry.spec ?? entry.value ?? ''
      return entry.name ?? entry.value ?? ''
    }

    function sourceLabel(entry) {
      if (entry?.kind === 'github') return 'github.com'
      if (entry?.kind === 'builtin') return 'builtin'
      return 'npm'
    }

    function entrySpec(entry) {
      const label = publicLabel(entry)
      return entry.kind === 'npm' && entry.version ? `${label}@${entry.version}` : label
    }

    // Store only public identifiers and short result codes, never raw package
    // manager output, share codes, configuration, or running work.
    function createResultHistory(storage = () => globalThis.localStorage) {
      const key = 'dsh-plugin-share:results:v1'
      let items = []
      let storageWarning = false
      const clean = (item) => {
        if (!item || typeof item.id !== 'string' || !item.id || item.id.length > 200
          || typeof item.label !== 'string' || item.label.length > 1000
          || typeof item.spec !== 'string' || item.spec.length > 2000
          || typeof item.at !== 'string' || !Number.isFinite(Date.parse(item.at))
          || !['install', 'set-enabled', 'skip', 'upgrade'].includes(item.action)
          || !['success', 'failed', 'cancelled', 'approval', 'skipped'].includes(item.outcome)) return null
        return { id: item.id, label: item.label, spec: item.spec, at: item.at,
          action: item.action, outcome: item.outcome, enabled: item.enabled !== false,
          restart: item.restart === true,
          reason: typeof item.reason === 'string' && /^[\w.:-]{1,120}$/u.test(item.reason) ? item.reason : '' }
      }
      try {
        const saved = JSON.parse(storage()?.getItem(key) ?? 'null')
        if (saved?.version === 1 && Array.isArray(saved.items)) items = saved.items.map(clean).filter(Boolean).slice(-100)
        if (!storage()) storageWarning = true
      } catch { storageWarning = true }
      const persist = () => {
        try {
          const target = storage()
          if (!target) throw new Error('storage-unavailable')
          target.setItem(key, JSON.stringify({ version: 1, items }))
          storageWarning = false
        } catch { storageWarning = true }
      }
      return {
        snapshot: () => ({ items: items.map((item) => ({ ...item })), storageWarning }),
        add(value) {
          const item = clean(value)
          if (!item || items.some((existing) => existing.id === item.id)) return
          items = [...items, item].slice(-100)
          persist()
        },
        clear() { items = []; persist() },
      }
    }

    function rowIndexOf(row, position) {
      return Number.isInteger(row?.index) ? row.index : position
    }

    /** The per-row button label and whether that row is actionable. */
    function rowButton(row, t) {
      if (row.action === 'upgrade') return { label: t('rowManualUpdate'), disabled: true, refused: true }
      if (row.verdict && row.verdict.ok === false) return { label: t('refused'), disabled: true, refused: true }
      if (row.action === 'skip') return { label: t('rowCurrent'), disabled: true }
      if (row.action === 'set-enabled') return { label: row.entry.enabled ? t('rowEnable') : t('rowDisable'), disabled: false }
      return { label: t('rowInstall'), disabled: false }
    }

    function reasonText(reason, t) {
      if (reason === 'manual-update-required') return t('manualUpdateReason')
      if (reason === 'installed-source-ambiguous') return t('ambiguousSourceReason')
      if (reason === 'import-busy') return t('queueBusy')
      return reason
    }

    /** A single queue survives settings-tab unmounts, but never a page reload. */
    function createImportQueue(send, { wait = () => new Promise((resolve) => setTimeout(resolve, 1000)), history = createResultHistory() } = {}) {
      let code = ''
      let rows = []
      let waiting = []
      let current = null
      let phase = 'idle'
      let stopAfterCurrent = false
      let cancelError = ''
      let restartRequired = false
      const done = new Set()
      const errors = new Map()
      const listeners = new Set()
      const snapshot = () => ({ code, rows, waiting: [...waiting], current: current && { ...current }, phase,
        done: [...done], errors: Object.fromEntries(errors), cancelling: stopAfterCurrent, cancelError, restartRequired, history: history.snapshot() })
      const notify = () => { const value = snapshot(); for (const listener of listeners) listener(value) }
      const locked = () => phase !== 'idle' || waiting.length > 0
      const safeSend = async (path, body) => {
        try { return await send(path, body) } catch (error) { return { ok: false, error: error.message ?? 'request-failed' } }
      }
      const actionable = (index) => rows.some((row, position) => rowIndexOf(row, position) === index
        && !rowButton(row, (key) => key).disabled)
      const available = (index) => actionable(index) && !done.has(index) && current?.index !== index && !waiting.includes(index)

      async function execute(item) {
        let result = await safeSend('import', item.body)
        // A transport timeout does not cancel the package manager. Only a host
        // receipt may release this queue's next writer.
        while (result.state !== 'finished' && result.state !== 'rejected') {
          phase = 'checking'
          notify()
          result = await safeSend('import-status', { requestId: item.body.requestId })
          if (result.state === 'finished') break
          if (result.state !== 'running') {
            phase = 'uncertain'
            notify()
            return
          }
          await wait()
        }
        if (Array.isArray(result.preview)) rows = result.preview
        item.result = result
        const report = (result.report ?? []).find((row) => row.row?.index === item.index) ?? result.report?.[0]
        history.add({ id: item.body.requestId, at: new Date().toISOString(),
          label: publicLabel(item.row?.entry), spec: item.row?.spec ?? '',
          action: report?.row?.action ?? item.row?.action ?? 'install', enabled: item.row?.entry?.enabled,
          outcome: result.ok ? (report?.status === 'skipped' ? 'skipped' : 'success')
            : result.pendingBuilds?.length ? 'approval'
              : ['install-cancelled', 'import-cancelled'].includes(result.error) ? 'cancelled' : 'failed',
          reason: result.error === 'operation-error'
            ? (failureReason(result)?.match(/\bERR_[A-Z0-9_]+\b/u)?.[0] ?? result.operation?.packageResult?.kind ?? result.error)
            : result.error,
          restart: (result.report ?? []).some((row) => row.result?.application === 'restart-required') })
        if (result.ok) {
          done.add(item.index)
          errors.delete(item.index)
          restartRequired ||= (result.report ?? []).some((row) => row.result?.application === 'restart-required')
          current = null
          phase = stopAfterCurrent && waiting.length > 0 ? 'paused' : 'idle'
        } else {
          errors.set(item.index, result)
          phase = 'paused'
        }
        notify()
        pump()
      }

      function start(index, approvedBuilds) {
        stopAfterCurrent = false
        cancelError = ''
        phase = 'running'
        current = { index, row: rows.find((row, position) => rowIndexOf(row, position) === index), body: { code, confirm: true,
          requestId: globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`,
          only: [index], ...(approvedBuilds ? { approvedBuilds } : {}) } }
        errors.delete(index)
        notify()
        void execute(current)
      }

      function pump() {
        if (phase !== 'idle' || !waiting.length) return
        start(waiting.shift())
      }

      return {
        snapshot, locked, available,
        clearHistory() { history.clear(); notify() },
        subscribe(listener) { listeners.add(listener); listener(snapshot()); return () => listeners.delete(listener) },
        configure(value, preview) {
          if (locked()) return false
          code = value
          rows = preview
          done.clear()
          errors.clear()
          cancelError = ''
          restartRequired = false
          current = null
          stopAfterCurrent = false
          notify()
          return true
        },
        enqueue(indices, expectedCode) {
          // The visible preview must belong to this exact queue snapshot.
          // Check here, synchronously with insertion, rather than at render time.
          if (!code || expectedCode !== code) return false
          for (const index of indices) if (available(index)) waiting.push(index)
          notify()
          pump()
          return true
        },
        remove(index) { waiting = waiting.filter((value) => value !== index); notify() },
        clearWaiting() {
          waiting = []
          if (phase === 'paused' && current === null) phase = 'idle'
          notify()
        },
        retry(approvedBuilds) {
          if (phase !== 'paused' || !current) return
          if (current.result?.pendingBuilds?.length && !approvedBuilds) return
          start(current.index, approvedBuilds)
        },
        skip() {
          if (phase !== 'paused') return
          current = null
          phase = 'idle'
          stopAfterCurrent = false
          notify()
          pump()
        },
        reconnect() {
          if (phase !== 'uncertain' || !current) return
          phase = 'checking'
          notify()
          // Reuse the original id and body: the host replays its receipt instead
          // of running the same install twice, even if the first reply was lost.
          void execute(current)
        },
        async cancel() {
          if (!current || phase === 'paused' || stopAfterCurrent) return
          stopAfterCurrent = true
          const item = current
          notify()
          const result = await safeSend('cancel', { requestId: item.body.requestId })
          if (!result.ok && result.state !== 'finished' && current === item) cancelError = failureReason(result)
          notify()
        },
      }
    }

    const QR_QUIET_ZONE = 4
    const QR_MODULE_SIZE = 4

    /** One path command per dark module, in a 4-module quiet zone. */
    function qrPath(modules) {
      const parts = []
      for (let row = 0; row < modules.length; row += 1) {
        const line = modules[row]
        for (let col = 0; col < line.length; col += 1) {
          if (line[col] !== '1') continue
          const x = (col + QR_QUIET_ZONE) * QR_MODULE_SIZE
          const y = (row + QR_QUIET_ZONE) * QR_MODULE_SIZE
          parts.push(`M${x} ${y}h${QR_MODULE_SIZE}v${QR_MODULE_SIZE}h-${QR_MODULE_SIZE}z`)
        }
      }
      return parts.join('')
    }

    function qrExtent(size) {
      return (size + QR_QUIET_ZONE * 2) * QR_MODULE_SIZE
    }

    /**
     * Turn a failed import into something a human can act on.
     *
     * The plugin manager answers a failed install with a bare `operation-error`
     * plus the package manager's own diagnostic, which is a full transcript:
     * lockfile chatter first, then the actual failure, then the remedy. Showing
     * only the code leaves the user with nothing to do, and showing the whole
     * transcript buries the reason, so the transcript is cut down to the part
     * that carries the error and its suggestion.
     */
    function failureReason(result) {
      if (!result || typeof result !== 'object') return ''
      const operation = result.operation
      const diagnostic = operation?.error?.diagnostic
      if (typeof diagnostic === 'string' && diagnostic.trim() !== '') {
        const lines = diagnostic
          .replace(/\u001b\[[0-9;]*m/gu, '')
          .split(/\r?\n/u)
          .map((line) => line.trimEnd())
          .filter((line) => line.trim() !== '' && !/^(\?|✓|✗|Progress:|Packages:|Done in|dependencies:|\+ |\[WARN\])/u.test(line.trim()))
        const start = lines.findIndex((line) => /^(Error|ERR_|×|╰─▶)/u.test(line.trim()))
        const tail = start === -1 ? lines : lines.slice(start)
        const kept = tail.slice(0, 4)
        // The package manager puts the remedy on its own `help:` line, usually
        // just past the truncated part — keep it even when it falls outside.
        const help = tail.slice(0, 8).find((line) => /^help:/u.test(line.trim()))
        if (help !== undefined && !kept.includes(help)) kept.push(help)
        const reason = kept.join('\n').trim()
        return reason === '' ? result.error : reason
      }
      const kind = operation?.packageResult?.kind
      if (operation?.application === 'failed' && typeof kind === 'string') return kind
      return result.error
    }

    /** The same symbol as the on-screen one, as a file the user can keep. */
    function qrSvgSource(qr) {
      const extent = qrExtent(qr.size)
      return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${extent} ${extent}" width="${extent}" height="${extent}" shape-rendering="crispEdges">`
        + `<rect width="${extent}" height="${extent}" fill="#ffffff"/>`
        + `<path d="${qrPath(qr.modules)}" fill="#000000"/></svg>`
    }

    function downloadBlob(blob, filename) {
      const url = URL.createObjectURL(blob)
      const anchor = document.createElement('a')
      anchor.href = url
      anchor.download = filename
      document.body.appendChild(anchor)
      anchor.click()
      anchor.remove()
      setTimeout(() => URL.revokeObjectURL(url), 1000)
    }

    function toBase64(bytes) {
      let binary = ''
      const chunk = 0x8000
      for (let i = 0; i < bytes.length; i += chunk) {
        binary += String.fromCharCode(...bytes.subarray(i, i + chunk))
      }
      return btoa(binary)
    }

    /**
     * Read an image file into the grayscale buffer the host half scans. Long
     * sides are capped so a full-screen screenshot stays a reasonable payload.
     */
    async function imageFileToGray(file, maxSide = 1400) {
      const url = URL.createObjectURL(file)
      try {
        const image = new Image()
        image.src = url
        await image.decode()
        const sourceWidth = image.naturalWidth || image.width
        const sourceHeight = image.naturalHeight || image.height
        if (!sourceWidth || !sourceHeight) throw new Error('image-decode-failed')
        const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight))
        const width = Math.max(1, Math.round(sourceWidth * scale))
        const height = Math.max(1, Math.round(sourceHeight * scale))
        const canvas = document.createElement('canvas')
        canvas.width = width
        canvas.height = height
        const context = canvas.getContext('2d', { willReadFrequently: true })
        if (!context) throw new Error('canvas-unavailable')
        context.drawImage(image, 0, 0, width, height)
        const { data } = context.getImageData(0, 0, width, height)
        const gray = new Uint8Array(width * height)
        for (let i = 0, p = 0; i < gray.length; i += 1, p += 4) {
          gray[i] = Math.round(0.299 * data[p] + 0.587 * data[p + 1] + 0.114 * data[p + 2])
        }
        return { width, height, gray }
      } finally {
        URL.revokeObjectURL(url)
      }
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

    const importQueue = createImportQueue(request)

    function Preview({ rows, t, busy, queue, canSelect, onApply, onRemove }) {
      return h('ul', { className: 'dps-cards' }, rows.map((row, position) => {
        const entry = row.entry ?? {}
        const index = rowIndexOf(row, position)
        const button = rowButton(row, t)
        const reason = reasonText(row.action === 'upgrade' ? 'manual-update-required' : row.verdict?.reason, t)
        const current = queue.current?.index === index
        const queued = queue.waiting.indexOf(index)
        const completed = queue.done.includes(index)
        const failure = queue.errors[index]
        const label = completed ? t('rowDone')
          : current ? (queue.phase === 'paused' ? (failure?.pendingBuilds?.length ? t('queueApproval') : t('failedTag')) : t('rowWorking'))
            : queued >= 0 ? t('queueRemove')
              : failure && !button.disabled ? t('queueRetry')
                : queue.phase !== 'idle' && !button.disabled ? t('queueAdd') : button.label
        return h('li', { key: `${index}-${publicLabel(entry)}`, className: 'dps-card' },
          h('div', { className: 'dps-cardHead' },
            h('span', { className: 'dps-name' }, publicLabel(entry)),
            h(Tag, { tone: 'outline' }, sourceLabel(entry)),
            queued >= 0 ? h(Tag, { tone: 'outline' }, `${t('queuePosition')} ${queued + 1}`) : null,
            h(Button, {
              className: 'dps-rowAction',
              variant: 'outline',
              size: 'sm',
              disabled: busy || current || completed || (queued < 0 && button.disabled) || !canSelect,
              title: button.refused ? (reason ?? t('refused')) : (canSelect ? label : t('hostOld')),
              onClick: () => queued >= 0 ? onRemove(index) : onApply(row, position),
            }, label)),
          h('code', { className: 'dps-spec' }, row.action === 'upgrade' ? (row.manualSpec ?? row.spec) : row.spec),
          button.refused
            ? h('p', { className: 'dps-reason' }, reason ?? t('refused'))
            : null,
          failure && !failure.pendingBuilds?.length
            ? h('p', { className: 'dps-reason' }, reasonText(failureReason(failure), t)) : null)
      }))
    }

    function PluginShareTab({ t }) {
      const [queue, setQueue] = React.useState(() => importQueue.snapshot())
      const [code, setCode] = React.useState(queue.code)
      const [parsedCode, setParsedCode] = React.useState(queue.code)
      const [preview, setPreview] = React.useState(queue.code ? queue.rows : null)
      const [status, setStatus] = React.useState(null)
      const [busy, setBusy] = React.useState(false)
      const [selection, setSelection] = React.useState(Boolean(queue.code))
      const [exportCandidates, setExportCandidates] = React.useState(null)
      const [exportSelection, setExportSelection] = React.useState([])
      const [exportSkipped, setExportSkipped] = React.useState(0)
      const [qr, setQr] = React.useState(null)
      const [qrBusy, setQrBusy] = React.useState(false)
      const [menuOpen, setMenuOpen] = React.useState(false)
      const [scanBusy, setScanBusy] = React.useState(false)
      const [dragging, setDragging] = React.useState(false)
      const fileInput = React.useRef(null)
      const rootRef = React.useRef(null)
      const scanRef = React.useRef(null)
      const interaction = React.useRef(false)
      const view = React.useRef(null)

      React.useEffect(() => {
        const token = {}
        view.current = token
        const unsubscribe = importQueue.subscribe(setQueue)
        return () => {
          view.current = null
          unsubscribe()
        }
      }, [])
      const ownsView = (token) => token !== null && view.current === token

      const trimmed = code.trim()
      const parsed = preview !== null && parsedCode !== '' && parsedCode === trimmed
      const stale = preview !== null && parsedCode !== trimmed
      const locked = busy || scanBusy || importQueue.locked()
      const rows = parsed && queue.code === parsedCode ? queue.rows : preview
      const pending = queue.current?.result?.pendingBuilds

      const clear = () => {
        if (!view.current) return
        setPreview(null)
        setParsedCode('')
        importQueue.configure('', [])
        setSelection(false)
        setQr(null)
      }

      const enqueue = (indices) => {
        if (!view.current || interaction.current || !parsed || !selection) return
        setStatus(null)
        if (!importQueue.enqueue(indices, parsedCode)) setStatus({ kind: 'error', text: t('stale') })
      }

      const exportCurrent = async () => {
        const token = view.current
        if (!token || interaction.current || importQueue.locked()) return
        interaction.current = true
        setBusy(true)
        setStatus(null)
        try {
          const result = await request('export-preview', {})
          if (!ownsView(token)) return
          if (result.ok && Array.isArray(result.entries)) {
            setExportCandidates(result.entries)
            setExportSelection(result.entries.map((_, index) => index))
            setExportSkipped(Array.isArray(result.skipped) ? result.skipped.length : 0)
          } else {
            setStatus({ kind: 'error', text: result.httpStatus === 404 ? t('exportOld') : `${t('failure')}: ${result.error}` })
          }
        } finally {
          if (ownsView(token)) {
            interaction.current = false
            setBusy(false)
          }
        }
      }

      const generateExport = async () => {
        const token = view.current
        if (!token || interaction.current || importQueue.locked() || !exportCandidates) return
        const entries = exportCandidates.filter((_, index) => exportSelection.includes(index))
        if (!entries.length) { setStatus({ kind: 'error', text: t('exportEmpty') }); return }
        interaction.current = true
        setBusy(true)
        setStatus(null)
        try {
          const result = await request('export', { entries })
          if (!ownsView(token)) return
          if (result.ok && result.code) {
            setCode(result.code)
            // A fresh export replaces the code, so any parsed list no longer
            // describes what is in the box.
            clear()
            setExportCandidates(null)
            setStatus({
              kind: 'ok',
              text: `${entries.length} ${t('exportSelected')} · ${t('exported')} · ${result.code.length}${exportSkipped > 0 ? ` · ${exportSkipped} ${t('exportedSkipped')}` : ''}`,
            })
          } else {
            const reason = result.error === 'entries-invalid' ? t('exportFailed') : result.error
            setStatus({ kind: 'error', text: `${t('failure')}: ${reason}` })
          }
        } finally {
          if (ownsView(token)) {
            interaction.current = false
            setBusy(false)
          }
        }
      }

      const parseCode = async (value, { quiet = false, fromScan = false } = {}) => {
        const token = view.current
        if (!token || importQueue.locked() || (interaction.current && !fromScan)) return false
        interaction.current = true
        setExportCandidates(null)
        const text = value.trim()
        setBusy(true)
        if (!quiet) setStatus(null)
        try {
          const result = await request('parse', { code: text })
          // Closing settings invalidates all requests belonging to that view,
          // including failures which would otherwise clear a newer queue.
          if (!ownsView(token)) return false
          if (result.ok && result.preview) {
            const supported = result.selection === true && result.queue === true
            if (!importQueue.configure(supported ? text : '', supported ? result.preview : [])) return false
            setPreview(result.preview)
            setParsedCode(text)
            setSelection(supported)
            return true
          }
          clear()
          setStatus({
            kind: 'error',
            text: `${t('failure')}: ${result.error}${result.httpStatus ? ` (HTTP ${result.httpStatus})` : ''}`,
          })
          return false
        } finally {
          if (ownsView(token)) {
            if (!fromScan) interaction.current = false
            setBusy(false)
          }
        }
      }

      const parse = () => parseCode(trimmed)

      /** Read a QR image, put the code in the box and parse it right away. */
      const scanImageFile = async (file) => {
        const token = view.current
        if (!token || !file || interaction.current || importQueue.locked()) return
        interaction.current = true
        setScanBusy(true)
        setStatus(null)
        try {
          const { width, height, gray } = await imageFileToGray(file)
          if (!ownsView(token)) return
          const result = await request('scan', { width, height, gray: toBase64(gray) })
          if (!ownsView(token)) return
          if (result.ok && result.code) {
            setCode(result.code)
            setQr(null)
            const parsedOk = await parseCode(result.code, { quiet: true, fromScan: true })
            if (!ownsView(token)) return
            setStatus({
              kind: parsedOk ? 'ok' : 'error',
              text: parsedOk ? `${t('scanDone')} · ${result.entries} ${t('willRun')}` : t('failure'),
            })
            return
          }
          const reason = result.error === 'qr-not-found'
            ? t('scanNotFound')
            : result.error === 'qr-not-a-share-code'
              ? t('scanNotCode')
              : result.error === 'qr-unreadable'
                ? t('scanUnreadable')
                : result.error === 'qr-image-too-small'
                  ? t('scanTooSmall')
                  : t('scanBadImage')
          setStatus({ kind: 'error', text: reason })
        } catch (error) {
          if (ownsView(token)) setStatus({ kind: 'error', text: `${t('scanBadImage')}: ${error.message}` })
        } finally {
          if (ownsView(token)) {
            interaction.current = false
            setScanBusy(false)
          }
        }
      }
      scanRef.current = scanImageFile

      /**
       * Claim a file drag over this panel before the host page sees it.
       *
       * The DSH shell listens for drags on `document` to offer its attachment
       * drop zone. In a settings dialog there is no composer to accept a file,
       * so it sets `dropEffect = 'none'` — and per spec a drag whose drop effect
       * is `none` fires no `drop` event at all, so a plain `onDrop` here never
       * runs and the image is silently swallowed.
       *
       * Window capture runs before those document listeners, so a drag that is
       * over this panel is claimed here: propagation stops, the drop effect goes
       * back to `copy`, and the file reaches `scanImageFile`. Drags anywhere
       * else are left untouched for the shell to handle as usual.
       */
      React.useEffect(() => {
        const root = rootRef.current
        if (!root || typeof window === 'undefined') return undefined
        const carriesFiles = (event) => Array.from(event.dataTransfer?.types ?? []).includes('Files')
        const pointInside = (event) => {
          if (!event.clientX && !event.clientY) return false
          const rect = root.getBoundingClientRect()
          return event.clientX >= rect.left && event.clientX <= rect.right
            && event.clientY >= rect.top && event.clientY <= rect.bottom
        }
        const claimed = (event) => carriesFiles(event) && (root.contains(event.target) || pointInside(event))
        const onEnter = (event) => {
          if (!claimed(event)) return
          event.preventDefault()
          event.stopPropagation()
          setDragging(true)
        }
        const onOver = (event) => {
          if (!claimed(event)) return
          event.preventDefault()
          event.stopPropagation()
          if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
          setDragging(true)
        }
        const onLeave = (event) => {
          if (!carriesFiles(event)) return
          if (event.relatedTarget && root.contains(event.relatedTarget)) return
          setDragging(false)
        }
        const onDrop = (event) => {
          if (!claimed(event)) return
          event.preventDefault()
          event.stopPropagation()
          setDragging(false)
          const file = event.dataTransfer?.files?.[0]
          if (file) scanRef.current?.(file)
        }
        const onEnd = () => setDragging(false)
        window.addEventListener('dragenter', onEnter, true)
        window.addEventListener('dragover', onOver, true)
        window.addEventListener('dragleave', onLeave, true)
        window.addEventListener('drop', onDrop, true)
        window.addEventListener('dragend', onEnd, true)
        return () => {
          window.removeEventListener('dragenter', onEnter, true)
          window.removeEventListener('dragover', onOver, true)
          window.removeEventListener('dragleave', onLeave, true)
          window.removeEventListener('drop', onDrop, true)
          window.removeEventListener('dragend', onEnd, true)
        }
      }, [])

      const copy = async () => {
        try {
          await navigator.clipboard.writeText(code)
          setStatus({ kind: 'ok', text: t('copied') })
        } catch (error) {
          setStatus({ kind: 'error', text: `${t('failure')}: ${error.message}` })
        }
      }

      const toggleQr = async () => {
        if (qr) {
          setQr(null)
          return
        }
        setQrBusy(true)
        setStatus(null)
        try {
          const result = await request('qr', { code: trimmed })
          if (result.ok && Array.isArray(result.modules)) {
            setQr({ size: result.size, modules: result.modules, version: result.version, level: result.level })
          } else {
            setStatus({
              kind: 'error',
              text: `${t('failure')}: ${result.error === 'code-too-long-for-qr' ? t('qrTooLong') : result.error}`,
            })
          }
        } finally {
          setQrBusy(false)
        }
      }

      const saveQr = () => {
        if (!qr) return
        try {
          downloadBlob(new Blob([qrSvgSource(qr)], { type: 'image/svg+xml' }), 'dsh-plugin-share-code.svg')
        } catch (error) {
          setStatus({ kind: 'error', text: `${t('failure')}: ${error.message}` })
        }
      }

      /** The same symbol as a bitmap, for chat apps that do not show SVG. */
      const saveQrPng = () => {
        if (!qr) return
        try {
          const pixelsPerModule = 8
          const side = (qr.size + QR_QUIET_ZONE * 2) * pixelsPerModule
          const canvas = document.createElement('canvas')
          canvas.width = side
          canvas.height = side
          const context = canvas.getContext('2d')
          if (!context) throw new Error('canvas-unavailable')
          context.fillStyle = '#ffffff'
          context.fillRect(0, 0, side, side)
          context.fillStyle = '#000000'
          for (let row = 0; row < qr.size; row += 1) {
            for (let col = 0; col < qr.size; col += 1) {
              if (qr.modules[row][col] !== '1') continue
              context.fillRect(
                (col + QR_QUIET_ZONE) * pixelsPerModule,
                (row + QR_QUIET_ZONE) * pixelsPerModule,
                pixelsPerModule,
                pixelsPerModule,
              )
            }
          }
          canvas.toBlob((blob) => {
            if (!blob) {
              setStatus({ kind: 'error', text: `${t('failure')}: png-encode-failed` })
              return
            }
            downloadBlob(blob, 'dsh-plugin-share-code.png')
          }, 'image/png')
        } catch (error) {
          setStatus({ kind: 'error', text: `${t('failure')}: ${error.message}` })
        }
      }

      const blockedRows = rows ? rows.filter((row) => row.action === 'upgrade' || row.verdict?.ok === false).length : 0
      const pendingRows = rows ? rows.filter((row, position) => importQueue.available(rowIndexOf(row, position))).length : 0
      const currentRow = rows?.find((row, position) => rowIndexOf(row, position) === queue.current?.index)
      const queueVisible = queue.phase !== 'idle' || queue.done.length > 0 || Object.keys(queue.errors).length > 0
      const queueLabel = queue.phase === 'uncertain' ? t('queueUnknown')
        : queue.cancelling && queue.current && queue.phase !== 'paused' ? t('queueCancelling')
          : queue.phase === 'checking' ? t('queueChecking')
            : queue.phase === 'paused' ? (pending?.length ? t('queueApproval') : t('queuePaused'))
              : queue.current ? t('working') : t('queueFinished')
      const hint = busy
        ? t('working')
        : !trimmed
          ? t('needCode')
          : stale
            ? t('stale')
            : !parsed
              ? t('needParse')
              : blockedRows > 0
                ? t('manualRequired')
                : !selection
                  ? t('hostOld')
                  : `${t('total')} ${rows.length} · ${pendingRows} ${t('willRun')} · ${t('hintSingle')}`

      return h('section', { ref: rootRef, className: dragging ? 'dps-root dps-dropping' : 'dps-root' },
        h('p', { className: 'dps-intro' }, t('intro')),
        h('div', { className: 'dps-toolbar' },
          h(Button, { variant: 'outline', size: 'md', disabled: locked, onClick: exportCurrent }, t('export')),
          h(Button, {
            variant: parsed && pendingRows > 0 ? 'outline' : 'primary',
            size: 'md',
            disabled: locked || !trimmed,
            onClick: parse,
          }, t('parse')),
          h(Button, { variant: 'ghost', size: 'md', disabled: busy || !trimmed, onClick: copy }, t('copy')),
          h(Button, {
            variant: 'ghost',
            size: 'md',
            disabled: busy || qrBusy || !trimmed,
            onClick: toggleQr,
          }, qr ? t('qrHide') : t('qr')),
          h(Menu, {
            open: menuOpen,
            anchor: h(Button, {
              variant: 'ghost',
              size: 'md',
              disabled: locked,
              onClick: () => setMenuOpen((open) => !open),
            }, scanBusy ? t('scanBusy') : t('scan')),
            items: [
              { type: 'label', id: 'scan-hint', text: t('scanDropHint') },
              { id: 'scan-file', label: t('scanFromFile') },
            ],
            onSelect: (id) => {
              setMenuOpen(false)
              if (id === 'scan-file') fileInput.current?.click()
            },
            onClose: () => setMenuOpen(false),
            align: 'start',
          }),
          h('input', {
            ref: fileInput,
            type: 'file',
            accept: 'image/*',
            style: { display: 'none' },
            onChange: (event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) scanImageFile(file)
            },
          }),
          h(Button, {
            variant: parsed && pendingRows > 0 ? 'primary' : 'outline',
            size: 'md',
            disabled: busy || scanBusy || !parsed || !selection || pendingRows === 0,
            onClick: () => enqueue(rows.map(rowIndexOf)),
          }, t('installAll'))),
        exportCandidates ? h('section', { className: 'dps-card', 'aria-label': t('exportSelect') },
          h('h3', { className: 'dps-heading' }, t('exportSelect')),
          h('p', { className: 'dps-hint' }, t('exportHint')),
          h('p', { className: 'dps-hint' }, `${exportSelection.length} / ${exportCandidates.length} ${t('exportSelected')}`),
          exportSkipped > 0 ? h('p', { className: 'dps-hint' }, `${exportSkipped} ${t('exportedSkipped')}`) : null,
          exportCandidates.length === 0 ? h('p', { className: 'dps-hint' }, t('exportFailed')) : null,
          h('div', { className: 'dps-toolbar' },
            h(Button, { variant: 'ghost', size: 'sm', disabled: locked || exportSelection.length === exportCandidates.length,
              onClick: () => { if (!interaction.current && !importQueue.locked()) setExportSelection(exportCandidates.map((_, index) => index)) } }, t('exportAll')),
            h(Button, { variant: 'ghost', size: 'sm', disabled: locked || exportSelection.length === 0,
              onClick: () => { if (!interaction.current && !importQueue.locked()) setExportSelection([]) } }, t('exportNone'))),
          h('ul', { className: 'dps-cards' }, exportCandidates.map((entry, index) => h('li', { key: index, className: 'dps-card' },
            h(Checkbox, { label: publicLabel(entry), checked: exportSelection.includes(index), disabled: locked,
              onChange: (checked) => {
                if (interaction.current || importQueue.locked()) return
                setExportSelection((previous) => checked ? [...new Set([...previous, index])] : previous.filter((value) => value !== index))
              } }),
            h('code', { className: 'dps-spec' }, entrySpec(entry)),
            h('span', { className: 'dps-hint' }, `${sourceLabel(entry)} · ${entry.enabled === false ? t('rowDisable') : t('rowEnable')}`)))),
          h('div', { className: 'dps-toolbar' },
            h(Button, { variant: 'primary', size: 'md', disabled: locked || exportSelection.length === 0, onClick: generateExport }, t('exportGenerate')),
            h(Button, { variant: 'ghost', size: 'sm', disabled: busy, onClick: () => setExportCandidates(null) }, t('exportClose')))) : null,
        h('p', { className: 'dps-hint' }, dragging ? t('scanDrop') : hint),
        queueVisible ? h('div', { className: 'dps-card' },
          h('p', { className: 'dps-status', role: 'status', 'aria-live': 'polite' },
            `${queueLabel}${currentRow ? ` · ${publicLabel(currentRow.entry)}` : ''} · ${queue.waiting.length} ${t('queueWaiting')} · ${queue.done.length} ${t('queueDone')}`),
          h('p', { className: 'dps-hint' }, t('queueHint')),
          pending?.length ? h('p', { className: 'dps-noticeText' }, `${t('build')} ${pending.join(', ')}`) : null,
          queue.cancelError ? h('p', { className: 'dps-reason' }, `${t('failure')}: ${queue.cancelError}`) : null,
          queue.restartRequired ? h('p', { className: 'dps-hint' }, t('queueRestart')) : null,
          h('div', { className: 'dps-toolbar' },
            queue.phase === 'paused' && queue.current ? h(Button, {
              variant: 'outline', size: 'sm', onClick: () => importQueue.retry(pending),
            }, pending?.length ? t('approveAndRetry') : t('queueRetry')) : null,
            queue.phase === 'paused' ? h(Button, {
              variant: 'outline', size: 'sm', onClick: () => importQueue.skip(),
            }, queue.current ? t('queueSkip') : t('queueResume')) : null,
            queue.phase === 'uncertain' ? h(Button, {
              variant: 'outline', size: 'sm', onClick: () => importQueue.reconnect(),
            }, t('queueReconnect')) : null,
            queue.current && queue.phase !== 'paused' ? h(Button, {
              variant: 'ghost', size: 'sm', disabled: queue.cancelling, onClick: () => importQueue.cancel(),
            }, t('cancel')) : null,
            queue.waiting.length > 0 ? h(Button, {
              variant: 'ghost', size: 'sm', onClick: () => importQueue.clearWaiting(),
            }, t('queueClear')) : null)) : null,
        status ? h('p', { className: 'dps-status', role: 'status', 'aria-live': 'polite' },
          h(Tag, { tone: status.kind === 'error' ? 'danger' : 'success' }, status.kind === 'error' ? t('failedTag') : t('doneTag')),
          h('span', { className: status.kind === 'error' ? 'dps-statusError' : 'dps-statusOk' }, status.text)) : null,
        h('textarea', {
          className: 'dps-code',
          value: code,
          readOnly: locked,
          onChange: (event) => {
            if (interaction.current || importQueue.locked()) return
            const next = event.target.value
            setCode(next)
            if (next.trim() !== parsedCode) clear()
          },
          placeholder: t('codePlaceholder'),
          spellCheck: false,
          rows: 5,
        }),
        qr ? h('div', { className: 'dps-qr' },
          h('div', { className: 'dps-qrCanvas' },
            h('svg', {
              viewBox: `0 0 ${qrExtent(qr.size)} ${qrExtent(qr.size)}`,
              width: 208,
              height: 208,
              shapeRendering: 'crispEdges',
              role: 'img',
              'aria-label': t('qrAlt'),
            },
            h('rect', { width: qrExtent(qr.size), height: qrExtent(qr.size), fill: '#ffffff' }),
            h('path', { d: qrPath(qr.modules), fill: '#000000' }))),
          h('div', { className: 'dps-qrSide' },
            h('p', { className: 'dps-qrMeta' }, `${t('qrVersion')} ${qr.version} · ${qr.size}×${qr.size}`),
            h('p', { className: 'dps-hint' }, t('qrNote')),
            h('div', { className: 'dps-qrActions' },
              h(Button, { variant: 'outline', size: 'sm', onClick: saveQr }, t('qrSave')),
              h(Button, { variant: 'outline', size: 'sm', onClick: saveQrPng }, t('qrSavePng'))))) : null,
        preview ? h('div', null,
          h('h3', { className: 'dps-heading' }, t('entries')),
          h(Preview, {
            rows,
            t,
            busy: busy || scanBusy,
            queue,
            canSelect: selection,
            onApply: (row, position) => enqueue([rowIndexOf(row, position)]),
            onRemove: (index) => importQueue.remove(index),
          })) : null,
        h('section', { className: 'dps-card', 'aria-label': t('resultHistory') },
          h('div', { className: 'dps-cardHead' },
            h('h3', { className: 'dps-heading' }, `${t('resultHistory')} · ${queue.history.items.length}`),
            h(Button, { className: 'dps-rowAction', variant: 'ghost', size: 'sm', disabled: queue.history.items.length === 0,
              onClick: () => importQueue.clearHistory() }, t('resultClear'))),
          h('p', { className: 'dps-hint' }, t('resultHint')),
          queue.history.storageWarning ? h('p', { className: 'dps-reason' }, t('resultStorageWarning')) : null,
          queue.history.items.length === 0 ? h('p', { className: 'dps-hint' }, t('resultEmpty')) : null,
          h('ul', { className: 'dps-cards dps-history' }, [...queue.history.items].reverse().map((item) => h('li', { className: 'dps-card', key: item.id },
            h('div', { className: 'dps-cardHead' },
              h('span', { className: 'dps-name' }, item.label),
              h(Tag, { tone: item.outcome === 'failed' ? 'danger' : item.outcome === 'success' ? 'success' : 'outline' },
                item.outcome === 'success' ? t('resultSuccess') : item.outcome === 'cancelled' ? t('resultCancelled')
                  : item.outcome === 'approval' ? t('queueApproval') : item.outcome === 'skipped' ? t('resultSkipped') : t('failedTag'))),
            h('code', { className: 'dps-spec' }, item.spec),
            h('p', { className: 'dps-hint' }, `${new Date(item.at).toLocaleString()} · ${item.action === 'set-enabled'
              ? (item.enabled ? t('rowEnable') : t('rowDisable')) : item.action === 'skip' ? t('resultSkipped') : t('rowInstall')}`),
            item.reason ? h('p', { className: 'dps-reason' }, reasonText(item.reason, t)) : null,
            item.restart ? h('p', { className: 'dps-hint' }, t('queueRestart')) : null)))))
    }

    return {
      inject: ['slots', 'locale'],
      // Pure and worth pinning down: exposed so the tests can check exactly how
      // a failed import is worded, without mounting the tab.
      failureReason,
      createImportQueue,
      createResultHistory,
      apply(ctx) {
        const t = ctx.locale.bind(NS)
        ctx.effect(() => ctx.locale.register(NS, { zh, en }), 'dsh-plugin-share: dictionaries')
        ctx.effect(() => {
          if (typeof document === 'undefined') return () => {}
          const selector = `style[data-plugin-css="${CSS_TAG_ID}"]`
          if (document.querySelector(selector)) return () => {}
          const tag = document.createElement('style')
          tag.dataset.plugin = 'dsh-plugin-share'
          tag.dataset.pluginCss = CSS_TAG_ID
          tag.textContent = CSS
          document.head.appendChild(tag)
          return () => tag.remove()
        }, 'dsh-plugin-share: styles')
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
