# 工作原理

`sentry-miniapp` 把小程序宿主的数据接入 Sentry 的处理管道。本页说明主要设计原因，帮助判断哪些能力自动启用、哪些需要业务配置。调用方式见[常用 API](/guide/api)，参数见[配置项参考](/guide/configuration)。

<span id="为什么不能直接用-sentry-browser"></span>

## 为什么需要小程序适配

小程序使用 `wx`／`my`／`tt` 等平台 API，没有可依赖的浏览器 DOM、`fetch` 或 `XMLHttpRequest`。部分宿主提供 `window` 别名，也不代表具备浏览器能力。因此，小程序端使用 `sentry-miniapp`；H5 端使用官方 Web SDK。

SDK 复用 `@sentry/core` 的事件、scope、采样、追踪上下文和批处理，小程序层负责异常输入、请求、页面、生命周期和 Storage 适配。这样可以沿用 Sentry API 和数据格式，同时处理宿主差异。

## 整体架构

```text
业务代码 / 小程序宿主
       ↓
sentry-miniapp
  异常、请求、页面与可选性能采集
  平台信息、数据过滤、虚拟堆栈路径归一化
       ↓
@sentry/core
  事件处理、作用域、采样、span / 日志 / 指标批处理
       ↓
小程序发送通道
  隐私同意门禁、按配置启用的离线缓存、平台 request
       ↓
Sentry 后台：接收、聚合、源码还原与查询
```

## 关键机制

<span id="平台-api-抹平"></span>
<span id="全局异常捕获"></span>

### 按能力使用宿主 API

SDK 检测当前平台，统一请求与 Storage 参数、响应状态码等差异。缺少异常监听、性能 observer 或全局帧回调时，只跳过对应能力。某项观测无法安全包装宿主函数时，保留业务原函数，基础错误上报仍可继续。详见[跨平台差异与降级](/guide/platform-compatibility)。

应在入口尽早初始化，原生小程序放在 `App()` 之前；初始化前已经发生的异常和请求不能补采。Taro／uni-app 组件错误可能由框架先接住，需要接入 React 错误边界或 Vue `errorHandler`。

<span id="网络面包屑与追踪"></span>

### 网络面包屑与请求性能分开使用

默认记录请求 URL、方法、状态与耗时，作为面包屑附在下一次错误或消息事件上；面包屑不单独上报。请求／响应正文默认关闭，按需开启后先过滤再截断。

开启性能采样后，请求在活跃 span 内作为子操作，没有父级时默认作为独立操作上报。该耗时测量不依赖宿主 Performance observer。追踪头仅发往 `tracePropagationTargets` 匹配的地址，避免把链路信息传给无关服务。详见[性能与链路追踪](/guide/performance-and-tracing)。

<span id="数据处理与发送"></span>
<span id="logs-与合规门禁"></span>

### 性能、日志与指标由 Core 批量发送

性能数据使用流式 span：已结束的子操作可以在长流程结束前分批发送。默认集成中的 `SpanStreaming` 负责这条发送路径；自定义默认集合时须保留它。span 的业务维度使用 attributes，错误事件的 tags／context 不会自动复制成性能属性。

`logger.*` 生成可独立检索的业务日志；`metrics.*` 记录计数、分布和数值。错误、日志、指标与 span 分别使用自己的过滤回调，处理其中一类不会自动过滤其他类别。

<span id="多次初始化与全局-instrumentation"></span>

### 在生命周期边界尝试排空

应用退后台时，宿主可能暂停计时器或终止进程，SDK 因此在该边界尝试排出缓冲数据。同步 `App.onHide` 执行后可以自动 flush；异步回调后来产生的数据需要业务显式 flush。该过程不能保证进程冻结后仍完成网络交付。

通常在入口初始化一次。SDK 共享全局函数包装与原生监听，替换或关闭 client 时释放自身订阅；缺少退订 API 的宿主复用不持有旧 client 的空监听，避免反复初始化累积回调。具体操作的迟到结果仍归原 client，不转交新实例。关闭与切换方法见[配置参考](/guide/configuration#_2-0-的-client-关闭与切换契约)。

小程序没有通用的异步上下文隔离能力。多个任务并行跨越 `await` 时，不能保证后续请求仍关联各自原来的父 span；需要这些关系时应显式组织业务操作，见[业务 span 指南](/guide/performance-and-tracing#添加业务-span)。

<span id="弱网离线缓存"></span>

### 同意门禁与弱网缓存共用发送边界

`requireConsent` 控制 Sentry 网络发送，同意前仍按配置采集并进入有界本地缓冲。授权后尝试补发，撤回后暂停发送；在途取消取决于宿主能力。

弱网重试与同意等待复用 Core 的离线管道。缓存受目标、策略、容量、过期时间和存储能力约束，可能丢弃或丢失数据，不能保证每条记录送达。缺少 Storage 时降级为内存。详见[可靠上报与隐私同意](/guide/reliability-and-privacy)。

<span id="source-map-路径归一化"></span>

### 源码还原需要构建与后台配合

SDK 解析宿主堆栈并把虚拟路径归一为 `app:///`，兼容运行时可见的 Debug ID。业务构建负责生成并上传同版本 JS／map，Sentry 负责匹配文件、还原源码。微信再次合并或转译 JS 时，可能需要最终运行文件的映射，不能仅靠路径重写解决。详见[Source Map 上线指南](/guide/sourcemap)。

## 端到端数据流

```text
运行时错误 → 宿主异常适配 → Core 合并上下文与处理事件
       → 路径归一化、过滤与采样 → 同意 / 缓存 / 发送通道
       → Sentry 接收事件 → 匹配同版本 JS / map → 显示源码
```

事件 ID 或 `flush()` 完成只能说明客户端侧的调用结果，接入验收仍需在自己的 Sentry 项目查看新事件和源码位置。

## 下一步

- 接入与排障：[快速接入](/guide/getting-started) · [常见问题](/guide/faq)
- 查询调用与能力：[常用 API](/guide/api) · [支持范围](/guide/platforms)
- 参与 SDK 开发：[维护者架构文档](https://github.com/lizhiyao/sentry-miniapp/blob/master/ARCHITECTURE.md)
