# 示例框架依赖审查（2026-10-10）

本轮修复 Taro 示例的旧 webpack 和 uni-app 示例的旧 Vite，随后按具体消费者修补 uni-app 的 PostCSS、ws 和 source-map-js，并保留微信构建、watch 首轮编译与业务 Source Map。框架依赖树仍有安全公告；不能把 SDK 生产包审计结果当作示例依赖全部通过。

## 范围与结果

审查使用官方 npm registry，在隔离目录严格解析实际依赖树。构建器修补阶段两套示例使用 `sentry-miniapp 2.0.0-beta.6` 候选 tarball；随后 uni-app 按消费者修补阶段使用官方已发布 beta.6 tarball，两阶段均使用 Core `11.4.0`。Taro 的审计数沿用前阶段结果；后续 CI 继续构建当前仓库 tarball。没有新增真机或 Sentry 后台证据。

| 示例    | 原完整审计受影响包条目 | 构建器修补后 | 按消费者修补后 | 当前独立 GHSA | 当前 `omit=dev` 条目 |
| ------- | ---------------------: | -----------: | -------------: | ------------: | -------------------: |
| Taro    |                     63 |           59 |             59 |            39 |                   21 |
| uni-app |                     49 |           48 |             44 |            28 |                   36 |

受影响包条目包含父依赖传播，不能相加得到独立漏洞数量；`omit=dev` 仍包含框架放在 dependencies 中的编译、H5 和服务依赖，不能直接解释为微信产物中的可利用漏洞。完整版本、实际依赖路径、公告范围和可调查的修补版本见[机器可读快照](./example-dependency-security.snapshot.json)。其中“已发布的出公告范围版本”和 npm `fixAvailable` 不构成兼容性承诺，尤其是 0.x 包和跨 major 变更。

快照的原有字段保留构建器修补阶段历史；`scopedFollowup` 记录后续 uni-app 的实际版本、审计增量和当前剩余公告。

两套修补后的依赖树中，webpack、Vite、sentry-miniapp 和 Core 没有命中本次审计公告。其余条目仍保留，未将它们豁免或解释为已经修复。

## 已验证的修补

