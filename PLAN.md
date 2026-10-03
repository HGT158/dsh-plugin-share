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
- `POST /qr`：把一段合法组合码编码成二维码矩阵；
- `POST /scan`：把一张图片里认出的组合码交回来；
- `POST /cancel`：按 request id 转发取消请求。

**每个请求都先过信任闸**：`ctx.webServer.register` 只负责挂载路由，本身不校验调用方，所以上面每个 action 在进入之前都必须先调 `ctx.connection.requestRejection(req)`（Host/Origin 校验 + 浏览器登录 token 鉴权），返回 401/403 时直接结束响应，**不读请求体、不碰 pluginManager**。宿主半因此 `inject` 里必须带 `connection`。少了这一步，本机任意进程或跨站页面都能读到插件清单，而 `/import` 是能往 profile 里装包的——这是实测出来的缺口（当时我们的路由无凭据返回 200，而官方插件同类路由一律 401）。

`POST /qr` 的约定：

- 入参是 `{ code }`；先去掉所有空白再解码校验，**只有合法的 D1 码才会被编码**，因此扫出来的文本一定是能直接粘回去的码；
- 依次尝试 M、L 两个纠错级别，取第一个放得下的；都放不下返回 413 `code-too-long-for-qr`（v40-L 上限 2953 字节）；
- 出错分支固定为 `code-required` / 解码器的原因 / `code-too-long-for-qr`；
- 返回 `{ ok, version, size, level, mask, modules }`，`modules` 是 `size` 行、每行 `size` 个 `0`/`1` 的字符串数组，不含静区。渲染交给客户端，Host 不产出图片。

`src/shared/qr.mjs` 是自己实现的字节模式二维码编码器（零依赖、离线）：

- 只支持字节模式——D1 码是 ASCII，够用；字符计数位按版本选 8 位或 16 位；
- 采用标准的 RS 分块表（40 版本 × L/M/Q/H）与对齐图形表，Reed-Solomon 在 GF(256) 上算，格式信息用 BCH(15,5)、版本信息用 BCH(18,6)；
- 掩码按规范的四条罚分规则在 0–7 中择优；
- 注意纠错级别的两套编号不能混用：RS 分块表的下标顺序是 L,M,Q,H，而格式信息里携带的两位级别码是 L=01、M=00、Q=11、H=10。

`src/shared/qr-scan.mjs` 是配套的扫码识别，同样是自研、零依赖、离线：

- **支持的输入**：正对、干净的图片——本插件保存的 PNG/SVG 截图、聊天里收到的二维码截图、整屏截图里的一小块。**不支持**斜拍照片、明显模糊或残缺的图片；不支持时返回 `qr-not-found` / `qr-unreadable`，绝不猜。
- 图像侧：Otsu 阈值二值化 → 逐行找 1:1:3:1:1 的定位图形并做垂直复核与聚类 → 用三个定位中心建立仿射基，按模块采样出矩阵。仿射基顺带容忍轻微旋转与缩放。
- 编码侧：读数据位时**复用编码器的 `dataModules(version)` 遍历顺序**，两个方向不可能对不上；然后对 4 个纠错级别 × 8 个掩码共 32 种组合逐一反交织解出字节流，取第一个能通过 D1 校验的结果。
- **不做 Reed-Solomon 纠错**是有意的：干净图片不会出错，而误读由组合码自带的 CRC32 兜底——坏图只会得到「识别失败」，不会得到一个能装出去的错码。
- 入参是 `{ width, height, gray }`，`gray` 是 base64 的每像素 1 字节灰度；像素上限 4M，请求体上限 8 MB。图片灰度化与缩放（长边 ≤ 1400）在浏览器里完成，**图片本身不上传任何地方**。
- 返回 `{ ok, code, version, level, mask, entries }`；失败返回 `qr-not-found` / `qr-unreadable` / `qr-image-too-small` / `qr-image-invalid` / `qr-not-a-share-code`（后者附带认出的原文，便于用户判断）。

客户端把「扫码导入」做成一个 `Menu`（官方 primitives）：菜单里是「选择图片…」，面板本身接受拖放；识别成功后自动写入文本框**并立即解析**，不需要用户再点一次解析。

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
- **二维码**：`展示二维码` / `收起二维码` 是同一个按钮的两种状态（只写「二维码」会被读成「打开二维码功能」，是在实测里被指出的误导）。面板显示版本与尺寸，并提供 `保存 SVG` 与 `保存 PNG`（前端用同一份矩阵分别生成 SVG 字符串与 canvas 位图并下载，Host 不产出图片）；
- **扫码导入**：`Menu` 里的「选择图片…」，以及整个面板接受拖放；图片在浏览器里灰度化并缩放后交给 `POST /scan`，成功后写入文本框并立即解析；
- 取消正在进行的请求；
- 显示成功或失败状态。

按钮状态必须始终自解释，不能让用户面对一个没有理由的禁用按钮：

