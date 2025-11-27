/**
 * Minimal URLSearchParams ponyfill for miniapp runtimes which don't provide it.
 * Supports constructor with string, array tuples, or record objects and implements
 * append + toString which are all we rely on for auth query encoding.
 */
const GLOBAL_OBJ =
  // eslint-disable-next-line no-undef
  (typeof globalThis !== 'undefined' && globalThis) ||
  // eslint-disable-next-line no-undef
  (typeof self !== 'undefined' && self) ||
  // eslint-disable-next-line no-undef
  (typeof window !== 'undefined' && window) ||
  // eslint-disable-next-line no-undef
  (typeof global !== 'undefined' && global) ||
  {};

type InitType =
  | string
  | Array<[string, string]>
  | Record<string, string | number | boolean | null | undefined>;

class MiniappURLSearchParams {
  private readonly _entries: Array<[string, string]> = [];

  public constructor(init?: InitType) {
    if (!init) {
      return;
    }

    if (typeof init === 'string') {
      const query = init.startsWith('?') ? init.slice(1) : init;
      if (query.length > 0) {
        query.split('&').forEach(pair => {
          if (!pair) {
            return;
          }
          const [key, value = ''] = pair.split('=');
          this.append(decodeURIComponent(key), decodeURIComponent(value));
        });
      }
      return;
    }

    if (Array.isArray(init)) {
      init.forEach(([key, value]) => this.append(key, value));
      return;
    }

    Object.keys(init).forEach(key => {
      const value = init[key];
      if (value === undefined || value === null) {
        return;
      }
      this.append(key, String(value));
    });
  }

  public append(key: string, value: string): void {
    this._entries.push([key, value]);
  }

  public toString(): string {
    return this._entries
      .map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
      .join('&');
  }
}

// Only patch when missing to avoid clobbering native implementations.
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-ignore
if (!GLOBAL_OBJ.URLSearchParams) {
  // eslint-disable-next-line @typescript-eslint/ban-ts-comment
  // @ts-ignore
  GLOBAL_OBJ.URLSearchParams = MiniappURLSearchParams;
}