- Taro 保留 `4.2.1` 版本组，webpack 固定为 `5.104.1`，用 npm `overrides: { "webpack": "$webpack" }` 统一依赖树。移除只注册 `taro new` 的 `@tarojs/plugin-generator` 及配置入口。微信生产构建、watch 首轮编译和 3 处业务异常映射通过。
- uni-app 保留 `3.0.0-5020620260917001` 版本组，Vite 固定为 `6.4.3`，用对应 override 统一依赖树。单改版本会构建成功但丢失业务 map；示例增加公开 `configEnvironment` hook 同步实际构建环境，并保留旧 Vue 插件读取的 `configResolved` 根配置。生产构建、watch 首轮编译和 3 处业务异常映射通过。[Vite 环境配置说明](https://vite.dev/guide/api-environment-plugins#configuring-environment-using-the-configenvironment-hook)

两项 override 超出框架上游精确 peer 声明，只是本仓库微信示例的已验证兼容补丁。没有据此承诺框架官方支持、其他端或其他配置均兼容。每次框架升级继续运行真实包安装、生产构建和业务映射检查；watch 是首轮编译证据，不是长期热更新验收。

webpack `5.104.1` 和 Vite `6.4.3` 分别在本轮公告的修补范围内。[webpack 公告](https://github.com/advisories/GHSA-8fgc-7cc6-rx7x)、[Vite 公告](https://github.com/vitejs/vite/security/advisories/GHSA-fx2h-pf6j-xcff)。Vite 6.4 仍接收安全回补，Vite 5 已不在官方维护范围。[维护政策](https://vite.dev/releases)

### uni-app 按消费者修补

以下 override 仅匹配 DCloud `3.0.0-5020620260917001` 的具体消费者，未对所有包全局替换。框架版本组升级时，需要重新审查声明和实际解析路径。

| 实际消费者                          | 依赖旧版 → 修补版               | 本轮兼容性证据                                                                                        |
| ----------------------------------- | ------------------------------- | ----------------------------------------------------------------------------------------------------- |
| `uni-nvue-styler`                   | PostCSS `8.5.6` → `8.5.29`      | 4 组真实 nvue 样式编译的输出和诊断与原版一致；不代表 Android／iOS nvue 设备验收                       |
| `uni-mp-weixin`                     | ws `8.18.0` → `8.22.0`          | 实际 uni.automator 客户端在 loopback 完成连接、消息、请求结果、关闭及关闭后拒发；未连接真实 IDE／设备 |
| `uni-cli-shared`、`vite-plugin-uni` | source-map-js `1.2.1` → `1.2.2` | 实际 Vue SFC script、template、scoped style 编译及原 `.vue` 映射通过                                  |

这三类依赖移除了本轮实际依赖树中的 7 个 GHSA，未引入新的 GHSA。PostCSS、ws、source-map-js 分别覆盖对应公告的修补范围。[PostCSS 公告](https://github.com/advisories/GHSA-fxqj-rqcc-2cmp)、[ws 公告](https://github.com/advisories/GHSA-96hv-2xvq-fx4p)、[source-map-js 公告](https://github.com/advisories/GHSA-68fv-2mgg-jv7q)。使用官方 beta.6 的微信生产构建、watch 首轮编译和 3 处业务异常映射再次通过；未验证增量热更新。

已有安装锁的回放发现：普通 `npm install` 和 `npm install --package-lock-only` 都可能成功退出，但 nvue 消费者仍解析 nested PostCSS `8.5.6`。全新依赖树才解析到 `8.5.29`。两套示例的 CI 现在在安装后、构建前运行 `check-example-dependencies.mjs`，从声明的消费者位置解析包元数据并核对版本；旧锁反例会失败。脚本只检查当前示例使用的简单 override 结构，不模拟完整 npm 语法或扫描所有重复实例。安装排障步骤见各示例 README。

## 剩余问题与长期取舍

| 依赖路径或问题                                               | 当前结论与后续要求                                                                                                                                |
| ------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Taro CLI → download-git-repo → download → decompress `4.2.1` | 旧包没有已发布的修补版本，涉及不可信归档解压；删除生成器不会移除 CLI 的这条链。不能将外部模板／归档当作可信输入，后续跟进上游替换归档和下载实现。 |
| Taro components → swiper `11.1.15`                           | 修补需 `12.1.2` 跨 major。当前微信业务 map 没有 swiper 源码，不能据此保证 H5 安全；其他目标须单独验证框架组件升级。                               |
| uni-app → Vue／server-renderer `3.4.21`、Intlify `9.1.9` 等  | 框架固定整套编译与运行依赖。可调查版本及范围见快照；只替换某个编译包不足以证明整链兼容，需要跟随上游版本组并验证实际产物。                        |
| Taro 中测试工具的 PostCSS 7，以及两套框架的归档和解析依赖    | PostCSS 7 没有本轮公告的同 major 修补路径；其余逐路径保留公告与候选版本。没有已发布修补版本或涉及 API 变化的条目继续待处理。                      |

当前稳定 Taro `4.3.0` 的 webpack runner 仍精确要求 `5.91.0`，换到官方 Vite runner 又要求 Vite `^4`；整体升级或更换编译器不能直接解除这一限制。[webpack runner 元数据](https://registry.npmjs.org/@tarojs/webpack5-runner/4.3.0)、[Vite runner 元数据](https://registry.npmjs.org/@tarojs/vite-runner/4.3.0)

uni-app 官方稳定模板仍使用现有版本组和 Vite `5.2.8`；较新 alpha 的 pin 也未解除，并提高 Node 门槛。[官方模板](https://github.com/dcloudio/uni-preset-vue/blob/vite/package.json)、[alpha 插件元数据](https://registry.npmjs.org/@dcloudio/vite-plugin-uni/3.0.0-alpha-5030120260930001)

本仓库继续维护 SDK 的跨端适配与示例的必要配置，框架安全治理跟随上游受支持的版本组。没有采用未经验证的大量跨 major 替换或维护框架 fork；npm 自动建议中的 Taro 1.x、DCloud 0.x 降级也未采用。

## GitHub 告警与后续验收

GitHub 此前显示的 18 条 Dependabot 告警尚未取得正文，因此本表不是它们的逐项核销。官方 npm 审计是本次实际依赖树的独立证据，后续仍需核对 GitHub 的 manifest、版本、公告及告警状态，不能只按数量判断完成。

[#467](https://github.com/lizhiyao/sentry-miniapp/issues/467) 已按维护者决定关闭。剩余示例框架依赖警告与上游兼容升级暂缓处理，不作为 SDK 升级或发布阻塞；此前审查证据保留，关闭不表示所有警告已修复。

真实设备冻结恢复、弱网、设备存储、撤回同意和最终后台符号化继续按 [#457](https://github.com/lizhiyao/sentry-miniapp/issues/457) 收集用户证据。本轮未新增这些场景的通过结论。
