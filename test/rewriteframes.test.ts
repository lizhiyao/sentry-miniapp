import { Event } from '@sentry/core';
import { RewriteFrames } from '../src/integrations/rewriteframes';

describe('RewriteFrames Integration', () => {
  let rewriteFrames: RewriteFrames;

  beforeEach(() => {
    rewriteFrames = new RewriteFrames();
  });

  it('should normalize wechat appservice path', () => {
    const event: Event = {
      exception: {
        values: [
          {
            stacktrace: {
              frames: [
                { filename: 'appservice/pages/index/index.js' },
                { filename: 'app-service/app.js' },
                { filename: 'WAService.js' },
              ],
            },
          },
        ],
      },
    };

    const processed = rewriteFrames.processEvent(event);
    const frames = (processed.exception!.values as any)[0].stacktrace.frames;

    expect(frames[0].filename).toBe('app:///pages/index/index.js');
    expect(frames[1].filename).toBe('app:///app.js');
    expect(frames[2].filename).toBe('app:///WAService.js');
  });

  it('should normalize alipay and bytedance paths', () => {
    const event: Event = {
      exception: {
        values: [
          {
            stacktrace: {
              frames: [
                { filename: 'https://appx/app.js' },
                { filename: 'tt://pages/index/index.js' },
                { filename: 'swan://app.js' },
              ],
            },
          },
        ],
      },
    };

    const processed = rewriteFrames.processEvent(event);
    const frames = (processed.exception!.values as any)[0].stacktrace.frames;

    expect(frames[0].filename).toBe('app:///app.js');
    expect(frames[1].filename).toBe('app:///pages/index/index.js');
    expect(frames[2].filename).toBe('app:///app.js');
  });

  it('should prevent double prefixing', () => {
    const event: Event = {
      exception: {
        values: [
          {
            stacktrace: {
              frames: [{ filename: 'app:///pages/index/index.js' }],
            },
          },
        ],
      },
    };

    const processed = rewriteFrames.processEvent(event);
    const frames = (processed.exception!.values as any)[0].stacktrace.frames;

    expect(frames[0].filename).toBe('app:///pages/index/index.js');
  });

  it('should not throw if frames or exception is missing', () => {
    const event: Event = {
      message: 'test',
    };

    const processed = rewriteFrames.processEvent(event);
    expect(processed.message).toBe('test');
  });
});
