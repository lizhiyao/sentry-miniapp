import { describe, expect, it } from '@jest/globals';
import { miniappStackParser } from '../src/stacktrace';

describe('miniappStackParser', () => {
  describe('V8 style stack traces', () => {
    it('should parse standard V8 stack frames', () => {
      const stack = [
        'Error: test error',
        '    at Object.handleTap (pages/index/index.js:42:13)',
        '    at callMethod (app-service.js:123:45)',
        '    at anonymous (utils/helper.js:10:5)',
      ].join('\n');

      const frames = miniappStackParser(stack, 0);
      expect(frames.length).toBe(3);

      // Sentry reverses frames: call site is last
      expect(frames[2]!.filename).toBe('pages/index/index.js');
      expect(frames[2]!.function).toBe('Object.handleTap');
      expect(frames[2]!.lineno).toBe(42);
      expect(frames[2]!.colno).toBe(13);
      expect(frames[2]!.in_app).toBe(true);
    });

    it('should parse frames without function name', () => {
      const stack = [
        'Error: test',
        '    at pages/index/index.js:42:13',
      ].join('\n');

      const frames = miniappStackParser(stack, 0);
      expect(frames.length).toBe(1);
      expect(frames[0]!.filename).toBe('pages/index/index.js');
      expect(frames[0]!.lineno).toBe(42);
    });

    it('should parse WeChat appservice frames', () => {
      const stack = [
        'Error: something went wrong',
        '    at Object.onLoad (appservice/pages/home/home.js:15:20)',
        '    at appservice/appservice.js:1:100',
      ].join('\n');

      const frames = miniappStackParser(stack, 0);
      expect(frames.length).toBe(2);
      expect(frames[1]!.filename).toBe('appservice/pages/home/home.js');
      expect(frames[1]!.function).toBe('Object.onLoad');
    });

    it('should mark SDK frames as not in_app', () => {
      const stack = [
        'Error: test',
        '    at internalHelper (sentry-miniapp.js:100:20)',
        '    at handleError (pages/index/index.js:10:5)',
      ].join('\n');

      const frames = miniappStackParser(stack, 0);
      expect(frames.length).toBe(2);
      const sdkFrame = frames.find(f => f.filename === 'sentry-miniapp.js');
      const userFrame = frames.find(f => f.filename === 'pages/index/index.js');
      expect(userFrame!.in_app).toBe(true);
      expect(sdkFrame!.in_app).toBe(false);
    });
  });

  describe('Safari/JavaScriptCore style stack traces', () => {
    it('should parse Safari-style frames', () => {
      const stack = [
        'handleTap@pages/index/index.js:42:13',
        '@app-service.js:100:20',
      ].join('\n');

      const frames = miniappStackParser(stack, 0);
      expect(frames.length).toBe(2);
      expect(frames[1]!.filename).toBe('pages/index/index.js');
      expect(frames[1]!.function).toBe('handleTap');
      expect(frames[1]!.lineno).toBe(42);
      expect(frames[1]!.colno).toBe(13);
    });

    it('should parse Safari frames without column number', () => {
      const stack = 'onLoad@pages/home/home.js:15\n';

      const frames = miniappStackParser(stack, 0);
      expect(frames.length).toBe(1);
      expect(frames[0]!.filename).toBe('pages/home/home.js');
      expect(frames[0]!.lineno).toBe(15);
      expect(frames[0]!.colno).toBeUndefined();
    });
  });

  describe('simple stack format', () => {
    it('should parse simplified stack frames', () => {
      const stack = 'pages/index/index.js:42:13\n';

      const frames = miniappStackParser(stack, 0);
      expect(frames.length).toBe(1);
      expect(frames[0]!.filename).toBe('pages/index/index.js');
      expect(frames[0]!.lineno).toBe(42);
      expect(frames[0]!.colno).toBe(13);
    });
  });

  describe('edge cases', () => {
    it('should return empty array for empty string', () => {
      const frames = miniappStackParser('', 0);
      expect(frames).toEqual([]);
    });

    it('should return empty array for non-stack string', () => {
      const frames = miniappStackParser('just a random message', 0);
      expect(frames).toEqual([]);
    });

    it('should handle subpackage paths', () => {
      const stack = [
        'Error: test',
        '    at doSomething (subpackages/sub1/pages/detail.js:30:10)',
      ].join('\n');

      const frames = miniappStackParser(stack, 0);
      expect(frames.length).toBe(1);
      expect(frames[0]!.filename).toBe('subpackages/sub1/pages/detail.js');
      expect(frames[0]!.in_app).toBe(true);
    });

    it('should handle component paths', () => {
      const stack = [
        'Error: test',
        '    at MyComponent.attached (components/my-comp/my-comp.js:8:3)',
      ].join('\n');

      const frames = miniappStackParser(stack, 0);
      expect(frames.length).toBe(1);
      expect(frames[0]!.filename).toBe('components/my-comp/my-comp.js');
    });

    it('should mark WAService frames as not in_app', () => {
      const stack = [
        'Error: test',
        '    at doWork (WAService.js:1:500)',
        '    at userCode (pages/index/index.js:10:5)',
      ].join('\n');

      const frames = miniappStackParser(stack, 0);
      expect(frames.length).toBe(2);
      // After reverse: WAService is at index 0 (bottom), user code at index 1 (top/call site)
      const waFrame = frames.find(f => f.filename === 'WAService.js');
      const userFrame = frames.find(f => f.filename === 'pages/index/index.js');
      expect(waFrame!.in_app).toBe(false);
      expect(userFrame!.in_app).toBe(true);
    });

    it('should skip lines over 1024 chars gracefully', () => {
      const longLine = '    at func (' + 'a'.repeat(2000) + ':1:1)';
      const stack = 'Error: test\n' + longLine;

      // Should not throw
      const frames = miniappStackParser(stack, 0);
      expect(Array.isArray(frames)).toBe(true);
    });
  });
});
