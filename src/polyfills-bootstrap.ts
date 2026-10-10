/** 公共入口先于 Core 的静态依赖求值补齐运行时标准能力。 */
import 'core-js/modules/es.global-this.js';
import 'core-js/modules/es.array.includes.js';
import 'core-js/modules/es.object.entries.js';
import 'core-js/modules/es.object.values.js';
import 'core-js/modules/es.object.from-entries.js';
import 'core-js/modules/es.promise.all-settled.js';
import 'core-js/modules/es.string.is-well-formed.js';
import 'core-js/modules/es.string.to-well-formed.js';
import URLSearchParams from 'core-js-pure/web/url-search-params.js';
import { ensureEnvelopeEncoding, ensureURLSearchParams } from './coreCompat';

// 仅安装 Core 所需的查询参数能力；可用宿主实现不依赖完整 URL。
ensureURLSearchParams(URLSearchParams);
ensureEnvelopeEncoding();
