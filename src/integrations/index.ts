export { GlobalHandlers, globalHandlersIntegration } from './globalhandlers';
export { TryCatch, tryCatchIntegration } from './trycatch';
export { LinkedErrors, linkedErrorsIntegration } from './linkederrors';
export { HttpContext, httpContextIntegration } from './httpcontext';
export { Dedupe, dedupeIntegration } from './dedupe';
/** @deprecated 被 HttpContext / MiniappClient context 取代，将在 2.0 移除。 */
export { System } from './system';
/** @deprecated 被 PageBreadcrumbs 取代，将在 2.0 移除。 */
export { Router } from './router';
export { PerformanceIntegration, performanceIntegration } from './performance';
export {
  RewriteFrames,
  normalizeMiniappFrameFilename,
  rewriteFramesIntegration,
} from './rewriteframes';
export { NetworkBreadcrumbs } from './networkbreadcrumbs';
export { PageBreadcrumbs, pageBreadcrumbsIntegration } from './pagebreadcrumbs';
export { ConsoleBreadcrumbs, consoleBreadcrumbsIntegration } from './console';
export { SessionIntegration } from './session';
export { NetworkStatusIntegration } from './networkstatus';
export { MinigameIntegration, minigameIntegration } from './minigame';
export { MinigameFrameRateIntegration, minigameFrameRateIntegration } from './minigame-framerate';
