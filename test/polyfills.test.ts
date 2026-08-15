import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { installPolyfills, ensurePolyfills } from '../src/polyfills';

describe('Polyfills', () => {
  let originalGlobal: any;
  let originalGlobalThis: any;
  let originalWindow: any;
  let originalFunction: any;

  beforeEach(() => {
    // 保存原始的全局对象
    originalGlobal = (global as any).URLSearchParams;
    originalGlobalThis = (globalThis as any).URLSearchParams;
    originalWindow = typeof window !== 'undefined' ? (window as any).URLSearchParams : undefined;
    originalFunction = Function;

    // 清理全局对象
    delete (global as any).URLSearchParams;
    delete (globalThis as any).URLSearchParams;
    if (typeof window !== 'undefined') {
      delete (window as any).URLSearchParams;
    }

    vi.clearAllMocks();
  });

  afterEach(() => {
    // 恢复原始的全局对象
    if (originalGlobal !== undefined) {
      (global as any).URLSearchParams = originalGlobal;
    }
    if (originalGlobalThis !== undefined) {
      (globalThis as any).URLSearchParams = originalGlobalThis;
    }
    if (typeof window !== 'undefined' && originalWindow !== undefined) {
      (window as any).URLSearchParams = originalWindow;
    }
    (global as any).Function = originalFunction;
  });

  describe('URLSearchParamsPolyfill', () => {
    // 动态导入 URLSearchParamsPolyfill 类
    let URLSearchParamsPolyfill: any;

    beforeEach(async () => {
      // 重新加载模块以获取 URLSearchParamsPolyfill 类
      vi.resetModules();
      const polyfillsModule = await import('../src/polyfills');
      // 通过 installPolyfills 安装后从全局获取
      polyfillsModule.installPolyfills();
      URLSearchParamsPolyfill = (globalThis as any).URLSearchParams;
    });

    describe('constructor', () => {
      it('should create empty instance with no arguments', () => {
        const params = new URLSearchParamsPolyfill();
        expect(params.size).toBe(0);
        expect(params.toString()).toBe('');
      });

      it('should parse string with single parameter', () => {
        const params = new URLSearchParamsPolyfill('key=value');
        expect(params.get('key')).toBe('value');
        expect(params.size).toBe(1);
      });

      it('should parse string with multiple parameters', () => {
        const params = new URLSearchParamsPolyfill('key1=value1&key2=value2');
        expect(params.get('key1')).toBe('value1');
        expect(params.get('key2')).toBe('value2');
        expect(params.size).toBe(2);
      });

      it('should handle string with leading question mark', () => {
        const params = new URLSearchParamsPolyfill('?key=value');
        expect(params.get('key')).toBe('value');
      });

      it('should handle URL encoded values', () => {
        const params = new URLSearchParamsPolyfill('key=%20value%20');
        expect(params.get('key')).toBe(' value ');
      });

      it('should handle empty string', () => {
        const params = new URLSearchParamsPolyfill('');
        expect(params.size).toBe(0);
      });

      it('should handle parameters without values', () => {
        const params = new URLSearchParamsPolyfill('key1&key2=value2');
        expect(params.get('key1')).toBe('');
        expect(params.get('key2')).toBe('value2');
      });

      it('should create from object', () => {
        const params = new URLSearchParamsPolyfill({ key1: 'value1', key2: 'value2' });
        expect(params.get('key1')).toBe('value1');
        expect(params.get('key2')).toBe('value2');
      });

      it('should create from array of arrays', () => {
        const params = new URLSearchParamsPolyfill([
          ['key1', 'value1'],
          ['key2', 'value2'],
        ]);
        expect(params.get('key1')).toBe('value1');
        expect(params.get('key2')).toBe('value2');
      });

      it('should handle array with incomplete pairs', () => {
        const params = new URLSearchParamsPolyfill([['key1'], ['key2', 'value2']]);
        expect(params.get('key1')).toBeNull();
        expect(params.get('key2')).toBe('value2');
      });

      it('should normalize missing array values and ignore non-pairs', () => {
        const params = new URLSearchParamsPolyfill([
          ['', ''],
          [undefined, undefined],
          'not-a-pair',
        ] as any);

        expect(params.getAll('')).toEqual(['', '']);
        expect(params.size).toBe(2);
      });

      it('should ignore empty query segments and keys', () => {
        const params = new URLSearchParamsPolyfill('&&=ignored&valid=value');

        expect(params.toString()).toBe('valid=value');
      });

      it('should create from another URLSearchParamsPolyfill instance', () => {
        const original = new URLSearchParamsPolyfill('key=value');
        const copy = new URLSearchParamsPolyfill(original);
        expect(copy.get('key')).toBe('value');
        expect(copy.size).toBe(1);
      });
    });

    describe('append', () => {
      it('should add new parameter', () => {
        const params = new URLSearchParamsPolyfill();
        params.append('key', 'value');
        expect(params.get('key')).toBe('value');
      });

      it('should append to existing parameter', () => {
        const params = new URLSearchParamsPolyfill('key=value1');
        params.append('key', 'value2');
        expect(params.get('key')).toBe('value1');
        expect(params.getAll('key')).toEqual(['value1', 'value2']);
      });
    });

    describe('delete', () => {
      it('should remove existing parameter', () => {
        const params = new URLSearchParamsPolyfill('key=value');
        params.delete('key');
        expect(params.has('key')).toBe(false);
        expect(params.size).toBe(0);
      });

      it('should do nothing for non-existing parameter', () => {
        const params = new URLSearchParamsPolyfill('key=value');
        params.delete('nonexistent');
        expect(params.has('key')).toBe(true);
        expect(params.size).toBe(1);
      });
    });

    describe('get', () => {
      it('should return value for existing parameter', () => {
        const params = new URLSearchParamsPolyfill('key=value');
        expect(params.get('key')).toBe('value');
      });

      it('should return null for non-existing parameter', () => {
        const params = new URLSearchParamsPolyfill();
        expect(params.get('nonexistent')).toBeNull();
      });
    });

    describe('getAll', () => {
      it('should return array with value for existing parameter', () => {
        const params = new URLSearchParamsPolyfill('key=value');
        expect(params.getAll('key')).toEqual(['value']);
      });

      it('should return empty array for non-existing parameter', () => {
        const params = new URLSearchParamsPolyfill();
        expect(params.getAll('nonexistent')).toEqual([]);
      });
    });

    describe('has', () => {
      it('should return true for existing parameter', () => {
        const params = new URLSearchParamsPolyfill('key=value');
        expect(params.has('key')).toBe(true);
      });

      it('should return false for non-existing parameter', () => {
        const params = new URLSearchParamsPolyfill();
        expect(params.has('nonexistent')).toBe(false);
      });
    });

    describe('set', () => {
      it('should set new parameter', () => {
        const params = new URLSearchParamsPolyfill();
        params.set('key', 'value');
        expect(params.get('key')).toBe('value');
      });

      it('should replace existing parameter', () => {
        const params = new URLSearchParamsPolyfill('key=oldvalue');
        params.set('key', 'newvalue');
        expect(params.get('key')).toBe('newvalue');
      });

      it('should replace the first value and remove duplicate values', () => {
        const params = new URLSearchParamsPolyfill('key=first&other=value&key=second');

        params.set('key', 'replacement');

        expect(params.getAll('key')).toEqual(['replacement']);
        expect(params.toString()).toBe('key=replacement&other=value');
      });

      it('should convert value to string', () => {
        const params = new URLSearchParamsPolyfill();
        params.set('key', 123 as any);
        expect(params.get('key')).toBe('123');
      });
    });

    describe('sort', () => {
      it('should sort parameters alphabetically', () => {
        const params = new URLSearchParamsPolyfill('c=3&a=1&b=2');
        params.sort();
        expect(params.toString()).toBe('a=1&b=2&c=3');
      });

      it('should handle empty parameters', () => {
        const params = new URLSearchParamsPolyfill();
        params.sort();
        expect(params.toString()).toBe('');
      });

      it('should preserve duplicate-key order', () => {
        const params = new URLSearchParamsPolyfill('b=1&a=first&a=second');

        params.sort();

        expect(params.toString()).toBe('a=first&a=second&b=1');
      });
    });

    describe('toString', () => {
      it('should return empty string for empty parameters', () => {
        const params = new URLSearchParamsPolyfill();
        expect(params.toString()).toBe('');
      });

      it('should return encoded parameter string', () => {
        const params = new URLSearchParamsPolyfill();
        params.set('key', 'value with spaces');
        expect(params.toString()).toBe('key=value%20with%20spaces');
      });

      it('should join multiple parameters with &', () => {
        const params = new URLSearchParamsPolyfill('key1=value1&key2=value2');
        expect(params.toString()).toBe('key1=value1&key2=value2');
      });
    });

    describe('forEach', () => {
      it('should iterate over all parameters', () => {
        const params = new URLSearchParamsPolyfill('key1=value1&key2=value2');
        const results: Array<[string, string]> = [];

        params.forEach((value: string, key: string) => {
          results.push([key, value]);
        });

        expect(results).toContainEqual(['key1', 'value1']);
        expect(results).toContainEqual(['key2', 'value2']);
        expect(results).toHaveLength(2);
      });

      it('should call callback with correct context', () => {
        const params = new URLSearchParamsPolyfill('key=value');

        params.forEach((_value: string, _key: string, parent: any) => {
          expect(parent).toBe(params);
        });
      });
    });

    describe('iterators', () => {
      it('should iterate keys', () => {
        const params = new URLSearchParamsPolyfill('key1=value1&key2=value2');
        const keys = Array.from(params.keys());
        expect(keys).toEqual(['key1', 'key2']);
      });

      it('should iterate values', () => {
        const params = new URLSearchParamsPolyfill('key1=value1&key2=value2');
        const values = Array.from(params.values());
        expect(values).toEqual(['value1', 'value2']);
      });

      it('should iterate entries', () => {
        const params = new URLSearchParamsPolyfill('key1=value1&key2=value2');
        const entries = Array.from(params.entries());
        expect(entries).toEqual([
          ['key1', 'value1'],
          ['key2', 'value2'],
        ]);
      });

      it('should be iterable with for...of', () => {
        const params = new URLSearchParamsPolyfill('key1=value1&key2=value2');
        const entries: Array<[string, string]> = [];

        for (const entry of params) {
          entries.push(entry);
        }

        expect(entries).toEqual([
          ['key1', 'value1'],
          ['key2', 'value2'],
        ]);
      });

      it('should include parameters appended during iteration', () => {
        const params = new URLSearchParamsPolyfill('key1=value1');
        const keys = params.keys();

        expect(keys.next()).toEqual({ done: false, value: 'key1' });
        params.append('key2', 'value2');
        expect(keys.next()).toEqual({ done: false, value: 'key2' });
        expect(keys.next()).toEqual({ done: true, value: undefined });
      });

      it('should keep using the captured entries when parameters are deleted during iteration', () => {
        const params = new URLSearchParamsPolyfill('key1=value1&key2=value2&key3=value3');
        const keys = params.keys();

        expect(keys.next()).toEqual({ done: false, value: 'key1' });
        params.delete('key2');
        expect(keys.next()).toEqual({ done: false, value: 'key2' });
        expect(keys.next()).toEqual({ done: false, value: 'key3' });
        expect(keys.next()).toEqual({ done: true, value: undefined });
      });
    });
  });

  describe('installPolyfills', () => {
    it('should install URLSearchParams when not available', () => {
      // 确保 URLSearchParams 不存在
      delete (globalThis as any).URLSearchParams;

      installPolyfills();

      expect((globalThis as any).URLSearchParams).toBeDefined();
    });

    it('should not override existing URLSearchParams', () => {
      const mockURLSearchParams = vi.fn();
      (globalThis as any).URLSearchParams = mockURLSearchParams;

      installPolyfills();

      expect((globalThis as any).URLSearchParams).toBe(mockURLSearchParams);
    });

    it('should handle errors gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const descriptor = Object.getOwnPropertyDescriptor(globalThis, 'URLSearchParams');

      Object.defineProperty(globalThis, 'URLSearchParams', {
        configurable: true,
        get: () => {
          throw new Error('URLSearchParams access error');
        },
      });

      try {
        expect(() => installPolyfills()).not.toThrow();
      } finally {
        if (descriptor) Object.defineProperty(globalThis, 'URLSearchParams', descriptor);
        else Reflect.deleteProperty(globalThis, 'URLSearchParams');
      }
      expect(consoleSpy).toHaveBeenCalledWith(
        '[sentry-miniapp] Failed to install polyfills:',
        expect.any(Error),
      );

      consoleSpy.mockRestore();
    });
  });

  describe('ensurePolyfills', () => {
    it('should call installPolyfills', () => {
      // Since ensurePolyfills calls installPolyfills internally,
      // we just verify it doesn't throw
      expect(() => ensurePolyfills()).not.toThrow();
    });
  });

  describe('getGlobalObject detection', () => {
    const withoutGlobalNames = <T>(
      configure: (root: any) => void,
      callback: (root: any) => T,
    ): T => {
      const root = globalThis as any;
      const descriptors = new Map(
        ['globalThis', 'window', 'global', 'self', 'Function'].map(name => [
          name,
          Object.getOwnPropertyDescriptor(root, name),
        ]),
      );

      try {
        for (const name of ['globalThis', 'window', 'global', 'self']) {
          Reflect.deleteProperty(root, name);
        }
        configure(root);
        return callback(root);
      } finally {
        for (const [name, descriptor] of descriptors) {
          if (descriptor) Object.defineProperty(root, name, descriptor);
          else Reflect.deleteProperty(root, name);
        }
      }
    };

    it('should detect wx global object', () => {
      const mockWx = { request: vi.fn() };
      (global as any).Function = vi.fn().mockReturnValue({ wx: mockWx }) as any;

      installPolyfills();

      // Should not throw and should work with wx environment
      expect(() => installPolyfills()).not.toThrow();
    });

    it('should detect my global object', () => {
      const mockMy = { request: vi.fn() };
      (global as any).Function = vi.fn().mockReturnValue({ my: mockMy }) as any;

      installPolyfills();

      expect(() => installPolyfills()).not.toThrow();
    });

    it('should detect swan global object', () => {
      const mockSwan = { request: vi.fn() };
      (global as any).Function = vi.fn().mockReturnValue({ swan: mockSwan }) as any;

      installPolyfills();

      expect(() => installPolyfills()).not.toThrow();
    });

    it('should detect tt global object', () => {
      const mockTt = { request: vi.fn() };
      (global as any).Function = vi.fn().mockReturnValue({ tt: mockTt }) as any;

      installPolyfills();

      expect(() => installPolyfills()).not.toThrow();
    });

    it('should detect qq global object', () => {
      const mockQq = { request: vi.fn() };
      (global as any).Function = vi.fn().mockReturnValue({ qq: mockQq }) as any;

      installPolyfills();

      expect(() => installPolyfills()).not.toThrow();
    });

    it('should handle case when no global object is detected', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      withoutGlobalNames(
        root => {
          root.Function = vi.fn(() => {
            throw new Error('Function blocked by CSP');
          });
        },
        () => installPolyfills(),
      );

      expect(consoleSpy).toHaveBeenCalledWith(
        '[sentry-miniapp] Unable to detect global object, polyfills may not work correctly',
      );

      consoleSpy.mockRestore();
    });

    it.each(['window', 'global', 'self'] as const)(
      'should use the %s fallback when newer global names are unavailable',
      fallbackName => {
        let fallback: any;
        withoutGlobalNames(
          root => {
            fallback = {};
            root[fallbackName] = fallback;
          },
          () => installPolyfills(),
        );

        expect(fallback.URLSearchParams).toBeDefined();
      },
    );

    it('should use Function as the final global fallback', () => {
      const installed = withoutGlobalNames(
        () => {},
        root => {
          installPolyfills();
          return typeof root.URLSearchParams === 'function';
        },
      );

      expect(installed).toBe(true);
    });
  });
});
