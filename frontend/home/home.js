const API_BASE_URL = 'https://electronicerp-1.onrender.com';

const userGreeting = document.getElementById('user-greeting');
const logoutButton = document.getElementById('logout-button');

function redirectToLogin() {
  sessionStorage.removeItem('erp_token');
  sessionStorage.removeItem('erp_user');
  window.location.href = '../login/login.html';
}

async function validateSession() {
  const token = sessionStorage.getItem('erp_token');

  if (!token) {
    redirectToLogin();
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/session`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      redirectToLogin();
      return;
    }

    userGreeting.textContent = `Signed in as ${data.user.fullName} (${data.user.role})`;
  } catch (error) {
    redirectToLogin();
  }
}

logoutButton.addEventListener('click', async () => {
  const token = sessionStorage.getItem('erp_token');

  try {
    await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
  } finally {
    redirectToLogin();
  }
});

validateSession();
