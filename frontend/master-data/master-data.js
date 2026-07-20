const API_BASE_URL = 'https://electronicerp-1.onrender.com';

/* ============================================================
   DOM REFERENCES (shared shell — same as dashboard.js)
   ============================================================ */

const userNameEl = document.getElementById('user-name');
const userRoleEl = document.getElementById('user-role');
const userAvatarEl = document.getElementById('user-avatar');
const currentDateEl = document.getElementById('current-date');
const logoutButton = document.getElementById('logout-button');
const sidebarLogoutButton = document.getElementById('sidebar-logout');
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebar = document.getElementById('sidebar');

const masterTabsEl = document.getElementById('master-tabs');
const searchInput = document.getElementById('search-input');
const statusFilter = document.getElementById('status-filter');
const addButton = document.getElementById('add-button');
const tableHeadRow = document.getElementById('table-head-row');
const tableBody = document.getElementById('table-body');
const loadingState = document.getElementById('loading-state');
const emptyState = document.getElementById('empty-state');
const emptyStateText = document.getElementById('empty-state-text');
const paginationBar = document.getElementById('pagination-bar');
const paginationInfo = document.getElementById('pagination-info');
const paginationCurrent = document.getElementById('pagination-current');
const prevPageBtn = document.getElementById('prev-page');
const nextPageBtn = document.getElementById('next-page');

