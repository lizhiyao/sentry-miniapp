# Source Map 进阶与排障

本页处理普通上传流程之外的问题。尚未完成基础配置时，请先按 [Source Map 上线指南](/guide/sourcemap)生成、上传并验证一组 `.js` + `.map`。

## 本地 Source Map Doctor

包内提供静态体检命令。它不会登录 Sentry、不会上传或修改文件，只检查本地产物是否具备上传条件。

```bash
npx -p sentry-miniapp sentry-miniapp-sourcemap-doctor \
  --dist ./dist \
  --release "my-miniapp@1.0.0"
```

Doctor 会检查：

- 构建目录是否同时存在运行时 `.js` 和 `.map`；
- `sourceMappingURL` 是否断链，或是否为合理的 hidden source map；
- map 是否为合法 JSON，是否包含 `sources`、`mappings` 和完整 `sourcesContent`；
- 按 `--url-prefix` 推导的 artifact 是否符合默认 `app:///` 路径；
- 是否提供 release，并提醒与 `Sentry.init({ release })` 保持一致。

CI 中建议开启严格模式：

```bash
npx -p sentry-miniapp sentry-miniapp-sourcemap-doctor \
  --dist ./dist \
  --release "$SENTRY_RELEASE" \
  --strict
```

提交 Issue 或为 CI 留档时可加 `--json`。Doctor 默认忽略 `.d.ts.map`，只检查需要上传的运行时 artifact。

## 先按现象选择排查路径

| 事件中的表现 | 优先检查 |
|--------------|----------|
| `filename` 是分页文件，但显示压缩代码 | release、artifact 名称、JS/map 是否成对、sourcesContent |
| `filename` 是 `app:///appservice.app.js` | 微信真机两层 Source Map |
| filename 使用 `chunks://`、`assets/` 或私有协议 | 平台路径与上传 artifact 结构 |
| 事件有 `debug_meta` 但仍未解析 | Debug ID 是否注入到最终发布的 JS、对应 bundle 是否上传 |
| 堆栈本身就缺少 filename / 行列 | 自定义 `stackParser` 或运行时堆栈能力 |

## 平台路径差异

### 微信小程序

尽量让 Webpack / Vite 完成转译和压缩，并关闭微信开发者工具中会再次改变 JS 行列号的编译选项。SDK 会剥离 `appservice/`、`app-service/` 和 `WAService/` 等虚拟前缀。

真机可能把逻辑层合并为 `appservice.app.js`。这不是路径前缀问题，需按下一节处理。

### 支付宝、字节、百度与其它平台

- 支付宝的 `https://appx/` 会归一为 `app:///`；
- 字节小程序 / 抖音小游戏的 `tt://` 会被剥离；
- 百度的 `swan://` 会被剥离；
- QQ、钉钉、快手等协议前缀也会归一化。

抖音小游戏接入 Cocos 时，`chunks:///_virtual/foo.js` 和 `chunks:///assets/foo.js` 会分别变成 `app:///chunks/_virtual/foo.js` 与 `app:///chunks/assets/foo.js`。上传目录也要保留相同的 `chunks/...` 相对路径。

## 微信真机的两层 Source Map

Taro / uni-app 项目在微信真机上常见这样的堆栈：

```text
app:///appservice.app.js:123456:78
```

框架构建产物却是 `app.js`、`vendors.js` 和 `pages/*/index.js`。此时上传分页 map 无法解析，因为真机执行文件与上传 artifact 根本不是同一个文件。

### 为什么有两层

```text
源码 .vue / .tsx
  ↓ 框架构建 Map A
分页编译产物 JS
  ↓ 微信合并与转译 Map B
appservice.app.js
```

- 只上传 Map A：能描述分页 JS 到源码，但匹配不到 `appservice.app.js`；
- 只上传 Map B：能回到分页编译产物，但无法继续到 `.vue` / `.tsx`；
- 要还原到源码，需要把 Map B 与 Map A 离线合成。

### 1. 获取两层 map

- Map B：从微信“ We 分析 → 性能 / JS 报错 → 下载线上 Source Map”获取与体验版或线上版完全一致的 `appservice.app.js.map`；
- Map A：在 Taro / uni-app 构建中开启 Source Map，保留所有分页构建 map。

