declare const wx: any; // 微信小程序、微信小游戏
declare const my: any; // 支付宝小程序
declare const tt: any; // 字节跳动小程序
declare const dd: any; // 钉钉小程序
declare const qq: any; // QQ 小程序、QQ 小游戏
declare const swan: any; // 百度小程序

/**
 * 小程序平台 SDK 接口
 */
interface SDK {
  request: Function;
  httpRequest?: Function; // 针对钉钉小程序
  getSystemInfoSync?: Function; // 已弃用，保留兼容性
  getSystemSetting?: Function; // 新 API
  getAppAuthorizeSetting?: Function; // 新 API
  getDeviceInfo?: Function; // 新 API
  getWindowInfo?: Function; // 新 API
  getAppBaseInfo?: Function; // 新 API
  onError?: Function;
  onUnhandledRejection?: Function;
  onPageNotFound?: Function;
  onMemoryWarning?: Function;
  getLaunchOptionsSync?: Function;
  getAccountInfoSync?: Function;
  getUpdateManager?: Function;
  showModal?: Function;
  URLSearchParams?: Function;
  // Performance API
  getPerformance?: Function; // 获取性能管理器
  reportPerformance?: Function; // 上报性能数据
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
 * 获取跨平台的 SDK
 */
const getSDK = (): SDK => {
  let currentSdk: SDK = {
    // tslint:disable-next-line: no-empty
    request: () => {},
    // tslint:disable-next-line: no-empty
    httpRequest: () => {},
    // tslint:disable-next-line: no-empty
    getSystemInfoSync: () => ({}),
    // tslint:disable-next-line: no-empty
    URLSearchParams: () =>{}
  };

  if (typeof wx === 'object' && wx !== null) {
    // tslint:disable-next-line: no-unsafe-any
    currentSdk = wx;
  } else if (typeof my === 'object' && my !== null) {
    // tslint:disable-next-line: no-unsafe-any
    currentSdk = my;
  } else if (typeof tt === 'object' && tt !== null) {
    // tslint:disable-next-line: no-unsafe-any
    currentSdk = tt;
  } else if (typeof dd === 'object' && dd !== null) {
    // tslint:disable-next-line: no-unsafe-any
    currentSdk = dd;
  } else if (typeof qq === 'object' && qq !== null) {
    // tslint:disable-next-line: no-unsafe-any
    currentSdk = qq;
  } else if (typeof swan === 'object' && swan !== null) {
    // tslint:disable-next-line: no-unsafe-any
    currentSdk = swan;
  } else {
    throw new Error('sentry-miniapp 暂不支持此平台');
  }

  return currentSdk;
};

/**
 * 获取平台名称
 */
const getAppName = (): AppName => {
  let currentAppName: AppName = 'unknown';

  if (typeof wx === 'object' && wx !== null) {
    currentAppName = 'wechat';
  } else if (typeof my === 'object' && my !== null) {
    currentAppName = 'alipay';
  } else if (typeof tt === 'object' && tt !== null) {
    currentAppName = 'bytedance';
  } else if (typeof dd === 'object' && dd !== null) {
    currentAppName = 'dingtalk';
  } else if (typeof qq === 'object' && qq !== null) {
    currentAppName = 'qq';
  } else if (typeof swan === 'object' && swan !== null) {
    currentAppName = 'swan';
  }

  return currentAppName;
};

/**
 * 获取系统信息
 * 优先使用新的 API，保持向后兼容性
 */
const getSystemInfo = (): SystemInfo | null => {
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
      return currentSdk.getSystemInfoSync() as SystemInfo;
    }

    return null;
  } catch (error) {
    console.warn('[Sentry] Failed to get system info:', error);
    return null;
  }
};

/**
 * 检查是否在小程序环境中
 */
const isMiniappEnvironment = (): boolean => {
  try {
    getSDK();
    return true;
  } catch {
    return false;
  }
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

export { getSDK, getSystemInfo, isMiniappEnvironment };