const formModalOverlay = document.getElementById('form-modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalClose = document.getElementById('modal-close');
const modalCancel = document.getElementById('modal-cancel');
const modalBody = document.getElementById('modal-body');
const recordForm = document.getElementById('record-form');
const formError = document.getElementById('form-error');
const modalSubmit = document.getElementById('modal-submit');
const modalSubmitText = document.getElementById('modal-submit-text');

const confirmModalOverlay = document.getElementById('confirm-modal-overlay');
const confirmTitle = document.getElementById('confirm-title');
const confirmMessage = document.getElementById('confirm-message');
const confirmCancel = document.getElementById('confirm-cancel');
const confirmOk = document.getElementById('confirm-ok');

const toastContainer = document.getElementById('toast-container');

/* ============================================================
   MASTER CONFIGURATION
   ============================================================ */

// Standard GST slabs. Must match GST_ALLOWED_SLABS on the server —
// kept in sync manually since this is a static, rarely-changing list.
const GST_SLAB_OPTIONS = [0, 5, 12, 18, 28];

const MASTERS = {
  categories: {
    label: 'Category',
    endpoint: 'categories',
    searchPlaceholder: 'Search categories...',
    emptyText: 'No categories found. Click "Add New" to create one.',
    columns: [
      { key: 'categoryName', label: 'Category Name' },
      { key: 'description', label: 'Description', muted: true },
      { key: 'status', label: 'Status', type: 'status' }
    ],
    fields: [
      { name: 'categoryName', label: 'Category Name', type: 'text', required: true, maxLength: 100 },
      { name: 'description', label: 'Description', type: 'textarea', required: false, maxLength: 500 },
      { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], required: false, editOnly: true }
    ]
  },
  brands: {
    label: 'Brand',
    endpoint: 'brands',
    searchPlaceholder: 'Search brands...',
    emptyText: 'No brands found. Click "Add New" to create one.',
    columns: [
      { key: 'brandName', label: 'Brand Name' },
      { key: 'description', label: 'Description', muted: true },
      { key: 'status', label: 'Status', type: 'status' }
    ],
    fields: [
      { name: 'brandName', label: 'Brand Name', type: 'text', required: true, maxLength: 100 },
      { name: 'description', label: 'Description', type: 'textarea', required: false, maxLength: 500 },
      { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], required: false, editOnly: true }
    ]
  },
  units: {
    label: 'Unit',
    endpoint: 'units',
    searchPlaceholder: 'Search units...',
    emptyText: 'No units found. Click "Add New" to create one.',
    columns: [
      { key: 'unitName', label: 'Unit Name' },
      { key: 'symbol', label: 'Symbol' },
      { key: 'status', label: 'Status', type: 'status' }
    ],
    fields: [
      { name: 'unitName', label: 'Unit Name', type: 'text', required: true, maxLength: 50 },
      { name: 'symbol', label: 'Symbol', type: 'text', required: true, maxLength: 10 },
      { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], required: false, editOnly: true }
    ]
  },
  gst: {
    label: 'GST',
    endpoint: 'gst',
    searchPlaceholder: 'Search GST rates...',
    emptyText: 'No GST rates found. Click "Add New" to create one.',
    columns: [
      { key: 'gstName', label: 'GST Name' },
      { key: 'gstPercentage', label: 'Percentage', suffix: '%' },
      { key: 'status', label: 'Status', type: 'status' }
    ],
    fields: [
      {
        name: 'gstPercentage',
        label: 'GST Percentage',
        type: 'select',
        required: true,
        options: GST_SLAB_OPTIONS,
        optionLabelFn: (value) => `${value}%`
      },
      {
        // Read-only preview, auto-derived from gstPercentage (e.g. 18 -> "GST 18%").
        // Not editable and not sent to the server — the server always derives
        // gstName itself from gstPercentage.
        name: 'gstName',
        label: 'GST Name',
        type: 'computed',
        computeFrom: 'gstPercentage',
        computeFn: (percentage) => (percentage !== '' && percentage !== undefined && percentage !== null
          ? `GST ${percentage}%`
          : '—')
      },
      { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], required: false, editOnly: true }
    ]
  },
  suppliers: {
    label: 'Supplier',
    endpoint: 'suppliers',
    searchPlaceholder: 'Search suppliers...',
    emptyText: 'No suppliers found. Click "Add New" to create one.',
    columns: [
      { key: 'supplierName', label: 'Supplier Name' },
      { key: 'contactPerson', label: 'Contact Person', muted: true },
      { key: 'mobileNumber', label: 'Mobile' },
      { key: 'email', label: 'Email', muted: true },
      { key: 'status', label: 'Status', type: 'status' }
    ],
    fields: [
      { name: 'supplierName', label: 'Supplier Name', type: 'text', required: true, maxLength: 150 },
      { name: 'contactPerson', label: 'Contact Person', type: 'text', required: false, maxLength: 100 },
      { name: 'mobileNumber', label: 'Mobile Number', type: 'mobile', required: true, maxLength: 10, placeholder: '10-digit mobile number' },
      { name: 'email', label: 'Email', type: 'text', required: false, maxLength: 150 },
      { name: 'gstNumber', label: 'GST Number', type: 'text', required: false, maxLength: 20 },
      { name: 'address', label: 'Address', type: 'textarea', required: false, maxLength: 500 },
      { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], required: false, editOnly: true }
    ]
  },
  'customer-types': {
    label: 'Customer Type',
    endpoint: 'customer-types',
    searchPlaceholder: 'Search customer types...',
    emptyText: 'No customer types found. Click "Add New" to create one.',
    columns: [
      { key: 'customerType', label: 'Customer Type' },
      { key: 'description', label: 'Description', muted: true },
      { key: 'status', label: 'Status', type: 'status' }
    ],
    fields: [
      { name: 'customerType', label: 'Customer Type', type: 'text', required: true, maxLength: 100 },
      { name: 'description', label: 'Description', type: 'textarea', required: false, maxLength: 500 },
      { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], required: false, editOnly: true }
    ]
  },
  'payment-modes': {
    label: 'Payment Mode',
    endpoint: 'payment-modes',
    searchPlaceholder: 'Search payment modes...',
    emptyText: 'No payment modes found. Click "Add New" to create one.',
    columns: [
      { key: 'paymentModeName', label: 'Payment Mode Name' },
      { key: 'status', label: 'Status', type: 'status' }
    ],
    fields: [
      { name: 'paymentModeName', label: 'Payment Mode Name', type: 'text', required: true, maxLength: 100 },
      { name: 'status', label: 'Status', type: 'select', options: ['Active', 'Inactive'], required: false, editOnly: true }
    ]
  }
};

