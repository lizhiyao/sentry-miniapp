import { Event, Response, Status } from "@sentry/types";

import { BaseTransport } from "./base";

declare const wx: {
  request: Function;
};

/** `XHR` based transport */
export class XHRTransport extends BaseTransport {
  /**
   * @inheritDoc
   */
  public sendEvent(event: Event): Promise<Response> {
    return this._buffer.add(
      new Promise<Response>((resolve, reject) => {
        // tslint:disable-next-line: no-unsafe-any
        wx.request({
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
