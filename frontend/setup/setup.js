const API_BASE_URL = 'http://localhost:5000';

const form = document.getElementById('setup-form');
const fullNameInput = document.getElementById('full-name');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const confirmPasswordInput = document.getElementById('confirm-password');
const errorMessage = document.getElementById('error-message');
const setupButton = document.getElementById('setup-button');
const setupButtonText = document.getElementById('setup-button-text');

const USERNAME_PATTERN = /^[a-zA-Z0-9_.]{3,30}$/;

document.querySelectorAll('.toggle-password').forEach((button) => {
  button.addEventListener('click', () => {
    const target = document.getElementById(button.dataset.target);
    const isPassword = target.type === 'password';
    target.type = isPassword ? 'text' : 'password';
    button.textContent = isPassword ? 'Hide' : 'Show';
  });
});

function setLoading(isLoading) {
  setupButton.disabled = isLoading;
  setupButtonText.textContent = isLoading ? 'Creating Account...' : 'Create Admin Account';
}

function showError(message) {
  errorMessage.textContent = message;
}

function clearError() {
  errorMessage.textContent = '';
}

function validatePasswordStrength(password) {
  if (password.length < 8) {
    return 'Password must be at least 8 characters long';
  }
  if (!/[A-Z]/.test(password)) {
    return 'Password must contain at least one uppercase letter';
  }
  if (!/[a-z]/.test(password)) {
    return 'Password must contain at least one lowercase letter';
  }
  if (!/[0-9]/.test(password)) {
    return 'Password must contain at least one number';
  }
  return null;
}

async function checkSetupStatus() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/setup/status`);
    const data = await response.json();

    if (data.success && data.isInitialized) {
      window.location.href = '../login/login.html';
    }
  } catch (error) {
    showError('Unable to reach the server. Please ensure the application is running correctly');
  }
}

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();

  const fullName = fullNameInput.value.trim();
  const username = usernameInput.value.trim();
  const password = passwordInput.value;
  const confirmPassword = confirmPasswordInput.value;

  if (!fullName) {
    showError('Please enter the owner\u2019s full name');
    fullNameInput.focus();
    return;
  }

  if (!username) {
    showError('Please choose a username');
    usernameInput.focus();
    return;
  }

  if (!USERNAME_PATTERN.test(username)) {
    showError('Username must be 3-30 characters and contain only letters, numbers, dots, or underscores');
    usernameInput.focus();
    return;
  }

  if (!password || !confirmPassword) {
    showError('Please enter and confirm your password');
    return;
  }

  if (password !== confirmPassword) {
    showError('Passwords do not match');
    confirmPasswordInput.focus();
    return;
  }

  const passwordError = validatePasswordStrength(password);
  if (passwordError) {
    showError(passwordError);
    passwordInput.focus();
    return;
  }

  setLoading(true);

  try {
    const response = await fetch(`${API_BASE_URL}/api/setup/create-owner`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fullName, username, password, confirmPassword })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      if (response.status === 409) {
        window.location.href = '../login/login.html';
        return;
      }
      showError(data.message || 'Unable to create the administrator account. Please try again');
      setLoading(false);
      return;
    }

    window.location.href = '../login/login.html';
  } catch (error) {
    showError('Unable to reach the server. Please try again');
    setLoading(false);
  }
});

checkSetupStatus();
