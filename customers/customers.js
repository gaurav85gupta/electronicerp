const API_BASE_URL = 'http://localhost:5000';

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
const customerTypeFilter = document.getElementById('customer-type-filter');
const cityFilter = document.getElementById('city-filter');
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
const customerForm = document.getElementById('customer-form');
const formError = document.getElementById('form-error');
const modalSubmit = document.getElementById('modal-submit');
const modalSubmitText = document.getElementById('modal-submit-text');
const statusSection = document.getElementById('status-section');
const businessDetailsSection = document.getElementById('business-details-section');
const customerCodeDisplay = document.getElementById('customer-code-display');
const customerCodeValue = document.getElementById('customer-code-value');

const customerTypeSelect = document.getElementById('field-customerType');

const mobileNumberInput = document.getElementById('field-mobileNumber');
const alternateMobileInput = document.getElementById('field-alternateMobile');
attachMobileInputGuard(mobileNumberInput);
attachMobileInputGuard(alternateMobileInput);

const profileModalOverlay = document.getElementById('profile-modal-overlay');
const profileModalBody = document.getElementById('profile-modal-body');
const profileModalClose = document.getElementById('profile-modal-close');
const profileModalCloseFooter = document.getElementById('profile-modal-close-footer');

const confirmModalOverlay = document.getElementById('confirm-modal-overlay');
const confirmTitle = document.getElementById('confirm-title');
const confirmMessage = document.getElementById('confirm-message');
const confirmCancel = document.getElementById('confirm-cancel');
const confirmOk = document.getElementById('confirm-ok');

const toastContainer = document.getElementById('toast-container');

const BASIC_FIELD_NAMES = [
  'customerType', 'customerName', 'mobileNumber', 'alternateMobile',
  'email', 'dateOfBirth', 'anniversary'
];
const ADDRESS_FIELD_NAMES = ['addressLine1', 'addressLine2', 'city', 'state', 'pincode'];
const BUSINESS_FIELD_NAMES = ['businessName', 'gstNumber'];
const ALL_FIELD_NAMES = [...BASIC_FIELD_NAMES, ...ADDRESS_FIELD_NAMES, ...BUSINESS_FIELD_NAMES];

/* ============================================================
   STATE
   ============================================================ */

let currentPage = 1;
let currentEditId = null;
let searchDebounceTimer = null;
let customerTypeOptions = [];

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
  customerTypeOptions = await fetchAllActive('customer-types');

  populateSelect(customerTypeFilter, customerTypeOptions, {
    labelFn: (t) => t.customerType,
    placeholder: 'All Customer Types'
  });

  populateSelect(customerTypeSelect, customerTypeOptions, {
    labelFn: (t) => t.customerType,
    placeholder: 'Select Customer Type'
  });
}

function isWholesaleType(customerTypeId) {
  const match = customerTypeOptions.find((t) => t.id === customerTypeId);
  return Boolean(match && /wholesale/i.test(match.customerType));
}

function syncBusinessSectionVisibility() {
  businessDetailsSection.hidden = !isWholesaleType(customerTypeSelect.value);
}

customerTypeSelect.addEventListener('change', syncBusinessSectionVisibility);

/* ============================================================
   TABLE RENDERING
   ============================================================ */

