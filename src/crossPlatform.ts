declare const wx: any;
declare const my: any;
declare const tt: any;
declare const dd: any;

/**
 * 小程序平台 SDK 接口
 */
interface SDK {
  request: Function;
  httpRequest?: Function; // 针对钉钉小程序
  getSystemInfoSync: Function;
  onError?: Function;
  onPageNotFound?: Function;
  onMemoryWarning?: Function;
}

/**
 * 小程序平台 接口
 */
type Platform = 'wechat' | 'alipay' | 'bytedance' | 'dingtalk' | 'unknown';

/**
 * 获取跨平台的 SDK
 */
const getSDK = () => {
  let sdk: SDK = {
    // tslint:disable-next-line: no-empty
    request: () => { },
    // tslint:disable-next-line: no-empty
    httpRequest: () => { },
    // tslint:disable-next-line: no-empty
    getSystemInfoSync: () => { }
  };

  if (typeof wx === 'object') {  // 微信平台
    // tslint:disable-next-line: no-unsafe-any
    sdk = wx;
  } else if (typeof my === 'object') {  // 支付宝平台
    // tslint:disable-next-line: no-unsafe-any
    sdk = my;
  } else if (typeof tt === 'object') {  // 字节跳动平台
    // tslint:disable-next-line: no-unsafe-any
    sdk = tt;
  } else if (typeof dd === 'object') { // 钉钉平台
    // tslint:disable-next-line: no-unsafe-any
    sdk = dd;
  } else {
    throw new Error('sentry-miniapp 暂不支持此平台');
  }
  return sdk;
}

/**
 * 获取平台名称
 */
const getPlatformName = () => {
  let platform: Platform = 'unknown';

  if (typeof wx === 'object') {
    platform = 'wechat';
  } else if (typeof my === 'object') {
    platform = 'alipay';
  } else if (typeof tt === 'object') {
    platform = 'bytedance';
  } else if (typeof dd === 'object') {
    platform = 'dingtalk';
  }

  return platform;
}

export {
  getSDK,
  getPlatformName,
};
