// Best-effort per-IP sliding-window rate limiter (in-memory).
//
// Same caveat as the cache: memory isn't shared across serverless instances, so
// a determined attacker spread across cold starts could exceed the limit. It's
// enough to stop a single tab/script from draining the monthly API quota. For a
// hard global limit, back this with Upstash Redis (see README).

interface Window {
  count: number;
  resetAt: number;
}

const hits = new Map<string, Window>();
const MAX_KEYS = 5000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number;
}

export function rateLimit(key: string, limit: number, windowMs: number): RateLimitResult {
  const now = Date.now();
  let w = hits.get(key);

  if (!w || now > w.resetAt) {
    if (hits.size >= MAX_KEYS) {
      const oldest = hits.keys().next().value;
      if (oldest !== undefined) hits.delete(oldest);
    }
    w = { count: 0, resetAt: now + windowMs };
    hits.set(key, w);
  }

  w.count += 1;
  const allowed = w.count <= limit;
  return {
    allowed,
    remaining: Math.max(0, limit - w.count),
    resetAt: w.resetAt,
  };
}
