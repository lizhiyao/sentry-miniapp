declare const wx: any; // 微信小程序、微信小游戏
declare const my: any; // 支付宝小程序
declare const tt: any; // 字节跳动小程序
declare const dd: any; // 钉钉小程序
declare const qq: any; // QQ 小程序、QQ 小游戏

/**
 * 小程序平台 SDK 接口
 */
interface SDK {
  request: Function;
  httpRequest?: Function; // 针对钉钉小程序
  getSystemInfoSync: Function;
  onError?: Function;
  onUnhandledRejection?: Function;
  onPageNotFound?: Function;
  onMemoryWarning?: Function;
  getLaunchOptionsSync?: Function;
}

/**
 * 小程序平台 接口
 */
type AppName =
  | "wechat"
  | "alipay"
  | "bytedance"
  | "dingtalk"
  | "qq"
  | "unknown";

/**
 * 获取跨平台的 SDK
 */
const getSDK = () => {
  let currentSdk: SDK = {
    // tslint:disable-next-line: no-empty
    request: () => {},
    // tslint:disable-next-line: no-empty
    httpRequest: () => {},
    // tslint:disable-next-line: no-empty
    getSystemInfoSync: () => {},
  };

  if (typeof wx === "object") {
    // tslint:disable-next-line: no-unsafe-any
    currentSdk = wx;
  } else if (typeof my === "object") {
    // tslint:disable-next-line: no-unsafe-any
    currentSdk = my;
  } else if (typeof tt === "object") {
    // tslint:disable-next-line: no-unsafe-any
    currentSdk = tt;
  } else if (typeof dd === "object") {
    // tslint:disable-next-line: no-unsafe-any
    currentSdk = dd;
  } else if (typeof qq === "object") {
    // tslint:disable-next-line: no-unsafe-any
    currentSdk = qq;
  } else {
    throw new Error("sentry-miniapp 暂不支持此平台");
  }

  return currentSdk;
};

/**
 * 获取平台名称
 */
const getAppName = () => {
  let currentAppName: AppName = "unknown";

  if (typeof wx === "object") {
    currentAppName = "wechat";
  } else if (typeof my === "object") {
    currentAppName = "alipay";
  } else if (typeof tt === "object") {
    currentAppName = "bytedance";
  } else if (typeof dd === "object") {
    currentAppName = "dingtalk";
  } else if (typeof qq === "object") {
    currentAppName = "qq";
  }

  return currentAppName;
};

const sdk = getSDK();
const appName = getAppName();

export { sdk, appName };
