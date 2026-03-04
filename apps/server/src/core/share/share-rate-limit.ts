export class ShareVerifyRateLimitedError extends Error {
  constructor() {
    super('Share verification rate limited');
  }
}

export class ShareVerifyRateLimiter {
  private readonly entries = new Map<
    string,
    { count: number; windowStart: number; blockedUntil: number }
  >();

  constructor(
    private readonly windowMs = 60 * 1000,
    private readonly maxAttempts = 8,
    private readonly blockMs = 5 * 60 * 1000,
  ) {}

  assertAllowed(key: string) {
    const now = Date.now();
    const existing = this.entries.get(key);

    if (existing?.blockedUntil && existing.blockedUntil > now) {
      throw new ShareVerifyRateLimitedError();
    }

    if (!existing || now - existing.windowStart > this.windowMs) {
      this.entries.set(key, {
        count: 1,
        windowStart: now,
        blockedUntil: 0,
      });
      return;
    }

    const next = { ...existing, count: existing.count + 1 };
    if (next.count > this.maxAttempts) {
      next.blockedUntil = now + this.blockMs;
      this.entries.set(key, next);
      throw new ShareVerifyRateLimitedError();
    }

    this.entries.set(key, next);
  }

  clear(key: string) {
    this.entries.delete(key);
  }
}
