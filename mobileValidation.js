/* ============================================================
   MOBILE NUMBER VALIDATION — SHARED UTILITY
   ============================================================
   Centralized, reusable mobile number handling for the entire
   frontend. Include this script (before the page's own script)
   on any page that collects a mobile number.

   Provides:
     - MOBILE_REGEX               : canonical 10-digit pattern
     - isValidMobileNumber(value) : boolean check
     - validateMobileNumber(value, label) : returns an error
         message string, or null if valid (mirrors the backend
         validateMobile() message format so UI and API errors
         read consistently)
     - attachMobileInputGuard(inputEl) : wires an <input> so it
         only ever accepts up to 10 numeric digits, live, while
         the user types or pastes.
   ============================================================ */

const MOBILE_REGEX = /^[0-9]{10}$/;

function isValidMobileNumber(value) {
  return MOBILE_REGEX.test(String(value || '').trim());
}

function validateMobileNumber(value, label = 'Mobile number') {
  const trimmed = String(value || '').trim();
  if (!trimmed) return `${label} is required`;
  if (!MOBILE_REGEX.test(trimmed)) return `${label} must be a valid 10-digit mobile number`;
  return null;
}

function sanitizeMobileDigits(rawValue) {
  return String(rawValue || '').replace(/\D/g, '').slice(0, 10);
}

/**
 * Attaches live input restriction to a mobile number <input>:
 *  - strips any non-digit character as the user types
 *  - hard-caps at 10 digits (typed or pasted)
 *  - trims leading/trailing whitespace on blur
 * Safe to call multiple times on the same element; it will not
 * attach duplicate listeners.
 */
function attachMobileInputGuard(inputEl) {
  if (!inputEl || inputEl.dataset.mobileGuardAttached === 'true') {
    return;
  }

  inputEl.setAttribute('inputmode', 'numeric');
  inputEl.setAttribute('autocomplete', 'tel');
  if (!inputEl.maxLength || inputEl.maxLength > 10 || inputEl.maxLength < 0) {
    inputEl.maxLength = 10;
  }

  inputEl.addEventListener('input', () => {
    const sanitized = sanitizeMobileDigits(inputEl.value);
    if (sanitized !== inputEl.value) {
      inputEl.value = sanitized;
    }
  });

  inputEl.addEventListener('blur', () => {
    inputEl.value = sanitizeMobileDigits(inputEl.value);
  });

  inputEl.addEventListener('paste', (event) => {
    event.preventDefault();
    const pasted = (event.clipboardData || window.clipboardData).getData('text');
    const combined = inputEl.value.slice(0, inputEl.selectionStart)
      + pasted
      + inputEl.value.slice(inputEl.selectionEnd);
    inputEl.value = sanitizeMobileDigits(combined);
  });

  inputEl.dataset.mobileGuardAttached = 'true';
}

/**
 * Convenience helper: finds every element matching the given
 * selector (or a NodeList/array of elements) and attaches the
 * guard to each. Defaults to inputs flagged data-mobile-field.
 */
function attachMobileInputGuardAll(selectorOrElements = '[data-mobile-field]') {
  const elements = typeof selectorOrElements === 'string'
    ? document.querySelectorAll(selectorOrElements)
    : selectorOrElements;

  elements.forEach((el) => attachMobileInputGuard(el));
}
