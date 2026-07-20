const { User } = require('../models/User');

async function seedDefaultOwner(logger) {
  const userCount = await User.countDocuments();

  if (userCount > 0) {
    return;
  }

  const defaultUsername = process.env.DEFAULT_OWNER_USERNAME;
  const defaultPassword = process.env.DEFAULT_OWNER_PASSWORD;
  const defaultFullName = process.env.DEFAULT_OWNER_FULLNAME || 'System Owner';

  if (!defaultUsername || !defaultPassword) {
    logger.warn('No users found and DEFAULT_OWNER_USERNAME/PASSWORD are not set. Skipping owner seed');
    return;
  }

  await User.create({
    fullName: defaultFullName,
    username: defaultUsername,
    password: defaultPassword,
    role: 'Owner',
    isActive: true
  });

  logger.info(`Default Owner account created for username: ${defaultUsername}`);
}

module.exports = { seedDefaultOwner };
