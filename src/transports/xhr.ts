import { Event, Response, Status } from "@sentry/types";

import { BaseTransport } from "./base";

/** `XHR` based transport */
// export class XHRTransport extends BaseTransport {
//   /**
//    * @inheritDoc
//    */
//   public sendEvent(event: Event): Promise<Response> {
//     return this._buffer.add(
//       new Promise<Response>((resolve, reject) => {
//         const request = new XMLHttpRequest();

//         request.onreadystatechange = () => {
//           if (request.readyState !== 4) {
//             return;
//           }

//           if (request.status === 200) {
//             resolve({
//               status: Status.fromHttpCode(request.status)
//             });
//           }

//           reject(request);
//         };

//         request.open("POST", this.url);
//         request.send(JSON.stringify(event));
//       })
//     );
//   }
// }

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
