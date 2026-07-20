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

// Bill form modal (POS)
const formModalOverlay = document.getElementById('form-modal-overlay');
const modalTitle = document.getElementById('modal-title');
const modalClose = document.getElementById('modal-close');
const modalCancel = document.getElementById('modal-cancel');
const billForm = document.getElementById('bill-form');
const formError = document.getElementById('form-error');
const modalSaveDraft = document.getElementById('modal-save-draft');
const modalSaveDraftText = document.getElementById('modal-save-draft-text');
const modalFinalize = document.getElementById('modal-finalize');
const modalFinalizeText = document.getElementById('modal-finalize-text');
const billNumberPreview = document.getElementById('bill-number-preview');

const fieldCustomer = document.getElementById('field-customer');
const fieldCustomerName = document.getElementById('field-customerName');
const fieldCustomerMobile = document.getElementById('field-customerMobile');
const fieldPaymentMode = document.getElementById('field-paymentMode');
const fieldBillDate = document.getElementById('field-billDate');
const fieldRemarks = document.getElementById('field-remarks');

const customerSearchInput = document.getElementById('customer-search-input');
const customerSearchResults = document.getElementById('customer-search-results');
const selectedCustomerChip = document.getElementById('selected-customer-chip');
const selectedCustomerName = document.getElementById('selected-customer-name');
const selectedCustomerMeta = document.getElementById('selected-customer-meta');
const selectedCustomerClear = document.getElementById('selected-customer-clear');

attachMobileInputGuard(fieldCustomerMobile);

const HEADER_FIELD_NAMES = ['customer', 'customerName', 'customerMobile', 'paymentMode', 'billDate', 'remarks'];

const productSearchInput = document.getElementById('product-search-input');
const productSearchResults = document.getElementById('product-search-results');

const itemsTableBody = document.getElementById('items-table-body');
const itemsEmptyState = document.getElementById('items-empty-state');

const totalsSubtotal = document.getElementById('totals-subtotal');
const totalsDiscount = document.getElementById('totals-discount');
const totalsTax = document.getElementById('totals-tax');
const totalsGrand = document.getElementById('totals-grand');

// Identifier picker modal
const identifierModalOverlay = document.getElementById('identifier-modal-overlay');
const identifierModalTitle = document.getElementById('identifier-modal-title');
const identifierModalClose = document.getElementById('identifier-modal-close');
const identifierModalCancel = document.getElementById('identifier-modal-cancel');
const identifierModalConfirm = document.getElementById('identifier-modal-confirm');
const identifierPickerCount = document.getElementById('identifier-picker-count');
const identifierPickerList = document.getElementById('identifier-picker-list');
const identifierPickerError = document.getElementById('identifier-picker-error');

// View modal
const viewModalOverlay = document.getElementById('view-modal-overlay');
const viewModalTitle = document.getElementById('view-modal-title');
const viewModalBody = document.getElementById('view-modal-body');
const viewModalClose = document.getElementById('view-modal-close');
const viewModalCloseFooter = document.getElementById('view-modal-close-footer');
const viewModalPrint = document.getElementById('view-modal-print');
const viewModalPreview = document.getElementById('view-modal-preview');

// Live Invoice Preview modal (Phase 20.12)
const previewModalOverlay = document.getElementById('preview-modal-overlay');
const previewModalClose = document.getElementById('preview-modal-close');
const previewModalCloseFooter = document.getElementById('preview-modal-close-footer');
const previewPrintButton = document.getElementById('preview-print-button');
const previewTemplateSelect = document.getElementById('preview-template-select');
const previewLoadingState = document.getElementById('preview-loading-state');
const previewErrorState = document.getElementById('preview-error-state');
const previewErrorText = document.getElementById('preview-error-text');
const previewCanvas = document.getElementById('preview-canvas');
const previewFrame = document.getElementById('preview-frame');
const previewZoomOutBtn = document.getElementById('preview-zoom-out');
const previewZoomInBtn = document.getElementById('preview-zoom-in');
const previewZoomFitBtn = document.getElementById('preview-zoom-fit');
const previewZoomActualBtn = document.getElementById('preview-zoom-actual');
const previewZoomValue = document.getElementById('preview-zoom-value');
const previewPageNav = document.getElementById('preview-page-nav');
const previewPrevPageBtn = document.getElementById('preview-prev-page');
const previewNextPageBtn = document.getElementById('preview-next-page');
const previewPageIndicator = document.getElementById('preview-page-indicator');

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
let productSearchDebounceTimer = null;
let customerSearchDebounceTimer = null;
let lastLookedUpMobile = ''; // last 10-digit number we already queried, to avoid duplicate lookups
let mobileLookupInFlight = null; // guards against overlapping lookups if typing outpaces the network

let allActiveProducts = [];
let allActiveProductsById = new Map();

let currentEditId = null;
let billItems = []; // in-memory line items for the bill being built
let pendingCancelId = null;

// Identifier picker state
let identifierPickerContext = null; // { itemIndex, product, quantity }

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
   MASTER / PRODUCT DATA
   ============================================================ */

async function fetchAllActive(endpoint) {
  const result = await apiRequest(`/api/master-data/${endpoint}?status=Active&limit=100`, { method: 'GET' });
  return result.data || [];
}

async function fetchAllActiveProducts() {
  const result = await apiRequest('/api/billing/sellable-products?limit=200', { method: 'GET' });
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
  const [paymentModes, products] = await Promise.all([
    fetchAllActive('payment-modes'),
    fetchAllActiveProducts()
  ]);

  allActiveProducts = products;
  allActiveProductsById = new Map(products.map((p) => [p.id, p]));

  populateSelect(paymentModeFilter, paymentModes, {
    labelFn: (p) => p.paymentModeName,
    placeholder: 'All Payment Modes'
  });
  populateSelect(fieldPaymentMode, paymentModes, {
    labelFn: (p) => p.paymentModeName,
    placeholder: 'Not specified'
  });
}

