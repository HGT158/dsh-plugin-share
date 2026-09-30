# DSH Plugin Share v1 实施计划与现状

本文是当前代码的实现契约。若文档与代码冲突，以测试和当前源码为准；修改格式或安全边界时必须同时更新测试、README 和本文件。

## 1. 目标与非目标

目标是把一个 DSH profile 中可移植的插件清单编码成离线文本分享码，并在 DSH Web 的“设置 → 插件”中完成导出、预览和导入。分享码只携带：

- 来源类型：npm、GitHub 或 builtin；
- 包名或 GitHub spec；
- 可选版本/版本范围；
- 启用状态。

v1 不携带插件配置、patch、备注、作者、时间戳、凭据、认证信息或本机路径。v1 也不提供云短码、签名、历史存档、PNG 或 `.dshpkg` 文件载体。

## 2. DSH 官方 bundle 结构

本项目本身是一个可公开安装的 bundle，不是 profile：

```text
package.json
cordis.patch.yml
icon.svg
src/index.mjs       # Host 半
src/client.js       # Web Client 半
locale/*.json
README.md
PLAN.md
```

`package.json` 必须满足 DSH 官方组合包约定：

- `dsh.bundle.patch` 为 `./cordis.patch.yml`；
- `dsh.client.platform` 为 `web`；
- `dsh.client.inject` 声明其依赖的设置插件入口；
- `exports["."]` 指向 Host 入口，`exports["./client"]` 指向客户端 bundle；
- patch 行 `name` 必须与包名 `dsh-plugin-share` 一致。

`cordis.patch.yml` 只插入 `dsh-plugin-share` 这一行，默认配置为空。Host 使用 `webServer` 和 `pluginManager`，Client 使用 `slots` 与 `locale`，不直接读取 profile 文件。

## 3. D1 外层帧与 NP1 记录

组合码格式为：

```text
D1 + base64url(frame)
frame = formatVersion(1 byte) + algorithm(1 byte) + body + crc32(payload)(little-endian 4 bytes)
payload = NP1-style binary records
```

- `formatVersion` 当前为 `1`；未知版本拒绝；
- `algorithm=0` 表示 body 是原始 NP1 payload；
- `algorithm=1` 表示 body 是 `deflate-raw` payload；
- CRC32 校验未压缩的 payload，负责发现复制、截断和篡改造成的传输错误；它不是签名，也不提供身份认证；
- base64url 必须是规范形式；允许复制粘贴时混入空白，但解码后仍须通过所有边界校验；
- 帧上限为 64 KiB，NP1 payload 上限为 256 KiB，条目上限为 512。

NP1 风格记录使用 varint、相邻值公共前缀、6-bit 常用字符表和版本表。记录另外加入来源 kind 与 enabled 位：

```text
kind: npm=0, github=1, builtin=2
enabled: boolean
value: package name or github:owner/repo[#ref]
version: null or validated version expression
```

所有解码后的 wire 值还要经过 `normalizeEntry` 和来源白名单复核，不能仅因为 CRC 正确就交给安装器。

### D1 + NP1 压缩决策（D1 + NP1 方案）

- 少于 8 个条目的短清单固定使用原始 NP1 二进制；
- 8 个或更多条目的长清单才尝试 `deflate-raw`；
- 长清单只有在压缩结果严格短于原始 payload 时才选择 deflate，否则选择 raw；
- 压缩算法不会改变 payload、CRC 或解码结果。

阈值由 `DEFLATE_MIN_ENTRIES` 定义，编码器和测试共同锁定该规则。

## 4. 输入模型与来源白名单

`normalizeEntry` 只接受来源、名称/spec、版本、启用状态和 optional 标记。以下字段直接拒绝：`config`、`settings`、`patch`、`token`、`apiKey`、任意未知字段等。

允许：

- npm 包名，可带版本、版本范围或 prerelease；
- `github:owner/repo`，可选不含空白的 `#ref`；
- builtin 包名和 enabled 状态。

拒绝：

- `file:`、`link:`、`portal:`、`workspace:`；
- 相对路径、Windows 或 Unix 绝对路径；
- HTTP(S) tarball、任意 HTTP(S) URL、`git+...`、`git@...`、`ssh://...`；
- npm alias、空值、超长值、空白/控制字符和不合法包名。

