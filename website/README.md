# sentry-miniapp 文档站

基于 [VitePress](https://vitepress.dev/) 的 `sentry-miniapp` 文档站，与 SDK 同仓库、同 Yarn 4 项目维护——`vitepress` 与 `docs:*` 脚本都在**仓库根 `package.json`**，`website/` 只放内容与 `.vitepress/config`，无单独的 `package.json` / 锁文件。

## 本地开发

在**仓库根目录**执行（用与 SDK 一致的 Yarn 4）：

```bash
yarn install         # 安装含 vitepress 在内的全部 devDependencies
yarn docs:dev        # 本地预览 http://localhost:5173
yarn docs:build      # 构建到 website/.vitepress/dist
yarn docs:preview    # 预览构建产物
```

## 内容边界与单一来源

`website/` 是面向 SDK 用户的主文档入口：接入、配置、框架指南、平台能力和排障内容都应在站内可发现，不应要求用户跳回仓库查找答案。

`docs/` 保留不适合进入主导航的内容，包括英文仓库 README、对外文章和媒体素材。

同一内容只维护一份。面向用户的完整指南直接放在 `website/guide/`，站内页面、更新时间和「在 GitHub 上编辑此页」都对应同一个源文件。

## 部署（Cloudflare Pages）

在 Cloudflare Pages 控制台「连接到 Git」选择本仓库，按如下设置（构建跑在仓库根、用 Yarn 4，与 SDK 完全一致，无 subdir / 包管理器特例）：

| 配置项 | 值 |
|--------|----|
| Root directory（根目录） | `/`（留空即根） |
| Build command（构建命令） | `yarn docs:build` |
| Build output directory（输出目录） | `website/.vitepress/dist` |

之后每次 push 到 `master` 自动构建发布，PR 自带预览地址。默认地址形如 `https://<项目名>.pages.dev`，可在 Cloudflare 后续绑定自定义域名。

> 站点 `base` 为 `/`（Cloudflare 根域）。若改用 GitHub Pages（子路径 `/sentry-miniapp/`），需把 `.vitepress/config.mts` 的 `base` 改为 `'/sentry-miniapp/'`。
