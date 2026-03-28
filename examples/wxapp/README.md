# 微信小程序示例

这是一个使用 `sentry-miniapp` SDK 的微信小程序示例项目，覆盖了从应用启动、首页访问、网络请求、性能采集，到测试页手动异常/消息/反馈上报的一整套能力演示。

## 能力概览

- ✅ 应用启动链路监控
- ✅ 页面生命周期 Breadcrumb
- ✅ 首页请求 Span 与失败告警
- ✅ 自动异常捕获与 Promise 异常捕获
- ✅ 手动消息、异常、用户反馈上报
- ✅ 用户身份、标签、上下文管理
- ✅ 页面加载性能测量

## 这个示例重点演示什么

### 1. 应用启动阶段

`app.js` 在 `App()` 之前初始化 SDK，并演示了这些能力：

- 初始化 `dsn`、`sampleRate`、`tracesSampleRate`
- 启用系统信息、用户交互、控制台、导航等能力
- 使用 `beforeSend` 控制事件大小，避免超大事件被服务端拒绝
- 在启动时生成唯一 `launchId`
- 通过 `setTag`、`setContext`、`addBreadcrumb` 记录启动参数与显示状态
- 通过 `startInactiveSpan` 覆盖启动到首屏、首页加载等跨生命周期性能区间

### 2. 首页访问阶段

`pages/index/index.js` 现在不只是展示信息，还会主动演示首页监控实践：

- 为每次页面访问生成唯一 `pageVisitId`
- 在 `onLoad`、`onReady`、`onShow`、`onUnload` 中记录生命周期 Breadcrumb
- 通过 `setContext` 记录首页运行时上下文
- 对 npm / GitHub / registry 请求统一加上自定义 Span
- 请求成功时写入 Breadcrumb，请求失败时上报一条 warning 级别消息
- 把 `pageVisitId` 展示在页面状态卡片中，方便和 Sentry 后台联动排查

### 3. 测试页能力演示

测试页主要用于手动验证事件上报：

- 同步异常上报
- 异步异常上报
- 自定义消息上报
- Promise 未处理异常
- 用户反馈上报
- 用户身份设置与清理
- 自定义网络/性能测试

为了方便观察 Issue 聚合行为，测试页的手动上报已经补充了唯一 `triggerId`、tag 和 fingerprint，连续点击时更容易在后台看到独立事件。

## 推荐体验路径

1. 在微信开发者工具中打开此项目
2. 启动小程序，先观察首页的 SDK 状态、访问标识和统计数据
3. 在 Sentry 后台查看启动链路、首页网络请求和性能数据
4. 切换到测试页，逐个点击测试按钮
5. 通过 `demo.launch_id`、`demo.page_visit_id`、`demo_trigger_id` 等字段过滤事件

## 在 Sentry 后台看什么

如果你在开发者工具里看到很多请求，但后台感觉“只有少量数据”，通常需要区分以下几类：

- **Issues**：主要看错误和消息的聚合结果
- **Events**：看原始事件明细
- **Performance / Transactions**：看页面和请求性能数据
- **Breadcrumbs / Context / Tags**：看每次访问和请求附带的上下文信息

首页里的 npm、GitHub、registry 请求本身不是“异常”，但它们会产生 Breadcrumb 和性能数据；失败时才会补充 warning 消息事件。

## 运行方式

### 1. 构建 SDK

在项目根目录运行：

```bash
npm run build
```

该命令会构建产物，并自动同步到 `examples/wxapp/lib/`。

如果你在开发 SDK，本地持续构建可以运行：

```bash
npm run dev
```

### 2. 在微信开发者工具中运行

1. 使用微信开发者工具打开 `examples/wxapp`
2. 导入项目并设置 AppID（可使用测试号）
3. 点击编译运行
4. 进入首页和测试页观察效果

### 3. 调试建议

- 修改 SDK 源码后，重新运行 `npm run build`
- 修改 `examples/wxapp` 示例代码后，在开发者工具中重新编译
- 需要观察原始上报时，优先看 Sentry 的事件明细而不是只看 Issues 列表

## 配置说明

项目已经预配置 Sentry SDK，你可以在 `app.js` 中调整这些配置：

- `dsn`
- `environment`
- `sampleRate`
- `tracesSampleRate`
- `beforeSend`
- `integrations`

如果你需要接入自己的项目，建议把示例中的：

- 启动链路上下文
- 页面访问标识
- 请求封装埋点
- 用户身份与业务标签

作为接入模板进行裁剪。

## 注意事项

### 开发者工具与真机差异

- 某些异常在开发者工具里不会完整触发底层全局错误监听
- 真机预览通常更接近真实上报结果
- 如果要验证自动异常捕获，建议同时在真机上测试

### 生产使用建议

1. 替换成你自己的真实 DSN
2. 根据业务调整采样率与性能采样率
3. 给关键页面和关键链路加上业务 tag / context
4. 配置 release 并上传 sourcemap
5. 避免把敏感信息直接写入 event、breadcrumb 或 extra

## 文件结构

```text
wxapp/
├── app.js                  # 应用入口与 SDK 初始化
├── app.json                # 应用配置
├── app.wxss                # 全局样式
├── sitemap.json            # 站点地图配置
├── project.config.json     # 微信开发者工具配置
├── lib/
│   ├── sentry-miniapp.js
│   └── sentry-miniapp.js.map
└── pages/
    ├── index/
    │   ├── index.js        # 首页监控与请求演示
    │   ├── index.wxml
    │   └── index.wxss
    └── test/
        ├── test.js         # 异常、消息、反馈、性能测试
        ├── test.wxml
        └── test.wxss
```
