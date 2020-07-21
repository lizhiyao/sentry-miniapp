import "./js/libs/weapp-adapter";
import "./js/libs/symbol";

import * as Sentry from "./vendor/sentry-miniapp.wx.min";
const {
  Integrations: { Router },
} = Sentry;

import Main from "./js/main";

// console.log(Sentry);

Sentry.init({
  dsn: "https://47703e01ba4344b8b252c15e8fd980fd@sentry.io/1528228",
  integrations: [new Router({ enable: false })],
});

new Main();

Sentry.captureException("123");

// throw new Error("wegame test");
