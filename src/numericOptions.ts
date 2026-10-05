/** SDK 容量和时间参数；不参与 core 的采样决策。0 的具体语义由调用方定义。 */
export function resolveNonNegativeInteger(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}
