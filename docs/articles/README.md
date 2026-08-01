# 对外文章存档

本目录保存 sentry-miniapp 对外文章的源稿和配图，不是 SDK 用户文档。接入方式、配置项和能力说明以[官方文档站](https://sentry-miniapp.pages.dev/)为准；重新发布旧稿前，应先对照当前版本检查技术内容。

## 文章索引

| 主题 | 渠道 | 源稿 | 状态 | 发布地址 |
|------|------|------|------|----------|
| 多端小程序监控实践 | 掘金 | [`miniapp-monitoring-practice-juejin.md`](./miniapp-monitoring-practice-juejin.md) | 已发布 | [我把 Sentry 接进了 7 端小程序](https://juejin.cn/post/7621871037853843465) |
| 多端小程序监控实践 | 微信开放社区 | [`miniapp-monitoring-practice-wechat-community.md`](./miniapp-monitoring-practice-wechat-community.md) | 稿件存档 | 仓库未记录 |
| 被 Sentry 官方文档收录 | 掘金 | [`sentry-official-listing-juejin.md`](./sentry-official-listing-juejin.md) | 已发布 | [我给 Sentry 提了个 PR](https://juejin.cn/post/7636106283963760681) |
| 被 Sentry 官方文档收录 | 微信公众号 | [`sentry-official-listing-wechat-official-account.md`](./sentry-official-listing-wechat-official-account.md) | 稿件存档 | 仓库未记录 |

## 配图归属

以下图片已被已发布文章通过 jsDelivr 的仓库路径引用。为避免外部文章图片失效，不要移动或重命名；新增图片也应先确认最终发布方式。

| 主题 | 图片 |
|------|------|
| 多端小程序监控实践 | `issues-list.jpg`、`issue-detail-01.jpg`、`issue-detail-02.jpg`、`issue-detail-03.jpg`、`performance-waterfall.jpg` |
| 被 Sentry 官方文档收录 | `sentry-listing-screenshot.png`、`sentry-official-listing.svg`（备用矢量素材） |

## 维护约定

- 文件名使用“主题-渠道”格式，避免 `article-2` 等无法表达内容的编号。
- 同一主题按渠道保留独立源稿，渠道差异直接体现在文件名和文章索引中。
- 文章发布后补充公开地址；无法确认是否发布时标记为“稿件存档”。
- 用户文档统一维护在 `website/`，文章只引用官网，不复制新的配置参考。
- 调整现有图片路径前，先确认没有外部页面通过 GitHub 或 jsDelivr 引用。
