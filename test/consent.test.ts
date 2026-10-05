import { describe, it, expect, vi } from 'vitest';
import { ConsentController } from '../src/consent';

describe('Consent gate state', () => {
  it('未启用时恒为已授权，启用时默认为未授权', () => {
    const disabled = new ConsentController({ required: false });
    const enabled = new ConsentController({ required: true });
    disabled.setGranted(false);
    expect(disabled.isGranted()).toBe(true);
    expect(enabled.isGranted()).toBe(false);
    enabled.setGranted(true);
    expect(enabled.isGranted()).toBe(true);
    enabled.setGranted(false);
    expect(enabled.isGranted()).toBe(false);
  });

  it('A/B 状态、配置和丢弃回调各自独立，调用方修改配置不能改变已构造实例', () => {
    const onA = vi.fn();
    const onB = vi.fn();
    const config = { required: true, cacheLimit: 1, onDrop: onA };
    const first = new ConsentController(config);
    config.required = false;
    config.cacheLimit = 100;
    config.onDrop = onB;
    const second = new ConsentController({ required: true, cacheLimit: 2, onDrop: onB });
    second.setGranted(true);
    expect(first.isGranted()).toBe(false);
    expect(first.config.cacheLimit).toBe(1);
    first.notifyDrop('count', 2);
    second.notifyDrop('age', 1);
    expect(onA).toHaveBeenCalledWith({ reason: 'count', dropped: 2 });
    expect(onB).toHaveBeenCalledWith({ reason: 'age', dropped: 1 });
  });

  it('丢弃通知只在启用门禁及正计数时触发，同意后仍通知且回调异常被隔离', () => {
    const onDrop = vi.fn();
    const disabled = new ConsentController({ required: false, onDrop });
    disabled.notifyDrop('count', 1);
    const enabled = new ConsentController({ required: true, onDrop });
    enabled.notifyDrop('count', 0);
    expect(onDrop).not.toHaveBeenCalled();
    enabled.setGranted(true);
    enabled.notifyDrop('age', 1);
    expect(onDrop).toHaveBeenCalledWith({ reason: 'age', dropped: 1 });
    const throwing = new ConsentController({
      required: true,
      onDrop: () => {
        throw new Error('observer');
      },
    });
    expect(() => throwing.notifyDrop('bytes', 1)).not.toThrow();
    expect(() => new ConsentController({ required: true }).notifyDrop('bytes', 1)).not.toThrow();
  });
});
