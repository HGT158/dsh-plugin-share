# 调研报告：把一组插件/扩展打包成「可分享的码」的市场现状

> 调研日期：**2026-09-29**（Asia/Shanghai）
> 方法：全部结论来自实际 `web_search` / `web_fetch` / npm Registry API / 本地实测。
> 标注约定：**【已验证】**=本次实际抓取到原文；**【未确认】**=搜索结果标题指向但正文抓取失败或未独立复核；**【推断】**=我的推理，非事实。

---

## 0. 结论先行（TL;DR）

1. **市面上已经有 DSH 插件在做「导出/导入一整套插件」，而且不止一个** —— 但**没有一个把它做成「短分享码」**，也没有一个有像样的采用量。
2. 最强的已有竞品/先例是 **`dsh-profile-studio` + `dsh-profile-contract`**（2026-08 发布，npm 上 485 / 170 月下载）。它写了一份非常严谨的 **Profile Artifact v1beta1 规范**，安全设计远超一般水平，**但载体是文件/tarball，不是码**。
3. 最接近「分享码」形态的是 **`dshp`**（`asdf17128`），它的导出就是一个几十行的 YAML 文件，README 自称「Short enough to paste into a forum post」。
4. **DSH 官方没有任何 profile 导出/导入命令**（已逐条核对官方 CLI reference）。官方只提供 `dsh plugin ...`（转发 pnpm）、`--from-default-profile`、`--dump-config`。
5. **真正的空白**：短、可粘贴、带签名/校验、**导入前逐项展示将要装什么并让用户勾选**、**默认拒绝执行 install 脚本**的分享码。这个组合在 DSH 生态里不存在；在整个工具生态里也只有 Claude Code / VS Code 各自做到了一半。
6. **2026 年最大的外部变量：npm 12 默认关闭 install 脚本**。这从根本上改变了「导入即执行任意代码」的风险模型，也给分享码设计划定了新边界。

---

## 1. DSH 生态本身

### 1.1 官方模型（必须先搞清楚的底层事实）**【已验证】**

来源：[DSH 官方打包与安装插件教程](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish.md) 与 [CLI 行为参考](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/reference/README.zh.md)

- **组合包（bundle）** = 一个 npm 包，其 `package.json` 声明 `"dsh": { "bundle": { "patch": "./cordis.patch.yml" } }`。它回答「这个包贡献什么？」
- **profile** = `$DSH_HOME/profiles/<name>` 目录，其 `package.json` 声明 `dsh.profile.bundles`（**有序数组**）+ 自己的 `cordis.patch.yml`。它回答「这套配置由哪些组合包按什么顺序组成？」
- 一份配置要能被完整复现，**必须携带三样东西**：插件版本、bundle 顺序、patch 块。`dshp` 的 README 明确这么写。
- **层叠顺序**：bundles（按数组顺序）→ profile 自己的 `cordis.patch.yml` → `$DSH_HOME/cordis.patch.yml`（机器本地、跨 profile 共享）→ 每个 `--patch` overlay。后应用的赢；且 patch **替换整行 `config`，不做深合并**。
- `dsh plugin --profile <name> <args...>` = 在 profile 目录内**把参数原样转发给 pnpm**，`add/remove/why/update` 全部可用；每次成功运行后自动同步 `dsh.profile.bundles`。
- **只有 5 个官方随附 profile**：`web` / `headless` / `sdk` / `sdk-minimal` / `acp`。

### 1.2 DSH 官方有没有 profile 导出/导入？—— **没有** **【已验证】**

