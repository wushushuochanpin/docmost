import {
  ShareVerifyRateLimitedError,
  ShareVerifyRateLimiter,
} from './share-rate-limit';

describe('ShareVerifyRateLimiter', () => {
  it('rate limits after max attempts in the same window', () => {
    const limiter = new ShareVerifyRateLimiter(60_000, 2, 60_000);
    const key = 'workspace:share:ip';

    expect(() => limiter.assertAllowed(key)).not.toThrow();
    expect(() => limiter.assertAllowed(key)).not.toThrow();
    expect(() => limiter.assertAllowed(key)).toThrow(ShareVerifyRateLimitedError);
  });

  it('clears attempts on success reset', () => {
    const limiter = new ShareVerifyRateLimiter(60_000, 1, 60_000);
    const key = 'workspace:share:ip';

    limiter.assertAllowed(key);
    expect(() => limiter.assertAllowed(key)).toThrow(ShareVerifyRateLimitedError);

    limiter.clear(key);
    expect(() => limiter.assertAllowed(key)).not.toThrow();
  });
});
