import { describe, expect, it } from 'vitest';
import { assertDefined } from './support/envelopes';
import {
  EXTRA_SENSITIVE_KEY_SNIPPETS,
  collectBody,
  collectKeyValueData,
  collectQueryString,
  collectUrl,
  resolveMaxBodyBytes,
  sanitizeCollectedData,
  truncateToBytes,
  utf8ByteLength,
} from '../src/dataCollection';

function fakeClient(dataCollection: Record<string, unknown> = {}): any {
  return { getDataCollectionOptions: () => dataCollection };
}

describe('dataCollection 适配层', () => {
  it('core 内置片段与追加片段过滤真实采集值，非敏感字段仍保留', () => {
    expect(
      collectKeyValueData(
        { AccessToken: 'secret', SID: 'session', memberNo: 'member', label: 'visible' },
        fakeClient(),
        ['memberNo'],
      ),
    ).toEqual({
      AccessToken: '[Filtered]',
      SID: '[Filtered]',
      memberNo: '[Filtered]',
      label: 'visible',
    });
  });

  it('maxRequestBodySize 与 core 各家 SDK 的档位一致', () => {
    expect(resolveMaxBodyBytes('small')).toBe(1000);
    expect(resolveMaxBodyBytes('medium')).toBe(10_000);
    expect(resolveMaxBodyBytes(512)).toBe(512);
    expect(resolveMaxBodyBytes(undefined)).toBe(1024 * 1024);
    // 0 与负数不是合法上限，回落到默认值而不是把体截成空。
    expect(resolveMaxBodyBytes(0)).toBe(1024 * 1024);
    expect(resolveMaxBodyBytes(-5)).toBe(1024 * 1024);
    expect(resolveMaxBodyBytes(Infinity)).toBe(1024 * 1024);
    expect(resolveMaxBodyBytes(NaN)).toBe(1024 * 1024);
    expect(resolveMaxBodyBytes(1.5)).toBe(1024 * 1024);
  });

  it('按码点算 UTF-8 字节，不依赖宿主的 TextEncoder', () => {
    expect(utf8ByteLength('abc')).toBe(3);
    expect(utf8ByteLength('中文')).toBe(6);
    expect(utf8ByteLength('🙂')).toBe(4);
    expect(utf8ByteLength('\ud800x\udc00')).toBe(7);
  });

  it('截断按字节且不劈开多字节字符', () => {
    const truncated = truncateToBytes('中文中文', 8);
    expect(truncated.endsWith('...')).toBe(true);
    expect(utf8ByteLength(truncated)).toBeLessThanOrEqual(8);
    // 预算里塞不下第二个汉字，只留第一个汉字 + 省略号。
    expect(truncated).toBe('中...');
    expect(truncateToBytes('abc', 10)).toBe('abc');
  });

  it.each([0, 1, 2, 3])('极小截断预算 %i 不被省略号突破', (budget) => {
    expect(utf8ByteLength(truncateToBytes('中文🙂abcdef', budget))).toBeLessThanOrEqual(budget);
  });

  it.each([-1, NaN, Infinity, 1.5])('直接传入非法截断预算 %s 不返回原文', (budget) => {
    expect(truncateToBytes('sensitive original body', budget)).toBe('');
  });

  it('请求体先脱敏再截断，体积按截断前的完整字节数记', () => {
    const body = JSON.stringify({ accessToken: 'at-1', note: 'x'.repeat(400) });
    const collected = collectBody(body, fakeClient(), 50);

    expect(collected.byteLength).toBe(utf8ByteLength(body));
    expect(collected.body).toContain('[Filtered]');
    assertDefined(collected.body);
    // 截断发生在脱敏之后，半截 JSON 也不能把敏感值带出去。
    expect(collected.body).not.toContain('at-1');
    expect(utf8ByteLength(collected.body)).toBeLessThanOrEqual(50);
  });

  it('form-urlencoded 独立脱敏，非结构化体只记录大小', () => {
    const form = collectBody('id=7&token=t-2&name=xiao', fakeClient(), 1000);
    expect(form.body).toBe('id=7&token=[Filtered]&name=xiao');

    // 未知正文不能因 query 开关放行，也不把它当成键值数据宣称已脱敏。
    const plain = collectBody('just a plain text', fakeClient({ urlQueryParams: false }), 1000);
    expect(plain).toEqual({ byteLength: 17 });
  });

  it('数组结构保持数组，不塌成对象', () => {
    const sanitized = sanitizeCollectedData([{ token: 't' }, { id: 1 }], true) as unknown[];
    expect(Array.isArray(sanitized)).toBe(true);
    expect(sanitized).toEqual([{ token: '[Filtered]' }, { id: 1 }]);
  });

  it('未知格式对象不调用 JSON serializer 或伪造编码大小', () => {
    const data = {
      toJSON: () => {
        throw new Error('must not serialize');
      },
    };
    expect(collectBody(data, fakeClient(), 1000, [], 'multipart/form-data')).toEqual({});
    expect(collectBody(new Date(), fakeClient(), 1000)).toEqual({});
    expect(collectBody({ toJSON: () => undefined }, fakeClient(), 1000)).toEqual({});
  });

  it.each([true, false, { allow: ['token', 'memberNo', 'card_number'] }])(
    'form body 脱敏独立于 query 策略 %j，保留重复键和原编码',
    (urlQueryParams) => {
      const form = collectBody(
        'id=7&id=8&access%54oken=canary-token&memberNo=canary-member&card_number=canary-card&name=xiao+ming',
        fakeClient({ urlQueryParams }),
        1000,
        ['memberNo'],
      );
      expect(form.body).toBe(
        'id=7&id=8&access%54oken=[Filtered]&memberNo=[Filtered]&card_number=[Filtered]&name=xiao+ming',
      );
      expect(form.body).not.toContain('canary');
    },
  );

  it('form 键无法安全解码时省略正文，仍报告原始字节数', () => {
    const body = 'tok%FFen=canary-token&id=7';
    expect(collectBody(body, fakeClient(), 1000)).toEqual({ byteLength: utf8ByteLength(body) });
  });

  it('query 保留重复编码，只过滤值；坏键与原型键不能降级泄漏', () => {
    expect(
      collectQueryString('id=1&id=2&access%54oken=secret&memberNo=m', fakeClient(), ['memberNo']),
    ).toBe('id=1&id=2&access%54oken=[Filtered]&memberNo=[Filtered]');
    expect(collectQueryString('tok%FFen=secret', fakeClient())).toBeUndefined();
    expect(collectQueryString('__proto__=secret', fakeClient(), ['proto'])).toBe(
      '__proto__=[Filtered]',
    );
    expect(
      collectUrl('https://user:secret@example.com/path?tok%FFen=secret#fragment', fakeClient()),
    ).toBe('https://[filtered]:[filtered]@example.com/path');
    expect(collectUrl('javascript:alert(secret)?token=secret#fragment', fakeClient())).toBe(
      'javascript:[Filtered]',
    );
    expect(collectUrl(undefined as any, fakeClient())).toBe('');
  });

  it('无法读取宿主 getter 时省略采集，不影响业务', () => {
    expect(
      collectKeyValueData(
        {
          get id() {
            throw new Error('host getter');
          },
        },
        fakeClient(),
      ),
    ).toBeUndefined();
  });

  it('本 SDK 补齐的支付与证件片段只在键值数据里生效', () => {
    const kv = collectKeyValueData({ cardNumber: '6222', id: '9' }, fakeClient());
    expect(kv).toEqual({ cardNumber: '[Filtered]', id: '9' });

    // core 的 query 过滤不吃我们的追加名单，这里保持与 core 一致。
    const url = collectBody('{"cardNumber":"6222"}', fakeClient(), 1000);
    expect(url.body).toBe('{"cardNumber":"[Filtered]"}');
    expect(EXTRA_SENSITIVE_KEY_SNIPPETS).toContain('card_number');
  });

  it('sensitiveKeys 之类的追加片段按片段匹配，大小写不敏感', () => {
    const collected = collectBody('{"memberNo":"m-1","name":"xiao"}', fakeClient(), 1000, [
      'memberNo',
    ]);
    assertDefined(collected.body);
    expect(JSON.parse(collected.body)).toEqual({ memberNo: '[Filtered]', name: 'xiao' });
  });

  it('urlQueryParams=false 时整块键值数据不采', () => {
    expect(collectKeyValueData({ id: '9' }, fakeClient({ urlQueryParams: false }))).toBeUndefined();
    expect(collectKeyValueData({ id: '9' }, { getOptions: () => ({}) } as any)).toMatchObject({
      id: '9',
    });
  });

  it('deny 与 allow 走 core 的 CollectBehavior 语义', () => {
    expect(
      collectKeyValueData(
        { phone: '138', id: '9' },
        fakeClient({ urlQueryParams: { deny: ['phone'] } }),
      ),
    ).toEqual({ phone: '[Filtered]', id: '9' });
    expect(
      collectKeyValueData(
        { phone: '138', id: '9' },
        fakeClient({ urlQueryParams: { allow: ['id'] } }),
      ),
    ).toEqual({ phone: '[Filtered]', id: '9' });
  });

  it('自引用与超深结构不递归爆栈，深过上限的值按 Filtered 处理', () => {
    const cyclic: Record<string, any> = { id: '9' };
    cyclic.self = cyclic;

    expect(() => collectKeyValueData(cyclic, fakeClient())).not.toThrow();

    const deep = collectKeyValueData(
      { deep: { a: { b: { c: { d: { token: 't' } } } } } },
      fakeClient(),
    );
    // 第 5 层起折成 [Filtered]：core 的 normalize 也不会把这些层完整发出，宁可少留不漏敏感键。
    expect(deep).toEqual({ deep: { a: { b: { c: { d: '[Filtered]' } } } } });
  });
});
