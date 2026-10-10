/**
 * SDK 入口专用的 polyfill 启动模块。
 *
 * 作为 index.ts 的首个 side-effect import，它会在其余静态依赖求值前安装运行时缺失能力；
 * polyfills.ts 本身仍保持无导入副作用，便于工具函数单测和按需复用。
 */
// Core 和 SDK 都会调用这些标准方法；只引入所需模块，不替换宿主 Promise 构造器。
import 'core-js/modules/es.global-this.js';
import 'core-js/modules/es.array.includes.js';
import 'core-js/modules/es.object.entries.js';
import 'core-js/modules/es.object.values.js';
import 'core-js/modules/es.object.from-entries.js';
import 'core-js/modules/es.promise.all-settled.js';
import { ensurePolyfills } from './polyfills';
import { ensureEnvelopeEncoding } from './coreCompat';

ensurePolyfills();

ensureEnvelopeEncoding();
