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
const stockStatusFilter = document.getElementById('stock-status-filter');
const activeOnlyFilter = document.getElementById('active-only-filter');
const openingStockButton = document.getElementById('opening-stock-button');
const adjustmentButton = document.getElementById('adjustment-button');

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

const toastContainer = document.getElementById('toast-container');

// Opening Stock modal
const openingStockModalOverlay = document.getElementById('opening-stock-modal-overlay');
const openingStockClose = document.getElementById('opening-stock-close');
const openingStockCancel = document.getElementById('opening-stock-cancel');
const openingStockForm = document.getElementById('opening-stock-form');
const openingStockError = document.getElementById('opening-stock-error');
const openingStockSubmit = document.getElementById('opening-stock-submit');
const openingStockSubmitText = document.getElementById('opening-stock-submit-text');
const osFieldProduct = document.getElementById('os-field-product');

// Stock Adjustment modal
const adjustmentModalOverlay = document.getElementById('adjustment-modal-overlay');
const adjustmentClose = document.getElementById('adjustment-close');
const adjustmentCancel = document.getElementById('adjustment-cancel');
const adjustmentForm = document.getElementById('adjustment-form');
const adjustmentError = document.getElementById('adjustment-error');
const adjustmentSubmit = document.getElementById('adjustment-submit');
const adjustmentSubmitText = document.getElementById('adjustment-submit-text');
const adjFieldProduct = document.getElementById('adj-field-product');
const adjCurrentStockHint = document.getElementById('adj-current-stock-hint');
const adjFieldAdjustmentType = document.getElementById('adj-field-adjustmentType');
const adjFieldQuantity = document.getElementById('adj-field-quantity');

// Movement History modal
const historyModalOverlay = document.getElementById('history-modal-overlay');
const historyTitle = document.getElementById('history-title');
const historyClose = document.getElementById('history-close');
const historyCloseFooter = document.getElementById('history-close-footer');
const historyTableBody = document.getElementById('history-table-body');
const historyTable = document.getElementById('history-table');
const historyLoadingState = document.getElementById('history-loading-state');
const historyEmptyState = document.getElementById('history-empty-state');
const historyPaginationBar = document.getElementById('history-pagination-bar');
const historyPaginationInfo = document.getElementById('history-pagination-info');
const historyPaginationCurrent = document.getElementById('history-pagination-current');
const historyPrevPageBtn = document.getElementById('history-prev-page');
const historyNextPageBtn = document.getElementById('history-next-page');

const OPENING_STOCK_FIELD_NAMES = ['product', 'quantity', 'minStockLevel', 'maxStockLevel', 'reorderLevel'];
const ADJUSTMENT_FIELD_NAMES = ['product', 'adjustmentType', 'quantity', 'reason', 'remarks'];

/* ============================================================
   STATE
   ============================================================ */

let currentPage = 1;
let searchDebounceTimer = null;
let allActiveProducts = [];
let inventoryByProductId = new Map();

let historyCurrentInventoryId = null;
let historyCurrentPage = 1;

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
   MASTER / PRODUCT DATA
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

async function loadFilterOptions() {
  const [categories, brands] = await Promise.all([
    fetchAllActive('categories'),
    fetchAllActive('brands')
  ]);

  populateSelect(categoryFilter, categories, {
    labelFn: (c) => c.categoryName,
    placeholder: 'All Categories'
  });
  populateSelect(brandFilter, brands, {
    labelFn: (b) => b.brandName,
    placeholder: 'All Brands'
  });
}

async function fetchAllActiveProducts() {
  const result = await apiRequest('/api/products?status=Active&limit=100', { method: 'GET' });
  return result.data || [];
}

async function fetchAllInventoryForProductLookup() {
  const result = await apiRequest('/api/inventory?limit=1000', { method: 'GET' });
  const map = new Map();
  (result.data || []).forEach((record) => {
    if (record.product) {
      map.set(record.product.id, record);
    }
  });
  return map;
}

async function refreshProductLookups() {
  const [products, inventoryMap] = await Promise.all([
    fetchAllActiveProducts(),
    fetchAllInventoryForProductLookup()
  ]);
  allActiveProducts = products;
  inventoryByProductId = inventoryMap;
}

/* ============================================================
   TABLE RENDERING
   ============================================================ */

function stockStatusBadgeClass(status) {
  if (status === 'Out of Stock') return 'out-of-stock';
  if (status === 'Low Stock') return 'low-stock';
  return 'in-stock';
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  return date.toLocaleString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit'
  });
}

