const API_BASE_URL = 'http://localhost:5000';

async function checkServerHealth() {
  const statusElement = document.getElementById('status-message');

  try {
    const response = await fetch(`${API_BASE_URL}/api/health`);
    const data = await response.json();

    if (data.success) {
      statusElement.textContent = 'Server Running ✅';
      statusElement.classList.add('success');
    } else {
      statusElement.textContent = 'Server responded with an error';
      statusElement.classList.add('error');
    }
  } catch (error) {
    statusElement.textContent = 'Unable to reach server';
    statusElement.classList.add('error');
  }
}

checkServerHealth();