安装 spec 只从规范化条目生成，不接受调用方传入的任意安装参数。

## 5. 采集：导出哪些、怎么过滤

Host 的 `collectEntries` 接收 `pluginManager.listBundles()` 的公开记录，以及由 bundle 记录组成的依赖映射；它不读取 `cordis.patch.yml`、配置文件、凭据文件或其他本机秘密文件。

过滤规则：

- `installed === true && removable === true` 的第三方 bundle 进入候选；
- `optional === true && installed !== true` 的官方可选 bundle，在 `includeOptional` 开启时作为 builtin 进入；
- `removable === false` 的固定核心层跳过；
- 缺失来源、别名、远端 Git、tarball、本地 spec 和不支持的依赖形状进入 `skipped`，不会进入分享码；
- `pin` 默认开启，用已解析的 bundle 版本锁定 npm 条目；关闭时保留跟随最新版本的语义；
- enabled 状态始终保留，但不传播配置内容。

导出前由 `encodeCode` 再次规范化所有公开条目，因此采集器的错误不会绕过输入校验。

## 6. 导入：解析、预览、安装与回滚

流程固定为：

```text
粘贴 D1 → 解码/CRC/白名单校验 → 预览 → 用户确认 → 串行安装 → 报告
```

Host 路由为 `/api/plugin-share`：

- `GET /state`：读取 bundle 列表和当前可导出清单；
- `POST /export`：生成 D1 分享码；
- `POST /parse`：只解码并生成预览，不修改 profile；
- `POST /import`：要求 `confirm: true` 后逐条应用；可选 `only: [index…]` 只应用被选中的预览行；
- `POST /cancel`：按 request id 转发取消请求。

`previewEntries` 为每一行分配稳定的 `index`，并显示来源、安装 spec、校验结论和动作：`skip`、`set-enabled`、`install` 或 `upgrade`。被拒绝的条目保留在预览中并标记原因，不会混入可安装项。

单行应用的协议约定：

- `/import` 的 `only` 只接受整数索引数组；非法类型返回 `only-invalid`，选择结果为空返回 `selection-empty`，两种情况都不触碰 profile；
- `selectPreview(preview, only)` 负责过滤，未传 `only` 时等同于全量应用，因此「全部安装」与单行安装走同一条代码路径；
- 解析结果带 `selection: true` 作为宿主半的能力标志。客户端只有在看到该标志时才启用单行按钮，避免客户端已更新而宿主半仍旧时，把「安装一个」误当成「安装全部」执行。

`applyPreview` 串行调用：

- 安装调用 `installBundle(spec, { enabled, requestId, approvedBuilds })`；
- builtin 状态变化调用 `setBundleEnabled`；
- 返回 `pendingBuilds` 且没有批准列表时立即停止，要求用户明确批准；
- 失败或取消时停止，不静默继续；
- 仅移除本次新安装的 bundle，并恢复本次改变过的 builtin enabled 状态；
- 升级不自动调用破坏性的 `removeBundle`；
- 报告 `restart-required` 等宿主结果，不自动重启 DSH。

## 7. Web Client UI

`src/client.js` 注册命名空间 `dshPluginShare`，提供中文和英文文本，并向 `settings.plugins.tab` 注入 `plugin-share` 标签页。

外观严格遵守 DSH 现有视觉语言，不自己造控件：

- 控件一律使用官方 `@deepseek-ai/dsh-client-ui-primitives` 的 `Button`（`variant` = `primary` / `outline` / `ghost`，`size` = `md` / `sm`）和 `Tag`（`tone` = `outline` / `success` / `danger`），不手写按钮样式；
- 布局样式放在本插件自己的 CSS 里，用 `--dsw-*` 主题 token（`--dsw-alias-bg-layer-1`、`--dsw-alias-border-l1/l2`、`--dsw-alias-label-*`、`--dsw-alias-state-*`），并以单个去重 `<style data-plugin="dsh-plugin-share" data-plugin-css="…">` 注入、随客户端运行卸载，与官方设置插件的做法一致；
- 浏览器模块 id 与包名一致，`inject` 边声明其依赖的设置插件入口。

