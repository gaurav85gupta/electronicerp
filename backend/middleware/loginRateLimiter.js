const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

const attemptsByKey = new Map();

function getKey(req) {
  const username = (req.body && req.body.username) || 'unknown';
  return `${req.ip}:${username.toLowerCase()}`;
}

function loginRateLimiter(req, res, next) {
  const key = getKey(req);
  const now = Date.now();
  const record = attemptsByKey.get(key);

  if (record && now - record.firstAttempt < WINDOW_MS && record.count >= MAX_ATTEMPTS) {
    return res.status(429).json({
      success: false,
      message: 'Too many login attempts. Please try again later'
    });
  }

  next();
}

function registerFailedAttempt(req) {
  const key = getKey(req);
  const now = Date.now();
  const record = attemptsByKey.get(key);

  if (!record || now - record.firstAttempt >= WINDOW_MS) {
    attemptsByKey.set(key, { count: 1, firstAttempt: now });
  } else {
    record.count += 1;
  }
}

function clearAttempts(req) {
  attemptsByKey.delete(getKey(req));
}

module.exports = { loginRateLimiter, registerFailedAttempt, clearAttempts };
