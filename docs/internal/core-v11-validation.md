# core v11 关键路径验证

关联 [#428](https://github.com/lizhiyao/sentry-miniapp/issues/428)。实现基线为 master `b462a6c5f7c48e1f049eb6bce122c0504e0ddfb8`，精确依赖 `@sentry/core 11.0.0`。

## 范围与执行

这是一轮可执行验证，不是 #428 七个实施 PR 的替代。两个 `src/internal` 原型模块不从 SDK 入口导出，也未接入默认 init/transport；测试调用真实 MiniappClient 与真实 core 管道。现有公开行为仍由旧实现提供。

```sh
yarn run lint
yarn run typecheck
yarn run test --maxWorkers=2
yarn run test:coverage --maxWorkers=2
yarn run build
yarn run docs:build
yarn run build:miniapp
```

验证分为两组：

- 原型普通测试：公开 spanStart/preprocessSpan 快照、同步 owner scope、共享 close Promise/总预算/最终同步采集、业务 log/metric hook 的重入关闭、disabled flush 清空 buffer、typed codec 和 core serializer 字节等价。
- 基线 `it.fails`：新 client 改写旧 client consent、撤回后宿主 slot 队列继续启动 request、dispose 后仍发送、离线 JSON 存储破坏 Uint8Array。绿色仅说明四个预期失败仍被复现，不能当作修复验收。修复相应默认路径时必须改为普通 `it`。

## 已实现的验证原型

`CoreV11Runtime` 在调用 finalizer 前建立共享 Promise，finalizer 同步运行于捕获的 owner scope。对外 run 在 closing 后拒收；预算到期先关闭、禁用 client，再通过公开 flush/close hooks 清空 buffers、调用 SDK dispose 和自有 cleanup。beforeSendLog/Metric 在业务 callback 前后检查状态，防止 callback 中重入 dispose 后再次写入 core buffer。回调返回 Promise 时 run 不把它交给 withScope，因此在返回的同一同步栈恢复调用方 scope；不保证跨 await 的隔离。

`registerSpanStartSnapshots` 最多保存 256 个 recording span 快照，不提前写 span attributes；preprocess 只补缺失字段。未采样不保存，结束消费，超限淘汰最旧，unsubscribe 清空；scope RawAttribute 的单位和业务显式属性由 core 保留。此处尚未实现自动 operation 创建前的 RawAttribute 转换、sampler/ignoreSpans 输入或全量 EnvironmentState。

`envelopeCodec` 用版本化 json/text/bytes payload 包装，bytes 使用规范 base64；保留 headers、空 bytes、非零 byteOffset 子视图。往返比较使用 core serializeEnvelope，未混入 replay 的 sent_at 更新。ArrayBuffer 转换只复制视图自身 bytes。这里不是完整持久化 record：targetId、recordId、createdAt、TTL、实际 UTF-8 字节上限、消费 lease、迁移和故障降级仍由后续 store 重构实现。

## 尚未被本轮证明的验收

- prototype close 尚未接入 MiniappClient，也未接入实际 host request dequeue gate/abort、store replay lease。canStartRequest 是可接入的状态查询；本轮不声称旧队列已停止或线上数据已送达。
- 尚未实现 per-client consent controller、撤回 generation、分区存储和对 host 不支持 binary 的诊断。
- 尚未补缺 TextEncoder 的 core 公开 encoder 注册。codec 自身不依赖 Node Buffer/DOM，但 core serializer 的 binary 用例运行于有 TextEncoder 的 Node。
- 尚未证明任意抛错的用户 flush hook 都不会阻止该次 emit 的后续 core listener；prototype 仅保证失败步骤之后仍执行 SDK cleanup。
- 尚未改造 App/Page/HTTP 的全部 owner 回调、session 归属、默认环境处理器或删除 legacy API。
- 尚未执行微信/抖音小游戏真机冻结、后台 span/log/metric 展示和多宿主 ArrayBuffer 请求验收。Node CI 不能代替这些验收。

CI 结果与链接将在运行完成后回填。只有普通测试已覆盖的原型契约可以标记为运行验证；#428 的实施复选框保持未完成。