完整核对 [CLI 行为参考](https://github.com/deepseek-ai/deepseek-harness/blob/master/apps/cli/reference/README.zh.md)，命令面只有：

| 命令 | 作用 |
|---|---|
| `dsh <name>` / `dsh --profile <name>` | 启动 profile |
| `dsh --profile <name> --from-default-profile <template>` | 从 5 个随附模板之一新建 profile（目标目录必须不存在，独占领取） |
| `dsh plugin --profile <name> <pnpm args...>` | 插件管理（= pnpm 转发） |
| `dsh --dump-config` / `--dump-default-config` / `--dump-config-schema` | 打印合成后的配置树 / JSON Schema |
| `dsh rescue` | 救援启动 |

**没有 `export`、没有 `import`、没有 `diff`、没有 `clone`、没有 `share`。**
`--dump-config` 是最接近「导出」的原语：它会打印注释标明每行由哪个文件提供，且**保持 `!!js` 表达式不求值**。官方同时警告：即使 `--dump-config-schema` 只输出 schema 声明，「声明的默认值和插件原始错误仍可能含敏感数据，分享前应检查」。

> 关键词检索结果：`dsh profile export` / `dsh profile import` / `dsh config export` / 「cordis.patch.yml 分享」—— **均未找到任何官方或社区的对应命令**。**【已验证：不存在】**

### 1.3 npm 上的各个 market 包（registry API 实测）

> 方法说明：`npmjs.com` 与 `socket.dev` 对 `web_fetch` 返回 **HTTP 403**；改用 `registry.npmjs.org/<pkg>/latest` 与 `api.npmjs.org/downloads/point/last-month/...`，这两个是公开 JSON API，实测可用。
> 下载量窗口：**2026-08-29 → 2026-09-27**。

| 包 | 最新版 | 发布时间 (CST) | 30 日下载 | 性质 |
|---|---|---|---|---|
| [`dshmarket`](https://www.npmjs.com/package/dshmarket) | 1.66.5 | 2026-09-28 | **452,529** | 生态里唯一有规模的。主页 [dshmarket.com](https://dshmarket.com)，repo `github.com/dsh-market/dsh-market`，维护者 fkysly。数据源 `awesome-dsh-plugin.com` 快照。**带 SLSA provenance 证明 + GitHub OIDC trusted publishing** |
| [`@nanmicoder/dsh-plugin-market`](https://www.npmjs.com/package/@nanmicoder/dsh-plugin-market) | 0.2.0 | 2026-08-17 | — | "Verified plugin marketplace"，作者「程序员阿江」(relakkes)，**同样有 SLSA provenance + OIDC trusted publisher** |
| [`dsh-market-plus`](https://www.npmjs.com/package/dsh-market-plus) | 0.1.1 | 2026-08-16 | 395 | "dsh-market 基座 + dsh-store 的 npm 权威源/质量验证/GitHub 热度/代理注入/回退安装"，同 repo，维护者 owltechcode |
| [`dsh-plugin-market`](https://github.com/uluckystar/dsh-plugin-market)（无 scope） | 0.1.0 | — | 648 | 数据源 mydsh.dev，自述 **5596 候选 / 3656 有效 / 1940 无效已隐藏**。有 7 态生命周期、安装不自动启用、一键重启生效、写配置前备份 + 写后校验 + 失败回滚、插件名白名单 + 同源校验 + 请求体上限 |
| `aiko-dsh-market` | — | market 登记 **2026-09-11** | — | Aiko DSH Electron 插件市场，`github.com/aiko-dsh-plugins/dsh-market`。**自述：桌面客户端负责 confirmation / health check / rollback**；安装时解析依赖顺序、拒绝不兼容版本组合；市场显示支持的 Aiko DSH 版本范围并阻止不兼容安装 |
| `dsh-config-manager` | — | — | **12,526** | [xiajiajun516](https://github.com/xiajiajun516/dsh-config-manager) 备份/恢复：导出、导入、迁移、同步完整配置+插件+MCP+skills+workspace |
| `dsh-backup` | — | — | 155 | [having5548](https://github.com/having5548/dsh-backup) 备份/恢复 zip |

> ⚠️ `aiko-dsh-market` 的完整 packument 抓取被内嵌的 base64 截图撑爆而被截断，上表信息只读到文档头部；**其下载量未取得**。**【部分未确认】**

### 1.4 mydsh.dev 是什么 **【已验证】**

[mydsh.dev/plugins](https://mydsh.dev/plugins) 页面标题：**「插件大全 · DeepSeek Harness 插件生态（AI 中文总结 + AI 智能搜索）」**，自述「DeepSeek Harness 插件生态全量目录 —— 自动同步官方 dsh-plugin topic」，每个插件带 AI 中文总结，并有 AI 语义搜索（算力由「星枢」支持）与安全报告。

> **注意**：该页是客户端渲染的，纯静态抓取返回「**0 个插件**」。上面 5596/3656 的规模数字来自 `uluckystar/dsh-plugin-market` 插件自身 README 的**自述**，我没有独立验证 catalog 的真实条目数。**【规模数字未独立确认】**

### 1.5 discussion #2687 **【未确认 —— 抓取失败】**

`github.com/.../discussions/2687` 我**连续 3 次 web_fetch 全部失败**（`TypeError: fetch failed`）。

从搜索结果能确认的只有标题：**「DSH 插件市场(社区插件)：生命周期管理、安全启用、一键自动重启 #2687」** —— 即 `uluckystar/dsh-plugin-market` 这篇插件的官方讨论贴。**正文内容未读到，请勿据此下结论。**

同批检索到的相关讨论（仅标题，**均未读正文**）：
- [#2717 建议：提供官方插件更新生命周期与「重启扩展服务」能力](https://github.com/deepseek-ai/deepseek-harness/discussions/2717)
- [#1825 把「插件市场」本身做成一个插件（Plugin Marketplace as a Plugin）](https://github.com/deepseek-ai/deepseek-harness/discussions/1825)
- [#1231 Host capability: graceful self-restart for plugin managers](https://github.com/deepseek-ai/deepseek-harness/discussions/1231)

> **【推断】** #1825 + #2717 + #1231 这三条串起来看，官方对「市场/生命周期/重启」的态度是**尚未原生提供、靠社区插件补**——这与 1.2 的结论一致。

### 1.6 已经在做「配置档 / 插件套装 / preset / 分享码」的 DSH 插件

#### (a) `dsh-profile-studio` + `dsh-profile-contract` —— **最强的已有先例** **【已验证】**

维护者 `jaredma`（联系方式未列出），repo `github.com/IWAIBAOLI/dsh-profile-studio`。

| 包 | 版本 | 时间 | 30 日下载 |
|---|---|---|---|
| `dsh-profile-contract` | 0.1.0-alpha.4 | 2026-08-26 | 170 |
| `dsh-profile-studio-trial` | 0.1.0-beta.1 | 2026-08-26 | 287 |
| `dsh-profile-studio` | 0.1.0-beta.2 | **2026-08-30 首发** | 485 |

- `dsh-profile-studio` 自述：**"Create, import, verify, and safely switch portable Profile Artifacts for DeepSeek Harness"**，带 CLI `dsh-profile-pack`，是标准 DSH 插件（有 `cordis.patch.yml` + `dsh.client.inject`）。
- `dsh-profile-contract` 是**规范本体**，npm 包里直接导出了 `SPEC.md`、`PROFILE.template.md` 和三个 JSON Schema（`profile-artifact` / `profile-recipe` / `reference-host-composition`，均为 `v1beta1`）。
- 规范自述：**"It does not claim to be an official DeepSeek or DSH standard."**（独立开放契约提案）

**我完整读了 SPEC.md，它的设计质量在同类里是顶级的，值得逐条抄：**

| 规则 ID | 原文要点 | 为什么值得抄 |
|---|---|---|
| `PA-ACT-003` | "A Consumer **MUST deny direct and transitive lifecycle scripts** in the Artifact dependency graph by default. `allowBuilds` / `onlyBuiltDependencies` 属于 Consumer 本地状态，**MUST NOT 写进 Artifact**" | 默认拒绝执行脚本，且授权不随分享物传播 |
| `PA-ACT-004` | 缺构建产物时，Consumer 可针对**实际解析到的包名@版本**请求本地授权；已授权的构建**必须在 staging/隔离中跑**，且**合成前必须重新校验内容未被篡改** | 授权粒度 = 精确版本，而不是包名 |
| `PA-FS-006` | profile/ 根**禁止** `package-lock.json` / `pnpm-lock.yaml` / `.npmrc` / `pnpm-workspace.yaml` / `.yarnrc.yml` / `.pnp.cjs` 等，并称这是「complete v1beta1 static denylist」，**MUST NOT 用「其他控制文件」这类模糊类别扩大** | 防止分享物里夹带包管理器钩子 |
| `PA-INST-002` | 包管理器**不得直接在 Artifact 的 `profile/` 上运行**，**不得读取 Artifact 提供的 lock / workspace / hook / 配置**；必须由 Consumer 造一个干净 workspace。且**禁止**任何「从安装结果自动重写 `dsh.profile.bundles`」的流程 | 分享物是**数据**，不是可执行项目 |
| `PA-MAN-007/008` | 外层 manifest **禁止** `scripts` / `bin` / `engines` / `os` / `cpu` / `gypfile`；禁止声明 `dsh.bundle.patch`；"A Consumer MUST first validate it as archive data; it **MUST NOT `npm install` the envelope first**" | 分享物**不是** bundle，**不能**被当依赖安装 |
| `PA-VER-001` | **必须区分 8 个互不替代的结论**：静态 Artifact 合法 / 必需材料已解析 / 契约合规 / 参考合成已复现 / 参考不可得 / 本地合成合法 / 本地可激活 / 本地合并已接受。"**MUST NOT replace one another through a single `verified` boolean**" | 这条直接对应「一个『已验证』勾选框」的坑 |
| `PA-VER-003` | "Installing into an existing Profile is an advanced product workflow... If a user changes an ID, skips, or replaces a component, the result is a locally derived workspace and **MUST NOT fabricate conformance** of the original Artifact" | 用户改过任何一项 → 原分享物就不再"合规" |
| `PA-COMP-001` | `compatibility.harness` 必须是**精确 SemVer 数组**，**禁止 range/comparator/tag/wildcard** | 兼容性不能含糊 |
| `PA-SEC-001/002` | Producer **MUST NOT** 携带凭据值、私有 token、创建者机器密钥、不可移植绝对路径；可机械判定的违规 Reader 报**阻塞错误**，文本模式匹配只能报**启发式警告** | 区分「可判定」与「启发式」 |
| `PA-CON-002` | 静态 Reader **MUST NOT** 访问网络、装依赖、跑生命周期脚本、求值 `!!js`、加载插件、读凭据 | 静态校验与执行严格分离 |
| `PA-ACT-007` | 任何**未被 `!!js` 显式打标签**却含 `__jsExpr` 成员的映射 → 拒绝 | 防 Loader 保留字冲突注入 |

**载体形态**：`profile-artifact/` 目录或 npm 风格 `.tgz`（成员必须在单一 `package/` 前缀下）。**不是短码。**

#### (b) `dshp` —— **最接近「分享码」形态的** **【已验证】**

[asdf17128/dshp](https://github.com/asdf17128/dshp)，一句话定位：**"Hand your whole dsh setup to someone as one file — and they get the exact same tree."**

```yaml
# dsh profile — reproduce with: dshp import <this-file>
dshp: 1
name: web
bundles:
  - '@deepseek-ai/dsh-base'
  - '@deepseek-ai/dsh-web-app'
  - dsh-cloudflare-browser-run
plugins:
  dsh-cloudflare-browser-run: ^0.1.1
patch: |
  - id: session-title
    config:
      fallbackMaxWords: 12
```

命令面：`dshp ls / show / new / clone / export / import / diff / rm`。零依赖，只读为主。

它有三个**比 dsh-profile-studio 更贴近分享场景**的设计点：

1. **patch 块逐字节复制，不做 YAML round-trip** —— 因为 patch 里可能有 `!!js` 表达式（`root: !!js dshHomePath('sessions')`），round-trip 会破坏或**求值**它。README 明确："Nothing here ever evaluates your config."
2. **bundle 顺序是格式的一部分** —— 顺序决定谁 patch 谁，重排会被 `diff` 报为真实差异。
3. **它自己承认 DSH 的能力缺口**："dsh itself can boot a profile and forward installs to pnpm, but **it cannot create an empty one, list what you have, or copy a working setup** before you experiment on it. That is all manual work under `~/.dsh/profiles` today."
4. 声称验证过："a 132-entry profile reproduced into a fresh `$DSH_HOME` composes an identical tree, patch included."（**自述，未独立复现**）

#### (c) 其他

- `dsh-config-manager`（12,526 月下载，第二高）：备份/恢复，**面向整机迁移，不是面向分享**
- `dsh-backup`：同上
- `libukai/awesome-deepseek-harness`：awesome 清单（存在，本次未抓取正文）
- `tanle-mtr/dsh-plogin-plugin-recommender`：自述 190+ 插件、12 分类的 AI 精选目录

**小结：不存在任何做「preset / 分享码 / 一键装全套」的 DSH 插件。**备份恢复（config-manager/backup）和开发者自用导出（dshp）有，规范化 artifact 契约（profile-studio）有，**「短码 + 分享」这一层是空的**。

---

## 2. 可对标的产品/机制

### 2.1 Claude Code —— 最值得对标的一个 **【已验证】**

来源：[Manage plugins for your organization](https://code.claude.com/docs/en/plugins/org) 、[Plugin dependencies](https://code.claude.com/docs/en/plugins/dependencies) 、[Plugin security and trust](https://code.claude.com/docs/en/plugins/security)（Mintlify 站，`.md` 后缀可拿到正文）

**① 「插件套装」的官方做法 = 依赖数组，不是码**

> "To let engineers install a curated set of plugins with one command, **publish a plugin whose manifest contains a `name` and a `dependencies` array**. A plugin manifest needs only `name`, so this is a valid plugin, and installing it installs every dependency."

```json
{ "name": "backend-standard", "version": "1.0.0",
  "dependencies": ["secrets-vault", "deploy-kit",
                   { "name": "db-migrate", "version": "^3.0" }, "oncall-runbook"] }
```
→ `claude plugin install backend-standard` 一次装全套。**这是整个调研里最贴近「插件套装」的产品机制。**
配套还有 `claude plugin prune`（清理没人再需要的自动安装依赖）。
加新插件的流程很干净：发布 `backend-standard` 新版本带上新依赖；开自动更新的市场下次自动更新就带上，或手动 `claude plugin update backend-standard` + `/reload-plugins`。

**② 组织级「一套配置下发」= 一份 JSON，不是码**

三种投递机制：claude.ai 服务端托管设置 / MDM（macOS plist、Windows 注册表）/ `managed-settings.json` 文件 + `managed-settings.d/` drop-in 目录。

```json
{
  "extraKnownMarketplaces": {
    "your-marketplace": { "source": { "source": "github", "repo": "your-org/your-marketplace" },
                          "autoUpdate": true } },
  "enabledPlugins": { "code-formatter@your-marketplace": true,
                      "deploy-helper@your-marketplace": true }
}
```
仓库级同理：写在仓库的 `.claude/settings.json` 里，**但只在用户接受 workspace trust 对话框后生效**；非交互 `-p` 场景下，只有用户已交互式接受过信任的目录才生效。**这是一条很好的「先建立信任、再下发配置」设计。**

管控面（`strictKnownMarketplaces` allowlist / `blockedMarketplaces` blocklist / `disableSideloadFlags` / `allowManagedHooksOnly` / `syncClaudeAiPlugins` / `pluginSuggestionMarketplaces`）：
- `[]` 空 allowlist = **锁死所有来源，包括官方市场**
- 匹配粒度支持 `github` / `github` owner 通配 `your-org/*` / `git` / `url` / `file` / `directory` / `hostPattern` / `pathPattern` / `skills-dir`
- **blocklist 比 allowlist 宽**：git URL 会被规范化（`git@` 与 `https://`、`.git` 后缀、尾斜杠等价），`owner/*` 大小写不敏感
- **限制项（官方自己列的）**：allowlist **不注册**市场、不限制已允许市场内部的条目、不管 `--plugin-dir`；**没有 key 能隐藏 `/plugin` 命令**

**③ 导入前的同意 UI —— 这是全网做得最好的**

> `/plugin` 详情面板有一节 **"Will install"**，列出该插件的 commands、agents、skills、hooks、MCP 和 LSP servers。
> 安装前有一段**固定的信任警告**（无论插件来自哪个市场，文案都一样）；组织可以用 `pluginTrustMessage` **把自己的文字追加到这段警告后面**。
> `claude --plugin-dir <dir> plugin details <name>` 可以在**不开会话**的情况下打印 `Component inventory`。
> 文档还明说："The **Will install** section shows that a hook exists but **not what it runs**" —— 承认这个 UI 的边界，逼你去看源码。

**④ 完整性 / 拒绝安装**

- `archive` 源可钉 `sha256` 摘要，下载后不匹配 → **拒绝安装**（`Plugin archive integrity check failed`）
- `claude-community` 目录对几乎每个条目钉 commit SHA，钉了就**拒绝安装别的 commit**
- 官方/社区级市场名**只接受来自 `github.com/anthropics/` 的源**，否则**停止加载该市场及其所有插件**
- `disableCommandPluginSources` / `allowManagedHooksOnly` 限制能跑的东西

**⑤ 版本策略**：semver range 对 **git tag** 解析（tag 格式 `<plugin-name>--v<version>`，用 `claude plugin tag` 生成）。多个插件约束冲突时解到「同时满足所有 range 的最高版本」；`~2.1` vs `~3.0` 直接安装失败（`has conflicting version requirements`），**且 A 插件与依赖保持原状**。

**⑥ 审计**：`claude_code.plugin_installed` / `claude_code.plugin_loaded` OTel 事件；第三方插件名默认**脱敏成 `third-party`**（除非设 `OTEL_LOG_TOOL_DETAILS=1`）；Enterprise 有 `GET /v1/organizations/analytics/plugins`。

**❌ Claude Code 没有任何「配置/插件分享码」。** 全部是文件 + 市场 + 命令。

### 2.2 VS Code Profiles —— 唯一有「导入前逐项勾选」的成熟产品 **【已验证】**

来源：[Profiles in Visual Studio Code](https://code.visualstudio.com/docs/configure/profiles)

- **Export** → 二选一：**GitHub gist** 或本地文件。gist 会被标记为 **Secret**（只有拿到链接的人能看）。
- 分享 URL 格式：**`https://vscode.dev/editor/profile/github/{GUID}`**
- 打开该 URL → 拉起 **VS Code for the Web**，Profiles 编辑器打开，**已导入的 profile 内容逐项展示**：
  > "You can **unselect profile elements if you wish**, and you need to **manually Install Exten[sions]**."
  
  ← **这就是「导入前展示将要装什么、逐项确认」的最佳既有先例**：不是简单的「同意/拒绝」二选一，而是**勾选清单 + 不自动安装扩展**。

- 其它机制：Settings Sync（勾 Profiles 即跨机同步；注意**不与 remote 窗口同步**）、Profile Templates、`Apply Setting to all Profiles`、`Apply Extension to all Profiles`、Folder/Workspace 关联、`code --profile`。
- 扩展打包另有 **Extension Pack**（一个 pack manifest 列出若干扩展）。

### 2.3 其他机制（要点式，来源可信度较低处已标注）**【部分未确认】**

| 机制 | 载体 | 码/加密 | 值得注意 |
|---|---|---|---|
| **Homebrew Bundle** | `Brewfile` 纯文本 | 无 | 声明式文本，`brew bundle --file=Brewfile`；`brew bundle cleanup` |
| **chezmoi** | **git 仓库里的文本文件**（source state） | 属性级 age/gpg/rage 加密（`.chezmoi.age` 等） | 官方 Design FAQ 专门解释「为什么不像 GNU Stow 用 symlink」「为什么不用 Ansible/Chef」；提供 `chezmoi diff` / `archive` / `push`；[加密文档](https://www.chezmoi.io/user-guide/encryption/) |
| **Conda / Nix flake / devcontainer / mise-asdf / Docker Compose** | `environment.yml` / `flake.nix` / `devcontainer.json` / `.tool-versions` / `compose.yaml` | 各自有 hash 锁 | 全是**文件 + git** |
| **Steam 愿望单/送礼** | 账号侧关系 + 短 ID | — | **不是码**；Steam 2026 更新是「简化送礼 + 愿望单分类」 |
| **网易云/QQ 音乐歌单分享** | 服务端不透明 ID | — | **不是码**；需要对方有账号/客户端 |
| **Raycast / Obsidian / Notion 模板** | 模板链接（服务端 ID）或仓库文件 | — | **不是码** |
| **1Password / Bitwarden 共享保险库** | **服务端账号授权**（邀请 → 对方账号获得访问权） | 全程端到端加密，但**传输的是授权不是内容** | 见下 |

### 2.4 密码管理器的「一键全量安装」分享模型 —— **范式完全不同** **【推断，基于机制描述】**

1Password（家庭/团队/共享保险库）与 Bitwarden（Shared Vault）的模型是：
**内容留在服务端 → 生成一条邀请/授权链接 → 对方用自己的账号兑换 → 内容自动全量出现在本地客户端。**

关键点，也是与「码」范式的根本区别：
- 链接里**没有内容**，只有**授权**。所以长度不是问题，也不需要压缩编码。
- 「一键全量安装」之所以成立，是因为**客户端本来就有完整的解密+同步引擎**，缺的只是权限。
- 有**撤销**语义（撤销共享 → 链接失效），有**到期**语义，有**身份**语义（只有特定账号能兑换）。
- 内容永远不落到第三方，也永远不会被「转发链接就泄露」。

> **【推断】** 这解释了为什么几乎所有「一整套东西」的分享最后都收敛到「链接 = 服务端指针」而不是「链接 = 内容」：只有指针才谈得上撤销、审计、过期、身份。

---

## 3. 关键设计问题

### 3.1 编码：分享码到底能有多长？—— **我实测了** **【已验证，本地实测】**

方法：PowerShell + `.NET` `ZLibStream`（zlib）+ base64url（`+/`→`-_`，去 `=` padding），2026-09-29 实测：

| 载荷 | 原始 | deflate 后 | **base64url 码长** |
|---|---:|---:|---:|
| 极简 3-bundle `.dshp` 风格 YAML | 232 B | 155 B | **207 字符** |
| 30 个插件，**只写名字**（浮动版本） | 485 B | 230 B | **307 字符** |
| 30 个插件，**精确钉版本**，YAML | 735 B | 349 B | **466 字符** |
| 30 个插件，**精确钉版本**，紧凑 JSON | 873 B | 419 B | **559 字符** |
| 8 个插件，只写名字 | 156 B | 106 B | **142 字符** |

**规律：zlib 对这类重复键名的结构化文本压缩比约 2.1–2.6×；base64url 膨胀约 1.34×。**
**⇒ 一个真实规模的 30 插件 DSH 套装分享码 ≈ 470–560 字符。**

**由此得出的硬约束：**

| 渠道 | 容量 | 30 插件码能否直塞 |
|---|---|---|
| X/Twitter 帖文 | 280 字符 | ❌ 连极简 3-bundle（207）都只剩 73 字符余量；30 插件必挂 |
| 微信/QQ 聊天单条 | 实际无硬限但有折叠阈值 | ⚠️ 500 字符已明显影响可读性 |
| URL path 段 | 实践中 2–8 KB 无问题 | ✅ 轻松 |
| GitHub Gist | 足够 | ✅（VS Code 已用此法） |
| 二维码 | version 40-L byte mode 上限 2953 B | ✅ 富余 |

> ⚠️ **QR 的 2953 字节上限本次未能验证** —— [thonky.com](https://www.thonky.com/qr-code-tutorial/data-capacity) 404、[nayuki.io](https://www.nayuki.io/page/qr-code-generator) 404、Wikipedia 两次 fetch failed。**该数字请当作常识性记忆，不要引用为已验证事实。** **【未确认】**

**实践建议**：
- 极简档（3–5 插件、只写名字）≈ **150–250 字符**，可以硬塞进一条推文/短信 → 这是「社交传播」档位。
- 完整档（30 插件 + 精确版本）≈ **500–600 字符** → 走 **URL / gist / 二维码**。
- 再大（>1 KB）就别硬塞了，改**服务端指针**（§2.4 的模型）——这是唯一有撤销/审计/过期的路。
- 一定用 **base64url**（不是标准 base64），否则 `+` `/` `=` 会在 URL、文件名、部分聊天软件里出事。

### 3.2 安全：把安装列表做成码，导入即执行任意代码 **【已验证】**

#### (a) 攻击面：DSH 自己已经把话说得很直白 **【已验证】**

官方打包教程原文：

> "pnpm ≥10 在得到显式允许之前拒绝运行 git 依赖的 `prepare` 脚本…… **请把这项授权视为『允许该包的代码在安装时于你的机器上执行』，且不在 agent 运行的任何沙箱之内。只对源码可信的包授权，并锁定 commit**（`github:you/hello-plugin#<sha>`），让后续推送无法悄悄改变实际运行的内容。"

CLI reference 重复同一句，并补充：允许运行 `prepare` 的包，其产物**可控制"工具行是否对 Agent 可见"**（"每个已安装组合包只注册自己的休眠 Host 提供方；还须在复制出的 Preset 中单独启用对应工具行，新 Agent 才能看到该工具"）。

#### (b) 2026 年最大的外部变量：**npm 12 默认关闭 install 脚本** **【已验证 —— GitHub 官方 changelog】**

来源：[Upcoming breaking changes for npm v12](https://github.blog/changelog/2026-06-09-upcoming-breaking-changes-for-npm-v12/)（2026-06-09 发布，标注 v12 "estimated to release in July 2026"）、[The Hacker News 报道](https://thehackernews.com/2026/06/github-to-disable-npm-install-scripts.html)

GitHub 官方定性：
> 安装时生命周期脚本是 **"the single largest code-execution surface in the npm ecosystem"**，因为 `npm install` 会跑**每一个传递依赖**的脚本，所以依赖树里任意一个被攻破的包都能在开发者机器或 CI runner 上执行任意代码。

npm v12 的三处默认变更（**每一条都是把「自动跑」改成「显式 opt-in」**）：
1. **`allowScripts` 默认 off** —— `npm install` 不再执行依赖的 `preinstall`/`install`/`postinstall`，除非在项目里显式允许。
   - **包括隐式 node-gyp 构建**：一个带 `binding.gyp` 但没有显式 install 脚本的包**照样被拦**。
   - git / file / link 依赖的 `prepare` 同样被拦。
2. **`--allow-git` 默认 `none`** —— 不再解析 git 依赖（直接或传递）。这堵掉了一条「git 依赖的 `.npmrc` 覆盖 git 可执行文件」的攻击路径 —— **这条即使加了 `--ignore-scripts` 也堵不住**。
3. **`--allow-remote` 默认 `none`** —— 不再从远程 URL（如 https tarball）解析依赖。

迁移路径（**这就是现成的「逐项同意 UI」范式**）：
```
npm approve-scripts --allow-scripts-pending   # 列出所有带脚本的包
npm approve-scripts   <pkgs>                   # 批准你信的
npm deny-scripts      <pkgs>                   # 明确拒绝其余
# 结果写进 package.json 并提交
```
npm 11.16.0+ 起就能以 warning 形式预演。

> **还有一条**：`min-release-age` —— 一个「拒绝发布不足 N 天的包版本」的设置，npm 今年引入，作为对抗**新发布的恶意包**的手段。**【部分未确认：见报道，正文未从 npm 官方 docs 抓取】**

> ⚠️ 状态提示：changelog 说 v12 "estimated to release in July 2026"，今天是 2026-09-29，**应当已发布**，但这条 changelog 本身仍以公告形态挂着。**实际生效版本请自行确认。**

#### (c) 真实事件 **【未确认：只拿到标题/摘要，未逐篇读原文】**

本次检索命中（**请勿直接引用数字**）：
- [Anatomy of a Self-Propagating npm Worm](https://safeguard.sh/resources/blog/npm-maintainer-account-takeover-self-propagating-worm)
- [malicious npm package stole files from…（THN, 2026-05）](https://thehackernews.com/2026/05/malicious-npm-package-stole-files-from.html)
- [GMS-2025-95: `@ensdomains/hardhat-chai-matchers-viem` 账号接管后含恶意代码（GitLab）](https://advisories.gitlab.com/npm/@ensdomains/hardhat-chai-matchers-viem/GMS-2025-95/)
- [Slopsquatting: AI-Hallucinated Package Name Attacks](https://safeguard.sh/resources/blog/slopsquatting-when-ai-hallucinates-package-names)
- [LLMs Are Reviving Abandoned Open-Source Packages](https://safeguard.sh/resources/blog/security-risk-of-llms-reviving-abandoned-packages)
- [TWCERT： 不存在的套件，真實的威脅：LLM 誤導開發者走入 Slopsquatting 陷阱](https://www.twcert.org.tw/newepaper/cp-146-10088-3b6aa-3.html)（正文抓取失败）
- 经典事件（2018 `event-stream`/`flatmap-stream`、2021 `ua-parser-js`、2022 `colors`/`faker`、2024 `xz-utils` CVE-2024-3094）—— **本次未重新检索，不作为已验证引用**。**【推断】** 这类事件的结构（"包名被抢/被投毒 → 下一次任意机器执行"）与本场景完全同构。

**Slopsquatting 机制（机制本身可信，数字未确认）**：LLM 生成代码时会「幻觉」出不存在的包名；攻击者预先在 npm 注册这些幻觉名，等着 AI 写的代码去 `npm install` 它。对**分享码场景的特殊放大**：【推断】用户是**照着别人给的码批量安装**，天然缺乏「我确实需要这个包」的判断，且往往一次装几十个 —— 命中概率被显著放大。

#### (d) 生态里已有的真实缓解措施（可直接抄）**【已验证】**

- **`dshmarket` 与 `@nanmicoder/dsh-plugin-market` 都带 SLSA provenance 证明**（`https://slsa.dev/provenance/v1`），且都用 **GitHub OIDC trusted publishing** 发布（无长期 token 可泄露）。**这是 DSH 生态内已有的、可验证的供应链控制。**
  → 分享码**应当至少携带 `name@version` + 该版本的 provenance/integrity 校验值**。
- **`dsh-profile-contract` `PA-ACT-003`/`PA-ACT-004`/`PA-INST-002`**（见 §1.6）是目前最完整的规范级答案。
- **`uluckystar/dsh-plugin-market`**：安装只下载不自动启用；启用/停用需重启且重启前有确认弹窗如实告知预估时长与影响；写配置前自动备份、写后校验、失败自动回滚；**DSH 核心组件保护**；**不兼容插件拒绝启用**（防启动失败）；插件名白名单 + 同源校验 + 请求体上限。
- **`aiko-dsh-market`**：市场显示支持的 DSH 版本范围并**阻止不兼容安装**；安装**解析依赖顺序**并拒绝不兼容版本组合；**桌面客户端负责确认、健康检查与回滚**；包事务失败保留当前安装。
- **Claude Code**：固定信任警告 + 可追加的 `pluginTrustMessage` + "Will install" 组件清单 + `sha256`/commit-SHA 钉死后拒绝安装 + allowlist/blocklist + `disableSideloadFlags`。

**→ DSH 生态其实不缺「同意 UI」的零件，缺的是一个把它们串起来并加上「短码」外壳的产品。** **【推断】**

### 3.3 版本锁定 vs 浮动 **【已验证 + 实测】**

| | 浮动（只写名字） | 精确钉版 | semver range |
|---|---|---|---|
| 码长（30 插件，实测） | **307 字符** | 466–559 字符 | ~380–470 字符 |
| 复现性 | 差，隔天就变 | 最好 | 中 |
| 抗投毒 | ❌ 名字被抢/被弃用就中招 | ✅ 但**首次安装仍会跑脚本** | ⚠️ `^1.2` 会吃掉未来的 `1.9.9` 恶意版 |
| 维护者负担 | 无 | 高 | 中 |

**业界共识（多来源一致）**：
- **Claude Code** 明确警告无约束的后果："If that release renames an MCP tool your plugin calls, **your plugin breaks for everyone who updates**." 约束解到「满足所有已装插件 range 的最高 git tag」，冲突则**安装失败且不动现状**。
- **`dshp` 导出的是 `^0.1.1` 这种 range**，`dsh-plugin-market` 装的是浮动。
- **`dsh-profile-contract` `PA-COMP-001` 反而要求兼容性声明用精确 SemVer、禁止 range** —— 理由是兼容性不是安装时能协商的东西。
- **Lockfile 的边界**：【推断】lockfile + integrity 只能防「版本漂移」，**防不了首次安装**。`npm ci --ignore-scripts` 才第一次真正把「解析」和「执行」分开。
- **npm 12 + `min-release-age`**：等于给「浮动范围」加了一个**时间维度的护栏** —— 新发布的坏版本在冷却期内进不来。**【推断】这实质上让浮动版本的安全性显著上升，可能是未来默认策略。**

**建议** **【推断】**：分享码里**默认精确钉版**（`name@1.2.3`），允许发布者显式声明「跟随最新版」作为可选项，并在码里把选择**显式写出来**（如 `"pinned": true`），让导入方看得见。

### 3.4 「导入前展示将要装什么、逐项确认」的先例 **【已验证】**

**存在的，且各有可抄之处：**

| 产品 | 机制 | 可抄的点 |
|---|---|---|
| **VS Code Profile 导入** | URL 打开后逐项列出 profile 内容，**用户可 unselect 任意元素**，且**扩展需要用户手动安装** | ✅ **最完整**：逐项 + 默认不执行 |
| **Claude Code `/plugin`** | 详情面板 **"Will install"** 列出 commands/agents/skills/hooks/MCP/LSP；安装前固定信任警告 | ✅ 分层：摘要（警告）+ 明细（组件清单）；但**不逐项勾选** |
| **npm 12 `approve-scripts`** | 列出所有带脚本的包，逐个 `approve` / `deny`，结果提交 | ✅ **把「授权」和「安装」拆成两步**，且拒绝是可持久化的（写进 `package.json`） |
| **pnpm ≥10 `allowBuilds`** | 第一次 `add` 直接**失败**并打印要粘进 `pnpm-workspace.yaml` 的键 | ✅ **默认拒绝（default-deny）**，且是 DSH 原生就有的 |
| **`dsh-profile-contract`** | 8 个互不替代的结论状态；`PA-VER-003` 用户改过任一项即"不再是原分享物" | ✅ 状态机设计 |
| **Chrome Web Store** | 我本次**未能**抓取到"扩展发布不足 N 天"的警告页面原文。**【未确认】** —— 但 DSH 生态内 `uluckystar/dsh-plugin-market` 的安全评估 + `aiko-dsh-market` 的版本范围门禁是等价物 | 近似 |

**不存在的：** 没有任何产品在「导入前」展示「这 30 个包里，有 3 个带 install 脚本，其中 1 个发布于 6 天前，1 个的依赖树有 400 个传递依赖」这种**风险分层**视图。

---

## 4. 结论

### 4.1 市面上有没有现成的 DSH 插件套装分享方案？空白在哪？

**有「导出/导入一整套」的实现，但没有「分享码」。**

三条不同的路线，都已有人走：

| 路线 | 代表 | 形态 | 采用量 |
|---|---|---|---|
| **规范化 Artifact 契约** | `dsh-profile-contract` + `dsh-profile-studio` | 目录 / `.tgz`，严谨 SPEC v1beta1 | 170 + 485 /月 |
| **短文本文件** | `dshp` | 一个几十行 YAML，export/import/clone/diff | 未在 npm（走 `github:` / `npx github:`） |
| **备份/恢复** | `dsh-config-manager`、`dsh-backup` | zip | 12,526 / 155 /月 |

**空白（按价值排序）：**

1. **🔴 没有「短码」形态。** 三个方案没有一个产出一行可粘贴的码。`dshp` 最接近但仍然是文件；实测证明 30 插件只需 **~500 字符**，完全塞得下。
2. **🔴 没有「导入前逐项确认 + 风险分层」UI。** 生态里有零件（pnpm `allowBuilds`、npm `approve-scripts` 范式、`aiko` 的确认/回滚、`uluckystar` 的 7 态生命周期），但**没有一个把它们串成一个面向「导入别人给的码」的统一确认界面**。
3. **🟡 没有签名/完整性。** 没有任何方案给分享物本身签名。生态里已有现成的零件（`dshmarket` / `@nanmicoder` 的 SLSA provenance、Claude Code 的 `sha256`/commit 钉死、npm integrity），**但没有一个用于分享码**。
4. **🟡 没有版本策略的显式化。** 码里不会说清「我钉死了」还是「跟随最新」，导入方也无从知情。
5. **🟢 官方不出面。** DSH 官方 CLI 完全没有 export/import，这是社区产品的空间；但也意味着**没有稳定的 schema 契约可依赖**（`dsh-profile-contract` 是自述的独立提案，不是官方标准）。
6. **🟢 没有撤销/过期/审计。** 短码范式天然做不到 —— 这也是 §2.4 密码管理器全都走「服务端指针」的原因。

**一句话定位机会**：*「一个 500 字符的码，粘进去先看到一张表：这 30 个包里哪些带安装脚本、哪些是新发布的、哪些有 SLSA 证明、哪些你的机器上已经有了；逐项勾选后，只装你勾的，默认零脚本执行。」*

### 4.2 最值得借鉴的 5 个同类产品/机制

| # | 借鉴对象 | 关键设计点 | 链接 |
|---|---|---|---|
| **1** | **Claude Code plugin `dependencies` 套装** | **「套装 = 一个只有 `name` + `dependencies` 的插件」**，`claude plugin install` 一次装全套；加新成员 = 发新版本；配 `claude plugin prune` 清理。这是全网最成熟的「一组插件」抽象 | [Plugin dependencies](https://code.claude.com/docs/en/plugins/dependencies) |
| **2** | **VS Code Profile 分享** | 分享 = **Secret gist + GUID URL**（不是码）；导入后**逐项 unselect**，且**扩展要手动装**。「先看清单、再逐项勾、默认不执行」三件套 | [Profiles](https://code.visualstudio.com/docs/configure/profiles) |
| **3** | **`dsh-profile-contract` SPEC v1beta1** | ① 8 个互不替代的结论状态（禁单一 `verified` 布尔）② `PA-ACT-003` 默认拒绝一切生命周期脚本且授权不随分享物传播 ③ `PA-ACT-004` 授权粒度=精确版本、构建在隔离中跑、合成前复验 ④ `PA-FS-006` 包管理器控制文件静态黑名单 ⑤ `PA-INST-002` 包管理器不得直接跑在分享物上 ⑥ `PA-VER-003` 用户改任一项 → 不再声称合规 | [SPEC.md (unpkg)](https://unpkg.com/dsh-profile-contract@0.1.0-alpha.4/SPEC.md) |
| **4** | **npm 12 `approve-scripts` / pnpm `allowBuilds`** | **把「解析依赖」与「执行安装脚本」拆成两步**；默认拒绝；授权写进项目文件并可提交；`min-release-age` 给浮动版本加时间护栏。DSH 用的就是 pnpm，这层护栏**原生就有** | [npm v12 changelog](https://github.blog/changelog/2026-06-09-upcoming-breaking-changes-for-npm-v12/) · [DSH 打包教程](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish.md) |
| **5** | **1Password / Bitwarden 共享保险库** | **链接 = 授权，不 = 内容**。换来撤销、过期、身份、审计、以及「长度不是问题」。提醒：短码范式在这些能力上是**结构性缺失**，想清楚要哪一套 | [1Password features](https://1password.com/features) · [chezmoi 密码管理器集成](https://www.chezmoi.io/user-guide/password-managers/) |

**（补充第 6 个，dotfiles 为什么是文本）** **【已验证】**：[chezmoi Design FAQ](https://www.chezmoi.io/user-guide/frequently-asked-questions/design/) 专门解释了为什么不像 GNU Stow 用 symlink、为什么不用 Ansible/Chef/Puppet。核心逻辑是**可审阅、可 diff、可版本化、可加密**：
- 文本 → `git diff` 能看出「这次改动到底改了什么」
- 文本 → 能在合成**之前**被人眼审一遍
- 文本 → 属性级加密（`age`/`gpg`/`rage`）只加密敏感文件，公开部分照常 review
- **二进制/编码后的「码」三者全做不到** —— 这是 dotfiles 界二十年的共识，**值得作为默认设计原则**

### 4.3 这套东西最该防的 5 个坑

#### 坑 1 🔴 **「一个『已验证』勾选框」—— 用一个布尔值掩盖四件不同的事**

`dsh-profile-contract` `PA-VER-001` 花了整节来禁止这件事。导入一个陌生套装，**至少有 5 个互不等价的结论**：
`码格式合法` / `包都能解析到（且来源可信）` / `与我的机器兼容` / `合成配置无 patch 诊断` / `真的能启动`
把其中任意一个显示成「✅ 已验证」都是误导 —— 尤其第 2 个和第 3 个是**关于对方包的事实**，第 5 个是**关于我这台机器的事实**。
**做法**：至少分成「静态合法 / 依赖可解析 / 与本机兼容 / 可激活」四行，各自独立可失败。

#### 坑 2 🔴 **把「导入分享码」等同于「授权执行代码」**

这是最致命的认知错位。**导入一个码 = 授权一批陌生代码在未来某台机器上以你的用户权限执行。** 官方 DSH 文档说得很清楚：git 依赖的 `prepare` **"不在 agent 运行的任何沙箱之内"**。
具体表现：码里塞一个 `p1`、`p2`…`p30`，其中 `p17` 带 `postinstall` 直接外传 `~/.dsh/.credentials.yaml`（DSH 的凭据文件，官方明确说凭据从 `$DSH_HOME/.credentials.yaml` / `.env` 解析）。
**做法**：默认 `--ignore-scripts` 等价语义；脚本授权**逐包逐版本**、不随码传播（`PA-ACT-003`）；已授权的构建在隔离 staging 里跑，**合成前复验产物未被改动**（`PA-ACT-004`）。

#### 坑 3 🔴 **「能装上」被当成「装对了」**

用户点完导入，看到 30 个包 installed，绿色对勾。**但**：
- 第 12 个插件的 `cordis.patch.yml` 用 `id:` 覆盖了 `dsh-web-app` 的行 —— 而 DSH 的 patch 是**整行替换 `config`，不深合并**。这意味着它能悄悄改掉 DSH 核心配置行。
- 第 20 个插件声明了 `@deepseek-ai/dsh-client-runtime` 更高的 peer range —— 官方文档明确说 peer 版本范围**不校验**。
- 第 25 个插件带 `!!js` 表达式 —— 官方规定它只允许出现在 `disabled` 或 `config` 值里，但 Reader **绝不求值**，是 Loader 在运行时求值的。
**做法**：导入后必须展示**合成后的最终配置差异**（`dsh --profile X --dump-config` 就能给出带来源注释的树），而不只是「装了什么」。**这是 DSH 独有的、别的 IDE 都没有的能力，一定要用上。**

#### 坑 4 🟡 **码里的包名可能在三年后被抢注（slopsquatting × 时间旅行）**

短码一旦被截图发到论坛/社交平台，就**永久脱离了你的控制**。三年后 `dsh-todo-sync` 这个名字被释放、被抢注、被投毒，任何导入那份旧截图的人都会中招 —— 而他们完全不知道自己导入的是 2026 年的配置。
叠加 LLM 幻觉包名（slopsquatting）：用户是**照着别人的码批量装几十个包**，天然没有「我确实需要这个」的判断。
**做法**：
- 码里**必须带每个包的 integrity/provenance 校验值**（`dshmarket` 和 `@nanmicoder` 已经在做 SLSA provenance，有现成零件）
- 带上 `min-release-age` 式的**时间戳与冷却期提示**：「这批包发布于 2026-09，导入时若已有更新版本会提示你」
- 对超过 N 天的码**明确标记为陈旧**

#### 坑 5 🟡 **把「一键装完」的成功提示当成结束，而忽略了三个必然后果**

- **需要重启才生效。** 官方明确：增删改 bundle 后**必须重启 profile**，而 profile/home 的 `cordis.patch.yml` 才是热重载。生态里 `uluckystar` 和 `aiko` 都专门做了「重启生效」的确认弹窗和**如实告知预估时长与影响**。
- **冲突与回滚没人管。** 导入到一个已经有 20 个插件的 profile 上，id 冲突怎么办？`dsh-profile-contract` `PA-VER-003` 明确说这属于「advanced product workflow」，用户改过任一项后结果就是「locally derived workspace」，**不得再声称原分享物合规**。必须有冲突方案预览 + 回滚（`uluckystar` 的「写前备份 / 写后校验 / 失败自动回滚」是现成范式）。
- **孤儿依赖。** 装了 30 个，删了 1 个，它带进来的 7 个传递依赖还在。Claude Code 为此专门提供了 `claude plugin prune`。DSH 侧没有等价命令，**需要自己实现并暴露给用户**。

---

## 附录：方法与可信度说明

- `npmjs.com`、`socket.dev`、Wikipedia、`thonky.com`、`nayuki.io`、TWCERT、GitHub Discussions 页面 **`web_fetch` 失败或 404** —— 这些来源的内容在本文中**未被采信为事实**。
- 实际可靠的两个 npm 数据源：`registry.npmjs.org`（元数据、发布时间、provenance、attestations）和 `api.npmjs.org/downloads/point/...`（下载量）。
- §3.1 的码长数据是**我在本机实测的**，不是估算；方法与全部载荷已列在表中。
- DSH 官方事实全部来自 `deepseek-ai/deepseek-harness` 仓库的 `apps/cli/reference/README.zh.md` 与 `docs/user/develop/basic/publish.zh.md` 原文。
- `dsh-profile-contract` 的 SPEC 是**完整读过的原文**（约 13 节，含规则表），§1.6 的逐条引用均出自该文。
- 未独立复核的数字：`mydsh.dev` 的 5596/3656 规模（来自插件自述）；`dshp` 的「132 条目复现一致」自述。
