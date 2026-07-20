const API_BASE_URL = 'https://electronicerp-1.onrender.com';

/* ============================================================
   DOM REFERENCES
   ============================================================ */

const userNameEl = document.getElementById('user-name');
const userRoleEl = document.getElementById('user-role');
const userAvatarEl = document.getElementById('user-avatar');
const currentDateEl = document.getElementById('current-date');
const logoutButton = document.getElementById('logout-button');
const sidebarLogoutButton = document.getElementById('sidebar-logout');
const sidebarToggle = document.getElementById('sidebar-toggle');
const sidebar = document.getElementById('sidebar');

const searchInput = document.getElementById('search-input');
const categoryFilter = document.getElementById('category-filter');
const brandFilter = document.getElementById('brand-filter');
const statusFilter = document.getElementById('status-filter');
const addButton = document.getElementById('add-button');
const tableBody = document.getElementById('table-body');
const loadingState = document.getElementById('loading-state');
const emptyState = document.getElementById('empty-state');
const emptyStateText = document.getElementById('empty-state-text');
const dataTable = document.getElementById('data-table');
const paginationBar = document.getElementById('pagination-bar');
const paginationInfo = document.getElementById('pagination-info');
const paginationCurrent = document.getElementById('pagination-current');
const prevPageBtn = document.getElementById('prev-page');
const nextPageBtn = document.getElementById('next-page');

