const API_BASE_URL = 'http://localhost:5000';

/* ============================================================
   DOM REFERENCES — SHELL (same behavior as dashboard.js)
   ============================================================ */

const userNameEl = document.getElementById('user-name');
const userRoleEl = document.getElementById('user-role');
const userAvatarEl = document.getElementById('user-avatar');
const currentDateEl = document.getElementById('current-date');
const logoutButton = document.getElementById('logout-button');
const sidebarLogoutButton = document.getElementById('sidebar-logout');
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebar = document.getElementById('sidebar');
const toastContainer = document.getElementById('toast-container');

/* ============================================================
   DOM REFERENCES — SETTINGS NAV / PANELS
   ============================================================ */

const settingsNav = document.getElementById('settings-nav');
const settingsPanels = document.querySelectorAll('.settings-panel');

/* Business Profile */
const businessProfileForm = document.getElementById('business-profile-form');
const bpFormError = document.getElementById('bp-form-error');
const bpSubmit = document.getElementById('bp-submit');
const bpSubmitText = document.getElementById('bp-submit-text');
const bpLogoPreview = document.getElementById('bp-logo-preview');
const bpLogoInput = document.getElementById('bp-logo-input');
const bpLogoChoose = document.getElementById('bp-logo-choose');
const bpLogoRemove = document.getElementById('bp-logo-remove');
const BUSINESS_PROFILE_FIELDS = [
  'businessName', 'tagline', 'ownerName', 'gstNumber', 'panNumber', 'mobile',
  'alternateMobile', 'email', 'website', 'address', 'city', 'state', 'pincode', 'country'
];
attachMobileInputGuard(document.getElementById('bp-mobile'));
attachMobileInputGuard(document.getElementById('bp-alternateMobile'));
let currentLogoData = '';
let logoWasRemoved = false;

/* User Management */
const userAddButton = document.getElementById('user-add-button');
const usersTableBody = document.getElementById('users-table-body');
const usersLoadingState = document.getElementById('users-loading-state');
const usersEmptyState = document.getElementById('users-empty-state');

const userModalOverlay = document.getElementById('user-modal-overlay');
const userModalTitle = document.getElementById('user-modal-title');
const userModalClose = document.getElementById('user-modal-close');
const userModalCancel = document.getElementById('user-modal-cancel');
const userForm = document.getElementById('user-form');
const userFormError = document.getElementById('user-form-error');
const userModalSubmit = document.getElementById('user-modal-submit');
const userModalSubmitText = document.getElementById('user-modal-submit-text');
const userPasswordGroup = document.getElementById('user-password-group');
const userFieldRole = document.getElementById('user-field-role');
const USER_FIELDS = ['fullName', 'username', 'password', 'role', 'mobile', 'email'];
attachMobileInputGuard(document.getElementById('user-field-mobile'));
let currentEditUserId = null;

const resetPasswordModalOverlay = document.getElementById('reset-password-modal-overlay');
const resetPasswordClose = document.getElementById('reset-password-close');
const resetPasswordCancel = document.getElementById('reset-password-cancel');
const resetPasswordForm = document.getElementById('reset-password-form');
const resetPasswordTarget = document.getElementById('reset-password-target');
const resetPasswordField = document.getElementById('reset-password-field');
const resetPasswordErrorField = document.getElementById('reset-password-error-field');
const resetPasswordFormError = document.getElementById('reset-password-form-error');
const resetPasswordSubmit = document.getElementById('reset-password-submit');
const resetPasswordSubmitText = document.getElementById('reset-password-submit-text');
let resetPasswordUserId = null;

/* Role Permissions */
const permissionsRoleTabs = document.getElementById('permissions-role-tabs');
const permissionsTableBody = document.getElementById('permissions-table-body');
const permissionsLoadingState = document.getElementById('permissions-loading-state');
const permissionsSaveButton = document.getElementById('permissions-save-button');
const permissionsSaveText = document.getElementById('permissions-save-text');
let permissionsState = { modules: [], actions: [], roles: [], permissions: {} };
let activePermissionRole = null;

/* Number Series */
const numberSeriesTableBody = document.getElementById('number-series-table-body');
const numberSeriesLoadingState = document.getElementById('number-series-loading-state');

const seriesModalOverlay = document.getElementById('series-modal-overlay');
const seriesModalClose = document.getElementById('series-modal-close');
const seriesModalCancel = document.getElementById('series-modal-cancel');
const seriesForm = document.getElementById('series-form');
const seriesFormError = document.getElementById('series-form-error');
const seriesModalSubmit = document.getElementById('series-modal-submit');
const seriesModalSubmitText = document.getElementById('series-modal-submit-text');
const seriesFieldPrefix = document.getElementById('series-field-prefix');
const seriesFieldStartingNumber = document.getElementById('series-field-startingNumber');
const seriesFieldNumberLength = document.getElementById('series-field-numberLength');
const seriesPreviewHint = document.getElementById('series-preview-hint');
let currentEditSeriesId = null;