const MASTER_KEYS = Object.keys(MASTERS);

/* ============================================================
   STATE
   ============================================================ */

let activeMasterKey = MASTER_KEYS[0];
let currentPage = 1;
let currentEditId = null;
let searchDebounceTimer = null;

/* ============================================================
   AUTH / SHELL (same behavior as dashboard.js)
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
   TABS
   ============================================================ */

function renderTabs() {
  masterTabsEl.innerHTML = '';

  MASTER_KEYS.forEach((key) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = `master-tab${key === activeMasterKey ? ' active' : ''}`;
    tab.textContent = MASTERS[key].label;
    tab.setAttribute('role', 'tab');
    tab.addEventListener('click', () => switchMaster(key));
    masterTabsEl.appendChild(tab);
  });
}

function switchMaster(key) {
  if (key === activeMasterKey) return;
  activeMasterKey = key;
  currentPage = 1;
  searchInput.value = '';
  statusFilter.value = '';
  renderTabs();
  renderTableHead();
  loadRecords();
}

/* ============================================================
   TABLE RENDERING
   ============================================================ */

function renderTableHead() {
  const config = MASTERS[activeMasterKey];
  tableHeadRow.innerHTML = '';

  config.columns.forEach((col) => {
    const th = document.createElement('th');
    th.textContent = col.label;
    tableHeadRow.appendChild(th);
  });

  const actionsTh = document.createElement('th');
  actionsTh.textContent = 'Actions';
  tableHeadRow.appendChild(actionsTh);

  searchInput.placeholder = config.searchPlaceholder;
  emptyStateText.textContent = config.emptyText;
}

function formatCellValue(record, col) {
  const value = record[col.key];

  if (col.type === 'status') {
    return null; // rendered specially
  }

  if (value === undefined || value === null || value === '') {
    return '—';
  }

  if (col.suffix) {
    return `${value}${col.suffix}`;
  }

  return value;
}

function renderTableRows(records) {
  const config = MASTERS[activeMasterKey];
  tableBody.innerHTML = '';

  records.forEach((record) => {
    const tr = document.createElement('tr');

    config.columns.forEach((col) => {
      const td = document.createElement('td');

      if (col.type === 'status') {
        const badge = document.createElement('span');
        const isActive = record.status === 'Active';
        badge.className = `status-badge ${isActive ? 'active' : 'inactive'}`;
        badge.textContent = record.status;
        td.appendChild(badge);
      } else {
        if (col.muted) td.classList.add('cell-muted');
        td.textContent = formatCellValue(record, col);
      }

      tr.appendChild(td);
    });

    const actionsTd = document.createElement('td');
    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'row-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'row-action-btn';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => openEditModal(record));
    actionsWrap.appendChild(editBtn);

    const toggleBtn = document.createElement('button');
    toggleBtn.type = 'button';
    const isActive = record.status === 'Active';
    toggleBtn.className = `row-action-btn ${isActive ? '' : 'success'}`;
    toggleBtn.textContent = isActive ? 'Deactivate' : 'Activate';
    toggleBtn.addEventListener('click', () => confirmToggleStatus(record));
    actionsWrap.appendChild(toggleBtn);

    const deleteBtn = document.createElement('button');
    deleteBtn.type = 'button';
    deleteBtn.className = 'row-action-btn danger';
    deleteBtn.textContent = 'Delete';
    deleteBtn.addEventListener('click', () => confirmDelete(record));
    actionsWrap.appendChild(deleteBtn);

    actionsTd.appendChild(actionsWrap);
    tr.appendChild(actionsTd);

    tableBody.appendChild(tr);
  });
}

