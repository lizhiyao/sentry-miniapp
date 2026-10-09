# Sentry Miniapp SDK 开发指南

本文档介绍如何在开发过程中构建、测试和调试 `sentry-miniapp` SDK。

## 🚀 快速开始

### 0. 环境要求

- **Node.js** ≥ 20.19
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
| `yarn build:types` | 构建类型定义文件（d.ts） |
| `yarn test` | 运行单元测试（Vitest） |
| `yarn test:coverage` | 运行单元测试并检查覆盖率门槛 |
| `yarn test:shuffle` | 随机化用例顺序，排查测试状态污染与顺序依赖 |
| `yarn lint` | 运行 ESLint 检查 |
| `yarn typecheck` | 严格检查源码与测试代码的 TypeScript 类型 |

---

## 🛠 开发与调试工作流

我们提供了一个完整的微信小程序示例项目（`examples/wxapp`），用于在真实环境中验证您的代码修改。

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
│   ├── client.ts                 # 核心 Client 实现
│   ├── integrations/             # 各类集成模块（如 Performance, Router 等）
│   └── transports/               # 数据传输层（XHR, 离线缓存）
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
- **发布包消费测试 (`yarn build`)**：把当前 npm tarball 解包到隔离目录，验证 CJS / ESM / UMD 与类型入口；七个平台还会分别在全局 `URL` 缺失和残缺时安装会复制请求参数的外层 wrapper，断言一次业务请求只能产生一次 Sentry envelope，防止 SDK 自请求递归。
- **测试类型检查 (`yarn typecheck`)**：源码使用 `tsconfig.json`，测试使用 `tsconfig.test.json`；测试保留严格函数签名检查，仅放宽动态 fixture 的索引访问规则。

测试必须执行 `src/` 或仓库脚本中的生产逻辑；不要只调用测试文件里临时创建的 mock、示例重试函数或常量再断言自身行为。时间相关逻辑优先使用 Vitest fake timers，避免真实等待拖慢 CI。

`.github/workflows/framework-examples.yml` 在 SDK 源码、依赖、构建脚本、相关示例或 workflow 变化的 PR，以及每周定时和手动触发时，构建当前 SDK tarball，覆盖示例声明的发布版依赖后执行 Taro／uni-app 的真实微信小程序构建，并检查业务异常的原始源码内容和双向映射。无关改动不触发重型框架构建。

### core 扩展边界与升级审查

