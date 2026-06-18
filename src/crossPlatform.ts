// 各平台全局对象（wx/my/tt/dd/qq/swan/ks）通过下方 PLATFORMS 表 + globalThis 动态检测，
// 不再使用 ambient declare，平台清单集中在 PLATFORMS 单一来源。

/**
 * 小程序平台 SDK 接口
 */
interface SDK {
  request: Function;
  httpRequest?: Function; // 针对钉钉小程序
  getSystemInfoSync?: Function; // 已弃用，保留兼容性
  canIUse?: Function; // 检查API是否可用
  getSystemSetting?: Function; // 新 API
  getAppAuthorizeSetting?: Function; // 新 API
  getDeviceInfo?: Function; // 新 API
  getWindowInfo?: Function; // 新 API
  getAppBaseInfo?: Function; // 新 API
  onError?: Function;
  onUnhandledRejection?: Function;
  onPageNotFound?: Function;
  onMemoryWarning?: Function;
  // App / 小游戏全局生命周期（小游戏没有 App()，用全局 onShow/onHide）
  onShow?: Function;
  onHide?: Function;
  offShow?: Function;
  offHide?: Function;
  getLaunchOptionsSync?: Function;
  getAccountInfoSync?: Function;
  getUpdateManager?: Function;
  showModal?: Function;
  URLSearchParams?: Function;
  // Performance API
  getPerformance?: Function; // 获取性能管理器
  reportPerformance?: Function; // 上报性能数据
  // Storage API
  setStorageSync?: Function;
  getStorageSync?: Function;
  getStorageInfoSync?: Function;
  removeStorageSync?: Function;
  // Network Status API
  getNetworkType?: Function;
  onNetworkStatusChange?: Function;
  offNetworkStatusChange?: Function;
  // Off handlers for cleanup
  offError?: Function;
  offUnhandledRejection?: Function;
  offPageNotFound?: Function;
  offMemoryWarning?: Function;
}

/**
 * 小程序平台类型
 */
export type AppName =
  | 'wechat'
  | 'alipay'
  | 'bytedance'
  | 'dingtalk'
  | 'qq'
  | 'swan'
  | 'kuaishou'
  | 'unknown';

/**
 * 系统信息接口
 */
export interface SystemInfo {
  brand: string;
  model: string;
  pixelRatio: number;
  screenWidth: number;
  screenHeight: number;
  windowWidth: number;
  windowHeight: number;
  statusBarHeight: number;
  language: string;
  version: string;
  system: string;
  platform: string;
  fontSizeSetting: number;
  SDKVersion: string;
  benchmarkLevel?: number;
  albumAuthorized?: boolean;
  cameraAuthorized?: boolean;
  locationAuthorized?: boolean;
  microphoneAuthorized?: boolean;
  notificationAuthorized?: boolean;
  bluetoothEnabled?: boolean;
  locationEnabled?: boolean;
  wifiEnabled?: boolean;
  safeArea?: {
    left: number;
    right: number;
    top: number;
    bottom: number;
    width: number;
    height: number;
  };
}

/**
 * 判断当前运行时是否为标准浏览器环境（含 uni-app H5、Taro H5、纯 Web 等）。
 * 仅在所有小程序全局对象都未命中时作为兜底分支调用。
 */
const isBrowserRuntime = (): boolean => {
  return (
    typeof window !== 'undefined' &&
    window !== null &&
    typeof document !== 'undefined' &&
    document !== null
  );
};

/**
 * 获取跨平台的 SDK
 */
/**
 * 平台描述表：全局对象名 → 平台标识。平台检测的唯一来源，getSDK() / getAppName() /
 * isMiniappEnvironment() 均基于此。数组顺序即 first-match 优先级（多个平台全局对象
 * 共存时取靠前者），新增平台或调整优先级只需改这一处。
 */
const PLATFORMS: ReadonlyArray<{ global: string; name: AppName }> = [
  { global: 'wx', name: 'wechat' },
  { global: 'my', name: 'alipay' },
  { global: 'tt', name: 'bytedance' },
  { global: 'dd', name: 'dingtalk' },
  { global: 'qq', name: 'qq' },
  { global: 'swan', name: 'swan' },
  { global: 'ks', name: 'kuaishou' },
];