/* Print Settings */
const printSettingsForm = document.getElementById('print-settings-form');
const psFormError = document.getElementById('ps-form-error');
const psSubmit = document.getElementById('ps-submit');
const psSubmitText = document.getElementById('ps-submit-text');
const psInvoiceTemplate = document.getElementById('ps-invoiceTemplate');
const psInvoicePaperSize = document.getElementById('ps-invoicePaperSize');
const psPrinterName = document.getElementById('ps-printerName');
const psPrinterNameHint = document.getElementById('ps-printerName-hint');
const PAPER_SIZES = ['A4', 'A5', 'Thermal 80mm', 'Thermal 58mm'];
// Phase 20.11: the only two templates the system supports today —
// must stay in lockstep with invoiceEngine.js's
// INVOICE_TEMPLATE_SETTING_VALUES (the actual selection logic) and
// server.js's validatePrintSettingsBody (the API-boundary check).
const INVOICE_TEMPLATES = ['A4 Professional', 'A5 Retail'];

/* Security Settings */
const securitySettingsForm = document.getElementById('security-settings-form');
const ssFormError = document.getElementById('ss-form-error');
const ssSubmit = document.getElementById('ss-submit');
const ssSubmitText = document.getElementById('ss-submit-text');

/* Application Settings */
const appSettingsForm = document.getElementById('app-settings-form');
const asFormError = document.getElementById('as-form-error');
const asSubmit = document.getElementById('as-submit');
const asSubmitText = document.getElementById('as-submit-text');
const asCurrency = document.getElementById('as-currency');
const asDateFormat = document.getElementById('as-dateFormat');
const asTimeFormat = document.getElementById('as-timeFormat');
const CURRENCIES = ['INR', 'USD', 'EUR', 'GBP', 'AED'];
const DATE_FORMATS = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];
const TIME_FORMATS = [
  { value: '12h', label: '12-hour' },
  { value: '24h', label: '24-hour' }
];

/* Database Information / About */
const databaseInfoGrid = document.getElementById('database-info-grid');
const aboutInfoGrid = document.getElementById('about-info-grid');

/* Confirmation Dialog */
const confirmModalOverlay = document.getElementById('confirm-modal-overlay');
const confirmTitle = document.getElementById('confirm-title');
const confirmMessage = document.getElementById('confirm-message');
const confirmCancel = document.getElementById('confirm-cancel');
const confirmOk = document.getElementById('confirm-ok');
let pendingConfirmAction = null;

/* ============================================================
   STATE
   ============================================================ */

let currentUserRole = null;
const loadedSections = new Set();

/* ============================================================
   AUTH / SHELL
   ============================================================ */

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

async function validateSession() {
  const token = getAuthToken();

  if (!token) {
    redirectToLogin();
    return false;
  }

  try {
    const response = await fetch(`${API_BASE_URL}/api/auth/session`, {
      headers: { Authorization: `Bearer ${token}` }
    });

    const data = await response.json();

    if (!response.ok || !data.success) {
      redirectToLogin();
      return false;
    }

    userNameEl.textContent = data.user.fullName;
    userRoleEl.textContent = data.user.role;
    userAvatarEl.textContent = getInitials(data.user.fullName);
    currentUserRole = data.user.role;
    return true;
  } catch (error) {
    redirectToLogin();
    return false;
  }
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

/* ============================================================
   API HELPER
   ============================================================ */

async function apiRequest(path, options = {}) {
  const token = getAuthToken();
  const response = await fetch(`${API_BASE_URL}${path}`, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
      ...(options.headers || {})
    }
  });

  let data = null;
  try {
    data = await response.json();
  } catch (error) {
    data = null;
  }

  if (response.status === 401) {
    redirectToLogin();
    throw new Error('Session expired');
  }

  if (!response.ok || !data || !data.success) {
    const message = (data && data.message) || 'Something went wrong. Please try again';
    throw new Error(message);
  }

  return data;
}

/* ============================================================
   TOASTS
   ============================================================ */

