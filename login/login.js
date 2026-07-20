const API_BASE_URL = 'http://localhost:5000';
const REMEMBERED_USERNAME_KEY = 'erp_remembered_username';

const form = document.getElementById('login-form');
const usernameInput = document.getElementById('username');
const passwordInput = document.getElementById('password');
const rememberCheckbox = document.getElementById('remember-username');
const errorMessage = document.getElementById('error-message');
const loginButton = document.getElementById('login-button');
const loginButtonText = document.getElementById('login-button-text');
const togglePasswordButton = document.getElementById('toggle-password');

function loadRememberedUsername() {
  const rememberedUsername = localStorage.getItem(REMEMBERED_USERNAME_KEY);
  if (rememberedUsername) {
    usernameInput.value = rememberedUsername;
    rememberCheckbox.checked = true;
    passwordInput.focus();
  }
}

async function guardSetupStatus() {
  try {
    const response = await fetch(`${API_BASE_URL}/api/setup/status`);
    const data = await response.json();

    if (data.success && !data.isInitialized) {
      window.location.href = '../setup/setup.html';
    }
  } catch (error) {
    // If the status check fails, remain on the login page; the login
    // request itself will surface a clear connectivity error.
  }
}

function setLoading(isLoading) {
  loginButton.disabled = isLoading;
  loginButtonText.textContent = isLoading ? 'Signing in...' : 'Sign In';
}

function showError(message) {
  errorMessage.textContent = message;
}

function clearError() {
  errorMessage.textContent = '';
}

togglePasswordButton.addEventListener('click', () => {
  const isPassword = passwordInput.type === 'password';
  passwordInput.type = isPassword ? 'text' : 'password';
  togglePasswordButton.textContent = isPassword ? 'Hide' : 'Show';
});

form.addEventListener('submit', async (event) => {
  event.preventDefault();
  clearError();

  const username = usernameInput.value.trim();
  const password = passwordInput.value;

  if (!username) {
    showError('Please enter your username');
    usernameInput.focus();
    return;
  }

  if (!password) {
    showError('Please enter your password');
    passwordInput.focus();
    return;
  }

  setLoading(true);

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username, password })
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      showError(data.message || 'Unable to sign in. Please try again');
      setLoading(false);
      return;
    }

    if (rememberCheckbox.checked) {
      localStorage.setItem(REMEMBERED_USERNAME_KEY, username);
    } else {
      localStorage.removeItem(REMEMBERED_USERNAME_KEY);
    }

    sessionStorage.setItem('erp_token', data.token);
    sessionStorage.setItem('erp_user', JSON.stringify(data.user));

    window.location.href = '../dashboard/dashboard.html';
  } catch (error) {
    showError('Unable to reach the server. Please try again');
    setLoading(false);
  }
});

guardSetupStatus();
loadRememberedUsername();
