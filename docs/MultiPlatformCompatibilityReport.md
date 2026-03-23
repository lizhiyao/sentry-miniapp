# 多端小程序 Sentry SDK 兼容性调研报告

在构建多端统一的 `sentry-miniapp` SDK 时，各个小程序平台（微信、支付宝、字节跳动、百度、QQ、钉钉、快手）在全局变量、核心网络 API、生命周期异常捕获以及本地存储等方面存在差异。为了确保 SDK 的高可用性，需要对主流平台进行针对性的适配。

以下是针对各大小程序平台的兼容性调研及适配建议。

---

## 1. 平台全局对象与环境检测

在执行所有 API 之前，SDK 需要通过判断全局对象来识别当前所处的平台环境。

| 平台 | 全局对象 | 识别特征 | 备注 |
| :--- | :--- | :--- | :--- |
| **微信小程序/小游戏** | `wx` | `typeof wx !== 'undefined'` | 市场占有率最高，API 事实上的标准 |
| **支付宝小程序** | `my` | `typeof my !== 'undefined'` | 独立于微信体系，API 命名有明显差异 |
| **字节跳动小程序** | `tt` | `typeof tt !== 'undefined'` | 包括抖音、今日头条等，API 高度模仿微信 |
| **百度智能小程序** | `swan` | `typeof swan !== 'undefined'` | API 高度模仿微信 |
| **QQ 小程序** | `qq` | `typeof qq !== 'undefined'` | API 高度模仿微信 |
| **钉钉小程序** | `dd` | `typeof dd !== 'undefined'` | 阿里系，API 介于微信和支付宝之间 |
| **快手小程序** | `ks` | `typeof ks !== 'undefined'` | 相对较新，API 模仿微信 |
| **京东小程序** | `swan` (旧) / `jd` | 视容器而定 | 通常复用百度或微信标准 |

**适配策略：**
目前 `sentry-miniapp` 在 `src/crossPlatform.ts` 中的 `getSDK()` 和 `getAppName()` 已基本覆盖前 6 种主流平台，建议后续可以按需补充 `ks` (快手)。

---

## 2. 核心网络请求 API 差异 (Transport 适配)

Sentry 需要通过网络请求将 Event 数据上报。各平台的请求 API 在命名、入参（Headers）及出参（Status Code）上存在差异。

| 平台 | 请求 API | 请求头字段名 | 响应状态码字段名 | 响应头字段名 |
| :--- | :--- | :--- | :--- | :--- |
| **微信/字节/百度/QQ/快手** | `[全局].request` | `header` | `statusCode` | `header` |
| **支付宝** | `my.httpRequest` | `headers` | `status` | `headers` |
| **钉钉** | `dd.httpRequest` | `headers` | `status` | `headers` |

**适配策略：**
*   **方法映射**：在初始化 SDK 时，将 `my.httpRequest` 或 `dd.httpRequest` 统一代理/映射到标准的 `request` 方法。
*   **入参抹平**：在调用时同时传入 `header` 和 `headers`，以兼容不同平台的底层实现。
*   **出参抹平**：在 `success` 回调中，优先取 `res.statusCode`，若不存在则取 `res.status`；响应头同理取 `res.header || res.headers`。*(注：在最新的 PR 中，支付宝的适配已完成此部分)*。

---

## 3. 全局异常与生命周期监听 (GlobalHandlers 适配)

SDK 的核心功能是自动捕获未处理的异常。各大平台提供的异常监听 API 覆盖度不同。

| 平台 | JS 错误监听 | Promise Rejection 监听 | 页面找不到监听 | 内存警告监听 |
| :--- | :--- | :--- | :--- | :--- |
| **微信** | `wx.onError` | `wx.onUnhandledRejection` | `wx.onPageNotFound` | `wx.onMemoryWarning` |
| **支付宝** | `my.onError` | `my.onUnhandledRejection` | `my.onPageNotFound` | `my.onMemoryWarning` |
| **字节跳动** | `tt.onError` | `tt.onUnhandledRejection` | `tt.onPageNotFound` | `tt.onMemoryWarning` |
| **百度** | `swan.onError` | `swan.onUnhandledRejection` | `swan.onPageNotFound` | `swan.onMemoryWarning` |
| **QQ** | `qq.onError` | `qq.onUnhandledRejection` | `qq.onPageNotFound` | `qq.onMemoryWarning` |
| **钉钉** | `dd.onError` | `dd.onUnhandledRejection` | 支持度有限 | 支持度有限 |