function showToast(message, type = 'success') {
  const toast = document.createElement('div');
  toast.className = `toast ${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  setTimeout(() => {
    toast.remove();
  }, 3500);
}

/* ============================================================
   CONFIRMATION DIALOG
   ============================================================ */

function openConfirmDialog({ title, message, onConfirm }) {
  confirmTitle.textContent = title;
  confirmMessage.textContent = message;
  pendingConfirmAction = onConfirm;
  confirmModalOverlay.hidden = false;
}

function closeConfirmDialog() {
  confirmModalOverlay.hidden = true;
  pendingConfirmAction = null;
}

confirmCancel.addEventListener('click', closeConfirmDialog);

confirmModalOverlay.addEventListener('click', (event) => {
  if (event.target === confirmModalOverlay) {
    closeConfirmDialog();
  }
});

confirmOk.addEventListener('click', async () => {
  if (typeof pendingConfirmAction === 'function') {
    await pendingConfirmAction();
  }
  closeConfirmDialog();
});

/* ============================================================
   SETTINGS NAVIGATION
   ============================================================ */

const SECTION_LOADERS = {
  'business-profile': loadBusinessProfile,
  users: loadUsers,
  permissions: loadPermissions,
  'number-series': loadNumberSeries,
  print: loadPrintSettings,
  security: loadSecuritySettings,
  application: loadAppSettings,
  database: loadDatabaseInfo,
  about: loadAboutInfo
};

function switchSection(section) {
  document.querySelectorAll('.settings-nav-item').forEach((item) => {
    item.classList.toggle('active', item.dataset.section === section);
  });

  settingsPanels.forEach((panel) => {
    panel.classList.toggle('active', panel.id === `panel-${section}`);
  });

  if (!loadedSections.has(section)) {
    loadedSections.add(section);
    const loader = SECTION_LOADERS[section];
    if (loader) loader();
  }
}

settingsNav.addEventListener('click', (event) => {
  const button = event.target.closest('.settings-nav-item');
  if (!button) return;
  switchSection(button.dataset.section);
});

/* ============================================================
   BUSINESS PROFILE
   ============================================================ */

function setLogoPreview(logoData) {
  currentLogoData = logoData || '';
  if (currentLogoData) {
    bpLogoPreview.innerHTML = `<img src="${currentLogoData}" alt="Business logo" />`;
  } else {
    bpLogoPreview.innerHTML = '';
    bpLogoPreview.textContent = 'No Logo';
  }
}

async function loadBusinessProfile() {
  try {
    const { data } = await apiRequest('/api/settings/business-profile');

    BUSINESS_PROFILE_FIELDS.forEach((field) => {
      const input = document.getElementById(`bp-${field}`);
      if (input) input.value = data[field] || '';
    });

    logoWasRemoved = false;
    setLogoPreview(data.logoData);
  } catch (error) {
    showToast(error.message || 'Unable to load business profile.', 'error');
  }
}

bpLogoChoose.addEventListener('click', () => bpLogoInput.click());

bpLogoInput.addEventListener('change', () => {
  const file = bpLogoInput.files && bpLogoInput.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => {
    logoWasRemoved = false;
    setLogoPreview(reader.result);
  };
  reader.readAsDataURL(file);
});

bpLogoRemove.addEventListener('click', () => {
  logoWasRemoved = true;
  bpLogoInput.value = '';
  setLogoPreview('');
});

function clearFieldErrors(fields, prefix) {
  fields.forEach((field) => {
    const errorEl = document.getElementById(`${prefix}-error-${field}`);
    if (errorEl) errorEl.textContent = '';
  });
}

businessProfileForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  bpFormError.textContent = '';
  clearFieldErrors(BUSINESS_PROFILE_FIELDS, 'bp');

  const payload = {};
  BUSINESS_PROFILE_FIELDS.forEach((field) => {
    const input = document.getElementById(`bp-${field}`);
    if (input) payload[field] = input.value;
  });

  if (logoWasRemoved) {
    payload.removeLogo = true;
  } else if (currentLogoData && currentLogoData.startsWith('data:')) {
    payload.logoData = currentLogoData;
  }

  bpSubmit.disabled = true;
  bpSubmitText.textContent = 'Saving...';

  try {
    const { data } = await apiRequest('/api/settings/business-profile', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    logoWasRemoved = false;
    setLogoPreview(data.logoData);
    showToast('Business profile updated successfully', 'success');
  } catch (error) {
    bpFormError.textContent = error.message || 'Unable to save business profile.';
  } finally {
    bpSubmit.disabled = false;
    bpSubmitText.textContent = 'Save Business Profile';
  }
});

/* ============================================================
   USER MANAGEMENT
   ============================================================ */

function renderUserRow(user) {
  const tr = document.createElement('tr');

  const lastLogin = user.lastLogin
    ? new Date(user.lastLogin).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })
    : '—';

  tr.innerHTML = `
    <td>${escapeHtml(user.fullName)}</td>
    <td>${escapeHtml(user.username)}</td>
    <td>${escapeHtml(user.role)}</td>
    <td class="cell-muted">${escapeHtml(user.email || '—')}</td>
    <td><span class="status-badge ${user.isActive ? 'active' : 'inactive'}">${user.isActive ? 'Active' : 'Inactive'}</span></td>
    <td class="cell-muted">${lastLogin}</td>
    <td></td>
  `;

  const actionsCell = tr.querySelector('td:last-child');
  const actions = document.createElement('div');
  actions.className = 'row-actions';

  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'row-action-btn';
  editBtn.textContent = 'Edit';
  editBtn.addEventListener('click', () => openEditUserModal(user));
  actions.appendChild(editBtn);

  const resetBtn = document.createElement('button');
  resetBtn.type = 'button';
  resetBtn.className = 'row-action-btn';
  resetBtn.textContent = 'Reset Password';
  resetBtn.addEventListener('click', () => openResetPasswordModal(user));
  actions.appendChild(resetBtn);

  if (user.role !== 'Owner') {
    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    toggleBtn.className = `row-action-btn ${user.isActive ? 'danger' : 'success'}`;
    toggleBtn.textContent = user.isActive ? 'Deactivate' : 'Activate';
    toggleBtn.addEventListener('click', () => confirmToggleUserStatus(user));
    actions.appendChild(toggleBtn);
  }

  actionsCell.appendChild(actions);
  return tr;
}

function escapeHtml(value) {
  const div = document.createElement('div');
  div.textContent = value === undefined || value === null ? '' : String(value);
  return div.innerHTML;
}

async function loadUsers() {
  usersTableBody.innerHTML = '';
  usersEmptyState.hidden = true;
  usersLoadingState.hidden = false;

  try {
    const { data } = await apiRequest('/api/settings/users?limit=200');
    usersLoadingState.hidden = true;

    if (data.length === 0) {
      usersEmptyState.hidden = false;
      return;
    }

    data.forEach((user) => {
      usersTableBody.appendChild(renderUserRow(user));
    });
  } catch (error) {
    usersLoadingState.hidden = true;
    showToast(error.message || 'Unable to load users.', 'error');
  }
}

function populateRoleSelect() {
  userFieldRole.innerHTML = '';
  ['Owner', 'Manager', 'Cashier'].forEach((role) => {
    const option = document.createElement('option');
    option.value = role;
    option.textContent = role;
    userFieldRole.appendChild(option);
  });
}

function openAddUserModal() {
  currentEditUserId = null;
  userModalTitle.textContent = 'Add User';
  userModalSubmitText.textContent = 'Save';
  userFormError.textContent = '';
  userForm.reset();
  clearFieldErrors(USER_FIELDS, 'user');
  userPasswordGroup.hidden = false;
  document.getElementById('user-field-password').required = true;
  userModalOverlay.hidden = false;
}

function openEditUserModal(user) {
  currentEditUserId = user.id;
  userModalTitle.textContent = 'Edit User';
  userModalSubmitText.textContent = 'Update';
  userFormError.textContent = '';
  clearFieldErrors(USER_FIELDS, 'user');

  document.getElementById('user-field-fullName').value = user.fullName || '';
  document.getElementById('user-field-username').value = user.username || '';
  document.getElementById('user-field-role').value = user.role;
  document.getElementById('user-field-mobile').value = user.mobile || '';
  document.getElementById('user-field-email').value = user.email || '';

  userPasswordGroup.hidden = true;
  document.getElementById('user-field-password').required = false;

  userModalOverlay.hidden = false;
}

function closeUserModal() {
  userModalOverlay.hidden = true;
  userForm.reset();
  userFormError.textContent = '';
  currentEditUserId = null;
}

userAddButton.addEventListener('click', openAddUserModal);
userModalClose.addEventListener('click', closeUserModal);
userModalCancel.addEventListener('click', closeUserModal);

userModalOverlay.addEventListener('click', (event) => {
  if (event.target === userModalOverlay) closeUserModal();
});

userForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  userFormError.textContent = '';
  clearFieldErrors(USER_FIELDS, 'user');

  const payload = {
    fullName: document.getElementById('user-field-fullName').value,
    username: document.getElementById('user-field-username').value,
    role: document.getElementById('user-field-role').value,
    mobile: document.getElementById('user-field-mobile').value,
    email: document.getElementById('user-field-email').value
  };

  if (!currentEditUserId) {
    payload.password = document.getElementById('user-field-password').value;
  }

  userModalSubmit.disabled = true;
  userModalSubmitText.textContent = currentEditUserId ? 'Updating...' : 'Saving...';

  try {
    if (currentEditUserId) {
      await apiRequest(`/api/settings/users/${currentEditUserId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      showToast('User updated successfully', 'success');
    } else {
      await apiRequest('/api/settings/users', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showToast('User created successfully', 'success');
    }

    closeUserModal();
    loadUsers();
  } catch (error) {
    userFormError.textContent = error.message || 'Unable to save user.';
  } finally {
    userModalSubmit.disabled = false;
    userModalSubmitText.textContent = currentEditUserId ? 'Update' : 'Save';
  }
});