/* ============================================================
   TABLE RENDERING (Bill List)
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
    numberTd.textContent = record.billNumber;
    tr.appendChild(numberTd);

    const dateTd = document.createElement('td');
    dateTd.classList.add('cell-muted');
    dateTd.textContent = formatDate(record.billDate);
    tr.appendChild(dateTd);

    const customerTd = document.createElement('td');
    if (record.customerName || record.customerMobile) {
      customerTd.textContent = [record.customerName, record.customerMobile].filter(Boolean).join(' · ');
    } else {
      customerTd.textContent = '—';
      customerTd.classList.add('cell-muted');
    }
    tr.appendChild(customerTd);

    const totalTd = document.createElement('td');
    totalTd.textContent = formatCurrency(record.grandTotal);
    tr.appendChild(totalTd);

    const paymentTd = document.createElement('td');
    paymentTd.classList.add('cell-muted');
    paymentTd.textContent = record.paymentMode ? record.paymentMode.paymentModeName : '—';
    tr.appendChild(paymentTd);

    const statusTd = document.createElement('td');
    const badge = document.createElement('span');
    badge.className = `status-badge ${statusBadgeClass(record.status)}`;
    badge.textContent = record.status;
    statusTd.appendChild(badge);
    tr.appendChild(statusTd);

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
      const previewBtn = document.createElement('button');
      previewBtn.type = 'button';
      previewBtn.className = 'row-action-btn';
      previewBtn.textContent = 'Preview';
      previewBtn.addEventListener('click', () => openPreviewModal(record.id));
      actionsWrap.appendChild(previewBtn);

      const printBtn = document.createElement('button');
      printBtn.type = 'button';
      printBtn.className = 'row-action-btn';
      printBtn.textContent = 'Print';
      printBtn.addEventListener('click', () => handlePrintBill(record.id));
      actionsWrap.appendChild(printBtn);

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
  if (paymentModeFilter.value) params.set('paymentMode', paymentModeFilter.value);
  if (statusFilter.value) params.set('status', statusFilter.value);
  if (dateFromFilter.value) params.set('dateFrom', dateFromFilter.value);
  if (dateToFilter.value) params.set('dateTo', dateToFilter.value);

  loadingState.hidden = false;
  emptyState.hidden = true;
  dataTable.style.display = 'none';
  paginationBar.hidden = true;

  try {
    const result = await apiRequest(`/api/billing?${params.toString()}`, { method: 'GET' });

    loadingState.hidden = true;

    if (!result.data || result.data.length === 0) {
      emptyStateText.textContent = 'No bills found. Click "New Bill" to create one.';
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
    emptyStateText.textContent = error.message || 'Unable to load bills.';
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

[paymentModeFilter, statusFilter, dateFromFilter, dateToFilter].forEach((el) => {
  el.addEventListener('change', () => {
    currentPage = 1;
    loadRecords();
  });
});

/* ============================================================
   PRODUCT SEARCH (Add to Billing Grid)
   ============================================================ */

function matchesProductQuery(product, query) {
  const q = query.toLowerCase();
  return (
    product.productName.toLowerCase().includes(q) ||
    (product.sku || '').toLowerCase().includes(q) ||
    (product.barcode || '').toLowerCase().includes(q)
  );
}

function renderProductSearchResults(query) {
  productSearchResults.innerHTML = '';

  if (!query) {
    productSearchResults.hidden = true;
    return;
  }

  const alreadyAddedIds = new Set(billItems.map((item) => item.product));
  const matches = allActiveProducts
    .filter((product) => !alreadyAddedIds.has(product.id))
    .filter((product) => matchesProductQuery(product, query))
    .slice(0, 20);

  if (matches.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'product-result-empty';
    empty.textContent = 'No matching active products found.';
    productSearchResults.appendChild(empty);
    productSearchResults.hidden = false;
    return;
  }

  matches.forEach((product) => {
    const row = document.createElement('div');
    row.className = 'product-result-item';

    const info = document.createElement('div');
    const name = document.createElement('div');
    name.className = 'product-result-name';
    name.textContent = product.productName;
    const meta = document.createElement('div');
    meta.className = 'product-result-meta';
    meta.textContent = `${product.sku}${product.brand ? ' · ' + product.brand.brandName : ''}`;
    info.appendChild(name);
    info.appendChild(meta);

    const price = document.createElement('span');
    price.className = 'product-result-price';
    price.textContent = formatCurrency(product.sellingPrice);

    row.appendChild(info);
    row.appendChild(price);

    row.addEventListener('click', () => {
      addProductToBill(product);
      productSearchInput.value = '';
      productSearchResults.hidden = true;
      productSearchResults.innerHTML = '';
    });

    productSearchResults.appendChild(row);
  });

  productSearchResults.hidden = false;
}

productSearchInput.addEventListener('input', () => {
  clearTimeout(productSearchDebounceTimer);
  const query = productSearchInput.value.trim();
  productSearchDebounceTimer = setTimeout(() => {
    renderProductSearchResults(query);
  }, 150);
});

productSearchInput.addEventListener('focus', () => {
  if (productSearchInput.value.trim()) {
    renderProductSearchResults(productSearchInput.value.trim());
  }
});

document.addEventListener('click', (event) => {
  if (!productSearchResults.contains(event.target) && event.target !== productSearchInput) {
    productSearchResults.hidden = true;
  }
});

/* ============================================================
   CUSTOMER SEARCH (Link Customer to Bill)
   ============================================================ */

function renderCustomerSearchResults(results) {
  customerSearchResults.innerHTML = '';

  if (results.length === 0) {
    const empty = document.createElement('div');
    empty.className = 'customer-result-empty';
    empty.textContent = 'No customer found. You can continue — a new customer record will be created automatically when the bill is finalized.';
    customerSearchResults.appendChild(empty);
    customerSearchResults.hidden = false;
    return;
  }

  results.forEach((customer) => {
    const row = document.createElement('div');
    row.className = 'customer-result-item';

    const name = document.createElement('div');
    name.className = 'customer-result-name';
    name.textContent = customer.customerName;

    const meta = document.createElement('div');
    meta.className = 'customer-result-meta';
    meta.textContent = `${customer.customerCode} · ${customer.mobileNumber}`;

    row.appendChild(name);
    row.appendChild(meta);

    row.addEventListener('click', () => {
      selectCustomer(customer);
      lastLookedUpMobile = customer.mobileNumber || '';
      customerSearchInput.value = '';
      customerSearchResults.hidden = true;
      customerSearchResults.innerHTML = '';
    });

    customerSearchResults.appendChild(row);
  });

  customerSearchResults.hidden = false;
}

