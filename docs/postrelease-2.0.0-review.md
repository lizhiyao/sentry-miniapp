# 2.0.0 发布后整体审查

审查日期：2026-10-12。源码基线为 `f2c7cfb`，Core 固定为 `11.4.0`；另外从 npm 官方 registry 下载 `sentry-miniapp@2.0.0`，按 registry 提供的 SHA-512 integrity 校验实际 tarball。本文是该阶段的维护记录，当前行为见 [ARCHITECTURE](../ARCHITECTURE.md)，发布状态见 [Releases](https://github.com/lizhiyao/sentry-miniapp/releases)。

## 审查结论与范围

| 范围 | 本轮核对与结论 |
| --- | --- |
| 生命周期与事件归属 | 检查初始化、退休、close/dispose、共享监听、具体操作 owner 与 Session 捕获接缝；既有真实 Core 回归覆盖异步处理、重入、迟到回调和终态，没有新增可复现发现 |
| 发送、隐私与离线缓存 | 检查 consent 撤回、排队/在途请求、存储身份与 TTL、Core offline 的重放门禁；发现宿主函数调用方式不一致，修复见下文 |
| 发布包与跨端兼容 | 实际 npm tarball 通过原有 CJS、ESM、UMD、TypeScript 和七平台能力缺失消费检查；针对新增边界的独立探针仍能在该已发布包中复现调用失败。修复后的本地 tarball 再执行强化后的消费检查 |
| 维护成本与文档 | 核对 Core 扩展点、运行时补齐、构建与发布检查、README/英文入口、官网配置与迁移说明、三个示例的初始化和命令；未发现需要另建实现、扩大兼容补丁或删除有消费者的代码。修复增强现有测试和消费探针，不增加测试文件或用例数量 |

上游对照使用 [Core client](https://github.com/getsentry/sentry-javascript/blob/11.4.0/packages/core/src/client.ts)、[integration](https://github.com/getsentry/sentry-javascript/blob/11.4.0/packages/core/src/integration.ts)、[offline transport](https://github.com/getsentry/sentry-javascript/blob/11.4.0/packages/core/src/transports/offline.ts) 与 [Browser SDK 装配](https://github.com/getsentry/sentry-javascript/blob/11.4.0/packages/browser/src/sdk.ts)。保留单一 Core 遥测/重试管道，平台适配只承担宿主调用、资源归属与门禁。protected 接缝继续按架构文档登记的必要性和移除条件维护，不为达到“零覆写”复制 Core 算法。

## 复现与修复：宿主函数的扩展字段

JavaScript 函数可以有自有 `call` 字段，它不决定该函数能否被调用。部分请求、Storage、系统信息和 Performance/rAF 入口使用 `fn.call(receiver, ...)`，会读取该扩展字段；字段不是函数或 getter 抛错时，可用的宿主 API 被误判失败。共享监听和包装入口已经使用标准函数原型调用，边界之间不一致。

在真实 npm 2.0.0 CJS bundle 中，给可用 `wx.request` 添加一个抛错的自有 `call` getter，再初始化默认 transport、关闭离线缓存并捕获消息：宿主请求调用次数为 0，`flush(100)` 返回 true。该返回值仅表示排空等待已结束，不能证明后台接收。这里复现的是函数扩展字段边界，不宣称已有真实设备或框架用户反馈。

修复把上述宿主入口统一为本项目已有的 `Function.prototype.apply.call`，保留 receiver、参数、返回值和异常边界，不读取宿主函数的自有 `call`/`apply`，不增加 Reflect 或 polyfill 要求。Core 的采样、序列化、限流、offline 和 Session 算法不变。

强化现有用例覆盖请求交付、七平台系统信息、FIFO 存储和冷启动读取、支付宝/钉钉对象参数存储与 consent 重放、Observer 列表及小游戏首帧/FPS 调度和取消。先在修复前确认失败，再检查修复后行为。实际包消费探针同时覆盖请求函数有扩展属性与宿主缺少 Reflect 的既有降级；后者仍只对普通函数提供自动观测，不能要求在无法保持扩展成员时继续包装。

## 验证与交付边界

本地验证包含 lint、源码与测试 typecheck、全量测试及覆盖率、标准 npm 构建/包入口/消费检查、微信独立 bundle 与本地映射检查、官网构建和链接/锚点核对。测试保持 77 个文件、1297 个用例；数量仅记录本次快照，不作为质量目标。

Taro/uni-app 的 fresh install、实际构建与业务 JS/map 验证由该修复 PR 的 [Framework Examples workflow](../.github/workflows/framework-examples.yml) 执行；本地示例初始化回归不能替代框架构建。合并须等待这些检查通过。

本轮不重做真实设备矩阵或 Sentry 后台全套遥测验收，不能据此新增真机、冻结/恢复或后台符号化的验证结论。官网 sitemap 抓取状态和访问统计单独跟踪，不作为 SDK 运行可靠性的证据。修复合并后仍需后续 patch 发布，既有 npm 2.0.0 字节不会改变。
