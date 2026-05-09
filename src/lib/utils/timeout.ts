/**
 * Timeout utility for wrapping async operations
 * Prevents infinite hangs when database/network operations fail to respond
 */

/**
 * Wraps a promise with a timeout. If the promise doesn't resolve within
 * the specified time, it rejects with a timeout error.
 *
 * @param promise - The promise to wrap
 * @param timeoutMs - Timeout in milliseconds
 * @param errorMessage - Custom error message for timeout
 * @returns The result of the promise or throws a timeout error
 */
export async function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  errorMessage = "Operation timed out. Please try again."
): Promise<T> {
  let timeoutId: NodeJS.Timeout;

  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      reject(new Error(errorMessage));
    }, timeoutMs);
  });

  try {
    const result = await Promise.race([promise, timeoutPromise]);
    clearTimeout(timeoutId!);
    return result;
  } catch (error) {
    clearTimeout(timeoutId!);
    throw error;
  }
}

/**
 * Default timeout values for different operation types
 */
export const TIMEOUTS = {
  /** Standard database operations (insert, update, delete) */
  DATABASE_OPERATION: 60000, // 60 seconds (increased for slow network conditions)
  /** Complex settlement operations */
  SETTLEMENT: 120000, // 2 minutes (increased for complex waterfall calculations)
  /** File upload operations */
  FILE_UPLOAD: 180000, // 3 minutes
  /** Quick queries */
  QUERY: 30000, // 30 seconds (increased for heavy queries)
} as const;

/**
 * Wraps a React Query `queryFn` so its execution is bounded by a timeout.
 * If the inner function does not settle within `timeoutMs`, the wrapper
 * rejects with an error — React Query's normal `retry` + `QueryCache.onError`
 * paths then take over instead of leaving the consumer stuck on a skeleton.
 *
 * Why this exists: a fetch that stalls behind the Cloudflare Worker proxy
 * (or any half-open socket) never rejects on its own. Without a timeout,
 * the queryFn promise stays pending forever, so React Query never advances
 * past `isLoading`. Browser refresh becomes the user's only recovery.
 *
 * Use at hook-definition time:
 *   useQuery({
 *     queryKey: [...],
 *     queryFn: wrapQueryFn(async (ctx) => { ... }, { operationName: "useEquipment" }),
 *   });
 *
 * Pairs with the existing `withTimeout(promise, ms)` helper — `wrapQueryFn`
 * is the React-Query-shaped sibling, so the same `TIMEOUTS.QUERY` constant
 * governs both.
 */
// Keep the signature single-argument and `T`-generic so React Query's
// `useQuery` can infer `TQueryFnData` from the original queryFn return type.
// Variadic / Parameters-based forms widen the inferred arg list and silently
// downgrade `useQuery({...}).data` to `{}` at the call site.
//
// The single argument is typed `unknown` because React Query passes a
// QueryFunctionContext to every queryFn, and most hooks ignore it. Hooks
// that need the context (e.g. for AbortSignal) can still type the inner
// arrow's parameter explicitly: `wrapQueryFn(async (ctx) => {...})`.
export function wrapQueryFn<T>(
  fn: (ctx?: unknown) => Promise<T>,
  options: { timeoutMs?: number; operationName?: string } = {},
): (ctx?: unknown) => Promise<T> {
  const { timeoutMs = TIMEOUTS.QUERY, operationName } = options;
  return async (ctx?: unknown) => {
    const message = operationName
      ? `${operationName} timed out after ${timeoutMs}ms`
      : `Query timed out after ${timeoutMs}ms`;
    return withTimeout(fn(ctx), timeoutMs, message);
  };
}