function renderCustomerSearchError(message) {
  customerSearchResults.innerHTML = '';
  const errorRow = document.createElement('div');
  errorRow.className = 'customer-result-empty';
  errorRow.textContent = message || 'Unable to search customers right now. Please try again.';
  customerSearchResults.appendChild(errorRow);
  customerSearchResults.hidden = false;
}

async function runCustomerSearch(query) {
  if (!query) {
    customerSearchResults.hidden = true;
    customerSearchResults.innerHTML = '';
    return;
  }

  try {
    const result = await apiRequest(`/api/customers?status=Active&limit=15&search=${encodeURIComponent(query)}`, { method: 'GET' });
    // "No matching customer" is a normal, expected outcome — not an error.
    // Auto Customer Creation on finalize continues to work as before,
    // since fieldCustomer simply stays unlinked when nothing is selected.
    renderCustomerSearchResults(result.data || []);
  } catch (error) {
    // A real failure (network/server/session) — surface it distinctly
    // from "no results" instead of silently hiding the dropdown, so
    // the user knows the search itself didn't run rather than assuming
    // no customers matched.
    renderCustomerSearchError(error.message);
  }
}

customerSearchInput.addEventListener('input', () => {
  clearTimeout(customerSearchDebounceTimer);
  const query = customerSearchInput.value.trim();
  customerSearchDebounceTimer = setTimeout(() => {
    runCustomerSearch(query);
  }, 300);
});

document.addEventListener('click', (event) => {
  if (!customerSearchResults.contains(event.target) && event.target !== customerSearchInput) {
    customerSearchResults.hidden = true;
  }
});

function selectCustomer(customer) {
  fieldCustomer.value = customer.id;
  fieldCustomerName.value = customer.customerName;
  fieldCustomerMobile.value = customer.mobileNumber;
  fieldCustomerName.readOnly = true;
  fieldCustomerMobile.readOnly = true;

  selectedCustomerName.textContent = customer.customerName;
  selectedCustomerMeta.textContent = `${customer.customerCode} · ${customer.mobileNumber}`;
  selectedCustomerChip.hidden = false;
}

function clearSelectedCustomer() {
  fieldCustomer.value = '';
  fieldCustomerName.readOnly = false;
  fieldCustomerMobile.readOnly = false;
  selectedCustomerChip.hidden = true;
}

selectedCustomerClear.addEventListener('click', () => {
  clearSelectedCustomer();
  // Manually clearing also resets lookup tracking so re-typing the same
  // number (after Clear) triggers a fresh lookup instead of being skipped
  // as a "duplicate" of the last query.
  lastLookedUpMobile = '';
});

/* ============================================================
   CUSTOMER AUTO LOOKUP BY MOBILE NUMBER (Billing speed-up)
   ============================================================
   Fires only once exactly 10 digits are present in the Customer
   Mobile field. Does not touch the existing manual "Find Customer"
   search box/flow above — this is an additive, independent path
   that funnels into the same selectCustomer()/clearSelectedCustomer()
   used everywhere else, so linking, the "selected customer" chip,
   and Bill Finalization's Auto Customer Creation are all unchanged.
   ============================================================ */

async function lookupCustomerByMobile(mobile) {
  // Ignore duplicate/overlapping lookups for the same completed number.
  if (mobile === lastLookedUpMobile) return;
  lastLookedUpMobile = mobile;

  const requestToken = Symbol('mobile-lookup');
  mobileLookupInFlight = requestToken;

  try {
    const result = await apiRequest(`/api/customers/lookup/by-mobile/${mobile}`, { method: 'GET' });

    // If the field changed again while this request was in flight,
    // discard this (now-stale) result instead of overwriting newer input.
    if (mobileLookupInFlight !== requestToken) return;

    if (result.data) {
      selectCustomer(result.data);
    }
    // No match: leave the field editable exactly as-is so the cashier
    // can type the Customer Name and continue. No error is shown —
    // Auto Customer Creation on finalize handles this as before.
  } catch (error) {
    if (mobileLookupInFlight !== requestToken) return;
    // A real failure (network/session/server) — don't block billing.
    // Silently fall back to manual entry; the cashier can still use the
    // "Find Customer" search box above, or continue as a new customer.
  }
}

fieldCustomerMobile.addEventListener('input', () => {
  const digits = fieldCustomerMobile.value; // attachMobileInputGuard already strips to digits, max 10

  if (digits.length < 10) {
    // Number is incomplete or was edited down from a previously complete
    // one — no DB query, and any previously linked customer is no longer
    // valid for what's currently typed.
    if (fieldCustomer.value) {
      clearSelectedCustomer();
    }
    lastLookedUpMobile = '';
    return;
  }

  // Exactly 10 digits — trigger lookup automatically, no manual search
  // button needed. lookupCustomerByMobile() itself de-dupes repeats.
  lookupCustomerByMobile(digits);
});

function addProductToBill(product) {
  const requiresIdentifiers = product.usesSerialNumber || product.usesImeiNumber;

  billItems.push({
    product: product.id,
    productSnapshot: product,
    quantity: 1,
    sellingPrice: product.sellingPrice || 0,
    discount: 0,
    gstPercentage: product.gst ? (product.gst.gstPercentage ?? 0) : 0,
    identifiers: [],
    requiresIdentifiers,
    identifierType: product.usesImeiNumber ? 'IMEI' : 'Serial Number'
  });

  renderItemsTable();
  renderTotals();

  if (requiresIdentifiers) {
    const index = billItems.length - 1;
    openIdentifierPicker(index);
  }
}

/* ============================================================
   BILLING GRID (line items)
   ============================================================ */

