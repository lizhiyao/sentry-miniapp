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
  getDeviceInfo?: Function; // 新 API
  getWindowInfo?: Function; // 新 API
  getAppBaseInfo?: Function; // 新 API
  onError?: Function;
  onUnhandledRejection?: Function;
  onPageNotFound?: Function;
  onMemoryWarning?: Function;
  // App / 小游戏全局生命周期（小游戏没有 App()，用全局 onShow/onHide）
  onAppShow?: Function;
  onAppHide?: Function;
  offAppShow?: Function;
  offAppHide?: Function;
  onShow?: Function;
  onHide?: Function;
  offShow?: Function;
  offHide?: Function;
  getLaunchOptionsSync?: Function;
  getEnvInfoSync?: Function;
  getAccountInfoSync?: Function;
  getUpdateManager?: Function;
  showModal?: Function;
  // Performance API
  getPerformance?: Function; // 获取性能管理器
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
  'wechat' | 'alipay' | 'bytedance' | 'dingtalk' | 'qq' | 'swan' | 'kuaishou' | 'unknown';

/** 可显式配置的小程序宿主平台。`unknown` 仅供自动检测结果使用。 */
export type MiniappPlatform = Exclude<AppName, 'unknown'>;

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

function addGlobalObjectCandidate(candidates: unknown[], seen: Set<unknown>, value: unknown): void {
  if (
    value === null ||
    (typeof value !== 'object' && typeof value !== 'function') ||
    seen.has(value)
  ) {
    return;
  }
  seen.add(value);
  candidates.push(value);
}

/**
 * 获取当前运行时可见的 JS 全局对象候选。
 *
 * 小游戏等宿主里可能出现 `global !== globalThis`，且三方注入器可能写入不同全局对象；
 * 因此需要返回全部候选而不是只返回一个“主全局”。顺序保留常见注入器的探测顺序。
 */
export const getGlobalObjectCandidates = (): unknown[] => {
  const candidates: unknown[] = [];
  const seen = new Set<unknown>();

  if (typeof window !== 'undefined') addGlobalObjectCandidate(candidates, seen, window);
  if (typeof global !== 'undefined') addGlobalObjectCandidate(candidates, seen, global);
  if (typeof globalThis !== 'undefined') addGlobalObjectCandidate(candidates, seen, globalThis);
  if (typeof self !== 'undefined') addGlobalObjectCandidate(candidates, seen, self);

  return candidates;
};

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
 * isMiniappEnvironment() 均基于此。数组顺序只作为宿主信号无法消除多对象歧义时的兼容回退，
 * 新增平台只需改这一处。
 */
const PLATFORMS: ReadonlyArray<{ global: string; name: MiniappPlatform }> = [
  { global: 'wx', name: 'wechat' },
  { global: 'my', name: 'alipay' },
  { global: 'tt', name: 'bytedance' },
  { global: 'dd', name: 'dingtalk' },
  { global: 'qq', name: 'qq' },
  { global: 'swan', name: 'swan' },
  { global: 'ks', name: 'kuaishou' },
];

type DetectedPlatform = { sdk: SDK; name: AppName };

const BYTEDANCE_HOST_NAMES = new Set([
  'toutiao',
  'douyin',
  'douyin_lite',
  'news_article_lite',
  'aweme_hotsoon',
  'xigua',
  'douyin_web',
]);

const callPlatformInfo = (platformSdk: SDK, method: keyof SDK): Record<string, any> | null => {
  try {
    const fn = platformSdk[method];
    if (typeof fn !== 'function') return null;

    const result = fn.call(platformSdk);
    return result && typeof result === 'object' ? result : null;
  } catch (_error) {
    return null;
  }
};

/** 快照只包含可读字段，不修改宿主对象，也不让一个 getter 丢弃其它设备维度。 */
function mergePlatformInfo(target: Record<string, any>, source: Record<string, any>): void {
  // 环境消费者使用的维度可由代理对象或非枚举字段暴露；枚举失败仍尝试这些可读字段。
  const keys = new Set([
    'brand',
    'model',
    'system',
    'platform',
    'version',
    'SDKVersion',
    'language',
    'screenWidth',
    'screenHeight',
  ]);
  try {
    for (const key of Object.keys(source)) keys.add(key);
  } catch (_error) {
    /* 一项宿主结果不可枚举不阻断其他 API 和旧 API 回退。 */
  }
  for (const key of keys) {
    try {
      const value = source[key];
      if (value !== undefined) target[key] = value;
    } catch (_error) {
      /* 不可读字段单独省略。 */
    }
  }
}

