// 集成使用 factories；保留现有路径工具出口，内部 class 不构成 SDK ABI。
export { globalHandlersIntegration } from './globalhandlers';
export { tryCatchIntegration } from './trycatch';
export { linkedErrorsIntegration } from './linkederrors';
export { httpContextIntegration } from './httpcontext';
export { dedupeIntegration } from './dedupe';
export { performanceIntegration } from './performance';
export { rewriteFramesIntegration, normalizeMiniappFrameFilename } from './rewriteframes';
export {
  networkBreadcrumbsIntegration,
  type NetworkBreadcrumbsOptions,
} from './networkbreadcrumbs';
export { pageBreadcrumbsIntegration } from './pagebreadcrumbs';
export { consoleBreadcrumbsIntegration } from './console';
export { sessionIntegration } from './session';
export { networkStatusIntegration } from './networkstatus';
export { minigameIntegration } from './minigame';
export { minigameFrameRateIntegration } from './minigame-framerate';