const formModalOverlay = document.getElementById('form-modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalClose = document.getElementById('modal-close');
const modalCancel = document.getElementById('modal-cancel');
const productForm = document.getElementById('product-form');
const formError = document.getElementById('form-error');
const modalSubmit = document.getElementById('modal-submit');
const modalSubmitText = document.getElementById('modal-submit-text');
const statusSection = document.getElementById('status-section');

const warrantyAvailableSelect = document.getElementById('field-warrantyAvailable');
const warrantyDurationGroup = document.getElementById('warranty-duration-group');
const warrantyUnitGroup = document.getElementById('warranty-unit-group');

const confirmModalOverlay = document.getElementById('confirm-modal-overlay');
const confirmTitle = document.getElementById('confirm-title');
const confirmMessage = document.getElementById('confirm-message');
const confirmCancel = document.getElementById('confirm-cancel');
const confirmOk = document.getElementById('confirm-ok');

const toastContainer = document.getElementById('toast-container');

const FORM_FIELD_NAMES = [
  'productName', 'sku', 'barcode', 'category', 'brand', 'unit', 'description',
  'purchasePrice', 'sellingPrice', 'mrp', 'gst', 'discountAllowed',
  'minStockAlert', 'maxStock', 'reorderLevel',
  'warrantyAvailable', 'warrantyDuration', 'warrantyUnit',
  'usesSerialNumber', 'usesImeiNumber'
];

/* ============================================================
   STATE
   ============================================================ */

let currentPage = 1;
let currentEditId = null;
let searchDebounceTimer = null;
let masterOptions = { categories: [], brands: [], units: [], gst: [] };

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
    const err = new Error(message);
    err.errors = data && data.errors;
    throw err;
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
   MASTER DATA DROPDOWNS
   ============================================================ */

async function fetchAllActive(endpoint) {
  const result = await apiRequest(`/api/master-data/${endpoint}?status=Active&limit=100`, { method: 'GET' });
  return result.data || [];
}

function populateSelect(selectEl, options, { valueKey = 'id', labelFn, placeholder }) {
  selectEl.innerHTML = '';

  if (placeholder) {
    const placeholderOpt = document.createElement('option');
    placeholderOpt.value = '';
    placeholderOpt.textContent = placeholder;
    selectEl.appendChild(placeholderOpt);
  }

  options.forEach((item) => {
    const opt = document.createElement('option');
    opt.value = item[valueKey];
    opt.textContent = labelFn(item);
    selectEl.appendChild(opt);
  });
}

async function loadMasterOptions() {
  const [categories, brands, units, gst] = await Promise.all([
    fetchAllActive('categories'),
    fetchAllActive('brands'),
    fetchAllActive('units'),
    fetchAllActive('gst')
  ]);

  masterOptions = { categories, brands, units, gst };

  populateSelect(categoryFilter, categories, {
    labelFn: (c) => c.categoryName,
    placeholder: 'All Categories'
  });
  populateSelect(brandFilter, brands, {
    labelFn: (b) => b.brandName,
    placeholder: 'All Brands'
  });

  populateSelect(document.getElementById('field-category'), categories, {
    labelFn: (c) => c.categoryName,
    placeholder: 'Select Category'
  });
  populateSelect(document.getElementById('field-brand'), brands, {
    labelFn: (b) => b.brandName,
    placeholder: 'Select Brand'
  });
  populateSelect(document.getElementById('field-unit'), units, {
    labelFn: (u) => `${u.unitName} (${u.symbol})`,
    placeholder: 'Select Unit'
  });
  populateSelect(document.getElementById('field-gst'), gst, {
    labelFn: (g) => `${g.gstName} (${g.gstPercentage}%)`,
    placeholder: 'Select GST'
  });
}

/* ============================================================
   TABLE RENDERING
   ============================================================ */

function formatWarranty(record) {
  if (!record.warrantyAvailable) return 'None';
  return `${record.warrantyDuration} ${record.warrantyUnit}`;
}

function formatCurrency(value) {
  if (value === undefined || value === null) return '—';
  return `₹${Number(value).toFixed(2)}`;
}

function renderTableRows(records) {
  tableBody.innerHTML = '';

  records.forEach((record) => {
    const tr = document.createElement('tr');

    const nameTd = document.createElement('td');
    nameTd.textContent = record.productName;
    tr.appendChild(nameTd);

    const skuTd = document.createElement('td');
    skuTd.textContent = record.sku;
    tr.appendChild(skuTd);

    const brandTd = document.createElement('td');
    brandTd.textContent = record.brand ? record.brand.brandName : '—';
    tr.appendChild(brandTd);

    const categoryTd = document.createElement('td');
    categoryTd.textContent = record.category ? record.category.categoryName : '—';
    tr.appendChild(categoryTd);

    const priceTd = document.createElement('td');
    priceTd.textContent = formatCurrency(record.sellingPrice);
    tr.appendChild(priceTd);

    const gstTd = document.createElement('td');
    gstTd.textContent = record.gst ? `${record.gst.gstPercentage}%` : '—';
    tr.appendChild(gstTd);

    const warrantyTd = document.createElement('td');
    warrantyTd.classList.add('cell-muted');
    warrantyTd.textContent = formatWarranty(record);
    tr.appendChild(warrantyTd);

    const statusTd = document.createElement('td');
    const badge = document.createElement('span');
    const isActive = record.status === 'Active';
    badge.className = `status-badge ${isActive ? 'active' : 'inactive'}`;
    badge.textContent = record.status;
    statusTd.appendChild(badge);
    tr.appendChild(statusTd);

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
    toggleBtn.className = `row-action-btn ${isActive ? '' : 'success'}`;
    toggleBtn.textContent = isActive ? 'Deactivate' : 'Activate';
    toggleBtn.addEventListener('click', () => confirmToggleStatus(record));
    actionsWrap.appendChild(toggleBtn);

    actionsTd.appendChild(actionsWrap);
    tr.appendChild(actionsTd);

    tableBody.appendChild(tr);
  });
}

/* ============================================================
   LOAD RECORDS
   ============================================================ */

async function loadRecords() {
  const params = new URLSearchParams();
  params.set('page', currentPage);
  params.set('limit', '10');

  if (searchInput.value.trim()) {
    params.set('search', searchInput.value.trim());
  }
  if (statusFilter.value) {
    params.set('status', statusFilter.value);
  }
  if (categoryFilter.value) {
    params.set('category', categoryFilter.value);
  }
  if (brandFilter.value) {
    params.set('brand', brandFilter.value);
  }

  loadingState.hidden = false;
  emptyState.hidden = true;
  dataTable.style.display = 'none';
  paginationBar.hidden = true;

  try {
    const result = await apiRequest(`/api/products?${params.toString()}`, { method: 'GET' });

    loadingState.hidden = true;

    if (!result.data || result.data.length === 0) {
      emptyStateText.textContent = 'No products found. Click "Add Product" to create one.';
      emptyState.hidden = false;
      dataTable.style.display = 'none';
      return;
    }

    dataTable.style.display = 'table';
    renderTableRows(result.data);
    renderPagination(result.pagination);
  } catch (error) {
    loadingState.hidden = true;
    emptyState.hidden = false;
    emptyStateText.textContent = error.message || 'Unable to load products.';
    dataTable.style.display = 'none';
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

categoryFilter.addEventListener('change', () => {
  currentPage = 1;
  loadRecords();
});

brandFilter.addEventListener('change', () => {
  currentPage = 1;
  loadRecords();
});

/* ============================================================
   WARRANTY CONDITIONAL FIELDS
   ============================================================ */

function syncWarrantyFieldVisibility() {
  const isAvailable = warrantyAvailableSelect.value === 'true';
  warrantyDurationGroup.hidden = !isAvailable;
  warrantyUnitGroup.hidden = !isAvailable;
}

warrantyAvailableSelect.addEventListener('change', syncWarrantyFieldVisibility);

/* ============================================================
   FORM MODAL (Add / Edit)
   ============================================================ */

function clearFieldErrors() {
  FORM_FIELD_NAMES.forEach((name) => {
    const errorEl = document.getElementById(`error-${name}`);
    if (errorEl) errorEl.textContent = '';
  });
}

function resetFormFields() {
  productForm.reset();
  clearFieldErrors();
  formError.textContent = '';
  document.getElementById('field-discountAllowed').value = 'false';
  document.getElementById('field-warrantyAvailable').value = 'false';
  document.getElementById('field-usesSerialNumber').value = 'false';
  document.getElementById('field-usesImeiNumber').value = 'false';
  syncWarrantyFieldVisibility();
}

function populateFormFromRecord(record) {
  document.getElementById('field-productName').value = record.productName || '';
  document.getElementById('field-sku').value = record.sku || '';
  document.getElementById('field-barcode').value = record.barcode || '';
  document.getElementById('field-category').value = record.category ? record.category.id : '';
  document.getElementById('field-brand').value = record.brand ? record.brand.id : '';
  document.getElementById('field-unit').value = record.unit ? record.unit.id : '';
  document.getElementById('field-description').value = record.description || '';

  document.getElementById('field-purchasePrice').value = record.purchasePrice ?? '';
  document.getElementById('field-sellingPrice').value = record.sellingPrice ?? '';
  document.getElementById('field-mrp').value = record.mrp ?? '';
  document.getElementById('field-gst').value = record.gst ? record.gst.id : '';
  document.getElementById('field-discountAllowed').value = String(Boolean(record.discountAllowed));

  document.getElementById('field-minStockAlert').value = record.minStockAlert ?? '';
  document.getElementById('field-maxStock').value = record.maxStock ?? '';
  document.getElementById('field-reorderLevel').value = record.reorderLevel ?? '';

  document.getElementById('field-warrantyAvailable').value = String(Boolean(record.warrantyAvailable));
  document.getElementById('field-warrantyDuration').value = record.warrantyDuration ?? '';
  document.getElementById('field-warrantyUnit').value = record.warrantyUnit || 'Days';
  syncWarrantyFieldVisibility();

  document.getElementById('field-usesSerialNumber').value = String(Boolean(record.usesSerialNumber));
  document.getElementById('field-usesImeiNumber').value = String(Boolean(record.usesImeiNumber));

  document.getElementById('field-status').value = record.status || 'Active';
}

function openAddModal() {
  currentEditId = null;
  modalTitle.textContent = 'Add Product';
  modalSubmitText.textContent = 'Save';
  statusSection.hidden = true;
  resetFormFields();
  formModalOverlay.hidden = false;
}

function openEditModal(record) {
  currentEditId = record.id;
  modalTitle.textContent = 'Edit Product';
  modalSubmitText.textContent = 'Update';
  formError.textContent = '';
  clearFieldErrors();
  statusSection.hidden = false;
  populateFormFromRecord(record);
  formModalOverlay.hidden = false;
}

function closeFormModal() {
  formModalOverlay.hidden = true;
  resetFormFields();
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

function collectFormData() {
  const payload = {};

  FORM_FIELD_NAMES.forEach((name) => {
    const input = document.getElementById(`field-${name}`);
    if (input) {
      payload[name] = input.value;
    }
  });

  if (currentEditId) {
    payload.status = document.getElementById('field-status').value;
  }

  return payload;
}

productForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  formError.textContent = '';
  clearFieldErrors();

  const payload = collectFormData();

  modalSubmit.disabled = true;
  modalSubmitText.textContent = currentEditId ? 'Updating...' : 'Saving...';

  try {
    if (currentEditId) {
      await apiRequest(`/api/products/${currentEditId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      showToast('Product updated successfully', 'success');
    } else {
      await apiRequest('/api/products', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showToast('Product added successfully', 'success');
    }

    closeFormModal();
    loadRecords();
  } catch (error) {
    formError.textContent = error.message || 'Unable to save the product.';
  } finally {
    modalSubmit.disabled = false;
    modalSubmitText.textContent = currentEditId ? 'Update' : 'Save';
  }
});

/* ============================================================
   CONFIRMATION DIALOG (status toggle)
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
  const nextStatus = record.status === 'Active' ? 'Inactive' : 'Active';

  openConfirmDialog({
    title: `${nextStatus === 'Active' ? 'Activate' : 'Deactivate'} Product`,
    message: `Are you sure you want to ${nextStatus === 'Active' ? 'activate' : 'deactivate'} "${record.productName}"? ${
      nextStatus === 'Inactive' ? 'Inactive products will not appear in Purchase or Billing.' : ''
    }`,
    onConfirm: async () => {
      try {
        await apiRequest(`/api/products/${record.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: nextStatus })
        });
        showToast(`Product ${nextStatus === 'Active' ? 'activated' : 'deactivated'} successfully`, 'success');
        loadRecords();
      } catch (error) {
        showToast(error.message || 'Unable to update status.', 'error');
      }
    }
  });
}

/* ============================================================
   INIT
   ============================================================ */

async function init() {
  renderCurrentDate();
  const isValid = await validateSession();
  if (!isValid) return;

  await applySidebarPermissions();

  const canAccess = await guardPageAccess('Product Master');
  if (!canAccess) return;

  try {
    await loadMasterOptions();
  } catch (error) {
    showToast(error.message || 'Unable to load master data.', 'error');
  }

  syncWarrantyFieldVisibility();
  loadRecords();
}

init();