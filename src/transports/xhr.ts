import { Event, Response } from "@sentry/types";
import { eventStatusFromHttpCode } from '@sentry/utils';

import { sdk } from "../crossPlatform";

import { BaseTransport } from "./base";

/** `XHR` based transport */
export class XHRTransport extends BaseTransport {
  /**
   * @inheritDoc
   */
  public sendEvent(event: Event): PromiseLike<Response> {
    const request = sdk.request || sdk.httpRequest;

    return this._buffer.add(
      () => new Promise<Response>((resolve, reject) => {
        // tslint:disable-next-line: no-unsafe-any
        request({
          url: this.url,
          method: "POST",
          data: JSON.stringify(event),
          header: {
            "content-type": "application/json"
          },
          success(res: { statusCode: number }): void {
            resolve({
              status: eventStatusFromHttpCode(res.statusCode)
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
