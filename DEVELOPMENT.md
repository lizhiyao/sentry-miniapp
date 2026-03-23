# Sentry Miniapp SDK 开发指南

本文档介绍如何在开发过程中构建、测试和调试 `sentry-miniapp` SDK。

## 🚀 快速开始

### 1. 安装依赖

```bash
npm install
```

### 2. 开发与构建命令

| 命令 | 说明 |
|------|------|
| `npm run dev` | **[推荐]** 启动监听模式，自动构建并同步到示例项目中 |
| `npm run build` | 构建标准版本（产出 ESM/CJS/UMD 格式，并自动同步到 examples） |
| `npm run build:miniapp` | 仅构建小程序版本 |
| `npm run build:types` | 构建类型定义文件（d.ts） |
| `npm test` | 运行单元测试 |
| `npm run test:watch` | 监听模式运行测试 |
| `npm run test:integration`| 运行端到端集成测试 |
| `npm run lint` | 运行 ESLint 检查 |

---

## 🛠 开发与调试工作流

我们提供了一个完整的微信小程序示例项目（`examples/wxapp`），用于在真实环境中验证您的代码修改。

### 自动同步机制

得益于最新的构建脚本，您**不需要手动复制文件**。
当您运行 `npm run build` 或 `npm run dev` 时，系统会自动将构建出的 `dist/sentry-miniapp.umd.js` 复制到 `examples/wxapp/lib/sentry-miniapp.js` 中。

### 调试步骤

1. **启动监听**：在终端运行 `npm run dev`。
2. **修改源码**：在 `src/` 目录下修改 TypeScript 代码。保存后终端会提示自动重新构建并同步。
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
├── test/                         # 单元测试（Jest）
├── integration-tests/            # 集成测试脚本（Node.js 端到端验证）
├── examples/wxapp/               # 用于调试的微信小程序示例
│   ├── lib/                      # [自动生成] SDK 构建产物目录
│   ├── app.js                    # 小程序入口，SDK 初始化处
│   └── pages/                    # 测试页面
└── package.json
```

---

## 🧪 测试和质量保证

项目包含完善的测试覆盖率（近 300 个测试用例）：

- **单元测试 (`npm test`)**：覆盖了所有的核心类、工具函数和集成插件（如跨端兼容性、面包屑拦截等）。
- **集成测试 (`npm run test:integration`)**：通过 Node.js 脚本模拟真实的 Sentry 数据上报，验证异常捕获、限流（Rate Limit）、离线重试等端到端流程。

在提交 Pull Request 前，请务必确保所有测试通过，且没有 Lint 错误：

```bash
npm run lint && npm test
```

---

## 📦 发布流程 (Maintainers Only)

项目已配置 GitHub Actions 自动化 CI/CD。常规发版流程如下：

1. **本地校验**：运行 `npm run lint` 和 `npm run test:all` 确保代码健康。
2. **更新版本号**：修改 `package.json` 中的 `version` 字段。
3. **更新文档**：将新特性和破坏性更新写入 `CHANGELOG.md`。
4. **打 Tag 并推送**：

   ```bash
   git commit -am "chore: release vX.X.X"
   git tag vX.X.X
   git push origin main --tags
   ```

5. GitHub Actions 将自动接管构建并发布到 NPM。
