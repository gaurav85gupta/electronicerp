const mongoose = require('mongoose');
const { verifyToken } = require('../utils/token');
const { User } = require('../models/User');

async function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, message: 'Authentication required' });
  }

  const token = authHeader.split(' ')[1];
  let decoded;

  try {
    decoded = verifyToken(token);
  } catch (error) {
    // Token itself is invalid, malformed, or expired — this is a real session problem.
    return res.status(401).json({ success: false, message: 'Invalid or expired session' });
  }

  // Token is valid at this point. Any failure from here on (e.g. the database
  // being unreachable) is a temporary server-side problem, not an invalid session,
  // so it should NOT force the user back to the login screen.
  try {
    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Unable to reach the database. Please try again in a moment',
        code: 'DB_UNAVAILABLE'
      });
    }

    const user = await User.findById(decoded.id);

    if (!user || !user.isActive) {
      return res.status(401).json({ success: false, message: 'Session is no longer valid' });
    }

    req.user = user;
    next();
  } catch (error) {
    // A DB/network error while looking up the user — not a session validity issue.
    return res.status(503).json({
      success: false,
      message: 'Unable to reach the database. Please try again in a moment',
      code: 'DB_UNAVAILABLE'
    });
  }
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ success: false, message: 'Insufficient permissions' });
    }
    next();
  };
}

module.exports = { requireAuth, requireRole };