- 预览列表属于「已被解析的那段码」。文本框内容一旦改动或重新导出，预览立即清空，安装按钮随之禁用并提示需要重新解析；
- 按钮下方常驻一行状态说明，区分「先在下面粘贴组合码」「再点击「解析组合码」」「组合码已改动，请重新解析」「正在处理…」和「共 N · M 项待处理」；
- 成功或失败信息紧贴按钮显示，并带 `Tag`（`success` / `danger`），`role="status"` 播报，不依赖用户滚动到页面底部；
- 每行显示插件名、来源 `Tag`、完整安装 spec 与动作文案（`安装` / `升级` / `启用` / `停用` / `已是当前版本`），便于防钓鱼核对。

客户端请求必须带超时（`AbortController`），并且 `request()` 永远以结果对象 resolve 而不抛出，因此一次挂起的网络调用不会永久锁死标签页的所有按钮。

二维码面板属于「当时那段码」：文本框内容一变或重新导出，面板随之消失，不会出现「码换了、码图还是旧的」。扫码识别写入的新码同样走这条规则。

**拖放必须自己抢在宿主前面**，这是实测踩到的坑：DSH 的附件拖放层（`dsh-client-ui-attachment`）在 `document` 上以冒泡阶段监听 `dragenter` / `dragover` / `dragleave` / `drop`；在没有会话可接收附件的场景（例如设置弹窗里），它会把 `dataTransfer.dropEffect` 设为 `none`——而按规范，**dropEffect 为 `none` 时浏览器根本不派发 `drop` 事件**，面板上的 `onDrop` 永远不会执行，图片被静默吞掉。它那层提示遮罩是 `pointer-events: none` 的纯装饰，不是遮挡问题。

因此面板在 **window 捕获阶段**监听同样四个事件，只认领「携带文件、且落点在面板矩形内（或事件 target 在面板内）」的拖放：`preventDefault()` + `stopPropagation()` 拦住宿主的 document 监听，并把 `dropEffect` 改回 `copy`。面板以外的拖放一律放行，宿主的附件功能不受影响。

当前 UI 不承诺历史存档、云端短码或相机实时取景；二维码以 SVG 与 PNG 两种形态提供并可保存，扫码识别只针对图片文件，文本形态始终是一等公民。

界面文案有一条硬约束：`t('key')` 用到的每个 key 都必须在 zh / en 两份字典里存在。DSH 的 locale 服务没有语言回退，缺 key 会直接把 key 渲染到界面上——`test/client-locale.test.mjs` 加载真实的客户端模块取回字典并做双向比对，正是为了拦住这一类问题。

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
- 同版本跳过、旧版本升级、enabled 同步、构建脚本批准、取消和失败回滚；
- 二维码：与独立参考实现逐模块比对的黄金矩阵、定位/时序图形与暗模块、版本容量边界（L 2953 / M 2331 / H 1273 字节上限）、非法入参与超长入参、SVG 的静区与路径命令数；
- 扫码识别：多个版本 × 多种模块尺寸/静区/边距的往返、带干扰元素的「截图」、噪声/空白/过小/尺寸不符的拒绝，以及「认得出但不是组合码」要单独报出原文；
- 界面文案：加载真实客户端模块取回字典，断言两份字典 key 完全一致，且代码里用到的每个 `t('key')` 都已注册；
- 路由信任闸：用假 ctx 注册路由，断言被拒绝的调用返回 401 且**不触发 pluginManager**（处理器主体没有执行），被放行的调用能一路走到动作分发；并断言 `inject` 里确实声明了 `connection`。

二维码做过三层独立验证（不是只看自己的输出）：

1. 用 Python `qrcode` 作为参考实现，79 个用例（覆盖版本 1–40 与四种纠错级别）矩阵**逐模块完全一致**，掩码选择也一致；
2. 用 Pillow 把矩阵栅格化后交给 OpenCV 解码，原文逐字符复原；
3. 把界面真实渲染出的 SVG 截图（4 倍缩放）再解码，得到的正是文本框里那段码——即用户实际路径。

扫码识别同样做了三层验证：

1. 合成图往返：3 个样本 × 3 种模块尺寸 × 2 种静区 × 2 种边距共 36 例全部还原；
2. 真实产物：本插件保存的 SVG 渲染图（300×300）、界面里 4 倍高清截屏（880×880）、以及**整屏 UI 截图（806×766，二维码只占其中一小块）**都能正确还原；噪声与空白图正确报 `qr-not-found`，非组合码的二维码报 `qr-not-a-share-code` 并附原文；
3. 端到端：在真实浏览器里把 PNG **拖进面板**（用 CDP `Input.dispatchDragEvent` 带真实文件模拟真实拖放，而不是页面内合成的 DragEvent——合成事件绕过了宿主的 `dragover`，会假通过），文本框得到与原件**逐字节相同**的 182 字符码并自动解析出 7 行；随后点「保存 PNG」把写出的 blob 解码，我们的扫码器与 OpenCV 都还原出同一段码。

拖放另外验了三条路径，并同时观察宿主的 document 监听计数与其遮罩状态：

1. 直接拖到面板：面板高亮、宿主四个监听计数全为 0、遮罩不出现，落点后正确解析；
2. 光标先进窗口别处（宿主遮罩已弹出）再移到面板松手：移到面板时遮罩自动消失、面板高亮，落点后同样正确解析，宿主 `drop` 计数为 0，**没有残留遮罩**；
3. 拖到面板以外：宿主照旧收到 `dragenter` / `dragover` / `drop` 并弹出遮罩，证明没有破坏它的原有行为。

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