function formatCurrency(value) {
  if (value === undefined || value === null) return '—';
  return `₹${Number(value).toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function renderTableRows(records) {
  tableBody.innerHTML = '';

  records.forEach((record) => {
    const tr = document.createElement('tr');

    const codeTd = document.createElement('td');
    codeTd.textContent = record.customerCode;
    tr.appendChild(codeTd);

    const nameTd = document.createElement('td');
    nameTd.textContent = record.customerName;
    tr.appendChild(nameTd);

    const mobileTd = document.createElement('td');
    mobileTd.textContent = record.mobileNumber;
    tr.appendChild(mobileTd);

    const typeTd = document.createElement('td');
    const typeLabel = record.customerType ? record.customerType.customerType : '—';
    const typeBadge = document.createElement('span');
    typeBadge.className = `customer-type-badge${/wholesale/i.test(typeLabel) ? ' wholesale' : ''}`;
    typeBadge.textContent = typeLabel;
    typeTd.appendChild(typeBadge);
    tr.appendChild(typeTd);

    const cityTd = document.createElement('td');
    cityTd.classList.add('cell-muted');
    cityTd.textContent = (record.address && record.address.city) || '—';
    tr.appendChild(cityTd);

    const gstTd = document.createElement('td');
    gstTd.classList.add('cell-muted');
    gstTd.textContent = record.gstNumber || '—';
    tr.appendChild(gstTd);

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

    const viewBtn = document.createElement('button');
    viewBtn.type = 'button';
    viewBtn.className = 'row-action-btn link';
    viewBtn.textContent = 'View';
    viewBtn.addEventListener('click', () => openProfileModal(record.id));
    actionsWrap.appendChild(viewBtn);

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
  if (customerTypeFilter.value) {
    params.set('customerType', customerTypeFilter.value);
  }
  if (cityFilter.value.trim()) {
    params.set('city', cityFilter.value.trim());
  }

  loadingState.hidden = false;
  emptyState.hidden = true;
  dataTable.style.display = 'none';
  paginationBar.hidden = true;

  try {
    const result = await apiRequest(`/api/customers?${params.toString()}`, { method: 'GET' });

    loadingState.hidden = true;

    if (!result.data || result.data.length === 0) {
      emptyStateText.textContent = 'No customers found. Click "Add Customer" to create one.';
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
    emptyStateText.textContent = error.message || 'Unable to load customers.';
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

cityFilter.addEventListener('input', () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    currentPage = 1;
    loadRecords();
  }, 350);
});

[statusFilter, customerTypeFilter].forEach((el) => {
  el.addEventListener('change', () => {
    currentPage = 1;
    loadRecords();
  });
});

/* ============================================================
   FORM MODAL (Add / Edit)
   ============================================================ */

function clearFieldErrors() {
  ALL_FIELD_NAMES.forEach((name) => {
    const errorEl = document.getElementById(`error-${name}`);
    if (errorEl) errorEl.textContent = '';
  });
}

function resetFormFields() {
  customerForm.reset();
  clearFieldErrors();
  formError.textContent = '';
  syncBusinessSectionVisibility();
}

function populateFormFromRecord(record) {
  document.getElementById('field-customerType').value = record.customerType ? record.customerType.id : '';
  document.getElementById('field-customerName').value = record.customerName || '';
  document.getElementById('field-mobileNumber').value = record.mobileNumber || '';
  document.getElementById('field-alternateMobile').value = record.alternateMobile || '';
  document.getElementById('field-email').value = record.email || '';
  document.getElementById('field-dateOfBirth').value = record.dateOfBirth ? record.dateOfBirth.slice(0, 10) : '';
  document.getElementById('field-anniversary').value = record.anniversary ? record.anniversary.slice(0, 10) : '';

  const address = record.address || {};
  document.getElementById('field-addressLine1').value = address.addressLine1 || '';
  document.getElementById('field-addressLine2').value = address.addressLine2 || '';
  document.getElementById('field-city').value = address.city || '';
  document.getElementById('field-state').value = address.state || '';
  document.getElementById('field-pincode').value = address.pincode || '';

  document.getElementById('field-businessName').value = record.businessName || '';
  document.getElementById('field-gstNumber').value = record.gstNumber || '';

  document.getElementById('field-status').value = record.status || 'Active';

  syncBusinessSectionVisibility();
}

function openAddModal() {
  currentEditId = null;
  modalTitle.textContent = 'Add Customer';
  modalSubmitText.textContent = 'Save';
  statusSection.hidden = true;
  customerCodeDisplay.hidden = true;
  resetFormFields();
  formModalOverlay.hidden = false;
}

function openEditModal(record) {
  currentEditId = record.id;
  modalTitle.textContent = 'Edit Customer';
  modalSubmitText.textContent = 'Update';
  formError.textContent = '';
  clearFieldErrors();
  statusSection.hidden = false;
  customerCodeDisplay.hidden = false;
  customerCodeValue.textContent = record.customerCode;
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

  BASIC_FIELD_NAMES.forEach((name) => {
    const input = document.getElementById(`field-${name}`);
    if (input) payload[name] = input.value;
  });

  payload.address = {};
  ADDRESS_FIELD_NAMES.forEach((name) => {
    const input = document.getElementById(`field-${name}`);
    if (input) payload.address[name] = input.value;
  });

  BUSINESS_FIELD_NAMES.forEach((name) => {
    const input = document.getElementById(`field-${name}`);
    if (input) payload[name] = input.value;
  });

  if (currentEditId) {
    payload.status = document.getElementById('field-status').value;
  }

  return payload;
}

customerForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  formError.textContent = '';
  clearFieldErrors();

  const payload = collectFormData();

  modalSubmit.disabled = true;
  modalSubmitText.textContent = currentEditId ? 'Updating...' : 'Saving...';

  try {
    if (currentEditId) {
      await apiRequest(`/api/customers/${currentEditId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
      showToast('Customer updated successfully', 'success');
    } else {
      await apiRequest('/api/customers', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      showToast('Customer added successfully', 'success');
    }

    closeFormModal();
    loadRecords();
  } catch (error) {
    formError.textContent = error.message || 'Unable to save the customer.';
  } finally {
    modalSubmit.disabled = false;
    modalSubmitText.textContent = currentEditId ? 'Update' : 'Save';
  }
});

