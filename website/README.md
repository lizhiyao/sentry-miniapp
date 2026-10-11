# sentry-miniapp 文档站

基于 [VitePress](https://vitepress.dev/) 的 `sentry-miniapp` 文档站，与 SDK 同仓库、同 Yarn 4 项目维护——`vitepress` 与 `docs:*` 脚本都在**仓库根 `package.json`**，`website/` 只放内容与 `.vitepress/config`，无单独的 `package.json` / 锁文件。

## 本地开发

在**仓库根目录**执行（用与 SDK 一致的 Yarn 4）：

```bash
corepack enable
yarn install
yarn run docs:dev        # 地址以终端输出为准，通常为 http://localhost:5173
yarn run docs:build      # 构建到 website/.vitepress/dist
yarn run docs:preview    # 预览构建产物
```

仓库继续使用稳定版 VitePress 1；其 Vite 依赖通过根 `resolutions` 覆盖到仍接收安全修复的 Vite 6。CI 会执行 `yarn docs:build`，依赖升级时必须保持文档站构建兼容。

## 内容边界与单一来源

`website/` 是面向 SDK 用户的主文档入口：接入、配置、框架指南、平台能力和排障内容都应在站内可发现，不应要求用户跳回仓库查找答案。

`docs/` 保留英文 README、设计取舍、按版本的审查记录、对外文章和媒体素材，入口见[文档索引](../docs/README.md)。维护者职责与实现原因由 [ARCHITECTURE.md](../ARCHITECTURE.md) 说明。

同一内容只维护一份。面向用户的完整指南直接放在 `website/guide/`，站内页面、更新时间和「在 GitHub 上编辑此页」都对应同一个源文件。

- 接入页先给完整步骤和最小配置，再链接可选能力；参数页列类型、默认值与使用边界。
- 普通能力页写当前行为和设计原因；旧配置、字段变化和历史差异放在迁移页。
- 用户需要据此选择或操作的限制应保留；内部测试数量、验收流水和修复经过留在维护记录。
- 示例配置对照 `src/types.ts`、默认集成和实际脚本；Source Map 命令优先使用已安装 SDK 自带的工具。
- 调整标题时保留已使用的锚点。提交前构建文档、核对本地链接和锚点，并预览受影响页面。

## 部署（Cloudflare Pages）

在 Cloudflare Pages 控制台「连接到 Git」选择本仓库，按如下设置（构建跑在仓库根、用 Yarn 4，与 SDK 完全一致，无 subdir / 包管理器特例）：

| 配置项 | 值 |
|--------|----|
| Root directory（根目录） | `/`（留空即根） |
| Build command（构建命令） | `yarn run docs:build` |
| Build output directory（输出目录） | `website/.vitepress/dist` |

之后每次 push 到 `master` 自动构建发布，PR 自带预览地址。默认地址形如 `https://<项目名>.pages.dev`，可在 Cloudflare 后续绑定自定义域名。

> 站点 `base` 为 `/`（Cloudflare 根域）。若改用 GitHub Pages（子路径 `/sentry-miniapp/`），需把 `.vitepress/config.mts` 的 `base` 改为 `'/sentry-miniapp/'`。
