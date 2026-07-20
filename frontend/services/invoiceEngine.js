/* ============================================================
   INVOICE ENGINE
   ============================================================
   Single source of truth for turning a Bill (+ BusinessProfile +
   PrintSettings + AppSettings) into invoice HTML.

   Scope of this module (Phase 20.1 — foundation, Phase 20.2 —
   Business Information, Phase 20.3 — Invoice Information,
   Phase 20.4 — Customer Information, Phase 20.5 — Product
   Information, Phase 20.6 — Billing Summary, Phase 20.7 —
   Warranty Information, Phase 20.8 — Footer Information,
   Phase 20.9 — A4 Professional Invoice Template, Phase 20.10 —
   A5 Retail Invoice Template, Phase 20.11 — Invoice Template
   Selection):
     - Prepare a standardized invoice data object from existing
       records (Bill, BusinessProfile, PrintSettings, AppSettings).
       No new data is invented; nothing is duplicated into the
       database — this is a read-time projection only.
     - Load Business Information from Settings → Business Profile
       on every render (never cached, never hardcoded) and build a
       professional, self-adjusting invoice header from it.
     - Select and render the active invoice template.
     - Return rendered HTML to the caller (the Billing route),
       which hands it to the existing Printing Engine unchanged.

   Explicitly OUT of scope here, by design:
     - PDF generation. The current system already produces PDFs
       when needed via Electron's printToPDF() in the Printing
       Engine (main.js), triggered only when the configured
       "printer" is a virtual PDF writer. That flow is untouched.
     - Printer selection, print queue, silent printing, print
       preview, print history — all remain the Printing Engine's
       responsibility (main.js / preload.js / billing.js), and are
       not called or duplicated here.
     - Billing calculations, inventory updates, warranty creation,
       customer creation — those remain in the Billing module.
     - Business identity itself — Settings → Business Profile
       remains the single source of truth; the Invoice Engine only
       reads it, never stores a copy or a fallback set of values.
     - Which template to use is never hardcoded here or in Billing.
       Settings → Print Settings → Invoice Template (Phase 20.11) is
       the single source of truth; see resolveTemplate() and
       INVOICE_TEMPLATE_SETTING_VALUES below for the one place that
       mapping lives.

   Template abstraction:
     Three templates exist today — "classic" (the original, paper-
     size-parameterized template via INVOICE_PAPER_CSS, still the
     default for Thermal paper sizes), "a4-professional" (Phase
     20.9, a dedicated commercial-ERP-style A4 layout), and
     "a5-retail" (Phase 20.10, a dedicated compact retail-counter
     A5 layout). All three are registered in INVOICE_TEMPLATES and
     consume the exact same builder functions (buildBusinessHeader,
     buildInvoiceInformation, etc.) — a new template never needs its
     own data logic, only its own markup/CSS. renderInvoice() picks
     between them automatically based on Print Settings → Invoice
     Paper Size (see PAPER_SIZE_DEFAULT_TEMPLATE below), or via an
     explicit templateKey override, without any change to Billing or
     the Printing Engine.
   ============================================================ */

function escapeHtml(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (ch) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;'
  }[ch]));
}

function formatMoney(amount, appSettings) {
  const value = Number(amount) || 0;
  const decimals = typeof appSettings.decimalPlaces === 'number' ? appSettings.decimalPlaces : 2;
  return `${appSettings.currencySymbol}${value.toLocaleString('en-IN', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals
  })}`;
}

const INVOICE_PAPER_CSS = {
  'A4': '@page { size: A4; margin: 16mm; } body { font-size: 13px; }',
  'A5': '@page { size: A5; margin: 10mm; } body { font-size: 12px; }',
  'Thermal 80mm': '@page { size: 80mm auto; margin: 3mm; } body { font-size: 11px; } .invoice-header-grid { display: block; } .business-block { text-align: center; margin-bottom: 8px; }',
  'Thermal 58mm': '@page { size: 58mm auto; margin: 2mm; } body { font-size: 10px; } .invoice-header-grid { display: block; } .business-block { text-align: center; margin-bottom: 8px; }'
};

/* ------------------------------------------------------------
   BUSINESS INFORMATION MODULE (Phase 20.2)
   ------------------------------------------------------------
   Settings → Business Profile is the single source of truth for
   everything shown in the invoice header. This module never
   hardcodes shop information and never caches it — every call
   reads the BusinessProfile document passed in by the caller,
   which the Billing route fetches fresh on every print request
   (getOrCreateSingleton(BusinessProfile) — see server.js).

   buildBusinessHeader() centralizes the "hide empty optional
   fields, never show a blank label" rule so both the standardized
   invoice object (prepareInvoiceData) and the classic template
   apply it identically instead of duplicating the logic.
   ------------------------------------------------------------ */

// A profile is "configured" once it has enough identity to appear
// on a real invoice. Business Name is the one field a shop cannot
// reasonably omit; everything else is optional and hidden when
// blank. getOrCreateSingleton() auto-creates a blank BusinessProfile
// document on first read, so "document exists" alone doesn't mean
// "configured" — this checks the actual content.
function isBusinessProfileConfigured(businessProfile) {
  return Boolean(businessProfile && String(businessProfile.businessName || '').trim());
}

function formatBusinessAddress(businessProfile) {
  const parts = [
    businessProfile.address,
    businessProfile.city,
    businessProfile.state,
    businessProfile.pincode,
    businessProfile.country && businessProfile.country !== 'India' ? businessProfile.country : ''
  ]
    .map((part) => (part || '').trim())
    .filter(Boolean);
  return parts.join(', ');
}

// Builds the set of business fields an invoice header/template should
// render, with every optional field already resolved to either a
// value or null — callers check truthiness and never need to know
// which fields are "optional" themselves. Logo/no-logo fallback is
// also decided here, once, rather than in every template.
function buildBusinessHeader(businessProfile) {
  const hasLogo = Boolean(businessProfile.logoData);

  return {
    businessName: businessProfile.businessName || 'Electronics ERP',
    tagline: businessProfile.tagline || null,
    logo: hasLogo ? businessProfile.logoData : null,
    // When there's no logo, the business name itself becomes the
    // header — never a broken image placeholder.
    showNameAsHeader: !hasLogo,
    address: formatBusinessAddress(businessProfile) || null,
    mobile: businessProfile.mobile || null,
    alternateMobile: businessProfile.alternateMobile || null,
    email: businessProfile.email || null,
    website: businessProfile.website || null,
    gstNumber: businessProfile.gstNumber || null,
    panNumber: businessProfile.panNumber || null
  };
}

/* ------------------------------------------------------------
   INVOICE INFORMATION MODULE (Phase 20.3)
   ------------------------------------------------------------
   Builds the Invoice Metadata block (Invoice Type, Invoice Number,
   Invoice Date/Time, Cashier, Payment Mode, Bill Status) from the
   finalized Bill only. Nothing here is generated or invented:

     - Invoice Number is always the existing bill.billNumber,
       produced once by the Number Series at finalization
       (see generateBillNumber() / server.js) and never
       regenerated here.
     - Invoice Date/Time are always bill.finalizedAt — the moment
       the bill was finalized — never the current system clock.
       This guarantees reprints show the original date/time.
     - Cashier is always bill.salesperson, the authenticated user
       who finalized the bill.
     - Payment Mode and Status are always read from the stored
       Bill, never re-derived.

   This module is intentionally the only place that decides how
   Invoice Metadata is shaped; prepareInvoiceData() below and the
   classic template both consume it rather than each re-deriving
   their own version.
   ------------------------------------------------------------ */

// Registry of supported invoice types. Only 'Tax Invoice' is active
// today; the others are reserved so a future phase can switch on
// the bill's invoice type without changing this shape.
const INVOICE_TYPES = {
  TAX_INVOICE: 'Tax Invoice',
  PROFORMA_INVOICE: 'Proforma Invoice', // Future
  CREDIT_NOTE: 'Credit Note', // Future
  DEBIT_NOTE: 'Debit Note' // Future
};

const BILL_STATUS_VALUES = ['Draft', 'Finalized', 'Cancelled'];