/* ============================================================
   LOAD RECORDS
   ============================================================ */

async function loadRecords() {
  const config = MASTERS[activeMasterKey];
  const params = new URLSearchParams();
  params.set('page', currentPage);
  params.set('limit', '10');

  if (searchInput.value.trim()) {
    params.set('search', searchInput.value.trim());
  }
  if (statusFilter.value) {
    params.set('status', statusFilter.value);
  }

  loadingState.hidden = false;
  emptyState.hidden = true;
  document.getElementById('data-table').style.display = 'none';
  paginationBar.hidden = true;

  try {
    const result = await apiRequest(`/api/master-data/${config.endpoint}?${params.toString()}`, {
      method: 'GET'
    });

    loadingState.hidden = true;

    if (!result.data || result.data.length === 0) {
      emptyState.hidden = false;
      document.getElementById('data-table').style.display = 'none';
      return;
    }

    document.getElementById('data-table').style.display = 'table';
    renderTableRows(result.data);
    renderPagination(result.pagination);
  } catch (error) {
    loadingState.hidden = true;
    emptyState.hidden = false;
    emptyStateText.textContent = error.message || 'Unable to load records.';
    document.getElementById('data-table').style.display = 'none';
  }
}

function renderPagination(pagination) {
  if (!pagination || pagination.totalRecords === 0) {
    paginationBar.hidden = true;
    return;
  }

  paginationBar.hidden = false;
  currentPage = pagination.page;

  const start = (pagination.page - 1) * pagination.limit + 1;
  const end = Math.min(pagination.page * pagination.limit, pagination.totalRecords);

  paginationInfo.textContent = `Showing ${start}-${end} of ${pagination.totalRecords}`;
  paginationCurrent.textContent = `Page ${pagination.page} of ${pagination.totalPages}`;

  prevPageBtn.disabled = pagination.page <= 1;
  nextPageBtn.disabled = pagination.page >= pagination.totalPages;
}

prevPageBtn.addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage -= 1;
    loadRecords();
  }
});

nextPageBtn.addEventListener('click', () => {
  currentPage += 1;
  loadRecords();
});

searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    currentPage = 1;
    loadRecords();
  }, 350);
});

statusFilter.addEventListener('change', () => {
  currentPage = 1;
  loadRecords();
});

/* ============================================================
   FORM MODAL (Add / Edit)
   ============================================================ */

function buildFieldHtml(field, value) {
  const wrapper = document.createElement('div');
  wrapper.className = 'field-group';

  const label = document.createElement('label');
  label.setAttribute('for', `field-${field.name}`);
  label.innerHTML = `${field.label}${field.required ? ' <span class="required-mark">*</span>' : ''}`;
  wrapper.appendChild(label);

  let input;

  if (field.type === 'textarea') {
    input = document.createElement('textarea');
    input.rows = 3;
  } else if (field.type === 'select') {
    input = document.createElement('select');
    field.options.forEach((opt) => {
      const optionEl = document.createElement('option');
      optionEl.value = opt;
      optionEl.textContent = field.optionLabelFn ? field.optionLabelFn(opt) : opt;
      input.appendChild(optionEl);
    });
  } else if (field.type === 'computed') {
    // Read-only, auto-derived preview (e.g. GST Name from GST Percentage).
    // Never sent to the server as user input — see collectFormData().
    input = document.createElement('input');
    input.type = 'text';
    input.readOnly = true;
    input.tabIndex = -1;
    input.classList.add('field-readonly-preview');
  } else {
    input = document.createElement('input');
    input.type = 'text';
    if (field.type === 'number') {
      input.type = 'number';
      if (field.min !== undefined) input.min = field.min;
      if (field.max !== undefined) input.max = field.max;
      if (field.step) input.step = field.step;
    }
    if (field.placeholder) input.placeholder = field.placeholder;
    if (field.maxLength) input.maxLength = field.maxLength;
  }

  input.id = `field-${field.name}`;
  input.name = field.name;

  if (value !== undefined && value !== null) {
    input.value = value;
  }

  wrapper.appendChild(input);

  if (field.type === 'mobile') {
    attachMobileInputGuard(input);
  }

  const errorText = document.createElement('span');
  errorText.className = 'field-error-text';
  errorText.id = `error-${field.name}`;
  wrapper.appendChild(errorText);

  return wrapper;
}

