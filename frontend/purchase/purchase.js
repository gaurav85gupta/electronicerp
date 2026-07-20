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
const supplierFilter = document.getElementById('supplier-filter');
const paymentModeFilter = document.getElementById('payment-mode-filter');
const statusFilter = document.getElementById('status-filter');
const dateFromFilter = document.getElementById('date-from-filter');
const dateToFilter = document.getElementById('date-to-filter');
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

const toastContainer = document.getElementById('toast-container');

// Purchase form modal
const formModalOverlay = document.getElementById('form-modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalClose = document.getElementById('modal-close');
const modalCancel = document.getElementById('modal-cancel');
const purchaseForm = document.getElementById('purchase-form');
const formError = document.getElementById('form-error');
const modalSaveDraft = document.getElementById('modal-save-draft');
const modalSaveDraftText = document.getElementById('modal-save-draft-text');
const modalFinalize = document.getElementById('modal-finalize');
const modalFinalizeText = document.getElementById('modal-finalize-text');

const fieldPurchaseNumber = document.getElementById('field-purchaseNumber');
const fieldPurchaseDate = document.getElementById('field-purchaseDate');
const fieldSupplier = document.getElementById('field-supplier');
const fieldPaymentMode = document.getElementById('field-paymentMode');
const fieldSupplierInvoiceNumber = document.getElementById('field-supplierInvoiceNumber');
const fieldSupplierInvoiceDate = document.getElementById('field-supplierInvoiceDate');
const fieldDueDate = document.getElementById('field-dueDate');
const fieldRemarks = document.getElementById('field-remarks');

const HEADER_FIELD_NAMES = ['purchaseDate', 'supplier', 'paymentMode', 'supplierInvoiceNumber', 'supplierInvoiceDate', 'dueDate', 'remarks'];

const addItemButton = document.getElementById('add-item-button');
const itemsTableBody = document.getElementById('items-table-body');
const itemsEmptyState = document.getElementById('items-empty-state');

const totalsSubtotal = document.getElementById('totals-subtotal');
const totalsDiscount = document.getElementById('totals-discount');
const totalsTax = document.getElementById('totals-tax');
const totalsGrand = document.getElementById('totals-grand');

// Item modal
const itemModalOverlay = document.getElementById('item-modal-overlay');
const itemModalTitle = document.getElementById('item-modal-title');
const itemModalClose = document.getElementById('item-modal-close');
const itemModalCancel = document.getElementById('item-modal-cancel');
const itemModalSubmit = document.getElementById('item-modal-submit');
const itemModalSubmitText = document.getElementById('item-modal-submit-text');
const itemFieldProduct = document.getElementById('item-field-product');
const itemFieldQuantity = document.getElementById('item-field-quantity');
const itemFieldPurchasePrice = document.getElementById('item-field-purchasePrice');
const itemFieldDiscount = document.getElementById('item-field-discount');
const itemFieldGst = document.getElementById('item-field-gstPercentage');
const itemIdentifiersGroup = document.getElementById('item-identifiers-group');
const itemIdentifiersLabel = document.getElementById('item-identifiers-label');
const itemIdentifiersList = document.getElementById('item-identifiers-list');
const itemLinePreview = document.getElementById('item-line-preview');
const itemFormError = document.getElementById('item-form-error');

// View modal
const viewModalOverlay = document.getElementById('view-modal-overlay');
const viewModalTitle = document.getElementById('view-modal-title');
const viewModalBody = document.getElementById('view-modal-body');
const viewModalClose = document.getElementById('view-modal-close');
const viewModalCloseFooter = document.getElementById('view-modal-close-footer');

// Cancel modal
const cancelModalOverlay = document.getElementById('cancel-modal-overlay');
const cancelModalMessage = document.getElementById('cancel-modal-message');
const cancelReasonInput = document.getElementById('cancel-reason-input');
const cancelErrorReason = document.getElementById('cancel-error-reason');
const cancelModalDismiss = document.getElementById('cancel-modal-dismiss');
const cancelModalConfirm = document.getElementById('cancel-modal-confirm');

/* ============================================================
   STATE
   ============================================================ */

let currentPage = 1;
let searchDebounceTimer = null;

let allActiveProducts = [];
let allActiveProductsById = new Map();

let currentEditId = null;
let purchaseItems = []; // in-memory items for the form being built
let editingItemIndex = null; // index into purchaseItems while item modal is open

let pendingCancelId = null;

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
   FORMATTING HELPERS
   ============================================================ */

function formatCurrency(value) {
  const numeric = Number(value) || 0;
  return `₹${numeric.toFixed(2)}`;
}

function formatDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' });
}