function confirmToggleUserStatus(user) {
  const nextStatus = user.isActive ? 'Inactive' : 'Active';

  openConfirmDialog({
    title: `${nextStatus === 'Active' ? 'Activate' : 'Deactivate'} User`,
    message: `Are you sure you want to ${nextStatus === 'Active' ? 'activate' : 'deactivate'} ${user.fullName}?`,
    onConfirm: async () => {
      try {
        await apiRequest(`/api/settings/users/${user.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: nextStatus })
        });
        showToast(`User ${nextStatus === 'Active' ? 'activated' : 'deactivated'} successfully`, 'success');
        loadUsers();
      } catch (error) {
        showToast(error.message || 'Unable to update user status.', 'error');
      }
    }
  });
}

function openResetPasswordModal(user) {
  resetPasswordUserId = user.id;
  resetPasswordTarget.textContent = `Resetting password for ${user.fullName} (${user.username})`;
  resetPasswordFormError.textContent = '';
  resetPasswordErrorField.textContent = '';
  resetPasswordForm.reset();
  resetPasswordModalOverlay.hidden = false;
}

function closeResetPasswordModal() {
  resetPasswordModalOverlay.hidden = true;
  resetPasswordForm.reset();
  resetPasswordFormError.textContent = '';
  resetPasswordUserId = null;
}

resetPasswordClose.addEventListener('click', closeResetPasswordModal);
resetPasswordCancel.addEventListener('click', closeResetPasswordModal);

resetPasswordModalOverlay.addEventListener('click', (event) => {
  if (event.target === resetPasswordModalOverlay) closeResetPasswordModal();
});

resetPasswordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  resetPasswordFormError.textContent = '';
  resetPasswordErrorField.textContent = '';

  resetPasswordSubmit.disabled = true;
  resetPasswordSubmitText.textContent = 'Resetting...';

  try {
    await apiRequest(`/api/settings/users/${resetPasswordUserId}/reset-password`, {
      method: 'POST',
      body: JSON.stringify({ newPassword: resetPasswordField.value })
    });
    showToast('Password reset successfully', 'success');
    closeResetPasswordModal();
  } catch (error) {
    resetPasswordFormError.textContent = error.message || 'Unable to reset password.';
  } finally {
    resetPasswordSubmit.disabled = false;
    resetPasswordSubmitText.textContent = 'Reset Password';
  }
});

/* ============================================================
   ROLE PERMISSIONS
   ============================================================ */

async function loadPermissions() {
  permissionsTableBody.innerHTML = '';
  permissionsLoadingState.hidden = false;

  try {
    const { data } = await apiRequest('/api/settings/permissions');
    permissionsState = data;

    const editableRoles = data.roles.filter((role) => role !== 'Owner');
    activePermissionRole = editableRoles[0] || null;

    renderPermissionRoleTabs(editableRoles);
    renderPermissionMatrix();
  } catch (error) {
    showToast(error.message || 'Unable to load role permissions.', 'error');
  } finally {
    permissionsLoadingState.hidden = true;
  }
}

function renderPermissionRoleTabs(roles) {
  permissionsRoleTabs.innerHTML = '';

  roles.forEach((role) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = `permissions-role-tab${role === activePermissionRole ? ' active' : ''}`;
    tab.textContent = role;
    tab.addEventListener('click', () => {
      activePermissionRole = role;
      renderPermissionRoleTabs(roles);
      renderPermissionMatrix();
    });
    permissionsRoleTabs.appendChild(tab);
  });
}

function getPermissionsForRole(role) {
  const record = permissionsState.permissions.find((item) => item.role === role);
  const grid = {};

  permissionsState.modules.forEach((moduleName) => {
    const modulePerms = (record && record.permissions && record.permissions[moduleName]) || {};
    grid[moduleName] = {};
    permissionsState.actions.forEach((action) => {
      grid[moduleName][action] = Boolean(modulePerms[action]);
    });
  });

  return grid;
}

function renderPermissionMatrix() {
  permissionsTableBody.innerHTML = '';
  if (!activePermissionRole) return;

  const grid = getPermissionsForRole(activePermissionRole);

  permissionsState.modules.forEach((moduleName) => {
    const tr = document.createElement('tr');
    const nameCell = document.createElement('td');
    nameCell.textContent = moduleName;
    tr.appendChild(nameCell);

    permissionsState.actions.forEach((action) => {
      const td = document.createElement('td');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.checked = grid[moduleName][action];
      checkbox.dataset.module = moduleName;
      checkbox.dataset.action = action;
      checkbox.addEventListener('change', () => {
        grid[moduleName][action] = checkbox.checked;
      });
      td.appendChild(checkbox);
      tr.appendChild(td);
    });

    tr._grid = grid;
    permissionsTableBody.appendChild(tr);
  });
}

permissionsSaveButton.addEventListener('click', async () => {
  if (!activePermissionRole) return;

  const grid = {};
  permissionsState.modules.forEach((moduleName) => {
    grid[moduleName] = {};
    permissionsState.actions.forEach((action) => {
      grid[moduleName][action] = false;
    });
  });

  permissionsTableBody.querySelectorAll('input[type="checkbox"]').forEach((checkbox) => {
    grid[checkbox.dataset.module][checkbox.dataset.action] = checkbox.checked;
  });

  permissionsSaveButton.disabled = true;
  permissionsSaveText.textContent = 'Saving...';

  try {
    await apiRequest(`/api/settings/permissions/${activePermissionRole}`, {
      method: 'PUT',
      body: JSON.stringify({ permissions: grid })
    });

    const record = permissionsState.permissions.find((item) => item.role === activePermissionRole);
    if (record) {
      record.permissions = grid;
    } else {
      permissionsState.permissions.push({ role: activePermissionRole, permissions: grid });
    }

    showToast('Role permissions updated successfully', 'success');
  } catch (error) {
    showToast(error.message || 'Unable to save role permissions.', 'error');
  } finally {
    permissionsSaveButton.disabled = false;
    permissionsSaveText.textContent = 'Save Permissions';
  }
});

/* ============================================================
   NUMBER SERIES
   ============================================================ */

let numberSeriesCache = [];

function renderNumberSeriesRow(series) {
  const tr = document.createElement('tr');

  tr.innerHTML = `
    <td>${escapeHtml(series.label)}</td>
    <td><span class="series-prefix-badge">${escapeHtml(series.prefix)}</span></td>
    <td>${series.startingNumber}</td>
    <td class="cell-muted">${series.currentNumber !== null ? series.currentNumber : 'Not yet used'}</td>
    <td>${series.numberLength}</td>
    <td><span class="series-preview-value">${escapeHtml(series.preview)}</span></td>
    <td></td>
  `;

  const actionsCell = tr.querySelector('td:last-child');
  const editBtn = document.createElement('button');
  editBtn.type = 'button';
  editBtn.className = 'row-action-btn';
  editBtn.textContent = 'Edit';
  editBtn.addEventListener('click', () => openEditSeriesModal(series));
  actionsCell.appendChild(editBtn);

  return tr;
}

async function loadNumberSeries() {
  numberSeriesTableBody.innerHTML = '';
  numberSeriesLoadingState.hidden = false;

  try {
    const { data } = await apiRequest('/api/settings/number-series');
    numberSeriesCache = data;
    numberSeriesLoadingState.hidden = true;
    data.forEach((series) => {
      numberSeriesTableBody.appendChild(renderNumberSeriesRow(series));
    });
  } catch (error) {
    numberSeriesLoadingState.hidden = true;
    showToast(error.message || 'Unable to load number series.', 'error');
  }
}

function updateSeriesPreviewHint() {
  const prefix = seriesFieldPrefix.value.trim();
  const startingNumber = Number(seriesFieldStartingNumber.value) || 1;
  const numberLength = Number(seriesFieldNumberLength.value) || 1;
  const preview = `${prefix}${String(startingNumber).padStart(numberLength, '0')}`;
  seriesPreviewHint.textContent = `Preview: ${preview}`;
}

[seriesFieldPrefix, seriesFieldStartingNumber, seriesFieldNumberLength].forEach((input) => {
  input.addEventListener('input', updateSeriesPreviewHint);
});

function openEditSeriesModal(series) {
  currentEditSeriesId = series.id;
  seriesFormError.textContent = '';
  clearFieldErrors(['prefix', 'startingNumber', 'numberLength'], 'series');

  document.getElementById('series-modal-title').textContent = `Edit Number Series — ${series.label}`;
  seriesFieldPrefix.value = series.prefix;
  seriesFieldStartingNumber.value = series.startingNumber;
  seriesFieldNumberLength.value = series.numberLength;
  updateSeriesPreviewHint();

  seriesModalOverlay.hidden = false;
}

function closeSeriesModal() {
  seriesModalOverlay.hidden = true;
  seriesForm.reset();
  seriesFormError.textContent = '';
  currentEditSeriesId = null;
}

seriesModalClose.addEventListener('click', closeSeriesModal);
seriesModalCancel.addEventListener('click', closeSeriesModal);

seriesModalOverlay.addEventListener('click', (event) => {
  if (event.target === seriesModalOverlay) closeSeriesModal();
});

seriesForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  seriesFormError.textContent = '';
  clearFieldErrors(['prefix', 'startingNumber', 'numberLength'], 'series');

  const payload = {
    prefix: seriesFieldPrefix.value,
    startingNumber: seriesFieldStartingNumber.value,
    numberLength: seriesFieldNumberLength.value
  };

  seriesModalSubmit.disabled = true;
  seriesModalSubmitText.textContent = 'Saving...';

  try {
    await apiRequest(`/api/settings/number-series/${currentEditSeriesId}`, {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    showToast('Number series updated successfully', 'success');
    closeSeriesModal();
    loadNumberSeries();
  } catch (error) {
    seriesFormError.textContent = error.message || 'Unable to save number series.';
  } finally {
    seriesModalSubmit.disabled = false;
    seriesModalSubmitText.textContent = 'Save';
  }
});

/* ============================================================
   PRINT SETTINGS
   ============================================================ */

function populateSelect(select, options, getValue, getLabel) {
  select.innerHTML = '';
  options.forEach((option) => {
    const el = document.createElement('option');
    el.value = getValue ? getValue(option) : option;
    el.textContent = getLabel ? getLabel(option) : option;
    select.appendChild(el);
  });
}

async function populatePrinterOptions(savedPrinterName) {
  psPrinterName.innerHTML = '';
  psPrinterNameHint.textContent = '';

  const defaultOption = document.createElement('option');
  defaultOption.value = '';
  defaultOption.textContent = 'System default printer';
  psPrinterName.appendChild(defaultOption);

  let printers = [];
  if (window.printAPI) {
    try {
      printers = await window.printAPI.getPrinters();
    } catch (error) {
      printers = [];
    }
  }

  printers.forEach((printer) => {
    const option = document.createElement('option');
    option.value = printer.name;
    option.textContent = printer.isDefault ? `${printer.displayName || printer.name} (Default)` : (printer.displayName || printer.name);
    psPrinterName.appendChild(option);
  });

  if (savedPrinterName) {
    const savedPrinterIsListed = printers.some((p) => p.name === savedPrinterName);
    if (!savedPrinterIsListed) {
      // Keep the saved selection visible and intact even though it isn't
      // currently detected, rather than silently dropping back to the
      // system default — the configured printer should only ever change
      // because the user picks something else, not because it's offline
      // right now.
      const savedOption = document.createElement('option');
      savedOption.value = savedPrinterName;
      savedOption.textContent = `${savedPrinterName} (not currently detected)`;
      psPrinterName.appendChild(savedOption);
      psPrinterNameHint.textContent = 'This printer is not currently detected. Printing will fail with a clear error until it is connected, or choose a different printer.';
    }
    psPrinterName.value = savedPrinterName;
  } else {
    psPrinterName.value = '';
  }
}

async function loadPrintSettings() {
  populateSelect(psInvoiceTemplate, INVOICE_TEMPLATES);
  populateSelect(psInvoicePaperSize, PAPER_SIZES);

  try {
    const { data } = await apiRequest('/api/settings/print');
    psInvoiceTemplate.value = data.invoiceTemplate || 'A4 Professional';
    psInvoicePaperSize.value = data.invoicePaperSize;
    await populatePrinterOptions(data.printerName || '');
    document.getElementById('ps-headerMessage').value = data.headerMessage || '';
    document.getElementById('ps-footerMessage').value = data.footerMessage || '';
    document.getElementById('ps-termsAndConditions').value = Array.isArray(data.termsAndConditions)
      ? data.termsAndConditions.join('\n')
      : '';
    document.getElementById('ps-notes').value = data.notes || '';
    document.getElementById('ps-printPreviewEnabled').checked = Boolean(data.printPreviewEnabled);
    document.getElementById('ps-autoPrintEnabled').checked = Boolean(data.autoPrintEnabled);
  } catch (error) {
    showToast(error.message || 'Unable to load print settings.', 'error');
  }
}

printSettingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  psFormError.textContent = '';

  const payload = {
    invoiceTemplate: psInvoiceTemplate.value,
    invoicePaperSize: psInvoicePaperSize.value,
    printerName: psPrinterName.value,
    headerMessage: document.getElementById('ps-headerMessage').value,
    footerMessage: document.getElementById('ps-footerMessage').value,
    termsAndConditions: document.getElementById('ps-termsAndConditions').value
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0),
    notes: document.getElementById('ps-notes').value,
    printPreviewEnabled: document.getElementById('ps-printPreviewEnabled').checked,
    autoPrintEnabled: document.getElementById('ps-autoPrintEnabled').checked
  };

  psSubmit.disabled = true;
  psSubmitText.textContent = 'Saving...';

  try {
    await apiRequest('/api/settings/print', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    showToast('Print settings updated successfully', 'success');
  } catch (error) {
    psFormError.textContent = error.message || 'Unable to save print settings.';
  } finally {
    psSubmit.disabled = false;
    psSubmitText.textContent = 'Save Print Settings';
  }
});

/* ============================================================
   SECURITY SETTINGS
   ============================================================ */

async function loadSecuritySettings() {
  try {
    const { data } = await apiRequest('/api/settings/security');
    document.getElementById('ss-sessionTimeoutMinutes').value = data.sessionTimeoutMinutes;
    document.getElementById('ss-passwordMinLength').value = data.passwordMinLength;
    document.getElementById('ss-loginAttemptLimit').value = data.loginAttemptLimit;
    document.getElementById('ss-forcePasswordChange').checked = Boolean(data.forcePasswordChange);
  } catch (error) {
    showToast(error.message || 'Unable to load security settings.', 'error');
  }
}

securitySettingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  ssFormError.textContent = '';

  const payload = {
    sessionTimeoutMinutes: document.getElementById('ss-sessionTimeoutMinutes').value,
    passwordMinLength: document.getElementById('ss-passwordMinLength').value,
    loginAttemptLimit: document.getElementById('ss-loginAttemptLimit').value,
    forcePasswordChange: document.getElementById('ss-forcePasswordChange').checked
  };

  ssSubmit.disabled = true;
  ssSubmitText.textContent = 'Saving...';

  try {
    await apiRequest('/api/settings/security', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    showToast('Security settings updated successfully', 'success');
  } catch (error) {
    ssFormError.textContent = error.message || 'Unable to save security settings.';
  } finally {
    ssSubmit.disabled = false;
    ssSubmitText.textContent = 'Save Security Settings';
  }
});

/* ============================================================
   APPLICATION SETTINGS
   ============================================================ */

async function loadAppSettings() {
  populateSelect(asCurrency, CURRENCIES);
  populateSelect(asDateFormat, DATE_FORMATS);
  populateSelect(asTimeFormat, TIME_FORMATS, (opt) => opt.value, (opt) => opt.label);

  try {
    const { data } = await apiRequest('/api/settings/application');
    asCurrency.value = data.currency;
    document.getElementById('as-currencySymbol').value = data.currencySymbol || '';
    document.getElementById('as-decimalPlaces').value = data.decimalPlaces;
    asDateFormat.value = data.dateFormat;
    asTimeFormat.value = data.timeFormat;
    document.getElementById('as-timeZone').value = data.timeZone || '';
    document.getElementById('as-defaultLanguage').value = data.defaultLanguage || '';
  } catch (error) {
    showToast(error.message || 'Unable to load application settings.', 'error');
  }
}

appSettingsForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  asFormError.textContent = '';

  const payload = {
    currency: asCurrency.value,
    currencySymbol: document.getElementById('as-currencySymbol').value,
    decimalPlaces: document.getElementById('as-decimalPlaces').value,
    dateFormat: asDateFormat.value,
    timeFormat: asTimeFormat.value,
    timeZone: document.getElementById('as-timeZone').value,
    defaultLanguage: document.getElementById('as-defaultLanguage').value
  };

  asSubmit.disabled = true;
  asSubmitText.textContent = 'Saving...';

  try {
    await apiRequest('/api/settings/application', {
      method: 'PUT',
      body: JSON.stringify(payload)
    });
    showToast('Application settings updated successfully', 'success');
  } catch (error) {
    asFormError.textContent = error.message || 'Unable to save application settings.';
  } finally {
    asSubmit.disabled = false;
    asSubmitText.textContent = 'Save Application Settings';
  }
});

/* ============================================================
   DATABASE INFORMATION (read-only)
   ============================================================ */

function buildInfoItem(label, value, statusClass) {
  const item = document.createElement('div');
  item.className = 'info-item';
  item.innerHTML = `
    <span class="info-item-label">${escapeHtml(label)}</span>
    <span class="info-item-value${statusClass ? ` ${statusClass}` : ''}">${escapeHtml(value)}</span>
  `;
  return item;
}

async function loadDatabaseInfo() {
  databaseInfoGrid.innerHTML = '<div class="table-state" id="database-loading-state"><p>Loading database information...</p></div>';

  try {
    const { data } = await apiRequest('/api/settings/database-info');
    databaseInfoGrid.innerHTML = '';

    const isConnected = data.connectionStatus === 'Connected';
    databaseInfoGrid.appendChild(buildInfoItem('Connection Status', data.connectionStatus, isConnected ? 'status-connected' : 'status-disconnected'));
    databaseInfoGrid.appendChild(buildInfoItem('Database Name', data.databaseName || '—'));
    databaseInfoGrid.appendChild(buildInfoItem('Collection Count', data.collectionCount !== null ? String(data.collectionCount) : '—'));
    databaseInfoGrid.appendChild(buildInfoItem('Last Backup Time', data.lastBackupTime ? new Date(data.lastBackupTime).toLocaleString() : 'Not available'));
  } catch (error) {
    databaseInfoGrid.innerHTML = '';
    showToast(error.message || 'Unable to load database information.', 'error');
  }
}

/* ============================================================
   ABOUT (read-only)
   ============================================================ */

async function loadAboutInfo() {
  aboutInfoGrid.innerHTML = '<div class="table-state" id="about-loading-state"><p>Loading system information...</p></div>';

  try {
    const { data } = await apiRequest('/api/settings/about');
    aboutInfoGrid.innerHTML = '';

    aboutInfoGrid.appendChild(buildInfoItem('ERP Name', data.erpName));
    aboutInfoGrid.appendChild(buildInfoItem('Version', data.version));
    aboutInfoGrid.appendChild(buildInfoItem('Build Number', data.buildNumber));
    aboutInfoGrid.appendChild(buildInfoItem('Developer', data.developer));
    aboutInfoGrid.appendChild(buildInfoItem('License Status', data.licenseStatus));
  } catch (error) {
    aboutInfoGrid.innerHTML = '';
    showToast(error.message || 'Unable to load system information.', 'error');
  }
}

/* ============================================================
   INIT
   ============================================================ */

async function init() {
  renderCurrentDate();
  const isValid = await validateSession();
  if (!isValid) return;

  await applySidebarPermissions();

  const canAccess = await guardPageAccess('Settings');
  if (!canAccess) return;

  populateRoleSelect();
  loadedSections.add('business-profile');
  loadBusinessProfile();
}

init();