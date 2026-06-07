const rateLimit = require('express-rate-limit')

const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: 'TooManyRequests', message: 'Too many requests, please try again later.' })
  },
})

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: 'TooManyRequests', message: 'Too many auth attempts, please try again later.' })
  },
})

const webhookLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 500,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (req, res) => {
    res.status(429).json({ error: 'TooManyRequests', message: 'Too many webhook requests, please try again later.' })
  },
})

module.exports = { generalLimiter, authLimiter, webhookLimiter }
