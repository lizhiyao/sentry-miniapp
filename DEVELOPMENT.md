# Sentry Miniapp SDK 开发指南

本文档介绍如何在开发过程中构建、测试和调试 `sentry-miniapp` SDK。

理解模块职责、数据流、生命周期约束和 Core 扩展取舍，请先阅读 [架构文档](ARCHITECTURE.md)。

## 🚀 快速开始

### 0. 环境要求

- **Node.js**：本仓库开发使用 20.x ≥ 20.19、22.x ≥ 22.13 或 ≥ 24。这是当前 Vite、Vitest、ESLint 与 Core 的共同要求；CI 使用 20.x、22.x、24.x。发布包的 `engines.node` 只声明 SDK 与 Core 的运行依赖范围，不能代替开发工具要求。
- **Yarn 4**：项目通过 `package.json` 的 `packageManager` 字段固定 Yarn 版本，推荐用 [Corepack](https://nodejs.org/api/corepack.html) 自动对齐，无需全局手动安装：

  ```bash
  corepack enable   # 启用后，仓库内执行 yarn 会自动使用固定的 Yarn 4 版本
  ```

### 1. 安装依赖

```bash
yarn install
```

### 2. 开发与构建命令

| 命令 | 说明 |
|------|------|
| `yarn dev` | 监听源码并持续构建标准 ESM/CJS/UMD 产物 |
| `yarn build` | 构建标准 ESM/CJS/UMD 产物与类型声明，并检查 npm 包入口、七平台消费与自请求递归 |
| `yarn build:miniapp` | 构建微信示例使用的独立 CommonJS bundle，并执行兼容性与加载检查 |
| `yarn dev:miniapp` | 监听源码并持续构建微信示例 bundle |
| `yarn build:types` | 先构建运行时代码，再生成类型定义文件（d.ts） |
| `yarn test` | 运行单元测试（Vitest） |
| `yarn test:coverage` | 运行单元测试并检查覆盖率门槛 |
| `yarn test:shuffle` | 随机化用例顺序，排查测试状态污染与顺序依赖 |
| `yarn lint` | 运行 ESLint 检查 |
| `yarn typecheck` | 严格检查源码与测试代码的 TypeScript 类型 |
| `yarn check:bundle-size` | 检查已构建 ESM/CJS/UMD 的原始 JS 字节预算，并报告 gzip 大小 |
| `yarn docs:dev` | 本地查看和编辑用户文档站 |
| `yarn docs:build` | 构建文档站，检查页面生成与站内文件链接 |
| `yarn docs:preview` | 预览已经构建的文档站 |

---

## 🛠 开发与调试工作流

我们提供了一个完整的微信小程序示例项目（`examples/wxapp`），用于在真实环境中验证您的代码修改。

### 语法与标准库兼容

Vite 的 ES2015 target 负责语法降级，其中 async 的降级会生成 generator；Babel 的 generator 转换因此仍是必要步骤，`check:build-output` 拒绝产物中残留的 generator／yield 和外部 Babel runtime。语法降级不补齐运行时 API；`polyfills-bootstrap` 的 core-js 按需模块负责 Core 与 SDK 使用的标准方法，URLSearchParams 通过 core-js-pure 的公开入口安装以保留宿主 fetch／Request，宿主接口仍须特性检测或降级。新增 API 前同时检查内联 Core 的调用及实际 tarball，不能仅根据 Node 单测或构建成功判断兼容。

内联依赖的完整许可证保存在 `THIRD_PARTY_NOTICES.md`，构建同时把该内容放入每个独立 JS 的声明注释，覆盖 npm 安装和单文件下载两种分发。只列实际进入运行时的第三方代码，不列整个开发依赖树；新增内联依赖时核对所安装包的 LICENSE。core-js-pure 的版本补丁保存在 `.yarn/patches/`：pure 入口提供独立查询参数回退，跳过完整 URL 和 fetch／Request／Headers 的探测与包装，并复用同库 String.prototype.toWellFormed 规范化输入。升级时在未修补版本上复核[退出条件](docs/query-runtime-decision.md#补丁范围与维护规则)，上游修复后移除对应 patch，不机械续接。实际包消费检查同时覆盖冻结 Request 原型、只读的正常查询构造器及缺少 keys() 的部分实现。

### 构建体积与共享依赖

标准构建和小程序构建都会执行 JS 体积预算检查：ESM 上限 260 KiB，CommonJS／UMD／小程序独立 bundle 上限 255 KiB。预算包含内联依赖和许可证注释，不包含 Source Map 或类型声明。超限时先核对依赖重复、可选能力与构建输出；有必要的新增能力再在同一 PR 说明成本并调整预算，不能通过 gzip 数字掩盖原始包增长。测量基线见[包体积审查](docs/bundle-size-review.md)。

两种 core-js 模式共享基础模块的构建插件锁定在已审查版本。升级依赖时同时审查源码、间接依赖和可变模块状态，复核实际包在缺失／原生／只读宿主能力下的行为，再更新插件版本守卫；不能仅更新版本字符串通过检查。

### 示例产物

`examples/wxapp/lib/` 是本地生成目录，不进入版本控制。标准 `yarn build` 只负责 npm 包产物；需要运行微信示例时，使用专用的小程序构建命令，避免日常构建产生无关的大文件 diff。

### 调试步骤

1. **启动监听**：在终端运行 `yarn dev:miniapp`。
2. **修改源码**：在 `src/` 目录下修改 TypeScript 代码。保存后会自动重新生成 `examples/wxapp/lib/sentry-miniapp.js` 与 Source Map。
3. **微信开发者工具**：
   - 打开微信开发者工具，导入 `examples/wxapp` 目录。
   - 每次代码保存后，开发者工具会自动热更新。
   - 开发版本默认开启了 **Source Map**，您可以在开发者工具的 Sources 面板中直接对 TS 源码打断点调试。
4. **Console 调试**：您也可以在源码中临时添加 `console.log('🐛 [DEBUG]', data)` 来快速验证。

---

## 📁 核心目录结构

```text
sentry-miniapp/
├── src/                          # 核心源码目录
│   ├── index.ts                  # SDK 主入口
│   ├── client.ts                 # Core Client 与宿主资源边界适配
│   ├── integrations/             # 宿主异常、请求、页面、会话和性能采集
│   └── transports/               # 宿主请求、同意门与离线存储适配
├── test/                         # 单元测试（Vitest）
├── examples/wxapp/               # 用于调试的微信小程序示例
│   ├── lib/                      # [自动生成] SDK 构建产物目录
│   ├── app.js                    # 小程序入口，SDK 初始化处
│   └── pages/                    # 测试页面
└── package.json
```

---

## 🧪 测试和质量保证

测试数量及覆盖率以当前 CI 结果为准，验证分为：

- **单元测试 (`yarn test`，Vitest)**：覆盖核心类、工具函数与集成插件（跨端兼容性、面包屑、去重、transport 等），用 mock 的平台全局对象跑通 init → 事件构建 → transport → `wx.request` 全链路。
- **真实 core 集成测试 (`test/*.realcore.test.ts`)**：不 mock `@sentry/core`，验证事件、span/v2、logs、metrics、session 与 client reports 的最终 envelope。自定义 transport 与 envelope 解析统一复用 `test/support/`。
- **发布包消费测试 (`yarn build`)**：把当前 npm tarball 解包到隔离目录，验证 CJS / ESM / UMD 与类型入口；七个平台还会分别在全局 `URL` 缺失和残缺时安装会复制请求参数的外层 wrapper，断言一次业务请求只能产生一次 Sentry envelope，防止 SDK 自请求递归。CJS／ESM 各在独立进程中运行公开行为场景，覆盖空会话的迟到操作、冻结／只读宿主、持久缓存重放、平台信号与可选能力 getter 降级、页面业务透明性、初始化中的 scope 变化，错误事件的 IP 推断开关、被忽略 HTTP 子 span 的传播，以及 async 栈帧的路径与 Debug ID；普通会话错误统计与 setup 后异步 span 保留有效绑定作为正向对照，避免通过关闭功能掩盖缺陷。场景清单与数量以 `scripts/internal/check-package-behavior.mjs` 为准。
- **测试类型检查 (`yarn typecheck`)**：源码使用 `tsconfig.json`，测试使用 `tsconfig.test.json`；测试保留严格函数签名检查，仅放宽动态 fixture 的索引访问规则。

测试必须执行 `src/` 或仓库脚本中的生产逻辑；不要只调用测试文件里临时创建的 mock、示例重试函数或常量再断言自身行为。时间相关逻辑优先使用 Vitest fake timers，避免真实等待拖慢 CI。

`.github/workflows/framework-examples.yml` 在 SDK 源码、依赖、构建脚本、相关示例或 workflow 变化的 PR，以及每周定时和手动触发时，构建当前 SDK tarball，覆盖示例声明的发布版依赖后，先用 `scripts/internal/check-example-dependencies.mjs` 核对 override 声明的消费者实际解析版本，再执行 Taro／uni-app 的真实微信小程序构建和业务异常的原始源码内容、双向映射检查。已有安装锁可能保留旧依赖，因此不能用安装成功代替版本核对。无关改动不触发重型框架构建。

### Core 扩展边界与升级审查

当前职责边界、Core 接缝、保留原因和升级验证统一见[架构文档](ARCHITECTURE.md#7-core-的受控接缝与演进条件)。升级精确依赖前，先检查候选 Core 的签名、调用顺序、发送格式和离线行为，再运行对应真实 Core 与实际包回归，不能只依据类型检查通过。

同版本官方 SDK 的实现参考见[官方 SDK 实践](docs/sdk-official-practices.md)，查询参数兼容层的补丁退出条件见[依赖取舍](docs/query-runtime-decision.md)。按版本的审查、框架依赖记录和文章集中在[文档索引](docs/README.md)；目标设备问题请[提交缺陷反馈](https://github.com/lizhiyao/sentry-miniapp/issues/new/choose)，历史集中验收记录见 [#457（已关闭）](https://github.com/lizhiyao/sentry-miniapp/issues/457)。

在提交 Pull Request 前，请务必确保所有测试通过，且没有 Lint 错误：

```bash
yarn lint && yarn typecheck && yarn test:coverage
```

---

## 发布流程 (Maintainers Only)

`master` 是唯一长期分支。发布分为准备版本、合并候选和推送 tag 三步；合并版本号不等于 npm 已发布。

1. 从最新 `master` 创建短分支，完成 lint、类型、测试与构建检查。
2. 在 release 分支生成候选提交。先将 `RELEASE_VERSION` 设为本次选定的完整版本；beta 使用明确的预发布号：

   ```bash
   yarn run release --release-as "$RELEASE_VERSION" --skip.tag \
     --releaseCommitMessageFormat 'chore(release): 准备 {{currentTag}} 发布候选'
   ```

   工具同步 `package.json` 与 `src/version.ts` 并创建提交；`--skip.tag` 将发布触发留到候选合并后。
3. 推送分支、创建 PR，核对版本常量和 CI。release PR 使用 **merge commit** 合并，保留候选提交身份，不使用 squash。
4. 确认发布版本与候选提交后，将 `RELEASE_COMMIT_SHA` 设为该完整 SHA，并替换 `vX.Y.Z`；创建 tag 前确认这个提交已经进入 `master` 历史：

   ```bash
   git tag vX.Y.Z "$RELEASE_COMMIT_SHA"
   git push origin vX.Y.Z
   ```

5. `v*` tag 触发 `.github/workflows/publish.yml`，验证并通过 npm OIDC 发布；预发布进入 `next`，正式版进入 `latest`。成功后创建 GitHub Release，附 UMD、Source Map、tarball 与来源摘要。
6. 核对 Actions 结果、npm 版本与 dist-tag、GitHub Release 资产。不要以 tag 推送成功或版本号已合并代替发布成功。

`yarn run release` 也支持直接生成本地 tag；使用这一路径时，仍须保留 release commit、先合并 PR，再推送 tag。已发布 tag 不移动或覆盖。

Release notes 由 GitHub 根据 tag 之间的 PR 生成。PR 标题与描述应准确说明最终改动，破坏性变化、迁移方式和兼容性限制须写清楚；不另维护一份 `CHANGELOG.md`。

### npm Trusted Publishing

发布工作流不使用长期 `NPM_TOKEN`。npm 包设置中的 Trusted Publisher 必须与仓库配置精确匹配：

- Provider：GitHub Actions
- Organization or user：`lizhiyao`
- Repository：`sentry-miniapp`
- Workflow filename：`publish.yml`
- Allowed actions：`npm publish`
- Environment：不设置

`.github/workflows/publish.yml` 使用 GitHub 托管 runner，并授予 `id-token: write`。npm CLI 会用 GitHub OIDC 身份换取仅对当前 workflow 有效的短期发布凭证，并自动生成 provenance；不要重新添加 `NODE_AUTH_TOKEN` 或发布权限 token。

首次 OIDC 发版验证成功后，应在 npm 的 Publishing access 中选择 **Require two-factor authentication and disallow tokens**，删除仓库中的 `NPM_TOKEN` Secret，并撤销 npm 账户里不再使用的发布 token。若发布报 `ENEEDAUTH`，优先检查 npm Trusted Publisher 的仓库名、workflow 文件名和可执行 action 是否完全一致。

### CI/CD 超时、诊断与发布包一致性

CI 与 CD 作业上限为 25 分钟，测试进程上限为 8 分钟、最多 2 个 worker。
`scripts/internal/run-diagnosed.mjs` 持续保存测试输出，每 15 秒记录进程树、CPU/RSS、Linux 内存和 cgroup OOM 计数；超时先采样，再向进程组发送 TERM，2 秒后强制 KILL，并以 124 退出。
产物包含 `output.log`、`resources.log`、`result.json` 和正常生成的 JUnit 报告。卡死时 JUnit 可能不完整，以持续日志和退出记录为准。
CD 在测试之后立即上传一次诊断，结束时再次保存发布证据；CI 诊断保留 14 天，CD 保留 30 天。runner 丢失或平台强制取消仍可能中断上传，不能将 `always()` 当作上传成功保证。

CD 只复用本仓库 `.github/workflows/ci.yml` 在 **master push、精确发布 SHA** 上的成功运行，并核验同一 run attempt 的 `Quality (Node 24.x)`、`build-and-test (20.x)` 和 `build-and-test (22.x)` 全部成功。
不使用 PR 合并 SHA、祖先提交或最近一次成功运行代替；查询失败、运行未完成、作业缺失或 SHA 不同都会回退到 CD 的 lint、类型检查和完整单测。
现有发版流程中 tag 可能指向 merge commit 的父提交，此时正常走回退验证；不要为了复用 CI 移动已经发布的 tag。

发布阶段执行 `yarn build:release` 一次，然后 `npm pack --ignore-scripts` 生成 tarball。
验收脚本接收该 tarball，在系统临时目录用 npm 安装真实生产依赖（禁用安装脚本），检查 CJS、ESM、UMD、类型入口、七平台降级和上述公开行为场景。`check-package-behavior.mjs` 只加载安装包声明的公共入口，不导入源码或 Core 私有文件；CD 保存两种入口的逐场景 JSON 证据。PR CI 也通过 `yarn build` 执行当前 tarball 的消费检查。
CD 核对 tag、package.json、SDK_VERSION、tarball 元数据，保存提交 SHA、CI 证据、SHA-256/SHA-512 摘要和安装锁文件，并只发布验收过的 tarball，显式禁用发布生命周期脚本以避免再次构建。
同版本已经存在时仅在 registry integrity 与本次 tarball 一致时跳过发布；网络或鉴权失败不会被当成“版本不存在”。
发布成功后 GitHub Release 额外附带 tarball 和来源清单；完整诊断、CI 证据与安装记录在 Actions artifact 中。

### 消费端按需打包检查

实际安装包检查还会把基础接入与显式启用 Performance API 的 ESM 项目重新打包：基础项目不能保留未引用的 Performance API／HTTP 上下文集成，性能项目必须仍能安装和清理 observer。两者都运行异常发送与 flush 检查，并分别限制在 235／240 KiB 的原始 JS 内。探针含测试驱动代码，其数字不能直接当作任意框架项目的 SDK 增量；发布文件预算与消费端预算保护不同的打包边界。

### 默认与精简入口的构建

`yarn build:release` 先生成共享 SDK、标准方法补齐和能力检查的 ESM／CJS 文件及公开 facade，再构建独立 UMD 和类型入口。npm 入口依赖包内 `dist/internal`／`dist/chunks`，打包时须保留完整目录；独立下载使用 UMD，微信示例使用 `yarn build:miniapp` 的单文件产物。`yarn dev` 监听 npm 运行文件；`yarn dev:miniapp` 监听独立示例。

体积检查累计入口及全部静态本地依赖，不以 facade 文件大小作结论。实际包检查验证精简入口不含 core-js 运行源码、所需能力缺失时在 Core 求值前失败、同格式两个入口的身份及生命周期一致，并运行七平台发送和 ESM 消费端裁剪探针。