本次职责取舍、失败复现及文档一致性复核见 [core v11 收尾审查](docs/core-v11-review.md)；真机用户验证由 [#457](https://github.com/lizhiyao/sentry-miniapp/issues/457) 单独跟踪。

beta.4 发布后的小游戏 Session、系统信息降级和离线交错复核见 [发布后专项审查](docs/core-v11-postrelease-review.md)。

`coreCompat.ts` 是 `_INTERNAL_filterKeyValueData` 的唯一生产导入入口，直接重导出固定 core 的算法；不复制敏感名单或放行 fallback。键值／URL／JSON／form 的语义和最终 envelope canary 回归约束这项依赖。UTF-8 字节计数与无 TextEncoder 的编码也共用该模块，避免正文与缓存预算维护两套 Unicode 算法。

事件准备、采样、processor／beforeSend、Session 状态算法与发送仍使用 core 实现。宿主 Debug ID 同步使用公开 `preprocessEvent` hook；公共 capture 入口只保存采集时的 scope／Session，原 isolation scope 保持 core 的可写身份。`postprocessEvent` 与 beforeSend 结果绑定使用 client 自有 WeakMap，不建立按 event ID 维护的长期索引，也不向遥测 payload 增加归属字段。

`MiniappClient` 的 protected 依赖集中如下；它们不是任意 core 版本兼容的承诺。依赖升级 PR 必须检查候选 core 源码中的签名、调用顺序与实现差异，执行对应 real-core 用例，并在 PR 中记录结论；不能仅凭类型检查通过放宽依赖范围。

| 接缝 | 保留原因 | 升级时必须验证 |
| --- | --- | --- |
| `_updateSessionFromEvent` | 选择捕获时的 Session 后调用 super，不复制 core 的错误判断／状态算法 | async processor／beforeSend 替换事件、无旧 Session、显式 scope、重入与并发；`test/client-capture.realcore.test.ts` 和 `test/session.test.ts` |
| `_isClientDoneProcessing` | core 没有公开取消 processing 等待的接口；有限 core tick 之间检查 dispose | 无期限 flush／close、永不完成的 processor、预算与 timer 清理；`test/client-lifecycle.realcore.test.ts` |
| `_unhandledSessionStatus` 字段 | core 为浏览器类宿主提供的状态配置，JS 错误不表示进程崩溃 | unhandled 状态、自动终态只发送一次；`test/session.realcore.test.ts` 和 `test/session.test.ts` |

client reports 使用公开 `recordDroppedEvent` 入口累计，公开 `createClientReportEnvelope` 组装，再通过 `sendEnvelope` 进入同一 transport；不再调用 `_flushOutcomes` 或读写 core 的 `_outcomes`。报告排放由宿主同意／生命周期控制，发送前交换批次，发送 hook 新产生的 drop 留待下一次 flush。升级验证真实采样／processor／transport drop、构造期 recorder、tunnel、无 DSN、同意撤回和失败不落盘；见 `test/client-reports.realcore.test.ts`。

公开 flush 每次只调用一次 core flush，dispose 同步结束所有 SDK flush 等待，即使自定义 transport 忽略 timeout；迟到完成不能改变已经返回的结果。保留有限 processing tick，是因为 Promise.race 本身不能取消 core 的无限 timer，而反复调用公开 flush 会重复触发业务 hooks。不要用 Session 占位对象、篡改 Scope 方法或重写 core pipeline 来追求零 protected：当前公开 API 无法表达“采集时无 Session，不回落到后来的 Session”，窄 Session 选择器仍委托 core 的状态算法。

同时保留 `lastEventId()` 更新原 scope、processor 中可见 ID、drop／重入顺序、Debug ID 最终 `debug_meta` 与完整包消费检查。若 core 提供满足上述语义的公开接口，优先移除对应 protected 适配。

在提交 Pull Request 前，请务必确保所有测试通过，且没有 Lint 错误：

```bash
yarn lint && yarn typecheck && yarn test:coverage
```

---

## 📦 发布流程 (Maintainers Only)

项目已配置 GitHub Actions 自动化 CI/CD，使用 `commit-and-tag-version` 管理版本号与 tag。`master` 是受保护分支，发版提交也需要通过 PR 合入。常规发版流程如下：

1. **本地校验**：运行 `yarn lint` 和 `yarn test` 确保代码健康。
2. **创建 release 分支并生成发版提交**：从最新 `master` 创建短分支后运行 `yarn release`，该命令会自动完成以下操作：
   - 根据 Conventional Commits 更新版本号
   - 创建 Git commit 和 tag
3. **同步 SDK 版本常量**：确保 `src/version.ts` 中的 `SDK_VERSION` 与 `package.json` 版本一致（CI 测试会自动校验）。
4. **通过 PR 合入 release commit**：推送 release 分支并创建 PR。合并时使用 merge commit，保留 `vX.Y.Z` tag 指向的 release commit 进入 `master` 历史；不要 squash release PR。
5. **推送 Tag 触发发布**：

   ```bash
   git push origin vX.Y.Z
   ```

6. GitHub Actions 将自动接管构建、通过 npm Trusted Publishing（OIDC）发布到 NPM，并在发布成功后通过 `softprops/action-gh-release@v3` 创建对应的 GitHub Release。Release notes 由 GitHub 根据 tag 之间的 PR 自动生成，同时附带可直接下载的 `sentry-miniapp.umd.js` 与 Source Map。

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

仓库不再保留单独的 `CHANGELOG.md`。PR title / description 是发版说明的唯一信息源，包含 BREAKING CHANGE、迁移方式或兼容性注意事项的改动必须在 PR 描述里写清楚。

### CI/CD 超时、诊断与发布包一致性

CI 与 CD 作业上限为 25 分钟，测试进程上限为 8 分钟、最多 2 个 worker。
`scripts/internal/run-diagnosed.mjs` 持续保存测试输出，每 15 秒记录进程树、CPU/RSS、Linux 内存和 cgroup OOM 计数；超时先采样，再向进程组发送 TERM，2 秒后强制 KILL，并以 124 退出。
产物包含 `output.log`、`resources.log`、`result.json` 和正常生成的 JUnit 报告。卡死时 JUnit 可能不完整，以持续日志和退出记录为准。
CD 在测试之后立即上传一次诊断，结束时再次保存发布证据；CI 诊断保留 14 天，CD 保留 30 天。runner 丢失或平台强制取消仍可能中断上传，不能将 `always()` 当作上传成功保证。

CD 只复用本仓库 `.github/workflows/ci.yml` 在 **master push、精确发布 SHA** 上的成功运行，并核验同一 run attempt 的 `Quality (Node 24.x)`、`build-and-test (20.x)` 和 `build-and-test (22.x)` 全部成功。
不使用 PR 合并 SHA、祖先提交或最近一次成功运行代替；查询失败、运行未完成、作业缺失或 SHA 不同都会回退到 CD 的 lint、类型检查和完整单测。
现有发版流程中 tag 可能指向 merge commit 的父提交，此时正常走回退验证；不要为了复用 CI 移动已经发布的 tag。

发布阶段执行 `yarn build:release` 一次，然后 `npm pack --ignore-scripts` 生成 tarball。
验收脚本接收该 tarball，在系统临时目录用 npm 安装真实生产依赖（禁用安装脚本），检查 CJS、ESM、UMD、类型入口和七平台降级场景。原有 `yarn build` 保留本地打包消费检查。
CD 核对 tag、package.json、SDK_VERSION、tarball 元数据，保存提交 SHA、CI 证据、SHA-256/SHA-512 摘要和安装锁文件，并只发布验收过的 tarball，显式禁用发布生命周期脚本以避免再次构建。
同版本已经存在时仅在 registry integrity 与本次 tarball 一致时跳过发布；网络或鉴权失败不会被当成“版本不存在”。
发布成功后 GitHub Release 额外附带 tarball 和来源清单；完整诊断、CI 证据与安装记录在 Actions artifact 中。
