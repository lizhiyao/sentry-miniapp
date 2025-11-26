import { TransactionContext } from '@sentry/types';
import { getGlobalObject } from '@sentry/utils';
import { sdk } from '../../crossPlatform';

type StartTransactionCallback<T> = (context: TransactionContext) => T | undefined;

/**
 * Instruments miniapp route changes using `onAppRoute` where available.
 * Starts a navigation transaction for the first page load and subsequent route changes.
 */
export function instrumentRoutingWithDefaults<T extends { finish?: () => void }>(
  startTransaction: StartTransactionCallback<T>,
  startTransactionOnPageLoad: boolean = true,
  startTransactionOnLocationChange: boolean = true,
): void {
  const globalObj = getGlobalObject<{ wx?: any }>();
  const onAppRoute: ((callback: (options: any) => void) => void) | undefined =
    (sdk as any).onAppRoute || (globalObj.wx && globalObj.wx.onAppRoute);

  if (typeof onAppRoute !== 'function') {
    return;
  }

  let hasStartedFirstRoute = false;
  let activeRouteTransaction: T | undefined;

  const startRouteTransaction = (context: TransactionContext, isFirstRoute: boolean) => {
    const shouldStart =
      (isFirstRoute && startTransactionOnPageLoad) || (!isFirstRoute && startTransactionOnLocationChange);

    if (!shouldStart) {
      return;
    }

    if (activeRouteTransaction && typeof activeRouteTransaction.finish === 'function') {
      activeRouteTransaction.finish();
    }

    activeRouteTransaction = startTransaction(context);
  };

  const handleRoute = (routeOptions: any, isFirstRoute: boolean = false) => {
    const path = routeOptions?.path || routeOptions?.route || routeOptions?.url || '';
    const name = typeof path === 'string' && path.length > 0 ? path : 'unknown-route';

    startRouteTransaction(
      {
        name,
        op: 'navigation',
        description: routeOptions?.openType || routeOptions?.event || undefined,
        metadata: { requestPath: name },
      },
      isFirstRoute,
    );
  };

  if (startTransactionOnPageLoad && typeof (globalObj as any).getCurrentPages === 'function') {
    const pages = (globalObj as any).getCurrentPages() || [];
    const current = pages[pages.length - 1];
    if (current && current.route) {
      hasStartedFirstRoute = true;
      handleRoute({ path: current.route }, true);
    }
  }

  onAppRoute(options => {
    const isFirstRoute = !hasStartedFirstRoute;
    hasStartedFirstRoute = true;
    handleRoute(options, isFirstRoute);
  });
}
