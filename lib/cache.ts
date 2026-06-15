// Tiny in-memory TTL cache.
//
// On Vercel each serverless instance has its own memory, and cold starts wipe
// it — so this is a best-effort saver, not a shared cache. It still cuts a large
// share of upstream calls because popular names get repeated within a warm
// instance. For a hard, shared cache across instances, swap this for Upstash
// Redis (see README "Scaling beyond the free quota").

interface Entry<T> {
  value: T;
  expires: number;
}

const store = new Map<string, Entry<unknown>>();

// Bound the map so a flood of unique queries can't grow memory without limit.
const MAX_ENTRIES = 1000;

export function getCached<T>(key: string): T | undefined {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expires) {
    store.delete(key);
    return undefined;
  }
  return hit.value as T;
}

export function setCached<T>(key: string, value: T, ttlMs: number): void {
  if (store.size >= MAX_ENTRIES) {
    // Evict the oldest inserted key (Map preserves insertion order).
    const oldest = store.keys().next().value;
    if (oldest !== undefined) store.delete(oldest);
  }
  store.set(key, { value, expires: Date.now() + ttlMs });
}
