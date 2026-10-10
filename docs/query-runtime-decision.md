# 查询参数运行时的依赖取舍

本文面向维护者，说明为何 `URLSearchParams` 采用固定版本的 core-js-pure，以及补丁的范围与退出条件。用户接入不需要配置这些构建依赖。

## Core 接缝与宿主职责

固定的 Core 11.4.0 在三个入口直接读取全局 `URLSearchParams`：

- [envelope 鉴权地址](https://github.com/getsentry/sentry-javascript/blob/11.4.0/packages/core/src/api.ts)：由 record 生成查询字符串。
- [请求数据规范化](https://github.com/getsentry/sentry-javascript/blob/11.4.0/packages/core/src/integrations/requestdata.ts)：由 pair 序列生成查询字符串。
- [查询参数过滤](https://github.com/getsentry/sentry-javascript/blob/11.4.0/packages/core/src/utils/data-collection/filterQueryParams.ts)：解码参数名称，保留原编码、顺序和重复键。

Core 没有公开的查询参数构造器注入接缝。只设置 tunnel 可以绕开鉴权地址构造，不能补齐数据规范化和过滤；自行复制 endpoint 或过滤算法也会扩大 Core 升级时需要维护的实现范围。

SDK 在 `coreCompat.ensureURLSearchParams` 中独立检查这三种输入，以及 Unicode／非法 UTF-8 的转换结果。可用的宿主构造器保持原身份，即使没有完整 `URL` 或构造器属性不可改写。该检测只验证能力，不实现解析、编码或迭代算法。缺失或不完整时安装依赖的回退构造器。不会补完整 URL，也不会包装 fetch／Request／Headers。

## 官方 SDK 提供的参考

[Browser 11.4.0 的入口](https://github.com/getsentry/sentry-javascript/blob/11.4.0/packages/browser/src/sdk.ts)直接装配 Core、集成和浏览器 transport，没有内置 URLSearchParams polyfill；它依赖受支持浏览器的运行时基线。这有助于界定兼容责任，但小程序的原生 API 集合不满足同一基线。

[React Native 的初始化](https://github.com/getsentry/sentry-react-native/blob/acb853d07583d2b61b42060113a943a818603c67/packages/core/src/js/sdk.tsx)使用 Core 的公开 encoder 接缝提供编码回退，没有自行安装 URLSearchParams。该参考提交的 SDK 是 8.30.0，Core 为 10.76.0，不能将其宿主能力假设当作 Core v11 小程序的验收证据。可吸取的实践是：遥测算法交给 Core，编码和标准 API 的可用性在宿主边界处理。

## 候选实现复核

下表是 2026-10-11 对实际发布包和本 SDK 运行时约束的复核，结论不代表对各库全部功能的评估。

| 候选 | 复核结果 | 取舍 |
| --- | --- | --- |
| core-js-pure 3.50.0 原包 | 缺少 URL 时会进入 Request 包装分支并写原型；冻结原型导致导入失败。record 和原始查询字符串的孤立 surrogate 保留原值 | 必须隔离无关宿主操作并补齐 USVString 转换 |
| [@ungap/url-search-params 0.2.2](https://github.com/ungap/url-search-params) | 非法 UTF-8 可能抛 URIError，iterator 使用快照；不完整 pair 和 Symbol 值的拒绝与标准行为不同 | 直接替换会退回已经修复的输入／迭代问题 |
| [whatwg-url-minimum 0.2.0](https://github.com/expo/whatwg-url-minimum) | 本次探针中 record／字符串保留孤立 surrogate，接受 Symbol 值，混合非法 UTF-8 百分号序列解码与原生不同 | 零依赖有吸引力，但暂不能直接替换 |
| [whatwg-url 17.2.0](https://github.com/jsdom/whatwg-url) | 包要求 Node 22.14／24 以上，带 Web IDL、IDNA 和字节库；查询编解码路径也使用 TextEncoder／TextDecoder | 完整实现适合其目标环境，当前小程序缺失能力和开发 Node 20 基线需要额外适配 |
| [react-native-url-polyfill 4.0.0](https://github.com/charpeni/react-native-url-polyfill) | URLSearchParams 由 URL 模块导出，模块引入 React Native 的 NativeModules | 不能将 React Native 专用宿主依赖直接移入小程序 SDK |

行为对照使用同一组输入：`{ key: '\ud800' }` 与 `'key=\ud800'` 的 get 结果应为 U+FFFD；Symbol 值应抛 TypeError；`'key=%ED%A0%80%E4%B8%41%C2%C2%A9'` 解码应为 `'����A�©'`；迭代中删除下一条再修改后一条，应读取当前后一条。这些差异通过独立进程加载候选发布包检查，并非从 README 的功能列表推断。

同版本 core-js-pure 加最小补丁是当前保留行为和跨端边界的选择；无需重新维护编解码器、迭代器或引入完整浏览器请求模型。没有本地补丁本身不能证明方案更可靠。

## 补丁范围与维护规则

补丁只有两类职责，源码在 [.yarn/patches](../.yarn/patches/core-js-pure-npm-3.50.0-ef4916a342.patch)：

1. pure 模式始终提供独立的回退构造器，不探测完整 URL，也不读取或包装 fetch／Request／Headers。宿主能力选择由 SDK 完成，避免无关原型改写、getter 触发及把缺少 keys() 的原生构造器误当回退。
2. 输入使用同库 ToString 后接公开 toWellFormed，完成 USVString 转换；保留 null／undefined 值的字符串转换和 Symbol 拒绝。解析、百分号编解码、排序和迭代仍由上游实现。

补丁是有退出条件的依赖适配，不是长期分叉。升级时先在**未修补的新版本**上检查下面的行为，再决定保留哪部分；上游修复一项就删除对应 patch，不为保持 diff 而重新套用：

- 缺少 URLSearchParams 且 Request 原型冻结时，导入成功；fetch／Request 的身份及 Request.prototype.constructor 不变。
- fetch／Request／Headers 的不可读 getter 不被访问。
- 没有完整 URL 时仍保留可用的原生查询构造器；完整 URL 可用但查询构造器缺少 keys() 时能够独立回退。
- record、pair 和字符串的孤立 surrogate 转为 U+FFFD，null／undefined 值保留字符串语义，Symbol 拒绝。
- 非法百分号编码、重复键、live iterator 和回调 receiver 保持已验证行为。

这些边界由[实际安装包消费检查](../scripts/internal/check-package-consumers.mjs)约束，覆盖 CJS／ESM、七个平台和独立 UMD；[启动测试](../test/polyfills.test.ts)验证 SDK 装配和宿主能力选择。immutable 安装也保证补丁与固定版本一致。若候选库无需源码补丁且通过相同边界，再结合实际包体积和宿主依赖考虑替换；不预先承诺任意 Web IDL 输入或完整 ES5 引擎支持。

修补的 pure 包仅作为本 SDK 构建时的 URLSearchParams 回退来源，不用于完整 URL 或其它浏览器 API。代码内联到 SDK 产物，消费项目无需安装该包或应用 Yarn patch。
