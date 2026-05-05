# 做一个被 Sentry 官方收录的小程序 SDK，是种什么体验

[![npm version](https://img.shields.io/npm/v/sentry-miniapp.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/sentry-miniapp)
[![npm downloads](https://img.shields.io/npm/dm/sentry-miniapp.svg?style=flat-square&color=4c1)](https://www.npmjs.com/package/sentry-miniapp)
[![GitHub stars](https://img.shields.io/github/stars/lizhiyao/sentry-miniapp.svg?style=flat-square&color=ffb13b)](https://github.com/lizhiyao/sentry-miniapp)
[![license](https://img.shields.io/npm/l/sentry-miniapp.svg?style=flat-square&color=blue)](https://github.com/lizhiyao/sentry-miniapp/blob/master/LICENSE)
[![Sentry Official](https://img.shields.io/badge/Sentry-Community%20SDK-362d59?style=flat-square&logo=sentry)](https://docs.sentry.io/platforms/#sdks-supported-by-our-community)

![sentry-miniapp 出现在 Sentry 官方 Community-Supported SDKs 列表（来自 docs.sentry.io/platforms/）](https://cdn.jsdelivr.net/gh/lizhiyao/sentry-miniapp@master/docs/articles/sentry-listing-screenshot.png)

> 这是一篇短文，记录一个对小程序监控生态来说不算小的小事。

## 一、上周提的 PR，昨天合了

昨天（2026 年 5 月 4 日），我提给 [getsentry/sentry-docs](https://github.com/getsentry/sentry-docs) 的 PR 被 Sentry 官方合并了：

> **PR #17152 — feat: Add Mini Programs to community-supported SDKs**
>
> https://github.com/getsentry/sentry-docs/pull/17152

合并之后，`sentry-miniapp` 正式出现在了 Sentry 官方文档的 **Community-Supported SDKs** 列表里。

这意味着，从今天开始，全世界开发者在 Sentry 官方平台页搜索小程序相关方案时，第一次有了一条明确的官方推荐入口。

听起来是一件挺小的事，但对中国小程序生态来说，其实是第一次。

## 二、这件事到底意味着什么？

我自己是这么理解的：

### 1. 国内小程序，在国际监控体系里第一次有了名字

Sentry 的 community SDK 列表里有大约 18 个 SDK：Clojure、Hono、Kubernetes、Lua、OCaml、Quarkus、Terraform、WordPress……基本都是国际工程社区耳熟能详的项目。**Mini Programs（指向 sentry-miniapp）这次就排在它们中间。**

虽然小程序在国内是一个上亿日活的生态，但它过去从来没有以"一个独立的平台分类"出现在 Sentry、Datadog、New Relic 这种国际主流监控平台的文档里。这次至少是个起点。

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

在 AI Coding 已经成为主流开发入口的今天，**"让 AI 知道你的库"本身就是一种新的分发渠道** —— 不只是写文档给人看，也要把"接入路径"写给 AI 看。

如果这个也合入，国内开发者接小程序监控会变得更轻：不用翻文档，AI 助手会带着你接完。后续合入了我会再写一篇。

## 五、想说一句的话

如果你也在维护一个国内自用、不上国际榜的项目，这次我至少印证了一件事：

**只要英文 README 写到位、PR 描述写得让人能 review，机会真的会来。**

`sentry-miniapp` 在被收录前已经做到 100% 测试覆盖率了 —— 但真正让"收录"这件事发生的，是"主动提 PR 这一步"，不是技术本身。

被官方收录不会让一个项目突然变好，它只是让"被发现"这件事容易了一些。这一步省下来的，是后面所有内容输出、合作沟通的隐性成本。

## 项目地址

- GitHub: [github.com/lizhiyao/sentry-miniapp](https://github.com/lizhiyao/sentry-miniapp)
- npm: [npmjs.com/package/sentry-miniapp](https://www.npmjs.com/package/sentry-miniapp)
- Sentry 官方文档收录页: [docs.sentry.io/platforms/#sdks-supported-by-our-community](https://docs.sentry.io/platforms/#sdks-supported-by-our-community)（"SDKs Supported by Our Community"区块）

如果你做的是多端小程序、已经在用 Sentry，或者正在为小程序监控选型，欢迎来仓库交流。

如果觉得有用，star 一下也是很大的鼓励 🙏
