# DSH Plugin Share

把「我这套装了哪些插件」变成一段可粘贴的**离线分享码**，别人贴进去就能**逐个安装**。

> Offline, pasteable DSH plugin-set share codes: export your plugin list, import someone else's one plugin at a time.

![插件分享标签页](docs/plugin-share-tab.png)

---

## 快速开始

### 1. 安装插件

分享方和接收方**都需要装这个插件**——它提供的正是「导出/粘贴导入」这个界面。码本身只是文本。

```powershell
dsh plugin --profile web add 'github:HGT158/dsh-plugin-share#main'
dsh --profile web
```

然后打开 Harness Web → **设置 → 内置插件 → 插件分享**。

> 这个包是纯 JS、零依赖、没有构建脚本，所以安装时**不会要求你批准任何 build script**，装完即用。

### 2. 导出：把你这套插件变成码

1. 点 **「从当前 profile 导出」**
2. 文本框出现 `D1...` 开头的码
3. 点 **「复制」**，发给对方（微信 / Slack / 任何能发文本的地方）

### 3. 导入：把别人的码装到本机

1. 把码粘进文本框，点 **「解析组合码」**
2. 下面逐行列出：插件名、来源（`npm` / `github.com` / `builtin`）、完整安装规格、将要执行的动作
3. 每个插件右侧都有**自己的按钮**：

   | 按钮 | 含义 |
   |---|---|
   | `安装` | 本机没有 → 安装 |
   | `升级` | 已装旧版本 → 升级到码里的版本 |
   | `启用` / `停用` | 已装但启用状态不一致 → 只改状态，不重装 |
   | `已是当前版本` | 无需操作（灰色不可点） |

   也可以点顶部 **「全部安装」** 一次装完。
4. 某个包需要跑安装脚本时，会单独提示并等你勾选批准——**默认拒绝执行脚本**
5. 装完**重启 dsh** 生效

---

## 更新到最新版

锁文件会把 `#main` 钉在某个具体提交上，所以升级要显式执行：

```powershell
dsh plugin --profile web update dsh-plugin-share
dsh --profile web
```

想固定版本（可复现），改用 tag：

```powershell
dsh plugin --profile web add 'github:HGT158/dsh-plugin-share#v0.1.0'
```

---

## 码里有什么

只有三样东西：

| 字段 | 说明 |
|---|---|
| 来源 | npm 包名 / `github:owner/repo[#ref]` / DSH 官方可选 builtin |
| 版本 | 版本或版本范围；留空表示跟随最新 |
| 启用状态 | 启用 / 停用 |

**不含**插件配置、`settings`、`patch`、密钥、token、认证信息或本机路径。格式细节见 [PLAN.md](PLAN.md)。

### 支持的来源

- npm 包：包名 + 版本或版本范围
- GitHub：`github:owner/repo`，可选 `#ref`
- DSH 官方可选 builtin bundle：包名 + 启用状态

### 一律拒绝

本地路径、`file:`、`link:`、`portal:`、`workspace:`、任意 HTTP(S) tarball、Git remote（`git+…` / `git@` / `ssh://`）、配置字段与未知字段。

---

## 安全边界

- 导入**一定先展示逐条预览**，不会静默安装任何东西
- 安装脚本**默认拒绝**，必须你显式批准；批准只对本次生效，不会随码传播
- 失败即停，并撤销本次新装的包（已存在的升级不会被破坏性回滚）
- **CRC32 只用来发现复制错误，不是签名**，也不能防篡改。请核对预览里的来源再安装

---

## 开发

```powershell
npm test                 # 编解码 + 采集 + 导入事务，共 20 项
pnpm pack --dry-run      # 检查发布内容
npm run encode:example   # 用 examples/plugins.json 生成一个码
node src/cli.mjs decode D1...   # 命令行解码
```

把本地工作树装进一个临时 profile：

```powershell
$profile = 'plugin-share-test'
dsh --profile $profile --from-default-profile web --dump-config
dsh plugin --profile $profile add (Get-Location).Path
dsh --profile $profile
```

### 项目结构

| 文件 | 作用 |
|---|---|
| `package.json` | DSH bundle 清单：`dsh.bundle.patch` + `dsh.client` |
| `cordis.patch.yml` | 插入本插件的那一行 patch |
| `src/index.mjs` | Host 半入口（编解码、采集、预览、导入） |
| `src/client.js` | Web Client 半（设置页里的标签页） |
| `src/shared/` | D1/NP1 编解码与条目校验 |
| `src/host/` | 采集、预览、事务导入、HTTP 路由 |

CI 在每次 push / PR 时运行 `npm test` 与 `pnpm pack --dry-run`。