function computeItemTotals(item) {
  const subtotal = round2(item.quantity * item.sellingPrice);
  const taxable = round2(subtotal - (item.discount || 0));
  const taxAmount = round2((taxable * (item.gstPercentage || 0)) / 100);
  const lineTotal = round2(taxable + taxAmount);
  return { subtotal, taxAmount, lineTotal };
}

function renderTotals() {
  let subtotal = 0;
  let discount = 0;
  let tax = 0;
  let grand = 0;

  billItems.forEach((item) => {
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

function renderItemsTable() {
  itemsTableBody.innerHTML = '';
  itemsEmptyState.classList.toggle('visible', billItems.length === 0);
  itemsEmptyState.style.display = billItems.length === 0 ? 'flex' : 'none';

  billItems.forEach((item, index) => {
    const product = item.productSnapshot || allActiveProductsById.get(item.product) || {};
    const { lineTotal } = computeItemTotals(item);

    const tr = document.createElement('tr');

    // Product name + identifier chip
    const nameTd = document.createElement('td');
    nameTd.textContent = product.productName || '—';
    if (item.requiresIdentifiers) {
      const isComplete = item.identifiers.length === item.quantity;
      const chip = document.createElement('button');
      chip.type = 'button';
      chip.className = `identifier-chip-btn ${isComplete ? '' : 'warning'}`;
      chip.textContent = isComplete
        ? `${item.identifiers.length} ${item.identifierType}${item.identifiers.length !== 1 ? 's' : ''}`
        : `Select ${item.identifierType}s`;
      chip.addEventListener('click', () => openIdentifierPicker(index));
      nameTd.appendChild(chip);
    }
    tr.appendChild(nameTd);

    // Quantity stepper
    const qtyTd = document.createElement('td');
    const stepper = document.createElement('div');
    stepper.className = 'qty-stepper';

    const decBtn = document.createElement('button');
    decBtn.type = 'button';
    decBtn.textContent = '−';
    decBtn.addEventListener('click', () => updateItemQuantity(index, item.quantity - 1));

    const qtyInput = document.createElement('input');
    qtyInput.type = 'number';
    qtyInput.min = '1';
    qtyInput.step = '1';
    qtyInput.value = item.quantity;
    qtyInput.addEventListener('change', () => updateItemQuantity(index, Number(qtyInput.value)));

    const incBtn = document.createElement('button');
    incBtn.type = 'button';
    incBtn.textContent = '+';
    incBtn.addEventListener('click', () => updateItemQuantity(index, item.quantity + 1));

    stepper.appendChild(decBtn);
    stepper.appendChild(qtyInput);
    stepper.appendChild(incBtn);
    qtyTd.appendChild(stepper);
    tr.appendChild(qtyTd);

    // Price
    const priceTd = document.createElement('td');
    const priceInput = document.createElement('input');
    priceInput.type = 'number';
    priceInput.min = '0';
    priceInput.step = '0.01';
    priceInput.className = 'grid-price-input';
    priceInput.value = item.sellingPrice;
    priceInput.addEventListener('change', () => {
      billItems[index].sellingPrice = Math.max(0, Number(priceInput.value) || 0);
      renderItemsTable();
      renderTotals();
    });
    priceTd.appendChild(priceInput);
    tr.appendChild(priceTd);

    // Discount
    const discountTd = document.createElement('td');
    const discountInput = document.createElement('input');
    discountInput.type = 'number';
    discountInput.min = '0';
    discountInput.step = '0.01';
    discountInput.className = 'grid-discount-input';
    discountInput.value = item.discount || 0;
    discountInput.addEventListener('change', () => {
      billItems[index].discount = Math.max(0, Number(discountInput.value) || 0);
      renderItemsTable();
      renderTotals();
    });
    discountTd.appendChild(discountInput);
    tr.appendChild(discountTd);

    // GST
    const gstTd = document.createElement('td');
    gstTd.classList.add('cell-muted');
    gstTd.textContent = `${item.gstPercentage || 0}%`;
    tr.appendChild(gstTd);

    // Line total
    const totalTd = document.createElement('td');
    totalTd.textContent = formatCurrency(lineTotal);
    tr.appendChild(totalTd);

    // Remove
    const actionsTd = document.createElement('td');
    const removeBtn = document.createElement('button');
    removeBtn.type = 'button';
    removeBtn.className = 'row-action-btn danger';
    removeBtn.textContent = 'Remove';
    removeBtn.addEventListener('click', () => {
      billItems.splice(index, 1);
      renderItemsTable();
      renderTotals();
    });
    actionsTd.appendChild(removeBtn);
    tr.appendChild(actionsTd);

    itemsTableBody.appendChild(tr);
  });
}

function updateItemQuantity(index, newQuantity) {
  const item = billItems[index];
  if (!item) return;

  const quantity = Math.max(1, Math.floor(Number(newQuantity) || 1));
  item.quantity = quantity;

  // If identifiers are required and the count no longer matches, trim excess
  // and prompt the user to complete the selection.
  if (item.requiresIdentifiers && item.identifiers.length > quantity) {
    item.identifiers = item.identifiers.slice(0, quantity);
  }

  renderItemsTable();
  renderTotals();

  if (item.requiresIdentifiers && item.identifiers.length !== quantity) {
    openIdentifierPicker(index);
  }
}

/* ============================================================
   IDENTIFIER PICKER MODAL (Serial Number / IMEI selection)
   ============================================================ */

async function openIdentifierPicker(itemIndex) {
  const item = billItems[itemIndex];
  if (!item) return;

  identifierPickerContext = { itemIndex };
  identifierPickerError.textContent = '';
  identifierModalTitle.textContent = `Select ${item.identifierType}s`;
  identifierPickerCount.textContent = `Choose exactly ${item.quantity} ${item.identifierType}${item.quantity !== 1 ? 's' : ''} for this line`;
  identifierPickerList.innerHTML = '<p class="product-result-empty">Loading available stock...</p>';
  identifierModalOverlay.hidden = false;

  try {
    const result = await apiRequest(`/api/billing/available-identifiers/${item.product}`, { method: 'GET' });
    const available = result.data || [];
    renderIdentifierPickerList(available, item.identifiers.map((i) => i.value));
  } catch (error) {
    identifierPickerList.innerHTML = '';
    identifierPickerError.textContent = error.message || 'Unable to load available stock.';
  }
}

function renderIdentifierPickerList(available, preselectedValues) {
  identifierPickerList.innerHTML = '';

  if (available.length === 0) {
    const empty = document.createElement('p');
    empty.className = 'product-result-empty';
    empty.textContent = 'No stock available for this product.';
    identifierPickerList.appendChild(empty);
    return;
  }

  const preselected = new Set(preselectedValues);

  available.forEach((identifier) => {
    const row = document.createElement('label');
    row.className = 'identifier-picker-item';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.value = identifier.value;
    checkbox.checked = preselected.has(identifier.value);

    const label = document.createElement('span');
    label.textContent = identifier.value;

    row.appendChild(checkbox);
    row.appendChild(label);
    identifierPickerList.appendChild(row);
  });
}

function closeIdentifierPicker() {
  identifierModalOverlay.hidden = true;
  identifierPickerContext = null;
  identifierPickerList.innerHTML = '';
  identifierPickerError.textContent = '';
}

identifierModalClose.addEventListener('click', closeIdentifierPicker);
identifierModalCancel.addEventListener('click', closeIdentifierPicker);

identifierModalOverlay.addEventListener('click', (event) => {
  if (event.target === identifierModalOverlay) closeIdentifierPicker();
});

identifierModalConfirm.addEventListener('click', () => {
  if (!identifierPickerContext) return;

  const { itemIndex } = identifierPickerContext;
  const item = billItems[itemIndex];
  if (!item) {
    closeIdentifierPicker();
    return;
  }

  const checked = Array.from(identifierPickerList.querySelectorAll('input[type="checkbox"]:checked')).map((cb) => cb.value);

  if (checked.length !== item.quantity) {
    identifierPickerError.textContent = `Please select exactly ${item.quantity} ${item.identifierType}${item.quantity !== 1 ? 's' : ''} (currently selected: ${checked.length})`;
    return;
  }

  item.identifiers = checked.map((value) => ({ type: item.identifierType, value }));
  renderItemsTable();
  renderTotals();
  closeIdentifierPicker();
});

/* ============================================================
   BILL FORM MODAL (New / Edit Draft)
   ============================================================ */

function clearHeaderFieldErrors() {
  HEADER_FIELD_NAMES.forEach((name) => {
    const el = document.getElementById(`error-${name}`);
    if (el) el.textContent = '';
  });
  formError.textContent = '';
}

function resetBillForm() {
  billForm.reset();
  clearHeaderFieldErrors();
  fieldBillDate.value = new Date().toISOString().slice(0, 10);
  billNumberPreview.textContent = 'Auto-generated on save';
  billItems = [];
  productSearchInput.value = '';
  productSearchResults.hidden = true;
  customerSearchInput.value = '';
  customerSearchResults.hidden = true;
  clearSelectedCustomer();
  lastLookedUpMobile = '';
  mobileLookupInFlight = null;
  renderItemsTable();
  renderTotals();
}

async function loadNextBillNumberPreview() {
  try {
    const result = await apiRequest('/api/billing/next-number', { method: 'GET' });
    billNumberPreview.textContent = result.data.billNumber;
  } catch (error) {
    billNumberPreview.textContent = 'Auto-generated on save';
  }
}

function openAddModal() {
  currentEditId = null;
  modalTitle.textContent = 'New Bill';
  resetBillForm();
  formModalOverlay.hidden = false;
  loadNextBillNumberPreview();
  productSearchInput.focus();
}

async function openEditModal(id) {
  try {
    const result = await apiRequest(`/api/billing/${id}`, { method: 'GET' });
    const record = result.data;

    if (record.status !== 'Draft') {
      showToast('Only draft bills can be edited.', 'error');
      return;
    }

    currentEditId = record.id;
    modalTitle.textContent = `Edit Draft — ${record.billNumber}`;
    clearHeaderFieldErrors();

    billNumberPreview.textContent = record.billNumber;
    if (record.customer) {
      selectCustomer({
        id: record.customer.id,
        customerCode: record.customer.customerCode,
        customerName: record.customer.customerName,
        mobileNumber: record.customer.mobileNumber
      });
      lastLookedUpMobile = record.customer.mobileNumber || '';
    } else {
      clearSelectedCustomer();
      fieldCustomerName.value = record.customerName || '';
      fieldCustomerMobile.value = record.customerMobile || '';
      // A draft can hold a mobile number that was typed but never linked
      // (e.g. it didn't match anyone at the time). Don't mark it as
      // "already looked up" — if the cashier reopens this draft, editing
      // should still be able to trigger a fresh lookup for that number.
      lastLookedUpMobile = '';
    }
    fieldPaymentMode.value = record.paymentMode ? record.paymentMode.id : '';
    fieldBillDate.value = toDateInputValue(record.billDate);
    fieldRemarks.value = record.remarks || '';

    billItems = (record.items || []).map((item) => {
      const product = item.product || {};
      return {
        product: product.id,
        productSnapshot: product,
        quantity: item.quantity,
        sellingPrice: item.sellingPrice,
        discount: item.discount,
        gstPercentage: item.gstPercentage,
        identifiers: item.identifiers || [],
        requiresIdentifiers: Boolean(product.usesSerialNumber || product.usesImeiNumber),
        identifierType: product.usesImeiNumber ? 'IMEI' : 'Serial Number'
      };
    });

    renderItemsTable();
    renderTotals();
    formModalOverlay.hidden = false;
  } catch (error) {
    showToast(error.message || 'Unable to load bill.', 'error');
  }
}

function closeFormModal() {
  formModalOverlay.hidden = true;
  resetBillForm();
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
    billDate: fieldBillDate.value,
    customer: fieldCustomer.value || '',
    customerName: fieldCustomerName.value,
    customerMobile: fieldCustomerMobile.value,
    paymentMode: fieldPaymentMode.value || '',
    remarks: fieldRemarks.value
  };
}

function collectItemsPayload() {
  return billItems.map((item) => ({
    product: item.product,
    quantity: item.quantity,
    sellingPrice: item.sellingPrice,
    discount: item.discount,
    gstPercentage: item.gstPercentage,
    identifiers: item.identifiers.map((identifier) => identifier.value)
  }));
}

function validateBillItemsBeforeSubmit() {
  for (const item of billItems) {
    if (item.requiresIdentifiers && item.identifiers.length !== item.quantity) {
      const product = item.productSnapshot || {};
      return `Please select ${item.quantity} ${item.identifierType}${item.quantity !== 1 ? 's' : ''} for "${product.productName || 'this product'}" before continuing`;
    }
  }
  return null;
}

async function submitBill(action) {
  clearHeaderFieldErrors();

  if (action === 'finalize' && billItems.length === 0) {
    formError.textContent = 'Add at least one product before finalizing';
    return;
  }

  const identifierError = validateBillItemsBeforeSubmit();
  if (identifierError) {
    formError.textContent = identifierError;
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

  let response;
  try {
    if (currentEditId) {
      response = await apiRequest(`/api/billing/${currentEditId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });
    } else {
      response = await apiRequest('/api/billing', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
    }

    showToast(action === 'finalize' ? 'Bill finalized. Inventory updated' : 'Bill saved as draft', 'success');
    closeFormModal();
    loadRecords();

    if (action === 'finalize' && response && response.data && response.data.id) {
      // Auto Print, per Settings → Print Settings. This reuses the exact
      // same print pipeline as the manual Print button (handlePrintBill),
      // so paper size, printer, header/footer, and preview-vs-silent all
      // come from the one saved Print Settings source — nothing here
      // hardcodes or re-implements print behavior.
      await autoPrintIfEnabled(response.data.id, response.data.billNumber);
    }
  } catch (error) {
    formError.textContent = error.message || 'Unable to save the bill.';
  } finally {
    modalSaveDraft.disabled = false;
    modalFinalize.disabled = false;
    busyText.textContent = originalText;
  }
}

async function autoPrintIfEnabled(billId, billNumber) {
  try {
    const result = await apiRequest(`/api/billing/${billId}/print`, { method: 'GET' });
    if (result.data && result.data.autoPrintEnabled) {
      await handlePrintBill(billId);
    }
  } catch (error) {
    // Auto Print is a convenience on top of a bill that already finalized
    // successfully — a failure here (e.g. print settings unreachable)
    // must not be reported as a billing error, since the bill itself is
    // fine. The cashier can still print manually from the bill list.
    showToast(`Bill ${billNumber} finalized, but automatic printing could not run. You can print it manually.`, 'error');
  }
}

modalSaveDraft.addEventListener('click', () => submitBill('draft'));
modalFinalize.addEventListener('click', () => submitBill('finalize'));

/* ============================================================
   VIEW BILL MODAL
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
  viewModalTitle.textContent = `Bill — ${record.billNumber}`;

  // Header section
  const headerSection = document.createElement('div');
  headerSection.className = 'view-section';

  const statusBadge = document.createElement('span');
  statusBadge.className = `status-badge ${statusBadgeClass(record.status)}`;
  statusBadge.textContent = record.status;

  const headerGrid = document.createElement('div');
  headerGrid.className = 'view-grid';
  headerGrid.appendChild(renderViewField('Bill Number', record.billNumber));
  headerGrid.appendChild(renderViewField('Bill Date', formatDate(record.billDate)));
  headerGrid.appendChild(renderViewField('Customer Name', record.customerName));
  headerGrid.appendChild(renderViewField('Customer Mobile', record.customerMobile));
  if (record.customer && record.customer.customerCode) {
    headerGrid.appendChild(renderViewField('Customer Code', record.customer.customerCode));
  }
  headerGrid.appendChild(renderViewField('Payment Mode', record.paymentMode ? record.paymentMode.paymentModeName : '—'));
  headerGrid.appendChild(renderViewField('Salesperson', record.salesperson ? record.salesperson.fullName : '—'));
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

    [item.quantity, formatCurrency(item.sellingPrice), formatCurrency(item.discount), `${item.gstPercentage}%`, formatCurrency(item.taxAmount), formatCurrency(item.lineTotal)]
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

  // Inventory / warranty summary (Finalized only)
  if (record.status === 'Finalized') {
    const invSection = document.createElement('div');
    invSection.className = 'view-section';
    const invTitle = document.createElement('span');
    invTitle.className = 'form-section-title';
    invTitle.textContent = 'Inventory & Warranty Summary';
    invSection.appendChild(invTitle);

    const warrantyItems = (record.items || []).filter((item) => item.product && item.product.warrantyAvailable);

    const invGrid = document.createElement('div');
    invGrid.className = 'view-grid';
    invGrid.appendChild(renderViewField('Finalized At', formatDateTime(record.finalizedAt)));
    invGrid.appendChild(renderViewField('Items Sold', String((record.items || []).length)));
    invGrid.appendChild(renderViewField('Warranty-Eligible Lines', String(warrantyItems.length)));
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
    const result = await apiRequest(`/api/billing/${id}`, { method: 'GET' });
    renderViewModalContent(result.data);
    viewModalPrint.hidden = result.data.status !== 'Finalized';
    viewModalPrint.onclick = () => handlePrintBill(result.data.id);
    viewModalPreview.hidden = result.data.status !== 'Finalized';
    viewModalPreview.onclick = () => openPreviewModal(result.data.id);
    viewModalOverlay.hidden = false;
  } catch (error) {
    showToast(error.message || 'Unable to load bill details.', 'error');
  }
}

function closeViewModal() {
  viewModalOverlay.hidden = true;
}

/* ============================================================
   PRINT INVOICE
   ============================================================ */

async function handlePrintBill(id) {
  if (!window.printAPI) {
    showToast('Printing is only available in the desktop application.', 'error');
    return;
  }

  let printPayload;

  try {
    const result = await apiRequest(`/api/billing/${id}/print`, { method: 'GET' });
    printPayload = result.data;
  } catch (error) {
    showToast(error.message || 'Unable to prepare invoice for printing.', 'error');
    return;
  }

  const printOptions = {
    printerName: printPayload.printerName,
    invoicePaperSize: printPayload.invoicePaperSize,
    billNumber: printPayload.billNumber,
    copies: 1
  };

  let printResult;
  try {
    printResult = printPayload.printPreviewEnabled
      ? await window.printAPI.previewHTML(printPayload.html, printOptions)
      : await window.printAPI.printHTML(printPayload.html, printOptions);
  } catch (error) {
    printResult = { success: false, failureReason: error.message || 'Print failed' };
  }

  try {
    await apiRequest(`/api/billing/${id}/print`, {
      method: 'POST',
      body: JSON.stringify({
        printerName: printPayload.printerName,
        copies: 1,
        status: printResult.success ? 'Success' : 'Failed',
        failureReason: printResult.success ? '' : (printResult.failureReason || 'Print failed')
      })
    });
  } catch (error) {
    // Print history is best-effort logging; a failure here should not mask
    // the actual print outcome already shown to the user below.
  }

  if (printResult.success) {
    const message = printResult.filePath
      ? `Invoice ${printPayload.billNumber} saved as PDF: ${printResult.filePath}`
      : `Invoice ${printPayload.billNumber} sent to printer.`;
    showToast(message, 'success');
  } else {
    showToast(printResult.failureReason || 'Print failed.', 'error');
  }
}

viewModalClose.addEventListener('click', closeViewModal);
viewModalCloseFooter.addEventListener('click', closeViewModal);
viewModalOverlay.addEventListener('click', (event) => {
  if (event.target === viewModalOverlay) closeViewModal();
});

/* ============================================================
   LIVE INVOICE PREVIEW (Phase 20.12)
   ============================================================
   Single source of truth: this reuses the exact same
   GET /api/billing/:id/print route (and therefore the exact same
   Invoice Engine + standardized Invoice Object + A4/A5 templates)
   that handlePrintBill() already uses for real printing. The
   preview never builds its own invoice HTML, never recalculates
   anything, and never talks to window.printAPI directly except
   for the Print button, which simply calls handlePrintBill() —
   the same function the row-action Print button and the view
   modal's Print button already call.

   The only thing this module adds on top of that HTML is
   presentation: a read-only iframe, a template switch (via the
   route's optional ?templateKey= override), zoom, and page
   navigation for multi-page invoices. Nothing here can edit the
   bill, its totals, its customer, its products, or its warranty
   data — the iframe is sandboxed (no scripts, no same-origin
   writes back to this page) and no controls exist for editing.
   ------------------------------------------------------------ */

const PREVIEW_ZOOM_STEP = 0.1;
const PREVIEW_ZOOM_MIN = 0.4;
const PREVIEW_ZOOM_MAX = 2;

let previewBillId = null;
let previewZoom = 1;
let previewFitMode = true; // "Fit to Window" is the default open state
let previewPageCount = 1;
let previewCurrentPage = 1;
let previewLoadToken = 0; // guards against a stale response landing after the modal moved on

function previewClearFrame() {
  previewFrame.srcdoc = '<!DOCTYPE html><html><body></body></html>';
}

// Single place that ever touches the three mutually-exclusive preview
// states (loading / error / canvas). Funneling every transition through
// here — rather than three separate functions each toggling `hidden`
// independently — means it's structurally impossible for two states to
// end up visible at once, regardless of any CSS specificity quirks.
function setPreviewState(state, message) {
  previewLoadingState.hidden = state !== 'loading';
  previewErrorState.hidden = state !== 'error';
  previewCanvas.hidden = state !== 'canvas';

  if (state !== 'canvas') {
    // Actively clear the iframe rather than relying on `hidden` alone —
    // a `srcdoc` document that's still loaded can otherwise remain
    // visible/scrollable underneath the loading or error state.
    previewClearFrame();
  }

  if (state === 'error') {
    previewErrorText.textContent = message || 'Unable to load invoice preview.';
  }
}

function previewShowLoading() {
  setPreviewState('loading');
}

function previewShowError(message) {
  setPreviewState('error', message);
}

function previewShowCanvas() {
  setPreviewState('canvas');
}

function applyPreviewZoom() {
  const frameDoc = previewFrame.contentDocument;
  if (!frameDoc || !frameDoc.body) return;

  if (previewFitMode) {
    // Fit to Window: scale the rendered page down (never up) so its
    // full width fits the visible canvas, without touching layout —
    // same transform-based approach as Actual Size/zoom, just with a
    // computed ratio instead of a fixed step.
    const canvasWidth = previewCanvas.clientWidth - 32; // account for canvas padding
    const pageWidth = frameDoc.documentElement.scrollWidth || frameDoc.body.scrollWidth || canvasWidth;
    previewZoom = pageWidth > 0 ? Math.min(1, canvasWidth / pageWidth) : 1;
  }

  previewFrame.style.transform = `scale(${previewZoom})`;
  previewFrame.style.transformOrigin = 'top center';
  previewZoomValue.textContent = `${Math.round(previewZoom * 100)}%`;
}

// Multi-page detection: the invoice templates are plain paginated HTML
// (@page rules for print), not a paginated JS component, so "how many
// pages" has to be measured from rendered content height rather than
// read from a page count the engine already knows. This measures the
// same content the printer will output and only affects the preview's
// own page-nav controls — it never changes what gets printed.
function measurePreviewPages() {
  const frameDoc = previewFrame.contentDocument;
  if (!frameDoc || !frameDoc.body) {
    previewPageCount = 1;
    return;
  }

  const pageHeightPx = frameDoc.body.scrollHeight;
  const viewportHeightPx = previewFrame.clientHeight || frameDoc.documentElement.clientHeight || pageHeightPx;

  previewPageCount = viewportHeightPx > 0
    ? Math.max(1, Math.ceil(pageHeightPx / viewportHeightPx))
    : 1;
}

function renderPreviewPageState() {
  const hasMultiplePages = previewPageCount > 1;
  previewPageNav.hidden = !hasMultiplePages;
  previewPageIndicator.textContent = `Page ${previewCurrentPage} of ${previewPageCount}`;
  previewPrevPageBtn.disabled = previewCurrentPage <= 1;
  previewNextPageBtn.disabled = previewCurrentPage >= previewPageCount;
}

function goToPreviewPage(pageNumber) {
  const frameDoc = previewFrame.contentDocument;
  if (!frameDoc || !frameDoc.documentElement) return;

  const clamped = Math.min(Math.max(pageNumber, 1), previewPageCount);
  previewCurrentPage = clamped;

  const viewportHeightPx = previewFrame.clientHeight || frameDoc.documentElement.clientHeight || 0;
  frameDoc.documentElement.scrollTo({ top: (clamped - 1) * viewportHeightPx, behavior: 'smooth' });

  renderPreviewPageState();
}

async function loadPreviewHtml(billId, templateKey) {
  const token = ++previewLoadToken;
  previewShowLoading();

  let payload;
  try {
    const query = templateKey ? `?templateKey=${encodeURIComponent(templateKey)}` : '';
    const result = await apiRequest(`/api/billing/${billId}/print${query}`, { method: 'GET' });
    payload = result.data;
  } catch (error) {
    if (token !== previewLoadToken) return; // a newer load superseded this one
    previewShowError(error.message || 'Unable to load invoice preview.');
    return;
  }

  if (token !== previewLoadToken) return;

  // Reflect the actual template this HTML was rendered with, in case a
  // caller opened the preview without a template override (e.g. from the
  // row action / view modal) — the dropdown should show what's really on
  // screen rather than silently disagreeing with it.
  const resolvedTemplateKey = INVOICE_TEMPLATE_SETTING_TO_KEY[payload.invoiceTemplate] || templateKey;
  if (resolvedTemplateKey) {
    previewTemplateSelect.value = resolvedTemplateKey;
  }

  previewFrame.srcdoc = payload.html;

  previewFrame.onload = () => {
    if (token !== previewLoadToken) return;
    previewShowCanvas();
    previewCurrentPage = 1;
    measurePreviewPages();
    applyPreviewZoom();
    renderPreviewPageState();
  };
}

// Print Settings stores the shop-facing labels ('A4 Professional' /
// 'A5 Retail'); the print route's ?templateKey= override expects the
// Invoice Engine's internal registry keys ('a4-professional' /
// 'a5-retail'). This is the one place that mapping lives on the
// frontend, mirroring INVOICE_TEMPLATE_SETTING_VALUES in invoiceEngine.js.
const INVOICE_TEMPLATE_SETTING_TO_KEY = {
  'A4 Professional': 'a4-professional',
  'A5 Retail': 'a5-retail'
};

function openPreviewModal(billId) {
  previewBillId = billId;
  previewZoom = 1;
  previewFitMode = true;
  previewPageCount = 1;
  previewCurrentPage = 1;
  previewModalOverlay.hidden = false;
  loadPreviewHtml(billId, previewTemplateSelect.value);
}

function closePreviewModal() {
  previewModalOverlay.hidden = true;
  previewFrame.onload = null;
  previewClearFrame();
  previewBillId = null;
}

previewModalClose.addEventListener('click', closePreviewModal);
previewModalCloseFooter.addEventListener('click', closePreviewModal);
previewModalOverlay.addEventListener('click', (event) => {
  if (event.target === previewModalOverlay) closePreviewModal();
});

previewTemplateSelect.addEventListener('change', () => {
  if (!previewBillId) return;
  loadPreviewHtml(previewBillId, previewTemplateSelect.value);
});

previewZoomInBtn.addEventListener('click', () => {
  previewFitMode = false;
  previewZoom = Math.min(PREVIEW_ZOOM_MAX, previewZoom + PREVIEW_ZOOM_STEP);
  applyPreviewZoom();
});

previewZoomOutBtn.addEventListener('click', () => {
  previewFitMode = false;
  previewZoom = Math.max(PREVIEW_ZOOM_MIN, previewZoom - PREVIEW_ZOOM_STEP);
  applyPreviewZoom();
});

previewZoomFitBtn.addEventListener('click', () => {
  previewFitMode = true;
  applyPreviewZoom();
});

previewZoomActualBtn.addEventListener('click', () => {
  previewFitMode = false;
  previewZoom = 1;
  applyPreviewZoom();
});

previewPrevPageBtn.addEventListener('click', () => goToPreviewPage(previewCurrentPage - 1));
previewNextPageBtn.addEventListener('click', () => goToPreviewPage(previewCurrentPage + 1));

// Printing from the preview delegates entirely to the existing print
// pipeline (handlePrintBill → window.printAPI → main.js Print Engine).
// The preview never prints itself and never re-renders the invoice for
// printing — it only decides which finalized bill to hand off.
previewPrintButton.addEventListener('click', () => {
  if (previewBillId) {
    handlePrintBill(previewBillId);
  }
});

/* ============================================================
   CANCEL BILL MODAL
   ============================================================ */

function openCancelModal(record) {
  pendingCancelId = record.id;
  cancelReasonInput.value = '';
  cancelErrorReason.textContent = '';

  cancelModalMessage.textContent = record.status === 'Finalized'
    ? `Cancelling "${record.billNumber}" will reverse the inventory reduction, release any reserved serial numbers/IMEIs, and reverse warranty activation made when it was finalized. This cannot be undone.`
    : `Are you sure you want to cancel draft bill "${record.billNumber}"?`;

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
    await apiRequest(`/api/billing/${pendingCancelId}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ cancellationReason: reason })
    });
    showToast('Bill cancelled successfully', 'success');
    closeCancelModal();
    loadRecords();
  } catch (error) {
    cancelErrorReason.textContent = error.message || 'Unable to cancel bill.';
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

  const canAccess = await guardPageAccess('Billing');
  if (!canAccess) return;

  try {
    await loadFilterAndFormData();
  } catch (error) {
    showToast(error.message || 'Unable to load payment modes and products.', 'error');
  }

  loadRecords();
}

init();