const inferPlatformFromAppId = (appId: unknown): AppName | null => {
  if (typeof appId !== 'string') return null;
  if (appId.startsWith('tt')) return 'bytedance';
  if (appId.startsWith('wx')) return 'wechat';
  return null;
};

/** 单个候选或信号不可读时，只跳过该字段，不丢弃其它可用的平台证据。 */
const readPlatformField = (source: unknown, key: string): unknown => {
  try {
    return (source as Record<string, unknown> | null | undefined)?.[key];
  } catch (_error) {
    return undefined;
  }
};

/**
 * 从宿主 API 返回值推断真实平台，仅识别有稳定、平台专属格式的信号。
 * 该推断只在多个平台全局对象共存时使用，失败时由 detectPlatform 保留历史 first-match。
 */
const inferPlatformFromRuntime = (platformSdk: SDK): AppName | null => {
  const envInfo = callPlatformInfo(platformSdk, 'getEnvInfoSync');
  const envPlatform = inferPlatformFromAppId(
    readPlatformField(readPlatformField(envInfo, 'microapp'), 'appId'),
  );
  if (envPlatform) return envPlatform;

  const userDataPath = readPlatformField(readPlatformField(envInfo, 'common'), 'USER_DATA_PATH');
  if (typeof userDataPath === 'string') {
    if (userDataPath.startsWith('ttfile://')) return 'bytedance';
    if (userDataPath.startsWith('wxfile://')) return 'wechat';
  }

  const systemInfo = callPlatformInfo(platformSdk, 'getSystemInfoSync');
  const hostName =
    readPlatformField(systemInfo, 'appName') ?? readPlatformField(systemInfo, 'hostName');
  if (typeof hostName === 'string' && BYTEDANCE_HOST_NAMES.has(hostName.toLowerCase())) {
    return 'bytedance';
  }

  const accountInfo = callPlatformInfo(platformSdk, 'getAccountInfoSync');
  const accountPlatform = inferPlatformFromAppId(
    readPlatformField(readPlatformField(accountInfo, 'miniProgram'), 'appId'),
  );
  if (accountPlatform) return accountPlatform;

  const launchOptions = callPlatformInfo(platformSdk, 'getLaunchOptionsSync');
  const launchPlatform = inferPlatformFromAppId(
    readPlatformField(readPlatformField(launchOptions, 'extra'), 'appId'),
  );
  if (launchPlatform) return launchPlatform;

  return null;
};

/**
 * 检测当前平台。单一命中直接返回；多个平台对象共存时优先采用宿主 API 的明确证据，
 * 无法判定才回退历史 first-match 顺序，未命中返回 null。
 */
export const detectPlatform = (): DetectedPlatform | null => {
  const g = globalThis as Record<string, unknown>;
  const candidates: DetectedPlatform[] = [];
  for (const platform of PLATFORMS) {
    const platformSdk = readPlatformField(g, platform.global);
    if (typeof platformSdk === 'object' && platformSdk !== null) {
      candidates.push({ sdk: platformSdk as SDK, name: platform.name });
    }
  }

  if (candidates.length <= 1) {
    return candidates[0] ?? null;
  }

  const inferredPlatforms = new Set<AppName>();
  for (const candidate of candidates) {
    const inferredPlatform = inferPlatformFromRuntime(candidate.sdk);
    if (inferredPlatform && candidates.some((item) => item.name === inferredPlatform)) {
      inferredPlatforms.add(inferredPlatform);
    }
  }

  if (inferredPlatforms.size === 1) {
    const [inferredPlatform] = inferredPlatforms;
    // 宿主证据只用于选择同名候选对象，不能把 A 平台 SDK 与 B 平台名称拼在一起；
    // Storage 消费入口会按 name 选择参数适配，二者错配会破坏请求和存储归属。
    return candidates.find((item) => item.name === inferredPlatform) ?? candidates[0] ?? null;
  }

  return candidates[0] ?? null;
};

