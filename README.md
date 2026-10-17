<p align="center">
  <img src="icon.svg" width="96" alt="dsh-plugin-share icon">
</p>

# DSH Plugin Share

[English](README.en.md) | 中文

用分享码或二维码分享你的 DSH 插件清单。接收方可以逐项安装，并同步启用状态。

[![stars](https://img.shields.io/github/stars/HGT158/dsh-plugin-share?style=flat)](https://github.com/HGT158/dsh-plugin-share)
[![release](https://img.shields.io/github/v/tag/HGT158/dsh-plugin-share?style=flat)](https://github.com/HGT158/dsh-plugin-share/tags)
[![npm](https://img.shields.io/npm/v/dsh-plugin-share?style=flat)](https://www.npmjs.com/package/dsh-plugin-share)
[![DSH bundle](https://img.shields.io/badge/DSH-bundle-4f46e5)](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish)

![插件分享标签页](https://raw.githubusercontent.com/HGT158/dsh-plugin-share/main/docs/plugin-share-tab.png)

## 安装

```powershell
dsh plugin --profile web add dsh-plugin-share
dsh --profile web
```

把 `web` 换成你使用的 profile 名称。启动后打开 **设置 → 内置插件 → 插件分享**。分享方和接收方都需要安装本插件。

指定版本时，将包名写成 `dsh-plugin-share@0.2.4`。也可以从 GitHub 安装：

```powershell
dsh plugin --profile web add 'dsh-plugin-share@github:HGT158/dsh-plugin-share#main'
```

请保留 GitHub 安装命令里的 `包名@` 前缀，避免依赖名解析错误。

桌面端：点击左上角「插件」，输入包名 `dsh-plugin-share` 即可安装。

已在 DSH `0.2.1-rc.2` 和 `0.2.0-rc.2` 的 Web profile 验证。CLI 无法修改桌面 profile。

## 使用

1. **分享：**点「从当前 profile 导出」，再点「复制」发给对方。也可以点「展示二维码」，保存为 PNG 或 SVG。
2. **接收：**粘贴分享码，点「解析组合码」。二维码图片可以通过「扫码导入」选择，或直接拖进面板。
3. **安装：**核对插件名称和来源，逐项点「安装」「启用」或「停用」，也可以点「全部安装」。解析本身不会修改插件。

安装后重启 DSH；页面没有更新时，按 Ctrl+F5 刷新。

![二维码面板](https://raw.githubusercontent.com/HGT158/dsh-plugin-share/main/docs/plugin-share-qr.png)

扫码支持清晰、正对的二维码图片。模糊、倾斜或过密的二维码识别失败时，请直接发送分享码。

### 提示「需手动更新」时

当前 DSH 无法在线替换已安装的插件。出现这个提示时，「全部安装」会禁用，其他插件仍可单独安装。

Web 用户先退出对应的 DSH 实例，按该行显示的完整安装规格执行：

```powershell
dsh plugin --profile web add "<完整安装规格>"
```

然后重新启动并解析。桌面用户请在应用内更新插件，再重启应用。

分享码未指定版本时，已安装的插件也会提示手动更新。新装 npm 包按默认标签解析；GitHub 按码里的分支、标签或提交安装，未指定则使用默认分支。

## 更新本插件

退出对应的 DSH 实例后执行：

```powershell
dsh plugin --profile web update dsh-plugin-share
dsh --profile web
```

从 GitHub 安装的版本也使用这条命令更新。

## 使用须知

- 分享码只包含插件来源、版本和启用状态，不包含配置、API key 或 token。接收方需要自行配置插件。
- 支持 npm、GitHub 和 DSH 官方可选内置插件；导出时会跳过本地路径等不支持的来源，并显示数量。
- 分享码和二维码在本机处理，图片不会上传。安装插件时需要联网下载。
- 安装前请核对来源。分享码的校验只能发现数据损坏，不能证明插件可信；第三方插件可以执行代码。需要安装脚本的包会另行请求批准。
- 批量操作失败后会停止，并尝试撤销本次新装的插件、恢复改过的启用状态。
- 分享接口使用 DSH 的登录鉴权及 Host/Origin 校验，未登录的请求无法读取清单或安装插件。

## 开发

```powershell
npm test                       # 57 项测试
pnpm pack --dry-run            # 检查发布内容
npm run encode:example         # 生成示例分享码
node src/cli.mjs decode D1...   # 解码分享码
```

协议、字段和导入流程见 [PLAN.md](PLAN.md)。CI 在每次 push 和 PR 时运行测试及打包检查。

## 相关

- [DSH 插件开发文档](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish)
- [dsh-market 插件市场](https://github.com/dsh-market/dsh-market)

## License

MIT
