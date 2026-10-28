# Core 11.9 升级复核

本记录对应 2026-10-28 的 [#576](https://github.com/lizhiyao/sentry-miniapp/issues/576) 与 [#575](https://github.com/lizhiyao/sentry-miniapp/pull/575)。对照官方 npm `@sentry/core@11.8.0`／`11.9.0` 的源码、类型声明和 Source Map；构建基线为同一 Vite 8.3.5 工具链下的 master `2452a89`。

## 上游变化与 SDK 接缝

依据 [11.9.0 Release](https://github.com/getsentry/sentry-javascript/releases/tag/11.9.0)，两份精确包的 Node engines、conventions 依赖范围和 MIT 许可证一致。

| 变化 | 小程序处理与验证 |
| --- | --- |
| Metrics 限流与丢弃分类改为 `trace_metric` | 继续委托 Core transport 与 Metrics 管道。强化现有限流用例，同时检查全类别／仅指标限流、普通错误与日志仍可发送，以及指标批次按真实条数计数。真实 Core 用例核对 `beforeSendMetric` 返回 null／抛错后的最终 client report，并保留正常指标的发送作为正向对照 |
| `DataCategory` 类型将 `metric` 修正为 `trace_metric` | SDK 的 recorder 沿用 Core 类型。直接调用低层 `client.recordDroppedEvent()` 的代码应使用 `trace_metric`；`metrics.count`／`distribution`／`gauge` 调用方式不变，SDK 不维护第二份类别映射 |
| 通用 `dataCollection` 增加 `mcp.inputs`／`outputs` | 保留 Core 的完整解析契约；本 SDK 没有装配 MCP 服务端采集，字段存在不代表新增此类采集能力 |
| HTTP 服务端 Session、回调保护、origin，以及 tunnel／响应流与 commit 环境变量工具调整 | 未装配进小程序运行路径；实际主包 Source Map 无对应 HTTP 服务端、MCP server、tunnel、responseStreaming 或 commitEnv 来源，不引入 Node／Web Response 运行时要求 |

逐文件比较确认 Client、Scope、默认异步上下文、prepareEvent、span streaming、offline／base transport、carrier、Debug ID 与敏感键过滤接缝的实现未变。envelope helper 的变化是类别映射，UTF-8 编码路径和 `encodePolyfill` 入口保持原状。现有真实 Core 与实际安装包回归继续覆盖 Session 归属、关闭和重新初始化、同意撤回、缓存重放、缺失编码器和最终 `debug_meta`。

11.9.0 的[迁移文档](https://github.com/getsentry/sentry-javascript/blob/11.9.0/MIGRATION.md#upgrading-from-10x-to-11x)仍采用 Core v11 的自建 Sentry 26.4.2 基线。本次不切换 span streaming 协议，也不增加另一套后台兼容模式。

## 体积与维护取舍

同一构建工具链下主入口净增 184 B（约 0.07%），来自通用采集配置与 Metrics 分类修正。两个 Replay 文件逐字节一致；没有增加 polyfill 或依赖补丁。

| 入口 | Core 11.8 原始 JS | Core 11.9 原始 JS | 原始增量 | gzip 增量 |
| --- | ---: | ---: | ---: | ---: |
| ESM | 265703 B | 265887 B | +184 B | +60 B |
| CJS | 261962 B | 262146 B | +184 B | +63 B |
| UMD | 261755 B | 261939 B | +184 B | +63 B |
| Replay ESM | 27002 B | 27002 B | 0 B | 0 B |
| Replay CJS | 27104 B | 27104 B | 0 B | 0 B |

原 CJS 预算为 256 KiB，升级后超出 2 B，导致 #575 的 SDK 与框架 CI 在构建阶段停止。本次保留上游修正和通用配置契约，将 CJS／UMD／微信独立 bundle 的共同预算调整为 256.5 KiB（增加 512 B）；ESM、Replay 和消费端按需打包预算不变。体积约束继续覆盖实际 JS、内联依赖和完整许可证，不修改 Core 算法或移除功能来通过检查。

## 验证

- 定向用例在 Core 11.8 的隔离负向对照中，检出错误的 `metric` 丢弃类别及 `trace_metric` 限流未生效；在 11.9 下通过。
- 复用现有 transport 用例增加类别参数，仅新增一个真实 Core 回调报告用例，保护限流和最终报告两个不同接缝。
- 本地 lint、严格类型、完整单测、标准构建及实际 tarball 消费、微信独立 bundle 加载与符号化、文档站构建分别验证；精确提交上的 Node 20／22／24、覆盖率、CodeQL、Taro／uni-app 构建与映射以 #575 最终检查为准。

本记录描述升级候选；不新增真机或 Sentry 后台验收，不触发 SDK 发布。已发布版本以 npm 与 GitHub Release 为准。
