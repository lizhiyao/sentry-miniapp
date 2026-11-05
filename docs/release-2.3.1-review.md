# 2.3.1 发布复核

本记录对应 2026-11-05 完成的 [#587](https://github.com/lizhiyao/sentry-miniapp/issues/587) 收尾与 [发布 PR #594](https://github.com/lizhiyao/sentry-miniapp/pull/594)。用户升级步骤见[迁移指南](https://sentry-miniapp.pages.dev/guide/migration-2.0#upgrade-2-3-1)，完整更新日志见 [GitHub Release](https://github.com/lizhiyao/sentry-miniapp/releases/tag/v2.3.1)。本文保留该版本的来源与验收证据，不作为后续版本的验收声明。

## 范围与来源

#588—#593 完成有限期限退休与同步重入保护、页面路由脱敏、缓存隐私策略失效、Core 过滤语义对齐及平台探测重试。发布同时纳入 v2.3.0 后已合并的 Core 与工具链更新；包内 Core 为 11.10.0。

| 身份 | 已核对结果 |
| --- | --- |
| 发布候选与 v2.3.1 tag | `947894da72cba81997a50088284b216b6e5ee132` |
| #594 merge commit | `b4c04bc3114b04b933a62ab1ee09cb1fa7709eca`，保留候选，已核对候选进入 master 历史 |
| 发布执行 | [CD - Publish 41974885269 / attempt 1](https://github.com/lizhiyao/sentry-miniapp/actions/runs/41974885269)，tag push，head 与候选一致，success |
| 正式发布 | npm 版本 2.3.1，验收时 `latest=2.3.1`；GitHub Release 非 draft／prerelease |

## 精确提交检查与产物

发布计划 `release-plan-1` 的核心 CI 与框架组均为 `reused=false`：候选没有完整成功的 master push 证据，未以 PR 或 merge commit 的检查替代。Node 20／22 build 与随机顺序测试、Taro／uni-app 框架 fallback 均在候选 SHA 上成功。Node 24 发布 job 的 lint、源码／测试类型、文档、独立 miniapp、覆盖率和最终 tarball 安装消费也成功。

Node 20／22／24 各 1543 测试，JUnit 均为零 failures／errors；覆盖率 statements 98.73%、branches 95.81%、functions 99.34%、lines 99.49%。最终 tarball 的 CJS／ESM 各 22 个公开行为场景全部通过，报告版本为 2.3.1。

已下载核对 npm tarball、GitHub Release 四个附件与 Actions 的 `release-v2.3.1-1` artifact：

- npm、Release 与 Actions 实际验收的 tarball 字节相同；SHA-256 为 `db416175597f559ca21d4c0b62213d4f83b47e6525ef6aba52420d5eee511118`，SHA-512 integrity 与 registry、manifest 和 publish-result 一致。
- `manifest.json` 的来源 SHA、tag、run／attempt 与本记录一致；发布记录为 `published`。
- UMD 与 Source Map 的下载摘要匹配 Release 元数据，且与 tarball 内对应文件逐字节一致。
- Node fallback 与发布 artifact 的 result.json、JUnit、包消费 NDJSON 及安装锁均已读取核对。artifact 保留期依工作流配置；长期摘要保存在 [Release manifest](https://github.com/lizhiyao/sentry-miniapp/releases/download/v2.3.1/manifest.json)。

## 缓存迁移与支持边界

已发布的 2.3.0 使用 v2 缓存隐私身份；2.3.1 首次读取时保守失效。#590 至 #592 修正之前的未发布源码候选曾将混合 allow／deny 错误快照为 allow，并保存相应 v3 allow 身份；修正后的同一输入产生 deny／true 身份，自然触发 policy_changed，原本正确的等价 v3 策略继续校验。这不是已发布 2.3.0 的 v3 迁移问题。

本轮源码、文档、回归、正式发布与产物验收已完成。App 重复包装保持低优先级，其余待证据项及已接受取舍按 #587 的结论延后。未新增真机或 Sentry 后台专项验收，不扩展既有平台、存储和多 runtime 支持边界。
