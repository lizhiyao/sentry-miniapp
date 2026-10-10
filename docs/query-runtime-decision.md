# 查询参数运行时的依赖取舍

本文面向维护者，说明为何 `URLSearchParams` 采用固定版本的 core-js-pure，以及补丁的范围与退出条件。用户接入不需要配置这些构建依赖。

## Core 接缝与宿主职责

当前 SDK 的实际 ESM／CJS 产物包含两条读取全局 `URLSearchParams` 的 Core 11.4.0 路径：

- [envelope 鉴权地址](https://github.com/getsentry/sentry-javascript/blob/11.4.0/packages/core/src/api.ts)：由 record 生成查询字符串。
- [查询参数过滤](https://github.com/getsentry/sentry-javascript/blob/11.4.0/packages/core/src/utils/data-collection/filterQueryParams.ts)：网络 span 的 `getHttpSpanDetailsFromUrlObject` 路径解码参数名称，保留原编码、顺序和重复键。宿主缺完整 URL 时，该 URL 对象路径跳过，SDK 仍通过自身的采集策略生成属性。

Core 的[请求数据规范化集成](https://github.com/getsentry/sentry-javascript/blob/11.4.0/packages/core/src/integrations/requestdata.ts)另有 pair 序列输入，但本 SDK 没有装配或重导出该集成，实际产物也不包含它。不能用这条未使用的路径证明本项目必须增加兼容实现。

Core 没有公开的查询参数构造器注入接缝。只设置 tunnel 可以绕开鉴权地址构造，不能补齐实际使用的查询参数过滤；自行复制 endpoint 或过滤算法也会扩大 Core 升级时需要维护的实现范围。

SDK 在 `coreCompat.ensureURLSearchParams` 中只检查实际路径需要的 record 编码与字符串参数名称解码，覆盖百分号编码、`+` 空格与正常 Unicode 名称。`get()`、pair 输入和孤立 surrogate 的完整标准行为不作为宿主可用性的启动条件。满足 SDK 需求的构造器保持原身份，即使没有完整 `URL` 或属性不可改写；回退构造器的额外输入一致性另由包消费检查保护。该检测不实现解析、编码或迭代算法，也不补完整 URL 或包装 fetch／Request／Headers。

## 必要性与取舍的证据

[v1.20.4](https://github.com/lizhiyao/sentry-miniapp/blob/v1.20.4/src/polyfills.ts) 已经包含手写 URLSearchParams 回退，并非完全依靠宿主。其 [Core 10.74.0](https://github.com/getsentry/sentry-javascript/blob/10.74.0/packages/core/src/api.ts) 与当前 Core 11.4.0 的 endpoint 都使用 record 构造查询字符串；正常 DSN 鉴权与固定 SDK 名称／版本主要是 ASCII 输入。复核 v1 回退与真实 Core 11 的组合，普通 endpoint 和 `safe=a+b&token=secret&dup=1&dup=2` 的 span 查询脱敏均可正常工作。没有用户报告故障，与常见路径能够工作并不矛盾；升级 Core 本身不能证明必须替换这个回退。

改用成熟依赖的主要收益是删除重复维护的解析、编码与迭代算法。v1 回退在直接解析 `+`、非法 UTF-8 或序列化孤立 surrogate 时存在标准行为差异，但这些独立输入探针不能证明常规 SDK 上报失败。不能仅为扩大标准测试覆盖而无限增加兼容范围。

当前补丁的两类依据也须分开：宿主隔离修正的是引入 core-js-pure 后的无关 URL／请求探测与原型改写风险；USVString 修正的是回退构造器的输入行为一致性。冻结 Request 原型、不可读 getter 和只读查询构造器的结果来自模拟宿主的实际包检查，尚无对应的设备故障证据。USVString 补丁复用现有标准方法，未增加一套转换算法，也不是普通 ASCII 上报能够工作的前提。另以所有浏览器 API 均缺失的环境验证，未修补的 pure 包也能生成正常 endpoint；原型改写故障需要实际存在可调用的 Headers／Request。隔离补丁保护的是这些 API 由宿主或框架提供的组合，而非证明每个小程序都存在该故障。

因此当前方案是有维护成本的折中，不能宣称已经证明它是所有候选中的长期最优方案。保持补丁范围稳定，以实际 SDK 路径、宿主副作用、包体积和升级成本评估后续替换；无需补丁的独立查询实现若满足这些约束，应优先考虑。回退实现的额外一致性探针用于防止其行为倒退，不能独立充当增加新补丁的理由，也不能迫使替换本来满足 SDK 需求的宿主构造器。

已有全局数据属性安装回退时只更新值，保留属性约束：不可配置但可写的数据属性仍可替换；可配置的只读数据属性更新后仍保持只读。首次创建的属性可配置、可写；可配置的不可用 getter 转为可写的数据属性。如果必需方法不可用且属性同时不可配置、不可写，SDK 无法安装 Core 所需的全局能力；这类宿主须先由运行环境补齐，不能靠吞掉安装异常宣称支持。

## 官方 SDK 提供的参考

[Browser 11.4.0 的入口](https://github.com/getsentry/sentry-javascript/blob/11.4.0/packages/browser/src/sdk.ts)直接装配 Core、集成和浏览器 transport，没有内置 URLSearchParams polyfill；它依赖受支持浏览器的运行时基线。这有助于界定兼容责任，但小程序的原生 API 集合不满足同一基线。

[React Native 的初始化](https://github.com/getsentry/sentry-react-native/blob/acb853d07583d2b61b42060113a943a818603c67/packages/core/src/js/sdk.tsx)使用 Core 的公开 encoder 接缝提供编码回退，没有自行安装 URLSearchParams。该参考提交的 SDK 是 8.30.0，Core 为 10.76.0，不能将其宿主能力假设当作 Core v11 小程序的验收证据。可吸取的实践是：遥测算法交给 Core，编码和标准 API 的可用性在宿主边界处理。

## 候选实现复核

下表是 2026-10-11 对实际发布包和本 SDK 运行时约束的复核，结论不代表对各库全部功能的评估。

| 候选 | 复核结果 | 取舍 |
| --- | --- | --- |
| core-js-pure 3.50.0 原包 | 缺少 URL 且存在可调用的 Headers／Request 时，会写 Request 原型；冻结该原型导致导入失败。record 和原始查询字符串的孤立 surrogate 保留原值 | 宿主操作需要隔离；USVString 修正用于保留输入一致性 |
| [@ungap/url-search-params 0.2.2](https://github.com/ungap/url-search-params) | 非法 UTF-8 可能抛 URIError，iterator 使用快照；不完整 pair 和 Symbol 值的拒绝与标准行为不同 | 直接替换会退回已经修复的输入／迭代问题 |
| [whatwg-url-minimum 0.2.0](https://github.com/expo/whatwg-url-minimum) | 本次探针中 record／字符串保留孤立 surrogate，接受 Symbol 值，混合非法 UTF-8 百分号序列解码与原生不同 | 零依赖有吸引力，但暂不能直接替换 |
| [whatwg-url 17.2.0](https://github.com/jsdom/whatwg-url) | 包要求 Node 22.14／24 以上，带 Web IDL、IDNA 和字节库；查询编解码路径也使用 TextEncoder／TextDecoder | 完整实现适合其目标环境，当前小程序缺失能力和开发 Node 20 基线需要额外适配 |
| [react-native-url-polyfill 4.0.0](https://github.com/charpeni/react-native-url-polyfill) | URLSearchParams 由 URL 模块导出，模块引入 React Native 的 NativeModules | 不能将 React Native 专用宿主依赖直接移入小程序 SDK |

行为对照使用同一组输入：`{ key: '\ud800' }` 与 `'key=\ud800'` 的 get 结果应为 U+FFFD；Symbol 值应抛 TypeError；`'key=%ED%A0%80%E4%B8%41%C2%C2%A9'` 解码应为 `'����A�©'`；迭代中删除下一条再修改后一条，应读取当前后一条。这些差异通过独立进程加载候选发布包检查，并非从 README 的功能列表推断。

同版本 core-js-pure 加小范围补丁是当前保留行为和跨端边界的选择；无需重新维护编解码器、迭代器或引入完整浏览器请求模型。这组候选探针支持当前取舍，但没有证明所有差异都影响 SDK 上报，也没有穷尽其它可行方案。

## 补丁范围与维护规则

补丁只有两类职责，源码在 [.yarn/patches](../.yarn/patches/core-js-pure-npm-3.50.0-ef4916a342.patch)：

1. pure 模式始终提供独立的回退构造器，不探测完整 URL，也不读取或包装 fetch／Request／Headers。宿主能力选择由 SDK 完成，避免无关原型改写、getter 触发及把缺少 keys() 的原生构造器误当回退。
2. 输入使用同库 ToString 后接公开 toWellFormed，完成 USVString 转换；保留 null／undefined 值的字符串转换和 Symbol 拒绝。解析、百分号编解码、排序和迭代仍由上游实现。

补丁是有退出条件的依赖适配，不是长期分叉。升级时先在**未修补的新版本**上检查下面的行为，再决定保留哪部分；上游修复一项就删除对应 patch，不为保持 diff 而重新套用：

- 缺少 URLSearchParams 且 Request 原型冻结时，导入成功；fetch／Request 的身份及 Request.prototype.constructor 不变。
- fetch／Request／Headers 的不可读 getter 不被访问。
- 没有完整 URL 时仍保留满足 SDK 需求的查询构造器；缺少 get()／pair 输入不能触发替换。缺少必用 keys() 时能独立回退；不可配置但可写的属性能安装回退并保留约束。
- record、pair 和字符串的孤立 surrogate 转为 U+FFFD，null／undefined 值保留字符串语义，Symbol 拒绝。
- 非法百分号编码、重复键、live iterator 和回调 receiver 保持已验证行为。

这些边界由[实际安装包消费检查](../scripts/internal/check-package-consumers.mjs)约束，覆盖 CJS／ESM、七个平台和独立 UMD；[启动测试](../test/polyfills.test.ts)验证 SDK 装配和宿主能力选择。immutable 安装也保证补丁与固定版本一致。候选库先按实际 SDK 路径和宿主副作用评估，再单独评估回退输入行为、实际包体积和依赖成本；不预先承诺任意 Web IDL 输入或完整 ES5 引擎支持。

修补的 pure 包仅作为本 SDK 构建时的 URLSearchParams 回退来源，不用于完整 URL 或其它浏览器 API。代码内联到 SDK 产物，消费项目无需安装该包或应用 Yarn patch。