开发预览的 map 不能替代线上版本，外层 map 必须与实际发布构建一致。

### 2. 先检查能否匹配

```bash
npx -p sentry-miniapp sentry-miniapp-sourcemap-doctor \
  --wechat ./wechat/appservice.app.js.map \
  --build-maps ./dist/dev/mp-weixin \
  --strip webpack:// \
  --release "$SENTRY_RELEASE"
```

结果会列出 `matched`、`unmatched` 和 `ambiguous`。文件名对不齐时，按输出调整 `--strip` 或构建产物路径。

### 3. 合成最终 map

合成工具临时需要 `source-map`，不会增加 SDK 运行时依赖：

```bash
npx -p sentry-miniapp -p source-map sentry-miniapp-sourcemap-merge \
  --wechat ./wechat/appservice.app.js.map \
  --build-maps ./dist/dev/mp-weixin \
  --out ./merged/appservice.app.js.map \
  --strip webpack://
```

脚本优先按相对路径精确匹配，最后才按文件名兜底。多个页面都叫 `index.js` 时会标记歧义并跳过，避免静默套错 map。

### 4. 上传并验证

把合成 map 与对应的 `appservice.app.js` 按 `app:///appservice.app.js` 的名称上传。新触发一个真机错误，确认堆栈能一路还原到源码。

合成精度取两份 map 中较低的一层；个别列号可能不精确。该方案属于 best-effort，匹配效果取决于框架、打包器和版本产生的 source 名称。

相关背景见 [issue #162](https://github.com/lizhiyao/sentry-miniapp/issues/162) 与 [issue #173](https://github.com/lizhiyao/sentry-miniapp/issues/173)。

## Debug ID 与自定义 stackParser

SDK 会同步当前小程序 / 小游戏运行时可见全局对象上的 `_sentryDebugIds` 与 `_debugIds`，兼容 Debug ID 被注入到 `window`、`global`、`self` 等对象的情况。

大多数项目无需设置 `stackParser`。内置 `miniappStackParser` 已覆盖常见 V8、Safari、JavaScriptCore 以及小程序虚拟路径格式。

只有私有引擎、特殊打包器或非标准堆栈无法解析时才覆盖：

```js
import * as Sentry from 'sentry-miniapp';

Sentry.init({
  dsn: 'YOUR_DSN',
  release: 'my-game@1.0.0',
  stackParser: (stack, skipFirstLines, framesToPop) => {
    // 可先委托默认解析器，再按私有格式补充或修正 StackFrame。
    return Sentry.miniappStackParser(stack, skipFirstLines, framesToPop);
  },
});
```

`stackParser` 只负责把运行时字符串解析成 StackFrame，不会生成或上传 Source Map，也不会放宽 release / artifact 匹配要求。

## 上传成功仍无法还原

按这个顺序检查，通常比反复重传更快：

1. 在新事件原始 JSON 中确认 release、`filename`、行号和列号。
2. 用 `sentry-cli releases files <release> list` 对照 artifact 名称。
3. 确认上传的是同一次生产构建生成的 JS 与 map，并包含 `sourcesContent`。
4. 检查 `filename` 是否为 `appservice.app.js`，避免拿分页 map 匹配合并文件。
5. 使用 Sentry 的 Source Map Debug；支持时也可运行 `sentry-cli sourcemaps explain <event-id>`。
6. 上传完成后重新触发事件；Sentry 不会回溯处理旧事件。
7. 自托管 Sentry 还需检查 symbolicator、worker 与 artifact 存储是否正常。

### CI 上传失败

确认 Token 权限、`SENTRY_ORG`、`SENTRY_PROJECT`、自托管地址和网络连通性。Source Map 很大时检查 CLI 超时配置，并确认产物没有被预先 gzip。

### 安全要求

- Auth Token 只放在 CI Secret 或未入库的本地配置中；
- 上传完成后删除 `.map`，不要打进小程序包或公开托管；
- 合成 map 内含 `sourcesContent`，同样只能用于上传；
- 先上传 artifact，再发布对应构建，避免事件先于 map 到达 Sentry。

仍无法定位时，提交 Issue 时附 SDK 版本、平台、框架、事件 filename、release、Doctor JSON 输出和脱敏后的 `Sentry.getDiagnostics()`。