/**
 * 检测当前平台：返回首个命中的平台全局对象与标识，未命中返回 null。
 */
export const detectPlatform = (): { sdk: SDK; name: AppName } | null => {
  const g = globalThis as Record<string, unknown>;
  for (const platform of PLATFORMS) {
    const candidate = g[platform.global];
    if (typeof candidate === 'object' && candidate !== null) {
      return { sdk: candidate as SDK, name: platform.name };
    }
  }
  return null;
};

const getSDK = (): SDK => {
  const detected = detectPlatform();

  if (!detected) {
    if (isBrowserRuntime()) {
      console.warn(
        '[sentry-miniapp] 检测到当前运行在浏览器/H5 环境（如 uni-app H5、Taro H5）。\n' +
          '本 SDK 仅适配各小程序平台，不支持浏览器原生信号（window.onerror、fetch/XHR 拦截、PerformanceObserver 等）。\n' +
          '建议改用 Sentry 官方浏览器 SDK：@sentry/browser。\n' +
          '若使用 uni-app/Taro，可结合条件编译按端引入：H5 用 @sentry/browser，小程序端用 sentry-miniapp。\n' +
          '详情参考：https://docs.sentry.io/platforms/javascript/',
      );
    } else {
      console.warn('[sentry-miniapp] 未检测到已支持的小程序平台，SDK 将以降级模式运行');
    }
    // 返回带有空操作方法的默认 SDK，而非抛出异常
    return {
      request: () => {},
      httpRequest: () => {},
      getSystemInfoSync: () => ({}),
      URLSearchParams: () => {},
    };
  }

  const currentSdk = detected.sdk;

  // 支付宝小程序的网络请求 API 是 my.httpRequest
  if (detected.name === 'alipay' && !currentSdk.request && currentSdk.httpRequest) {
    currentSdk.request = currentSdk.httpRequest;
  }

  // 支付宝和钉钉的 Storage API 参数是对象形式，这里做一层抹平包装。
  // 必须幂等：getSDK() 会被 sdk()（缓存）与 computeSystemInfo()（每次重算时）分别调用，
  // 二者作用在同一个全局 SDK 对象上。若重复包装，内层会收到嵌套的 { key: { key } }，
  // 读写全部失效——直接表现为离线缓存读不出、断网事件永不补发。用标记守卫只包一次。
  const adaptable = currentSdk as SDK & { __sentryStorageAdapted?: boolean };
  if (
    (detected.name === 'alipay' || detected.name === 'dingtalk') &&
    !adaptable.__sentryStorageAdapted
  ) {
    if (currentSdk.getStorageSync) {
      const originalGet = currentSdk.getStorageSync;
      currentSdk.getStorageSync = (key: string) => {
        const res = originalGet.call(currentSdk, { key });
        return res ? res.data : null;
      };
    }
    if (currentSdk.setStorageSync) {
      const originalSet = currentSdk.setStorageSync;
      currentSdk.setStorageSync = (key: string, data: any) => {
        originalSet.call(currentSdk, { key, data });
      };
    }
    if (currentSdk.removeStorageSync) {
      const originalRemove = currentSdk.removeStorageSync;
      currentSdk.removeStorageSync = (key: string) => {
        originalRemove.call(currentSdk, { key });
      };
    }
    adaptable.__sentryStorageAdapted = true;
  }

  return currentSdk;
};

/**
 * 获取平台名称
 */
const getAppName = (): AppName => {
  return detectPlatform()?.name ?? 'unknown';
};

/**
 * 计算系统信息（优先新 API，回退旧 API）。一次会话内系统信息是静态的，
 * 故由 getSystemInfo() 记忆化包裹，避免被多处 context（client/httpcontext 等）反复重算。
 */