/* ============================================================
   CUSTOMER PROFILE MODAL
   ============================================================ */

function renderProfileLoading() {
  profileModalBody.innerHTML = `
    <div class="table-state" id="profile-loading-state">
      <p>Loading customer profile...</p>
    </div>
  `;
}

function renderProfileError(message) {
  profileModalBody.innerHTML = `
    <div class="table-state">
      <p>${message}</p>
    </div>
  `;
}

function renderProfile(profile) {
  const { customer, purchaseHistory, recentBills, purchasedProducts, activeWarrantyCount } = profile;

  profileModalBody.innerHTML = '';

  const header = document.createElement('div');
  header.className = 'profile-header';

  const identity = document.createElement('div');
  identity.className = 'profile-identity';
  const nameEl = document.createElement('h3');
  nameEl.textContent = customer.customerName;
  const metaEl = document.createElement('p');
  metaEl.textContent = `${customer.customerCode} · ${customer.mobileNumber}${customer.customerType ? ' · ' + customer.customerType.customerType : ''}`;
  identity.appendChild(nameEl);
  identity.appendChild(metaEl);

  const statusBadge = document.createElement('span');
  const isActive = customer.status === 'Active';
  statusBadge.className = `status-badge ${isActive ? 'active' : 'inactive'}`;
  statusBadge.textContent = customer.status;

  header.appendChild(identity);
  header.appendChild(statusBadge);
  profileModalBody.appendChild(header);

  if (customer.email || customer.gstNumber || customer.businessName || (customer.address && customer.address.city)) {
    const grid = document.createElement('div');
    grid.className = 'view-grid';

    const addField = (label, value) => {
      const field = document.createElement('div');
      field.className = 'view-field';
      const labelEl = document.createElement('span');
      labelEl.className = 'view-field-label';
      labelEl.textContent = label;
      const valueEl = document.createElement('span');
      valueEl.className = 'view-field-value';
      valueEl.textContent = value || '—';
      field.appendChild(labelEl);
      field.appendChild(valueEl);
      grid.appendChild(field);
    };

    addField('Email', customer.email);
    addField('Alternate Mobile', customer.alternateMobile);
    if (customer.businessName || customer.gstNumber) {
      addField('Business Name', customer.businessName);
      addField('GST Number', customer.gstNumber);
    }
    const address = customer.address || {};
    const addressLine = [address.addressLine1, address.addressLine2, address.city, address.state, address.pincode]
      .filter(Boolean)
      .join(', ');
    addField('Address', addressLine);

    profileModalBody.appendChild(grid);
  }

  const statsGrid = document.createElement('div');
  statsGrid.className = 'profile-stats-grid';

  const stats = [
    { label: 'Total Bills', value: purchaseHistory.totalBills },
    { label: 'Total Purchase Amount', value: formatCurrency(purchaseHistory.totalPurchaseAmount) },
    { label: 'Last Purchase Date', value: formatDate(purchaseHistory.lastPurchaseDate) }
  ];

  stats.forEach((stat) => {
    const card = document.createElement('div');
    card.className = 'profile-stat-card';
    const labelEl = document.createElement('span');
    labelEl.className = 'profile-stat-label';
    labelEl.textContent = stat.label;
    const valueEl = document.createElement('span');
    valueEl.className = 'profile-stat-value';
    valueEl.textContent = stat.value;
    card.appendChild(labelEl);
    card.appendChild(valueEl);
    statsGrid.appendChild(card);
  });

  profileModalBody.appendChild(statsGrid);

  const billsSection = document.createElement('div');
  billsSection.className = 'view-section';
  const billsTitle = document.createElement('span');
  billsTitle.className = 'form-section-title';
  billsTitle.textContent = 'Recent Bills';
  billsSection.appendChild(billsTitle);

  if (recentBills.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'profile-empty-note';
    empty.textContent = 'No finalized bills yet for this customer.';
    billsSection.appendChild(empty);
  } else {
    const billsWrap = document.createElement('div');
    billsWrap.className = 'profile-recent-bills';
    recentBills.forEach((bill) => {
      const row = document.createElement('div');
      row.className = 'profile-bill-row';
      const left = document.createElement('span');
      left.innerHTML = '';
      const numberEl = document.createElement('span');
      numberEl.className = 'profile-bill-number';
      numberEl.textContent = bill.billNumber;
      const metaEl = document.createElement('span');
      metaEl.className = 'profile-bill-meta';
      metaEl.textContent = ` · ${formatDate(bill.billDate)}`;
      left.appendChild(numberEl);
      left.appendChild(metaEl);

      const amountEl = document.createElement('span');
      amountEl.className = 'profile-bill-amount';
      amountEl.textContent = formatCurrency(bill.grandTotal);

      row.appendChild(left);
      row.appendChild(amountEl);
      billsWrap.appendChild(row);
    });
    billsSection.appendChild(billsWrap);
  }

  profileModalBody.appendChild(billsSection);

  const productsSection = document.createElement('div');
  productsSection.className = 'view-section';
  const productsTitle = document.createElement('span');
  productsTitle.className = 'form-section-title';
  productsTitle.textContent = 'Purchased Products';
  productsSection.appendChild(productsTitle);

  if (purchasedProducts.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'profile-empty-note';
    empty.textContent = 'No purchased products to show yet.';
    productsSection.appendChild(empty);
  } else {
    const chipList = document.createElement('div');
    chipList.className = 'profile-product-chip-list';
    purchasedProducts.forEach((product) => {
      const chip = document.createElement('span');
      chip.className = 'profile-product-chip';
      chip.textContent = product.productName;
      const qty = document.createElement('span');
      qty.textContent = ` × ${product.quantity}`;
      chip.appendChild(qty);
      chipList.appendChild(chip);
    });
    productsSection.appendChild(chipList);
  }

  profileModalBody.appendChild(productsSection);

  const warrantySection = document.createElement('div');
  warrantySection.className = 'view-section';
  const warrantyTitle = document.createElement('span');
  warrantyTitle.className = 'form-section-title';
  warrantyTitle.textContent = 'Active Warranties';
  warrantySection.appendChild(warrantyTitle);
  const warrantyValue = document.createElement('p');
  warrantyValue.className = 'profile-empty-note';
  warrantyValue.textContent = activeWarrantyCount > 0
    ? `${activeWarrantyCount} active warranty record${activeWarrantyCount === 1 ? '' : 's'}.`
    : 'No active warranties for this customer.';
  warrantySection.appendChild(warrantyValue);
  profileModalBody.appendChild(warrantySection);

  const repairSection = document.createElement('div');
  repairSection.className = 'view-section';
  const repairTitle = document.createElement('span');
  repairTitle.className = 'form-section-title';
  repairTitle.textContent = 'Repair History';
  repairSection.appendChild(repairTitle);
  const repairValue = document.createElement('p');
  repairValue.className = 'profile-empty-note';
  repairValue.textContent = 'Repair module is not yet available.';
  repairSection.appendChild(repairValue);
  profileModalBody.appendChild(repairSection);
}

