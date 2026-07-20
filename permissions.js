/* ============================================================
   PERMISSIONS — SHARED UTILITY
   ============================================================
   Centralized, reusable role-permission handling for the entire
   frontend. Include this script (before the page's own script)
   on any page inside the app shell (i.e. any page with a
   sidebar).

   Fetches the logged-in user's OWN permission grid from
   GET /api/auth/permissions (read-only, self-scoped — the
   backend never returns another role's permissions to a
   non-Owner user).

   Provides:
     - fetchMyPermissions()        : returns the permissions
         object for the current user (cached per page load)
     - canView(moduleName)         : boolean — does the current
         user have "view" on this module?
     - applySidebarPermissions()   : hides every sidebar
         <a data-nav="..."> the user cannot view
     - guardPageAccess(moduleName) : call at the top of a
         page's own script; if the user cannot view this
         module, redirects to the dashboard (or login, if the
         permissions fetch itself fails) before any page data
         loads or renders.

   Maps sidebar data-nav values to backend PERMISSION_MODULES
   names. Kept here so every page uses the same mapping.
   ============================================================ */

const PERMISSIONS_API_BASE_URL = 'http://localhost:5000';

const NAV_TO_MODULE = {
  dashboard: 'Dashboard',
  'master-data': 'Master Data',
  'product-master': 'Product Master',
  inventory: 'Inventory',
  purchase: 'Purchase',
  billing: 'Billing',
  customers: 'Customers',
  reports: 'Reports',
  settings: 'Settings'
};

let cachedPermissions = null;
let permissionsFetchPromise = null;

// Hide the sidebar the instant this script executes — i.e. before the
// browser has finished painting the page — so unfiltered nav items are
// never visible even for a moment, no matter how slow the permissions
// fetch is. revealSidebar() below undoes this once filtering is done.
(function hideSidebarUntilPermissionsApplied() {
  const style = document.createElement('style');
  style.id = 'permissions-sidebar-guard';
  style.textContent = '#sidebar { visibility: hidden !important; }';
  document.head.appendChild(style);

  // Safety net: if a page's script never calls applySidebarPermissions()
  // (e.g. a future page forgets to wire it up), don't leave the sidebar
  // permanently invisible — reveal it after a short delay regardless.
  setTimeout(revealSidebar, 4000);
})();

function revealSidebar() {
  const style = document.getElementById('permissions-sidebar-guard');
  if (style) {
    style.remove();
  }
}

function getPermissionsAuthToken() {
  return sessionStorage.getItem('erp_token');
}

/**
 * Fetches (and caches for this page load) the current user's own
 * permission grid. Returns null if the request fails (e.g. session
 * invalid, server unreachable) — callers should treat null as
 * "cannot confirm access" rather than "access granted".
 */
async function fetchMyPermissions() {
  if (cachedPermissions) {
    return cachedPermissions;
  }

  if (permissionsFetchPromise) {
    return permissionsFetchPromise;
  }

  const token = getPermissionsAuthToken();
  if (!token) {
    return null;
  }

  permissionsFetchPromise = fetch(`${PERMISSIONS_API_BASE_URL}/api/auth/permissions`, {
    headers: { Authorization: `Bearer ${token}` }
  })
    .then((response) => {
      if (!response.ok) {
        return null;
      }
      return response.json();
    })
    .then((data) => {
      if (data && data.success && data.data && data.data.permissions) {
        cachedPermissions = data.data.permissions;
        return cachedPermissions;
      }
      return null;
    })
    .catch(() => null)
    .finally(() => {
      permissionsFetchPromise = null;
    });

  return permissionsFetchPromise;
}

/**
 * Returns true only if permissions were successfully loaded AND the
 * module grants the given action. Fails closed: any missing data
 * (module not found, permissions not loaded) is treated as no access.
 */
function hasPermission(permissions, moduleName, action) {
  if (!permissions || !moduleName) return false;
  const modulePerms = permissions[moduleName];
  return Boolean(modulePerms && modulePerms[action]);
}

/**
 * Hides every sidebar nav item (and its matching header/mobile entry,
 * if present) that the current user cannot view. Call this once the
 * DOM and permissions are both ready. Safe to call even if some
 * data-nav values aren't in NAV_TO_MODULE (left visible/untouched).
 */
async function applySidebarPermissions() {
  const permissions = await fetchMyPermissions();

  // If we couldn't confirm permissions at all, don't guess — leave the
  // sidebar as-is. The per-page guard (guardPageAccess) still protects
  // actual page content/data even if the sidebar itself can't be filtered.
  if (!permissions) {
    revealSidebar();
    return;
  }

  document.querySelectorAll('[data-nav]').forEach((navEl) => {
    const navKey = navEl.getAttribute('data-nav');
    const moduleName = NAV_TO_MODULE[navKey];

    // Unmapped nav items (e.g. future modules) are left as-is rather
    // than hidden, so this never silently hides something unintended.
    if (!moduleName) return;

    if (!hasPermission(permissions, moduleName, 'view')) {
      navEl.remove();
    }
  });

  revealSidebar();
}

/**
 * Call at the very top of a restricted page's own script, before any
 * data is fetched or rendered. If the user's role does not have
 * "view" on this module, redirects away immediately.
 *
 * moduleName must be one of the backend PERMISSION_MODULES values
 * (e.g. 'Inventory', 'Billing', 'Reports', 'Settings').
 *
 * Returns true if the caller may proceed, false if a redirect was
 * triggered (callers should stop further execution in that case).
 */
async function guardPageAccess(moduleName) {
  const token = getPermissionsAuthToken();
  if (!token) {
    window.location.href = '../login/login.html';
    return false;
  }

  const permissions = await fetchMyPermissions();

  if (!permissions) {
    // Could not confirm the session/permissions at all — treat as a
    // session problem, not a permissions problem, and send to login.
    window.location.href = '../login/login.html';
    return false;
  }

  if (!hasPermission(permissions, moduleName, 'view')) {
    window.location.href = '../dashboard/dashboard.html';
    return false;
  }

  return true;
}
