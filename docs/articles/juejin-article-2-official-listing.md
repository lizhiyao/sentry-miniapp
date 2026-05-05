# 我做的小程序 SDK 被 Sentry 官方文档收录了：从提 PR 到合入的一次复盘

[![npm version](https://img.shields.io/npm/v/sentry-miniapp.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/sentry-miniapp)
[![npm downloads](https://img.shields.io/npm/dm/sentry-miniapp.svg?style=flat-square&color=4c1)](https://www.npmjs.com/package/sentry-miniapp)
[![GitHub stars](https://img.shields.io/github/stars/lizhiyao/sentry-miniapp.svg?style=flat-square&color=ffb13b)](https://github.com/lizhiyao/sentry-miniapp)
[![license](https://img.shields.io/npm/l/sentry-miniapp.svg?style=flat-square&color=blue)](https://github.com/lizhiyao/sentry-miniapp/blob/master/LICENSE)
[![Sentry Official](https://img.shields.io/badge/Sentry-Community%20SDK-362d59?style=flat-square&logo=sentry)](https://docs.sentry.io/platforms/#sdks-supported-by-our-community)

很多人在做"国内场景"的开源项目时，会遇到一个隐形瓶颈：

- 项目本身做得不差，但流量始终起不来
- 国内有团队在用，出了圈基本没人知道
- 想让国际生态认识自己，但不知道从哪里下手

这篇文章不讲抽象方法论，直接回答一个具体问题：

**一个国内场景的小程序监控 SDK，是怎么被 Sentry 这种国际主流监控平台官方收录的？**

![sentry-miniapp 出现在 Sentry 官方 Community-Supported SDKs 列表](https://cdn.jsdelivr.net/gh/lizhiyao/sentry-miniapp@master/docs/articles/sentry-listing-screenshot.png)

## 一、PR 合并那天

2026 年 5 月 4 日，我提给 [getsentry/sentry-docs](https://github.com/getsentry/sentry-docs) 的 PR #17152 被合并：

> feat: Add Mini Programs to community-supported SDKs
>
> https://github.com/getsentry/sentry-docs/pull/17152

合并之后，`sentry-miniapp` 正式出现在了 Sentry 官方文档的 Community-Supported SDKs 列表里。

收录页：[docs.sentry.io/platforms/#sdks-supported-by-our-community](https://docs.sentry.io/platforms/#sdks-supported-by-our-community)

## 二、Sentry community SDK 列表里都有谁？

Sentry 的 community SDK 列表目前约有 18 个 SDK：

Clojure、ColdFusion、Crystal、Defold、Grails、Hono、Kubernetes、Lua、**Mini Programs（指向 sentry-miniapp）**、Nuxt 2、OCaml、Quarkus、Scrapy、Serverless Framework、Strapi、Terraform、WordPress

这些大多是国际工程社区耳熟能详的项目。Mini Programs 是其中**第一个指向中国小程序生态的条目**。

在此之前，Sentry、Datadog、New Relic 等国际主流监控平台的官方文档里，并没有"小程序"这个独立的平台分类。

## 三、被收录之后，到底有什么不同？

可以从三个角度看：

### 1. 对正在做小程序监控选型的团队

多了一份直接可参照的官方背书。在评估方案的时候，至少不用再担心"这只是个人项目"或者"会不会哪天断更"。

### 2. 对维护者本人

后续合作的门会好开一点。无论是对接 Taro / uni-app 团队、给 Sentry 提其他相关 PR，还是做内容输出和分享，"被官方文档收录的 community SDK"这个身份本身就是入场凭证。

### 3. 对中国小程序生态本身

国际主流监控平台的文档里，第一次有了一个明确指向小程序的入口。这件事看起来小，但"有"和"无"的差距其实不小。

## 四、走到这一步，做了哪些事？

`sentry-miniapp` 不是新项目，过去几年一直在迭代：

- 基于 `@sentry/core` v10 构建，遵循 Sentry 统一 API 设计
- 覆盖 7 个小程序平台：微信、支付宝、字节、QQ、百度、钉钉、快手
- 兼容 Taro、uni-app 跨端框架
- 提供异常自动捕获、性能监控、离线缓存、分布式追踪、跨端 Source Map 路径归一化
- 447 个测试用例，100% 覆盖率
- MIT License，npm 持续维护中

但这些只是被收录的"基础门槛"，真正让事情发生的，是后面这一步：

**主动提 PR，并且把 PR 写到 maintainer 不需要做任何额外功课就能 review。**

我那个 PR 的描述里写清楚了：

- 小程序是什么、为什么是一个独立的平台分类
- 覆盖了哪些平台、有多少日活规模
- 项目当前的成熟度（测试、覆盖率、维护状态）
- 为什么 Web SDK 不能直接复用

写好这些，比单纯"提个 PR 等回应"要有效得多。

技术细节这里不展开，前一篇写得挺细：[我把 Sentry 接进了 7 端小程序：从异常捕获、Breadcrumb 到 Source Map 定位](https://juejin.cn/post/7621871037853843465)

## 五、还在路上的下一步

收录这件事之外，还有一个配套 PR 在排队中：

[getsentry/sentry-for-ai #83](https://github.com/getsentry/sentry-for-ai/pull/83) 给 Sentry 的 AI 工具链补一个 skill，让 Claude Code、Cursor 这类编码助手能够引导开发者完成 sentry-miniapp 的集成（错误监控、性能追踪、离线缓存、Source Map）。

PR 提交了 38 天，CI 全绿，目前在等 maintainer review。合入后我会再单独写一篇。

## 六、项目地址

如果你正在做下面这些事情，这个项目可能正好用得上：

- 多端小程序统一监控
- 把小程序接进现有 Sentry 体系
- 处理小程序环境下的 Source Map、弱网缓存、跨端 API 差异

链接：

- GitHub: [github.com/lizhiyao/sentry-miniapp](https://github.com/lizhiyao/sentry-miniapp)
- npm: [npmjs.com/package/sentry-miniapp](https://www.npmjs.com/package/sentry-miniapp)
- Sentry 官方收录页: [docs.sentry.io/platforms/#sdks-supported-by-our-community](https://docs.sentry.io/platforms/#sdks-supported-by-our-community)

如果觉得这个项目能帮到你，star 一下也是很大的鼓励 🙏