**适配策略：**
*   大多数平台紧跟微信规范，API 命名完全一致。
*   在 `globalhandlers.ts` 的实现中，必须采用**防御性编程**：`if (sdk().onError) { sdk().onError(...) }`。只要当前平台的对象中不存在该方法，就安全跳过，防止抛出 `undefined is not a function`。

---

## 4. 设备与系统信息 API (Context/Device 适配)

Sentry Event 中的 `contexts.device` 和 `contexts.os` 极度依赖平台提供的系统信息。

| 平台 | 系统信息 API | 基础字段 (brand/model) | 系统版本字段 (OS) | 基础库版本字段 | 备注 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **微信** | `wx.getSystemInfoSync` | 支持 | `system` | `SDKVersion` | 微信正在推行细分的 `getDeviceInfo` 等新 API |
| **支付宝** | `my.getSystemInfoSync` | 支持 | `system` | `version` (注意无 SDKVersion) | 需特殊映射基础库版本 |
| **字节跳动** | `tt.getSystemInfoSync` | 支持 | `system` | `SDKVersion` |
| **百度** | `swan.getSystemInfoSync` | 支持 | `system` | `SDKVersion` |
| **钉钉** | `dd.getSystemInfoSync` | 支持 | `system` | `version` |

**适配策略：**
*   在 `crossPlatform.ts` 中优先使用微信新的细分 API（如 `getAppBaseInfo`、`getDeviceInfo`），若无则降级使用通用的 `getSystemInfoSync`。
*   需要针对支付宝和钉钉，将返回值中的 `version` 手动映射给 `SDKVersion`，以保证 Sentry 后台的数据格式统一。

---

## 5. 本地存储 API (Offline Cache 适配)

为了实现离线缓存，我们需要使用本地存储。

| 平台 | 同步设置缓存 API | 同步获取缓存 API | 存储结构差异 |
| :--- | :--- | :--- | :--- |
| **微信/字节/百度/QQ** | `setStorageSync(k, v)` | `getStorageSync(k)` | `v` 可以是对象或字符串，返回直接是值 |
| **支付宝** | `setStorageSync({key, data})` | `getStorageSync({key})` | **传参方式完全不同**，且返回值是 `{data: ...}` 对象 |
| **钉钉** | `setStorageSync({key, data})` | `getStorageSync({key})` | 与支付宝一致 |

**✅ 已适配：**
`crossPlatform.ts` 中已针对支付宝/钉钉的 Storage API 进行了包装，自动将 `setStorageSync(key, value)` 和 `getStorageSync(key)` 的微信风格调用转换为支付宝/钉钉的对象传参形式 `setStorageSync({key, data})` / `getStorageSync({key})`，`offlineStore.ts` 通过 `sdk()` 调用即可无感兼容。

---

## 6. 路由与页面栈 (Router Integration 适配)

Sentry 的路由集成用于收集用户的页面跳转路径。

| 平台 | 路由栈 API |
| :--- | :--- |
| **全部平台** | `getCurrentPages()` |

**适配策略：**
`getCurrentPages()` 是小程序跨端最为统一的 API 之一。目前基于拦截 `wx.navigateTo`、`wx.redirectTo` 等方法的路由集成在各大平台基本通用，因为即使是支付宝，其路由跳转方法的命名（如 `my.navigateTo`）也与微信一致。

---

## 总结与建议优先级

综上所述，如果希望 `sentry-miniapp` 能够宣称“**全面支持多端小程序**”，我们需要按以下优先级推进：

1.  **[P0 - 阻断性] 修复 Storage API 的多端差异**：目前刚合并的离线缓存功能在支付宝/钉钉下会因为 API 传参不同而报错，必须立即在 `crossPlatform.ts` 中进行抹平。
2.  **[P1 - 数据准确性] 系统信息字段映射**：补全支付宝/钉钉中缺失的 `SDKVersion` 映射（已在当前分支初步处理）。
3.  **[P2 - 功能完备性] 扩展平台判断**：在 `getAppName()` 中考虑加入 `ks` (快手) 等新兴平台。
4.  **[P3 - 测试覆盖] 多端测试用例**：在 `jest` 中模拟 `my`、`tt` 的专属返回结构，确保核心逻辑（如请求和存储）不崩溃。