# Sentry Miniapp SDK 开发指南

本文档介绍如何在开发过程中构建、测试和调试 `sentry-miniapp` SDK。

## 🚀 快速开始

### 0. 环境要求

- **Node.js** ≥ 20
- **Yarn 4**：项目通过 `package.json` 的 `packageManager` 字段固定 Yarn 版本，推荐用 [Corepack](https://nodejs.org/api/corepack.html) 自动对齐，无需全局手动安装：

  ```bash
  corepack enable   # 启用后，仓库内执行 yarn 会自动使用固定的 Yarn 4 版本
  ```

### 1. 安装依赖

```bash
yarn install
```

### 2. 开发与构建命令

| 命令 | 说明 |
|------|------|
| `yarn dev` | 监听源码并持续构建标准 ESM/CJS/UMD 产物 |
| `yarn build` | 构建标准 ESM/CJS/UMD 产物与类型声明 |
| `yarn build:miniapp` | 构建微信示例使用的独立 CommonJS bundle，并执行兼容性与加载检查 |
| `yarn dev:miniapp` | 监听源码并持续构建微信示例 bundle |
| `yarn build:types` | 构建类型定义文件（d.ts） |
| `yarn test` | 运行单元测试（Vitest） |
| `yarn test:coverage` | 运行单元测试并检查覆盖率门槛 |
| `yarn lint` | 运行 ESLint 检查 |

---

## 🛠 开发与调试工作流

我们提供了一个完整的微信小程序示例项目（`examples/wxapp`），用于在真实环境中验证您的代码修改。

### 示例产物

`examples/wxapp/lib/` 是本地生成目录，不进入版本控制。标准 `yarn build` 只负责 npm 包产物；需要运行微信示例时，使用专用的小程序构建命令，避免日常构建产生无关的大文件 diff。

### 调试步骤

1. **启动监听**：在终端运行 `yarn dev:miniapp`。
2. **修改源码**：在 `src/` 目录下修改 TypeScript 代码。保存后会自动重新生成 `examples/wxapp/lib/sentry-miniapp.js` 与 Source Map。
3. **微信开发者工具**：
   - 打开微信开发者工具，导入 `examples/wxapp` 目录。
   - 每次代码保存后，开发者工具会自动热更新。
   - 开发版本默认开启了 **Source Map**，您可以在开发者工具的 Sources 面板中直接对 TS 源码打断点调试。
4. **Console 调试**：您也可以在源码中临时添加 `console.log('🐛 [DEBUG]', data)` 来快速验证。

---

## 📁 核心目录结构

```text
sentry-miniapp/
├── src/                          # 核心源码目录
│   ├── index.ts                  # SDK 主入口
│   ├── client.ts                 # 核心 Client 实现
│   ├── integrations/             # 各类集成模块（如 Performance, Router 等）
│   └── transports/               # 数据传输层（XHR, 离线缓存）
├── test/                         # 单元测试（Vitest）
├── examples/wxapp/               # 用于调试的微信小程序示例
│   ├── lib/                      # [自动生成] SDK 构建产物目录
│   ├── app.js                    # 小程序入口，SDK 初始化处
│   └── pages/                    # 测试页面
└── package.json
```

---

## 🧪 测试和质量保证

项目包含完善的测试覆盖率（700+ 个测试用例）：

- **单元测试 (`yarn test`，Vitest)**：覆盖核心类、工具函数与集成插件（跨端兼容性、面包屑、去重、transport 等），用 mock 的平台全局对象跑通 init → 事件构建 → transport → `wx.request` 全链路。
- **真实 core 集成测试 (`test/*.realcore.test.ts`)**：不 mock `@sentry/core`，验证事件、transaction、session 最终进入 envelope 的形态。自定义 transport 与 envelope 解析统一复用 `test/support/`。

测试必须执行 `src/` 或仓库脚本中的生产逻辑；不要只调用测试文件里临时创建的 mock、示例重试函数或常量再断言自身行为。时间相关逻辑优先使用 Vitest fake timers，避免真实等待拖慢 CI。

在提交 Pull Request 前，请务必确保所有测试通过，且没有 Lint 错误：

```bash
yarn lint && yarn typecheck && yarn test:coverage
```

---

## 📦 发布流程 (Maintainers Only)

项目已配置 GitHub Actions 自动化 CI/CD，使用 `commit-and-tag-version` 管理版本号与 tag。`master` 是受保护分支，发版提交也需要通过 PR 合入。常规发版流程如下：

1. **本地校验**：运行 `yarn lint` 和 `yarn test` 确保代码健康。
2. **创建 release 分支并生成发版提交**：从最新 `master` 创建短分支后运行 `yarn release`，该命令会自动完成以下操作：
   - 根据 Conventional Commits 更新版本号
   - 创建 Git commit 和 tag
3. **同步 SDK 版本常量**：确保 `src/version.ts` 中的 `SDK_VERSION` 与 `package.json` 版本一致（CI 测试会自动校验）。
4. **通过 PR 合入 release commit**：推送 release 分支并创建 PR。合并时使用 merge commit，保留 `vX.Y.Z` tag 指向的 release commit 进入 `master` 历史；不要 squash release PR。
5. **推送 Tag 触发发布**：

   ```bash
   git push origin vX.Y.Z
   ```

6. GitHub Actions 将自动接管构建、通过 npm Trusted Publishing（OIDC）发布到 NPM，并在发布成功后通过 `softprops/action-gh-release@v3` 创建对应的 GitHub Release。Release notes 由 GitHub 根据 tag 之间的 PR 自动生成，同时附带可直接下载的 `sentry-miniapp.umd.js` 与 Source Map。

### npm Trusted Publishing

发布工作流不使用长期 `NPM_TOKEN`。npm 包设置中的 Trusted Publisher 必须与仓库配置精确匹配：

- Provider：GitHub Actions
- Organization or user：`lizhiyao`
- Repository：`sentry-miniapp`
- Workflow filename：`publish.yml`
- Allowed actions：`npm publish`
- Environment：不设置

`.github/workflows/publish.yml` 使用 GitHub 托管 runner，并授予 `id-token: write`。npm CLI 会用 GitHub OIDC 身份换取仅对当前 workflow 有效的短期发布凭证，并自动生成 provenance；不要重新添加 `NODE_AUTH_TOKEN` 或发布权限 token。

首次 OIDC 发版验证成功后，应在 npm 的 Publishing access 中选择 **Require two-factor authentication and disallow tokens**，删除仓库中的 `NPM_TOKEN` Secret，并撤销 npm 账户里不再使用的发布 token。若发布报 `ENEEDAUTH`，优先检查 npm Trusted Publisher 的仓库名、workflow 文件名和可执行 action 是否完全一致。

仓库不再保留单独的 `CHANGELOG.md`。PR title / description 是发版说明的唯一信息源，包含 BREAKING CHANGE、迁移方式或兼容性注意事项的改动必须在 PR 描述里写清楚。
