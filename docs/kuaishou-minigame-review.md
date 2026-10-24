# 快手小游戏适配复核

本记录对应 2026-10-24 的源码适配。快手 API 复用现有跨端、原生共享监听、离线 transport 与小游戏 producers，不新增第二条事件或性能发送管道。

## 官方契约与实现

| 契约 | 适配与降级 |
| --- | --- |
| [新接口使用 ks，旧 kwaigame 继续有效](https://open.kuaishou.com/miniGameDocs/gameDev/start/start.html) | 两者映射到同一 kuaishou 平台标识；共存时优先 ks，不写宿主别名或复制方法。不可读入口按现有字段级守卫跳过 |
| [系统信息](https://open.kuaishou.com/miniGameDocs/gameDev/api/base/system/ks.getSystemInfo.html)中的 host.env；小程序 host 的 KUAISHOU／NEBULA 标记 | 与 wx 兼容对象共存时使用明确宿主信号，保持真实 API receiver。信息不足或冲突仍按既有候选顺序回退 |
| [官方导出指南](https://docs.qingque.cn/d/home/eZQCnNVAKcY5kmYvimRU0L7Pt?identityId=CWQPeDTxmf)说明开发者工具可生成 kwaiadapter.js，用快手 API 提供 wx 兼容对象 | 多个全局入口不等于多个真实宿主；不能仅凭 wx 存在判定微信。共存机制有官方依据，具体冲突信号仍须分别验证 |
| [request](https://open.kuaishou.com/miniGameDocs/gameDev/api/network/request/ks.request.html) 接收 data／header，响应为 statusCode／header；RequestTask.abort | 复用默认 transport、请求面包屑和追踪；域名白名单仍由应用配置 |
| [同步缓存](https://open.kuaishou.com/miniGameDocs/gameDev/api/storage/ks.setStorageSync.html)为 key-value，数据可 JSON 序列化 | 复用 typed offline store；同意前缓冲和授权后重放经真实 Core 验证，不原地修改原生 Storage |
| [启动参数](https://open.kuaishou.com/miniGameDocs/gameDev/api/base/lifecycle/ks.getLaunchOptionsSync.html)和 [onShow](https://open.kuaishou.com/miniGameDocs/gameDev/api/base/lifecycle/ks.onShow.html)使用 from／query | 冷启动 from 归入 minigame.scene，热启动 from 归入生命周期面包屑 scene；保留 scene 优先，包括数值 0，query 继续脱敏 |
| onShow／onHide 与 offShow／offHide | Session、可见性、首帧和 FPS 共用现有原生通道；无 off 时复用有界 dispatcher，退休回调不能归入新 client |
| [requestAnimationFrame 随目标帧率变化](https://open.kuaishou.com/miniGameDocs/gameDev/api/render/ks.setPreferredFramesPerSecond.html) | 首帧只测 SDK 安装到首次回调；FPS 显式启用，缺 rAF 时跳过。SDK 不改变游戏目标帧率 |
| [运行环境禁止 eval／new Function](https://open.kuaishou.com/miniGameDocs/gameDev/run/runtime-environment) | 实际包 CJS 的两个快手入口及 ESM 的两入口 × 15 种模式在 Node 禁止字符串代码生成的配置下验证 |
| [小游戏 API 目录](https://open.kuaishou.com/miniGameDocs/gameDev/api/api)未承诺全局 onError／onUnhandledRejection | 按实际能力订阅，不把小程序文档视为小游戏保证；缺少时保留手动捕获与引擎错误处理接入，不添加浏览器 window.onerror 假设 |

## 验证范围

- 现有检测、平台契约、原生 Session 与启动上下文用例扩展到快手入口；scene／from 优先关系在现有用例参数化。
- 快手小游戏使用真实 Core、默认 init 和宿主 API 契约 fixture，验证 ks、kwaigame、双入口、以及两种入口与 wx 兼容对象共存。最终请求解析回 Core envelope，检查错误、拒绝、设备与启动上下文、网络 span、首帧／FPS、Session、同意缓存、脱敏和清理。
- 缺少异常监听、rAF 或 off 时，手动事件仍发送；重新初始化不累计原生监听，dispose 后的回调不产生遥测。
- wx 兼容对象提供完整转发 API，覆盖 host 缺失／未知、wxfile 数据路径和微信 AppID 与快手信号冲突：保留已有候选顺序回退，核对默认事件标签、实际请求 receiver 和显式标签覆盖。该 fixture 验证算法边界，不代表真实引擎一定产生这些信号。
- 包消费按 globalName 选择和核对结果，使 kwaigame 不会因同名 kuaishou 平台而被 ks 场景替代；七个平台共八个宿主对象入口。

主包 CJS 实测 261962 B，相对已发布 2.2.1 增加 284 B（gzip +121 B）；沿用 256 KiB 预算，ESM、Replay 和消费端预算不变。未增加运行时依赖或公开配置。

本轮证据是官方 API 对照、本地契约及实际构建包验证；未运行快手开发者工具、Android／iOS 真机或 Sentry 后台验收，不把这些边界记为通过。PR 合并不代表新的 npm 版本已发布。
