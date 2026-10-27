export function createCommunityRateLimiter({ limit, windowMs }) {
  const buckets = new Map();
  return (req, res, next) => {
    const key = req.user?.uid || req.ip || 'unknown';
    const now = Date.now();
    let bucket = buckets.get(key);
    if (!bucket || now - bucket.startedAt >= windowMs) {
      bucket = { startedAt: now, count: 0 };
      buckets.set(key, bucket);
    }
    if (bucket.count >= limit) {
      const retryAfterSeconds = Math.max(1, Math.ceil((bucket.startedAt + windowMs - now) / 1000));
      res.set('Retry-After', String(retryAfterSeconds));
      res.status(429).json({
        success: false,
        message: 'Too many requests. Please wait before trying again.',
      });
      return;
    }
    bucket.count += 1;
    res.set('RateLimit-Limit', String(limit));
    res.set('RateLimit-Remaining', String(Math.max(0, limit - bucket.count)));
    res.set('RateLimit-Reset', String(Math.ceil((bucket.startedAt + windowMs) / 1000)));

    if (buckets.size > 5000) {
      for (const [bucketKey, value] of buckets) {
        if (now - value.startedAt >= windowMs) buckets.delete(bucketKey);
      }
    }
    next();
  };
}
