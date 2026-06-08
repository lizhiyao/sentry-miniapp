import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

/**
 * isMinigame() 真值表测试。通过增删全局 wx / App / Page / getCurrentPages / GameGlobal，
 * 并在每个用例内 resetModules + 动态 import，确保检测缓存被重置。
 */
describe('isMinigame', () => {
  const g = global as any;
  let savedWx: any;

  beforeEach(() => {
    savedWx = g.wx;
    jest.resetModules();
    delete g.App;
    delete g.Page;
    delete g.getCurrentPages;
    delete g.GameGlobal;
  });

  afterEach(() => {
    g.wx = savedWx;
    delete g.App;
    delete g.Page;
    delete g.getCurrentPages;
    delete g.GameGlobal;
  });

  it('平台存在且无 App/Page/getCurrentPages → 判定为小游戏', async () => {
    g.wx = { request: jest.fn() };
    const { isMinigame } = await import('../src/crossPlatform');
    expect(isMinigame()).toBe(true);
  });

  it('平台存在且 App/Page/getCurrentPages 都在 → 判定为小程序（非小游戏）', async () => {
    g.wx = { request: jest.fn() };
    g.App = () => {};
    g.Page = () => {};
    g.getCurrentPages = () => [];
    const { isMinigame } = await import('../src/crossPlatform');
    expect(isMinigame()).toBe(false);
  });

  it('存在全局 GameGlobal → 判定为小游戏（即便 App 存在）', async () => {
    g.wx = { request: jest.fn() };
    g.App = () => {};
    g.GameGlobal = {};
    const { isMinigame } = await import('../src/crossPlatform');
    expect(isMinigame()).toBe(true);
  });

  it('未检测到任何平台 → 非小游戏', async () => {
    delete g.wx;
    const { isMinigame } = await import('../src/crossPlatform');
    expect(isMinigame()).toBe(false);
  });

  it('resetMinigameCache 可清除缓存以便重新检测', async () => {
    g.wx = { request: jest.fn() };
    const mod = await import('../src/crossPlatform');
    expect(mod.isMinigame()).toBe(true);
    mod.resetMinigameCache();
    expect(mod.isMinigame()).toBe(true);
  });
});