标签页提供：

- 导出当前 profile；
- 粘贴并解析 D1；
- 显示预览和拒绝原因；
- **每一行都有自己的按钮**：`安装` / `升级` / `启用` / `停用`；已是最新或校验失败的行按钮禁用并说明原因；
- 顶部另有 `全部安装`，一次应用所有待处理行（行为与逐行应用完全一致，只是选择集不同）；
- 单行应用成功后自动重新解析，刷新该行的最新状态；
- 显示构建脚本待批准项，并记住是哪一行触发的，批准后只重试那一行；
- 复制分享码；
- 取消正在进行的请求；
- 显示成功或失败状态。

按钮状态必须始终自解释，不能让用户面对一个没有理由的禁用按钮：

- 预览列表属于「已被解析的那段码」。文本框内容一旦改动或重新导出，预览立即清空，安装按钮随之禁用并提示需要重新解析；
- 按钮下方常驻一行状态说明，区分「先在下面粘贴组合码」「再点击「解析组合码」」「组合码已改动，请重新解析」「正在处理…」和「共 N · M 项待处理」；
- 成功或失败信息紧贴按钮显示，并带 `Tag`（`success` / `danger`），`role="status"` 播报，不依赖用户滚动到页面底部；
- 每行显示插件名、来源 `Tag`、完整安装 spec 与动作文案（`安装` / `升级` / `启用` / `停用` / `已是当前版本`），便于防钓鱼核对。

客户端请求必须带超时（`AbortController`），并且 `request()` 永远以结果对象 resolve 而不抛出，因此一次挂起的网络调用不会永久锁死标签页的所有按钮。

当前 UI 不承诺历史、PNG、文件下载或云端短码，因为这些能力尚未在代码中实现。

## 8. 隐私与安全检查

发布前检查公开文件，而不是只检查运行时输入：

- 搜索 API key、token、Bearer、私钥、凭据值和认证头；
- 搜索用户目录、工作区目录、盘符绝对路径及 Unix 绝对路径；
- 清理研究材料中的个人邮箱等不必要个人信息；
- 保留测试中用于断言拒绝逻辑的字面量，但不把它当作真实凭据；
- 确认 npm 包的 `files` 清单只包含运行所需源码、清单、图标、locale 和文档。

CRC32 不是安全边界。分享码会公开插件名称和来源，所以导入者必须核对完整预览；任何未经信任的 npm/GitHub bundle 都可能在安装或加载时执行代码。

## 9. 验证清单

自动测试覆盖：

- npm、GitHub、builtin、禁用状态的 D1/NP1 往返；
- 短清单 raw 和长清单“仅压缩更短才 deflate”；
- 重复版本、公共前缀、prerelease、无版本；
- CRC 篡改、截断、空白、未知帧和任意输入不抛出；
- 未知字段、secret-like 输入和所有不安全来源拒绝；
- wire 值二次校验；
- 采集固定核心、本地/远端依赖、optional builtin、版本锁定；
- 同版本跳过、旧版本升级、enabled 同步、构建脚本批准、取消和失败回滚。

发布检查命令：

```powershell
npm test
pnpm pack --dry-run
```

`pnpm pack --dry-run` 必须显示 package name 为 `dsh-plugin-share`，且不把测试、研究原稿、锁文件、本机配置或凭据打进包。

## 10. 已知限制与后续方向

1. D1 没有签名；CRC 不能防恶意伪造。
2. 码只分享清单，不分享插件配置；接收者需要重新配置各插件。
3. 当前是 DSH Web 集成；桌面 profile 的插件管理边界由 Electron 应用决定，不能据此承诺 CLI 管理 desktop profile。
4. 当前文本 UI 没有历史、PNG、`.dshpkg` 和云短码。
5. 版本为空时由安装器跟随最新版本，若要复现环境应保留精确版本。
6. GitHub 源代码安装可能触发构建脚本授权；用户必须审查来源、锁定 ref/commit，并在 DSH/pnpm 提示时显式批准。

后续增强不得改变现有 D1 payload 的语义；离线文本路径始终是一等公民。
