# 部署

[文档目录](README.md) · [开发指南](DEVELOPMENT.md)

## 启用 GitHub Pages

1. 将代码提交到自己的 GitHub 仓库。
2. 在 Settings → Pages → Source 选择 **GitHub Actions**。
3. 在 Actions → **发布 HANE Voyage** 中点击 **Run workflow**。

## 工作流与触发条件

有两个工作流：建站的 [deploy.yml](../.github/workflows/deploy.yml)，和每天更新数据的 [update-data.yml](../.github/workflows/update-data.yml)（见下文「更新数据」）。下面先说建站。
推送 `main` 且改动涉及 `index.html`、`src/`、`data/voyage.json`、`src-tauri/`、`package.json`、`package-lock.json`、`vite.config.ts`、`tsconfig.json` 或工作流时自动发布，也可以手动运行。只更新数据的提交也会重建网站。纯 README 或 `docs/` 修改不会重建网站。

| Job | 运行环境 | 内容 |
|---|---|---|
| `build` | Ubuntu | 用 Node.js 24 运行 `npm ci` 和 `npm run build`（先做类型检查），把 `dist/` 上传为 Pages artifact，并把 `dist/index.html` 打成离线包 |
| `deploy` | Ubuntu | 在 `build` 成功后发布网站 |
| `desktop` | Windows | 用 Tauri 构建桌面版：免安装的 exe 和 NSIS 安装包。Rust 用 GitHub 机器上预装的版本，依赖和编译结果按 `src-tauri/Cargo.lock` 缓存 |
| `release` | Ubuntu | 在 `build` 和 `desktop` 都成功后，把三个文件上传到 Release「offline」，替换旧文件，并更新下载说明 |

类型检查或构建失败时，对应的发布会停止，网站和下载文件保持上一版。工作流默认权限是 `contents: read`、`pages: write`、`id-token: write`；只有 `release` 用 `contents: write` 更新 Release。建站不采集数据，也不需要配置 Secrets。

Windows 上第一次构建要编译全部 Rust 依赖，约需 10 到 20 分钟；有缓存后会快很多。

## 更新数据

数据每天自动更新：公开仓库每天日本时间 03:00（UTC 18:00）运行 [update-data.yml](../.github/workflows/update-data.yml)，抓 vtbs.moe 的每日人数和粉丝数、翻一遍当前的大航海名单（含昵称），合成 `data/voyage.json` 提交到 `main`，再触发建站。名单接口不用登录，不需要配置任何 Cookie。在 Actions 里点「每日更新大航海数据」的 Run workflow 可以立刻更新一次。步骤、快照怎么存、失败时怎样，见 [数据](DATA.md#每日自动更新)。

GitHub 的定时任务在高峰时可能晚几分钟到一小时开始。仓库连续 60 天没有活动时，GitHub 会停掉定时任务；每天的数据提交本身就算活动，所以正常不会停。失败时 GitHub 会给仓库所有者发邮件。

在本地更新数据也可以：运行 `uv run python -X utf8 -m voyage update`，再运行 `npm run build` 看一眼。合成时提示「核实数字对不上」，说的是时间轴上的白点（人工核实过的数字）和 vtbs.moe 当天最后一条记录之间的差，不是更新出了错，原因见 [数据](DATA.md#已核实的数字)。

## 发布内容

网站只上线 `dist/index.html`。脚本、样式、着色器和 three.js 都打包在这一个文件里；字体从 Google Fonts 加载，没有网络时用系统字体。文档、开发文件和 Python 环境定义不进入网站。

Release「offline」里的文件名固定，下载地址是 `https://github.com/<仓库>/releases/download/offline/<文件名>`：

| 文件 | 内容 |
|---|---|
| `HANE-Voyage-setup.exe` | Windows 安装版。装在当前用户下，不需要管理员权限，开始菜单里有快捷方式；缺少 WebView2 时会先下载安装 |
| `HANE-Voyage.exe` | Windows 免安装版，双击运行。需要 Microsoft Edge WebView2，Windows 11 已自带 |
| `HANE-Voyage-offline.zip` | 网页离线版，里面是 `index.html`，解压后用 Chrome 或 Edge 打开 |

两个 exe 都没有代码签名，Windows 可能提示「Windows 已保护你的电脑」，需要点「更多信息」再点「仍要运行」。
