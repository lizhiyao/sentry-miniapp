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
    
    // 优先使用新的 API 组合
    if (currentSdk.getDeviceInfo && currentSdk.getWindowInfo && currentSdk.getAppBaseInfo) {
      const deviceInfo = currentSdk.getDeviceInfo();
      const windowInfo = currentSdk.getWindowInfo();
      const appBaseInfo = currentSdk.getAppBaseInfo();
      
      return {
        brand: deviceInfo.brand || '',
        model: deviceInfo.model || '',
        pixelRatio: windowInfo.pixelRatio || 1,
        screenWidth: windowInfo.screenWidth || 0,
        screenHeight: windowInfo.screenHeight || 0,
        windowWidth: windowInfo.windowWidth || 0,
        windowHeight: windowInfo.windowHeight || 0,
        statusBarHeight: windowInfo.statusBarHeight || 0,
        language: appBaseInfo.language || '',
        version: appBaseInfo.version || deviceInfo.system || '',
        system: deviceInfo.system || '',
        platform: deviceInfo.platform || '',
        fontSizeSetting: appBaseInfo.fontSizeSetting || 0,
        SDKVersion: appBaseInfo.SDKVersion || '',
        benchmarkLevel: deviceInfo.benchmarkLevel,
        albumAuthorized: deviceInfo.albumAuthorized,
        cameraAuthorized: deviceInfo.cameraAuthorized,
        locationAuthorized: deviceInfo.locationAuthorized,
        microphoneAuthorized: deviceInfo.microphoneAuthorized,
        notificationAuthorized: deviceInfo.notificationAuthorized,
        bluetoothEnabled: deviceInfo.bluetoothEnabled,
        locationEnabled: deviceInfo.locationEnabled,
        wifiEnabled: deviceInfo.wifiEnabled,
        safeArea: windowInfo.safeArea
      };
    }
    
    // 兜底使用旧的 API（已弃用但保持兼容性）
    if (currentSdk.getSystemInfoSync) {
      console.warn('[Sentry] getSystemInfoSync is deprecated. Please update to use getDeviceInfo/getWindowInfo/getAppBaseInfo.');
      return currentSdk.getSystemInfoSync() as SystemInfo;
    }
  } catch (error) {
    console.warn('Failed to get system info:', error);
  }
  return null;
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

export { getSDK, getSystemInfo, isMiniappEnvironment };