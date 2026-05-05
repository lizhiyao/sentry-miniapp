# sentry-miniapp 被 Sentry 官方文档收录了：中国小程序生态终于有了一个官方入口

[![npm version](https://img.shields.io/npm/v/sentry-miniapp.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/sentry-miniapp)
[![npm downloads](https://img.shields.io/npm/dm/sentry-miniapp.svg?style=flat-square&color=4c1)](https://www.npmjs.com/package/sentry-miniapp)
[![GitHub stars](https://img.shields.io/github/stars/lizhiyao/sentry-miniapp.svg?style=flat-square&color=ffb13b)](https://github.com/lizhiyao/sentry-miniapp)
[![license](https://img.shields.io/npm/l/sentry-miniapp.svg?style=flat-square&color=blue)](https://github.com/lizhiyao/sentry-miniapp/blob/master/LICENSE)
[![Sentry Official](https://img.shields.io/badge/Sentry-Community%20SDK-362d59?style=flat-square&logo=sentry)](https://docs.sentry.io/platforms/#sdks-supported-by-our-community)

![sentry-miniapp 出现在 Sentry 官方 Community-Supported SDKs 列表（来自 docs.sentry.io/platforms/）](https://cdn.jsdelivr.net/gh/lizhiyao/sentry-miniapp@master/docs/articles/sentry-listing-screenshot.png)

> 这是一篇短文，记录一个对小程序监控生态来说不算小的小事。

## 一、一条挺让我意外的合并通知

昨天（2026 年 5 月 4 日），我提给 [getsentry/sentry-docs](https://github.com/getsentry/sentry-docs) 的一个 PR 被 Sentry 官方合并了：

> **PR #17152 — feat: Add Mini Programs to community-supported SDKs**
>
> https://github.com/getsentry/sentry-docs/pull/17152

合并之后，`sentry-miniapp` 正式出现在了 Sentry 官方文档的 **Community-Supported SDKs** 列表里。

这意味着，从今天开始，全世界开发者在 Sentry 官方平台页搜索小程序相关方案时，第一次有了一条明确的官方推荐入口。

听起来是一件挺小的事，但对中国小程序生态来说，其实是第一次。

## 二、这件事到底意味着什么？

我自己是这么理解的：

### 1. 中国小程序在国际监控生态里第一次"被看见"

微信、支付宝、字节小程序加起来覆盖了上亿日活用户，但在 Sentry、Datadog、New Relic 这类国际主流监控平台的官方文档里，过去几乎找不到任何对应入口。

这次是 Sentry 官方文档第一次正式列出"Mini Programs"这个平台分类。

也就是说，国内小程序生态终于不再是国际监控体系里的盲区。

### 2. `sentry-miniapp` 从"个人项目"变成"官方推荐方案"之一

在这之前，它只是 GitHub / npm 上的一个开源项目。

现在它有了一个不一样的身份：**Sentry 官方文档明确推荐的 community SDK**。

这对正在评估小程序监控方案的团队来说，是一份额外的可信度背书。

### 3. 给后续合作留出了空间

被官方收录之后，再做任何动作都比之前顺很多：

- 给 Sentry 提其他相关 PR（例如 AI Agent 集成、Source Map 工具链改进）
- 联系 Taro / uni-app 团队探讨适配建议
- 在国内技术社区做更多内容输出

简单说，这是一扇门，不是终点。

## 三、走到这一步，其实没有走捷径

`sentry-miniapp` 不是新项目，过去这些年一直在迭代。被官方收录之前，它已经具备这些条件：

- 基于 `@sentry/core` v10 构建，遵循 Sentry 统一 API 设计
- 覆盖 7 个小程序平台（微信、支付宝、字节、QQ、百度、钉钉、快手）
- 兼容 Taro、uni-app 跨端框架
- 异常自动捕获、性能监控、离线缓存、分布式追踪、跨端 Source Map 路径归一化
- 447 个测试用例 / 100% 覆盖率
- MIT License，npm 持续维护中

技术细节这里不展开，之前那篇文章已经写得挺细了：

📎 [我把 Sentry 接进了 7 端小程序：从异常捕获、Breadcrumb 到 Source Map 定位](https://juejin.cn/post/7621871037853843465)

如果你正好在评估这套方案，那一篇会更值得看。

## 四、还在推进的另一件事

收录这件事之外，还有一个配套 PR 在排队中：

> **getsentry/sentry-for-ai #83 — feat: Add Mini Program SDK skill**

这个 PR 给 Sentry 的 AI 工具链补一个 skill，让 Claude Code、Cursor 这类编码助手能够"一句话"引导开发者完成 sentry-miniapp 的完整集成（错误监控 / 性能追踪 / 离线缓存 / Source Map 一条龙）。

如果这个也合入，那国内开发者接小程序监控这件事会变得更轻 —— 不用看文档，AI 助手会带着你接完。

后续合入了我会再写一篇。

## 五、想说一句的话

做开源最难的从来不是技术问题，是"会不会有人用"和"怎么走出去"这两件事。

被官方文档收录不会让一个项目突然变好，但它会让"被发现"这件事容易很多。

如果你正在维护一个小众但真实有人需要的项目，希望我的经历能给你一点信心 —— 持续做下去，机会通常比你想的要多。

## 项目地址

- GitHub: [github.com/lizhiyao/sentry-miniapp](https://github.com/lizhiyao/sentry-miniapp)
- npm: [npmjs.com/package/sentry-miniapp](https://www.npmjs.com/package/sentry-miniapp)
- Sentry 官方文档收录页: [docs.sentry.io/platforms/#sdks-supported-by-our-community](https://docs.sentry.io/platforms/#sdks-supported-by-our-community)（"SDKs Supported by Our Community"区块）

如果你做的是多端小程序、已经在用 Sentry，或者正在为小程序监控选型，欢迎来仓库交流。

如果觉得有用，star 一下也是很大的鼓励 🙏
