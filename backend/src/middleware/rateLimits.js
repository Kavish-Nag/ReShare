import rateLimit from 'express-rate-limit';

// shortcut: counters live in each API task's memory, so with N tasks the effective limit is up to N times higher.
// Upgrade to a shared store (ElastiCache/Redis) or an AWS WAF rate-based rule when you need exact limits.
function limiter(limit, windowMinutes, extra = {}) {
  return rateLimit({
    limit,
    windowMs: windowMinutes * 60 * 1000,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: (req, res) => res.status(429).json({ error: 'Too many requests. Please wait a few minutes and try again.' }),
    ...extra
  });
}

const perUser = req => req.user?.id || req.ip;

export const globalLimiter = limiter(600, 15);
export const loginLimiter = limiter(10, 15, { skipSuccessfulRequests: true });
export const registerLimiter = limiter(5, 60);
export const orderLimiter = limiter(20, 15, { keyGenerator: perUser });
export const barcodeLimiter = limiter(30, 15, { keyGenerator: perUser });
// Each photo recognition is a paid Rekognition call.
export const identifyLimiter = limiter(20, 15, { keyGenerator: perUser });
