# Core 11.8 升级复核

本记录对应 2026-10-19 的 [#559](https://github.com/lizhiyao/sentry-miniapp/pull/559)，对照精确的 Core 11.6.0／11.8.0 官方 npm 包及其 Source Map 中的源码。它描述源码升级候选，已发布 2.2.0 继续使用 Core 11.6.0。

## 上游行为与接缝

范围覆盖 [11.7.0](https://github.com/getsentry/sentry-javascript/releases/tag/11.7.0) 和 [11.8.0](https://github.com/getsentry/sentry-javascript/releases/tag/11.8.0)。两个包的 engines 和 MIT 许可证一致；conventions 从 ^0.26.0 更新到 ^0.27.0。

| 上游改动 | 小程序处理与验证 |
| --- | --- |
| transport 按 envelope 的 item_count 记录丢弃数量 | 继续使用 Core createTransport。强化现有限流用例，在同一真实 transport 中发送普通错误和三条日志的批次，核对分别记录 1／3，且限流后的发送不再调用宿主请求 |
| beforeSend 返回无效值、processor／transaction 丢弃计数修正 | 事件准备、用户过滤、Session 更新和发送仍由 Core 管理；原生拒绝、异步过滤、采样、report flush、关闭与离线存储的真实 Core 用例继续保护 SDK 接缝 |
| stream span 删除内部自定义名称属性，未采样根／子 span 的 outcome 计数修正 | 保持 span streaming 单一管道，不加入 static transaction 兼容层；已有真实 Core tracing 和包消费场景复核事件归属与序列化 |
| LinkedErrors 支持 error／suppressed 两个错误分支 | 保留默认链式错误集成，复用上游有界递归。实现通过属性检测识别，不要求宿主提供 SuppressedError 构造器 |
| Node 请求 Session、MCP／服务端扩展 | 未装配到小程序运行路径；实际主包 Source Map 中没有 mcp-server 来源。没有引入 bundler plugins 或 CLI，现有许可证声明保持有效 |

公开 Client hook 的新增重载不改变本项目的生产者生命周期；Session、scope metadata、关闭、Debug ID 与 offline 接缝继续通过原有回归。协议仍为 Core v11 的 span streaming，维持已有服务端基线。

## 体积与取舍

直接升级时，CJS／UMD 超过原 255 KiB 预算；原 CJS 距上限仅余 20 B。相同工具链下，主运行入口净增 578 B，来自上游事件／丢弃计数处理及链式错误支持的组合变化。保留上游修复与默认能力，避免为这点增量移植或改写 Core 算法。

| 入口 | Core 11.6 | Core 11.8 | 原始 JS 增量 | gzip 增量 |
| --- | ---: | ---: | ---: | ---: |
| ESM | 264841 B | 265419 B | +578 B | +203 B |
| CJS | 261100 B | 261678 B | +578 B（0.22%） | +191 B |
| UMD | 260893 B | 261471 B | +578 B | +188 B |

CJS／UMD／微信独立入口统一限制在 256 KiB，仅增加 1 KiB 预算；ESM 保持 260 KiB，Replay 保持 26.5 KiB，消费端裁剪预算不变。微信独立入口实测 261674 B；Replay CJS 仍为 27104 B。没有加入新的 polyfill、依赖补丁、小游戏专属能力或页面回放代码。

## 验证边界

原有 1405 个单测在直接升级后通过，测试数量不增加；强化现有批次限流用例。完整源码／测试类型检查、标准构建、publint、七平台 × 15 宿主模式的真实安装包消费、CJS／ESM／UMD 与类型入口，以及微信独立 bundle 加载和符号化分别验证。修改后的候选以对应 PR 的最终 CI 结果为准。

本轮不新增真机或 Sentry 后台验收，也不自动发布 SDK；正式版本继续以 npm 和 GitHub Release 为准。
