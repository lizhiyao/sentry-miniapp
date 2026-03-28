# 我把 Sentry 接进了 7 端小程序：从异常捕获、Breadcrumb 到 Source Map 定位

> 微信、支付宝、字节、百度、QQ、钉钉、快手 7 端小程序，一套代码统一接入 Sentry，把异常捕获、用户路径、弱网兜底、Source Map 定位真正串成一套可落地的工程方案。

很多团队不是不想做小程序监控，而是试了一圈之后发现：

- 官方能力能解决一部分问题，但很难覆盖多端统一治理
- Web 监控 SDK 不能直接塞进小程序环境
- 错误即使上报了，没有 Source Map 和上下文也依然难排查
- 真正接入时，还会遇到域名白名单、弱网、堆栈路径不一致这些工程问题

这篇文章不讲抽象概念，直接回答一个更实际的问题：

**如果你想把小程序真正接进 Sentry，这件事应该怎么落地？**

## 一、为什么小程序线上问题比 Web 更难排查？

做过小程序开发的人，大概率都见过这些场景：

- 用户说“页面打不开了”，但你在开发者工具里怎么都复现不出来
- 某个 API 只在低版本基础库报错，测试同学根本测不到
- 某个请求偶发超时，最终在业务里表现成“按钮点了没反应”
- 某个版本上线后投诉变多，但你不知道到底是哪个页面、哪个操作、哪类设备在出问题

Web 端出了问题，大家已经习惯去看 Sentry、日志平台、APM。

但到了小程序，事情一下变复杂了：

- 不是标准浏览器环境
- 没有 DOM
- 各平台运行时不一致
- 上报链路受域名白名单和网络环境影响
- 堆栈路径不是标准 URL，Source Map 解析也更麻烦

这就导致一个很现实的问题：

**很多团队并不是没有监控意识，而是缺少一套真正适合小程序环境的工程化方案。**

## 二、只靠微信官方能力，够不够？

先说结论：

- 如果你只做微信单端项目，官方能力通常已经够用
- 如果你做的是多端小程序，或者已经在用 Sentry 监控 Web / App / Backend，那么官方能力通常不够

微信官方已经提供了不少能力：

- `wx.getRealtimeLogManager()` 实时日志
- We 分析里的 JS 错误分析
- Source Map 能力
- 开发者工具的性能分析
- 真机调试

这些能力对于单微信项目非常有价值。

但一旦进入下面这些场景，就会明显吃力：

- 同时维护微信、支付宝、字节等多个小程序端
- 希望把小程序纳入现有 Sentry 体系
- 希望看到页面跳转、请求、用户动作形成的完整上下文
- 希望弱网/断网时错误上报尽量不丢
- 希望前后端链路能串起来

这时候问题就不再是“有没有监控”，而是：

**能不能有一套跨平台、可统一治理、能真正接进研发流程的监控方案。**

## 三、为什么不能直接把 Web SDK 搬进来？

这是很多人第一反应会踩的坑。

Sentry 官方 JavaScript SDK 很强，但小程序和 Web 有几个本质差异：

- 小程序没有浏览器 DOM 与标准事件系统
- 小程序网络请求不是 `fetch` / `XMLHttpRequest`
- 各平台全局对象、生命周期、错误入口都不一样
- 运行时堆栈路径往往是虚拟路径，不适合直接做 Source Map 匹配

所以如果要让 Sentry 真正在小程序里落地，需要额外做几件事：

- 抹平多端运行时 API 差异
- 接管小程序特有的错误与生命周期
- 用小程序 `request` 定制 Transport
- 处理弱网场景下的离线缓存与重试
- 对堆栈路径做归一化，方便 Source Map 还原

这也是我做 `sentry-miniapp` 的原因。

## 四、sentry-miniapp 到底解决了什么问题？

`sentry-miniapp` 是一个基于 `@sentry/core` 构建的多端小程序监控 SDK。

它要解决的不是“监控平台从 0 到 1 重做一遍”，而是：

**让小程序团队也能获得接近现代 Web 工程的错误监控与排查体验。**

当前覆盖的平台包括：

- 微信小程序
- 支付宝小程序
- 字节跳动 / 抖音小程序
- 百度小程序
- QQ 小程序
- 钉钉小程序
- 快手小程序

同时也兼容：

- Taro
- uni-app

换句话说，它补的是“小程序环境里的最后一公里适配”。

## 五、它具体能做什么？

核心能力包括：

- 自动捕获未处理异常与 Promise rejection
- 记录页面跳转、网络请求、用户动作等 Breadcrumb
- 采集设备、系统、基础库等环境信息
- 支持多端路径归一化，配合 Source Map 定位源码
- 支持弱网 / 断网场景下的离线缓存
- 支持把小程序纳入现有 Sentry 项目与 release 流程

如果你已经在用 Sentry，最直接的价值就是：

**小程序终于不再是监控体系里的孤岛。**

下面这张图可以直观看到，事件进入 Sentry 后，不再只是零散日志，而是形成了可检索、可聚合的问题列表：

