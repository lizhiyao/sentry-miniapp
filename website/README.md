# sentry-miniapp 文档站

基于 [VitePress](https://vitepress.dev/) 的 `sentry-miniapp` 文档站，与 SDK 同仓库、同 Yarn 4 项目维护——`vitepress` 与 `docs:*` 脚本都在**仓库根 `package.json`**，`website/` 只放内容与 `.vitepress/config`，无单独的 `package.json` / 锁文件。

## 本地开发

在**仓库根目录**执行（用与 SDK 一致的 Yarn 4）：

```bash
corepack enable
yarn install
yarn run docs:dev        # 地址以终端输出为准，通常为 http://localhost:5173
yarn run docs:build      # 构建到 website/.vitepress/dist
yarn run docs:preview    # 预览构建产物
```

仓库继续使用稳定版 VitePress 1；其 Vite 依赖通过根 `resolutions` 覆盖到仍接收安全修复的 Vite 6。CI 会执行 `yarn docs:build`，依赖升级时必须保持文档站构建兼容。

## 内容边界与单一来源

`website/` 是面向 SDK 用户的主文档入口：接入、配置、框架指南、平台能力和排障内容都应在站内可发现，不应要求用户跳回仓库查找答案。

`docs/` 保留英文 README、设计取舍、按版本的审查记录、对外文章和媒体素材，入口见[文档索引](../docs/README.md)。维护者职责与实现原因由 [ARCHITECTURE.md](../ARCHITECTURE.md) 说明。

同一内容只维护一份。面向用户的完整指南直接放在 `website/guide/`，站内页面、更新时间和「在 GitHub 上编辑此页」都对应同一个源文件。

- 接入页先给完整步骤和最小配置，再链接可选能力；参数页列类型、默认值与使用边界。
- 普通能力页写当前行为和设计原因；旧配置、字段变化和历史差异放在迁移页。
- 用户需要据此选择或操作的启用条件、支持范围与实际限制应保留；项目的待验收清单、证据进展、内部测试数量和修复经过只放在维护记录及 issue，不写进官网页面或用户 README（含中英文与示例入口）。
- 示例配置对照 `src/types.ts`、默认集成和实际脚本；Source Map 命令优先使用已安装 SDK 自带的工具。
- 源码实验能力标明安装来源和覆盖范围，不把 master 的入口当成已发布的 npm API。
- 调整标题时保留已使用的锚点。提交前构建文档、核对本地链接和锚点，并预览受影响页面。

### 交付前检查

1. 对照当前源码与脚本，确认示例的工作目录、依赖准备、默认值、可选开关和输出路径。
2. 在仓库根执行 `yarn docs:build`；它检查站内页面链接，标题锚点、仓库相对链接和外部链接还需另外核对。
3. 检查生成 HTML 中的标题、代码块、表格、链接及独立描述；确认 sitemap 和 canonical 仍指向正式站点。
4. README 同步检查中英文，保持「标题 → 徽章 → 语言 → 介绍 → 接入入口 → 能力 → 接入要求与安装」；安装后的限制与进阶指南放在后续对应章节。

文案调整不需要另建镜像单测；交互或样式变化再按下方视觉检查验收。历史文章与版本审查保留当时的证据，不批量替换其中的旧版本号。

## 视觉主题维护

全站配色、字体、间距和组件样式由 `.vitepress/theme/custom.css` 维护，浅色与深色共用语义变量。使用系统字体，不依赖外部字体服务。文档导航、搜索、代码复制和手机菜单沿用 VitePress 默认主题的行为。

导航与 favicon 共用 `public/logo.png`。保留原始人物图形；导航通过 CSS 设置尺寸、留白和浅色底座，在两个主题中保持黑色人物与浅色背景的对比，不对整张图片反色或裁剪。

首页内容维护在 `index.md`；首屏的排查流程示意由 `.vitepress/theme/components/HomeHero.vue` 渲染，经主题入口注册。示意不展示实际客户数据或虚构监控指标。调整首页时保留页面标题、描述、有效的入口链接及已有安装锚点。

样式变更需构建并检查桌面／手机、浅色／深色与键盘操作；检查代码和表格的横向滚动，不用隐藏全页溢出掩盖布局问题。自定义交互应保留可见焦点，并尊重减少动画的系统设置。

## SEO 配置与效果观察

正式站点地址为 `https://sentry-miniapp.pages.dev/`。VitePress 在构建时生成 `sitemap.xml`，各页面的 canonical 指向正式站点，`public/robots.txt` 提供 sitemap 地址。更换域名时，同时更新 `.vitepress/config.mts` 的 `SITE_URL` 与 `public/robots.txt`；PR 预览继续指向正式站点，避免产生另一组规范网址。

页面标题和独立描述由 Markdown frontmatter 的 `title` / `description` 维护。标题说明用户要解决的问题，开头直接回答接入或排障要点，正文链接到下一步需要的指南；内容必须与实际支持范围一致。

站点所有权通过 `.vitepress/config.mts` 的 `head` 中的 `google-site-verification` meta 标签验证。该标签来自 Google Search Console，需要原样保留并持续部署；删除或替换会影响所有者的验证状态。Cloudflare Pages 会将 `.html` 地址重定向到无扩展路径，Google 的文件验证不跟踪重定向，因此本站使用首页 HTML 标签验证。更换验证账号时，先为新账号完成独立验证，再处理旧账号的验证标签。

首轮 SEO 优化于 **2026-10-11** 上线，范围见 [PR #507](https://github.com/lizhiyao/sentry-miniapp/pull/507)。Search Console 资源也从这一天开始配置；若没有既有历史数据，先将首个完整两周作为基线，再与后续等长时间比较曝光、点击、点击率和搜索词变化。

通过 [Google Search Console](https://search.google.com/search-console) 查看搜索流量：

1. 添加网址前缀资源 `https://sentry-miniapp.pages.dev/` 并验证所有权。在「HTML 标签」中获取验证 meta，加到站点 `head` 后部署，在正式首页源码中确认标签存在，再返回 Search Console 点击验证。域名资源需要 DNS 权限，当前 `pages.dev` 地址使用网址前缀资源即可。
2. 在「站点地图」提交 `sitemap.xml`，在「网址检查」核对首页和重点页面的收录状态。提交 sitemap 帮助搜索引擎发现页面，不代表已经收录。
3. 以本次优化上线日期为分界，在「效果 → 搜索结果」每两周比较一段完整时间与上一段等长时间。记录曝光、点击、点击率，并按「网页」筛选 `/guide/taro`、`/guide/uniapp`、`/guide/sourcemap-advanced`、`/guide/faq`，查看各页对应的实际搜索词。
4. 新资源没有历史数据时，从添加资源后开始积累基线；留出数周观察，避免用单日波动判断效果。把真实接入反馈、示例使用或企业联系与搜索指标一起记录，点击本身不能证明 SDK 已被采用。

验证方式见 [Google 所有权验证说明](https://support.google.com/webmasters/answer/9008080?hl=zh-Hans)，托管路由行为见 [Cloudflare Pages 路由规则](https://developers.cloudflare.com/pages/configuration/serving-pages/)，指标与筛选方法见 [Search Console 效果报告](https://support.google.com/webmasters/answer/7576553?hl=zh-Hans)。

### 全站访问统计

通过 Cloudflare Web Analytics 观察到站访问量、来源、热门页面及加载体验；Search Console 用于查看 Google 搜索中的曝光、点击和搜索词。其它搜索引擎的搜索表现需在各自站长工具中查看。

Cloudflare Pages 的统计接入和核验步骤如下：

1. 在 Cloudflare 控制台进入「Workers & Pages → sentry-miniapp → Metrics」，在「Web Analytics」启用统计。
2. 重新部署正式站点。Pages 从下一次部署开始自动插入统计脚本，无需在 VitePress 配置中再添加同一脚本。
3. 检查正式页面中只加载一次 Cloudflare beacon，浏览器网络面板中能看到统计请求成功；通过站内链接切换页面，确认新路径也被统计。Cloudflare beacon 默认支持单页应用导航，不额外添加路由上报。
4. 进入「Web Analytics」，选择本站，查看访问量和页面浏览量，按来源及路径筛选；若统计包含预览域名，使用 Host 筛选 `sentry-miniapp.pages.dev`，避免把 PR 预览访问计入正式站点。

本站于 **2026-10-11** 在 Pages 项目中启用 Web Analytics。统计基线从启用后的首次正式部署、脚本加载和上报核验通过后开始计算；控制台开关开启并不代表已部署的页面已经开始上报。

每两周记录一段完整时间的 Visits、Page views、主要来源和热门页面，并关注上文四个重点指南的访问变化。Visits 是从外部来源或直接链接进入网站的访问次数，一次访问可以浏览多个页面；它不是去重后的用户人数。来源取决于浏览器提供的 referrer，浏览器拦截或上报失败也可能造成少报。

访问统计从启用后开始积累；若没有既有数据，以首个完整两周作为基线，再与后续等长时间比较。不要将公开搜索结果数量、上线后的首日访问量或本次验证访问当作优化前的流量。

配置和部署要求见 [Pages 统计接入](https://developers.cloudflare.com/pages/how-to/web-analytics/)，指标口径见 [Cloudflare 高层指标](https://developers.cloudflare.com/web-analytics/data-metrics/high-level-metrics/)，页面切换支持见 [单页应用统计](https://developers.cloudflare.com/web-analytics/get-started/web-analytics-spa/)。

## 部署（Cloudflare Pages）

在 Cloudflare Pages 控制台「连接到 Git」选择本仓库，按如下设置（构建跑在仓库根、用 Yarn 4，与 SDK 完全一致，无 subdir / 包管理器特例）：

| 配置项 | 值 |
|--------|----|
| Root directory（根目录） | `/`（留空即根） |
| Build command（构建命令） | `yarn run docs:build` |
| Build output directory（输出目录） | `website/.vitepress/dist` |

之后每次 push 到 `master` 自动构建发布，PR 自带预览地址。默认地址形如 `https://<项目名>.pages.dev`，可在 Cloudflare 后续绑定自定义域名。

> 站点 `base` 为 `/`（Cloudflare 根域）。若改用 GitHub Pages（子路径 `/sentry-miniapp/`），需把 `.vitepress/config.mts` 的 `base` 改为 `'/sentry-miniapp/'`。
