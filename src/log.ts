/**
 * Rate-limited warnings for failures that must not break the editing session
 * but should not be invisible either (a failed save, a dropped frame, a
 * throwing hook). At most one line per key per minute, so a misbehaving client
 * cannot flood the log.
 *
 * @module
 */

const INTERVAL_MS = 60_000;
const lastLogged = new Map<string, number>();

/** Log `message` and `err` unless the same `key` was logged in the last minute. */
export function warnThrottled(
  key: string,
  message: string,
  err: unknown,
  now: number = Date.now(),
): void {
  const last = lastLogged.get(key);
  if (last !== undefined && now - last < INTERVAL_MS) return;
  lastLogged.set(key, now);
  console.warn(`[inline-edit] ${message}:`, err);
}

/** Test helper: forget what has been logged. */
export function resetWarnThrottle(): void {
  lastLogged.clear();
}
