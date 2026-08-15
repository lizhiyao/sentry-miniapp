/**
 * SDK 入口专用的 polyfill 启动模块。
 *
 * 作为 index.ts 的首个 side-effect import，它会在其余静态依赖求值前安装运行时缺失能力；
 * polyfills.ts 本身仍保持无导入副作用，便于工具函数单测和按需复用。
 */
import { ensurePolyfills } from './polyfills';

ensurePolyfills();
