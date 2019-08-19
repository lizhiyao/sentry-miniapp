import { getCurrentHub } from "@sentry/core";
import { Event, Response, Status } from "@sentry/types";

import { MiniappClient } from '../client';

import { BaseTransport } from "./base";

declare const wx: {
  request: Function;
};

declare const tt: {
  request: Function;
};

declare const my: {
  request: Function;
};

let sdk = wx;
const client = getCurrentHub().getClient<MiniappClient>();
const platform = client && client.getOptions().platform;

switch (platform) {
  case 'tt':
    sdk = tt;
    break;
  case 'my':
    sdk = my;
    break;
  default:
}

/** `XHR` based transport */
export class XHRTransport extends BaseTransport {
  /**
   * @inheritDoc
   */
  public sendEvent(event: Event): Promise<Response> {
    return this._buffer.add(
      new Promise<Response>((resolve, reject) => {
        // tslint:disable-next-line: no-unsafe-any
        sdk.request({
          url: this.url,
          method: "POST",
          data: JSON.stringify(event),
          header: {
            "content-type": "application/json"
          },
          success(res: { statusCode: number }): void {
            resolve({
              status: Status.fromHttpCode(res.statusCode)
            });
          },
          fail(error: object): void {
            reject(error);
          }
        });
      })
    );
  }
}
