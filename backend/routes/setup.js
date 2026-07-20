const express = require('express');
const { User } = require('../models/User');
const { validatePasswordStrength } = require('../utils/passwordPolicy');

const router = express.Router();

const USERNAME_PATTERN = /^[a-zA-Z0-9_.]{3,30}$/;

router.get('/status', async (req, res, next) => {
  try {
    const userCount = await User.countDocuments();
    res.status(200).json({
      success: true,
      isInitialized: userCount > 0
    });
  } catch (error) {
    next(error);
  }
});

router.post('/create-owner', async (req, res, next) => {
  try {
    const { fullName, username, password, confirmPassword } = req.body;

    if (!fullName || !fullName.trim()) {
      return res.status(400).json({ success: false, message: 'Full name is required' });
    }

    if (!username || !username.trim()) {
      return res.status(400).json({ success: false, message: 'Username is required' });
    }

    const normalizedUsername = username.trim().toLowerCase();

    if (!USERNAME_PATTERN.test(normalizedUsername)) {
      return res.status(400).json({
        success: false,
        message: 'Username must be 3-30 characters and contain only letters, numbers, dots, or underscores'
      });
    }

    if (!password || !confirmPassword) {
      return res.status(400).json({ success: false, message: 'Password and confirmation are required' });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({ success: false, message: 'Passwords do not match' });
    }

    const passwordError = validatePasswordStrength(password);

    if (passwordError) {
      return res.status(400).json({ success: false, message: passwordError });
    }

    const existingUserCount = await User.countDocuments();

    if (existingUserCount > 0) {
      return res.status(409).json({
        success: false,
        message: 'Setup has already been completed'
      });
    }

    const existingUsername = await User.findOne({ username: normalizedUsername });

    if (existingUsername) {
      return res.status(409).json({ success: false, message: 'Username is already taken' });
    }

    const owner = await User.create({
      fullName: fullName.trim(),
      username: normalizedUsername,
      password,
      role: 'Owner',
      isActive: true
    });

    res.status(201).json({
      success: true,
      message: 'Administrator account created successfully',
      user: owner.toSafeObject()
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Username is already taken' });
    }
    next(error);
  }
});

module.exports = router;