let _detectedPlatform: DetectedPlatform | null | undefined;

const resolvePlatform = (): DetectedPlatform | null => {
  if (_detectedPlatform === undefined) {
    _detectedPlatform = detectPlatform();
  }
  return _detectedPlatform;
};

/** 对象参数 Storage 的同步失败以 error 返回；仅 SDK 的归一化调用转为异常。 */
function assertStorageSuccess(result: unknown, allowMissing = false): void {
  if (!result || typeof result !== 'object') return;
  const error = (result as { error?: unknown }).error;
  if (typeof error === 'number' && error !== 0 && !(allowMissing && error === 11))
    throw new Error(`Miniapp Storage operation failed (${error})`);
}

export type MiniappStorageApiName = 'getStorageSync' | 'setStorageSync' | 'removeStorageSync';

/** 只在 SDK 存储消费入口归一化；不改写宿主方法、返回结构或安装可写标记。 */
export function getStorageApi(
  source: Record<string, unknown>,
  name: MiniappStorageApiName,
): Function | undefined {
  const method = source[name];
  if (typeof method !== 'function') return undefined;
  const detected = resolvePlatform();
  if (
    !detected ||
    (detected.sdk as unknown) !== source ||
    (detected.name !== 'alipay' && detected.name !== 'dingtalk')
  )
    return method;
  return function (key: string, data?: unknown) {
    const result = method.call(source, name === 'setStorageSync' ? { key, data } : { key });
    assertStorageSuccess(result, name === 'getStorageSync');
    return name === 'getStorageSync' ? (result ? result.data : null) : undefined;
  };
}

const getSDK = (): SDK => {
  const detected = resolvePlatform();

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
    };
  }

  // 返回真实宿主；request/httpRequest 特性检测和 Storage 归一化由消费入口分别处理。
  return detected.sdk;
};

/**
 * 获取平台名称
 */
