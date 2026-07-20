let cache = {
  sessionTimeoutMinutes: 480,
  passwordMinLength: 8,
  loginAttemptLimit: 5,
  forcePasswordChange: false
};

function setSecuritySettings(settings) {
  cache = { ...cache, ...settings };
  return cache;
}

function getSecuritySettings() {
  return cache;
}

module.exports = { setSecuritySettings, getSecuritySettings };
