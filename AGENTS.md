# AGENTS.md - Agent 入场清单

sentry-miniapp 是基于 `@sentry/core` 的跨端小程序 Sentry SDK，覆盖微信、支付宝、字节跳动、钉钉、QQ、百度、快手，并兼容 Taro / uni-app 等跨端框架。所有功能改动都要优先保护跨端兼容性、降级路径和现有 SDK 使用方式。

本文件是 [agents.md](https://agents.md) 开放标准约定的多 agent 入场清单，跨 Claude Code / Codex / Cursor / Aider / Gemini CLI 等工具通用。Claude Code 用户：本仓库的 `CLAUDE.md` 通过 `@AGENTS.md` import 同一份内容，无需重复维护。

## 开工先做

- 涉及 commit、PR、分支或发版时，先看 `CONTRIBUTING.md`。
- 功能改造前确认对所有已支持平台的影响；如果使用某个平台特有 API，必须提供条件判断或回退机制。
- 交付前默认跑 `yarn run lint` 和 `yarn run test`；涉及构建产物、集成流程或跨端行为时，再跑 `yarn run test:all` / `yarn run build`。
- 代码改造完成后，必须检查并更新相关文档，如 `README.md`、`README.en.md`、`docs/` 或示例工程文档。

## 硬规则

- 遵守 GitHub Flow：`master` 是唯一长期分支；feature / fix / docs / chore 从最新 `master` 切短分支，通过 PR 回 `master`。
- 不要直接在 `master` 上提交；不要引入 `develop` 或其它长期集成分支。
- commit 格式必须使用 Conventional Commits，并用中文 subject，例如 `feat: 新增网络请求体抓取功能`。推荐 scope 使用稳定模块名，如 `sdk` / `cross-platform` / `integrations` / `transports` / `docs` / `agents-md` / `release`。
- 遵循现有 ESLint 规范，优先使用 TypeScript。

## 跨端兼容性

- 改平台能力时，同时考虑微信、支付宝、字节跳动、钉钉、QQ、百度、快手。
- 新增平台特有 API 前，先查现有 `src/crossPlatform.ts`、`src/types.ts` 和相关 integration / transport 的抽象方式。
- 没有同等能力的平台要有明确回退：跳过、降级、特性检测或保守默认值，避免运行期直接报错。
- 小游戏（微信 / 抖音小游戏）没有 `App()`/`Page()`/路由，但有平台 `wx.*` API；用 `crossPlatform.isMinigame()` 区分，依赖 App/Page 的能力须守卫 no-op，小游戏专属能力（冷启动、帧率）走 `MinigameIntegration` / `FrameRateIntegration`，默认仅在小游戏环境启用。
- 测试应覆盖平台差异入口；窄改动至少补对应单测，影响 SDK 初始化、transport、集成插件或事件构建时扩大验证范围。

## sentry-miniapp 自带 skill 安装（跨 agent）

仓库根 `.claude/skills/sentry-miniapp-sdk/` 是 sentry-miniapp 智能代理 skill 的**单一来源**。Claude Code 用户 clone 仓库即可自动加载，无需额外操作。其它 agent 用户按下面拷贝到工具约定的 skill 目录：

```bash
# Codex
cp -r .claude/skills/sentry-miniapp-sdk ~/.codex/agents/skills/sentry-miniapp-sdk

# Cursor / Aider / Gemini CLI 等
# 按各工具文档，把 .claude/skills/sentry-miniapp-sdk 放到对应 skill 目录即可
```

`.agents/` 和 `.codex/` 是本地 agent hook / config / skill 安装副本，不进仓库；不要把 `.claude/skills/sentry-miniapp-sdk/` 的复制品提交为第二份来源。

## 常用命令

> 环境要求：Node ≥ 20、Yarn 4（由 `package.json` 的 `packageManager` 固定）。首次先跑 `corepack enable`，让仓库内的 `yarn` 自动对齐到固定版本。

- `yarn install` - 安装依赖
- `yarn run lint` - 代码检查
- `yarn run test` - 运行单元测试
- `yarn run test:all` - 运行全部测试（单元 + 集成）
- `yarn run build` - 构建项目

## 参考

- 用户文档：`README.md` / `README.en.md`
- 设计与使用文档：`docs/`
- 示例工程：`examples/wxapp/`
- sentry-miniapp skill 入场：`.claude/skills/sentry-miniapp-sdk/SKILL.md`（单一来源，见上节）
- 分支 / 贡献细节：`CONTRIBUTING.md`
