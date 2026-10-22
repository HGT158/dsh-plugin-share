<p align="center">
  <img src="icon.svg" width="96" alt="dsh-plugin-share icon">
</p>

# DSH Plugin Share

English | [中文](README.md)

Share your DSH plugin list as text or a QR code. Recipients can install plugins individually and match their enabled states.

[![stars](https://img.shields.io/github/stars/HGT158/dsh-plugin-share?style=flat)](https://github.com/HGT158/dsh-plugin-share)
[![release](https://img.shields.io/github/v/tag/HGT158/dsh-plugin-share?style=flat)](https://github.com/HGT158/dsh-plugin-share/tags)
[![npm](https://img.shields.io/npm/v/dsh-plugin-share?style=flat)](https://www.npmjs.com/package/dsh-plugin-share)
[![DSH bundle](https://img.shields.io/badge/DSH-bundle-4f46e5)](https://deepseek-harness.github.io/deepseek-harness/develop/basic/publish)

![Plugin share tab](https://raw.githubusercontent.com/HGT158/dsh-plugin-share/main/docs/plugin-share-tab-en.png)

## Install

```powershell
dsh plugin --profile web add dsh-plugin-share
dsh --profile web
```

Replace `web` with your profile name. Open **Settings → Built-in plugins → Plugin share** after starting DSH. Both sender and recipient need this plugin.

To pin a version, use `dsh-plugin-share@0.2.5` as the package name. You can also install from GitHub:

```powershell
dsh plugin --profile web add 'dsh-plugin-share@github:HGT158/dsh-plugin-share#main'
```

Keep the `package@` prefix in the GitHub command to avoid dependency name errors.

In the desktop app, click **Plugins** in the top-left corner and enter `dsh-plugin-share` to install.

This release was tested with a Web profile on DSH `0.2.1-rc.2`; earlier releases were also tested on `0.2.0-rc.2`. The CLI cannot modify desktop profiles.

## Usage

1. **Share:** click **Export current profile**, check the plugins to share (all are selected initially), then click **Generate selected code**. Choose **Copy** and send the code, or **Show QR code** and save it as PNG or SVG. Unchecked plugins stay out of the code; select at least one item.
2. **Receive:** paste a code and click **Parse code**. For a QR image, choose **Scan a code** or drop the image onto the panel.
3. **Install:** check the plugin names and sources, then click **Install**, **Enable**, or **Disable** on each row, or use **Queue all available**. Parsing alone does not change any plugins.

While an installation runs, click other plugins to queue them in click order. One item runs at a time. Waiting items show their position and can be removed individually or with **Clear waiting items**. A failure or script approval request pauses the queue and keeps completed items. Retry, approve scripts, or choose **Skip and continue**. Cancelling the current install waits for the host operation to finish before pausing.

The code, parsing, export, and scanning controls stay locked while the queue is unfinished. Closing settings keeps the queue running. Reloading or closing the page loses waiting items, while an already submitted install may still run on the host; parse again when returning. If the connection drops, the queue checks the host result first. When **Reconnect** appears, use it to confirm the original operation before continuing.

**Item results** at the bottom keeps this browser's last 100 operations with a returned result, showing the plugin, time, action and outcome. Each retry is recorded separately; parsing, exporting or reloading the page keeps these records. **Clear result history** removes only records, without changing plugins or the queue. Records contain names, install specs and short error codes, not share codes, configuration or raw install logs. They do not represent the current plugin state or restore operations that were unfinished at reload. If browser storage is blocked, a notice explains that results are kept only on the current page.

Restart DSH after installing. If the page still looks unchanged, press Ctrl+F5 to refresh.

![QR code panel](https://raw.githubusercontent.com/HGT158/dsh-plugin-share/main/docs/plugin-share-qr-en.png)

Scanning works with clear, upright QR images. If a blurry, tilted, or dense code fails to scan, send the text instead.

### When you see “Manual update needed”

The current DSH installer cannot replace an installed plugin while DSH is running. Such entries stay out of the queue; **Queue all available** can still process other plugins.

For a Web profile, stop that DSH instance and use the full install spec shown on the row:

```powershell
dsh plugin --profile web add "<full install spec>"
```

Then restart DSH and parse again. For the desktop app, update plugins in the app and restart it.

An entry without a version also requires a manual update if the plugin is already installed. For new installs, npm uses its default tag; GitHub uses the branch, tag, or commit in the code, or the default branch if none is specified.

## Update this plugin

Stop the corresponding DSH instance, then run:

```powershell
dsh plugin --profile web update dsh-plugin-share
dsh --profile web
```

The same command updates GitHub installations.

## Notes

- Codes contain only plugin sources, versions, and enabled states. Configuration, API keys, and tokens are excluded. Recipients configure each plugin themselves.
- npm, GitHub, and official optional DSH builtins are supported. Unsupported sources, such as local paths, are skipped and counted during export.
- Share codes and QR images are processed by your browser and the connected DSH instance, without third-party services. To scan an image, the browser resizes it and sends grayscale data to that DSH instance; a remote instance receives this data on its remote host. Installing plugins requires a network connection.
- Check sources before installing. The checksum detects damaged data but does not establish trust; third-party plugins can execute code. Packages that need install scripts require separate approval.
- The queue processes one item at a time and pauses on failure. Previously completed installations and enabled-state changes are kept.
- Share endpoints use DSH login authentication and Host/Origin checks. Unauthenticated requests cannot read the plugin list or install plugins.

## Development

```powershell
npm test                       # automated tests
pnpm pack --dry-run            # inspect package contents
npm run encode:example         # generate an example code
node src/cli.mjs decode D1...   # decode a share code
```

See [PLAN.md](PLAN.md) for the protocol, fields, and import flow. CI runs tests and package checks on every push and pull request.

## Related

- [DSH plugin documentation](https://deepseek-harness.github.io/deepseek-harness/en/develop/basic/publish)
- [dsh-market plugin marketplace](https://github.com/dsh-market/dsh-market)

## License

MIT