// Maps the Bill's internal status to the label an invoice should
// display. Under the current (non-partial-payment) billing model a
// 'Finalized' bill is a fully paid invoice, so it displays as PAID
// rather than the internal status string.
function resolveInvoiceStatusLabel(billStatus) {
  if (billStatus === 'Finalized') return 'Paid';
  if (billStatus === 'Cancelled') return 'Cancelled';
  if (billStatus === 'Draft') return 'Draft';
  return billStatus || '';
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

// Formats a Date using the application's configured date format
// (Settings → App Settings → Date Format), never a hardcoded
// pattern. Falls back to DD/MM/YYYY if the setting is missing or
// unrecognized, matching the AppSettings schema default.
function formatInvoiceDate(date, appSettings) {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;

  const day = pad2(d.getDate());
  const month = pad2(d.getMonth() + 1);
  const year = d.getFullYear();
  const format = (appSettings && appSettings.dateFormat) || 'DD/MM/YYYY';

  switch (format) {
    case 'MM/DD/YYYY':
      return `${month}/${day}/${year}`;
    case 'YYYY-MM-DD':
      return `${year}-${month}-${day}`;
    case 'DD/MM/YYYY':
    default:
      return `${day}/${month}/${year}`;
  }
}

// Formats the time portion in 12-hour clock with AM/PM, independent
// of dateFormat (which only governs date ordering/separators).
function formatInvoiceTime(date) {
  if (!date) return null;
  const d = new Date(date);
  if (Number.isNaN(d.getTime())) return null;

  let hours = d.getHours();
  const minutes = pad2(d.getMinutes());
  const period = hours >= 12 ? 'PM' : 'AM';
  hours = hours % 12;
  if (hours === 0) hours = 12;

  return `${hours}:${minutes} ${period}`;
}

// Builds the Invoice Information section from the finalized Bill
// only. prepareInvoiceData()/renderInvoice() reject Draft bills
// before this ever runs, so `bill` here is always Finalized or
// Cancelled.
function buildInvoiceInformation(bill, appSettings) {
  const cashierName = (bill.salesperson && bill.salesperson.fullName) || null;
  const paymentModeName = (bill.paymentMode && bill.paymentMode.paymentModeName) || null;
  const status = resolveInvoiceStatusLabel(bill.status);

  // Reprints must show the original finalization date/time — never
  // the current system date/time. finalizedAt is stored once, at
  // finalization, and is never overwritten afterwards.
  const sourceDate = bill.finalizedAt || null;

  return {
    invoiceType: INVOICE_TYPES.TAX_INVOICE,
    invoiceNumber: bill.billNumber || null,
    invoiceDate: formatInvoiceDate(sourceDate, appSettings),
    invoiceTime: formatInvoiceTime(sourceDate),
    // Future-ready fields, left null (never rendered as an empty
    // label) until Employee ID / Branch are implemented elsewhere.
    cashier: {
      name: cashierName,
      employeeId: null,
      branch: null
    },
    paymentMode: paymentModeName,
    status
  };
}

/* ------------------------------------------------------------
   CUSTOMER INFORMATION MODULE (Phase 20.4)
   ------------------------------------------------------------
   Builds the Customer Information block (Name, Mobile, Address,
   GSTIN, Customer Type, Customer Code) for the invoice. Customer
   is never created, modified, or duplicated here — this module
   only projects existing data:

     - Name and Mobile come from the Bill's own snapshot fields
       (bill.customerName / bill.customerMobile), which Billing
       already captures at finalization time for every bill,
       linked or walk-in. Using the Bill snapshot rather than the
       live Customer record is what keeps reprints historically
       accurate: if the customer's name/mobile is edited later in
       the Customer module, old invoices still show what was true
       at the time of sale.
     - Address, GSTIN, Business Name, Customer Type, and Customer
       Code have no equivalent snapshot on the Bill (the schema
       only snapshots name/mobile), so these are read from the
       linked bill.customer record when one is populated. They are
       genuinely "as of now" for older bills — there is nothing
       else to fall back to — and are simply omitted (never shown
       blank) when the customer link is missing or unpopulated.
     - Every field here is optional except Name; a missing value
       is resolved to null so a template only ever checks
       truthiness and never needs to know which fields are
       optional itself (same convention as buildBusinessHeader).
   ------------------------------------------------------------ */

// Joins the parts of a Customer's address into one display line,
// omitting anything blank — mirrors formatBusinessAddress().
function formatCustomerAddress(address) {
  if (!address) return null;
  const parts = [
    address.addressLine1,
    address.addressLine2,
    address.city,
    address.state,
    address.pincode
  ]
    .map((part) => (part || '').trim())
    .filter(Boolean);
  return parts.length ? parts.join(', ') : null;
}

// Builds the Customer Information section for the invoice.
//
// bill.customerName / bill.customerMobile are the Bill's own
// snapshot — always present (even '' for a true walk-in sale with
// no name captured) and always historically accurate, so they are
// the source of truth for Name and Mobile regardless of whether a
// Customer is linked.
//
// bill.customer is the live linked Customer document, populated by
// populateBillQuery() with customerCode, customerName, mobileNumber,
// address, gstNumber, businessName, and customerType. It is used
// only for the fields the Bill doesn't snapshot (Address, GSTIN,
// Customer Type, Customer Code). If the link is missing — no
// customer was selected, or a previously linked customer record no
// longer exists — those optional fields are simply unavailable and
// are omitted rather than the invoice generation failing.
function buildCustomerInformation(bill) {
  const linkedCustomer = bill.customer || null;

  // Per the Bill schema, customerName/customerMobile are always
  // strings (default ''), so this never needs the linked customer
  // as a fallback — the snapshot is guaranteed to exist.
  const name = (bill.customerName || '').trim() || 'Walk-in Customer';
  const mobile = (bill.customerMobile || '').trim() || null;
  const isWalkIn = !linkedCustomer && !(bill.customerMobile || '').trim();

  // A walk-in sale (no linked customer, no captured mobile) has
  // nothing beyond a name to show — per spec, Address/GST/Type/Code
  // are never displayed for a true walk-in, even if a stray value
  // somehow exists, since there is no real customer record behind it.
  if (isWalkIn) {
    return {
      name,
      mobile: null,
      address: null,
      gstNumber: null,
      businessName: null,
      customerType: null,
      customerCode: null,
      isWalkIn: true
    };
  }

  return {
    name,
    mobile,
    address: linkedCustomer ? formatCustomerAddress(linkedCustomer.address) : null,
    gstNumber: (linkedCustomer && linkedCustomer.gstNumber) ? linkedCustomer.gstNumber : null,
    businessName: (linkedCustomer && linkedCustomer.businessName) ? linkedCustomer.businessName : null,
    customerType: (linkedCustomer && linkedCustomer.customerType && linkedCustomer.customerType.customerType) || null,
    customerCode: (linkedCustomer && linkedCustomer.customerCode) ? linkedCustomer.customerCode : null,
    isWalkIn: false
  };
}

/* ------------------------------------------------------------
   PRODUCT INFORMATION MODULE (Phase 20.5)
   ------------------------------------------------------------
   Builds one invoice line per bill item — Product Name, SKU,
   IMEI/Serial Number(s), Quantity, Unit, Unit Price, Discount,
   GST%, and Line Total. The Invoice Engine never recalculates any
   of these; every number is copied as-is from bill.items, which
   Billing already computed and finalized.

   Product Snapshot: bill.items now carries productNameSnapshot /
   skuSnapshot / unitSymbolSnapshot / usesSerialNumberSnapshot /
   usesImeiNumberSnapshot, stamped once by finalizeBillInternal()
   at the moment the bill is finalized (see server.js). This
   module reads the snapshot first, so a later rename/re-SKU/unit
   change in Product Master never affects an already-finalized
   invoice. The live item.product.* fields are used only as a
   fallback for bills finalized before this snapshot existed —
   those bills have no snapshot to fall back to, so this is a
   best-effort compatibility path, not a historical guarantee.
   ------------------------------------------------------------ */
function buildProductInformation(bill) {
  return bill.items.map((item) => {
    const liveProduct = item.product || {};

    const productName = item.productNameSnapshot || liveProduct.productName || '';
    const sku = item.skuSnapshot || liveProduct.sku || null;
    const unit = item.unitSymbolSnapshot || (liveProduct.unit && liveProduct.unit.symbol) || null;

    // Whether this line needs an identifier column is itself part of
    // the snapshot (a product could stop requiring IMEI/Serial after
    // the sale) — falls back to the live product flags only for
    // pre-snapshot bills, same rule as the other snapshot fields.
    const hasSnapshot = Boolean(item.productNameSnapshot);
    const usesSerialNumber = hasSnapshot ? item.usesSerialNumberSnapshot : Boolean(liveProduct.usesSerialNumber);
    const usesImeiNumber = hasSnapshot ? item.usesImeiNumberSnapshot : Boolean(liveProduct.usesImeiNumber);
    const identifierType = usesImeiNumber ? 'IMEI' : (usesSerialNumber ? 'Serial No' : null);

    const identifiers = (item.identifiers || []).map((i) => i.value).filter(Boolean);

    return {
      productName,
      sku: sku || null,
      identifierType,
      identifiers: identifierType ? identifiers : [],
      quantity: item.quantity,
      unit: unit || null,
      unitPrice: item.sellingPrice,
      discount: item.discount || 0,
      // Percentage-based per-product discount is not implemented in
      // Billing yet (Bill only stores a flat discount amount) — this
      // is reserved so a template can branch on it once that exists,
      // without the Invoice Engine inventing a percentage today.
      discountType: 'Amount',
      gstPercentage: item.gstPercentage,
      lineTotal: item.lineTotal
    };
  });
}

/* ------------------------------------------------------------
   BILLING SUMMARY MODULE (Phase 20.6)
   ------------------------------------------------------------
   Builds the financial summary block (Subtotal, Bill Discount,
   Tax, Round Off, Grand Total) shown on the invoice. The
   finalized Bill is the only source of truth: every figure here
   is copied as-is from bill.subtotalAmount / bill.discountAmount /
   bill.taxAmount / bill.roundOff / bill.grandTotal, which Billing
   already computed and locked in at finalization
   (see validateBillBody() / finalizeBillInternal() in server.js).
   This module performs no arithmetic of its own — no GST
   recalculation, no discount recalculation, no grand-total
   recalculation — so a reprint always matches the original bill
   exactly, even if tax rates, prices, or discount policy change
   afterwards.

   Payment reconciliation (Received Amount, Change Returned, Split
   Payment) is intentionally out of scope for this phase: the
   current Bill model does not capture what a customer tendered,
   only the Grand Total itself. Inventing those figures would mean
   the Invoice Engine performing a calculation Billing never made,
   so they are left for a future phase once Billing captures them.
   No receivedAmount / changeReturned / balance fields are added
   here, and the Bill schema is not touched by this phase.

   Tax breakdown (CGST/SGST/IGST) is intentionally a single Tax
   figure today, matching bill.taxAmount, which Billing stores as
   one combined amount per item. buildTaxLines() below is the one
   place a future per-line CGST/SGST/IGST split would be added,
   without changing how the rest of this module or the template
   consumes the summary.

   The Round Off row resolves to null when not applicable, so a
   template checks truthiness once and never needs to know which
   rows are optional itself — same convention as
   buildBusinessHeader() and buildCustomerInformation().
   ------------------------------------------------------------ */

// Future-ready seam for a CGST/SGST/IGST breakdown. Billing currently
// stores one combined tax figure per item (bill.taxAmount), so this
// returns a single "Tax" line. A later phase can expand this to read
// a per-line tax split from the Bill without any other module or the
// template needing to change — they only ever consume taxLines.
function buildTaxLines(bill) {
  return [
    { label: 'Tax', amount: bill.taxAmount || 0 }
  ];
}

// Builds the Billing Summary section for the invoice, in the required
// display order: Subtotal, Bill Discount, Tax, Round Off (optional),
// Grand Total. Every figure is read directly from the finalized Bill;
// nothing is recalculated.
function buildBillingSummary(bill) {
  const hasRoundOff = typeof bill.roundOff === 'number' && bill.roundOff !== 0;

  return {
    subtotal: bill.subtotalAmount || 0,
    discount: bill.discountAmount || 0,
    // discountType mirrors the Amount/Percentage seam already used by
    // buildProductInformation() for per-line discounts — Billing only
    // supports a flat bill-level discount amount today, so this is
    // always 'Amount', but the shape lets a template branch on it
    // without changing once Percentage-based bill discounts exist.
    discountType: 'Amount',
    taxLines: buildTaxLines(bill),
    tax: bill.taxAmount || 0,
    roundOff: hasRoundOff ? bill.roundOff : null,
    grandTotal: bill.grandTotal
  };
}

/* ------------------------------------------------------------
   WARRANTY INFORMATION MODULE (Phase 20.7)
   ------------------------------------------------------------
   Builds one warranty entry per bill item — Warranty Available,
   Period label, Start Date, End Date — for products that were
   covered under warranty at the time of sale. The Invoice Engine
   never creates, extends, or recalculates a warranty; it only
   displays what the Warranty module already recorded during
   Billing finalization (see finalizeBillInternal() / the Warranty
   model in server.js).

   Data source and join:
     - Warranty documents are looked up by bill._id (Warranty.bill),
       the same field finalizeBillInternal() stamps when it creates
       them — the read-side mirror of that write. No dedicated
       /api/warranty read endpoint exists yet (only the Reports
       module queries Warranty directly, the same pattern used
       here), so the print route fetches Warranty records once,
       up front, and passes them in — the same shape as
       businessProfile/printSettings/appSettings.
     - For non-serialized products, Billing creates exactly one
       Warranty per (product, bill) with productIdentifier: null.
     - For serialized products (Serial Number / IMEI), Billing
       creates one Warranty per (product, productIdentifier, bill)
       — so a single bill line covering 3 units has 3 separate
       Warranty documents, one per physical unit. This module joins
       each bill item's identifiers (item.identifiers[].productIdentifier,
       an ObjectId) back to the matching Warranty by that same
       productIdentifier field, so warranty is always attributed to
       the correct physical device rather than just the product line.
     - A product with no matching Warranty document is simply not
       under warranty for this sale (Billing only creates a Warranty
       when the Product had warrantyAvailable + warrantyDuration set
       at finalization time) and is reported as such — never left
       blank, never guessed.

   Historical accuracy: warrantyStart/warrantyEnd are read verbatim
   from the stored Warranty document, exactly as finalizeBillInternal()
   computed them once, at finalization. The human-readable period
   label (e.g. "12 Months") is derived from that fixed, already-
   stored date range — never from the live Product's current
   warrantyDuration/warrantyUnit, which could have been edited since
   the sale. This is what keeps a reprint identical even if the
   product's warranty policy changes later, per the Reprint Rule.
   ------------------------------------------------------------ */

const MS_PER_DAY = 24 * 60 * 60 * 1000;

// Turns a fixed (start, end) date range into a human-readable period
// label, e.g. "12 Months", "30 Days", "2 Years". This is a display
// formatting step over dates Billing already fixed at finalization —
// not a warranty calculation — so it can never disagree with the
// dates printed alongside it, and never depends on the live Product.
function formatWarrantyPeriodLabel(warrantyStart, warrantyEnd) {
  const start = new Date(warrantyStart);
  const end = new Date(warrantyEnd);
  if (Number.isNaN(start.getTime()) || Number.isNaN(end.getTime()) || end <= start) {
    return null;
  }

  // Whole-years / whole-months are detected by comparing calendar
  // fields on the same day-of-month, which is how finalizeBillInternal()
  // originally built these dates (setFullYear/setMonth from a fixed
  // start) — so a 12-month warranty round-trips back to "12 Months"
  // rather than an approximate day count.
  const sameDayOfMonth = start.getDate() === end.getDate();

  if (sameDayOfMonth) {
    const yearDiff = end.getFullYear() - start.getFullYear();
    const monthDiff = yearDiff * 12 + (end.getMonth() - start.getMonth());

    // Matches the spec's own example ("Warranty : 12 Months") rather
    // than collapsing a 1-year warranty straight to "1 Year" — Months
    // is used up to a full year, Years only once the span is at least
    // 2 full years (e.g. 24 → "2 Years"), which is how Product Master
    // itself lets a shop configure warranty duration (Days/Months/Years
    // as an explicit unit choice) rather than an arbitrary cutoff.
    if (monthDiff > 0 && monthDiff % 12 === 0 && monthDiff >= 24) {
      const years = monthDiff / 12;
      return `${years} Years`;
    }
    if (monthDiff > 0) {
      return `${monthDiff} Month${monthDiff === 1 ? '' : 's'}`;
    }
  }

  const dayDiff = Math.round((end.getTime() - start.getTime()) / MS_PER_DAY);
  return `${dayDiff} Day${dayDiff === 1 ? '' : 's'}`;
}

// Formats a warranty date using the same App Settings date format as
// the rest of the invoice (Settings → App Settings → Date Format),
// so Start/End Date read consistently with Invoice Date elsewhere on
// the page. Reuses formatInvoiceDate() rather than duplicating date
// formatting logic.
function formatWarrantyDate(date, appSettings) {
  return formatInvoiceDate(date, appSettings);
}

// Indexes Warranty documents for fast lookup while walking bill
// items: by product for non-serialized lines (productIdentifier is
// null), and by productIdentifier for serialized lines. Only Active
// warranties for this bill are considered — a Reversed warranty (bill
// cancellation) is not "available" and is treated the same as no
// warranty existing, matching how Billing itself treats a cancelled
// bill's warranty as void.
function indexWarranties(warranties) {
  const byProduct = new Map();
  const byIdentifier = new Map();

  (warranties || []).forEach((warranty) => {
    if (warranty.status !== 'Active') return;

    if (warranty.productIdentifier) {
      byIdentifier.set(String(warranty.productIdentifier), warranty);
    } else {
      byProduct.set(String(warranty.product), warranty);
    }
  });

  return { byProduct, byIdentifier };
}

// Builds the Warranty Information section for the invoice: one entry
// per bill item, each resolved to either a real warranty (from the
// Warranty module) or an explicit non-warranty / unavailable status.
// Nothing is left blank and nothing is invented.
//
// warranties: the Warranty documents for this bill (Warranty.bill ===
// bill._id), fetched once by the caller (the Billing print route) and
// passed in — this module performs no database access itself.
function buildWarrantyInformation(bill, warranties, appSettings) {
  const { byProduct, byIdentifier } = indexWarranties(warranties);

  return bill.items.map((item) => {
    const liveProduct = item.product || {};
    const productName = item.productNameSnapshot || liveProduct.productName || '';

    // Whether this line is even warranty-eligible is a Product-level
    // flag; Billing only creates a Warranty document when it was true
    // at finalization, so a missing Warranty here reliably means
    // "no warranty" rather than "data not loaded yet" (see
    // finalizeBillInternal(), which gates Warranty.create() on
    // product.warrantyAvailable && product.warrantyDuration).
    const itemIdentifiers = item.identifiers || [];

    if (itemIdentifiers.length > 0) {
      // Serialized line: one warranty entry per physical unit,
      // matched by ProductIdentifier — never by array position —
      // so warranty always tracks the correct device even if
      // identifiers were selected out of order.
      const units = itemIdentifiers.map((identifier) => {
        const warranty = identifier.productIdentifier
          ? byIdentifier.get(String(identifier.productIdentifier))
          : null;

        if (!warranty) {
          // A serialized, warranty-eligible product with no Warranty
          // record at all (rather than a deliberate "not covered") is
          // a data gap, not a normal non-warranty sale — flagged
          // distinctly per the Error Handling requirement, without
          // failing invoice generation. warrantyAvailable has no
          // bill-item snapshot, so eligibility is read from the live
          // Product — used only to pick the message shown, never to
          // invent a warranty date.
          return {
            identifierValue: identifier.value,
            available: false,
            unavailable: Boolean(liveProduct.warrantyAvailable),
            period: null,
            startDate: null,
            endDate: null
          };
        }

        return {
          identifierValue: identifier.value,
          available: true,
          unavailable: false,
          period: formatWarrantyPeriodLabel(warranty.warrantyStart, warranty.warrantyEnd),
          startDate: formatWarrantyDate(warranty.warrantyStart, appSettings),
          endDate: formatWarrantyDate(warranty.warrantyEnd, appSettings)
        };
      });

      return {
        productName,
        hasIdentifiers: true,
        available: units.some((u) => u.available),
        units
      };
    }

    // Non-serialized line: single warranty entry keyed by product.
    const warranty = byProduct.get(String(item.product && item.product._id ? item.product._id : item.product));

    if (!warranty) {
      // warrantyAvailable has no bill-item snapshot (only identifier
      // usage does — see buildProductInformation()), so eligibility
      // is read from the live Product. This only affects which of the
      // two "no warranty" messages is shown (see DISPLAY below) — it
      // never invents warranty dates.
      return {
        productName,
        hasIdentifiers: false,
        available: false,
        unavailable: Boolean(liveProduct.warrantyAvailable),
        period: null,
        startDate: null,
        endDate: null
      };
    }

    return {
      productName,
      hasIdentifiers: false,
      available: true,
      period: formatWarrantyPeriodLabel(warranty.warrantyStart, warranty.warrantyEnd),
      startDate: formatWarrantyDate(warranty.warrantyStart, appSettings),
      endDate: formatWarrantyDate(warranty.warrantyEnd, appSettings)
    };
  });
}

/* ------------------------------------------------------------
   FOOTER INFORMATION MODULE (Phase 20.8)
   ------------------------------------------------------------
   Builds the invoice's Footer Message, Terms & Conditions, and
   Notes. Print Settings (Settings \u2192 Print Settings) is the
   single source of truth for all three — this module never
   invents, hardcodes, or duplicates footer text of its own; it
   only shapes what Print Settings / the Bill already hold into a
   render-ready object, exactly like every other module above.

   Historical accuracy (Reprint Rule) is handled per field:
     - Footer Message and Terms & Conditions must stay exactly as
       they were at the moment a bill was finalized, even if Print
       Settings are edited afterwards — so these two are read from
       bill.footerSnapshot (stamped once, in finalizeBillInternal(),
       see server.js) whenever a snapshot exists. Bills finalized
       before the Footer Snapshot existed (footerSnapshot.captured
       is false) fall back to the live Print Settings for those two
       fields only, so old bills still print a footer instead of a
       blank one.
     - Notes is an internal, optional note and is intentionally NOT
       snapshotted (see PrintSettings.notes in server.js) — it is
       always read live from Print Settings, the same way
       headerMessage already is elsewhere in this file.

   Dynamic visibility: each field resolves to either a populated
   value or null/[] — never a placeholder heading with nothing
   under it. The template (or any future one) checks these via
   simple truthiness, the same convention already used for
   Round Off, the Header Message, and the Warranty block.

   Future-ready by design: Return Policy, Exchange Policy, QR Code,
   Website, Social Media, Digital Warranty Link, etc. are NOT
   implemented here. Each would become one more resolved field on
   the object this module returns, without changing the shape of
   footerMessage/terms/notes or anything that already consumes them.
   ------------------------------------------------------------ */

// Resolves Footer Message + Terms & Conditions from the Bill's Footer
// Snapshot when one exists, otherwise falls back to the live Print
// Settings singleton (pre-Phase-20.8 bills only). Notes has no snapshot
// concept and always comes from the live printSettings passed in.
function buildFooterInformation(bill, printSettings) {
  const snapshot = bill && bill.footerSnapshot && bill.footerSnapshot.captured
    ? bill.footerSnapshot
    : null;

  const footerMessage = (snapshot ? snapshot.footerMessage : (printSettings && printSettings.footerMessage)) || '';
  const rawTerms = snapshot
    ? snapshot.termsAndConditions
    : (printSettings && printSettings.termsAndConditions);
  const terms = Array.isArray(rawTerms) ? rawTerms.filter((line) => Boolean(line && String(line).trim())) : [];
  const notes = (printSettings && printSettings.notes) || '';

  return {
    footerMessage: footerMessage.trim(),
    terms,
    notes: notes.trim(),
    // Convenience flags so a template can hide a heading in one check
    // rather than re-deriving "is this section empty" itself.
    hasFooterMessage: Boolean(footerMessage.trim()),
    hasTerms: terms.length > 0,
    hasNotes: Boolean(notes.trim())
  };
}

/* ------------------------------------------------------------
   STANDARDIZED INVOICE DATA MODEL
   ------------------------------------------------------------
   Projects the existing Bill / BusinessProfile / PrintSettings /
   AppSettings records into one shape, grouped by section. This is
   the object future templates should render from. Money fields
   are kept as raw numbers here (not pre-formatted) so a template
   can format them however it needs; the classic template below
   formats at render time via formatMoney().
   ------------------------------------------------------------ */
function prepareInvoiceData(bill, businessProfile, printSettings, appSettings, warranties = []) {
  if (!bill) {
    throw Object.assign(new Error('Cannot prepare invoice data: bill is required'), { code: 'INVOICE_MISSING_BILL' });
  }
  if (!BILL_STATUS_VALUES.includes(bill.status)) {
    throw Object.assign(new Error('Cannot prepare invoice data: bill has an invalid status'), { code: 'INVOICE_INVALID_STATUS' });
  }
  if (bill.status === 'Draft') {
    throw Object.assign(new Error('Draft bills cannot generate an official invoice. Finalize the bill first.'), { code: 'INVOICE_BILL_NOT_FINALIZED' });
  }
  if (!bill.billNumber) {
    throw Object.assign(new Error('Cannot prepare invoice data: bill is missing an invoice number'), { code: 'INVOICE_MISSING_INVOICE_NUMBER' });
  }
  if (!Array.isArray(bill.items) || bill.items.length === 0) {
    throw Object.assign(new Error('Cannot prepare invoice data: bill has no products'), { code: 'INVOICE_MISSING_PRODUCTS' });
  }
  if (!isBusinessProfileConfigured(businessProfile)) {
    throw Object.assign(new Error('Business Profile is not configured. Add your Business Name in Settings \u2192 Business Profile before printing invoices.'), { code: 'INVOICE_BUSINESS_PROFILE_NOT_CONFIGURED' });
  }
  if (!bill.paymentMode) {
    throw Object.assign(new Error('Cannot prepare invoice data: bill is missing a payment mode'), { code: 'INVOICE_MISSING_PAYMENT_MODE' });
  }
  if (typeof bill.grandTotal !== 'number' || Number.isNaN(bill.grandTotal)) {
    throw Object.assign(new Error('Cannot prepare invoice data: bill is missing a Grand Total'), { code: 'INVOICE_MISSING_GRAND_TOTAL' });
  }
  if (typeof bill.taxAmount !== 'number' || Number.isNaN(bill.taxAmount)) {
    throw Object.assign(new Error('Cannot prepare invoice data: bill is missing Tax information'), { code: 'INVOICE_MISSING_TAX' });
  }

  return {
    business: buildBusinessHeader(businessProfile),
    invoice: buildInvoiceInformation(bill, appSettings),
    customer: buildCustomerInformation(bill),
    products: buildProductInformation(bill),
    summary: buildBillingSummary(bill),
    warranty: buildWarrantyInformation(bill, warranties, appSettings),
    footer: {
      headerMessage: printSettings.headerMessage || '',
      ...buildFooterInformation(bill, printSettings)
    },
    meta: {
      paperSize: printSettings.invoicePaperSize,
      currencySymbol: appSettings.currencySymbol,
      decimalPlaces: typeof appSettings.decimalPlaces === 'number' ? appSettings.decimalPlaces : 2
    }
  };
}

/* ------------------------------------------------------------
   TEMPLATE: classic
   ------------------------------------------------------------
   This is the exact markup/CSS already in production
   (previously the inline renderInvoiceHtml in server.js),
   unchanged. It renders directly from (bill, businessProfile,
   printSettings, appSettings) rather than the standardized
   invoice object above, so today's output is byte-for-byte
   identical to before this extraction.
   ------------------------------------------------------------ */
function renderClassicTemplate(bill, businessProfile, printSettings, appSettings, logger, warranties = []) {
  let paperCss = INVOICE_PAPER_CSS[printSettings.invoicePaperSize];
  if (!paperCss) {
    if (logger) {
      logger.warn(`Print Settings: invoicePaperSize "${printSettings.invoicePaperSize}" is missing or invalid — falling back to A4 for this print job`);
    }
    paperCss = INVOICE_PAPER_CSS['A4'];
  }
  const money = (amount) => formatMoney(amount, appSettings);
  const business = buildBusinessHeader(businessProfile);
  const invoiceInfo = buildInvoiceInformation(bill, appSettings);

  const productLines = buildProductInformation(bill);
  const itemRows = productLines.map((line, index) => {
    const identifiersText = line.identifiers.map((value) => escapeHtml(value)).join(', ');
    const skuText = line.sku ? `SKU: ${escapeHtml(line.sku)}` : '';
    const identifierLabelText = identifiersText ? `${escapeHtml(line.identifierType)}: ${identifiersText}` : '';

    return `
      <tr>
        <td>${index + 1}</td>
        <td>
          ${escapeHtml(line.productName)}
          ${skuText ? `<div class="item-identifiers">${skuText}</div>` : ''}
          ${identifierLabelText ? `<div class="item-identifiers">${identifierLabelText}</div>` : ''}
        </td>
        <td class="num">${line.quantity}</td>
        <td>${line.unit ? escapeHtml(line.unit) : ''}</td>
        <td class="num">${money(line.unitPrice)}</td>
        <td class="num">${money(line.discount)}</td>
        <td class="num">${line.gstPercentage}%</td>
        <td class="num">${money(line.lineTotal)}</td>
      </tr>`;
  }).join('');

  const warrantyInfo = buildWarrantyInformation(bill, warranties, appSettings);
  const footerInfo = buildFooterInformation(bill, printSettings);

  // Warranty Information (Phase 20.7) — one row per warranty-eligible
  // unit. Products/units with no warranty are omitted entirely (per
  // "Products without warranty should not show empty warranty
  // fields"); a data-gap case (eligible but no Warranty record) still
  // gets an explicit "Not Available" row rather than being silently
  // dropped, per the Error Handling requirement. The whole section is
  // omitted when nothing on this bill has warranty at all.
  const warrantyRowLines = [];
  warrantyInfo.forEach((entry) => {
    if (entry.hasIdentifiers) {
      entry.units.forEach((unit) => {
        if (!unit.available && !unit.unavailable) return; // no warranty for this unit — omit, don't show "No Warranty" per-unit noise
        warrantyRowLines.push({
          productName: entry.productName,
          identifierValue: unit.identifierValue,
          available: unit.available,
          period: unit.period,
          startDate: unit.startDate,
          endDate: unit.endDate
        });
      });
    } else if (entry.available || entry.unavailable) {
      warrantyRowLines.push({
        productName: entry.productName,
        identifierValue: null,
        available: entry.available,
        period: entry.period,
        startDate: entry.startDate,
        endDate: entry.endDate
      });
    }
  });

  const warrantyRows = warrantyRowLines.map((row) => {
    const identifierText = row.identifierValue ? `<div class="warranty-identifier">${escapeHtml(row.identifierValue)}</div>` : '';
    const detailText = row.available
      ? `Warranty : <strong>${escapeHtml(row.period || '')}</strong>${row.startDate ? ` &nbsp;·&nbsp; Start : <strong>${escapeHtml(row.startDate)}</strong>` : ''}${row.endDate ? ` &nbsp;·&nbsp; End : <strong>${escapeHtml(row.endDate)}</strong>` : ''}`
      : 'Warranty : <strong>Not Available</strong>';

    return `
      <div class="warranty-row">
        <div class="warranty-product">${escapeHtml(row.productName)}</div>
        ${identifierText}
        <div class="warranty-detail">${detailText}</div>
      </div>`;
  }).join('');

  const customerInfo = buildCustomerInformation(bill);
  const billingSummary = buildBillingSummary(bill);
  const customerLines = customerInfo.isWalkIn
    ? [escapeHtml(customerInfo.name)]
    : [
        [
          escapeHtml(customerInfo.name),
          customerInfo.mobile ? escapeHtml(customerInfo.mobile) : ''
        ].filter(Boolean).join(' &nbsp;·&nbsp; '),
        customerInfo.businessName ? escapeHtml(customerInfo.businessName) : '',
        customerInfo.address ? escapeHtml(customerInfo.address) : '',
        customerInfo.gstNumber ? `GSTIN: ${escapeHtml(customerInfo.gstNumber)}` : '',
        customerInfo.customerType ? escapeHtml(customerInfo.customerType) : '',
        customerInfo.customerCode ? `Code: ${escapeHtml(customerInfo.customerCode)}` : ''
      ].filter(Boolean);

  // Business header — every line is optional and only renders when the
  // underlying Business Profile field is present, per Phase 20.2. Phone
  // numbers are joined onto one line rather than each getting their own
  // row, so the header stays compact when both are set.
  const phoneLine = [
    business.mobile ? `Mobile: ${escapeHtml(business.mobile)}` : '',
    business.alternateMobile ? `Alt: ${escapeHtml(business.alternateMobile)}` : ''
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');

  const businessMetaLines = [
    business.address ? escapeHtml(business.address) : '',
    phoneLine,
    business.email ? `Email: ${escapeHtml(business.email)}` : '',
    business.website ? escapeHtml(business.website) : '',
    business.gstNumber ? `GSTIN: ${escapeHtml(business.gstNumber)}` : '',
    business.panNumber ? `PAN: ${escapeHtml(business.panNumber)}` : ''
  ].filter(Boolean);

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body { font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif; color: #1a1d1f; }
  .business-block { display: flex; align-items: center; gap: 12px; }
  .business-logo { max-width: 64px; max-height: 64px; width: auto; height: auto; object-fit: contain; }
  .business-name { font-size: 16px; font-weight: 700; }
  .business-tagline { font-size: 11px; font-style: italic; color: #667085; margin-top: 1px; }
  .business-meta { font-size: 11px; color: #475467; line-height: 1.5; margin-top: 2px; }
  .invoice-header-grid { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 14px; padding-bottom: 12px; border-bottom: 1px solid #e5e7eb; }
  .invoice-meta { text-align: right; font-size: 11.5px; color: #475467; }
  .invoice-meta strong { color: #1a1d1f; }
  .header-message { font-size: 11.5px; color: #475467; margin-bottom: 10px; }
  .customer-line { font-size: 12px; margin-bottom: 12px; }
  .customer-meta { font-size: 11px; color: #667085; line-height: 1.5; margin-top: 2px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 14px; }
  th, td { text-align: left; padding: 6px 8px; font-size: 11.5px; border-bottom: 1px solid #e5e7eb; }
  th { background-color: #f9fafb; font-weight: 600; text-transform: uppercase; font-size: 10px; color: #475467; }
  td.num, th.num { text-align: right; }
  .item-identifiers { font-size: 10px; color: #667085; margin-top: 2px; }
  .totals-block { margin-left: auto; width: 240px; }
  .totals-line { display: flex; justify-content: space-between; font-size: 12px; padding: 3px 0; }
  .totals-grand { font-size: 14px; font-weight: 700; border-top: 1px solid #1a1d1f; margin-top: 4px; padding-top: 6px; }
  .footer-message { text-align: center; font-size: 11px; color: #475467; margin-top: 20px; padding-top: 10px; border-top: 1px solid #e5e7eb; }
  .warranty-block { margin-top: 16px; padding-top: 10px; border-top: 1px solid #e5e7eb; }
  .warranty-heading { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: #475467; margin-bottom: 6px; }
  .warranty-row { font-size: 11.5px; padding: 4px 0; border-bottom: 1px dashed #e5e7eb; }
  .warranty-row:last-child { border-bottom: none; }
  .warranty-product { font-weight: 600; }
  .warranty-identifier { font-size: 10.5px; color: #667085; }
  .warranty-detail { color: #344054; margin-top: 1px; }
  .terms-block { margin-top: 16px; padding-top: 10px; border-top: 1px solid #e5e7eb; }
  .terms-heading { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: #475467; margin-bottom: 6px; }
  .terms-list { margin: 0; padding-left: 16px; font-size: 10.5px; color: #475467; line-height: 1.6; }
  .terms-list li { margin-bottom: 2px; }
  .notes-block { margin-top: 16px; padding-top: 10px; border-top: 1px solid #e5e7eb; }
  .notes-heading { font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.03em; color: #475467; margin-bottom: 6px; }
  .notes-list { margin: 0; padding-left: 16px; font-size: 10.5px; color: #475467; line-height: 1.6; }
  ${paperCss}
</style>
</head>
<body>
  <div class="invoice-header-grid">
    <div class="business-block">
      ${business.logo ? `<img class="business-logo" src="${escapeHtml(business.logo)}" />` : ''}
      <div>
        <div class="business-name">${escapeHtml(business.businessName)}</div>
        ${business.tagline ? `<div class="business-tagline">${escapeHtml(business.tagline)}</div>` : ''}
        ${businessMetaLines.length ? `<div class="business-meta">${businessMetaLines.join('<br/>')}</div>` : ''}
      </div>
    </div>
    <div class="invoice-meta">
      <div class="invoice-type">${escapeHtml(invoiceInfo.invoiceType.toUpperCase())}</div>
      <div>Invoice No. : <strong>${escapeHtml(invoiceInfo.invoiceNumber || '')}</strong></div>
      ${invoiceInfo.invoiceDate ? `<div>Invoice Date : <strong>${escapeHtml(invoiceInfo.invoiceDate)}</strong></div>` : ''}
      ${invoiceInfo.invoiceTime ? `<div>Invoice Time : <strong>${escapeHtml(invoiceInfo.invoiceTime)}</strong></div>` : ''}
      ${invoiceInfo.cashier.name ? `<div>Cashier : <strong>${escapeHtml(invoiceInfo.cashier.name)}</strong></div>` : ''}
      ${invoiceInfo.paymentMode ? `<div>Payment Mode : <strong>${escapeHtml(invoiceInfo.paymentMode)}</strong></div>` : ''}
      <div>Status : <strong>${escapeHtml(invoiceInfo.status.toUpperCase())}</strong></div>
    </div>
  </div>

  ${printSettings.headerMessage ? `<div class="header-message">${escapeHtml(printSettings.headerMessage)}</div>` : ''}

  <div class="customer-line">
    <strong>Customer:</strong> ${customerLines[0]}
    ${customerLines.length > 1 ? `<div class="customer-meta">${customerLines.slice(1).join('<br/>')}</div>` : ''}
  </div>

  <table>
    <thead>
      <tr>
        <th>#</th>
        <th>Item</th>
        <th class="num">Qty</th>
        <th>Unit</th>
        <th class="num">Price</th>
        <th class="num">Discount</th>
        <th class="num">GST</th>
        <th class="num">Total</th>
      </tr>
    </thead>
    <tbody>
      ${itemRows}
    </tbody>
  </table>

  <div class="totals-block">
    <div class="totals-line"><span>Subtotal</span><span>${money(billingSummary.subtotal)}</span></div>
    <div class="totals-line"><span>Discount</span><span>${money(billingSummary.discount)}</span></div>
    ${billingSummary.taxLines.map((line) => `<div class="totals-line"><span>${escapeHtml(line.label)}</span><span>${money(line.amount)}</span></div>`).join('')}
    ${billingSummary.roundOff !== null ? `<div class="totals-line"><span>Round Off</span><span>${money(billingSummary.roundOff)}</span></div>` : ''}
    <div class="totals-line totals-grand"><span>Grand Total</span><span>${money(billingSummary.grandTotal)}</span></div>
  </div>

  ${warrantyRows ? `<div class="warranty-block"><div class="warranty-heading">Warranty Information</div>${warrantyRows}</div>` : ''}

  ${footerInfo.hasTerms ? `<div class="terms-block"><div class="terms-heading">Terms &amp; Conditions</div><ol class="terms-list">${footerInfo.terms.map((term) => `<li>${escapeHtml(term)}</li>`).join('')}</ol></div>` : ''}

  ${footerInfo.hasFooterMessage ? `<div class="footer-message">${escapeHtml(footerInfo.footerMessage)}</div>` : ''}

  ${footerInfo.hasNotes ? `<div class="notes-block"><div class="notes-heading">Notes</div><ul class="notes-list"><li>${escapeHtml(footerInfo.notes)}</li></ul></div>` : ''}
</body>
</html>`;
}

/* ------------------------------------------------------------
   TEMPLATE: a4-professional (Phase 20.9)
   ------------------------------------------------------------
   A production-ready, print-optimized A4 invoice aimed at the
   same commercial-ERP look as Tally/Busy/Marg-style GST invoices
   (clean corporate header, bordered sections, grayscale-only
   design). Visual presentation only — every figure and every
   optional-field decision below is read from the same builder
   functions the classic template already uses (buildBusinessHeader,
   buildInvoiceInformation, buildCustomerInformation,
   buildProductInformation, buildBillingSummary,
   buildWarrantyInformation, buildFooterInformation). Nothing here
   recalculates, re-derives, or duplicates Billing logic — this
   function only arranges already-resolved data into A4-appropriate
   markup and CSS.

   Multi-page handling: `thead { display: table-header-group }` is
   the standard, browser/Chromium-native way to make an HTML table
   repeat its header row on every printed page — no per-page
   JavaScript pagination is used or needed. `tr { page-break-inside:
   avoid }` stops a single product row from splitting across a page
   boundary. `.summary-block` and `.signature-block` each get
   `page-break-inside: avoid` so the Billing Summary and the
   signature lines are never separated across a page break; the
   whole invoice is left to flow across as many pages as the
   product table needs otherwise (a 30+ line bill spans multiple
   pages, per the Testing section of the spec).

   Warranty section is filtered down to only entries that actually
   have warranty coverage (Testing: "Appears only when applicable")
   — this template does not show the "Not Available" data-gap rows
   the classic/thermal template shows, since a formal A4 tax
   invoice for accounting/warranty-claim purposes should not list
   products that were never warranty-eligible in the first place.
   ------------------------------------------------------------ */
function renderA4ProfessionalTemplate(bill, businessProfile, printSettings, appSettings, logger, warranties = []) {
  const money = (amount) => formatMoney(amount, appSettings);

  const business = buildBusinessHeader(businessProfile);
  const invoiceInfo = buildInvoiceInformation(bill, appSettings);
  const customerInfo = buildCustomerInformation(bill);
  const productLines = buildProductInformation(bill);
  const billingSummary = buildBillingSummary(bill);
  const warrantyInfo = buildWarrantyInformation(bill, warranties, appSettings);
  const footerInfo = buildFooterInformation(bill, printSettings);

  // Column layout adapts to whether ANY line on this bill carries an
  // IMEI/Serial Number — per the spec's table spec ("| # | Product |
  // SKU | IMEI / Serial | Qty | Unit Price | Discount | GST | Total |"),
  // this column exists at the table level, not hidden/shown per row,
  // so every row must share the same column count.
  const anyLineHasIdentifiers = productLines.some((line) => line.identifierType && line.identifiers.length > 0);

  const itemRows = productLines.map((line, index) => {
    const identifierCell = anyLineHasIdentifiers
      ? `<td class="cell-identifier">${line.identifiers.length
          ? line.identifiers.map((value) => escapeHtml(value)).join('<br/>')
          : '—'}</td>`
      : '';

    return `
      <tr>
        <td class="cell-index">${index + 1}</td>
        <td class="cell-product">${escapeHtml(line.productName)}</td>
        <td class="cell-sku">${line.sku ? escapeHtml(line.sku) : '—'}</td>
        ${identifierCell}
        <td class="cell-num">${line.quantity}${line.unit ? ` ${escapeHtml(line.unit)}` : ''}</td>
        <td class="cell-num">${money(line.unitPrice)}</td>
        <td class="cell-num">${line.discount ? money(line.discount) : '—'}</td>
        <td class="cell-num">${line.gstPercentage}%</td>
        <td class="cell-num cell-line-total">${money(line.lineTotal)}</td>
      </tr>`;
  }).join('');

  // Warranty Information — shown only for lines that actually have
  // coverage (spec: "Do not display a Warranty section if no product
  // has warranty"), one row per physical unit for serialized products,
  // one row per line for non-serialized ones. Data-gap
  // ("unavailable but should have had warranty") rows are intentionally
  // omitted here — this is a customer-facing legal document, not an
  // internal exceptions list.
  const warrantyRowLines = [];
  warrantyInfo.forEach((entry) => {
    if (entry.hasIdentifiers) {
      entry.units.forEach((unit) => {
        if (!unit.available) return;
        warrantyRowLines.push({
          productName: entry.productName,
          identifierValue: unit.identifierValue,
          period: unit.period,
          startDate: unit.startDate,
          endDate: unit.endDate
        });
      });
    } else if (entry.available) {
      warrantyRowLines.push({
        productName: entry.productName,
        identifierValue: null,
        period: entry.period,
        startDate: entry.startDate,
        endDate: entry.endDate
      });
    }
  });

  const warrantyRows = warrantyRowLines.map((row) => `
    <tr>
      <td class="cell-product">${escapeHtml(row.productName)}</td>
      <td>${row.identifierValue ? escapeHtml(row.identifierValue) : '—'}</td>
      <td>${escapeHtml(row.period || '')}</td>
      <td>${row.startDate ? escapeHtml(row.startDate) : '—'}</td>
      <td>${row.endDate ? escapeHtml(row.endDate) : '—'}</td>
    </tr>`).join('');

  // Business header meta lines — same optional-field rules as the
  // classic template (buildBusinessHeader already resolved each field
  // to a value or null), formatted as a professional label/value list
  // rather than a single joined line, to match the "Tally-style"
  // structured header the spec asks for.
  const businessMetaRows = [
    business.address ? `<div class="biz-line">${escapeHtml(business.address)}</div>` : '',
    (business.mobile || business.alternateMobile)
      ? `<div class="biz-line">Mobile: ${[business.mobile, business.alternateMobile].filter(Boolean).map(escapeHtml).join(', ')}</div>`
      : '',
    business.email ? `<div class="biz-line">Email: ${escapeHtml(business.email)}</div>` : '',
    business.gstNumber ? `<div class="biz-line">GSTIN: ${escapeHtml(business.gstNumber)}</div>` : '',
    business.panNumber ? `<div class="biz-line">PAN: ${escapeHtml(business.panNumber)}</div>` : ''
  ].filter(Boolean).join('');

  const customerRows = customerInfo.isWalkIn
    ? `<div class="cust-line"><strong>${escapeHtml(customerInfo.name)}</strong></div>`
    : [
        `<div class="cust-line"><strong>${escapeHtml(customerInfo.name)}</strong></div>`,
        customerInfo.mobile ? `<div class="cust-line">Mobile: ${escapeHtml(customerInfo.mobile)}</div>` : '',
        customerInfo.businessName ? `<div class="cust-line">${escapeHtml(customerInfo.businessName)}</div>` : '',
        customerInfo.address ? `<div class="cust-line">${escapeHtml(customerInfo.address)}</div>` : '',
        customerInfo.gstNumber ? `<div class="cust-line">GSTIN: ${escapeHtml(customerInfo.gstNumber)}</div>` : ''
      ].filter(Boolean).join('');

  const identifierHeaderCell = anyLineHasIdentifiers ? '<th class="cell-identifier">IMEI / Serial</th>' : '';

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: A4; margin: 18mm 16mm; }

  /* Palette: ink text, deep-indigo accent (reads as a ledger/cheque
     tone rather than generic corporate blue), slate for secondary
     labels, a single hairline gray for rules. Everything still
     resolves to pure grayscale-safe values when printed on a mono
     printer, per the Print Optimization rule. */
  body {
    font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
    color: #1f2933;
    font-size: 10pt;
    line-height: 1.45;
  }

  * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    color-adjust: exact;
  }

  /* @page margin (18mm 16mm) already reserves this space correctly at
     actual print/PDF time — that must stay untouched. But the in-app
     Invoice Preview panel renders this same HTML inside a plain
     browser frame, where @page margins have no visual effect until
     print is actually triggered, so without this the preview shows
     content flush to the frame edges. This padding exists only for
     that on-screen case and is removed for the real print/PDF pass
     so the two margins never stack. */
  .invoice-sheet { width: 100%; padding: 18mm 16mm; }
  @media print {
    .invoice-sheet { padding: 0; }
  }
  .doc-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 14px;
    margin-bottom: 16px;
    border-bottom: 2.5px solid #2b3a55;
  }
  .biz-block { display: flex; gap: 14px; align-items: flex-start; max-width: 60%; }
  .biz-logo { width: 52px; height: 52px; object-fit: contain; flex-shrink: 0; }
  .biz-name {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 18pt;
    font-weight: 700;
    color: #1f2933;
    letter-spacing: 0.2px;
  }
  .biz-tagline { font-family: Georgia, 'Times New Roman', serif; font-size: 9pt; font-style: italic; color: #64748b; margin-top: 2px; }
  .biz-line { font-size: 8.75pt; color: #4b5563; margin-top: 3px; }
  .doc-type-block { text-align: right; flex-shrink: 0; padding-top: 2px; }
  .doc-type {
    font-family: Georgia, 'Times New Roman', serif;
    font-size: 15pt;
    font-weight: 700;
    letter-spacing: 1.5px;
    color: #2b3a55;
  }
  .doc-meta { margin-top: 10px; font-size: 9pt; }
  .doc-meta-row { display: flex; justify-content: flex-end; gap: 8px; padding: 1.5px 0; }
  .doc-meta-row .label { color: #64748b; }
  .doc-meta-row .value { font-weight: 700; color: #1f2933; min-width: 100px; text-align: right; }

  /* ---- Section: Invoice / Customer info bar ---- */
  .info-bar {
    display: flex;
    margin-bottom: 16px;
    border: 1px solid #d8dce3;
    border-radius: 3px;
    overflow: hidden;
  }
  .info-bar-col {
    flex: 1;
    padding: 10px 14px;
  }
  .info-bar-col + .info-bar-col { border-left: 1px solid #d8dce3; }
  .info-bar-heading {
    font-size: 7.75pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: #2b3a55;
    margin-bottom: 6px;
  }
  .cust-line { font-size: 9pt; margin-top: 2px; color: #1f2933; }

  /* ---- Product table ---- */
  table.items-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 0;
  }
  .items-table thead { display: table-header-group; } /* repeats header on every printed page */
  .items-table tr { page-break-inside: avoid; }
  .items-table th {
    background-color: #2b3a55;
    color: #ffffff;
    border: 1px solid #2b3a55;
    padding: 7px 9px;
    font-size: 8pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    text-align: left;
  }
  .items-table td {
    border-left: 1px solid #e2e5ea;
    border-right: 1px solid #e2e5ea;
    border-bottom: 1px solid #e2e5ea;
    padding: 7px 9px;
    font-size: 9.25pt;
    vertical-align: top;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  .items-table tbody tr:nth-child(even) td { background-color: #f7f8fa; }
  .items-table tbody tr:last-child td { border-bottom: 1.5px solid #2b3a55; }
  .cell-index { width: 26px; text-align: center; color: #64748b; }
  .cell-product { text-align: left; }
  .cell-sku { text-align: left; white-space: nowrap; color: #4b5563; }
  .cell-identifier { text-align: left; font-size: 8.25pt; color: #4b5563; }
  .cell-num, th.cell-num { text-align: right; white-space: nowrap; }
  .cell-line-total { font-weight: 700; }

  /* ---- Billing summary ---- */
  .summary-block {
    display: flex;
    justify-content: flex-end;
    margin-top: 0;
    margin-bottom: 20px;
    page-break-inside: avoid;
  }
  .summary-box { width: 270px; border: 1px solid #d8dce3; border-top: none; }
  .summary-row {
    display: flex;
    justify-content: space-between;
    padding: 6px 14px;
    font-size: 9pt;
    border-bottom: 1px solid #eceef1;
  }
  .summary-row .label { color: #4b5563; }
  .summary-row .value { font-weight: 600; color: #1f2933; }
  .summary-row.grand-total {
    background-color: #2b3a55;
    color: #ffffff;
    font-size: 12pt;
    font-weight: 700;
    padding: 10px 14px;
    border-bottom: none;
  }
  .summary-row.grand-total .label,
  .summary-row.grand-total .value { color: #ffffff; }

  /* ---- Warranty ---- */
  .warranty-section { margin-bottom: 18px; page-break-inside: avoid; }
  .section-heading {
    font-size: 9pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.6px;
    color: #2b3a55;
    padding-bottom: 5px;
    margin-bottom: 8px;
    border-bottom: 1.5px solid #2b3a55;
  }
  table.warranty-table { width: 100%; border-collapse: collapse; }
  .warranty-table th {
    background-color: #f1f2f5;
    border: 1px solid #d8dce3;
    padding: 6px 9px;
    font-size: 7.75pt;
    font-weight: 700;
    color: #2b3a55;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    text-align: left;
  }
  .warranty-table td {
    border: 1px solid #e2e5ea;
    padding: 6px 9px;
    font-size: 8.75pt;
  }

  /* ---- Footer: Terms / Footer message ---- */
  .footer-section { margin-top: 4px; }
  .terms-block { margin-bottom: 12px; }
  .terms-heading { font-size: 8.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #2b3a55; margin-bottom: 5px; }
  .terms-list { padding-left: 16px; font-size: 8.25pt; color: #4b5563; line-height: 1.65; }
  .footer-message-block {
    text-align: center;
    font-size: 9.25pt;
    font-style: italic;
    font-family: Georgia, 'Times New Roman', serif;
    color: #2b3a55;
    margin: 14px 0;
    padding: 10px 0;
    border-top: 1px solid #d8dce3;
    border-bottom: 1px solid #d8dce3;
  }
  .notes-block { margin-top: 10px; }
  .notes-heading { font-size: 8.5pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.5px; color: #2b3a55; margin-bottom: 5px; }
  .notes-list { padding-left: 16px; font-size: 8.25pt; color: #4b5563; }

  /* ---- Signature ---- */
  .signature-block {
    display: flex;
    justify-content: space-between;
    margin-top: 46px;
    page-break-inside: avoid;
  }
  .signature-col { width: 220px; text-align: center; }
  .signature-line { border-top: 1px solid #9aa3af; margin-top: 34px; padding-top: 6px; font-size: 8.5pt; color: #64748b; }
</style>
</head>
<body>
  <div class="invoice-sheet">

    <!-- HEADER SECTION -->
    <div class="doc-header">
      <div class="biz-block">
        ${business.logo ? `<img class="biz-logo" src="${escapeHtml(business.logo)}" />` : ''}
        <div>
          <div class="biz-name">${escapeHtml(business.businessName)}</div>
          ${business.tagline ? `<div class="biz-tagline">${escapeHtml(business.tagline)}</div>` : ''}
          ${businessMetaRows}
        </div>
      </div>
      <div class="doc-type-block">
        <div class="doc-type">${escapeHtml(invoiceInfo.invoiceType.toUpperCase())}</div>
        <div class="doc-meta">
          <div class="doc-meta-row"><span class="label">Invoice No.</span><span class="value">${escapeHtml(invoiceInfo.invoiceNumber || '')}</span></div>
          ${invoiceInfo.invoiceDate ? `<div class="doc-meta-row"><span class="label">Date</span><span class="value">${escapeHtml(invoiceInfo.invoiceDate)}</span></div>` : ''}
          ${invoiceInfo.invoiceTime ? `<div class="doc-meta-row"><span class="label">Time</span><span class="value">${escapeHtml(invoiceInfo.invoiceTime)}</span></div>` : ''}
        </div>
      </div>
    </div>

    <!-- CUSTOMER / INVOICE INFO BAR -->
    <div class="info-bar">
      <div class="info-bar-col">
        <div class="info-bar-heading">Bill To</div>
        ${customerRows}
      </div>
      <div class="info-bar-col">
        <div class="info-bar-heading">Invoice Details</div>
        ${invoiceInfo.paymentMode ? `<div class="cust-line">Payment Mode: ${escapeHtml(invoiceInfo.paymentMode)}</div>` : ''}
        ${invoiceInfo.cashier.name ? `<div class="cust-line">Cashier: ${escapeHtml(invoiceInfo.cashier.name)}</div>` : ''}
        <div class="cust-line">Status: ${escapeHtml(invoiceInfo.status.toUpperCase())}</div>
      </div>
    </div>

    <!-- PRODUCT TABLE -->
    <table class="items-table">
      <thead>
        <tr>
          <th class="cell-index">#</th>
          <th>Product</th>
          <th>SKU</th>
          ${identifierHeaderCell}
          <th class="cell-num">Qty</th>
          <th class="cell-num">Unit Price</th>
          <th class="cell-num">Discount</th>
          <th class="cell-num">GST</th>
          <th class="cell-num">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>

    <!-- BILLING SUMMARY -->
    <div class="summary-block">
      <div class="summary-box">
        <div class="summary-row"><span class="label">Subtotal</span><span class="value">${money(billingSummary.subtotal)}</span></div>
        <div class="summary-row"><span class="label">Bill Discount</span><span class="value">${money(billingSummary.discount)}</span></div>
        ${billingSummary.taxLines.map((line) => `<div class="summary-row"><span class="label">${escapeHtml(line.label)}</span><span class="value">${money(line.amount)}</span></div>`).join('')}
        ${billingSummary.roundOff !== null ? `<div class="summary-row"><span class="label">Round Off</span><span class="value">${money(billingSummary.roundOff)}</span></div>` : ''}
        <div class="summary-row grand-total"><span class="label">Grand Total</span><span class="value">${money(billingSummary.grandTotal)}</span></div>
      </div>
    </div>

    <!-- WARRANTY INFORMATION (only when at least one line has coverage) -->
    ${warrantyRows ? `
    <div class="warranty-section">
      <div class="section-heading">Warranty Information</div>
      <table class="warranty-table">
        <thead>
          <tr>
            <th>Product</th>
            <th>IMEI / Serial</th>
            <th>Warranty</th>
            <th>Start Date</th>
            <th>End Date</th>
          </tr>
        </thead>
        <tbody>
          ${warrantyRows}
        </tbody>
      </table>
    </div>` : ''}

    <!-- FOOTER: TERMS & CONDITIONS / FOOTER MESSAGE / NOTES -->
    <div class="footer-section">
      ${footerInfo.hasTerms ? `
      <div class="terms-block">
        <div class="terms-heading">Terms &amp; Conditions</div>
        <ol class="terms-list">${footerInfo.terms.map((term) => `<li>${escapeHtml(term)}</li>`).join('')}</ol>
      </div>` : ''}

      ${footerInfo.hasFooterMessage ? `<div class="footer-message-block">${escapeHtml(footerInfo.footerMessage)}</div>` : ''}

      ${footerInfo.hasNotes ? `
      <div class="notes-block">
        <div class="notes-heading">Notes</div>
        <ul class="notes-list"><li>${escapeHtml(footerInfo.notes)}</li></ul>
      </div>` : ''}
    </div>

    <!-- SIGNATURE SECTION (A4 only) -->
    <div class="signature-block">
      <div class="signature-col">
        <div class="signature-line">Customer Signature</div>
      </div>
      <div class="signature-col">
        <div class="signature-line">Authorized Signature</div>
      </div>
    </div>

  </div>
</body>
</html>`;
}

/* ------------------------------------------------------------
   TEMPLATE: a5-retail (Phase 20.10)
   ------------------------------------------------------------
   A production-ready, compact A5 layout for retail counter sales.
   This is NOT a shrunk-down copy of the A4 Professional template —
   it has its own layout tuned for a small page and a customer
   standing at the counter — but it consumes exactly the same
   builder functions the classic and a4-professional templates
   already use (buildBusinessHeader, buildInvoiceInformation,
   buildCustomerInformation, buildProductInformation,
   buildBillingSummary, buildWarrantyInformation,
   buildFooterInformation). Nothing here recalculates, re-derives,
   or duplicates Billing logic — this function only arranges
   already-resolved data into A5-appropriate markup and CSS.

   Layout differences from a4-professional (per spec):
     - No SKU column — SKU is an inventory/A4 concern; the A5
       table is Product | Qty | Price | GST | Total only.
     - No IMEI/Serial column. Identifiers render as a small line
       directly under the product name instead ("IMEI : ...."),
       so the column count never needs to change per-bill the way
       the A4 template's identifier column does.
     - Warranty (when applicable) renders inline under the same
       product line, immediately below any identifier line, rather
       than as its own summary table — keeping a retail bill to a
       single compact block per item instead of a second full
       section at the bottom.
     - No signature block — retail invoices stay compact.
     - Grand Total is visually the largest element on the page,
       per spec ("Grand Total should be larger and bold").

   Multi-page handling mirrors a4-professional exactly, for the
   same reason: `thead { display: table-header-group }` repeats
   the column header row natively on every printed page, `tr {
   page-break-inside: avoid }` keeps a single product (plus its
   identifier/warranty lines, which live in the same <td>) from
   splitting across a page boundary, and `.summary-block` gets
   `page-break-inside: avoid` so the Billing Summary is never
   separated from its own Grand Total row. The header itself
   (business block + TAX INVOICE block) is plain flow content
   above the table rather than a fixed/repeating element —
   Chromium's print engine has no native "repeat this arbitrary
   block on every page" primitive outside table headers, so,
   exactly like a4-professional, only the table header repeats;
   this matches the same tradeoff already shipped and accepted
   for A4.

   Warranty filtering follows the a4-professional convention, not
   the classic/thermal one: only entries that actually have
   coverage are rendered (spec: "If none of the products have
   warranty: Hide the warranty information completely"). The
   internal "eligible but no Warranty record" data-gap case is a
   back-office concern, not something a customer-facing retail
   slip should surface.
   ------------------------------------------------------------ */
function renderA5RetailTemplate(bill, businessProfile, printSettings, appSettings, logger, warranties = []) {
  const money = (amount) => formatMoney(amount, appSettings);

  const business = buildBusinessHeader(businessProfile);
  const invoiceInfo = buildInvoiceInformation(bill, appSettings);
  const customerInfo = buildCustomerInformation(bill);
  const productLines = buildProductInformation(bill);
  const billingSummary = buildBillingSummary(bill);
  const warrantyInfo = buildWarrantyInformation(bill, warranties, appSettings);
  const footerInfo = buildFooterInformation(bill, printSettings);

  // Warranty is looked up per product line (by index) rather than
  // rendered as its own section, so it can sit directly under the
  // matching product row — see the layout note above. Only entries
  // with actual coverage produce a line; a line with no warranty at
  // all (or an internal data-gap) renders nothing extra, per spec.
  const warrantyByLineIndex = productLines.map((line, index) => {
    const entry = warrantyInfo[index];
    if (!entry) return [];

    if (entry.hasIdentifiers) {
      return entry.units
        .filter((unit) => unit.available)
        .map((unit) => ({ identifierValue: unit.identifierValue, period: unit.period }));
    }
    return entry.available ? [{ identifierValue: null, period: entry.period }] : [];
  });

  const itemRows = productLines.map((line, index) => {
    const identifiersText = line.identifiers.map((value) => escapeHtml(value)).join(', ');
    // Per spec: identifier shown inline under the product name, no
    // separate column — "Samsung Galaxy S25 / IMEI : 356789451234567".
    const identifierLine = (line.identifierType && identifiersText)
      ? `<div class="item-sub item-identifier">${escapeHtml(line.identifierType)} : ${identifiersText}</div>`
      : '';

    const warrantyLines = warrantyByLineIndex[index] || [];
    const warrantyLine = warrantyLines.length
      ? `<div class="item-sub item-warranty">${warrantyLines
          .map((w) => `Warranty : ${escapeHtml(w.period || '')}`)
          .join('<br/>')}</div>`
      : '';

    return `
      <tr>
        <td class="cell-product">
          <div class="item-name">${escapeHtml(line.productName)}</div>
          ${identifierLine}
          ${warrantyLine}
        </td>
        <td class="cell-num">${line.quantity}</td>
        <td class="cell-num">${money(line.unitPrice)}</td>
        <td class="cell-num">${line.gstPercentage}%</td>
        <td class="cell-num cell-line-total">${money(line.lineTotal)}</td>
      </tr>`;
  }).join('');

  // Business header — logo-or-name-as-header per spec ("If no Logo
  // exists: Expand Business Name automatically. Never display broken
  // image placeholders."), already decided once by buildBusinessHeader().
  const businessMetaLine = [
    business.mobile ? escapeHtml(business.mobile) : '',
    business.gstNumber ? `GSTIN: ${escapeHtml(business.gstNumber)}` : ''
  ].filter(Boolean).join(' &nbsp;·&nbsp; ');
  // City only (not the full address) — the A5 header spec explicitly
  // lists City, not a full multi-line address, keeping the compact
  // header to one meta line.
  const businessCity = (businessProfile.city || '').trim();

  const customerLine2 = customerInfo.isWalkIn
    ? ''
    : [
        customerInfo.mobile ? escapeHtml(customerInfo.mobile) : '',
        customerInfo.address ? escapeHtml(customerInfo.address) : '',
        customerInfo.gstNumber ? `GSTIN: ${escapeHtml(customerInfo.gstNumber)}` : ''
      ].filter(Boolean).join(' &nbsp;·&nbsp; ');

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8" />
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  @page { size: A5 portrait; margin: 12mm 10mm; }

  /* Same token system as the A4 Professional template (deep-indigo
     accent, serif display for the business identity, slate for
     secondary text) so the two templates read as one family, just
     scaled down for a compact retail slip. */
  body {
    font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
    color: #1f2933;
    font-size: 8.5pt;
    line-height: 1.4;
  }

  * {
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    color-adjust: exact;
  }

  /* Same reasoning as the A4 template: @page margin (12mm 10mm) is
     correct for actual print/PDF and must stay untouched; this
     padding only exists to give the on-screen Invoice Preview panel
     a visible margin, and is removed for the real print pass. */
  .invoice-sheet { width: 100%; padding: 12mm 10mm; }
  @media print {
    .invoice-sheet { padding: 0; }
  }

  .doc-header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    padding-bottom: 8px;
    margin-bottom: 8px;
    border-bottom: 2px solid #2b3a55;
  }
  .biz-block { display: flex; gap: 8px; align-items: center; max-width: 60%; }
  .biz-logo { width: 34px; height: 34px; object-fit: contain; flex-shrink: 0; }
  .biz-name { font-family: Georgia, 'Times New Roman', serif; font-size: 12.5pt; font-weight: 700; color: #1f2933; }
  .biz-line { font-size: 7.25pt; color: #64748b; margin-top: 1.5px; }
  .doc-type-block { text-align: right; flex-shrink: 0; }
  .doc-type { font-family: Georgia, 'Times New Roman', serif; font-size: 10pt; font-weight: 700; letter-spacing: 1px; color: #2b3a55; }
  .doc-meta { margin-top: 6px; font-size: 7.25pt; }
  .doc-meta-row { display: flex; justify-content: flex-end; gap: 6px; padding: 1px 0; }
  .doc-meta-row .label { color: #64748b; }
  .doc-meta-row .value { font-weight: 700; color: #1f2933; }

  .customer-block { margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #d8dce3; }
  .customer-name { font-size: 9pt; font-weight: 700; color: #1f2933; }
  .customer-meta { font-size: 7.25pt; color: #64748b; margin-top: 2px; }

  table.items-table {
    width: 100%;
    border-collapse: collapse;
    margin-bottom: 0;
  }
  .items-table thead { display: table-header-group; }
  .items-table tr { page-break-inside: avoid; }
  .items-table th {
    background-color: #2b3a55;
    color: #ffffff;
    padding: 5px 6px;
    font-size: 6.75pt;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.3px;
    text-align: left;
  }
  .items-table td {
    border-bottom: 1px solid #e2e5ea;
    padding: 6px 6px;
    font-size: 8pt;
    vertical-align: top;
    word-wrap: break-word;
    overflow-wrap: break-word;
  }
  .items-table tbody tr:last-child td { border-bottom: 1.5px solid #2b3a55; }
  .cell-product { text-align: left; width: 44%; }
  .item-name { font-weight: 600; color: #1f2933; }
  .item-sub { font-size: 6.75pt; color: #64748b; margin-top: 1.5px; }
  .item-identifier { color: #4b5563; }
  .item-warranty { color: #64748b; }
  .cell-num, th.cell-num { text-align: right; white-space: nowrap; }
  .cell-line-total { font-weight: 700; }

  .summary-block {
    display: flex;
    justify-content: flex-end;
    margin-top: 0;
    margin-bottom: 8px;
    page-break-inside: avoid;
  }
  .summary-box { width: 100%; }
  .summary-row {
    display: flex;
    justify-content: space-between;
    padding: 3px 0;
    font-size: 8pt;
  }
  .summary-row .label { color: #64748b; }
  .summary-row .value { font-weight: 600; color: #1f2933; }
  .summary-divider { border-top: 1px solid #2b3a55; margin: 4px 0; }
  .summary-row.grand-total {
    padding-top: 5px;
    font-size: 13pt;
    font-weight: 700;
    color: #2b3a55;
  }
  .summary-row.grand-total .label,
  .summary-row.grand-total .value { color: #2b3a55; }

  .footer-section { margin-top: 8px; padding-top: 7px; border-top: 1px solid #d8dce3; }
  .terms-block { margin-bottom: 6px; }
  .terms-heading { font-size: 7pt; font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px; color: #2b3a55; margin-bottom: 3px; }
  .terms-list { padding-left: 13px; font-size: 6.75pt; color: #4b5563; line-height: 1.55; }
  .footer-message-block {
    text-align: center;
    font-size: 7.5pt;
    font-style: italic;
    font-family: Georgia, 'Times New Roman', serif;
    color: #2b3a55;
    margin-top: 6px;
  }
</style>
</head>
<body>
  <div class="invoice-sheet">

    <div class="doc-header">
      <div class="biz-block">
        ${business.logo ? `<img class="biz-logo" src="${escapeHtml(business.logo)}" />` : ''}
        <div>
          <div class="biz-name">${escapeHtml(business.businessName)}</div>
          ${businessMetaLine ? `<div class="biz-line">${businessMetaLine}</div>` : ''}
          ${businessCity ? `<div class="biz-line">${escapeHtml(businessCity)}</div>` : ''}
        </div>
      </div>
      <div class="doc-type-block">
        <div class="doc-type">${escapeHtml(invoiceInfo.invoiceType.toUpperCase())}</div>
        <div class="doc-meta">
          <div class="doc-meta-row"><span class="label">No.</span><span class="value">${escapeHtml(invoiceInfo.invoiceNumber || '')}</span></div>
          ${invoiceInfo.invoiceDate ? `<div class="doc-meta-row"><span class="label">Date</span><span class="value">${escapeHtml(invoiceInfo.invoiceDate)}</span></div>` : ''}
          ${invoiceInfo.invoiceTime ? `<div class="doc-meta-row"><span class="label">Time</span><span class="value">${escapeHtml(invoiceInfo.invoiceTime)}</span></div>` : ''}
        </div>
      </div>
    </div>

    <div class="customer-block">
      <div class="customer-name">${escapeHtml(customerInfo.name)}</div>
      ${customerLine2 ? `<div class="customer-meta">${customerLine2}</div>` : ''}
    </div>

    <table class="items-table">
      <thead>
        <tr>
          <th>Product</th>
          <th class="cell-num">Qty</th>
          <th class="cell-num">Price</th>
          <th class="cell-num">GST</th>
          <th class="cell-num">Total</th>
        </tr>
      </thead>
      <tbody>
        ${itemRows}
      </tbody>
    </table>

    <div class="summary-block">
      <div class="summary-box">
        <div class="summary-row"><span class="label">Subtotal</span><span class="value">${money(billingSummary.subtotal)}</span></div>
        ${billingSummary.discount ? `<div class="summary-row"><span class="label">Discount</span><span class="value">${money(billingSummary.discount)}</span></div>` : ''}
        ${billingSummary.taxLines.map((line) => `<div class="summary-row"><span class="label">${escapeHtml(line.label)}</span><span class="value">${money(line.amount)}</span></div>`).join('')}
        ${billingSummary.roundOff !== null ? `<div class="summary-row"><span class="label">Round Off</span><span class="value">${money(billingSummary.roundOff)}</span></div>` : ''}
        <div class="summary-divider"></div>
        <div class="summary-row grand-total"><span class="label">Grand Total</span><span class="value">${money(billingSummary.grandTotal)}</span></div>
      </div>
    </div>

    ${(footerInfo.hasTerms || footerInfo.hasFooterMessage) ? `
    <div class="footer-section">
      ${footerInfo.hasTerms ? `
      <div class="terms-block">
        <div class="terms-heading">Terms &amp; Conditions</div>
        <ol class="terms-list">${footerInfo.terms.map((term) => `<li>${escapeHtml(term)}</li>`).join('')}</ol>
      </div>` : ''}
      ${footerInfo.hasFooterMessage ? `<div class="footer-message-block">${escapeHtml(footerInfo.footerMessage)}</div>` : ''}
    </div>` : ''}

  </div>
</body>
</html>`;
}

/* ------------------------------------------------------------
   TEMPLATE REGISTRY
   ------------------------------------------------------------
   Future templates get added here the same way 'a4-professional'
   (Phase 20.9) and 'a5-retail' (Phase 20.10) were. Nothing outside
   this module needs to change when a new template is registered —
   Billing and the Printing Engine only ever call renderInvoice(),
   never a template function directly.
   ------------------------------------------------------------ */
const INVOICE_TEMPLATES = {
  classic: renderClassicTemplate,
  'a4-professional': renderA4ProfessionalTemplate,
  'a5-retail': renderA5RetailTemplate
};

const DEFAULT_TEMPLATE_KEY = 'classic';

/* ------------------------------------------------------------
   TEMPLATE SELECTION (Phase 20.11)
   ------------------------------------------------------------
   Settings → Print Settings → Invoice Template is the single
   source of truth for which of the two supported, user-facing
   templates (A4 Professional / A5 Retail) a shop wants — this is
   a deliberate, explicit choice, independent of Invoice Paper
   Size. A shop configured for A5 paper can still choose A4
   Professional (e.g. printing two-up), and vice versa; the two
   settings are related in spirit but never coupled in code, per
   the spec's "Print Settings as single source of truth" rule.

   INVOICE_TEMPLATE_SETTING_VALUES is the only place the two
   supported setting values ('A4 Professional' / 'A5 Retail') are
   mapped to their internal template-registry keys. Nothing else in
   this module, in Billing, or in the Printing Engine hardcodes a
   template choice — they all go through resolveTemplate() /
   renderInvoice() below.

   Fallback behavior (spec: "does not exist / fails to load / is
   invalid → Automatically fall back to A4 Professional. The print
   process should continue without crashing."): any value that
   isn't one of the two recognized setting strings — missing
   Print Settings, an unrecognized/invalid string, a stray legacy
   value — resolves to A4 Professional rather than throwing. This
   is the same defensive posture prepareInvoiceData()/renderInvoice()
   already take for a missing Business Profile: fail safe, not
   fail loud, for anything that isn't a genuine data-integrity
   problem with the Bill itself.

   The legacy invoicePaperSize-based mapping (PAPER_SIZE_DEFAULT_TEMPLATE)
   is kept only as a secondary fallback for Print Settings documents
   saved before this phase (invoiceTemplate not yet set) — once a
   shop has an explicit invoiceTemplate value, paper size is never
   consulted again for template selection. Thermal 80mm/58mm shops
   are unaffected either way: neither setting maps to a Thermal
   template (out of scope — "Support only A4 Professional and A5
   Retail"), so they continue to render via the untouched classic
   template exactly as before this phase.
   ------------------------------------------------------------ */
const INVOICE_TEMPLATE_SETTING_VALUES = {
  'A4 Professional': 'a4-professional',
  'A5 Retail': 'a5-retail'
};

const DEFAULT_INVOICE_TEMPLATE_SETTING = 'A4 Professional';

// Legacy-only: used exclusively as a fallback for Print Settings
// documents that predate the invoiceTemplate field. Never consulted
// once invoiceTemplate has a valid value — see resolveTemplate().
const PAPER_SIZE_DEFAULT_TEMPLATE = {
  'A4': 'a4-professional',
  'A5': 'a5-retail'
};

// Selects the template registry key for this print job. Reads Print
// Settings → Invoice Template first (the explicit, authoritative
// choice); an explicit templateKey argument (e.g. a future template
// picker / preview-with-override flow) still wins over even that,
// matching the existing override contract renderInvoice() already
// exposed before this phase. No calculation happens here — this
// function only picks which already-built render function to call.
function resolveTemplate(templateKey, invoiceTemplateSetting, invoicePaperSize, logger) {
  if (templateKey) {
    if (INVOICE_TEMPLATES[templateKey]) {
      return INVOICE_TEMPLATES[templateKey];
    }
    if (logger) {
      logger.warn(`Invoice Engine: unknown template override "${templateKey}" — falling back to Print Settings → Invoice Template`);
    }
  }

  // invoiceTemplate not configured at all (missing Print Settings,
  // pre-Phase-20.11 document, or an explicitly blank value) is the
  // ONLY case that still consults the legacy paper-size mapping —
  // a genuinely configured-but-invalid value is a data problem, not
  // an "unconfigured" one, and per spec must go straight to A4
  // Professional rather than silently landing on whatever paper
  // size happens to be set.
  if (!invoiceTemplateSetting) {
    const paperSizeDefault = PAPER_SIZE_DEFAULT_TEMPLATE[invoicePaperSize];
    if (paperSizeDefault) {
      return INVOICE_TEMPLATES[paperSizeDefault];
    }
    return INVOICE_TEMPLATES[INVOICE_TEMPLATE_SETTING_VALUES[DEFAULT_INVOICE_TEMPLATE_SETTING]];
  }

  const mappedKey = INVOICE_TEMPLATE_SETTING_VALUES[invoiceTemplateSetting];
  if (mappedKey) {
    return INVOICE_TEMPLATES[mappedKey];
  }

  // Configured but not one of the two supported values — an
  // invalid/corrupted setting. Per spec this must not interrupt
  // printing and must not fall through to paper size either: it
  // goes straight to the hard default, A4 Professional.
  if (logger) {
    logger.warn(`Print Settings: invoiceTemplate "${invoiceTemplateSetting}" is not a recognized template — falling back to ${DEFAULT_INVOICE_TEMPLATE_SETTING}`);
  }
  return INVOICE_TEMPLATES[INVOICE_TEMPLATE_SETTING_VALUES[DEFAULT_INVOICE_TEMPLATE_SETTING]];
}

/* ------------------------------------------------------------
   PUBLIC ENTRY POINT
   ------------------------------------------------------------
   Billing's print route calls this exactly where it used to call
   the old inline renderInvoiceHtml — same inputs, same output.
   templateKey is optional and defaults to the current/only
   template, so existing callers don't need to change.
   ------------------------------------------------------------ */
function renderInvoice({ bill, businessProfile, printSettings, appSettings, templateKey, logger, warranties = [] }) {
  if (!bill) {
    throw Object.assign(new Error('Cannot render invoice: bill is required'), { code: 'INVOICE_MISSING_BILL' });
  }
  if (!businessProfile) {
    throw Object.assign(new Error('Cannot render invoice: business profile is not available'), { code: 'INVOICE_MISSING_BUSINESS_PROFILE' });
  }
  if (!isBusinessProfileConfigured(businessProfile)) {
    throw Object.assign(new Error('Business Profile is not configured. Add your Business Name in Settings \u2192 Business Profile before printing invoices.'), { code: 'INVOICE_BUSINESS_PROFILE_NOT_CONFIGURED' });
  }
  if (!Array.isArray(bill.items) || bill.items.length === 0) {
    throw Object.assign(new Error('Cannot render invoice: bill has no products'), { code: 'INVOICE_MISSING_PRODUCTS' });
  }
  if (!BILL_STATUS_VALUES.includes(bill.status)) {
    throw Object.assign(new Error('Cannot render invoice: bill has an invalid status'), { code: 'INVOICE_INVALID_STATUS' });
  }
  if (bill.status === 'Draft') {
    throw Object.assign(new Error('Draft bills cannot generate an official invoice. Finalize the bill first.'), { code: 'INVOICE_BILL_NOT_FINALIZED' });
  }
  if (!bill.billNumber) {
    throw Object.assign(new Error('Cannot render invoice: bill is missing an invoice number'), { code: 'INVOICE_MISSING_INVOICE_NUMBER' });
  }
  if (!bill.paymentMode) {
    throw Object.assign(new Error('Cannot render invoice: bill is missing a payment mode'), { code: 'INVOICE_MISSING_PAYMENT_MODE' });
  }
  if (typeof bill.grandTotal !== 'number' || Number.isNaN(bill.grandTotal)) {
    throw Object.assign(new Error('Cannot render invoice: bill is missing a Grand Total'), { code: 'INVOICE_MISSING_GRAND_TOTAL' });
  }
  if (typeof bill.taxAmount !== 'number' || Number.isNaN(bill.taxAmount)) {
    throw Object.assign(new Error('Cannot render invoice: bill is missing Tax information'), { code: 'INVOICE_MISSING_TAX' });
  }

  // Phase 20.11: Print Settings → Invoice Template is now the primary
  // selection signal (see resolveTemplate() above); the unknown-override
  // warning for an explicit templateKey argument is handled inside
  // resolveTemplate() itself now, so both fallback paths (bad override,
  // bad/missing setting) log through one place instead of two.
  const render = resolveTemplate(
    templateKey,
    printSettings && printSettings.invoiceTemplate,
    printSettings && printSettings.invoicePaperSize,
    logger
  );

  return render(bill, businessProfile, printSettings, appSettings, logger, warranties);
}

module.exports = {
  renderInvoice,
  resolveTemplate,
  prepareInvoiceData,
  buildBusinessHeader,
  buildInvoiceInformation,
  buildCustomerInformation,
  buildProductInformation,
  buildBillingSummary,
  buildWarrantyInformation,
  buildFooterInformation,
  isBusinessProfileConfigured,
  escapeHtml,
  formatMoney,
  formatInvoiceDate,
  formatInvoiceTime,
  INVOICE_TYPES,
  INVOICE_PAPER_CSS,
  INVOICE_TEMPLATES,
  INVOICE_TEMPLATE_SETTING_VALUES,
  DEFAULT_TEMPLATE_KEY,
  DEFAULT_INVOICE_TEMPLATE_SETTING
};