function renderFormFields(record) {
  const config = MASTERS[activeMasterKey];
  modalBody.innerHTML = '';

  config.fields.forEach((field) => {
    if (field.editOnly && !record) return;
    const value = record ? record[field.name] : undefined;
    modalBody.appendChild(buildFieldHtml(field, value));
  });

  // Wire up computed fields (e.g. GST Name derived from GST Percentage)
  // so they update live as the source field changes, and show the
  // correct derived value immediately when editing an existing record.
  config.fields.forEach((field) => {
    if (field.type !== 'computed' || !field.computeFrom) return;

    const sourceInput = document.getElementById(`field-${field.computeFrom}`);
    const computedInput = document.getElementById(`field-${field.name}`);
    if (!sourceInput || !computedInput) return;

    const recompute = () => {
      computedInput.value = field.computeFn(sourceInput.value);
    };

    sourceInput.addEventListener('change', recompute);
    sourceInput.addEventListener('input', recompute);
    recompute();
  });
}

function openAddModal() {
  currentEditId = null;
  modalTitle.textContent = `Add ${MASTERS[activeMasterKey].label}`;
  modalSubmitText.textContent = 'Save';
  formError.textContent = '';
  renderFormFields(null);
  formModalOverlay.hidden = false;
}

function openEditModal(record) {
  currentEditId = record.id;
  modalTitle.textContent = `Edit ${MASTERS[activeMasterKey].label}`;
  modalSubmitText.textContent = 'Update';
  formError.textContent = '';
  renderFormFields(record);
  formModalOverlay.hidden = false;
}

function closeFormModal() {
  formModalOverlay.hidden = true;
  recordForm.reset();
  formError.textContent = '';
  currentEditId = null;
}

addButton.addEventListener('click', openAddModal);
modalClose.addEventListener('click', closeFormModal);
modalCancel.addEventListener('click', closeFormModal);

formModalOverlay.addEventListener('click', (event) => {
  if (event.target === formModalOverlay) {
    closeFormModal();
  }
});

function clearFieldErrors() {
  const config = MASTERS[activeMasterKey];
  config.fields.forEach((field) => {
    const errorEl = document.getElementById(`error-${field.name}`);
    if (errorEl) errorEl.textContent = '';
  });
}

function collectFormData() {
  const config = MASTERS[activeMasterKey];
  const payload = {};

  config.fields.forEach((field) => {
    if (field.editOnly && !currentEditId) return;
    if (field.type === 'computed') return; // server-derived; never submitted
    const input = document.getElementById(`field-${field.name}`);
    if (input) {
      payload[field.name] = input.value;
    }
  });

  return payload;
}

recordForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  formError.textContent = '';
  clearFieldErrors();

  const config = MASTERS[activeMasterKey];
  const payload = collectFormData();

  modalSubmit.disabled = true;
  modalSubmitText.textContent = currentEditId ? 'Updating...' : 'Saving...';

  try {
    if (currentEditId) {
      await apiRequest(`/api/master-data/${config.endpoint}/${currentEditId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      showToast(`${config.label} updated successfully`, 'success');
    } else {
      await apiRequest(`/api/master-data/${config.endpoint}`, {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showToast(`${config.label} added successfully`, 'success');
    }

    closeFormModal();
    loadRecords();
  } catch (error) {
    formError.textContent = error.message || 'Unable to save the record.';
  } finally {
    modalSubmit.disabled = false;
    modalSubmitText.textContent = currentEditId ? 'Update' : 'Save';
  }
});

/* ============================================================
   CONFIRMATION DIALOG (status toggle / delete)
   ============================================================ */

let pendingConfirmAction = null;

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

function confirmToggleStatus(record) {
  const config = MASTERS[activeMasterKey];
  const nextStatus = record.status === 'Active' ? 'Inactive' : 'Active';

  openConfirmDialog({
    title: `${nextStatus === 'Active' ? 'Activate' : 'Deactivate'} ${config.label}`,
    message: `Are you sure you want to ${nextStatus === 'Active' ? 'activate' : 'deactivate'} this ${config.label.toLowerCase()}?`,
    onConfirm: async () => {
      try {
        await apiRequest(`/api/master-data/${config.endpoint}/${record.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: nextStatus })
        });
        showToast(`${config.label} ${nextStatus === 'Active' ? 'activated' : 'deactivated'} successfully`, 'success');
        loadRecords();
      } catch (error) {
        showToast(error.message || 'Unable to update status.', 'error');
      }
    }
  });
}

function confirmDelete(record) {
  const config = MASTERS[activeMasterKey];

  openConfirmDialog({
    title: `Delete ${config.label}`,
    message: `Are you sure you want to delete this ${config.label.toLowerCase()}? This action can be reversed only by an administrator.`,
    onConfirm: async () => {
      try {
        await apiRequest(`/api/master-data/${config.endpoint}/${record.id}`, {
          method: 'DELETE'
        });
        showToast(`${config.label} deleted successfully`, 'success');
        loadRecords();
      } catch (error) {
        showToast(error.message || 'Unable to delete record.', 'error');
      }
    }
  });
}

/* ============================================================
   DEFAULT MASTER DATA — OPTIONAL QUICK-SETUP ACTION
   ============================================================
   Shows a one-time "Load Default Units & GST" button in the toolbar
   when both collections are empty (first-time setup). Hidden entirely
   once either collection has any record, and hidden again immediately
   after a successful seed.
   ============================================================ */

let seedDefaultsButton = null;

async function refreshSeedDefaultsButton() {
  try {
    const status = await apiRequest('/api/master-data/defaults/status');

    if (!status.unitsEmpty && !status.gstEmpty) {
      if (seedDefaultsButton) seedDefaultsButton.hidden = true;
      return;
    }

    if (!seedDefaultsButton) {
      seedDefaultsButton = document.createElement('button');
      seedDefaultsButton.type = 'button';
      seedDefaultsButton.className = 'add-button btn-secondary-action';
      seedDefaultsButton.textContent = 'Load Default Units & GST';
      seedDefaultsButton.addEventListener('click', handleSeedDefaultsClick);
      addButton.insertAdjacentElement('beforebegin', seedDefaultsButton);
    }

    seedDefaultsButton.hidden = false;
  } catch (error) {
    // Non-critical — if the status check fails, simply don't show the
    // quick action; the user can still manage Units/GST manually.
  }
}

async function handleSeedDefaultsClick() {
  seedDefaultsButton.disabled = true;
  const originalText = seedDefaultsButton.textContent;
  seedDefaultsButton.textContent = 'Loading defaults...';

  try {
    const result = await apiRequest('/api/master-data/defaults/seed', { method: 'POST' });
    showToast(
      `Added ${result.unitsInserted} unit(s) and ${result.gstInserted} GST rate(s)`,
      'success'
    );
    seedDefaultsButton.hidden = true;
    if (activeMasterKey === 'units' || activeMasterKey === 'gst') {
      loadRecords();
    }
  } catch (error) {
    showToast(error.message || 'Unable to load default master data.', 'error');
  } finally {
    seedDefaultsButton.disabled = false;
    seedDefaultsButton.textContent = originalText;
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

  const canAccess = await guardPageAccess('Master Data');
  if (!canAccess) return;

  renderTabs();
  renderTableHead();
  loadRecords();
  refreshSeedDefaultsButton();
}

init();