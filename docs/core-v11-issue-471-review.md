# #471 发现处理记录（2026-10-10）

审查基线为 `master dfa0dcf14cc834955535ffa5b31146e285dcbe60`，SDK `2.0.0-beta.6`，实际安装的 Core 为精确固定的 `11.4.0`。本轮逐项验证 [#471](https://github.com/lizhiyao/sentry-miniapp/issues/471) 的发现，并独立复核修复后的行为；不把 issue 中的推断直接当成结论。

该独立审查阶段从上述 master 修复，不包含 [#472](https://github.com/lizhiyao/sentry-miniapp/pull/472) 的传播头与 IP 推断改动，已由 [#473](https://github.com/lizhiyao/sentry-miniapp/pull/473) 合入 `master 86c476a`。下文 1325 用例／18 个包场景是该阶段证据；与 #472 整合后的 1335 用例／20 场景及测试精简见[组合复核](sdk-official-practices.md#与-473-整合后的复核)。

## 逐项结论

| #471 项 | 核实结果与处理 | 主要观察点 |
| --- | --- | --- |
| 1. async 裸栈帧 | 已确认并修复。仅剥离 V8 裸 filename 的前导 `async`，保留有括号的函数名及其余解析路径 | 最终 event 的 `app:///pages/index/index.js`、行列、同生成 JS 的 Debug ID；已发布 beta.6 的 CJS／ESM 均复现失败 |
| 2. consent outcome | 行为成立，保留 Core 语义并在架构文档登记；不增加 outcome 拦截层 | 撤回取消在途／拒绝排队后，两事件重新授权各重放一次；最终 report 仍为 `network_error/error/quantity: 2`，缓存中不再有两事件。失败尝试数不等于永久丢失数 |
| 3. FPS 配置 | 已修复。FPS、单帧毫秒阈值、窗口使用有限正数，非法值回落默认；合法小数保留 | 最终 breadcrumb、窗口 context 和 summary span 属性；0 breadcrumb 配额仍只关闭 breadcrumb，保留统计；jankLevels 的部分档和递增规则不变 |
| 4. late-init | 没有确认正常平台故障；保留现有初始化路径，将特殊宿主状态登记为 #457 反馈检查点 | 正常 late getApp 返回实例和 early getApp 抛错均有正确 Session；只有人为让“已注册 App”的 getApp 抛错或空返回才漏监听。不能把所有失败都当 late-init，否则破坏初始化早于 App 的业务处理次序 |
| 5. console undefined | 已确认并修复。JSON.stringify 返回 undefined 时使用 String 回退 | 最终事件保留 `undefined` 文字；原 console 的 receiver、参数、返回值、异常身份与调用次数不变；观测 hook／格式化 getter 失败仍透传原宿主调用 |
| 6. URLSearchParams stub | 删除内部 SDK 接口字段、无平台 fallback stub 及旧 optional-call 断言 | 没有生产消费者；实际全局 URLSearchParams polyfill 与启动安装路径保留，包消费仍覆盖缺失构造器的宿主 |
| 7. SDK 断言 | 原断言过弱，但不是逻辑上恒真；已改为具体行为 | 实际捕获 ID 与最终事件一致；无 client 的 flush 返回 false；公开 API 委托原 timeout 和结果；wrap 捕获 mechanism 并重抛同一异常 |
| 8. protected 测试入口 | `client.test.ts` 的环境／Debug ID 用例改走公开 captureEvent + flush，移除私有 spy；后续复审进一步把 `client-state.realcore.test.ts` 的 `_prepareEvent` 测试子类改走公开 captureEvent 与最终 envelope，测试侧不再持有 protected 入口 | 最终事件、显式 context／scope 优先级、Debug ID 与 processor 拒收。注意默认 stack strategy 下两参 `withIsolationScope` 不安装给定 scope（Core 的 `withSetIsolationScope` 忽略参数），涉及 isolation 贡献的断言须用真实 isolation scope 或捕获 scope |
| 9. 旧 coverage 目录 | 本轮读取时已无旧 system/router 页面；完整覆盖率检查再次生成当前报告 | lifecycle、owner、sessionCapture 等当前模块包含在报告中；coverage 是忽略的生成目录，不提交产物 |
| 10. 覆盖率／PR 包门禁 | 分支门槛 93.4 → 95.5，保持其它门槛与源码测量范围；“PR CI 不检查安装包”不成立 | CI 的 Quality、Node 20／22 jobs 已通过 yarn build 执行隔离 tarball 消费。该独立修复新增 async-stacktrace 后要求 CJS／ESM 各 18 场景，不再追加一套 CI |
| 11. 场景数文档 | 移除文档中的 16／17 固定计数，以可执行清单为准；#472 也有相同的文档收尾 | 该独立修复阶段硬断言 18 场景；与 #472 整合后为 20，PR 和发布消费继续使用同一门禁 |
| 12. Node engines | SDK manifest 精确对齐 Core；开发文档另外说明工具共同范围 | Core/SDK：`>=20.19.0 <22.0.0 || >=22.12.0 <23.0.0 || >=23.2.0`。本仓库开发：20.x ≥20.19、22.x ≥22.13 或 ≥24，不混淆两种范围 |
| 13. 网络 breadcrumb FAQ | 文档区分传输失败与 HTTP 状态 | 宿主 fail 为 error；success 中 HTTP 4xx／5xx 为 warning；慢请求 >3s 为 warning。SDK 行为未改 |
| 14. skill rubric | 修正为 2.0 stream 语义 | 通过请求 span/segment 与后端 span 的 trace_id 验证关联，不要求 transaction envelope；未扩大公共 API |

## 修复与反例证据

异步栈帧使用同步构建时注入的 Debug ID carrier，模拟同一 bundle 的异步错误。真实 Core 的有／无 Error header 两种事件都验证最终路径和 `debug_meta`。后续测试有效性复核删除了手写 v3 map 的固定坐标查找：在 frame 已被精确断言后，该片段只验证 fixture，不能额外检出 SDK 回归。实际 JS/map 的本地映射仍由 `check-miniapp-bundle.mjs` 和框架产物检查承担；这些证据也不表示已完成 Sentry 后台处理。

新 `async-stacktrace` 包场景仅从安装包公共入口调用 captureException 与 flush；已发布 beta.6 的 CJS／ESM 都输出错误的 `app:///async pages/index/index.js` 并失败。修复后的真实 tarball 两种入口通过，保留另外 17 个场景。未复制 parser 或导入 Core 私有模块来制造绿色结果。

FPS／console 的真实 Core 控制组在修复前共有 12 项失败、8 项通过（其中 reportInterval 参数化仅 `0` 在旧代码上失败，`-1`／`NaN`／`Infinity` 在旧的非负整数回落下本就是通过的行为锁定；失败主要集中在 fpsWarningThreshold／longFrameThresholdMs 两组与 console 文本）；修复后全部通过。全量测试揭示两项 Session 用例仍用旧 `reportInterval: 0` 触发窗口。两项改为合法 40ms 并完整执行两帧，增加未到窗口不报告的控制，保留 A 终态／B 引用、错误计数及最终 envelope 的全部断言，没有用关闭 FPS 消除失败。

两路独立复核又找到正向“系统信息为空”用例未保证事件存在，以及开发 Node 范围误等同 Core 范围。前者补最终消息身份，并清除空对象循环的无效检查；Debug ID getter 故障也验证独立事件仍可发送。后者按实际 Core、Vite、Vitest、ESLint 的共同范围更新四处开发说明。这些问题在交付前修正。

实际 Core 版本通过其公开 package.json 与 SDK 精确依赖作校验；版本不一致会令测试失败。它也检查 SDK/Core 的 engine 声明一致，不声称已执行每个 Node 边界版本。

## 验证与范围

- lint、严格源码／测试 typecheck 通过。
- 完整覆盖率和随机顺序测试：78 文件、1325 用例通过。覆盖率 statements 98.72%、branches 95.50%、functions 99.23%、lines 99.43%；提高后的门槛通过，没有排除代码或放宽其它门槛。
- 标准构建、publint、隔离 tarball 消费：68 个导出、七平台 × 两种 URL 能力模式、UMD 和 TypeScript，以及 CJS／ESM 各 18 个公开行为场景通过。
- 微信示例独立 bundle 的加载与本地符号化检查、官网构建通过。

中文／英文 README 的公开 API、Source Map 入口和 beta 提示已核对，仍与这些修复一致；用户配置与 FAQ 更新放在官网，执行细节只放维护者文档。本轮没有新增 npm 发布，也没有再次进行手机或目标 Sentry 后台验收。真实前后台冻结、存储和特殊宿主初始化状态继续由 [#457](https://github.com/lizhiyao/sentry-miniapp/issues/457) 收集证据。

Core 公共导出保持收敛，不因参考 API 名单自动扩张；Debug ID 缓存按 key 数量失效的上游实现继续列为升级复核事项，当前只增不改的合并路径未构成新缺陷。架构取舍和接缝清单仍以 [ARCHITECTURE.md](../ARCHITECTURE.md) 为准。