const getAppName = (): AppName => {
  return resolvePlatform()?.name ?? 'unknown';
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

    // 只读取环境快照实际使用的 API。单项不可用不丢弃其它信息，也不阻断旧 API 回退。
    for (const method of ['getAppBaseInfo', 'getWindowInfo', 'getDeviceInfo'] as const) {
      const info = callPlatformInfo(currentSdk, method);
      if (!info) continue;
      mergePlatformInfo(result, info);
      hasNewApi = true;
    }

    // 新 API 须至少返回一个核心设备身份字段（brand/model/system）才采纳。部分非微信端
    //「方法存在却返回空壳 {}」，此时三者皆空 → 回退旧 getSystemInfoSync 取真实数据，
    // 避免产出全 unknown 的设备信息。
    const newApiUsable = hasNewApi && !!(result.brand || result.model || result.system);
    if (newApiUsable) {
      return result as SystemInfo;
    }

    // 兜底使用旧的 API（已弃用但保持兼容性）
    const syncInfo = callPlatformInfo(currentSdk, 'getSystemInfoSync');
    if (syncInfo) {
      // 支付宝小程序等平台，版本信息可能叫 version 而不是 SDKVersion
      // 归一化只修改 SDK 快照，不能写宿主共享或只读的返回对象。
      const snapshot: Record<string, any> = {};
      mergePlatformInfo(snapshot, syncInfo);
      if (!snapshot['SDKVersion'] && snapshot['version']) {
        snapshot['SDKVersion'] = snapshot['version'];
      }
      return snapshot as SystemInfo;
    }

    // 新 API 仅拿到部分信息、又无旧 API 兜底：部分结果仍好过 null。
    if (hasNewApi) {
      return result as SystemInfo;
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

/** 小程序账号信息（appId / 版本），一次会话内静态。 */
export interface MiniProgramAccountInfo {
  appId: string;
  version: string;
}

const computeAccountInfo = (): MiniProgramAccountInfo => {
  try {
    const currentSdk = getSDK();
    if (currentSdk.getAccountInfoSync) {
      const info: any = currentSdk.getAccountInfoSync();
      return {
        appId: info?.miniProgram?.appId || 'unknown',
        version: info?.miniProgram?.version || 'unknown',
      };
    }
  } catch (_e) {
    // 忽略：账号信息缺失不应阻断事件上报
  }
  return { appId: 'unknown', version: 'unknown' };
};

// 账号信息记忆化：appId / 版本一次会话内静态，缓存避免 HttpContext 每事件重复
// getAccountInfoSync（此前每事件取两次：appName + appVersion 各调一次）。
// 与 getSystemInfo 同策略：全 unknown（API 未就绪/偶发异常）时不缓存，下次重试避免毒化整会话。
let _accountInfo: MiniProgramAccountInfo | null = null;
const getAccountInfo = (): MiniProgramAccountInfo => {
  if (_accountInfo === null) {
    const computed = computeAccountInfo();
    if (computed.appId !== 'unknown' || computed.version !== 'unknown') {
      _accountInfo = computed;
    }
    return computed;
  }
  return _accountInfo;
};

/**
 * 检查是否在小程序环境中
 */
const isMiniappEnvironment = (): boolean => {
  return getAppName() !== 'unknown';
};

// 懒加载 SDK 和 appName，避免在模块导入时就执行平台检测
export let _sdk: SDK | null = null;
let _appName: AppName | null = null;

export const sdk = (): SDK => {
  if (_sdk === null) {
    _sdk = getSDK();
  }
  return _sdk;
};

export const appName = (): AppName => {
  if (_appName === null) {
    _appName = getAppName();
  }
  return _appName;
};

const MINIAPP_PLATFORMS = new Set<MiniappPlatform>(PLATFORMS.map((platform) => platform.name));

/**
 * 解析事件使用的小程序宿主标记。`miniappPlatform` 是公开主选项，旧 `platform`
 * 仅作兼容别名；非法 JavaScript 入参不会污染 Sentry 顶层平台语义。
 */
export const resolveMiniappPlatform = (options: {
  miniappPlatform?: unknown;
  platform?: unknown;
}): AppName => {
  const optionName = options.miniappPlatform !== undefined ? 'miniappPlatform' : 'platform';
  const configured = options[optionName];

  if (configured === undefined) {
    return appName();
  }
  if (typeof configured === 'string' && MINIAPP_PLATFORMS.has(configured as MiniappPlatform)) {
    return configured as MiniappPlatform;
  }

  console.warn(
    `[sentry-miniapp] 忽略无效的 ${optionName}=${String(configured)}；` +
      '请使用 wechat、alipay、bytedance、qq、swan、dingtalk 或 kuaishou，SDK 将改用自动识别结果。',
  );
  return appName();
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
    try {
      const hasGameGlobal = typeof g.GameGlobal !== 'undefined';
      const lacksMiniprogramHost =
        typeof g.App !== 'function' &&
        typeof g.Page !== 'function' &&
        typeof g.getCurrentPages !== 'function';
      _isMinigame = isMiniappEnvironment() && (hasGameGlobal || lacksMiniprogramHost);
    } catch (_error) {
      // 不可读入口不是小游戏证据；保守选择小程序能力，交给 producer 特性检测。
      _isMinigame = false;
    }
  }
  return _isMinigame;
};

/** 统一重置平台解析及其派生缓存，仅供测试使用。 */
export const resetPlatformCache = (): void => {
  _detectedPlatform = undefined;
  _sdk = null;
  _appName = null;
  _isMinigame = null;
  _systemInfo = null;
  _accountInfo = null;
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
  /** 宿主明确提供、与 entry.startTime 同一时钟的 epoch 毫秒原点。缺失时不推算。 */
  readonly timeOrigin?: number;
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

  /** 创建性能观察者；小游戏等宿主可能只提供 `now()`，因此该能力可选。 */
  createObserver?(callback: PerformanceObserverCallback): PerformanceObserver;
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
 * 时长时钟：用于**测量时长 / 间隔**（帧间隔、SDK 安装至首帧等），返回毫秒。
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

export { getSDK, getSystemInfo, getAccountInfo, isMiniappEnvironment };