![Sentry 上报数据列表](https://cdn.jsdelivr.net/gh/lizhiyao/sentry-miniapp@master/docs/articles/issues-list.jpg)

## 六、5 分钟接入一个最小示例

### 1. 安装

```bash
npm install sentry-miniapp
```

### 2. 初始化

在 `app.js` 或 `app.ts` 中，放在 `App()` 调用之前：

```javascript
const Sentry = require('sentry-miniapp');

Sentry.init({
  dsn: 'https://your-key@sentry.io/your-project-id',
  release: 'my-miniapp@1.0.0',
  environment: 'production',
});

App({
  // 你的 App 配置
});
```

完成初始化后，SDK 会自动做几件事：

- 捕获未处理异常
- 记录基础上下文
- 接入请求链路
- 为后续排查保留设备与运行时信息

### 3. 给关键业务补上下文

真正有价值的监控，不是只有一条 error message，而是能把错误和业务动作关联起来。

```javascript
try {
  riskyOperation();
} catch (error) {
  Sentry.captureException(error);
}

Sentry.captureMessage('用户完成首次支付', 'info');

Sentry.setUser({ id: 'user123', username: '张三' });
Sentry.setTag('page', 'payment');
Sentry.setContext('order', { orderId: '2024001', amount: 99.9 });
```

这样当线上真的出问题时，你看到的不只是“报错了”，而是：

- 哪个用户
- 在哪个页面
- 做了什么操作
- 哪个订单上下文下出的错

实际落到后台时，错误详情会把堆栈、上下文、标签、用户信息集中展示，排查效率会比“用户口头反馈 + 本地猜测”高很多：

![Sentry 错误详情页示例一](https://cdn.jsdelivr.net/gh/lizhiyao/sentry-miniapp@master/docs/articles/issue-detail-01.jpg)

## 七、真正决定排查体验的，是 Source Map

很多团队其实不是没有上报，而是上报之后看不懂。

原因通常有三个：

- 线上代码经过压缩
- 小程序运行时堆栈路径和源码路径不一致
- release 与 sourcemap 没有严格对齐

如果不把这件事打通，监控平台的体验会大打折扣。

上传 sourcemap 的方式可以是：

```bash
sentry-cli releases files "my-miniapp@1.0.0" upload-sourcemaps ./dist \
  --url-prefix "app:///" \
  --ext js --ext map
```

这里最关键的，不只是命令本身，而是两件事：

- 堆栈路径要能被统一映射
- 构建产物必须和 release 版本严格对应

`sentry-miniapp` 做的一件重要事情，就是把不同平台的虚拟路径统一处理到 `app:///` 语义下，降低小程序 Source Map 对齐的复杂度。

当 Source Map 对齐之后，后台里看到的异常详情就不再只是“压缩后看不懂的堆栈”，而是可以真正用于定位源码的问题信息：

![Sentry 错误详情页示例二](https://cdn.jsdelivr.net/gh/lizhiyao/sentry-miniapp@master/docs/articles/issue-detail-02.jpg)

## 八、这套方案真正带来的收益是什么？

如果接入完整，它带来的不只是“多一个报错工具”，而是四层收益。

### 1. 从“知道报错”到“知道用户怎么走到这里”

你能看到页面路径、用户动作、请求链路，而不是孤零零一条异常。

这也是为什么 Breadcrumb 对线上排查特别重要：错误并不是孤立发生的，它往往是前面一连串操作和请求共同导致的。

![Sentry 错误详情页示例三](https://cdn.jsdelivr.net/gh/lizhiyao/sentry-miniapp@master/docs/articles/issue-detail-03.jpg)

### 2. 从“单端排查”到“多端统一治理”

如果你的业务同时跑在多个小程序端，一个统一面板带来的收益非常大。

### 3. 从“只能复现”到“即使复现不了也能定位”

很多线上问题压根难以稳定复现，真正有价值的是：

**基于上下文快速缩小排查范围。**

### 4. 从“一个 SDK”到“纳入版本与研发流程”

一旦和 release、Source Map、CI/CD 结合起来，监控才会真正变成工程资产，而不是可有可无的埋点。

如果再把性能链路一起接进来，后台看到的就不只是“错误发生了”，还包括请求与资源加载的上下游关系，这对排查慢请求、偶发超时、页面卡顿尤其有帮助：

![Sentry Waterfall 视图](https://cdn.jsdelivr.net/gh/lizhiyao/sentry-miniapp@master/docs/articles/performance-waterfall.jpg)

## 九、什么团队最适合上这套方案？

更适合下面这些团队：

- 多端小程序团队
- 已经在用 Sentry 的团队
- 对发布质量、错误治理有明确要求的团队
- 线上问题定位成本高、业务链路复杂的团队

如果你只是一个微信单端、规模不大、诉求不复杂的小程序项目，优先把官方能力用扎实，通常会更划算。

## 十、更务实的接入建议：分三层做，不要一步到位

如果让我给建议，我会这么分层：

- **第一层**：先把微信官方能力用好
- **第二层**：出现多端、统一治理、跨系统追踪需求时，再补统一监控方案
- **第三层**：把 release、Source Map、告警、回归分析接进 CI/CD

这样不会一上来就引入太多复杂度，但每一步都能产生明确收益。

## 十一、项目地址

如果你正好在做下面这些事情，可以看看这个项目：

- GitHub: [github.com/lizhiyao/sentry-miniapp](https://github.com/lizhiyao/sentry-miniapp)
- npm: [npmjs.com/package/sentry-miniapp](https://www.npmjs.com/package/sentry-miniapp)

它适合的不是所有小程序项目，而是这些场景：

- 多端统一监控
- 接入现有 Sentry 体系
- 处理小程序环境下的 Source Map、弱网缓存、跨端 API 差异

## 十二、结语

小程序监控这件事，真正难的不是“把错误发出去”，而是：

- 能不能在小程序环境里稳定发出去
- 能不能带着足够多的上下文发出去
- 能不能最终定位到源码
- 能不能接进团队已有的研发流程

如果这些都做到了，小程序监控就不再只是“补日志”，而是真正开始具备工程价值。

如果你已经在用 Sentry，或者正在考虑给多端小程序补一套统一监控链路，这个项目也许正好能帮你少踩很多坑：

- GitHub: [github.com/lizhiyao/sentry-miniapp](https://github.com/lizhiyao/sentry-miniapp)
- npm: [npmjs.com/package/sentry-miniapp](https://www.npmjs.com/package/sentry-miniapp)
