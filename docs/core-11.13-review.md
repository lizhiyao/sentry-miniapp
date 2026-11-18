# Core 11.13 升级复核

本次处理 [#610](https://github.com/lizhiyao/sentry-miniapp/issues/610)，从 master `e2414e5` 的 Core 11.11.0 升至 11.13.0，覆盖提醒中的 11.12.0。安装环境采用 24 小时新包隔离，刚发布的 11.14.0 未通过该门槛，本轮保留隔离设置。对照的是官方 npm 发布包及其 Source Map 原始源码，而非仅比较构建器变更后的生成文本。

## 实现与兼容取舍

上游来源：[11.12.0](https://github.com/getsentry/sentry-javascript/releases/tag/11.12.0)、[11.13.0](https://github.com/getsentry/sentry-javascript/releases/tag/11.13.0)。

| 上游变化 | SDK 处理与验证 |
| --- | --- |
| FunctionToString 先检查原函数标记是否为自有属性 | 现有 Proxy 只有虚拟读取，八个平台的函数源码展示契约因此失败。补充可配置、不可枚举的虚拟描述符，保留原 ownKeys 和扩展属性动态透传，不写入宿主函数或新增全局补丁。不可扩展且缺少自有标记时跳过观测；安装后冻结也不伪造非法描述符 |
| 日志／指标首次采集才装配批处理 | 强化现有用例，检查空 flush、首次 5 秒自动排空、下一批显式 flush、无重复 timer 和 dispose。序列化中关闭及隐私门禁继续由现有真实 Core 回归保护 |
| 发送缓冲子 span 时采用根 segment 的最终名称 | 子 span 先结束、根随后改名的现有用例在 11.11 下确实失败；候选检查最终 `sentry.segment.name`、内部字段不进入 envelope 及批次不重复 |
| HTTP 属性规范化 | 请求 span 的 `url.scheme` 改为无冒号字符串，`url.port` 改为数字；SDK 继续消费 Core helper，更新对应契约断言，不增加旧字段转换层 |
| normalize、非字符串 Error.message 与循环 Proxy 防护 | 复用 Core 的异常降级和字符串化；没有复制归一化算法 |
| logger／metrics 导出对象与 Rolldown 发布构建调整 | 通过公开入口、实际 tarball 与七个平台消费验证；不以生成文件的大量文本差异推断所有业务算法变化 |

逐段核对确认两处 protected Client 适配、事件处理顺序、scope／Session、carrier、默认异步上下文、offline／base transport、编码与隐私过滤接缝保持原契约。conventions 实际锁定为 0.33.0；没有新增运行时 polyfill、依赖补丁或遥测协议模式。

低层 `client.on('afterCaptureLog'/'afterCaptureMetric')` 观察者仍须自行保证不抛错：首次采集时抛错会中断其后 Core idle-flush 监听器，已入 buffer 的数据可经显式 flush 排出。该顺序差异已用真实 11.11／11.13 对照复现；常规采集和 Core safeCallback 保护的 `beforeSendLog`／`beforeSendMetric` 不受此条件影响。本次不改变 Core 监听器的异常传播，不预热伪日志或复制私有批处理。

## 体积

同一工具链构建 Core 11.11 基线和最终候选。gzip 使用 Node 的 `gzipSync` 默认配置，保留完整许可证。

| 入口 | 11.11 原始 JS | 最终候选原始 JS | 原始增量 | gzip 增量 |
| --- | ---: | ---: | ---: | ---: |
| ESM | 268247 B | 268904 B | +657 B | +111 B |
| CJS | 264506 B | 265227 B | +721 B | +109 B |
| UMD | 264299 B | 265020 B | +721 B | +111 B |
| Replay ESM | 27002 B | 27002 B | 0 B | 0 B |
| Replay CJS | 27104 B | 27104 B | 0 B | 0 B |

增量约 0.25%–0.27%，包含 Core 修复和代理标记适配。主入口预算各增加 1 KiB：ESM 263 KiB，CJS／UMD／微信独立 bundle 259.5 KiB；Replay 与消费端按需构建预算不变。没有删除能力或放宽语法兼容检查。

## 验证范围

本地 lint、严格类型、完整单测及覆盖率、标准构建和实际 tarball 消费已通过。现有用例总数保持 1543，修改保护实际接缝，不另增一套版本特例。微信独立 bundle、文档构建，以及精确 PR 提交上的 Node 20／22／24、Taro／uni-app 和 CodeQL 由同次交付检查核对。

本次是源码依赖升级，不触发 npm 发布。安装版本仍以 npm 和 GitHub Release 为准；构建与本地宿主检查不代表新增了真机或 Sentry 后台验收。
