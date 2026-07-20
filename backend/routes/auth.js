const express = require('express');
const { User } = require('../models/User');
const { generateToken } = require('../utils/token');
const { requireAuth } = require('../middleware/auth');
const { loginRateLimiter, registerFailedAttempt, clearAttempts } = require('../middleware/loginRateLimiter');

const router = express.Router();

router.post('/login', loginRateLimiter, async (req, res, next) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    const user = await User.findOne({ username: username.trim().toLowerCase() }).select('+password');

    if (!user) {
      registerFailedAttempt(req);
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, message: 'This account has been disabled' });
    }

    const isPasswordValid = await user.comparePassword(password);

    if (!isPasswordValid) {
      registerFailedAttempt(req);
      return res.status(401).json({ success: false, message: 'Invalid username or password' });
    }

    clearAttempts(req);

    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user);

    res.status(200).json({
      success: true,
      token,
      user: user.toSafeObject()
    });
  } catch (error) {
    next(error);
  }
});

router.post('/logout', requireAuth, (req, res) => {
  res.status(200).json({ success: true, message: 'Logged out successfully' });
});

router.get('/session', requireAuth, (req, res) => {
  res.status(200).json({ success: true, user: req.user.toSafeObject() });
});

module.exports = router;