const computeSystemInfo = (): SystemInfo | null => {
  try {
    const currentSdk = getSDK();
    const result: any = {};
    let hasNewApi = false;

    // 1. 基础信息
    if (currentSdk.getAppBaseInfo) {
      const baseInfo = currentSdk.getAppBaseInfo();
      Object.assign(result, baseInfo);
      hasNewApi = true;
    }

    // 2. 窗口信息
    if (currentSdk.getWindowInfo) {
      const windowInfo = currentSdk.getWindowInfo();
      Object.assign(result, windowInfo);
      hasNewApi = true;
    }

    // 3. 设备信息
    if (currentSdk.getDeviceInfo) {
      const deviceInfo = currentSdk.getDeviceInfo();
      Object.assign(result, deviceInfo);
      hasNewApi = true;
    }

    // 4. 授权设置 (需要转换类型)
    if (currentSdk.getAppAuthorizeSetting) {
      const authSetting = currentSdk.getAppAuthorizeSetting();
      result.albumAuthorized = authSetting.albumAuthorized === 'authorized';
      result.cameraAuthorized = authSetting.cameraAuthorized === 'authorized';
      result.locationAuthorized = authSetting.locationAuthorized === 'authorized';
      result.microphoneAuthorized = authSetting.microphoneAuthorized === 'authorized';
      result.notificationAuthorized = authSetting.notificationAuthorized === 'authorized';
    }

    // 5. 系统设置
    if (currentSdk.getSystemSetting) {
      const sysSetting = currentSdk.getSystemSetting();
      Object.assign(result, sysSetting);
    }

    // 如果成功获取了主要信息，则返回结果
    if (hasNewApi) {
      return result as SystemInfo;
    }

    // 兜底使用旧的 API（已弃用但保持兼容性）
    if (currentSdk.getSystemInfoSync) {
      const syncInfo = currentSdk.getSystemInfoSync();
      // 支付宝小程序等平台，版本信息可能叫 version 而不是 SDKVersion
      if (!syncInfo.SDKVersion && syncInfo.version) {
        syncInfo.SDKVersion = syncInfo.version;
      }
      return syncInfo as SystemInfo;
    }

    return null;
  } catch (error) {
    console.warn('[sentry-miniapp] Failed to get system info:', error);
    return null;
  }
};

// 系统信息记忆化：成功结果在一次会话内静态，故缓存避免每事件重算。
// 但结果为 null（平台 API 未就绪 / 偶发异常）时**不缓存**，下次调用重试——否则一次瞬时
// 失败会把整个会话的 device/os/app context 永久毒化为 unknown（生产无 resetPlatformCache）。
let _systemInfo: SystemInfo | null = null;
const getSystemInfo = (): SystemInfo | null => {
  if (_systemInfo === null) {
    _systemInfo = computeSystemInfo();
  }
  return _systemInfo;
};

/**
 * 检查是否在小程序环境中
 */
const isMiniappEnvironment = (): boolean => {
  return getAppName() !== 'unknown';
};

// 懒加载 SDK 和 appName，避免在模块导入时就执行平台检测
export let _sdk: SDK | null = null;
let _appName: string | null = null;

export const sdk = (): SDK => {
  if (_sdk === null) {
    _sdk = getSDK();
  }
  return _sdk;
};

export const appName = (): string => {
  if (_appName === null) {
    _appName = getAppName();
  }
  return _appName;
};

// 小游戏环境检测缓存
let _isMinigame: boolean | null = null;

/**
 * 判断当前是否运行在「小游戏」环境（微信小游戏 / 抖音小游戏 / QQ 小游戏等）。
 *
 * 小游戏与小程序的运行时差异：小游戏没有 App()/Page()/getCurrentPages() 等
 * 页面与路由构造函数，但同样存在平台 sdk（wx/tt/qq…）。因此判定规则为：
 * 检测到平台 sdk，且不存在 App/Page/getCurrentPages，或存在全局 GameGlobal。
 */
export const isMinigame = (): boolean => {
  if (_isMinigame === null) {
    const g = globalThis as any;
    const hasGameGlobal = typeof g.GameGlobal !== 'undefined';
    const lacksMiniprogramHost =
      typeof g.App !== 'function' &&
      typeof g.Page !== 'function' &&
      typeof g.getCurrentPages !== 'function';
    _isMinigame = isMiniappEnvironment() && (hasGameGlobal || lacksMiniprogramHost);
  }
  return _isMinigame;
};

/** 统一重置平台检测相关缓存（_sdk / _appName / _isMinigame），仅供测试使用。 */
export const resetPlatformCache = (): void => {
  _sdk = null;
  _appName = null;
  _isMinigame = null;
  _systemInfo = null;
};

/**
 * 性能指标类型
 */
