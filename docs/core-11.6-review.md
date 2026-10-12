# Core 11.6 升级复核

本文记录 2026-10-12 对 [#520](https://github.com/lizhiyao/sentry-miniapp/issues/520) 的复核。基线是已发布的 sentry-miniapp 2.0.1／Core 11.4.0；升级精确锁定 Core 11.6.0，保持单一 SDK 入口。

## 上游差异与接缝

对照官方 [11.4.0…11.6.0](https://github.com/getsentry/sentry-javascript/compare/11.4.0...11.6.0) 和实际 npm tarball，校验后者的 registry SHA-512 integrity。11.6.0 tag 指向 `3c0c830577da2ae78661cbc5a0c4183bd2035c9c`；完整变更范围包含 11.5.0，不能只读最后一版说明。

| 改动 | 本项目的处理 |
| --- | --- |
| [重复初始化警告与顶层 close 解除绑定](https://github.com/getsentry/sentry-javascript/pull/24962) | 退休旧 MiniappClient 后，以公开 Scope API 解除仍指向它的绑定，再调用 Core initAndBind；旧实例通过自身 scope 排空。不写 Core 私有关闭 Symbol。构造中临时 scope 的拒绝诊断仍归属原 owner |
| [睡眠后时间漂移修正](https://github.com/getsentry/sentry-javascript/pull/23054)与[单调时钟耗时](https://github.com/getsentry/sentry-javascript/pull/24903) | Core 管理隐式遥测时间和隐式 span 耗时。SDK 的宿主 Performance entries、小游戏汇总与请求计时使用显式时间，不改用浏览器时钟原点；宿主 getPerformance() 与全局 performance 不能假定为同一时钟 |
| [内部异常不附带附件](https://github.com/getsentry/sentry-javascript/pull/25160) | 复用 Core 发送路径；业务事件的附件路径保留，不增加 SDK 副本 |
| 属性常量转入 conventions、移除 beforeSendSpan 的 null 告警 | 线上字段未更名；返回 null 仍不能丢弃 span，过滤继续用 ignoreSpans；锁文件仅 Core 与其 conventions 依赖更新 |

逐一核对架构登记的 protected 方法、未处理会话状态、内部过滤入口和公开协议假设：Session 更新与 processing poll 实现／签名未改；scope metadata 合并、默认 scope 身份、offline transport、Debug ID 和 encodePolyfill 接缝未改。Node engines 与 11.4.0 一致，span/v2 协议及现有服务端要求未变。本 SDK 未装配的服务端、MCP、Supabase 等改动不移入小程序集成。

直接升级时，真实 Core 回归出现 10 个失败：新增告警触发不可用的 console.warn，阻断原本可工作的重新初始化。修复上述公开绑定顺序后原有用例恢复；强化现有重新初始化用例，不增加重复单测。顶层 Sentry.close() 完成后解除其捕获的当前绑定，但不会删除等待期间替换的新 client；实例 close()/dispose() 保留其独立资源语义。用户说明见[配置指南](https://sentry-miniapp.pages.dev/guide/configuration#_2-0-的-client-关闭与切换契约)。

## 验证与体积

- lint、严格源码／测试类型、1297 个单测、随机顺序和 coverage 通过；覆盖率仍满足既有门槛。
- build 的实际安装包验证通过：CJS、ESM 七个平台 × 十五种宿主能力组合、UMD 和 TypeScript 公共入口。新增一个 CJS／ESM 消费场景，检查睡眠后最终 event 时间、跨睡眠 span 的单调耗时、显式时间，以及旧 close 与重新初始化并发时的绑定。
- build:miniapp 与 docs:build 通过；兼容层与体积预算保持不变，消费端裁剪检查仍通过。

同一工具链比较已发布 2.0.1 包与本次实际构建的运行时原始字节，map 和声明不计入：

| 入口 | 2.0.1 | 本次 | 差值 |
| --- | ---: | ---: | ---: |
| CJS | 258,501 | 259,571 | +1,070（0.41%） |
| ESM | 262,208 | 263,294 | +1,086（0.41%） |
| UMD | 258,330 | 259,400 | +1,070（0.41%） |

这些检查是模拟宿主与实际包消费证据；没有新增真实设备或 Sentry 后台 ingest 验收，也不代表全平台设备矩阵通过。本次只处理依赖升级，不发布新的 SDK 版本。
