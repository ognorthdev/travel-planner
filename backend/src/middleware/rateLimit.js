const { rateLimit, ipKeyGenerator } = require('express-rate-limit');

// All limiters key on the authenticated user (they mount after requireAuth),
// falling back to IP for safety. Per-user buckets match how cost is incurred —
// behind Render's proxy IPs are shared, and the goal is stopping a runaway
// loop or leaked token from burning the API budget, not throttling households.
const userKey = (req) => req.user?.id ?? ipKeyGenerator(req.ip);

const limiterDefaults = {
  standardHeaders: true, // RateLimit-* + Retry-After headers
  legacyHeaders: false,
  keyGenerator: userKey,
};

// LLM-backed endpoints: research streams, extraction, discover. Each call is
// a multi-cent model call; a human won't sustain more than ~2/min.
const aiLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: 5 * 60 * 1000,
  limit: 10,
  message: { error: 'Too many AI requests — please wait a few minutes and try again.', code: 'RATE_LIMITED' },
});

// Google Places-backed endpoints: cheaper per call and mostly cached after the
// first hit, but autocomplete fires in per-keystroke bursts, so more headroom.
const enrichLimiter = rateLimit({
  ...limiterDefaults,
  windowMs: 5 * 60 * 1000,
  limit: 60,
  message: { error: 'Too many lookup requests — please wait a few minutes and try again.', code: 'RATE_LIMITED' },
});

module.exports = { aiLimiter, enrichLimiter };
