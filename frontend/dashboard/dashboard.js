const API_BASE_URL = 'https://electronicerp-1.onrender.com';

const userNameEl = document.getElementById('user-name');
const userRoleEl = document.getElementById('user-role');
const userAvatarEl = document.getElementById('user-avatar');
const currentDateEl = document.getElementById('current-date');
const logoutButton = document.getElementById('logout-button');
const sidebarLogoutButton = document.getElementById('sidebar-logout');
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebar = document.getElementById('sidebar');

const summaryTodaysSalesEl = document.getElementById('summary-todays-sales');
const summaryTotalProductsEl = document.getElementById('summary-total-products');
const summaryLowStockEl = document.getElementById('summary-low-stock');
const summaryTotalCustomersEl = document.getElementById('summary-total-customers');

const recentActivityEmptyEl = document.getElementById('recent-activity-empty');
const recentActivityWrapperEl = document.getElementById('recent-activity-wrapper');
const recentActivityBodyEl = document.getElementById('recent-activity-body');

function redirectToLogin() {
  sessionStorage.removeItem('erp_token');
  sessionStorage.removeItem('erp_user');
  window.location.href = '../login/login.html';
}

function getAuthToken() {
  return sessionStorage.getItem('erp_token');
}

function getInitials(fullName) {
  return fullName
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0].toUpperCase())
    .join('');
}

function renderCurrentDate() {
  const today = new Date();
  currentDateEl.textContent = today.toLocaleDateString(undefined, {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  });
}

function formatCurrency(amount) {
  const value = Number(amount) || 0;
  return `₹${value.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function toDateInputValue(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

async function authFetch(path) {
  const token = getAuthToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  return response;
}

async function validateSession(retriesLeft = 2) {
  const token = getAuthToken();

  if (!token) {
    redirectToLogin();
    return;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/session`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    // Server is temporarily unable to reach the database — this is NOT an
    // invalid session. Retry briefly instead of logging the user out.
    if (response.status === 503 && retriesLeft > 0) {
      setTimeout(() => validateSession(retriesLeft - 1), 1500);
      return;
    }

    if (response.status === 503) {
      console.warn('Unable to verify session: database temporarily unavailable');
      return;
    }

    const data = await response.json();

    if (!response.ok || !data.success) {
      redirectToLogin();
      return;
    }

    userNameEl.textContent = data.user.fullName;
    userRoleEl.textContent = data.user.role;
    userAvatarEl.textContent = getInitials(data.user.fullName);

    await applySidebarPermissions();
    loadDashboardData();
  } catch (error) {
    if (retriesLeft > 0) {
      setTimeout(() => validateSession(retriesLeft - 1), 1500);
      return;
    }
    redirectToLogin();
  }
}

async function loadTodaysSales() {
  try {
    const today = toDateInputValue(new Date());
    const response = await authFetch(`/api/reports/sales?dateFrom=${today}&dateTo=${today}&limit=1`);
    const data = await response.json();

    if (response.ok && data.success) {
      summaryTodaysSalesEl.textContent = formatCurrency(data.summary.totalSales);
    } else {
      summaryTodaysSalesEl.textContent = '—';
    }
  } catch (error) {
    summaryTodaysSalesEl.textContent = '—';
  }
}

async function loadTotalProducts() {
  try {
    const response = await authFetch('/api/products?limit=1');
    const data = await response.json();

    if (response.ok && data.success) {
      summaryTotalProductsEl.textContent = data.pagination.totalRecords;
    } else {
      summaryTotalProductsEl.textContent = '—';
    }
  } catch (error) {
    summaryTotalProductsEl.textContent = '—';
  }
}

async function loadLowStockCount() {
  try {
    const response = await authFetch('/api/reports/low-stock?limit=1');
    const data = await response.json();

    if (response.ok && data.success) {
      summaryLowStockEl.textContent = data.pagination.totalRecords;
    } else {
      summaryLowStockEl.textContent = '—';
    }
  } catch (error) {
    summaryLowStockEl.textContent = '—';
  }
}

async function loadTotalCustomers() {
  try {
    const response = await authFetch('/api/customers?limit=1');
    const data = await response.json();

    if (response.ok && data.success) {
      summaryTotalCustomersEl.textContent = data.pagination.totalRecords;
    } else {
      summaryTotalCustomersEl.textContent = '—';
    }
  } catch (error) {
    summaryTotalCustomersEl.textContent = '—';
  }
}

function renderRecentActivity(bills) {
  if (!bills || bills.length === 0) {
    recentActivityEmptyEl.hidden = false;
    recentActivityWrapperEl.hidden = true;
    return;
  }

  recentActivityEmptyEl.hidden = true;
  recentActivityWrapperEl.hidden = false;

  recentActivityBodyEl.innerHTML = bills
    .map((bill) => {
      const customerName = bill.customer ? bill.customer.customerName : (bill.customerName || 'Walk-in Customer');
      const billDate = new Date(bill.billDate).toLocaleDateString();
      const statusClass = `status-${bill.status.toLowerCase()}`;

      return `
        <tr>
          <td>${bill.billNumber}</td>
          <td>${billDate}</td>
          <td>${customerName}</td>
          <td>${formatCurrency(bill.grandTotal)}</td>
          <td><span class="status-badge ${statusClass}">${bill.status}</span></td>
        </tr>
      `;
    })
    .join('');
}

async function loadRecentActivity() {
  try {
    const response = await authFetch('/api/billing?limit=5');
    const data = await response.json();

    if (response.ok && data.success) {
      renderRecentActivity(data.data);
    } else {
      renderRecentActivity([]);
    }
  } catch (error) {
    renderRecentActivity([]);
  }
}

function loadDashboardData() {
  loadTodaysSales();
  loadTotalProducts();
  loadLowStockCount();
  loadTotalCustomers();
  loadRecentActivity();
}

async function performLogout() {
  const token = getAuthToken();

  try {
    await fetch(`${API_BASE_URL}/api/auth/logout`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}` }
    });
  } finally {
    redirectToLogin();
  }
}

logoutButton.addEventListener('click', performLogout);
sidebarLogoutButton.addEventListener('click', performLogout);

sidebarToggle.addEventListener('click', () => {
  sidebar.classList.toggle('collapsed');
});

renderCurrentDate();
validateSession();