export interface PerformanceEntry {
  name: string;
  entryType: string;
  startTime: number;
  duration: number;
}

/**
 * 导航性能指标
 */
export interface NavigationPerformanceEntry extends PerformanceEntry {
  entryType: 'navigation';
  // 小程序启动相关
  appLaunchTime?: number;
  pageReadyTime?: number;
  firstRenderTime?: number;
  // 页面导航相关
  navigationStart?: number;
  navigationEnd?: number;
  loadEventStart?: number;
  loadEventEnd?: number;
}

/**
 * 渲染性能指标
 */
export interface RenderPerformanceEntry extends PerformanceEntry {
  entryType: 'render';
  // 渲染相关
  renderStart?: number;
  renderEnd?: number;
  // 脚本执行
  scriptStart?: number;
  scriptEnd?: number;
}

/**
 * 资源加载性能指标
 */
export interface ResourcePerformanceEntry extends PerformanceEntry {
  entryType: 'resource';
  // 资源类型
  initiatorType?: string;
  // 网络时序
  fetchStart?: number;
  domainLookupStart?: number;
  domainLookupEnd?: number;
  connectStart?: number;
  connectEnd?: number;
  requestStart?: number;
  responseStart?: number;
  responseEnd?: number;
  // 资源大小
  transferSize?: number;
  encodedBodySize?: number;
  decodedBodySize?: number;
}

/**
 * 用户交互性能指标
 */
export interface UserTimingPerformanceEntry extends PerformanceEntry {
  entryType: 'measure' | 'mark';
  detail?: any;
}

/**
 * Performance Observer 回调
 */
export interface PerformanceObserverCallback {
  (entries: PerformanceEntry[]): void;
}

/**
 * Performance API 管理器接口
 */
export interface PerformanceManager {
  // 当前时间。微信小游戏文档返回微秒，SDK 内部统一归一为毫秒后使用。
  now?: () => number;

  // 获取性能条目
  getEntries(): PerformanceEntry[];
  getEntriesByType(type: string): PerformanceEntry[];
  getEntriesByName(name: string, type?: string): PerformanceEntry[];

  // 标记和测量
  mark(name: string): void;
  measure(name: string, startMark?: string, endMark?: string): void;

  // 清除
  clearMarks(name?: string): void;
  clearMeasures(name?: string): void;

  // 观察者
  createObserver(callback: PerformanceObserverCallback): PerformanceObserver;
}

/**
 * Performance Observer 接口
 */
export interface PerformanceObserver {
  observe(options: { entryTypes: string[] }): void;
  disconnect(): void;
}

/**
 * 获取性能管理器
 */
export const getPerformanceManager = (): PerformanceManager | null => {
  try {
    const currentSdk = sdk();
    if (currentSdk.getPerformance && typeof currentSdk.getPerformance === 'function') {
      return currentSdk.getPerformance();
    }
  } catch (error) {
    console.warn('Failed to get performance manager:', error);
  }
  return null;
};

/**
 * 时长时钟：用于**测量时长 / 间隔**（帧间隔、冷启动 delta 等），返回毫秒。
 *
 * 刻意用 Date.now() 而非平台 Performance.now()：后者在小游戏里单位不可靠——同一份代码在
 * 微信开发者工具返回毫秒、真机返回微秒（见 issue #167），且官方文档并未明确单位，按平台写死
 * 会在某个环境下整体偏差 1000 倍。Date.now() 在所有平台都是无歧义毫秒；这些指标粒度（≥16ms）
 * 也用不上亚毫秒精度，时钟回拨 / 改表由各采样点自身的「超大 delta 视为断点」兜底。
 *
 * 与 epochNow() 实现相同（均为墙钟 epoch 毫秒），但刻意分成两个函数以区分语义：now() 仅用于
 * 差值（时长），epochNow() 用于需要绝对时间点的场景（如 Sentry span 时间戳）。
 */
export const now = (): number => Date.now();

/**
 * 墙钟时间戳（Unix epoch 毫秒）。用于需要**绝对时间点**的场景，如 Sentry span 的
 * startTime / endTimestamp。与 now() 刻意区分调用语义，避免把时长采样点直接当业务时间点使用。
 */
export const epochNow = (): number => Date.now();

export { getSDK, getSystemInfo, isMiniappEnvironment };
