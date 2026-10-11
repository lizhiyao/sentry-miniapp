# 文档索引

接入和日常使用以[文档站](https://sentry-miniapp.pages.dev/)为主；仓库文档补充开发、设计取舍和审查记录。当前用户指南面向 2.x 正式版，1.x 入口见[版本选择](https://sentry-miniapp.pages.dev/guide/migration-2.0#version-choice)。

## 按任务阅读

| 任务 | 入口 |
| --- | --- |
| 了解能力、安装并发出第一个事件 | [中文 README](../README.md) / [English README](README.en.md) |
| 接入原生小程序、Taro、uni-app 或小游戏 | [快速接入](https://sentry-miniapp.pages.dev/guide/getting-started)、[框架与示例](https://sentry-miniapp.pages.dev/guide/examples) |
| 配置 Source Map、隐私同意、性能或排查没有数据 | [用户文档站](https://sentry-miniapp.pages.dev/) |
| 理解模块职责、生命周期、Core 接缝与设计原因 | [架构文档](../ARCHITECTURE.md) |
| 构建、调试、验证或发布 SDK | [开发指南](../DEVELOPMENT.md)、[贡献指南](../CONTRIBUTING.md) |
| 为智能代理配置项目规则和接入能力 | [AGENTS.md](../AGENTS.md)、[SDK skill](../.agents/skills/sentry-miniapp-sdk/SKILL.md) |
| 查阅对外文章和配图 | [文章存档](articles/README.md) |

## 当前设计的补充说明

以下文档解释仍在使用的实现及其取舍，与架构文档一起维护：

- [官方 SDK 实践对照](sdk-official-practices.md)：哪些能力复用 Core，哪些边界需要小程序适配。
- [查询参数运行时取舍](query-runtime-decision.md)：兼容层的选择、补丁范围和移除条件。

## 按版本保留的审查记录

以下内容是特定提交和版本的复现、验证与交付记录。记录中的“当前”“尚未发布”、测试数量和依赖审计结果均指对应阶段；它们不代表最新版本状态。查当前行为请回到架构或用户指南，查已发布版本请看 [GitHub Releases](https://github.com/lizhiyao/sentry-miniapp/releases)。

| 记录 | 范围 |
| --- | --- |
| [Core v11 收尾审查](core-v11-review.md) | 初次升级的职责、跨端降级、缓存、关闭和文档复核 |
| [发布后的专项复核](core-v11-postrelease-review.md) | 后续 beta 阶段的发现、修复与验证证据 |
| [SDK 深度审查](sdk-deep-review.md) | beta.6 后的架构、运行时和实际包检查 |
| [#471 发现处理](core-v11-issue-471-review.md) | issue 中各项发现的核实与组合复核 |
| [v1 → v2 迁移成本](core-v11-migration-cost-review.md) | 旧配置、公开 API 与迁移取舍 |
| [示例依赖审查](example-dependency-security.md) | 示例工具链的修补与当时的审计快照 |

目标设备上的前后台恢复、弱网、存储与隐私撤回问题请[提交缺陷反馈](https://github.com/lizhiyao/sentry-miniapp/issues/new/choose)，附实际 SDK／平台版本、复现步骤与证据。集中验收的历史记录保留在 [#457（已关闭）](https://github.com/lizhiyao/sentry-miniapp/issues/457)。

## 维护约定

- README 提供项目概览和最短接入；完整参数与操作步骤只在官网维护。
- 架构文档写当前职责和设计原因；版本修复经过与验证数字留在审查记录。
- 破坏性变化、旧配置改法和历史行为放在迁移页，不散落在所有能力页中。
- 示例 README 说明真实入口、构建命令、DSN 和产物路径；不要复制另一份配置参考。
- 修改标题时保留已使用的锚点；修改示例、参数或命令时对照源码与实际脚本。
- 已发布文章与审查记录保留原阶段信息，重新发布文章前再核对当前能力。
