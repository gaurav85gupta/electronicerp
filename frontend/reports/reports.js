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

const reportTabsEl = document.getElementById('report-tabs');
const summaryGridEl = document.getElementById('summary-grid');
const searchInput = document.getElementById('search-input');
const filterControlsEl = document.getElementById('filter-controls');
const sortControlsEl = document.getElementById('sort-controls');
const printButton = document.getElementById('print-button');
const exportToggle = document.getElementById('export-toggle');
const exportMenu = document.getElementById('export-menu');

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

const toastContainer = document.getElementById('toast-container');

/* ============================================================
   FORMAT HELPERS
   ============================================================ */

function formatCurrency(value) {
  const amount = Number(value) || 0;
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  return date.toLocaleString(undefined, { year: 'numeric', month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' });
}

function statusBadgeClass(value) {
  const map = {
    Active: 'warranty-active',
    Expired: 'warranty-expired',
    Void: 'warranty-void',
    'Stock Increase': 'movement-increase',
    'Stock Decrease': 'movement-decrease',
    'In Stock': 'in-stock',
    'Low Stock': 'low-stock',
    'Out of Stock': 'out-of-stock'
  };
  return map[value] || '';
}

/* ============================================================
   REPORT CONFIGURATION
   ============================================================
   Each report declares: endpoint, columns, filters, sort options,
   and summary cards. A single generic renderer drives all of them.
   ============================================================ */

const REPORTS = {
  sales: {
    label: 'Sales',
    endpoint: 'sales',
    searchPlaceholder: 'Search by bill #, customer name, or mobile...',
    emptyText: 'No sales found for the selected filters.',
    columns: [
      { key: 'billNumber', label: 'Bill Number' },
      { key: 'billDate', label: 'Date', format: formatDate },
      { key: 'customerName', label: 'Customer' },
      { key: 'totalAmount', label: 'Total', format: formatCurrency },
      { key: 'gst', label: 'GST', format: formatCurrency },
      { key: 'paymentMode', label: 'Payment Mode' },
      { key: 'salesperson', label: 'Salesperson' }
    ],
    filters: [
      { name: 'customer', type: 'select', placeholder: 'All Customers', optionsFrom: 'customers', optionValue: 'id', optionLabel: 'customerName' },
      { name: 'paymentMode', type: 'select', placeholder: 'All Payment Modes', optionsFrom: 'paymentModes', optionValue: 'id', optionLabel: 'paymentModeName' },
      { name: 'salesperson', type: 'select', placeholder: 'All Salespeople', optionsFrom: 'salespeople', optionValue: 'id', optionLabel: 'fullName' },
      { name: 'dateFrom', type: 'date', title: 'From date' },
      { name: 'dateTo', type: 'date', title: 'To date' }
    ],
    sortOptions: [
      { value: 'billDate', label: 'Date' },
      { value: 'grandTotal', label: 'Total' },
      { value: 'billNumber', label: 'Bill Number' }
    ],
    summaryCards: [
      { key: 'totalBills', label: 'Total Bills' },
      { key: 'totalSales', label: 'Total Sales', format: formatCurrency },
      { key: 'averageBillValue', label: 'Average Bill Value', format: formatCurrency },
      { key: 'totalGst', label: 'Total GST', format: formatCurrency }
    ]
  },

  purchases: {
    label: 'Purchases',
    endpoint: 'purchases',
    searchPlaceholder: 'Search by purchase # or supplier invoice #...',
    emptyText: 'No purchases found for the selected filters.',
    columns: [
      { key: 'purchaseNumber', label: 'Purchase Number' },
      { key: 'purchaseDate', label: 'Date', format: formatDate },
      { key: 'supplier', label: 'Supplier' },
      { key: 'totalAmount', label: 'Total', format: formatCurrency },
      { key: 'gst', label: 'GST', format: formatCurrency },
      { key: 'status', label: 'Status', badge: true }
    ],
    filters: [
      { name: 'supplier', type: 'select', placeholder: 'All Suppliers', optionsFrom: 'suppliers', optionValue: 'id', optionLabel: 'supplierName' },
      { name: 'status', type: 'select', placeholder: 'All Status', options: ['Draft', 'Finalized', 'Cancelled'] },
      { name: 'dateFrom', type: 'date', title: 'From date' },
      { name: 'dateTo', type: 'date', title: 'To date' }
    ],
    sortOptions: [
      { value: 'purchaseDate', label: 'Date' },
      { value: 'grandTotal', label: 'Total' },
      { value: 'purchaseNumber', label: 'Purchase Number' }
    ],
    summaryCards: [
      { key: 'totalPurchases', label: 'Total Purchases' },
      { key: 'purchaseValue', label: 'Purchase Value', format: formatCurrency },
      { key: 'averagePurchaseValue', label: 'Average Purchase Value', format: formatCurrency }
    ]
  },

  inventory: {
    label: 'Inventory',
    endpoint: 'inventory',
    searchPlaceholder: 'Search by product name or SKU...',
    emptyText: 'No inventory records found for the selected filters.',
    columns: [
      { key: 'productName', label: 'Product' },
      { key: 'sku', label: 'SKU' },
      { key: 'category', label: 'Category' },
      { key: 'brand', label: 'Brand' },
      { key: 'currentStock', label: 'Current Stock' },
      { key: 'availableStock', label: 'Available Stock' },
      { key: 'reorderLevel', label: 'Reorder Level' },
      { key: 'stockStatus', label: 'Stock Status', badge: true, badgeClass: 'stock-badge' }
    ],
    filters: [
      { name: 'category', type: 'select', placeholder: 'All Categories', optionsFrom: 'categories', optionValue: 'id', optionLabel: 'categoryName' },
      { name: 'brand', type: 'select', placeholder: 'All Brands', optionsFrom: 'brands', optionValue: 'id', optionLabel: 'brandName' },
      { name: 'lowStock', type: 'checkbox', label: 'Low Stock Only' },
      { name: 'outOfStock', type: 'checkbox', label: 'Out of Stock Only' }
    ],
    sortOptions: [
      { value: 'productName', label: 'Product Name' },
      { value: 'currentStock', label: 'Current Stock' }
    ],
    summaryCards: [
      { key: 'totalProducts', label: 'Total Products' },
      { key: 'lowStockCount', label: 'Low Stock Count' },
      { key: 'outOfStockCount', label: 'Out of Stock Count' }
    ]
  },

  'stock-movements': {
    label: 'Stock Movement',
    endpoint: 'stock-movements',
    searchPlaceholder: '',
    hideSearch: true,
    emptyText: 'No stock movements found for the selected filters.',
    columns: [
      { key: 'date', label: 'Date & Time', format: formatDateTime },
      { key: 'product', label: 'Product' },
      { key: 'movementType', label: 'Movement Type', badge: true },
      { key: 'quantity', label: 'Quantity' },
      { key: 'previousStock', label: 'Previous Stock' },
      { key: 'newStock', label: 'New Stock' },
      { key: 'referenceType', label: 'Reference' },
      { key: 'user', label: 'User' }
    ],
    filters: [
      { name: 'product', type: 'select', placeholder: 'All Products', optionsFrom: 'products', optionValue: 'id', optionLabel: 'productName' },
      { name: 'movementType', type: 'select', placeholder: 'All Movement Types', options: ['Stock Increase', 'Stock Decrease'] },
      { name: 'dateFrom', type: 'date', title: 'From date' },
      { name: 'dateTo', type: 'date', title: 'To date' }
    ],
    sortOptions: [
      { value: 'createdAt', label: 'Date' },
      { value: 'quantity', label: 'Quantity' }
    ]
  },

  customers: {
    label: 'Customers',
    endpoint: 'customers',
    searchPlaceholder: 'Search by name, mobile, or code...',
    emptyText: 'No customers found for the selected filters.',
    columns: [
      { key: 'customerCode', label: 'Customer Code' },
      { key: 'customerName', label: 'Name' },
      { key: 'mobileNumber', label: 'Mobile' },
      { key: 'customerType', label: 'Customer Type' },
      { key: 'totalBills', label: 'Total Bills' },
      { key: 'totalPurchaseAmount', label: 'Total Purchase Amount', format: formatCurrency },
      { key: 'lastPurchaseDate', label: 'Last Purchase Date', format: formatDate }
    ],
    filters: [
      { name: 'customerType', type: 'select', placeholder: 'All Customer Types', optionsFrom: 'customerTypes', optionValue: 'id', optionLabel: 'customerType' },
      { name: 'city', type: 'text', placeholder: 'City' },
      { name: 'status', type: 'select', placeholder: 'All Status', options: ['Active', 'Inactive'] }
    ],
    sortOptions: []
  },

  warranties: {
    label: 'Warranty',
    endpoint: 'warranties',
    searchPlaceholder: '',
    hideSearch: true,
    emptyText: 'No warranty records found for the selected filters.',
    columns: [
      { key: 'warrantyNumber', label: 'Warranty Number' },
      { key: 'product', label: 'Product' },
      { key: 'customerName', label: 'Customer' },
      { key: 'identifierValue', label: 'Serial Number / IMEI' },
      { key: 'startDate', label: 'Start Date', format: formatDate },
      { key: 'endDate', label: 'End Date', format: formatDate },
      { key: 'status', label: 'Status', badge: true }
    ],
    filters: [
      { name: 'warrantyStatus', type: 'select', placeholder: 'All Status', options: ['Active', 'Expired', 'Claimed', 'Void'] }
    ],
    sortOptions: [
      { value: 'warrantyStart', label: 'Start Date' },
      { value: 'warrantyEnd', label: 'End Date' }
    ]
  },

  'product-sales': {
    label: 'Product Sales',
    endpoint: 'product-sales',
    searchPlaceholder: '',
    hideSearch: true,
    emptyText: 'No product sales found for the selected filters.',
    columns: [
      { key: 'productName', label: 'Product' },
      { key: 'sku', label: 'SKU' },
      { key: 'quantitySold', label: 'Quantity Sold' },
      { key: 'salesValue', label: 'Sales Value', format: formatCurrency },
      { key: 'numberOfBills', label: 'Number of Bills' }
    ],
    filters: [
      { name: 'category', type: 'select', placeholder: 'All Categories', optionsFrom: 'categories', optionValue: 'id', optionLabel: 'categoryName' },
      { name: 'brand', type: 'select', placeholder: 'All Brands', optionsFrom: 'brands', optionValue: 'id', optionLabel: 'brandName' },
      { name: 'dateFrom', type: 'date', title: 'From date' },
      { name: 'dateTo', type: 'date', title: 'To date' }
    ],
    sortOptions: [
      { value: 'quantitySold', label: 'Quantity Sold' },
      { value: 'salesValue', label: 'Sales Value' },
      { value: 'numberOfBills', label: 'Number of Bills' }
    ]
  },

  'top-selling': {
    label: 'Top Selling',
    endpoint: 'top-selling',
    searchPlaceholder: '',
    hideSearch: true,
    noPagination: true,
    emptyText: 'No sales data available for the selected filters.',
    columns: [
      { key: 'productName', label: 'Product' },
      { key: 'sku', label: 'SKU' },
      { key: 'quantitySold', label: 'Quantity Sold' },
      { key: 'revenue', label: 'Revenue', format: formatCurrency }
    ],
    filters: [
      { name: 'category', type: 'select', placeholder: 'All Categories', optionsFrom: 'categories', optionValue: 'id', optionLabel: 'categoryName' },
      { name: 'brand', type: 'select', placeholder: 'All Brands', optionsFrom: 'brands', optionValue: 'id', optionLabel: 'brandName' },
      { name: 'dateFrom', type: 'date', title: 'From date' },
      { name: 'dateTo', type: 'date', title: 'To date' }
    ],
    sortOptions: [
      { value: 'quantity', label: 'Quantity Sold' },
      { value: 'revenue', label: 'Revenue' }
    ]
  },

  'low-stock': {
    label: 'Low Stock',
    endpoint: 'low-stock',
    searchPlaceholder: '',
    hideSearch: true,
    hideSort: true,
    emptyText: 'No products are currently low on stock.',
    columns: [
      { key: 'productName', label: 'Product' },
      { key: 'sku', label: 'SKU' },
      { key: 'category', label: 'Category' },
      { key: 'brand', label: 'Brand' },
      { key: 'currentStock', label: 'Current Stock' },
      { key: 'reorderLevel', label: 'Reorder Level' }
    ],
    filters: [],
    sortOptions: []
  },

  'out-of-stock': {
    label: 'Out of Stock',
    endpoint: 'out-of-stock',
    searchPlaceholder: '',
    hideSearch: true,
    hideSort: true,
    emptyText: 'No products are currently out of stock.',
    columns: [
      { key: 'productName', label: 'Product' },
      { key: 'sku', label: 'SKU' },
      { key: 'category', label: 'Category' },
      { key: 'brand', label: 'Brand' },
      { key: 'reorderLevel', label: 'Reorder Level' }
    ],
    filters: [],
    sortOptions: []
  }
};

const REPORT_KEYS = Object.keys(REPORTS);

/* ============================================================
   STATE
   ============================================================ */

let activeReportKey = REPORT_KEYS[0];
let currentPage = 1;
let currentSortDir = 'desc';
let searchDebounceTimer = null;
let filterOptionsCache = null;
let latestRecords = [];

/* ============================================================
   AUTH / SHELL (same behavior as dashboard.js / master-data.js)
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
  reportTabsEl.innerHTML = '';

  REPORT_KEYS.forEach((key) => {
    const tab = document.createElement('button');
    tab.type = 'button';
    tab.className = `report-tab${key === activeReportKey ? ' active' : ''}`;
    tab.textContent = REPORTS[key].label;
    tab.setAttribute('role', 'tab');
    tab.addEventListener('click', () => switchReport(key));
    reportTabsEl.appendChild(tab);
  });
}

function switchReport(key) {
  if (key === activeReportKey) return;
  activeReportKey = key;
  currentPage = 1;
  searchInput.value = '';
  renderTabs();
  renderFilterControls();
  renderSortControls();
  renderTableHead();
  loadReport();
}

/* ============================================================
   FILTER OPTIONS (for populating dropdowns)
   ============================================================ */

async function loadFilterOptions() {
  if (filterOptionsCache) return filterOptionsCache;
  try {
    const response = await apiRequest('/api/reports/filter-options');
    filterOptionsCache = response.data;
  } catch (error) {
    filterOptionsCache = {
      customers: [], suppliers: [], paymentModes: [], categories: [],
      brands: [], customerTypes: [], salespeople: [], products: []
    };
  }
  return filterOptionsCache;
}

/* ============================================================
   FILTER CONTROLS
   ============================================================ */

function currentFilterValues() {
  const config = REPORTS[activeReportKey];
  const values = {};
  (config.filters || []).forEach((filter) => {
    const el = document.getElementById(`filter-${filter.name}`);
    if (!el) return;
    if (filter.type === 'checkbox') {
      values[filter.name] = el.checked ? 'true' : '';
    } else {
      values[filter.name] = el.value || '';
    }
  });
  return values;
}

async function renderFilterControls() {
  const config = REPORTS[activeReportKey];
  filterControlsEl.innerHTML = '';
  searchInput.parentElement.style.display = config.hideSearch ? 'none' : '';
  searchInput.placeholder = config.searchPlaceholder || 'Search...';

  if (!config.filters || config.filters.length === 0) return;

  const options = await loadFilterOptions();

  config.filters.forEach((filter) => {
    if (filter.type === 'select') {
      const select = document.createElement('select');
      select.id = `filter-${filter.name}`;
      select.className = 'status-filter';

      const defaultOption = document.createElement('option');
      defaultOption.value = '';
      defaultOption.textContent = filter.placeholder || 'All';
      select.appendChild(defaultOption);

      const optionList = filter.optionsFrom ? (options[filter.optionsFrom] || []) : (filter.options || []);
      optionList.forEach((item) => {
        const opt = document.createElement('option');
        if (filter.optionsFrom) {
          opt.value = item[filter.optionValue];
          opt.textContent = item[filter.optionLabel];
        } else {
          opt.value = item;
          opt.textContent = item;
        }
        select.appendChild(opt);
      });

      select.addEventListener('change', () => {
        currentPage = 1;
        loadReport();
      });
      filterControlsEl.appendChild(select);
    } else if (filter.type === 'date') {
      const input = document.createElement('input');
      input.type = 'date';
      input.id = `filter-${filter.name}`;
      input.className = 'status-filter';
      input.title = filter.title || '';
      input.addEventListener('change', () => {
        currentPage = 1;
        loadReport();
      });
      filterControlsEl.appendChild(input);
    } else if (filter.type === 'text') {
      const input = document.createElement('input');
      input.type = 'text';
      input.id = `filter-${filter.name}`;
      input.className = 'status-filter';
      input.placeholder = filter.placeholder || '';
      input.addEventListener('input', () => {
        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(() => {
          currentPage = 1;
          loadReport();
        }, 350);
      });
      filterControlsEl.appendChild(input);
    } else if (filter.type === 'checkbox') {
      const label = document.createElement('label');
      label.className = 'active-only-label';
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.id = `filter-${filter.name}`;
      input.addEventListener('change', () => {
        currentPage = 1;
        loadReport();
      });
      label.appendChild(input);
      label.appendChild(document.createTextNode(filter.label));
      filterControlsEl.appendChild(label);
    }
  });
}

/* ============================================================
   SORT CONTROLS
   ============================================================ */

function renderSortControls() {
  const config = REPORTS[activeReportKey];
  sortControlsEl.innerHTML = '';

  if (config.hideSort || !config.sortOptions || config.sortOptions.length === 0) return;

  const label = document.createElement('label');
  label.textContent = 'Sort by';
  label.setAttribute('for', 'sort-by-select');

  const select = document.createElement('select');
  select.id = 'sort-by-select';
  select.className = 'sort-select';
  config.sortOptions.forEach((option) => {
    const opt = document.createElement('option');
    opt.value = option.value;
    opt.textContent = option.label;
    select.appendChild(opt);
  });
  select.addEventListener('change', () => {
    currentPage = 1;
    loadReport();
  });

  const dirSelect = document.createElement('select');
  dirSelect.id = 'sort-dir-select';
  dirSelect.className = 'sort-select';
  [{ v: 'desc', l: 'Descending' }, { v: 'asc', l: 'Ascending' }].forEach((item) => {
    const opt = document.createElement('option');
    opt.value = item.v;
    opt.textContent = item.l;
    if (item.v === currentSortDir) opt.selected = true;
    dirSelect.appendChild(opt);
  });
  dirSelect.addEventListener('change', () => {
    currentSortDir = dirSelect.value;
    currentPage = 1;
    loadReport();
  });

  sortControlsEl.appendChild(label);
  sortControlsEl.appendChild(select);
  sortControlsEl.appendChild(dirSelect);
}

/* ============================================================
   SUMMARY CARDS
   ============================================================ */

function renderSummaryCards(summary) {
  const config = REPORTS[activeReportKey];
  summaryGridEl.innerHTML = '';

  if (!config.summaryCards || !summary) {
    summaryGridEl.setAttribute('hidden', '');
    return;
  }

  summaryGridEl.removeAttribute('hidden');

  config.summaryCards.forEach((card) => {
    const value = summary[card.key];
    const displayValue = card.format ? card.format(value) : (value ?? '—');

    const cardEl = document.createElement('div');
    cardEl.className = 'summary-card';
    cardEl.innerHTML = `
      <span class="summary-label">${card.label}</span>
      <span class="summary-value">${displayValue}</span>
    `;
    summaryGridEl.appendChild(cardEl);
  });
}

/* ============================================================
   TABLE RENDERING
   ============================================================ */

function renderTableHead() {
  const config = REPORTS[activeReportKey];
  tableHeadRow.innerHTML = '';
  config.columns.forEach((col) => {
    const th = document.createElement('th');
    th.textContent = col.label;
    tableHeadRow.appendChild(th);
  });
}

function renderTableBody(records) {
  const config = REPORTS[activeReportKey];
  tableBody.innerHTML = '';

  records.forEach((record) => {
    const row = document.createElement('tr');

    config.columns.forEach((col) => {
      const td = document.createElement('td');
      const rawValue = record[col.key];

      if (col.badge) {
        const badgeClassPrefix = col.badgeClass || 'status-badge';
        const badge = document.createElement('span');
        badge.className = `${badgeClassPrefix} ${statusBadgeClass(rawValue)}`.trim();
        badge.textContent = rawValue ?? '—';
        td.appendChild(badge);
      } else {
        const displayValue = col.format ? col.format(rawValue) : (rawValue ?? '—');
        td.textContent = displayValue;
        if (col.muted) td.classList.add('cell-muted');
      }

      row.appendChild(td);
    });

    tableBody.appendChild(row);
  });
}

/* ============================================================
   QUERY STRING BUILDER
   ============================================================ */

function buildQueryParams({ forExport = false, format = null } = {}) {
  const config = REPORTS[activeReportKey];
  const params = new URLSearchParams();

  if (!forExport) {
    params.set('page', currentPage);
    params.set('limit', 10);
  }

  if (!config.hideSearch && searchInput.value.trim()) {
    params.set('search', searchInput.value.trim());
  }

  const filterValues = currentFilterValues();
  Object.entries(filterValues).forEach(([key, value]) => {
    if (value) params.set(key, value);
  });

  if (!config.hideSort && config.sortOptions && config.sortOptions.length > 0) {
    const sortSelect = document.getElementById('sort-by-select');
    if (sortSelect) {
      params.set('sortBy', sortSelect.value);
      params.set('sortDir', currentSortDir);
    }
  }

  if (forExport && format) {
    params.set('format', format);
  }

  return params;
}

/* ============================================================
   LOAD / RENDER REPORT
   ============================================================ */

async function loadReport() {
  const config = REPORTS[activeReportKey];

  loadingState.hidden = false;
  emptyState.hidden = true;
  paginationBar.hidden = true;
  tableBody.innerHTML = '';

  try {
    const params = buildQueryParams();
    const response = await apiRequest(`/api/reports/${config.endpoint}?${params.toString()}`);

    latestRecords = response.data || [];
    renderTableHead();
    renderTableBody(latestRecords);
    renderSummaryCards(response.summary);

    loadingState.hidden = true;

    if (latestRecords.length === 0) {
      emptyStateText.textContent = config.emptyText;
      emptyState.hidden = false;
      return;
    }

    if (!config.noPagination && response.pagination) {
      const { page, limit, totalRecords, totalPages } = response.pagination;
      const startRecord = totalRecords === 0 ? 0 : (page - 1) * limit + 1;
      const endRecord = Math.min(page * limit, totalRecords);

      paginationInfo.textContent = `Showing ${startRecord}-${endRecord} of ${totalRecords}`;
      paginationCurrent.textContent = `Page ${page} of ${totalPages}`;
      prevPageBtn.disabled = page <= 1;
      nextPageBtn.disabled = page >= totalPages;
      paginationBar.hidden = false;
    }
  } catch (error) {
    loadingState.hidden = true;
    emptyStateText.textContent = 'Unable to load this report. Please try again.';
    emptyState.hidden = false;
    showToast(error.message, 'error');
  }
}

prevPageBtn.addEventListener('click', () => {
  if (currentPage > 1) {
    currentPage -= 1;
    loadReport();
  }
});

nextPageBtn.addEventListener('click', () => {
  currentPage += 1;
  loadReport();
});

searchInput.addEventListener('input', () => {
  clearTimeout(searchDebounceTimer);
  searchDebounceTimer = setTimeout(() => {
    currentPage = 1;
    loadReport();
  }, 350);
});

/* ============================================================
   EXPORT
   ============================================================ */

exportToggle.addEventListener('click', (event) => {
  event.stopPropagation();
  exportMenu.hidden = !exportMenu.hidden;
});

document.addEventListener('click', () => {
  exportMenu.hidden = true;
});

exportMenu.addEventListener('click', (event) => event.stopPropagation());

exportMenu.querySelectorAll('button[data-format]').forEach((button) => {
  button.addEventListener('click', async () => {
    const format = button.dataset.format;
    exportMenu.hidden = true;

    const config = REPORTS[activeReportKey];
    const params = buildQueryParams({ forExport: true, format });
    const token = getAuthToken();

    try {
      const response = await fetch(`${API_BASE_URL}/api/reports/${config.endpoint}/export?${params.toString()}`, {
        headers: { Authorization: `Bearer ${token}` }
      });

      if (response.status === 401) {
        redirectToLogin();
        return;
      }

      if (!response.ok) {
        let message = 'Export failed. Please try again';
        try {
          const errorData = await response.json();
          message = errorData.message || message;
        } catch (parseError) {
          // response wasn't JSON (binary export failure) — use default message
        }
        throw new Error(message);
      }

      const blob = await response.blob();
      const disposition = response.headers.get('Content-Disposition') || '';
      const filenameMatch = disposition.match(/filename="?([^"]+)"?/);
      const filename = filenameMatch ? filenameMatch[1] : `${config.endpoint}-report.${format}`;

      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);

      showToast(`Report exported as ${format.toUpperCase()}`);
    } catch (error) {
      showToast(error.message, 'error');
    }
  });
});

/* ============================================================
   PRINT
   ============================================================ */

printButton.addEventListener('click', () => {
  window.print();
});

/* ============================================================
   INIT
   ============================================================ */

async function init() {
  renderCurrentDate();
  const sessionValid = await validateSession();
  if (!sessionValid) return;

  await applySidebarPermissions();

  const canAccess = await guardPageAccess('Reports');
  if (!canAccess) return;

  renderTabs();
  await renderFilterControls();
  renderSortControls();
  renderTableHead();
  loadReport();
}

init();