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

## 单一来源

站点不复制内容：大指南通过 VitePress 的 `<!--@include-->` 直接引入仓库 `docs/` 下的规范文档（如 `guide/sourcemap.md` 引入 `../../docs/SOURCEMAP_GUIDE.md`）。修改这类内容请改 `docs/` 里的源文件，站点会自动同步。

## 部署（Cloudflare Pages）

在 Cloudflare Pages 控制台「连接到 Git」选择本仓库，按如下设置（构建跑在仓库根、用 Yarn 4，与 SDK 完全一致，无 subdir / 包管理器特例）：

| 配置项 | 值 |
|--------|----|
| Root directory（根目录） | `/`（留空即根） |
| Build command（构建命令） | `yarn docs:build` |
| Build output directory（输出目录） | `website/.vitepress/dist` |

之后每次 push 到 `master` 自动构建发布，PR 自带预览地址。默认地址形如 `https://<项目名>.pages.dev`，可在 Cloudflare 后续绑定自定义域名。

> 站点 `base` 为 `/`（Cloudflare 根域）。若改用 GitHub Pages（子路径 `/sentry-miniapp/`），需把 `.vitepress/config.mts` 的 `base` 改为 `'/sentry-miniapp/'`。