async function openProfileModal(customerId) {
  profileModalOverlay.hidden = false;
  renderProfileLoading();

  try {
    const result = await apiRequest(`/api/customers/${customerId}/profile`, { method: 'GET' });
    renderProfile(result.data);
  } catch (error) {
    renderProfileError(error.message || 'Unable to load customer profile.');
  }
}

function closeProfileModal() {
  profileModalOverlay.hidden = true;
}

profileModalClose.addEventListener('click', closeProfileModal);
profileModalCloseFooter.addEventListener('click', closeProfileModal);

profileModalOverlay.addEventListener('click', (event) => {
  if (event.target === profileModalOverlay) {
    closeProfileModal();
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
    title: `${nextStatus === 'Active' ? 'Activate' : 'Deactivate'} Customer`,
    message: `Are you sure you want to ${nextStatus === 'Active' ? 'activate' : 'deactivate'} "${record.customerName}"? ${
      nextStatus === 'Inactive' ? 'Inactive customers will not appear in Billing customer search.' : ''
    }`,
    onConfirm: async () => {
      try {
        await apiRequest(`/api/customers/${record.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: nextStatus })
        });
        showToast(`Customer ${nextStatus === 'Active' ? 'activated' : 'deactivated'} successfully`, 'success');
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

  const canAccess = await guardPageAccess('Customers');
  if (!canAccess) return;

  try {
    await loadMasterOptions();
  } catch (error) {
    showToast(error.message || 'Unable to load master data.', 'error');
  }

  loadRecords();
}

init();