function renderTableRows(records) {
  tableBody.innerHTML = '';

  records.forEach((record) => {
    const tr = document.createElement('tr');
    const product = record.product || {};

    const nameTd = document.createElement('td');
    nameTd.textContent = product.productName || '—';
    tr.appendChild(nameTd);

    const skuTd = document.createElement('td');
    skuTd.textContent = product.sku || '—';
    tr.appendChild(skuTd);

    const categoryTd = document.createElement('td');
    categoryTd.textContent = product.category ? product.category.categoryName : '—';
    tr.appendChild(categoryTd);

    const brandTd = document.createElement('td');
    brandTd.textContent = product.brand ? product.brand.brandName : '—';
    tr.appendChild(brandTd);

    const currentQtyTd = document.createElement('td');
    currentQtyTd.textContent = record.currentQuantity;
    tr.appendChild(currentQtyTd);

    const availableQtyTd = document.createElement('td');
    availableQtyTd.textContent = record.availableQuantity;
    tr.appendChild(availableQtyTd);

    const reorderTd = document.createElement('td');
    reorderTd.textContent = record.reorderLevel;
    tr.appendChild(reorderTd);

    const statusTd = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `status-badge ${stockStatusBadgeClass(record.stockStatus)}`;
    badge.textContent = record.stockStatus;
    statusTd.appendChild(badge);
    tr.appendChild(statusTd);

    const lastUpdatedTd = document.createElement('td');
    lastUpdatedTd.classList.add('cell-muted');
    lastUpdatedTd.textContent = formatDateTime(record.lastUpdated);
    tr.appendChild(lastUpdatedTd);

    const actionsTd = document.createElement('td');
    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'row-actions';

    const historyBtn = document.createElement('button');
    historyBtn.type = 'button';
    historyBtn.className = 'row-action-btn link';
    historyBtn.textContent = 'History';
    historyBtn.addEventListener('click', () => openHistoryModal(record));
    actionsWrap.appendChild(historyBtn);

    const adjustBtn = document.createElement('button');
    adjustBtn.type = 'button';
    adjustBtn.className = 'row-action-btn';
    adjustBtn.textContent = 'Adjust';
    adjustBtn.addEventListener('click', () => openAdjustmentModal(product.id));
    actionsWrap.appendChild(adjustBtn);

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
  if (categoryFilter.value) {
    params.set('category', categoryFilter.value);
  }
  if (brandFilter.value) {
    params.set('brand', brandFilter.value);
  }
  if (stockStatusFilter.value) {
    params.set('stockStatus', stockStatusFilter.value);
  }
  if (activeOnlyFilter.checked) {
    params.set('active', 'true');
  }

  loadingState.hidden = false;
  emptyState.hidden = true;
  dataTable.style.display = 'none';
  paginationBar.hidden = true;

  try {
    const result = await apiRequest(`/api/inventory?${params.toString()}`, { method: 'GET' });

    loadingState.hidden = true;

    if (!result.data || result.data.length === 0) {
      emptyStateText.textContent = 'No inventory records found. Use "Opening Stock" to add a product to inventory.';
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
    emptyStateText.textContent = error.message || 'Unable to load inventory.';
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

categoryFilter.addEventListener('change', () => {
  currentPage = 1;
  loadRecords();
});

brandFilter.addEventListener('change', () => {
  currentPage = 1;
  loadRecords();
});

stockStatusFilter.addEventListener('change', () => {
  currentPage = 1;
  loadRecords();
});

activeOnlyFilter.addEventListener('change', () => {
  currentPage = 1;
  loadRecords();
});

/* ============================================================
   OPENING STOCK MODAL
   ============================================================ */

function clearFieldErrors(fieldNames, prefix) {
  fieldNames.forEach((name) => {
    const errorEl = document.getElementById(`${prefix}-error-${name}`);
    if (errorEl) errorEl.textContent = '';
  });
}

function populateProductsWithoutInventory(selectEl) {
  const productsWithoutInventory = allActiveProducts.filter((product) => !inventoryByProductId.has(product.id));

  populateSelect(selectEl, productsWithoutInventory, {
    labelFn: (p) => `${p.productName} (${p.sku})`,
    placeholder: productsWithoutInventory.length > 0 ? 'Select Product' : 'No eligible products'
  });
}

function resetOpeningStockForm() {
  openingStockForm.reset();
  clearFieldErrors(OPENING_STOCK_FIELD_NAMES, 'os');
  openingStockError.textContent = '';
}

async function openOpeningStockModal() {
  try {
    await refreshProductLookups();
  } catch (error) {
    showToast(error.message || 'Unable to load products.', 'error');
    return;
  }

  resetOpeningStockForm();
  populateProductsWithoutInventory(osFieldProduct);
  openingStockModalOverlay.hidden = false;
}

function closeOpeningStockModal() {
  openingStockModalOverlay.hidden = true;
  resetOpeningStockForm();
}

openingStockButton.addEventListener('click', openOpeningStockModal);
openingStockClose.addEventListener('click', closeOpeningStockModal);
openingStockCancel.addEventListener('click', closeOpeningStockModal);

openingStockModalOverlay.addEventListener('click', (event) => {
  if (event.target === openingStockModalOverlay) {
    closeOpeningStockModal();
  }
});

function collectFormData(fieldNames, prefix) {
  const payload = {};
  fieldNames.forEach((name) => {
    const input = document.getElementById(`${prefix}-field-${name}`);
    if (input) {
      payload[name] = input.value;
    }
  });
  return payload;
}

openingStockForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  openingStockError.textContent = '';
  clearFieldErrors(OPENING_STOCK_FIELD_NAMES, 'os');

  const payload = collectFormData(OPENING_STOCK_FIELD_NAMES, 'os');

  openingStockSubmit.disabled = true;
  openingStockSubmitText.textContent = 'Saving...';

  try {
    await apiRequest('/api/inventory/opening-stock', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    showToast('Opening stock created successfully', 'success');
    closeOpeningStockModal();
    loadRecords();
  } catch (error) {
    openingStockError.textContent = error.message || 'Unable to create opening stock.';
  } finally {
    openingStockSubmit.disabled = false;
    openingStockSubmitText.textContent = 'Save';
  }
});

/* ============================================================
   STOCK ADJUSTMENT MODAL
   ============================================================ */

function resetAdjustmentForm() {
  adjustmentForm.reset();
  clearFieldErrors(ADJUSTMENT_FIELD_NAMES, 'adj');
  adjustmentError.textContent = '';
  adjCurrentStockHint.textContent = '';
  adjCurrentStockHint.classList.remove('warning');
}

function updateCurrentStockHint() {
  const productId = adjFieldProduct.value;
  const inventory = inventoryByProductId.get(productId);

  if (!inventory) {
    adjCurrentStockHint.textContent = '';
    return;
  }

  adjCurrentStockHint.textContent = `Current Stock: ${inventory.currentQuantity} · Available: ${inventory.availableQuantity} · Reorder Level: ${inventory.reorderLevel}`;
  adjCurrentStockHint.classList.toggle('warning', inventory.stockStatus !== 'In Stock');
}

async function openAdjustmentModal(preselectProductId) {
  try {
    await refreshProductLookups();
  } catch (error) {
    showToast(error.message || 'Unable to load products.', 'error');
    return;
  }

  resetAdjustmentForm();

  const productsWithInventory = allActiveProducts.filter((product) => inventoryByProductId.has(product.id));
  populateSelect(adjFieldProduct, productsWithInventory, {
    labelFn: (p) => `${p.productName} (${p.sku})`,
    placeholder: productsWithInventory.length > 0 ? 'Select Product' : 'No products in inventory'
  });

  if (preselectProductId) {
    adjFieldProduct.value = preselectProductId;
  }

  updateCurrentStockHint();
  adjustmentModalOverlay.hidden = false;
}

function closeAdjustmentModal() {
  adjustmentModalOverlay.hidden = true;
  resetAdjustmentForm();
}

adjustmentButton.addEventListener('click', () => openAdjustmentModal(null));
adjustmentClose.addEventListener('click', closeAdjustmentModal);
adjustmentCancel.addEventListener('click', closeAdjustmentModal);
adjFieldProduct.addEventListener('change', updateCurrentStockHint);

adjustmentModalOverlay.addEventListener('click', (event) => {
  if (event.target === adjustmentModalOverlay) {
    closeAdjustmentModal();
  }
});

adjustmentForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  adjustmentError.textContent = '';
  clearFieldErrors(ADJUSTMENT_FIELD_NAMES, 'adj');

  const payload = collectFormData(ADJUSTMENT_FIELD_NAMES, 'adj');

  adjustmentSubmit.disabled = true;
  adjustmentSubmitText.textContent = 'Saving...';

  try {
    await apiRequest('/api/inventory/adjustment', {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    showToast('Stock adjustment recorded successfully', 'success');
    closeAdjustmentModal();
    loadRecords();
  } catch (error) {
    adjustmentError.textContent = error.message || 'Unable to record stock adjustment.';
  } finally {
    adjustmentSubmit.disabled = false;
    adjustmentSubmitText.textContent = 'Save Adjustment';
  }
});

/* ============================================================
   MOVEMENT HISTORY MODAL
   ============================================================ */

function formatReference(movement) {
  return movement.referenceType || '—';
}

function renderHistoryRows(movements) {
  historyTableBody.innerHTML = '';

  movements.forEach((movement) => {
    const tr = document.createElement('tr');

    const dateTd = document.createElement('td');
    dateTd.textContent = formatDateTime(movement.createdAt);
    tr.appendChild(dateTd);

    const typeTd = document.createElement('td');
    typeTd.textContent = movement.movementType;
    tr.appendChild(typeTd);

    const qtyTd = document.createElement('td');
    qtyTd.textContent = movement.quantity;
    tr.appendChild(qtyTd);

    const prevTd = document.createElement('td');
    prevTd.classList.add('cell-muted');
    prevTd.textContent = movement.previousStock;
    tr.appendChild(prevTd);

    const newTd = document.createElement('td');
    newTd.textContent = movement.newStock;
    tr.appendChild(newTd);

    const refTd = document.createElement('td');
    refTd.classList.add('cell-muted');
    refTd.textContent = formatReference(movement);
    tr.appendChild(refTd);

    const userTd = document.createElement('td');
    userTd.textContent = movement.performedBy ? movement.performedBy.fullName : '—';
    tr.appendChild(userTd);

    const remarksTd = document.createElement('td');
    remarksTd.classList.add('cell-muted');
    remarksTd.textContent = movement.remarks || movement.reason || '—';
    tr.appendChild(remarksTd);

    historyTableBody.appendChild(tr);
  });
}

async function loadHistory() {
  if (!historyCurrentInventoryId) return;

  const params = new URLSearchParams();
  params.set('page', historyCurrentPage);
  params.set('limit', '10');

  historyLoadingState.hidden = false;
  historyEmptyState.hidden = true;
  historyTable.style.display = 'none';
  historyPaginationBar.hidden = true;

  try {
    const result = await apiRequest(`/api/inventory/${historyCurrentInventoryId}/movements?${params.toString()}`, { method: 'GET' });

    historyLoadingState.hidden = true;

    if (!result.data || result.data.length === 0) {
      historyEmptyState.hidden = false;
      historyTable.style.display = 'none';
      return;
    }

    historyTable.style.display = 'table';
    renderHistoryRows(result.data);
    renderHistoryPagination(result.pagination);
  } catch (error) {
    historyLoadingState.hidden = true;
    historyEmptyState.hidden = false;
    historyTable.style.display = 'none';
    showToast(error.message || 'Unable to load movement history.', 'error');
  }
}

function renderHistoryPagination(pagination) {
  if (!pagination || pagination.totalRecords === 0) {
    historyPaginationBar.hidden = true;
    return;
  }

  historyPaginationBar.hidden = false;
  historyCurrentPage = pagination.page;

  const start = (pagination.page - 1) * pagination.limit + 1;
  const end = Math.min(pagination.page * pagination.limit, pagination.totalRecords);

  historyPaginationInfo.textContent = `Showing ${start}-${end} of ${pagination.totalRecords}`;
  historyPaginationCurrent.textContent = `Page ${pagination.page} of ${pagination.totalPages}`;

  historyPrevPageBtn.disabled = pagination.page <= 1;
  historyNextPageBtn.disabled = pagination.page >= pagination.totalPages;
}

historyPrevPageBtn.addEventListener('click', () => {
  if (historyCurrentPage > 1) {
    historyCurrentPage -= 1;
    loadHistory();
  }
});

historyNextPageBtn.addEventListener('click', () => {
  historyCurrentPage += 1;
  loadHistory();
});

function openHistoryModal(record) {
  historyCurrentInventoryId = record.id;
  historyCurrentPage = 1;
  historyTitle.textContent = `Movement History — ${record.product ? record.product.productName : ''}`;
  historyModalOverlay.hidden = false;
  loadHistory();
}

function closeHistoryModal() {
  historyModalOverlay.hidden = true;
  historyCurrentInventoryId = null;
}

historyClose.addEventListener('click', closeHistoryModal);
historyCloseFooter.addEventListener('click', closeHistoryModal);

historyModalOverlay.addEventListener('click', (event) => {
  if (event.target === historyModalOverlay) {
    closeHistoryModal();
  }
});

/* ============================================================
   INIT
   ============================================================ */

async function init() {
  renderCurrentDate();
  const isValid = await validateSession();
  if (!isValid) return;

  await applySidebarPermissions();

  const canAccess = await guardPageAccess('Inventory');
  if (!canAccess) return;

  try {
    await loadFilterOptions();
  } catch (error) {
    showToast(error.message || 'Unable to load filter options.', 'error');
  }

  loadRecords();
}

init();