// src/middleware/rateLimiter.js
const rateLimit = require('express-rate-limit');
const logger = require('../utils/logger');

const createRateLimiter = (windowMs, max, message) => {
  return rateLimit({
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    handler: (req, res) => {
      logger.warn('Rate limit exceeded', {
        ip: req.ip,
        url: req.url,
        userAgent: req.get('User-Agent')
      });
      res.status(429).json({ error: message });
    }
  });
};

// Webhook specific rate limiter
const webhookRateLimit = createRateLimiter(
  1 * 60 * 1000, // 1 minute
  100, // max 100 requests per minute per IP
  'Too many webhook requests'
);

module.exports = webhookRateLimit;
