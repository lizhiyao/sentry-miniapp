# sentry-miniapp 被 Sentry 官方文档收录

[![npm version](https://img.shields.io/npm/v/sentry-miniapp.svg?style=flat-square&color=cb3837)](https://www.npmjs.com/package/sentry-miniapp)
[![npm downloads](https://img.shields.io/npm/dm/sentry-miniapp.svg?style=flat-square&color=4c1)](https://www.npmjs.com/package/sentry-miniapp)
[![GitHub stars](https://img.shields.io/github/stars/lizhiyao/sentry-miniapp.svg?style=flat-square&color=ffb13b)](https://github.com/lizhiyao/sentry-miniapp)
[![license](https://img.shields.io/npm/l/sentry-miniapp.svg?style=flat-square&color=blue)](https://github.com/lizhiyao/sentry-miniapp/blob/master/LICENSE)
[![Sentry Official](https://img.shields.io/badge/Sentry-Community%20SDK-362d59?style=flat-square&logo=sentry)](https://docs.sentry.io/platforms/#sdks-supported-by-our-community)

![sentry-miniapp 出现在 Sentry 官方 Community-Supported SDKs 列表](https://cdn.jsdelivr.net/gh/lizhiyao/sentry-miniapp@master/docs/articles/sentry-listing-screenshot.png)

## 一、PR 合并

2026 年 5 月 4 日，我提给 [getsentry/sentry-docs](https://github.com/getsentry/sentry-docs) 的 PR #17152 被合并：

> feat: Add Mini Programs to community-supported SDKs
>
> https://github.com/getsentry/sentry-docs/pull/17152

合并之后，`sentry-miniapp` 出现在了 Sentry 官方文档的 Community-Supported SDKs 列表里。

收录页：[docs.sentry.io/platforms/#sdks-supported-by-our-community](https://docs.sentry.io/platforms/#sdks-supported-by-our-community)

## 二、列表里有什么

Sentry 的 community SDK 列表目前约有 18 个 SDK，包括 Clojure、Hono、Kubernetes、Lua、OCaml、Quarkus、Terraform、WordPress 等。Mini Programs 是其中第一个指向中国小程序生态的条目。

在此之前，Sentry、Datadog、New Relic 等国际主流监控平台的官方文档里，并没有"小程序"这个独立分类。这次合入，相当于在国际监控生态里给国内小程序留出了一个明确的入口。

对正在做小程序监控选型的团队来说，多了一份可以直接参照的官方背书；对维护者来说，后续再做相关合作（比如对接 Taro / uni-app 团队，或者给 Sentry 提其他相关 PR）也会比之前顺一些。

## 三、项目当前情况

`sentry-miniapp` 不是新项目，过去几年一直在迭代：

- 基于 `@sentry/core` v10 构建，遵循 Sentry 统一 API 设计
- 覆盖 7 个小程序平台：微信、支付宝、字节、QQ、百度、钉钉、快手
- 兼容 Taro、uni-app 跨端框架
- 提供异常自动捕获、性能监控、离线缓存、分布式追踪、跨端 Source Map 路径归一化
- 447 个测试用例，100% 覆盖率
- MIT License，npm 持续维护中

技术细节这里不展开，之前那篇文章已经写得挺细：[我把 Sentry 接进了 7 端小程序：从异常捕获、Breadcrumb 到 Source Map 定位](https://juejin.cn/post/7621871037853843465)

## 四、还在排队的另一个 PR

收录这件事之外，还有一个配套 PR 在排队中：

[getsentry/sentry-for-ai #83](https://github.com/getsentry/sentry-for-ai/pull/83) 给 Sentry 的 AI 工具链补一个 skill，让 Claude Code、Cursor 这类编码助手能够引导开发者完成 sentry-miniapp 的集成（错误监控、性能追踪、离线缓存、Source Map）。

PR 提交了 38 天，CI 全绿，目前在等 maintainer review。合入后我会再写一篇说明。

## 项目地址

- GitHub: [github.com/lizhiyao/sentry-miniapp](https://github.com/lizhiyao/sentry-miniapp)
- npm: [npmjs.com/package/sentry-miniapp](https://www.npmjs.com/package/sentry-miniapp)
- Sentry 官方收录页: [docs.sentry.io/platforms/#sdks-supported-by-our-community](https://docs.sentry.io/platforms/#sdks-supported-by-our-community)

如果你做的是多端小程序，或者已经在用 Sentry，欢迎来仓库交流。
