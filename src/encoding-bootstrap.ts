// 字节编码属于宿主传输适配，两个入口均保留 Core 的公开 encoder 回退。
import { ensureEnvelopeEncoding } from './coreCompat';

ensureEnvelopeEncoding();