function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit'
  });
}

function toDateInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  return date.toISOString().slice(0, 10);
}

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

/* ============================================================
   MASTER / PRODUCT / SUPPLIER DATA
   ============================================================ */

async function fetchAllActive(endpoint) {
  const result = await apiRequest(`/api/master-data/${endpoint}?status=Active&limit=100`, { method: 'GET' });
  return result.data || [];
}

async function fetchAllActiveProducts() {
  const result = await apiRequest('/api/products?status=Active&limit=200', { method: 'GET' });
  return result.data || [];
}

function populateSelect(selectEl, options, { valueKey = 'id', labelFn, placeholder, keepFirst = false }) {
  const firstOption = keepFirst ? selectEl.querySelector('option') : null;
  selectEl.innerHTML = '';

  if (firstOption) {
    selectEl.appendChild(firstOption);
  } else if (placeholder) {
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

async function loadFilterAndFormData() {
  const [suppliers, paymentModes, products] = await Promise.all([
    fetchAllActive('suppliers'),
    fetchAllActive('payment-modes'),
    fetchAllActiveProducts()
  ]);

  allActiveProducts = products;
  allActiveProductsById = new Map(products.map((p) => [p.id, p]));

  populateSelect(supplierFilter, suppliers, {
    labelFn: (s) => s.supplierName,
    placeholder: 'All Suppliers'
  });
  populateSelect(paymentModeFilter, paymentModes, {
    labelFn: (p) => p.paymentModeName,
    placeholder: 'All Payment Modes'
  });
  populateSelect(fieldSupplier, suppliers, {
    labelFn: (s) => s.supplierName,
    placeholder: 'Select Supplier'
  });
  populateSelect(fieldPaymentMode, paymentModes, {
    labelFn: (p) => p.paymentModeName,
    placeholder: 'Not specified'
  });
}

/* ============================================================
   TABLE RENDERING (Purchase List)
   ============================================================ */

function statusBadgeClass(status) {
  if (status === 'Finalized') return 'status-finalized';
  if (status === 'Cancelled') return 'status-cancelled';
  return 'status-draft';
}

function renderTableRows(records) {
  tableBody.innerHTML = '';

  records.forEach((record) => {
    const tr = document.createElement('tr');

    const numberTd = document.createElement('td');
    numberTd.textContent = record.purchaseNumber;
    tr.appendChild(numberTd);

    const dateTd = document.createElement('td');
    dateTd.classList.add('cell-muted');
    dateTd.textContent = formatDate(record.purchaseDate);
    tr.appendChild(dateTd);

    const supplierTd = document.createElement('td');
    supplierTd.textContent = record.supplier ? record.supplier.supplierName : '—';
    tr.appendChild(supplierTd);

    const totalTd = document.createElement('td');
    totalTd.textContent = formatCurrency(record.grandTotal);
    tr.appendChild(totalTd);

    const statusTd = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `status-badge ${statusBadgeClass(record.status)}`;
    badge.textContent = record.status;
    statusTd.appendChild(badge);
    tr.appendChild(statusTd);

    const createdByTd = document.createElement('td');
    createdByTd.classList.add('cell-muted');
    createdByTd.textContent = record.createdBy ? record.createdBy.fullName : '—';
    tr.appendChild(createdByTd);

    const actionsTd = document.createElement('td');
    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'row-actions';

    const viewBtn = document.createElement('button');
    viewBtn.type = 'button';
    viewBtn.className = 'row-action-btn';
    viewBtn.textContent = 'View';
    viewBtn.addEventListener('click', () => openViewModal(record.id));
    actionsWrap.appendChild(viewBtn);

    if (record.status === 'Draft') {
      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'row-action-btn';
      editBtn.textContent = 'Edit';
      editBtn.addEventListener('click', () => openEditModal(record.id));
      actionsWrap.appendChild(editBtn);

      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'row-action-btn danger';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', () => openCancelModal(record));
      actionsWrap.appendChild(cancelBtn);
    }

    if (record.status === 'Finalized') {
      const cancelBtn = document.createElement('button');
      cancelBtn.type = 'button';
      cancelBtn.className = 'row-action-btn danger';
      cancelBtn.textContent = 'Cancel';
      cancelBtn.addEventListener('click', () => openCancelModal(record));
      actionsWrap.appendChild(cancelBtn);
    }

    actionsTd.appendChild(actionsWrap);
    tr.appendChild(actionsTd);

    tableBody.appendChild(tr);
  });
}

/* ============================================================
   LOAD RECORDS (List)
   ============================================================ */

async function loadRecords() {
  const params = new URLSearchParams();
  params.set('page', currentPage);
  params.set('limit', '10');

  if (searchInput.value.trim()) params.set('search', searchInput.value.trim());
  if (supplierFilter.value) params.set('supplier', supplierFilter.value);
  if (paymentModeFilter.value) params.set('paymentMode', paymentModeFilter.value);
  if (statusFilter.value) params.set('status', statusFilter.value);
  if (dateFromFilter.value) params.set('dateFrom', dateFromFilter.value);
  if (dateToFilter.value) params.set('dateTo', dateToFilter.value);

  loadingState.hidden = false;
  emptyState.hidden = true;
  dataTable.style.display = 'none';
  paginationBar.hidden = true;

  try {
    const result = await apiRequest(`/api/purchases?${params.toString()}`, { method: 'GET' });

    loadingState.hidden = true;

    if (!result.data || result.data.length === 0) {
      emptyStateText.textContent = 'No purchases found. Click "New Purchase" to create one.';
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
    emptyStateText.textContent = error.message || 'Unable to load purchases.';
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

[supplierFilter, paymentModeFilter, statusFilter, dateFromFilter, dateToFilter].forEach((el) => {
  el.addEventListener('change', () => {
    currentPage = 1;
    loadRecords();
  });
});

/* ============================================================
   ITEMS TABLE (within Purchase Form)
   ============================================================ */

function computeItemTotals(item) {
  const subtotal = round2(item.quantity * item.purchasePrice);
  const taxable = round2(subtotal - (item.discount || 0));
  const taxAmount = round2((taxable * (item.gstPercentage || 0)) / 100);
  const lineTotal = round2(taxable + taxAmount);
  return { subtotal, taxAmount, lineTotal };
}

function renderItemsTable() {
  itemsTableBody.innerHTML = '';
  itemsEmptyState.classList.toggle('visible', purchaseItems.length === 0);

  purchaseItems.forEach((item, index) => {
    const product = allActiveProductsById.get(item.product) || item.productSnapshot || {};
    const { subtotal, taxAmount, lineTotal } = computeItemTotals(item);

    const tr = document.createElement('tr');

    const nameTd = document.createElement('td');
    nameTd.textContent = product.productName || item.productName || '—';
    if (item.identifiers && item.identifiers.length > 0) {
      const badge = document.createElement('span');
      badge.className = 'item-identifiers-badge';
      badge.textContent = `${item.identifiers.length} ${item.identifiers[0].type}`;
      nameTd.appendChild(badge);
    }
    tr.appendChild(nameTd);

    const qtyTd = document.createElement('td');
    qtyTd.textContent = item.quantity;
    tr.appendChild(qtyTd);

    const priceTd = document.createElement('td');
    priceTd.textContent = formatCurrency(item.purchasePrice);
    tr.appendChild(priceTd);

    const discountTd = document.createElement('td');
    discountTd.textContent = formatCurrency(item.discount || 0);
    tr.appendChild(discountTd);

    const gstTd = document.createElement('td');
    gstTd.textContent = `${item.gstPercentage || 0}%`;
    tr.appendChild(gstTd);

    const taxTd = document.createElement('td');
    taxTd.textContent = formatCurrency(taxAmount);
    tr.appendChild(taxTd);

    const totalTd = document.createElement('td');
    totalTd.textContent = formatCurrency(lineTotal);
    tr.appendChild(totalTd);

    const actionsTd = document.createElement('td');
    const actionsWrap = document.createElement('div');
    actionsWrap.className = 'item-row-actions';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'row-action-btn';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', () => openItemModal(index));
    actionsWrap.appendChild(editBtn);

    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'row-action-btn danger';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      purchaseItems.splice(index, 1);
      renderItemsTable();
      renderTotals();
    });
    actionsWrap.appendChild(removeBtn);

    actionsTd.appendChild(actionsWrap);
    tr.appendChild(actionsTd);

    itemsTableBody.appendChild(tr);
  });
}

function renderTotals() {
  let subtotal = 0;
  let discount = 0;
  let tax = 0;
  let grand = 0;

  purchaseItems.forEach((item) => {
    const totals = computeItemTotals(item);
    subtotal += totals.subtotal;
    discount += item.discount || 0;
    tax += totals.taxAmount;
    grand += totals.lineTotal;
  });

  totalsSubtotal.textContent = formatCurrency(round2(subtotal));
  totalsDiscount.textContent = formatCurrency(round2(discount));
  totalsTax.textContent = formatCurrency(round2(tax));
  totalsGrand.textContent = formatCurrency(round2(grand));
}

/* ============================================================
   ITEM MODAL (Add / Edit line item)
   ============================================================ */

function clearItemFieldErrors() {
  ['product', 'quantity', 'purchasePrice', 'discount', 'gstPercentage', 'identifiers'].forEach((name) => {
    const el = document.getElementById(`item-error-${name}`);
    if (el) el.textContent = '';
  });
  itemFormError.textContent = '';
}

function eligibleProductsForItemModal() {
  const currentProductId = editingItemIndex !== null ? purchaseItems[editingItemIndex].product : null;
  const usedIds = new Set(purchaseItems.map((it, idx) => (idx === editingItemIndex ? null : it.product)).filter(Boolean));
  return allActiveProducts.filter((p) => !usedIds.has(p.id) || p.id === currentProductId);
}

function renderIdentifierInputs(product, quantity, existingIdentifiers) {
  const requiresIdentifiers = product && (product.usesSerialNumber || product.usesImeiNumber);
  itemIdentifiersGroup.hidden = !requiresIdentifiers;
  itemIdentifiersList.innerHTML = '';

  if (!requiresIdentifiers) return;

  const type = product.usesImeiNumber ? 'IMEI' : 'Serial Number';
  itemIdentifiersLabel.textContent = `${type}s (must match quantity, each unique)`;

  const count = Math.max(0, Math.min(Number(quantity) || 0, 500));

  for (let i = 0; i < count; i += 1) {
    const row = document.createElement('div');
    row.className = 'identifier-input-row';

    const label = document.createElement('span');
    label.textContent = `#${i + 1}`;
    row.appendChild(label);

    const input = document.createElement('input');
    input.type = 'text';
    input.maxLength = 100;
    input.dataset.identifierIndex = String(i);
    input.placeholder = `Enter ${type}`;
    if (existingIdentifiers && existingIdentifiers[i]) {
      input.value = existingIdentifiers[i].value;
    }
    row.appendChild(input);

    itemIdentifiersList.appendChild(row);
  }
}

function collectIdentifierValues() {
  return Array.from(itemIdentifiersList.querySelectorAll('input')).map((input) => input.value.trim());
}

function updateItemLinePreview() {
  const quantity = Number(itemFieldQuantity.value) || 0;
  const price = Number(itemFieldPurchasePrice.value) || 0;
  const discount = Number(itemFieldDiscount.value) || 0;
  const gst = Number(itemFieldGst.value) || 0;

  const { subtotal, taxAmount, lineTotal } = computeItemTotals({ quantity, purchasePrice: price, discount, gstPercentage: gst });

  itemLinePreview.textContent = `Subtotal: ${formatCurrency(subtotal)}  ·  Tax: ${formatCurrency(taxAmount)}  ·  Line Total: ${formatCurrency(lineTotal)}`;
}

function refreshIdentifierFieldsForCurrentSelection() {
  const product = allActiveProductsById.get(itemFieldProduct.value);
  const quantity = Number(itemFieldQuantity.value) || 0;
  const preserved = editingItemIndex !== null && purchaseItems[editingItemIndex].product === itemFieldProduct.value
    ? purchaseItems[editingItemIndex].identifiers
    : null;
  renderIdentifierInputs(product, quantity, preserved);
  updateItemLinePreview();
}

itemFieldProduct.addEventListener('change', () => {
  const product = allActiveProductsById.get(itemFieldProduct.value);
  if (product) {
    if (!itemFieldPurchasePrice.value) itemFieldPurchasePrice.value = product.purchasePrice || 0;
    if (!itemFieldGst.value && product.gst) itemFieldGst.value = product.gst.gstPercentage ?? 0;
  }
  refreshIdentifierFieldsForCurrentSelection();
});

itemFieldQuantity.addEventListener('input', refreshIdentifierFieldsForCurrentSelection);
itemFieldPurchasePrice.addEventListener('input', updateItemLinePreview);
itemFieldDiscount.addEventListener('input', updateItemLinePreview);
itemFieldGst.addEventListener('input', updateItemLinePreview);

function openItemModal(indexToEdit) {
  editingItemIndex = typeof indexToEdit === 'number' ? indexToEdit : null;
  clearItemFieldErrors();

  const eligible = eligibleProductsForItemModal();
  populateSelect(itemFieldProduct, eligible, {
    labelFn: (p) => `${p.productName} (${p.sku})`,
    placeholder: eligible.length > 0 ? 'Select Product' : 'No eligible products'
  });

  if (editingItemIndex !== null) {
    const item = purchaseItems[editingItemIndex];
    itemModalTitle.textContent = 'Edit Product';
    itemModalSubmitText.textContent = 'Update Item';
    itemFieldProduct.value = item.product;
    itemFieldQuantity.value = item.quantity;
    itemFieldPurchasePrice.value = item.purchasePrice;
    itemFieldDiscount.value = item.discount || 0;
    itemFieldGst.value = item.gstPercentage || 0;
  } else {
    itemModalTitle.textContent = 'Add Product';
    itemModalSubmitText.textContent = 'Add Item';
    itemFieldProduct.value = '';
    itemFieldQuantity.value = '1';
    itemFieldPurchasePrice.value = '';
    itemFieldDiscount.value = '0';
    itemFieldGst.value = '0';
  }

  refreshIdentifierFieldsForCurrentSelection();
  itemModalOverlay.hidden = false;
}

function closeItemModal() {
  itemModalOverlay.hidden = true;
  editingItemIndex = null;
  clearItemFieldErrors();
}

addItemButton.addEventListener('click', () => openItemModal(null));
itemModalClose.addEventListener('click', closeItemModal);
itemModalCancel.addEventListener('click', closeItemModal);

itemModalOverlay.addEventListener('click', (event) => {
  if (event.target === itemModalOverlay) closeItemModal();
});

function validateItemModalInput() {
  clearItemFieldErrors();
  let hasError = false;

  const productId = itemFieldProduct.value;
  const product = allActiveProductsById.get(productId);

  if (!productId || !product) {
    document.getElementById('item-error-product').textContent = 'Please select a product';
    hasError = true;
  }

  const quantity = Number(itemFieldQuantity.value);
  if (!Number.isInteger(quantity) || quantity <= 0) {
    document.getElementById('item-error-quantity').textContent = 'Quantity must be a whole number greater than zero';
    hasError = true;
  }

  const price = Number(itemFieldPurchasePrice.value);
  if (itemFieldPurchasePrice.value === '' || Number.isNaN(price) || price < 0) {
    document.getElementById('item-error-purchasePrice').textContent = 'Purchase price is required and cannot be negative';
    hasError = true;
  }

  const discount = itemFieldDiscount.value === '' ? 0 : Number(itemFieldDiscount.value);
  if (Number.isNaN(discount) || discount < 0) {
    document.getElementById('item-error-discount').textContent = 'Discount cannot be negative';
    hasError = true;
  }

  const gst = itemFieldGst.value === '' ? 0 : Number(itemFieldGst.value);
  if (Number.isNaN(gst) || gst < 0 || gst > 100) {
    document.getElementById('item-error-gstPercentage').textContent = 'GST must be between 0 and 100';
    hasError = true;
  }

  let identifiers = [];
  if (product && !hasError && (product.usesSerialNumber || product.usesImeiNumber)) {
    const type = product.usesImeiNumber ? 'IMEI' : 'Serial Number';
    const values = collectIdentifierValues();

    if (values.length !== quantity) {
      document.getElementById('item-error-identifiers').textContent = `${type} count must equal quantity`;
      hasError = true;
    } else {
      const seen = new Set();
      let identifierError = null;

      values.forEach((value, idx) => {
        if (!value) {
          identifierError = `${type} #${idx + 1} is required`;
          return;
        }
        const key = value.toLowerCase();
        if (seen.has(key)) {
          identifierError = `Duplicate ${type}: "${value}"`;
          return;
        }
        seen.add(key);
      });

      if (identifierError) {
        document.getElementById('item-error-identifiers').textContent = identifierError;
        hasError = true;
      } else {
        identifiers = values.map((value) => ({ type, value }));
      }
    }
  }

  // Check for duplicate product across other lines
  if (!hasError) {
    const duplicateIndex = purchaseItems.findIndex((it, idx) => it.product === productId && idx !== editingItemIndex);
    if (duplicateIndex !== -1) {
      document.getElementById('item-error-product').textContent = 'This product is already in the purchase. Edit that line instead';
      hasError = true;
    }
  }

  if (hasError) return null;

  return {
    product: productId,
    productName: product.productName,
    quantity,
    purchasePrice: price,
    discount,
    gstPercentage: gst,
    identifiers
  };
}

itemModalSubmit.addEventListener('click', () => {
  const itemData = validateItemModalInput();
  if (!itemData) return;

  if (editingItemIndex !== null) {
    purchaseItems[editingItemIndex] = itemData;
  } else {
    purchaseItems.push(itemData);
  }

  renderItemsTable();
  renderTotals();
  closeItemModal();
});

/* ============================================================
   PURCHASE FORM MODAL (Create / Edit Draft)
   ============================================================ */

function clearHeaderFieldErrors() {
  HEADER_FIELD_NAMES.forEach((name) => {
    const el = document.getElementById(`error-${name}`);
    if (el) el.textContent = '';
  });
  formError.textContent = '';
}

function resetPurchaseForm() {
  purchaseForm.reset();
  clearHeaderFieldErrors();
  fieldPurchaseNumber.value = '';
  fieldPurchaseDate.value = new Date().toISOString().slice(0, 10);
  purchaseItems = [];
  renderItemsTable();
  renderTotals();
}

function openAddModal() {
  currentEditId = null;
  modalTitle.textContent = 'New Purchase';
  resetPurchaseForm();
  formModalOverlay.hidden = false;
}

async function openEditModal(id) {
  try {
    const result = await apiRequest(`/api/purchases/${id}`, { method: 'GET' });
    const record = result.data;

    currentEditId = record.id;
    modalTitle.textContent = `Edit Draft — ${record.purchaseNumber}`;
    clearHeaderFieldErrors();

    fieldPurchaseNumber.value = record.purchaseNumber;
    fieldPurchaseDate.value = toDateInputValue(record.purchaseDate);
    fieldSupplier.value = record.supplier ? record.supplier.id : '';
    fieldPaymentMode.value = record.paymentMode ? record.paymentMode.id : '';
    fieldSupplierInvoiceNumber.value = record.supplierInvoiceNumber || '';
    fieldSupplierInvoiceDate.value = toDateInputValue(record.supplierInvoiceDate);
    fieldDueDate.value = toDateInputValue(record.dueDate);
    fieldRemarks.value = record.remarks || '';

    purchaseItems = (record.items || []).map((item) => ({
      product: item.product ? item.product.id : '',
      productName: item.product ? item.product.productName : '',
      quantity: item.quantity,
      purchasePrice: item.purchasePrice,
      discount: item.discount,
      gstPercentage: item.gstPercentage,
      identifiers: item.identifiers || []
    }));

    renderItemsTable();
    renderTotals();
    formModalOverlay.hidden = false;
  } catch (error) {
    showToast(error.message || 'Unable to load purchase.', 'error');
  }
}

function closeFormModal() {
  formModalOverlay.hidden = true;
  resetPurchaseForm();
  currentEditId = null;
}

addButton.addEventListener('click', openAddModal);
modalClose.addEventListener('click', closeFormModal);
modalCancel.addEventListener('click', closeFormModal);

formModalOverlay.addEventListener('click', (event) => {
  if (event.target === formModalOverlay) closeFormModal();
});

function collectHeaderPayload() {
  return {
    purchaseDate: fieldPurchaseDate.value,
    supplier: fieldSupplier.value,
    paymentMode: fieldPaymentMode.value || '',
    supplierInvoiceNumber: fieldSupplierInvoiceNumber.value,
    supplierInvoiceDate: fieldSupplierInvoiceDate.value,
    dueDate: fieldDueDate.value,
    remarks: fieldRemarks.value
  };
}

function collectItemsPayload() {
  return purchaseItems.map((item) => ({
    product: item.product,
    quantity: item.quantity,
    purchasePrice: item.purchasePrice,
    discount: item.discount,
    gstPercentage: item.gstPercentage,
    identifiers: item.identifiers.map((identifier) => identifier.value)
  }));
}

async function submitPurchase(action) {
  clearHeaderFieldErrors();

  if (action === 'finalize' && purchaseItems.length === 0) {
    formError.textContent = 'Add at least one item before finalizing';
    return;
  }

  const payload = {
    ...collectHeaderPayload(),
    items: collectItemsPayload(),
    action
  };

  const busyButton = action === 'finalize' ? modalFinalize : modalSaveDraft;
  const busyText = action === 'finalize' ? modalFinalizeText : modalSaveDraftText;
  const originalText = busyText.textContent;

  modalSaveDraft.disabled = true;
  modalFinalize.disabled = true;
  busyText.textContent = action === 'finalize' ? 'Finalizing...' : 'Saving...';

  try {
    if (currentEditId) {
      await apiRequest(`/api/purchases/${currentEditId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    } else {
      await apiRequest('/api/purchases', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    }

    showToast(action === 'finalize' ? 'Purchase finalized. Inventory updated' : 'Purchase saved as draft', 'success');
    closeFormModal();
    loadRecords();
  } catch (error) {
    formError.textContent = error.message || 'Unable to save the purchase.';
  } finally {
    modalSaveDraft.disabled = false;
    modalFinalize.disabled = false;
    busyText.textContent = originalText;
  }
}

modalSaveDraft.addEventListener('click', () => submitPurchase('draft'));
modalFinalize.addEventListener('click', () => submitPurchase('finalize'));

/* ============================================================
   VIEW PURCHASE MODAL
   ============================================================ */

function renderViewField(label, value) {
  const wrap = document.createElement('div');
  wrap.className = 'view-field';
  const labelEl = document.createElement('span');
  labelEl.className = 'view-field-label';
  labelEl.textContent = label;
  const valueEl = document.createElement('span');
  valueEl.className = 'view-field-value';
  valueEl.textContent = value || '—';
  wrap.appendChild(labelEl);
  wrap.appendChild(valueEl);
  return wrap;
}

function renderViewModalContent(record) {
  viewModalBody.innerHTML = '';
  viewModalTitle.textContent = `Purchase — ${record.purchaseNumber}`;

  // Header section
  const headerSection = document.createElement('div');
  headerSection.className = 'view-section';

  const statusBadge = document.createElement('span');
  statusBadge.className = `status-badge ${statusBadgeClass(record.status)}`;
  statusBadge.textContent = record.status;

  const headerGrid = document.createElement('div');
  headerGrid.className = 'view-grid';
  headerGrid.appendChild(renderViewField('Purchase Number', record.purchaseNumber));
  headerGrid.appendChild(renderViewField('Purchase Date', formatDate(record.purchaseDate)));
  headerGrid.appendChild(renderViewField('Supplier', record.supplier ? record.supplier.supplierName : '—'));
  headerGrid.appendChild(renderViewField('Payment Mode', record.paymentMode ? record.paymentMode.paymentModeName : '—'));
  headerGrid.appendChild(renderViewField('Supplier Invoice Number', record.supplierInvoiceNumber));
  headerGrid.appendChild(renderViewField('Supplier Invoice Date', formatDate(record.supplierInvoiceDate)));
  headerGrid.appendChild(renderViewField('Due Date', formatDate(record.dueDate)));
  headerGrid.appendChild(renderViewField('Created By', record.createdBy ? record.createdBy.fullName : '—'));

  headerSection.appendChild(statusBadge);
  headerSection.appendChild(headerGrid);
  if (record.remarks) {
    headerSection.appendChild(renderViewField('Remarks', record.remarks));
  }
  viewModalBody.appendChild(headerSection);

  // Items section
  const itemsSection = document.createElement('div');
  itemsSection.className = 'view-section';
  const itemsTitle = document.createElement('span');
  itemsTitle.className = 'form-section-title';
  itemsTitle.textContent = 'Items';
  itemsSection.appendChild(itemsTitle);

  const table = document.createElement('table');
  table.className = 'data-table items-table';
  table.innerHTML = `
    <thead>
      <tr>
        <th>Product</th><th>Qty</th><th>Price</th><th>Discount</th><th>GST %</th><th>Tax</th><th>Line Total</th>
      </tr>
    </thead>
  `;
  const tbody = document.createElement('tbody');

  (record.items || []).forEach((item) => {
    const tr = document.createElement('tr');
    const product = item.product || {};

    const nameTd = document.createElement('td');
    nameTd.textContent = product.productName || '—';
    if (item.identifiers && item.identifiers.length > 0) {
      const badge = document.createElement('span');
      badge.className = 'item-identifiers-badge';
      badge.textContent = `${item.identifiers.length} ${item.identifiers[0].type}`;
      nameTd.appendChild(badge);
    }
    tr.appendChild(nameTd);

    [item.quantity, formatCurrency(item.purchasePrice), formatCurrency(item.discount), `${item.gstPercentage}%`, formatCurrency(item.taxAmount), formatCurrency(item.lineTotal)]
      .forEach((value) => {
        const td = document.createElement('td');
        td.textContent = value;
        tr.appendChild(td);
      });

    tbody.appendChild(tr);

    if (item.identifiers && item.identifiers.length > 0) {
      const idTr = document.createElement('tr');
      const idTd = document.createElement('td');
      idTd.colSpan = 7;
      idTd.className = 'cell-muted';
      idTd.style.whiteSpace = 'normal';
      idTd.textContent = `${item.identifiers[0].type}s: ${item.identifiers.map((i) => i.value).join(', ')}`;
      idTr.appendChild(idTd);
      tbody.appendChild(idTr);
    }
  });

  table.appendChild(tbody);
  itemsSection.appendChild(table);
  viewModalBody.appendChild(itemsSection);

  // Totals section
  const totalsSection = document.createElement('div');
  totalsSection.className = 'view-section';
  const totalsBox = document.createElement('div');
  totalsBox.className = 'totals-box';
  totalsBox.innerHTML = `
    <div class="totals-line"><span>Subtotal</span><span>${formatCurrency(record.subtotalAmount)}</span></div>
    <div class="totals-line"><span>Discount</span><span>${formatCurrency(record.discountAmount)}</span></div>
    <div class="totals-line"><span>Tax</span><span>${formatCurrency(record.taxAmount)}</span></div>
    <div class="totals-line totals-grand"><span>Grand Total</span><span>${formatCurrency(record.grandTotal)}</span></div>
  `;
  totalsSection.appendChild(totalsBox);
  viewModalBody.appendChild(totalsSection);

  // Inventory update summary (Finalized only)
  if (record.status === 'Finalized') {
    const invSection = document.createElement('div');
    invSection.className = 'view-section';
    const invTitle = document.createElement('span');
    invTitle.className = 'form-section-title';
    invTitle.textContent = 'Inventory Update Summary';
    invSection.appendChild(invTitle);

    const invGrid = document.createElement('div');
    invGrid.className = 'view-grid';
    invGrid.appendChild(renderViewField('Finalized At', formatDateTime(record.finalizedAt)));
    invGrid.appendChild(renderViewField('Items Added to Stock', String((record.items || []).length)));
    invSection.appendChild(invGrid);
    viewModalBody.appendChild(invSection);
  }

  if (record.status === 'Cancelled') {
    const cancelSection = document.createElement('div');
    cancelSection.className = 'view-section';
    const cancelGrid = document.createElement('div');
    cancelGrid.className = 'view-grid';
    cancelGrid.appendChild(renderViewField('Cancelled At', formatDateTime(record.cancelledAt)));
    cancelGrid.appendChild(renderViewField('Cancellation Reason', record.cancellationReason));
    cancelSection.appendChild(cancelGrid);
    viewModalBody.appendChild(cancelSection);
  }
}

async function openViewModal(id) {
  try {
    const result = await apiRequest(`/api/purchases/${id}`, { method: 'GET' });
    renderViewModalContent(result.data);
    viewModalOverlay.hidden = false;
  } catch (error) {
    showToast(error.message || 'Unable to load purchase details.', 'error');
  }
}

function closeViewModal() {
  viewModalOverlay.hidden = true;
}

viewModalClose.addEventListener('click', closeViewModal);
viewModalCloseFooter.addEventListener('click', closeViewModal);
viewModalOverlay.addEventListener('click', (event) => {
  if (event.target === viewModalOverlay) closeViewModal();
});

/* ============================================================
   CANCEL PURCHASE MODAL
   ============================================================ */

function openCancelModal(record) {
  pendingCancelId = record.id;
  cancelReasonInput.value = '';
  cancelErrorReason.textContent = '';

  cancelModalMessage.textContent = record.status === 'Finalized'
    ? `Cancelling "${record.purchaseNumber}" will reverse the inventory increases made when it was finalized. This cannot be undone.`
    : `Are you sure you want to cancel draft purchase "${record.purchaseNumber}"?`;

  cancelModalOverlay.hidden = false;
}

function closeCancelModal() {
  cancelModalOverlay.hidden = true;
  pendingCancelId = null;
}

cancelModalDismiss.addEventListener('click', closeCancelModal);
cancelModalOverlay.addEventListener('click', (event) => {
  if (event.target === cancelModalOverlay) closeCancelModal();
});

cancelModalConfirm.addEventListener('click', async () => {
  cancelErrorReason.textContent = '';

  const reason = cancelReasonInput.value.trim();
  if (!reason) {
    cancelErrorReason.textContent = 'Cancellation reason is required';
    return;
  }

  cancelModalConfirm.disabled = true;

  try {
    await apiRequest(`/api/purchases/${pendingCancelId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ cancellationReason: reason })
    });
    showToast('Purchase cancelled successfully', 'success');
    closeCancelModal();
    loadRecords();
  } catch (error) {
    cancelErrorReason.textContent = error.message || 'Unable to cancel purchase.';
  } finally {
    cancelModalConfirm.disabled = false;
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

  const canAccess = await guardPageAccess('Purchase');
  if (!canAccess) return;

  try {
    await loadFilterAndFormData();
  } catch (error) {
    showToast(error.message || 'Unable to load suppliers and products.', 'error');
  }

  loadRecords();
}

init();