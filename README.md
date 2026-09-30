# DSH Plugin Share

一个按 DSH **bundle** 格式打包的 Web 插件，用离线分享码导出和导入可移植的插件清单。分享码只包含插件来源、版本和启用状态，不包含插件配置、凭据或本机路径。

当前版本通过 `dsh.client` 接入 DSH Web，在“设置 → 插件”中提供导出、粘贴解析、预览、安装、构建脚本确认、取消和复制。组合码以 `D1` 开头，内部使用 NP1 风格的二进制记录：短清单直接使用原始二进制；长清单仅在 `deflate-raw` 结果更短时使用压缩，否则仍使用原始记录。

## DSH 插件格式

根目录是一个可公开安装的 DSH bundle：

- `package.json` 的 `dsh.bundle.patch` 指向 [`cordis.patch.yml`](cordis.patch.yml)；
- `dsh.client` 声明 Web 客户端入口，`exports["./client"]` 指向 [`src/client.js`](src/client.js)；
- patch 行的 `name` 与 package name 都是 `dsh-plugin-share`；
- [`src/index.mjs`](src/index.mjs) 是 Host 半入口，提供编码器、采集器、预览和导入适配器。

这遵循 DSH 官方的组合包模型：bundle 提供一个 patch 层，profile 负责安装和排列 bundle。客户端代码不会读取或上传 profile 配置文件。

## 安装

在 Harness Web profile 中从公开 GitHub 仓库安装：

```powershell
dsh plugin --profile web add 'github:HGT158/dsh-plugin-share#main'
dsh --profile web
```

打开 Harness Web 的“设置 → 插件”，找到“插件分享”。从 GitHub 源安装时，DSH/pnpm 可能报告依赖包的构建脚本；只在信任源代码并理解其用途时批准。

## 本地开发和测试

从仓库根目录运行：

```powershell
npm test
pnpm pack --dry-run
npm run encode:example
node src/cli.mjs decode D1...
```

用一个新的临时 Web profile 测试本地工作树（profile 名称必须尚未使用）：

```powershell
$profile = 'plugin-share-test'
dsh --profile $profile --from-default-profile web --dump-config
dsh plugin --profile $profile add (Get-Location).Path
dsh --profile $profile
```

测试后移除临时 profile 中的 bundle：

```powershell
dsh plugin --profile plugin-share-test remove dsh-plugin-share
```

## 支持的来源与安全边界

- npm 包：包名和版本或版本范围；未指定版本时跟随最新版本；
- GitHub 来源：`github:owner/repo`，可选 `#ref`；
- DSH 官方可选 builtin bundle：包名和启用状态。

本地路径、`file:`、`link:`、`portal:`、`workspace:`、任意 HTTP(S) URL、Git remote、配置字段和未知字段都会拒绝。导入会先展示预览；构建脚本必须由用户明确批准。CRC32 只用于发现复制错误，不是签名或防篡改证明，因此请核对导入预览并只安装可信来源。

完整的字段模型、D1/NP1 帧结构、采集规则、事务回滚和已知限制见 [`PLAN.md`](PLAN.md)。

## 项目检查

GitHub Actions 在 push 和 Pull Request 时运行 `npm test` 与 `pnpm pack --dry-run`。发布前还应确认：

- `package.json` 不含私有包标记、个人邮箱、认证信息或本机路径；
- `cordis.patch.yml` 的 bundle 名称与 package name 一致；
- 短清单保持 raw，长清单只有在压缩更短时才使用 `deflate-raw`；
- 公共文件没有凭据值或不可移植的绝对路径。
