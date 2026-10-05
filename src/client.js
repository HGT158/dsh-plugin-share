window.__ModuleLoader__.load({
  id: 'dsh-plugin-share',
  factory(require) {
    const React = require('react')
    const { Button, Tag, Menu } = require('@deepseek-ai/dsh-client-ui-primitives')
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
.dps-cardHead{display:flex;align-items:center;gap:8px;min-width:0}
.dps-name{min-width:0;font-size:13px;font-weight:600;line-height:20px;overflow-wrap:anywhere}
.dps-rowAction{margin-left:auto;flex:none}
.dps-spec{font-family:var(--ds-font-family-code,ui-monospace,SFMono-Regular,Menlo,monospace);font-size:12px;line-height:18px;color:var(--dsw-alias-label-secondary);overflow-wrap:anywhere}
.dps-reason{margin:0;font-size:12px;line-height:18px;color:var(--dsw-alias-state-error-primary)}
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
      parse: '解析组合码',
      installAll: '全部安装',
      copy: '复制',
      cancel: '取消',
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
      failure: '操作失败',
      exportFailed: '当前 profile 没有可导出的可移植插件。',
      rowInstall: '安装',
      rowUpgrade: '升级',
      rowEnable: '启用',
      rowDisable: '停用',
      rowCurrent: '已是当前版本',
      rowWorking: '处理中…',
      rowDone: '已完成',
      working: '正在处理…',
      hintSingle: '每个插件都可以单独处理，或点「全部安装」一次装完。',
      hostOld: '宿主半不支持单独安装，请重启 DSH 后再试（当前只能「全部安装」）。',
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
      parse: 'Parse code',
      installAll: 'Install all',
      copy: 'Copy',
      cancel: 'Cancel',
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
      failure: 'Operation failed',
      exportFailed: 'No portable plugins are available in this profile.',
      rowInstall: 'Install',
      rowUpgrade: 'Upgrade',
      rowEnable: 'Enable',
      rowDisable: 'Disable',
      rowCurrent: 'Already current',
      rowWorking: 'Working…',
      rowDone: 'Done',
      working: 'Working…',
      hintSingle: 'Apply any plugin on its own, or use Install all.',
      hostOld: 'This host half cannot apply single rows; restart DSH to retry. Only Install all is available.',
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

    function rowIndexOf(row, position) {
      return Number.isInteger(row?.index) ? row.index : position
    }

    /** The per-row button label and whether that row is actionable. */
    function rowButton(row, t) {
      if (row.verdict && row.verdict.ok === false) return { label: t('refused'), disabled: true, refused: true }
      if (row.action === 'skip') return { label: t('rowCurrent'), disabled: true }
      if (row.action === 'upgrade') return { label: t('rowUpgrade'), disabled: false }
      if (row.action === 'set-enabled') return { label: row.entry.enabled ? t('rowEnable') : t('rowDisable'), disabled: false }
      return { label: t('rowInstall'), disabled: false }
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

    function Preview({ rows, t, busy, busyRow, canSelect, onApply }) {
      return h('ul', { className: 'dps-cards' }, rows.map((row, position) => {
        const entry = row.entry ?? {}
        const index = rowIndexOf(row, position)
        const button = rowButton(row, t)
        const working = busyRow !== null && busyRow === index
        return h('li', { key: `${index}-${publicLabel(entry)}`, className: 'dps-card' },
          h('div', { className: 'dps-cardHead' },
            h('span', { className: 'dps-name' }, publicLabel(entry)),
            h(Tag, { tone: 'outline' }, sourceLabel(entry)),
            h(Button, {
              className: 'dps-rowAction',
              variant: 'outline',
              size: 'sm',
              disabled: busy || button.disabled || !canSelect,
              title: button.refused ? (row.verdict?.reason ?? t('refused')) : (canSelect ? button.label : t('hostOld')),
              onClick: () => onApply(row, position),
            }, working ? t('rowWorking') : button.label)),
          h('code', { className: 'dps-spec' }, row.spec),
          button.refused
            ? h('p', { className: 'dps-reason' }, `${t('refused')}: ${row.verdict.reason}`)
            : null)
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
      const [qr, setQr] = React.useState(null)
      const [qrBusy, setQrBusy] = React.useState(false)
      const [menuOpen, setMenuOpen] = React.useState(false)
      const [scanBusy, setScanBusy] = React.useState(false)
      const [dragging, setDragging] = React.useState(false)
      const fileInput = React.useRef(null)
      const rootRef = React.useRef(null)
      const scanRef = React.useRef(null)

      const trimmed = code.trim()
      const parsed = preview !== null && parsedCode !== '' && parsedCode === trimmed
      const stale = preview !== null && parsedCode !== trimmed

      const clear = () => {
        setPreview(null)
        setParsedCode('')
        setPending(null)
        setSelection(false)
        setQr(null)
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
        const target = index === null || !Array.isArray(preview)
          ? null
          : preview.find((row, position) => rowIndexOf(row, position) === index)
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
            const label = index === null ? t('success') : `${t('rowDone')} · ${target?.spec ?? ''}`
            setStatus({ kind: 'ok', text: acted.length === 0 ? t('successSkipped') : label })
            await refresh()
            return
          }
          setStatus({
            kind: 'error',
            text: `${t('failure')}: ${failureReason(result)}`,
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

      const parseCode = async (value, { quiet = false } = {}) => {
        const text = value.trim()
        setBusy(true)
        if (!quiet) setStatus(null)
        try {
          const result = await request('parse', { code: text })
          if (result.ok && result.preview) {
            setPreview(result.preview)
            setParsedCode(text)
            setPending(null)
            setSelection(result.selection === true)
            return true
          }
          clear()
          setStatus({
            kind: 'error',
            text: `${t('failure')}: ${result.error}${result.httpStatus ? ` (HTTP ${result.httpStatus})` : ''}`,
          })
          return false
        } finally {
          setBusy(false)
        }
      }

      const parse = () => parseCode(trimmed)

      /** Read a QR image, put the code in the box and parse it right away. */
      const scanImageFile = async (file) => {
        if (!file) return
        setScanBusy(true)
        setStatus(null)
        try {
          const { width, height, gray } = await imageFileToGray(file)
          const result = await request('scan', { width, height, gray: toBase64(gray) })
          if (result.ok && result.code) {
            setCode(result.code)
            setQr(null)
            const parsedOk = await parseCode(result.code, { quiet: true })
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
          setStatus({ kind: 'error', text: `${t('scanBadImage')}: ${error.message}` })
        } finally {
          setScanBusy(false)
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

      const cancel = () => request('cancel', { requestId })

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

      return h('section', { ref: rootRef, className: dragging ? 'dps-root dps-dropping' : 'dps-root' },
        h('p', { className: 'dps-intro' }, t('intro')),
        h('div', { className: 'dps-toolbar' },
          h(Button, { variant: 'outline', size: 'md', disabled: busy, onClick: exportCurrent }, t('export')),
          h(Button, {
            variant: parsed && pendingRows > 0 ? 'outline' : 'primary',
            size: 'md',
            disabled: busy || !trimmed,
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
              disabled: busy || scanBusy,
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
            disabled: busy || !parsed || pendingRows === 0,
            onClick: () => apply(null),
          }, t('installAll')),
          busy ? h(Button, { variant: 'ghost', size: 'md', disabled: !requestId, onClick: cancel }, t('cancel')) : null),
        h('p', { className: 'dps-hint' }, dragging ? t('scanDrop') : hint),
        status ? h('p', { className: 'dps-status', role: 'status', 'aria-live': 'polite' },
          h(Tag, { tone: status.kind === 'error' ? 'danger' : 'success' }, status.kind === 'error' ? t('failedTag') : t('doneTag')),
          h('span', { className: status.kind === 'error' ? 'dps-statusError' : 'dps-statusOk' }, status.text)) : null,
        h('textarea', {
          className: 'dps-code',
          value: code,
          onChange: (event) => {
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
            rows: preview,
            t,
            busy,
            busyRow,
            canSelect: selection,
            onApply: (row, position) => apply(rowIndexOf(row, position), undefined),
          })) : null,
        pending ? h('div', { className: 'dps-notice' },
          h('p', { className: 'dps-noticeText' }, t('build')),
          h('code', { className: 'dps-spec' }, pending.builds.join(', ')),
          h('div', null, h(Button, {
            variant: 'outline',
            size: 'sm',
            disabled: busy,
            onClick: () => apply(pending.index, pending.builds),
          }, t('approveAndRetry')))) : null)
    }

    return {
      inject: ['slots', 'locale'],
      // Pure and worth pinning down: exposed so the tests can check exactly how
      // a failed import is worded, without mounting the tab.
      failureReason,
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
