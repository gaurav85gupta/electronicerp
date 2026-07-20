require('dotenv').config();

const express = require('express');
const helmet = require('helmet');
const cors = require('cors');
const mongoose = require('mongoose');

const authRoutes = require('./routes/auth');
const setupRoutes = require('./routes/setup');
const { requireAuth, requireRole } = require('./middleware/auth');
const { validatePasswordStrength } = require('./utils/passwordPolicy');
const { setSecuritySettings } = require('./utils/securitySettingsCache');
const { User, ROLES } = require('./models/User');
const invoiceEngine = require('../frontend/services/invoiceEngine');

const NODE_ENV = process.env.NODE_ENV || 'development';
const PORT = process.env.PORT || 5000;
const MONGODB_URI = process.env.MONGODB_URI;
// This backend only ever serves the local Electron desktop shell (see
// electron/main.js) or a developer's own machine during `npm run dev` —
// never a public web frontend — so a wildcard origin has no legitimate
// use here and only weakens CORS for no benefit. Default to localhost-only;
// CORS_ORIGIN remains overridable via .env for non-standard deployments.
const CORS_ORIGIN = process.env.CORS_ORIGIN
  ? process.env.CORS_ORIGIN.split(',').map((origin) => origin.trim())
  : [`http://localhost:${PORT}`, `http://127.0.0.1:${PORT}`];

const logger = require('./utils/logger');

/* ============================================================
   MASTER DATA — MONGOOSE MODELS
   ============================================================ */

function applyMasterDataPlugin(schema) {
  schema.add({
    status: { type: String, enum: ['Active', 'Inactive'], default: 'Active' },
    isDeleted: { type: Boolean, default: false },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  });

  schema.set('timestamps', true);

  schema.set('toJSON', {
    transform(doc, ret) {
      ret.id = ret._id;
      delete ret._id;
      delete ret.__v;
      delete ret.isDeleted;
      return ret;
    }
  });
}

const categorySchema = new mongoose.Schema({
  categoryName: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, trim: true, maxlength: 500, default: '' }
});
applyMasterDataPlugin(categorySchema);
categorySchema.index({ categoryName: 1 });
const Category = mongoose.model('Category', categorySchema);

const brandSchema = new mongoose.Schema({
  brandName: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, trim: true, maxlength: 500, default: '' }
});
applyMasterDataPlugin(brandSchema);
brandSchema.index({ brandName: 1 });
const Brand = mongoose.model('Brand', brandSchema);

const unitSchema = new mongoose.Schema({
  unitName: { type: String, required: true, trim: true, maxlength: 50 },
  symbol: { type: String, required: true, trim: true, maxlength: 10 }
});
applyMasterDataPlugin(unitSchema);
unitSchema.index({ unitName: 1 });
const Unit = mongoose.model('Unit', unitSchema);

const gstSchema = new mongoose.Schema({
  gstName: { type: String, required: true, trim: true, maxlength: 100 },
  gstPercentage: { type: Number, required: true, min: 0, max: 100 }
});
applyMasterDataPlugin(gstSchema);
gstSchema.index({ gstName: 1 });
const Gst = mongoose.model('Gst', gstSchema);

const supplierSchema = new mongoose.Schema({
  supplierName: { type: String, required: true, trim: true, maxlength: 150 },
  contactPerson: { type: String, trim: true, maxlength: 100, default: '' },
  mobileNumber: { type: String, required: true, trim: true, maxlength: 20 },
  email: { type: String, trim: true, lowercase: true, maxlength: 150, default: '' },
  gstNumber: { type: String, trim: true, uppercase: true, maxlength: 20, default: '' },
  address: { type: String, trim: true, maxlength: 500, default: '' }
});
applyMasterDataPlugin(supplierSchema);
supplierSchema.index({ supplierName: 1 });
const Supplier = mongoose.model('Supplier', supplierSchema);

const customerTypeSchema = new mongoose.Schema({
  customerType: { type: String, required: true, trim: true, maxlength: 100 },
  description: { type: String, trim: true, maxlength: 500, default: '' }
});
applyMasterDataPlugin(customerTypeSchema);
customerTypeSchema.index({ customerType: 1 });
const CustomerType = mongoose.model('CustomerType', customerTypeSchema);

const paymentModeSchema = new mongoose.Schema({
  paymentModeName: { type: String, required: true, trim: true, maxlength: 100 }
});
applyMasterDataPlugin(paymentModeSchema);
paymentModeSchema.index({ paymentModeName: 1 });
const PaymentMode = mongoose.model('PaymentMode', paymentModeSchema);

/* ============================================================
   PRODUCT MASTER — MONGOOSE MODEL
   ============================================================ */

const productSchema = new mongoose.Schema({
  productName: { type: String, required: true, trim: true, maxlength: 150 },
  sku: { type: String, required: true, trim: true, uppercase: true, maxlength: 50 },
  barcode: { type: String, trim: true, maxlength: 50, default: '' },
  category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
  brand: { type: mongoose.Schema.Types.ObjectId, ref: 'Brand', required: true },
  unit: { type: mongoose.Schema.Types.ObjectId, ref: 'Unit', required: true },
  description: { type: String, trim: true, maxlength: 1000, default: '' },

  purchasePrice: { type: Number, min: 0, default: 0 },
  sellingPrice: { type: Number, min: 0, default: 0 },
  mrp: { type: Number, min: 0, default: 0 },
  gst: { type: mongoose.Schema.Types.ObjectId, ref: 'Gst', required: true },
  discountAllowed: { type: Boolean, default: false },

  minStockAlert: { type: Number, min: 0, default: 0 },
  maxStock: { type: Number, min: 0, default: null },
  reorderLevel: { type: Number, min: 0, default: 0 },

  warrantyAvailable: { type: Boolean, default: false },
  warrantyDuration: { type: Number, min: 0, default: null },
  warrantyUnit: { type: String, enum: ['Days', 'Months', 'Years', null], default: null },

  usesSerialNumber: { type: Boolean, default: false },
  usesImeiNumber: { type: Boolean, default: false }
});
applyMasterDataPlugin(productSchema);
productSchema.index({ productName: 1 });
productSchema.index({ sku: 1 });
productSchema.index({ barcode: 1 });
const Product = mongoose.model('Product', productSchema);

/* ============================================================
   INVENTORY ENGINE — MONGOOSE MODELS
   ============================================================ */

const inventorySchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, unique: true },
  currentQuantity: { type: Number, required: true, min: 0, default: 0 },
  reservedQuantity: { type: Number, required: true, min: 0, default: 0 },
  minStockLevel: { type: Number, min: 0, default: 0 },
  maxStockLevel: { type: Number, min: 0, default: null },
  reorderLevel: { type: Number, min: 0, default: 0 },
  openingStockCreated: { type: Boolean, default: false },
  lastUpdated: { type: Date, default: Date.now }
});
applyMasterDataPlugin(inventorySchema);
// index on `product` already created by `unique: true` above
const Inventory = mongoose.model('Inventory', inventorySchema);

const inventoryMovementSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  inventory: { type: mongoose.Schema.Types.ObjectId, ref: 'Inventory', required: true },
  movementType: { type: String, enum: ['Stock Increase', 'Stock Decrease'], required: true },
  quantity: { type: Number, required: true, min: 1 },
  previousStock: { type: Number, required: true, min: 0 },
  newStock: { type: Number, required: true, min: 0 },
  referenceType: { type: String, enum: ['Opening Stock', 'Manual Adjustment', 'Purchase', 'Billing'], required: true },
  referenceId: { type: mongoose.Schema.Types.ObjectId, default: null },
  reason: { type: String, trim: true, maxlength: 200, default: '' },
  remarks: { type: String, trim: true, maxlength: 500, default: '' },
  performedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: { createdAt: 'createdAt', updatedAt: false } });

inventoryMovementSchema.set('toJSON', {
  transform(doc, ret) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

inventoryMovementSchema.index({ product: 1, createdAt: -1 });
inventoryMovementSchema.index({ inventory: 1, createdAt: -1 });
const InventoryMovement = mongoose.model('InventoryMovement', inventoryMovementSchema);

/* ============================================================
   PURCHASE MANAGEMENT — MONGOOSE MODELS
   ============================================================ */

const counterSchema = new mongoose.Schema({
  key: { type: String, required: true, unique: true },
  seq: { type: Number, required: true, default: 0 }
});
const Counter = mongoose.model('Counter', counterSchema);

async function getNextSequence(key) {
  const counter = await Counter.findOneAndUpdate(
    { key },
    { $inc: { seq: 1 } },
    { new: true, upsert: true }
  );
  return counter.seq;
}

/* ============================================================
   NUMBER SERIES — CONFIGURABLE DOCUMENT NUMBERING
   ============================================================
   NumberSeries stores the prefix / starting number / digit length
   for each auto-numbered document type. The Counter collection
   remains the atomic sequence source (seq = how many numbers have
   been issued since the series was created); the actual displayed
   number is derived as (startingNumber + seq - 1), formatted with
   the configured prefix and digit length. This lets Owners change
   the prefix or digit length at any time without breaking the
   atomic increment, while Starting Number only takes effect for
   series that have not yet issued a number.
   ============================================================ */

const NUMBER_SERIES_DEFINITIONS = [
  { seriesKey: 'purchaseNumber', label: 'Purchase', defaultPrefix: 'PUR-' },
  { seriesKey: 'billNumber', label: 'Bill', defaultPrefix: 'INV-' },
  { seriesKey: 'customerCode', label: 'Customer', defaultPrefix: 'CUS-' },
  { seriesKey: 'productCode', label: 'Product', defaultPrefix: 'PRO-' },
  { seriesKey: 'warrantyNumber', label: 'Warranty', defaultPrefix: 'WAR-' },
  { seriesKey: 'claimNumber', label: 'Claim', defaultPrefix: 'CLM-' }
];

const numberSeriesSchema = new mongoose.Schema(
  {
    seriesKey: { type: String, required: true, unique: true, trim: true },
    label: { type: String, required: true, trim: true, maxlength: 50 },
    prefix: { type: String, required: true, trim: true, maxlength: 10 },
    startingNumber: { type: Number, required: true, min: 1, default: 1 },
    numberLength: { type: Number, required: true, min: 1, max: 12, default: 6 },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true }
);

numberSeriesSchema.set('toJSON', {
  transform(doc, ret) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

const NumberSeries = mongoose.model('NumberSeries', numberSeriesSchema);

async function ensureNumberSeriesSeeded() {
  for (const definition of NUMBER_SERIES_DEFINITIONS) {
    const exists = await NumberSeries.findOne({ seriesKey: definition.seriesKey });
    if (!exists) {
      await NumberSeries.create({
        seriesKey: definition.seriesKey,
        label: definition.label,
        prefix: definition.defaultPrefix,
        startingNumber: 1,
        numberLength: 6
      });
    }
  }
}

function formatSeriesNumber(series, seq) {
  const numericPart = series.startingNumber + seq - 1;
  return `${series.prefix}${String(numericPart).padStart(series.numberLength, '0')}`;
}

async function generateNumberFromSeries(seriesKey) {
  const [series, seq] = await Promise.all([
    NumberSeries.findOne({ seriesKey }),
    getNextSequence(seriesKey)
  ]);

  if (!series) {
    const fallback = NUMBER_SERIES_DEFINITIONS.find((item) => item.seriesKey === seriesKey);
    const prefix = fallback ? fallback.defaultPrefix : '';
    return `${prefix}${String(seq).padStart(6, '0')}`;
  }

  return formatSeriesNumber(series, seq);
}

async function previewNextSeriesNumber(series) {
  const counter = await Counter.findOne({ key: series.seriesKey });
  const nextSeq = (counter ? counter.seq : 0) + 1;
  return formatSeriesNumber(series, nextSeq);
}

async function generatePurchaseNumber() {
  return generateNumberFromSeries('purchaseNumber');
}

const purchaseIdentifierSchema = new mongoose.Schema({
  type: { type: String, enum: ['Serial Number', 'IMEI'], required: true },
  value: { type: String, required: true, trim: true, maxlength: 100 }
}, { _id: false });

const purchaseItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true, min: 1 },
  purchasePrice: { type: Number, required: true, min: 0 },
  discount: { type: Number, required: true, min: 0, default: 0 },
  gstPercentage: { type: Number, required: true, min: 0, max: 100, default: 0 },
  taxAmount: { type: Number, required: true, min: 0, default: 0 },
  subtotal: { type: Number, required: true, min: 0, default: 0 },
  lineTotal: { type: Number, required: true, min: 0, default: 0 },
  identifiers: { type: [purchaseIdentifierSchema], default: [] }
}, { _id: false });

const purchaseSchema = new mongoose.Schema({
  purchaseNumber: { type: String, required: true, unique: true, trim: true },
  purchaseDate: { type: Date, required: true, default: Date.now },
  supplier: { type: mongoose.Schema.Types.ObjectId, ref: 'Supplier', required: true },
  supplierInvoiceNumber: { type: String, trim: true, maxlength: 100, default: '' },
  supplierInvoiceDate: { type: Date, default: null },
  paymentMode: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentMode', default: null },
  dueDate: { type: Date, default: null },
  remarks: { type: String, trim: true, maxlength: 500, default: '' },
  status: { type: String, enum: ['Draft', 'Finalized', 'Cancelled'], default: 'Draft', required: true },

  items: { type: [purchaseItemSchema], default: [] },

  subtotalAmount: { type: Number, required: true, min: 0, default: 0 },
  discountAmount: { type: Number, required: true, min: 0, default: 0 },
  taxAmount: { type: Number, required: true, min: 0, default: 0 },
  grandTotal: { type: Number, required: true, min: 0, default: 0 },

  finalizedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  cancellationReason: { type: String, trim: true, maxlength: 500, default: '' },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

purchaseSchema.set('toJSON', {
  transform(doc, ret) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

// index on `purchaseNumber` already created by `unique: true` above
purchaseSchema.index({ supplier: 1, createdAt: -1 });
purchaseSchema.index({ status: 1, createdAt: -1 });

const Purchase = mongoose.model('Purchase', purchaseSchema);

/* ============================================================
   PRODUCT IDENTIFIER (Serial Number / IMEI) — MONGOOSE MODEL
   ============================================================
   Tracks individual serialized/IMEI units from the point they enter
   stock (via Purchase) through sale (via Billing) and any reversal.
   ============================================================ */

const productIdentifierSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  type: { type: String, enum: ['Serial Number', 'IMEI'], required: true },
  value: { type: String, required: true, trim: true, maxlength: 100 },
  status: { type: String, enum: ['In Stock', 'Sold'], default: 'In Stock', required: true },

  purchase: { type: mongoose.Schema.Types.ObjectId, ref: 'Purchase', default: null },

  bill: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill', default: null },
  customerName: { type: String, trim: true, maxlength: 150, default: '' },
  customerMobile: { type: String, trim: true, maxlength: 20, default: '' },
  saleDate: { type: Date, default: null }
}, { timestamps: true });

productIdentifierSchema.set('toJSON', {
  transform(doc, ret) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

productIdentifierSchema.index({ product: 1, value: 1 });
productIdentifierSchema.index({ product: 1, status: 1 });
productIdentifierSchema.index({ bill: 1 });

const ProductIdentifier = mongoose.model('ProductIdentifier', productIdentifierSchema);

/* ============================================================
   BILLING ENGINE (POS) — MONGOOSE MODELS
   ============================================================ */

async function generateBillNumber() {
  return generateNumberFromSeries('billNumber');
}

const billIdentifierSchema = new mongoose.Schema({
  type: { type: String, enum: ['Serial Number', 'IMEI'], required: true },
  value: { type: String, required: true, trim: true, maxlength: 100 },
  productIdentifier: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductIdentifier', required: true }
}, { _id: false });

// Footer Snapshot (Invoice Engine Phase 20.8) — captured once, at Bill
// finalization, from Print Settings as they existed at that exact moment.
// Mirrors the Product Snapshot pattern above (Phase 20.5): a reprint must
// keep showing this, never the live Print Settings, even if Footer
// Message / Terms & Conditions are edited afterwards. Only these two
// fields are snapshotted, per the Reprint Rule — Notes is intentionally
// left out (see PrintSettings.notes) since it isn't required to stay
// historically fixed. `captured: false` (the default) distinguishes bills
// finalized before this field existed from ones that legitimately had an
// empty footer at finalization; the Invoice Engine falls back to live
// Print Settings only in the former case.
const footerSnapshotSchema = new mongoose.Schema({
  captured: { type: Boolean, default: false },
  footerMessage: { type: String, trim: true, maxlength: 300, default: '' },
  termsAndConditions: { type: [String], default: [] }
}, { _id: false });

const billItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  quantity: { type: Number, required: true, min: 1 },
  sellingPrice: { type: Number, required: true, min: 0 },
  discount: { type: Number, required: true, min: 0, default: 0 },
  gstPercentage: { type: Number, required: true, min: 0, max: 100, default: 0 },
  taxAmount: { type: Number, required: true, min: 0, default: 0 },
  subtotal: { type: Number, required: true, min: 0, default: 0 },
  lineTotal: { type: Number, required: true, min: 0, default: 0 },
  identifiers: { type: [billIdentifierSchema], default: [] },

  // Product Snapshot (Invoice Engine Phase 20.5) — captured once, at Bill
  // finalization, from the Product record as it existed at that moment.
  // Invoices must keep showing this even if the Product is later renamed,
  // re-SKU'd, or has its unit changed. Draft bills carry a provisional
  // snapshot (set when the item is added) that finalizeBillInternal()
  // overwrites with the authoritative one at finalize time; nothing here
  // is ever regenerated afterwards. Left optional/default '' so bills
  // created before this field existed don't fail validation — the
  // Invoice Engine falls back to the live Product for those only.
  productNameSnapshot: { type: String, trim: true, maxlength: 200, default: '' },
  skuSnapshot: { type: String, trim: true, maxlength: 100, default: '' },
  unitSymbolSnapshot: { type: String, trim: true, maxlength: 20, default: '' },
  usesSerialNumberSnapshot: { type: Boolean, default: false },
  usesImeiNumberSnapshot: { type: Boolean, default: false }
}, { _id: false });

const billSchema = new mongoose.Schema({
  billNumber: { type: String, required: true, unique: true, trim: true },
  billDate: { type: Date, required: true, default: Date.now },

  customer: { type: mongoose.Schema.Types.ObjectId, ref: 'Customer', default: null },
  customerName: { type: String, trim: true, maxlength: 150, default: '' },
  customerMobile: { type: String, trim: true, maxlength: 20, default: '' },

  paymentMode: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentMode', default: null },
  salesperson: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  remarks: { type: String, trim: true, maxlength: 500, default: '' },
  status: { type: String, enum: ['Draft', 'Finalized', 'Cancelled'], default: 'Draft', required: true },

  items: { type: [billItemSchema], default: [] },

  subtotalAmount: { type: Number, required: true, min: 0, default: 0 },
  discountAmount: { type: Number, required: true, min: 0, default: 0 },
  taxAmount: { type: Number, required: true, min: 0, default: 0 },
  roundOff: { type: Number, default: 0 },
  grandTotal: { type: Number, required: true, min: 0, default: 0 },

  finalizedAt: { type: Date, default: null },
  cancelledAt: { type: Date, default: null },
  cancellationReason: { type: String, trim: true, maxlength: 500, default: '' },

  // Footer Snapshot (Phase 20.8) — see footerSnapshotSchema above.
  footerSnapshot: { type: footerSnapshotSchema, default: () => ({}) },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
}, { timestamps: true });

billSchema.set('toJSON', {
  transform(doc, ret) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

// index on `billNumber` already created by `unique: true` above
billSchema.index({ status: 1, createdAt: -1 });
billSchema.index({ customerMobile: 1 });
billSchema.index({ customer: 1, createdAt: -1 });
billSchema.index({ salesperson: 1, createdAt: -1 });

const Bill = mongoose.model('Bill', billSchema);

const warrantySchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  productIdentifier: { type: mongoose.Schema.Types.ObjectId, ref: 'ProductIdentifier', default: null },
  bill: { type: mongoose.Schema.Types.ObjectId, ref: 'Bill', required: true },
  customerName: { type: String, trim: true, maxlength: 150, default: '' },
  customerMobile: { type: String, trim: true, maxlength: 20, default: '' },
  warrantyStart: { type: Date, required: true },
  warrantyEnd: { type: Date, required: true },
  status: { type: String, enum: ['Active', 'Reversed'], default: 'Active', required: true }
}, { timestamps: true });

warrantySchema.set('toJSON', {
  transform(doc, ret) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

warrantySchema.index({ bill: 1 });
warrantySchema.index({ product: 1 });

const Warranty = mongoose.model('Warranty', warrantySchema);

/* ============================================================
   PRINT HISTORY — REFERENCE-ONLY AUDIT LOG
   ============================================================
   Records that a print occurred; never duplicates document data.
   Reprints and previews read the original Bill (or other document)
   fresh at render time, so history rows are pure metadata.
   ============================================================ */

const PRINT_DOCUMENT_TYPES = ['Invoice'];

const printHistorySchema = new mongoose.Schema(
  {
    documentType: { type: String, enum: PRINT_DOCUMENT_TYPES, required: true },
    documentId: { type: mongoose.Schema.Types.ObjectId, required: true },
    documentNumber: { type: String, trim: true, maxlength: 50, default: '' },
    printedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    printerName: { type: String, trim: true, maxlength: 150, default: '' },
    copies: { type: Number, min: 1, default: 1 },
    status: { type: String, enum: ['Success', 'Failed'], required: true },
    failureReason: { type: String, trim: true, maxlength: 300, default: '' }
  },
  { timestamps: true }
);

printHistorySchema.set('toJSON', {
  transform(doc, ret) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

printHistorySchema.index({ documentType: 1, documentId: 1, createdAt: -1 });

const PrintHistory = mongoose.model('PrintHistory', printHistorySchema);

/* ============================================================
   CUSTOMER MANAGEMENT — MONGOOSE MODEL
   ============================================================ */

async function generateCustomerCode() {
  return generateNumberFromSeries('customerCode');
}

const customerAddressSchema = new mongoose.Schema({
  addressLine1: { type: String, trim: true, maxlength: 200, default: '' },
  addressLine2: { type: String, trim: true, maxlength: 200, default: '' },
  city: { type: String, trim: true, maxlength: 100, default: '' },
  state: { type: String, trim: true, maxlength: 100, default: '' },
  pincode: { type: String, trim: true, maxlength: 10, default: '' }
}, { _id: false });

const customerSchema = new mongoose.Schema({
  customerCode: { type: String, required: true, unique: true, trim: true },
  customerType: { type: mongoose.Schema.Types.ObjectId, ref: 'CustomerType', required: true },

  customerName: { type: String, required: true, trim: true, maxlength: 150 },
  mobileNumber: { type: String, required: true, trim: true, maxlength: 20 },
  alternateMobile: { type: String, trim: true, maxlength: 20, default: '' },
  email: { type: String, trim: true, lowercase: true, maxlength: 150, default: '' },
  dateOfBirth: { type: Date, default: null },
  anniversary: { type: Date, default: null },

  address: { type: customerAddressSchema, default: () => ({}) },

  gstNumber: { type: String, trim: true, uppercase: true, maxlength: 20, default: '' },
  businessName: { type: String, trim: true, maxlength: 150, default: '' },

  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null },
  updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
});
applyMasterDataPlugin(customerSchema);

// index on `customerCode` already created by `unique: true` above
customerSchema.index({ mobileNumber: 1 });
customerSchema.index({ customerName: 1 });
customerSchema.index({ gstNumber: 1 });

const Customer = mongoose.model('Customer', customerSchema);

/* ============================================================
   BILLING — AUTOMATIC CUSTOMER CREATION / LINKING
   ============================================================
   Called from inside the Billing finalize transaction. Resolves the
   Bill's customer as follows, without altering existing Bill/Inventory/
   ProductIdentifier/Warranty logic:
     1. bill.customer already set (existing customer selected) -> reuse it.
     2. No customer selected but customerName + customerMobile provided ->
        look up an existing Customer by mobile number; reuse if found,
        otherwise auto-create a new Retail customer (Number Series code,
        status Active) and link it.
     3. Both customerName and customerMobile blank -> Walk-in Customer,
        no Customer record created, bill.customer stays null.
   Runs inside the caller's transaction session so Bill finalization and
   Customer creation/linking remain atomic.
   ============================================================ */

async function resolveOrCreateBillCustomer(bill, session, userId) {
  // 1. Existing customer already linked (selected in the UI) — reuse as-is.
  if (bill.customer) {
    return;
  }

  const customerName = (bill.customerName || '').trim();
  const customerMobile = (bill.customerMobile || '').trim();

  // 3. Walk-in Customer — nothing to create or link. Search/creation is keyed
  // on mobile number, so if it is blank there is nothing to look up or store
  // against, regardless of whether a name was typed.
  if (isBlank(customerMobile)) {
    return;
  }

  // 2. Try to find an existing customer by mobile number first.
  const existingCustomer = await Customer.findOne({
    mobileNumber: customerMobile,
    isDeleted: false
  }).session(session);

  if (existingCustomer) {
    bill.customer = existingCustomer._id;
    return;
  }

  // No matching customer — auto-create a new Retail customer.
  const retailCustomerType = await CustomerType.findOne({
    customerType: { $regex: /^retail$/i },
    isDeleted: false,
    status: 'Active'
  }).session(session);

  if (!retailCustomerType) {
    const err = new Error('Cannot auto-create customer: no active "Retail" Customer Type is configured in Master Data');
    err.status = 400;
    throw err;
  }

  const customerCode = await generateCustomerCode();

  const created = await Customer.create([{
    customerCode,
    customerType: retailCustomerType._id,
    customerName: customerName || customerMobile,
    mobileNumber: customerMobile,
    status: 'Active',
    createdBy: userId,
    updatedBy: userId
  }], { session });

  bill.customer = created[0]._id;
}

/* ============================================================
   MASTER DATA — VALIDATION HELPERS
   ============================================================ */

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MOBILE_PATTERN = /^[0-9]{10}$/;
const GST_NUMBER_PATTERN = /^[0-9]{2}[A-Z]{5}[0-9]{4}[A-Z]{1}[0-9A-Z]{1}Z[0-9A-Z]{1}$/;

function isBlank(value) {
  return value === undefined || value === null || String(value).trim() === '';
}

function validateRequiredString(value, label, maxLength) {
  if (isBlank(value)) return `${label} is required`;
  if (String(value).trim().length > maxLength) return `${label} must not exceed ${maxLength} characters`;
  return null;
}

function validateOptionalString(value, label, maxLength) {
  if (isBlank(value)) return null;
  if (String(value).trim().length > maxLength) return `${label} must not exceed ${maxLength} characters`;
  return null;
}

function validateEmail(value, label = 'Email') {
  if (isBlank(value)) return null;
  if (!EMAIL_PATTERN.test(String(value).trim())) return `${label} is invalid`;
  return null;
}

function validateMobile(value, label = 'Mobile number') {
  if (isBlank(value)) return `${label} is required`;
  if (!MOBILE_PATTERN.test(String(value).trim())) return `${label} must be a valid 10-digit mobile number`;
  return null;
}

function validateOptionalMobile(value, label = 'Mobile number') {
  if (isBlank(value)) return null;
  if (!MOBILE_PATTERN.test(String(value).trim())) return `${label} must be a valid 10-digit mobile number`;
  return null;
}

const WEBSITE_PATTERN = /^(https?:\/\/)?[a-zA-Z0-9-]+(\.[a-zA-Z0-9-]+)+([/?#].*)?$/;

function validateWebsite(value, label = 'Website') {
  if (isBlank(value)) return null;
  if (String(value).trim().length > 200) return `${label} must not exceed 200 characters`;
  if (!WEBSITE_PATTERN.test(String(value).trim())) return `${label} is invalid`;
  return null;
}

function validateGstNumber(value, label = 'GST number') {
  if (isBlank(value)) return null;
  if (!GST_NUMBER_PATTERN.test(String(value).trim().toUpperCase())) return `${label} format is invalid`;
  return null;
}

function validateGstPercentage(value, label = 'GST percentage') {
  if (value === undefined || value === null || value === '') return `${label} is required`;
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return `${label} must be a number`;
  if (numeric < 0 || numeric > 100) return `${label} must be between 0 and 100`;
  return null;
}

// Standard GST slabs. Custom rates are rejected unless a future business
// rule explicitly opens this up — see GST IMPROVEMENTS spec.
const GST_ALLOWED_SLABS = [0, 5, 12, 18, 28];

function validateGstSlab(value, label = 'GST percentage') {
  const requiredError = validateGstPercentage(value, label);
  if (requiredError) return requiredError;
  const numeric = Number(value);
  if (!GST_ALLOWED_SLABS.includes(numeric)) {
    return `${label} must be one of: ${GST_ALLOWED_SLABS.map((v) => `${v}%`).join(', ')}`;
  }
  return null;
}

function buildGstName(percentage) {
  return `GST ${percentage}%`;
}

function validateStatus(value) {
  if (isBlank(value)) return null;
  if (!['Active', 'Inactive'].includes(value)) return 'Status must be either Active or Inactive';
  return null;
}

function firstError(...errors) {
  return errors.find((error) => Boolean(error)) || null;
}

/* ============================================================
   MASTER DATA — PAGINATION / LIST HELPER
   ============================================================ */

const DEFAULT_PAGE_SIZE = 10;
const MAX_PAGE_SIZE = 100;

function buildPagination(query) {
  let page = parseInt(query.page, 10);
  let limit = parseInt(query.limit, 10);

  if (!Number.isFinite(page) || page < 1) page = 1;
  if (!Number.isFinite(limit) || limit < 1) limit = DEFAULT_PAGE_SIZE;
  if (limit > MAX_PAGE_SIZE) limit = MAX_PAGE_SIZE;

  return { page, limit, skip: (page - 1) * limit };
}

function escapeRegex(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function listWithPagination(Model, { searchFields = [], query = {} }) {
  const { page, limit, skip } = buildPagination(query);
  const mongoFilter = { isDeleted: false };

  if (query.status && ['Active', 'Inactive'].includes(query.status)) {
    mongoFilter.status = query.status;
  }

  if (query.search && searchFields.length > 0) {
    const safe = escapeRegex(String(query.search).trim());
    if (safe) {
      mongoFilter.$or = searchFields.map((field) => ({ [field]: { $regex: safe, $options: 'i' } }));
    }
  }

  const [records, totalRecords] = await Promise.all([
    Model.find(mongoFilter).sort({ createdAt: -1 }).skip(skip).limit(limit),
    Model.countDocuments(mongoFilter)
  ]);

  return {
    records,
    pagination: {
      page,
      limit,
      totalRecords,
      totalPages: Math.max(Math.ceil(totalRecords / limit), 1)
    }
  };
}

/* ============================================================
   MASTER DATA — GENERIC CRUD ROUTE FACTORY
   ============================================================
   Each master config defines:
   - Model: the Mongoose model
   - uniqueField: field used for duplicate-active-record checks
   - searchFields: fields eligible for text search
   - validate(body): returns { errors, data } — data is the sanitized payload
   ============================================================ */

function buildMasterRouter(config) {
  const router = express.Router();
  const { Model, uniqueField, searchFields, validate } = config;

  // Default duplicate check: exact match on uniqueField among active,
  // non-deleted records. Individual masters (e.g. Unit, Gst) can override
  // this via config.checkDuplicate(data, excludeId) to add case-insensitive
  // matching or check additional fields (e.g. Unit's symbol).
  const checkDuplicate = config.checkDuplicate || (async (data, excludeId) => {
    const filter = {
      [uniqueField]: data[uniqueField],
      status: 'Active',
      isDeleted: false
    };
    if (excludeId) filter._id = { $ne: excludeId };
    return Model.findOne(filter);
  });

  // LIST (search + pagination + status filter)
  router.get('/', requireAuth, requirePermission('Master Data', 'view'), async (req, res, next) => {
    try {
      const { records, pagination } = await listWithPagination(Model, { searchFields, query: req.query });
      res.status(200).json({ success: true, data: records, pagination });
    } catch (error) {
      next(error);
    }
  });

  // GET ONE
  router.get('/:id', requireAuth, requirePermission('Master Data', 'view'), async (req, res, next) => {
    try {
      const record = await Model.findOne({ _id: req.params.id, isDeleted: false });
      if (!record) {
        return res.status(404).json({ success: false, message: 'Record not found' });
      }
      res.status(200).json({ success: true, data: record });
    } catch (error) {
      next(error);
    }
  });

  // CREATE
  router.post('/', requireAuth, requirePermission('Master Data', 'create'), async (req, res, next) => {
    try {
      const { errors, data } = validate(req.body);
      if (errors.length > 0) {
        return res.status(400).json({ success: false, message: errors[0], errors });
      }

      const duplicate = await checkDuplicate(data, null);

      if (duplicate) {
        return res.status(409).json({ success: false, message: 'An active record with this name already exists' });
      }

      const record = await Model.create({
        ...data,
        createdBy: req.user._id,
        updatedBy: req.user._id
      });

      res.status(201).json({ success: true, message: 'Record created successfully', data: record });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({ success: false, message: 'A record with this name already exists' });
      }
      next(error);
    }
  });

  // UPDATE
  router.put('/:id', requireAuth, requirePermission('Master Data', 'edit'), async (req, res, next) => {
    try {
      const { errors, data } = validate(req.body);
      if (errors.length > 0) {
        return res.status(400).json({ success: false, message: errors[0], errors });
      }

      const record = await Model.findOne({ _id: req.params.id, isDeleted: false });
      if (!record) {
        return res.status(404).json({ success: false, message: 'Record not found' });
      }

      const duplicate = await checkDuplicate(data, record._id);

      if (duplicate) {
        return res.status(409).json({ success: false, message: 'An active record with this name already exists' });
      }

      Object.assign(record, data, { updatedBy: req.user._id });
      await record.save();

      res.status(200).json({ success: true, message: 'Record updated successfully', data: record });
    } catch (error) {
      if (error.code === 11000) {
        return res.status(409).json({ success: false, message: 'A record with this name already exists' });
      }
      next(error);
    }
  });

  // STATUS TOGGLE (Activate / Deactivate)
  router.patch('/:id/status', requireAuth, requirePermission('Master Data', 'edit'), async (req, res, next) => {
    try {
      const { status } = req.body;
      const statusError = validateStatus(status) || (isBlank(status) ? 'Status is required' : null);
      if (statusError) {
        return res.status(400).json({ success: false, message: statusError });
      }

      const record = await Model.findOne({ _id: req.params.id, isDeleted: false });
      if (!record) {
        return res.status(404).json({ success: false, message: 'Record not found' });
      }

      if (status === 'Active') {
        const duplicate = await checkDuplicate(record, record._id);
        if (duplicate) {
          return res.status(409).json({ success: false, message: 'Another active record with this name already exists' });
        }
      }

      record.status = status;
      record.updatedBy = req.user._id;
      await record.save();

      res.status(200).json({ success: true, message: `Record ${status === 'Active' ? 'activated' : 'deactivated'} successfully`, data: record });
    } catch (error) {
      next(error);
    }
  });

  // SOFT DELETE
  router.delete('/:id', requireAuth, requirePermission('Master Data', 'delete'), async (req, res, next) => {
    try {
      const record = await Model.findOne({ _id: req.params.id, isDeleted: false });
      if (!record) {
        return res.status(404).json({ success: false, message: 'Record not found' });
      }

      record.isDeleted = true;
      record.status = 'Inactive';
      record.updatedBy = req.user._id;
      await record.save();

      res.status(200).json({ success: true, message: 'Record deleted successfully' });
    } catch (error) {
      next(error);
    }
  });

  return router;
}

/* ============================================================
   MASTER DATA — PER-MASTER VALIDATORS
   ============================================================ */

const categoryValidator = (body) => {
  const errors = [
    validateRequiredString(body.categoryName, 'Category name', 100),
    validateOptionalString(body.description, 'Description', 500),
    validateStatus(body.status)
  ].filter(Boolean);

  return {
    errors,
    data: {
      categoryName: (body.categoryName || '').trim(),
      description: (body.description || '').trim(),
      status: body.status || 'Active'
    }
  };
};

const brandValidator = (body) => {
  const errors = [
    validateRequiredString(body.brandName, 'Brand name', 100),
    validateOptionalString(body.description, 'Description', 500),
    validateStatus(body.status)
  ].filter(Boolean);

  return {
    errors,
    data: {
      brandName: (body.brandName || '').trim(),
      description: (body.description || '').trim(),
      status: body.status || 'Active'
    }
  };
};

const unitValidator = (body) => {
  const errors = [
    validateRequiredString(body.unitName, 'Unit name', 50),
    validateRequiredString(body.symbol, 'Symbol', 10),
    validateStatus(body.status)
  ].filter(Boolean);

  return {
    errors,
    data: {
      unitName: (body.unitName || '').trim(),
      symbol: (body.symbol || '').trim(),
      status: body.status || 'Active'
    }
  };
};

// Unit duplicate check: Unit Name and Symbol must each be unique among
// active records, case-insensitively ("Piece" / "piece" / "PIECE" are
// duplicates of one another).
async function checkUnitDuplicate(data, excludeId) {
  const nameRegex = new RegExp(`^${escapeRegex(data.unitName)}$`, 'i');
  const symbolRegex = new RegExp(`^${escapeRegex(data.symbol)}$`, 'i');

  const filter = {
    status: 'Active',
    isDeleted: false,
    $or: [{ unitName: nameRegex }, { symbol: symbolRegex }]
  };
  if (excludeId) filter._id = { $ne: excludeId };

  return Unit.findOne(filter);
}

const gstValidator = (body) => {
  const errors = [
    validateGstSlab(body.gstPercentage),
    validateStatus(body.status)
  ].filter(Boolean);

  const gstPercentage = Number(body.gstPercentage);

  return {
    errors,
    data: {
      // GST Name is always derived server-side from the percentage — the
      // client no longer sends it, and any client-supplied value is ignored.
      gstName: buildGstName(gstPercentage),
      gstPercentage,
      status: body.status || 'Active'
    }
  };
};

// GST duplicate check: gstPercentage must be unique among active records
// (numeric equality — gstName is always derived from it, so checking the
// percentage is equivalent to checking the name and avoids float/string
// formatting edge cases).
async function checkGstDuplicate(data, excludeId) {
  const filter = {
    gstPercentage: data.gstPercentage,
    status: 'Active',
    isDeleted: false
  };
  if (excludeId) filter._id = { $ne: excludeId };

  return Gst.findOne(filter);
}

const supplierValidator = (body) => {
  const errors = [
    validateRequiredString(body.supplierName, 'Supplier name', 150),
    validateOptionalString(body.contactPerson, 'Contact person', 100),
    validateMobile(body.mobileNumber),
    validateEmail(body.email),
    validateGstNumber(body.gstNumber),
    validateOptionalString(body.address, 'Address', 500),
    validateStatus(body.status)
  ].filter(Boolean);

  return {
    errors,
    data: {
      supplierName: (body.supplierName || '').trim(),
      contactPerson: (body.contactPerson || '').trim(),
      mobileNumber: (body.mobileNumber || '').trim(),
      email: (body.email || '').trim().toLowerCase(),
      gstNumber: (body.gstNumber || '').trim().toUpperCase(),
      address: (body.address || '').trim(),
      status: body.status || 'Active'
    }
  };
};

const customerTypeValidator = (body) => {
  const errors = [
    validateRequiredString(body.customerType, 'Customer type', 100),
    validateOptionalString(body.description, 'Description', 500),
    validateStatus(body.status)
  ].filter(Boolean);

  return {
    errors,
    data: {
      customerType: (body.customerType || '').trim(),
      description: (body.description || '').trim(),
      status: body.status || 'Active'
    }
  };
};

const paymentModeValidator = (body) => {
  const errors = [
    validateRequiredString(body.paymentModeName, 'Payment mode name', 100),
    validateStatus(body.status)
  ].filter(Boolean);

  return {
    errors,
    data: {
      paymentModeName: (body.paymentModeName || '').trim(),
      status: body.status || 'Active'
    }
  };
};

/* ============================================================
   PRODUCT MASTER — VALIDATION HELPERS
   ============================================================ */

function validateObjectId(value, label) {
  if (isBlank(value)) return `${label} is required`;
  if (!mongoose.Types.ObjectId.isValid(value)) return `${label} is invalid`;
  return null;
}

function validateNonNegativeNumber(value, label, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    return required ? `${label} is required` : null;
  }
  const numeric = Number(value);
  if (Number.isNaN(numeric)) return `${label} must be a number`;
  if (numeric < 0) return `${label} cannot be negative`;
  return null;
}

function validateBoolean(value, label) {
  if (value === undefined || value === null || value === '') return null;
  if (typeof value === 'boolean') return null;
  if (value === 'true' || value === 'false') return null;
  return `${label} must be true or false`;
}

function toBoolean(value, fallback = false) {
  if (typeof value === 'boolean') return value;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return fallback;
}

const WARRANTY_UNITS = ['Days', 'Months', 'Years'];

async function validateProductBody(body) {
  const errors = [
    validateRequiredString(body.productName, 'Product name', 150),
    validateRequiredString(body.sku, 'Product Code / SKU', 50),
    validateOptionalString(body.barcode, 'Barcode', 50),
    validateObjectId(body.category, 'Category'),
    validateObjectId(body.brand, 'Brand'),
    validateObjectId(body.unit, 'Unit'),
    validateObjectId(body.gst, 'GST'),
    validateOptionalString(body.description, 'Description', 1000),
    validateNonNegativeNumber(body.purchasePrice, 'Purchase price'),
    validateNonNegativeNumber(body.sellingPrice, 'Selling price'),
    validateNonNegativeNumber(body.mrp, 'MRP'),
    validateBoolean(body.discountAllowed, 'Discount Allowed'),
    validateNonNegativeNumber(body.minStockAlert, 'Minimum Stock Alert'),
    validateNonNegativeNumber(body.maxStock, 'Maximum Stock'),
    validateNonNegativeNumber(body.reorderLevel, 'Reorder Level'),
    validateBoolean(body.warrantyAvailable, 'Warranty Available'),
    validateBoolean(body.usesSerialNumber, 'Uses Serial Number'),
    validateBoolean(body.usesImeiNumber, 'Uses IMEI Number'),
    validateStatus(body.status)
  ].filter(Boolean);

  const mrp = body.mrp === undefined || body.mrp === '' ? 0 : Number(body.mrp);
  const sellingPrice = body.sellingPrice === undefined || body.sellingPrice === '' ? 0 : Number(body.sellingPrice);

  if (!errors.length && !Number.isNaN(mrp) && !Number.isNaN(sellingPrice) && mrp < sellingPrice) {
    errors.push('MRP cannot be less than Selling Price');
  }

  const warrantyAvailable = toBoolean(body.warrantyAvailable, false);

  if (warrantyAvailable) {
    const durationError = validateNonNegativeNumber(body.warrantyDuration, 'Warranty Duration', { required: true });
    if (durationError) errors.push(durationError);

    if (isBlank(body.warrantyUnit)) {
      errors.push('Warranty Unit is required');
    } else if (!WARRANTY_UNITS.includes(body.warrantyUnit)) {
      errors.push('Warranty Unit must be Days, Months, or Years');
    }
  }

  if (!errors.length) {
    const [categoryExists, brandExists, unitExists, gstExists] = await Promise.all([
      Category.exists({ _id: body.category, isDeleted: false }),
      Brand.exists({ _id: body.brand, isDeleted: false }),
      Unit.exists({ _id: body.unit, isDeleted: false }),
      Gst.exists({ _id: body.gst, isDeleted: false })
    ]);

    if (!categoryExists) errors.push('Selected Category does not exist');
    if (!brandExists) errors.push('Selected Brand does not exist');
    if (!unitExists) errors.push('Selected Unit does not exist');
    if (!gstExists) errors.push('Selected GST does not exist');
  }

  return {
    errors,
    data: {
      productName: (body.productName || '').trim(),
      sku: (body.sku || '').trim().toUpperCase(),
      barcode: (body.barcode || '').trim(),
      category: body.category,
      brand: body.brand,
      unit: body.unit,
      description: (body.description || '').trim(),
      purchasePrice: body.purchasePrice === undefined || body.purchasePrice === '' ? 0 : Number(body.purchasePrice),
      sellingPrice: sellingPrice || 0,
      mrp: mrp || 0,
      gst: body.gst,
      discountAllowed: toBoolean(body.discountAllowed, false),
      minStockAlert: body.minStockAlert === undefined || body.minStockAlert === '' ? 0 : Number(body.minStockAlert),
      maxStock: body.maxStock === undefined || body.maxStock === '' ? null : Number(body.maxStock),
      reorderLevel: body.reorderLevel === undefined || body.reorderLevel === '' ? 0 : Number(body.reorderLevel),
      warrantyAvailable,
      warrantyDuration: warrantyAvailable && body.warrantyDuration !== undefined && body.warrantyDuration !== ''
        ? Number(body.warrantyDuration)
        : null,
      warrantyUnit: warrantyAvailable ? body.warrantyUnit : null,
      usesSerialNumber: toBoolean(body.usesSerialNumber, false),
      usesImeiNumber: toBoolean(body.usesImeiNumber, false),
      status: body.status || 'Active'
    }
  };
}

/* ============================================================
   INVENTORY ENGINE — VALIDATION HELPERS
   ============================================================ */

function validatePositiveInteger(value, label, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    return required ? `${label} is required` : null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) return `${label} must be a whole number`;
  if (numeric <= 0) return `${label} must be greater than zero`;
  return null;
}

function validateNonNegativeInteger(value, label, { required = false } = {}) {
  if (value === undefined || value === null || value === '') {
    return required ? `${label} is required` : null;
  }
  const numeric = Number(value);
  if (!Number.isFinite(numeric) || !Number.isInteger(numeric)) return `${label} must be a whole number`;
  if (numeric < 0) return `${label} cannot be negative`;
  return null;
}

function validateOpeningStockBody(body) {
  const errors = [
    validateObjectId(body.product, 'Product'),
    validateNonNegativeInteger(body.quantity, 'Opening Quantity', { required: true }),
    validateNonNegativeInteger(body.minStockLevel, 'Minimum Stock Level'),
    validateNonNegativeInteger(body.maxStockLevel, 'Maximum Stock Level'),
    validateNonNegativeInteger(body.reorderLevel, 'Reorder Level')
  ].filter(Boolean);

  return {
    errors,
    data: {
      product: body.product,
      quantity: body.quantity === undefined || body.quantity === '' ? 0 : Number(body.quantity),
      minStockLevel: body.minStockLevel === undefined || body.minStockLevel === '' ? undefined : Number(body.minStockLevel),
      maxStockLevel: body.maxStockLevel === undefined || body.maxStockLevel === '' ? undefined : Number(body.maxStockLevel),
      reorderLevel: body.reorderLevel === undefined || body.reorderLevel === '' ? undefined : Number(body.reorderLevel)
    }
  };
}

const ADJUSTMENT_TYPES = ['Stock Increase', 'Stock Decrease'];

function validateStockAdjustmentBody(body) {
  const errors = [
    validateObjectId(body.product, 'Product'),
    validatePositiveInteger(body.quantity, 'Quantity', { required: true }),
    validateOptionalString(body.remarks, 'Remarks', 500)
  ].filter(Boolean);

  if (isBlank(body.adjustmentType)) {
    errors.push('Adjustment Type is required');
  } else if (!ADJUSTMENT_TYPES.includes(body.adjustmentType)) {
    errors.push('Adjustment Type must be either Stock Increase or Stock Decrease');
  }

  const reasonError = validateRequiredString(body.reason, 'Reason', 200);
  if (reasonError) errors.push(reasonError);

  return {
    errors,
    data: {
      product: body.product,
      quantity: body.quantity === undefined || body.quantity === '' ? 0 : Number(body.quantity),
      adjustmentType: body.adjustmentType,
      reason: (body.reason || '').trim(),
      remarks: (body.remarks || '').trim()
    }
  };
}

function computeStockStatus(inventory) {
  if (inventory.currentQuantity === 0) return 'Out of Stock';
  if (inventory.currentQuantity <= inventory.reorderLevel) return 'Low Stock';
  return 'In Stock';
}

/* ============================================================
   PURCHASE MANAGEMENT — VALIDATION HELPERS
   ============================================================ */

const PURCHASE_STATUSES = ['Draft', 'Finalized', 'Cancelled'];

function round2(value) {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}

function validateDate(value, label, { required = false } = {}) {
  if (isBlank(value)) return required ? `${label} is required` : null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return `${label} is invalid`;
  return null;
}

function validatePurchaseItemBody(item, index, productsById) {
  const label = `Item ${index + 1}`;
  const errors = [];

  const productIdError = validateObjectId(item.product, `${label}: Product`);
  if (productIdError) {
    errors.push(productIdError);
    return { errors, data: null };
  }

  const product = productsById.get(String(item.product));
  if (!product) {
    errors.push(`${label}: Selected product does not exist`);
    return { errors, data: null };
  }
  if (product.status !== 'Active' || product.isDeleted) {
    errors.push(`${label}: Product "${product.productName}" is not active`);
  }

  const quantityError = validatePositiveInteger(item.quantity, `${label}: Quantity`, { required: true });
  if (quantityError) errors.push(quantityError);

  const priceError = validateNonNegativeNumber(item.purchasePrice, `${label}: Purchase Price`, { required: true });
  if (priceError) errors.push(priceError);

  const discountError = validateNonNegativeNumber(item.discount, `${label}: Discount`);
  if (discountError) errors.push(discountError);

  const gstError = validateGstPercentage(item.gstPercentage === undefined || item.gstPercentage === '' ? 0 : item.gstPercentage, `${label}: GST`);
  if (item.gstPercentage !== undefined && item.gstPercentage !== '' && gstError) errors.push(gstError);

  const quantity = Number(item.quantity) || 0;
  const purchasePrice = Number(item.purchasePrice) || 0;
  const discount = item.discount === undefined || item.discount === '' ? 0 : Number(item.discount);
  const gstPercentage = item.gstPercentage === undefined || item.gstPercentage === '' ? 0 : Number(item.gstPercentage);

  const requiresIdentifiers = product.usesSerialNumber || product.usesImeiNumber;
  const identifiersRaw = Array.isArray(item.identifiers) ? item.identifiers : [];
  const identifiers = [];

  if (requiresIdentifiers && errors.length === 0) {
    const identifierType = product.usesImeiNumber ? 'IMEI' : 'Serial Number';

    if (identifiersRaw.length !== quantity) {
      errors.push(`${label}: ${identifierType} count (${identifiersRaw.length}) must equal Quantity (${quantity})`);
    }

    const seen = new Set();
    identifiersRaw.forEach((rawValue, idIndex) => {
      const value = String(rawValue || '').trim();
      if (!value) {
        errors.push(`${label}: ${identifierType} #${idIndex + 1} is required`);
        return;
      }
      if (value.length > 100) {
        errors.push(`${label}: ${identifierType} #${idIndex + 1} must not exceed 100 characters`);
        return;
      }
      const key = value.toLowerCase();
      if (seen.has(key)) {
        errors.push(`${label}: Duplicate ${identifierType} "${value}" within this purchase`);
        return;
      }
      seen.add(key);
      identifiers.push({ type: identifierType, value });
    });
  }

  if (errors.length > 0) {
    return { errors, data: null };
  }

  const subtotal = round2(quantity * purchasePrice);
  const taxableAmount = round2(subtotal - discount);
  const taxAmount = round2((taxableAmount * gstPercentage) / 100);
  const lineTotal = round2(taxableAmount + taxAmount);

  return {
    errors: [],
    data: {
      product: item.product,
      quantity,
      purchasePrice,
      discount,
      gstPercentage,
      taxAmount,
      subtotal,
      lineTotal,
      identifiers
    }
  };
}

async function validatePurchaseBody(body, { requireItems = true } = {}) {
  const errors = [
    validateObjectId(body.supplier, 'Supplier'),
    validateDate(body.purchaseDate, 'Purchase Date'),
    validateOptionalString(body.supplierInvoiceNumber, 'Supplier Invoice Number', 100),
    validateDate(body.supplierInvoiceDate, 'Supplier Invoice Date'),
    validateDate(body.dueDate, 'Due Date'),
    validateOptionalString(body.remarks, 'Remarks', 500)
  ].filter(Boolean);

  if (!isBlank(body.paymentMode)) {
    const paymentModeError = validateObjectId(body.paymentMode, 'Payment Mode');
    if (paymentModeError) errors.push(paymentModeError);
  }

  const items = Array.isArray(body.items) ? body.items : [];

  if (requireItems && items.length === 0) {
    errors.push('At least one purchase item is required');
  }

  if (errors.length > 0) {
    return { errors, data: null };
  }

  const [supplier, paymentMode] = await Promise.all([
    Supplier.findOne({ _id: body.supplier, isDeleted: false }),
    isBlank(body.paymentMode) ? null : PaymentMode.findOne({ _id: body.paymentMode, isDeleted: false })
  ]);

  if (!supplier) {
    errors.push('Selected supplier does not exist');
  } else if (supplier.status !== 'Active') {
    errors.push('Selected supplier is not active');
  }

  if (!isBlank(body.paymentMode) && !paymentMode) {
    errors.push('Selected payment mode does not exist');
  }

  const productIds = [...new Set(items.map((item) => item.product).filter((id) => mongoose.Types.ObjectId.isValid(id)))];
  const products = await Product.find({ _id: { $in: productIds } });
  const productsById = new Map(products.map((p) => [String(p._id), p]));

  const seenProductIds = new Set();
  const itemsData = [];

  items.forEach((item, index) => {
    const productKey = String(item.product || '');
    if (productKey && seenProductIds.has(productKey)) {
      errors.push(`Item ${index + 1}: Product already added in another line. Merge quantities into a single line instead`);
      return;
    }
    seenProductIds.add(productKey);

    const { errors: itemErrors, data: itemData } = validatePurchaseItemBody(item, index, productsById);
    if (itemErrors.length > 0) {
      errors.push(...itemErrors);
    } else {
      itemsData.push(itemData);
    }
  });

  if (errors.length > 0) {
    return { errors, data: null };
  }

  const subtotalAmount = round2(itemsData.reduce((sum, item) => sum + item.subtotal, 0));
  const discountAmount = round2(itemsData.reduce((sum, item) => sum + item.discount, 0));
  const taxAmount = round2(itemsData.reduce((sum, item) => sum + item.taxAmount, 0));
  const grandTotal = round2(itemsData.reduce((sum, item) => sum + item.lineTotal, 0));

  return {
    errors: [],
    data: {
      supplier: body.supplier,
      purchaseDate: body.purchaseDate ? new Date(body.purchaseDate) : new Date(),
      supplierInvoiceNumber: (body.supplierInvoiceNumber || '').trim(),
      supplierInvoiceDate: isBlank(body.supplierInvoiceDate) ? null : new Date(body.supplierInvoiceDate),
      paymentMode: isBlank(body.paymentMode) ? null : body.paymentMode,
      dueDate: isBlank(body.dueDate) ? null : new Date(body.dueDate),
      remarks: (body.remarks || '').trim(),
      items: itemsData,
      subtotalAmount,
      discountAmount,
      taxAmount,
      grandTotal
    }
  };
}

function validateCancellationBody(body) {
  const errors = [];
  const reasonError = validateRequiredString(body.cancellationReason, 'Cancellation Reason', 500);
  if (reasonError) errors.push(reasonError);

  return {
    errors,
    data: {
      cancellationReason: (body.cancellationReason || '').trim()
    }
  };
}

const PURCHASE_PRODUCT_POPULATE = {
  path: 'items.product',
  select: 'productName sku barcode category brand unit status usesSerialNumber usesImeiNumber',
  populate: [
    { path: 'category', select: 'categoryName' },
    { path: 'brand', select: 'brandName' },
    { path: 'unit', select: 'unitName symbol' }
  ]
};

function populatePurchaseQuery(query) {
  return query
    .populate('supplier', 'supplierName contactPerson mobileNumber email gstNumber')
    .populate('paymentMode', 'paymentModeName')
    .populate('createdBy', 'fullName')
    .populate('updatedBy', 'fullName')
    .populate(PURCHASE_PRODUCT_POPULATE);
}

/* ============================================================
   BILLING ENGINE (POS) — VALIDATION HELPERS
   ============================================================ */

const BILL_STATUSES = ['Draft', 'Finalized', 'Cancelled'];

function validateBillItemBody(item, index, productsById) {
  const label = `Item ${index + 1}`;
  const errors = [];

  const productIdError = validateObjectId(item.product, `${label}: Product`);
  if (productIdError) {
    errors.push(productIdError);
    return { errors, data: null };
  }

  const product = productsById.get(String(item.product));
  if (!product) {
    errors.push(`${label}: Selected product does not exist`);
    return { errors, data: null };
  }
  if (product.status !== 'Active' || product.isDeleted) {
    errors.push(`${label}: Product "${product.productName}" is not active`);
  }

  const quantityError = validatePositiveInteger(item.quantity, `${label}: Quantity`, { required: true });
  if (quantityError) errors.push(quantityError);

  const priceError = validateNonNegativeNumber(item.sellingPrice, `${label}: Selling Price`, { required: true });
  if (priceError) errors.push(priceError);

  const discountError = validateNonNegativeNumber(item.discount, `${label}: Discount`);
  if (discountError) errors.push(discountError);

  const gstError = validateGstPercentage(item.gstPercentage === undefined || item.gstPercentage === '' ? 0 : item.gstPercentage, `${label}: GST`);
  if (item.gstPercentage !== undefined && item.gstPercentage !== '' && gstError) errors.push(gstError);

  const quantity = Number(item.quantity) || 0;
  const sellingPrice = Number(item.sellingPrice) || 0;
  const discount = item.discount === undefined || item.discount === '' ? 0 : Number(item.discount);
  const gstPercentage = item.gstPercentage === undefined || item.gstPercentage === '' ? 0 : Number(item.gstPercentage);

  const requiresIdentifiers = product.usesSerialNumber || product.usesImeiNumber;
  const identifiersRaw = Array.isArray(item.identifiers) ? item.identifiers : [];
  const identifierValues = [];

  if (requiresIdentifiers && errors.length === 0) {
    const identifierType = product.usesImeiNumber ? 'IMEI' : 'Serial Number';

    if (identifiersRaw.length !== quantity) {
      errors.push(`${label}: ${identifierType} count (${identifiersRaw.length}) must equal Quantity (${quantity})`);
    }

    const seen = new Set();
    identifiersRaw.forEach((rawValue, idIndex) => {
      const value = String(rawValue || '').trim();
      if (!value) {
        errors.push(`${label}: ${identifierType} #${idIndex + 1} is required`);
        return;
      }
      const key = value.toLowerCase();
      if (seen.has(key)) {
        errors.push(`${label}: Duplicate ${identifierType} "${value}" within this bill`);
        return;
      }
      seen.add(key);
      identifierValues.push(value);
    });
  }

  if (errors.length > 0) {
    return { errors, data: null };
  }

  const subtotal = round2(quantity * sellingPrice);
  const taxableAmount = round2(subtotal - discount);
  const taxAmount = round2((taxableAmount * gstPercentage) / 100);
  const lineTotal = round2(taxableAmount + taxAmount);

  return {
    errors: [],
    data: {
      product: item.product,
      quantity,
      sellingPrice,
      discount,
      gstPercentage,
      taxAmount,
      subtotal,
      lineTotal,
      identifierValues,
      requiresIdentifiers,
      identifierType: product.usesImeiNumber ? 'IMEI' : 'Serial Number',
      // Product Snapshot (Phase 20.5) — provisional at draft time, made
      // authoritative by finalizeBillInternal() at finalization. Read
      // from the `product` doc already fetched above; no extra query.
      productNameSnapshot: product.productName || '',
      skuSnapshot: product.sku || '',
      unitSymbolSnapshot: (product.unit && product.unit.symbol) || '',
      usesSerialNumberSnapshot: Boolean(product.usesSerialNumber),
      usesImeiNumberSnapshot: Boolean(product.usesImeiNumber)
    }
  };
}

async function validateBillBody(body, { requireItems = true } = {}) {
  const errors = [
    validateDate(body.billDate, 'Bill Date'),
    validateOptionalString(body.customerName, 'Customer Name', 150),
    validateOptionalString(body.remarks, 'Remarks', 500)
  ].filter(Boolean);

  if (!isBlank(body.customerMobile)) {
    const mobileError = validateMobile(body.customerMobile, 'Customer Mobile');
    if (mobileError) errors.push(mobileError);
  }

  if (!isBlank(body.customer)) {
    const customerError = validateObjectId(body.customer, 'Customer');
    if (customerError) errors.push(customerError);
  }

  if (!isBlank(body.paymentMode)) {
    const paymentModeError = validateObjectId(body.paymentMode, 'Payment Mode');
    if (paymentModeError) errors.push(paymentModeError);
  }

  const items = Array.isArray(body.items) ? body.items : [];

  if (requireItems && items.length === 0) {
    errors.push('At least one bill item is required');
  }

  if (errors.length > 0) {
    return { errors, data: null };
  }

  const paymentMode = isBlank(body.paymentMode) ? null : await PaymentMode.findOne({ _id: body.paymentMode, isDeleted: false });

  if (!isBlank(body.paymentMode) && !paymentMode) {
    errors.push('Selected payment mode does not exist');
  }

  const linkedCustomer = isBlank(body.customer) ? null : await Customer.findOne({ _id: body.customer, isDeleted: false });

  if (!isBlank(body.customer) && !linkedCustomer) {
    errors.push('Selected customer does not exist');
  }

  const productIds = [...new Set(items.map((item) => item.product).filter((id) => mongoose.Types.ObjectId.isValid(id)))];
  // .populate('unit') added for Invoice Engine Phase 20.5 (Product
  // Snapshot) so validateBillItemBody can capture the unit symbol into
  // the bill item snapshot — same query, one extra populated field.
  const products = await Product.find({ _id: { $in: productIds } }).populate('unit', 'unitName symbol');
  const productsById = new Map(products.map((p) => [String(p._id), p]));

  const seenProductIds = new Set();
  const itemsData = [];

  items.forEach((item, index) => {
    const productKey = String(item.product || '');
    if (productKey && seenProductIds.has(productKey)) {
      errors.push(`Item ${index + 1}: Product already added in another line. Merge quantities into a single line instead`);
      return;
    }
    seenProductIds.add(productKey);

    const { errors: itemErrors, data: itemData } = validateBillItemBody(item, index, productsById);
    if (itemErrors.length > 0) {
      errors.push(...itemErrors);
    } else {
      itemsData.push(itemData);
    }
  });

  if (errors.length > 0) {
    return { errors, data: null };
  }

  const subtotalAmount = round2(itemsData.reduce((sum, item) => sum + item.subtotal, 0));
  const discountAmount = round2(itemsData.reduce((sum, item) => sum + item.discount, 0));
  const taxAmount = round2(itemsData.reduce((sum, item) => sum + item.taxAmount, 0));
  const grandTotal = round2(itemsData.reduce((sum, item) => sum + item.lineTotal, 0));

  return {
    errors: [],
    data: {
      billDate: body.billDate ? new Date(body.billDate) : new Date(),
      customer: linkedCustomer ? linkedCustomer._id : null,
      customerName: linkedCustomer ? linkedCustomer.customerName : (body.customerName || '').trim(),
      customerMobile: linkedCustomer ? linkedCustomer.mobileNumber : (body.customerMobile || '').trim(),
      paymentMode: isBlank(body.paymentMode) ? null : body.paymentMode,
      remarks: (body.remarks || '').trim(),
      items: itemsData,
      subtotalAmount,
      discountAmount,
      taxAmount,
      grandTotal
    }
  };
}

function validateBillCancellationBody(body) {
  const errors = [];
  const reasonError = validateRequiredString(body.cancellationReason, 'Cancellation Reason', 500);
  if (reasonError) errors.push(reasonError);

  return {
    errors,
    data: {
      cancellationReason: (body.cancellationReason || '').trim()
    }
  };
}

const BILL_PRODUCT_POPULATE = {
  path: 'items.product',
  select: 'productName sku barcode category brand unit status usesSerialNumber usesImeiNumber warrantyAvailable warrantyDuration warrantyUnit',
  populate: [
    { path: 'category', select: 'categoryName' },
    { path: 'brand', select: 'brandName' },
    { path: 'unit', select: 'unitName symbol' }
  ]
};

function populateBillQuery(query) {
  return query
    // Extended for Invoice Engine Phase 20.4 (Customer Information): the
    // print route needs more than name/mobile to render the optional
    // Address / GSTIN / Customer Type / Customer Code rows. All of it is
    // fetched in this single populate — no additional queries are added
    // anywhere else. Every one of these fields is optional on Customer
    // itself, so a missing field here just means the Invoice Engine
    // hides that row; it is never treated as an error.
    .populate({
      path: 'customer',
      select: 'customerCode customerName mobileNumber address gstNumber businessName customerType',
      populate: { path: 'customerType', select: 'customerType' }
    })
    .populate('paymentMode', 'paymentModeName')
    .populate('salesperson', 'fullName')
    .populate('createdBy', 'fullName')
    .populate('updatedBy', 'fullName')
    .populate(BILL_PRODUCT_POPULATE);
}

/* ============================================================
   EXPRESS APP SETUP
   ============================================================ */

const app = express();

app.use(helmet());
app.use(cors({ origin: CORS_ORIGIN }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

app.get('/api/health', (req, res) => {
  const dbState = mongoose.connection.readyState;
  const isDbConnected = dbState === 1;

  res.status(200).json({
    success: true,
    server: 'running',
    database: isDbConnected ? 'connected' : 'disconnected'
  });
});

app.use('/api/auth', authRoutes);
app.use('/api/setup', setupRoutes);

app.use('/api/master-data/categories', buildMasterRouter({
  Model: Category,
  uniqueField: 'categoryName',
  searchFields: ['categoryName', 'description'],
  validate: categoryValidator
}));

app.use('/api/master-data/brands', buildMasterRouter({
  Model: Brand,
  uniqueField: 'brandName',
  searchFields: ['brandName', 'description'],
  validate: brandValidator
}));

app.use('/api/master-data/units', buildMasterRouter({
  Model: Unit,
  uniqueField: 'unitName',
  searchFields: ['unitName', 'symbol'],
  validate: unitValidator,
  checkDuplicate: checkUnitDuplicate
}));

app.use('/api/master-data/gst', buildMasterRouter({
  Model: Gst,
  uniqueField: 'gstPercentage',
  searchFields: ['gstName'],
  validate: gstValidator,
  checkDuplicate: checkGstDuplicate
}));

/* ============================================================
   MASTER DATA — DEFAULT UNITS / GST QUICK-SETUP
   ============================================================
   Optional first-time-setup helper: inserts the standard Unit and GST
   slab records if the corresponding collection is empty. Never inserts
   duplicates — each collection is seeded independently and only when
   completely empty (including inactive/soft-deleted-aware count).
   ============================================================ */

const DEFAULT_UNITS = [
  { unitName: 'Piece', symbol: 'Pc' },
  { unitName: 'Box', symbol: 'Box' },
  { unitName: 'Packet', symbol: 'Pkt' },
  { unitName: 'Set', symbol: 'Set' },
  { unitName: 'Pair', symbol: 'Pair' },
  { unitName: 'Meter', symbol: 'Mtr' },
  { unitName: 'Roll', symbol: 'Roll' },
  { unitName: 'Kilogram', symbol: 'Kg' },
  { unitName: 'Gram', symbol: 'Gm' },
  { unitName: 'Liter', symbol: 'Ltr' }
];

app.get('/api/master-data/defaults/status', requireAuth, async (req, res, next) => {
  try {
    const [unitCount, gstCount] = await Promise.all([
      Unit.countDocuments({ isDeleted: false }),
      Gst.countDocuments({ isDeleted: false })
    ]);

    res.status(200).json({
      success: true,
      unitsEmpty: unitCount === 0,
      gstEmpty: gstCount === 0
    });
  } catch (error) {
    next(error);
  }
});

app.post('/api/master-data/defaults/seed', requireAuth, requireRole('Owner', 'Manager'), async (req, res, next) => {
  try {
    const [unitCount, gstCount] = await Promise.all([
      Unit.countDocuments({ isDeleted: false }),
      Gst.countDocuments({ isDeleted: false })
    ]);

    let unitsInserted = 0;
    let gstInserted = 0;

    if (unitCount === 0) {
      const docs = DEFAULT_UNITS.map((unit) => ({
        ...unit,
        createdBy: req.user._id,
        updatedBy: req.user._id
      }));
      const created = await Unit.insertMany(docs);
      unitsInserted = created.length;
    }

    if (gstCount === 0) {
      const docs = GST_ALLOWED_SLABS.map((percentage) => ({
        gstName: buildGstName(percentage),
        gstPercentage: percentage,
        createdBy: req.user._id,
        updatedBy: req.user._id
      }));
      const created = await Gst.insertMany(docs);
      gstInserted = created.length;
    }

    res.status(200).json({
      success: true,
      message: 'Default master data seeded successfully',
      unitsInserted,
      gstInserted
    });
  } catch (error) {
    next(error);
  }
});

app.use('/api/master-data/suppliers', buildMasterRouter({
  Model: Supplier,
  uniqueField: 'supplierName',
  searchFields: ['supplierName', 'contactPerson', 'mobileNumber', 'email', 'gstNumber'],
  validate: supplierValidator
}));

app.use('/api/master-data/customer-types', buildMasterRouter({
  Model: CustomerType,
  uniqueField: 'customerType',
  searchFields: ['customerType', 'description'],
  validate: customerTypeValidator
}));

app.use('/api/master-data/payment-modes', buildMasterRouter({
  Model: PaymentMode,
  uniqueField: 'paymentModeName',
  searchFields: ['paymentModeName'],
  validate: paymentModeValidator
}));

/* ============================================================
   PRODUCT MASTER — ROUTES
   ============================================================ */

const productRouter = express.Router();

productRouter.get('/', requireAuth, requirePermission('Product Master', 'view'), async (req, res, next) => {
  try {
    const { page, limit, skip } = buildPagination(req.query);
    const mongoFilter = { isDeleted: false };

    if (req.query.status && ['Active', 'Inactive'].includes(req.query.status)) {
      mongoFilter.status = req.query.status;
    }

    if (req.query.category && mongoose.Types.ObjectId.isValid(req.query.category)) {
      mongoFilter.category = req.query.category;
    }

    if (req.query.brand && mongoose.Types.ObjectId.isValid(req.query.brand)) {
      mongoFilter.brand = req.query.brand;
    }

    if (req.query.search) {
      const safe = escapeRegex(String(req.query.search).trim());
      if (safe) {
        mongoFilter.$or = [
          { productName: { $regex: safe, $options: 'i' } },
          { sku: { $regex: safe, $options: 'i' } },
          { barcode: { $regex: safe, $options: 'i' } }
        ];
      }
    }

    const [records, totalRecords] = await Promise.all([
      Product.find(mongoFilter)
        .populate('category', 'categoryName')
        .populate('brand', 'brandName')
        .populate('unit', 'unitName symbol')
        .populate('gst', 'gstName gstPercentage')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Product.countDocuments(mongoFilter)
    ]);

    res.status(200).json({
      success: true,
      data: records,
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages: Math.max(Math.ceil(totalRecords / limit), 1)
      }
    });
  } catch (error) {
    next(error);
  }
});

productRouter.get('/:id', requireAuth, requirePermission('Product Master', 'view'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const record = await Product.findOne({ _id: req.params.id, isDeleted: false })
      .populate('category', 'categoryName')
      .populate('brand', 'brandName')
      .populate('unit', 'unitName symbol')
      .populate('gst', 'gstName gstPercentage');

    if (!record) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    res.status(200).json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
});

productRouter.post('/', requireAuth, requirePermission('Product Master', 'create'), async (req, res, next) => {
  try {
    const { errors, data } = await validateProductBody(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }

    const duplicateSku = await Product.findOne({ sku: data.sku, isDeleted: false });
    if (duplicateSku) {
      return res.status(409).json({ success: false, message: 'A product with this SKU already exists' });
    }

    if (data.barcode) {
      const duplicateBarcode = await Product.findOne({ barcode: data.barcode, isDeleted: false });
      if (duplicateBarcode) {
        return res.status(409).json({ success: false, message: 'A product with this barcode already exists' });
      }
    }

    const record = await Product.create({
      ...data,
      createdBy: req.user._id,
      updatedBy: req.user._id
    });

    res.status(201).json({ success: true, message: 'Product created successfully', data: record });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'A product with this SKU or barcode already exists' });
    }
    next(error);
  }
});

productRouter.put('/:id', requireAuth, requirePermission('Product Master', 'edit'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const { errors, data } = await validateProductBody(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }

    const record = await Product.findOne({ _id: req.params.id, isDeleted: false });
    if (!record) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const duplicateSku = await Product.findOne({
      _id: { $ne: record._id },
      sku: data.sku,
      isDeleted: false
    });
    if (duplicateSku) {
      return res.status(409).json({ success: false, message: 'A product with this SKU already exists' });
    }

    if (data.barcode) {
      const duplicateBarcode = await Product.findOne({
        _id: { $ne: record._id },
        barcode: data.barcode,
        isDeleted: false
      });
      if (duplicateBarcode) {
        return res.status(409).json({ success: false, message: 'A product with this barcode already exists' });
      }
    }

    Object.assign(record, data, { updatedBy: req.user._id });
    await record.save();

    res.status(200).json({ success: true, message: 'Product updated successfully', data: record });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'A product with this SKU or barcode already exists' });
    }
    next(error);
  }
});

productRouter.patch('/:id/status', requireAuth, requirePermission('Product Master', 'edit'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const { status } = req.body;
    const statusError = validateStatus(status) || (isBlank(status) ? 'Status is required' : null);
    if (statusError) {
      return res.status(400).json({ success: false, message: statusError });
    }

    const record = await Product.findOne({ _id: req.params.id, isDeleted: false });
    if (!record) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    record.status = status;
    record.updatedBy = req.user._id;
    await record.save();

    res.status(200).json({
      success: true,
      message: `Product ${status === 'Active' ? 'activated' : 'deactivated'} successfully`,
      data: record
    });
  } catch (error) {
    next(error);
  }
});

app.use('/api/products', productRouter);

/* ============================================================
   INVENTORY ENGINE — ROUTES
   ============================================================ */

const inventoryRouter = express.Router();

async function serializeInventory(inventoryDoc) {
  const record = inventoryDoc.toJSON();
  record.availableQuantity = Math.max(inventoryDoc.currentQuantity - inventoryDoc.reservedQuantity, 0);
  record.stockStatus = computeStockStatus(inventoryDoc);
  return record;
}

// LIST (search + pagination + filters)
inventoryRouter.get('/', requireAuth, requirePermission('Inventory', 'view'), async (req, res, next) => {
  try {
    const { page, limit, skip } = buildPagination(req.query);

    const productFilter = { isDeleted: false };
    if (req.query.category && mongoose.Types.ObjectId.isValid(req.query.category)) {
      productFilter.category = req.query.category;
    }
    if (req.query.brand && mongoose.Types.ObjectId.isValid(req.query.brand)) {
      productFilter.brand = req.query.brand;
    }
    if (req.query.active === 'true') {
      productFilter.status = 'Active';
    }

    if (req.query.search) {
      const safe = escapeRegex(String(req.query.search).trim());
      if (safe) {
        productFilter.$or = [
          { productName: { $regex: safe, $options: 'i' } },
          { sku: { $regex: safe, $options: 'i' } },
          { barcode: { $regex: safe, $options: 'i' } }
        ];
      }
    }

    const matchingProductIds = await Product.find(productFilter).distinct('_id');

    const inventoryFilter = { isDeleted: false, product: { $in: matchingProductIds } };

    let records = await Inventory.find(inventoryFilter)
      .populate({
        path: 'product',
        select: 'productName sku barcode category brand status',
        populate: [
          { path: 'category', select: 'categoryName' },
          { path: 'brand', select: 'brandName' }
        ]
      })
      .sort({ lastUpdated: -1 });

    if (req.query.stockStatus && ['In Stock', 'Low Stock', 'Out of Stock'].includes(req.query.stockStatus)) {
      records = records.filter((record) => computeStockStatus(record) === req.query.stockStatus);
    }

    const totalRecords = records.length;
    const paginatedRecords = records.slice(skip, skip + limit);
    const serialized = await Promise.all(paginatedRecords.map(serializeInventory));

    res.status(200).json({
      success: true,
      data: serialized,
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages: Math.max(Math.ceil(totalRecords / limit), 1)
      }
    });
  } catch (error) {
    next(error);
  }
});

// INVENTORY DETAILS
inventoryRouter.get('/:id', requireAuth, requirePermission('Inventory', 'view'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Inventory record not found' });
    }

    const record = await Inventory.findOne({ _id: req.params.id, isDeleted: false })
      .populate({
        path: 'product',
        select: 'productName sku barcode category brand unit status',
        populate: [
          { path: 'category', select: 'categoryName' },
          { path: 'brand', select: 'brandName' },
          { path: 'unit', select: 'unitName symbol' }
        ]
      });

    if (!record) {
      return res.status(404).json({ success: false, message: 'Inventory record not found' });
    }

    res.status(200).json({ success: true, data: await serializeInventory(record) });
  } catch (error) {
    next(error);
  }
});

// CREATE OPENING STOCK
inventoryRouter.post('/opening-stock', requireAuth, requirePermission('Inventory', 'create'), async (req, res, next) => {
  try {
    const { errors, data } = validateOpeningStockBody(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }

    const product = await Product.findOne({ _id: data.product, isDeleted: false });
    if (!product) {
      return res.status(400).json({ success: false, message: 'Selected product does not exist' });
    }
    if (product.status !== 'Active') {
      return res.status(400).json({ success: false, message: 'Cannot create inventory for an inactive product' });
    }

    const existing = await Inventory.findOne({ product: data.product, isDeleted: false });
    if (existing) {
      return res.status(409).json({ success: false, message: 'An inventory record already exists for this product. Opening stock can only be created once' });
    }

    const minStockLevel = data.minStockLevel !== undefined ? data.minStockLevel : product.minStockAlert;
    const maxStockLevel = data.maxStockLevel !== undefined ? data.maxStockLevel : product.maxStock;
    const reorderLevel = data.reorderLevel !== undefined ? data.reorderLevel : product.reorderLevel;

    const inventory = await Inventory.create({
      product: data.product,
      currentQuantity: data.quantity,
      reservedQuantity: 0,
      minStockLevel: minStockLevel || 0,
      maxStockLevel: maxStockLevel === undefined ? null : maxStockLevel,
      reorderLevel: reorderLevel || 0,
      openingStockCreated: true,
      lastUpdated: new Date(),
      createdBy: req.user._id,
      updatedBy: req.user._id
    });

    await InventoryMovement.create({
      product: data.product,
      inventory: inventory._id,
      movementType: 'Stock Increase',
      quantity: data.quantity,
      previousStock: 0,
      newStock: data.quantity,
      referenceType: 'Opening Stock',
      referenceId: inventory._id,
      reason: 'Opening Stock',
      remarks: '',
      performedBy: req.user._id
    });

    const populated = await Inventory.findById(inventory._id).populate({
      path: 'product',
      select: 'productName sku barcode category brand status',
      populate: [
        { path: 'category', select: 'categoryName' },
        { path: 'brand', select: 'brandName' }
      ]
    });

    res.status(201).json({ success: true, message: 'Opening stock created successfully', data: await serializeInventory(populated) });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'An inventory record already exists for this product' });
    }
    next(error);
  }
});

// STOCK ADJUSTMENT
inventoryRouter.post('/adjustment', requireAuth, requirePermission('Inventory', 'create'), async (req, res, next) => {
  try {
    const { errors, data } = validateStockAdjustmentBody(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }

    const inventory = await Inventory.findOne({ product: data.product, isDeleted: false });
    if (!inventory) {
      return res.status(404).json({ success: false, message: 'No inventory record found for this product. Create opening stock first' });
    }

    const previousStock = inventory.currentQuantity;
    let newStock;

    if (data.adjustmentType === 'Stock Increase') {
      newStock = previousStock + data.quantity;
    } else {
      newStock = previousStock - data.quantity;
      if (newStock < 0) {
        return res.status(400).json({ success: false, message: 'Insufficient stock. This adjustment would result in negative stock' });
      }
    }

    inventory.currentQuantity = newStock;
    inventory.lastUpdated = new Date();
    inventory.updatedBy = req.user._id;
    await inventory.save();

    await InventoryMovement.create({
      product: data.product,
      inventory: inventory._id,
      movementType: data.adjustmentType,
      quantity: data.quantity,
      previousStock,
      newStock,
      referenceType: 'Manual Adjustment',
      referenceId: inventory._id,
      reason: data.reason,
      remarks: data.remarks,
      performedBy: req.user._id
    });

    const populated = await Inventory.findById(inventory._id).populate({
      path: 'product',
      select: 'productName sku barcode category brand status',
      populate: [
        { path: 'category', select: 'categoryName' },
        { path: 'brand', select: 'brandName' }
      ]
    });

    res.status(200).json({ success: true, message: 'Stock adjustment recorded successfully', data: await serializeInventory(populated) });
  } catch (error) {
    next(error);
  }
});

// MOVEMENT HISTORY (by product)
inventoryRouter.get('/:id/movements', requireAuth, requirePermission('Inventory', 'view'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Inventory record not found' });
    }

    const inventory = await Inventory.findOne({ _id: req.params.id, isDeleted: false });
    if (!inventory) {
      return res.status(404).json({ success: false, message: 'Inventory record not found' });
    }

    const { page, limit, skip } = buildPagination(req.query);

    const [movements, totalRecords] = await Promise.all([
      InventoryMovement.find({ inventory: inventory._id })
        .populate('performedBy', 'fullName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      InventoryMovement.countDocuments({ inventory: inventory._id })
    ]);

    res.status(200).json({
      success: true,
      data: movements,
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages: Math.max(Math.ceil(totalRecords / limit), 1)
      }
    });
  } catch (error) {
    next(error);
  }
});

app.use('/api/inventory', inventoryRouter);

/* ============================================================
   PURCHASE MANAGEMENT — ROUTES
   ============================================================ */

const purchaseRouter = express.Router();

// LIST (search + pagination + filters)
purchaseRouter.get('/', requireAuth, requirePermission('Purchase', 'view'), async (req, res, next) => {
  try {
    const { page, limit, skip } = buildPagination(req.query);
    const mongoFilter = {};

    if (req.query.status && PURCHASE_STATUSES.includes(req.query.status)) {
      mongoFilter.status = req.query.status;
    }

    if (req.query.supplier && mongoose.Types.ObjectId.isValid(req.query.supplier)) {
      mongoFilter.supplier = req.query.supplier;
    }

    if (req.query.paymentMode && mongoose.Types.ObjectId.isValid(req.query.paymentMode)) {
      mongoFilter.paymentMode = req.query.paymentMode;
    }

    if (req.query.dateFrom || req.query.dateTo) {
      mongoFilter.purchaseDate = {};
      if (req.query.dateFrom && !Number.isNaN(new Date(req.query.dateFrom).getTime())) {
        mongoFilter.purchaseDate.$gte = new Date(req.query.dateFrom);
      }
      if (req.query.dateTo && !Number.isNaN(new Date(req.query.dateTo).getTime())) {
        const dateTo = new Date(req.query.dateTo);
        dateTo.setHours(23, 59, 59, 999);
        mongoFilter.purchaseDate.$lte = dateTo;
      }
      if (Object.keys(mongoFilter.purchaseDate).length === 0) delete mongoFilter.purchaseDate;
    }

    if (req.query.search) {
      const safe = escapeRegex(String(req.query.search).trim());
      if (safe) {
        const matchingSupplierIds = await Supplier.find({
          supplierName: { $regex: safe, $options: 'i' }
        }).distinct('_id');

        mongoFilter.$or = [
          { purchaseNumber: { $regex: safe, $options: 'i' } },
          { supplierInvoiceNumber: { $regex: safe, $options: 'i' } },
          { supplier: { $in: matchingSupplierIds } }
        ];
      }
    }

    const [records, totalRecords] = await Promise.all([
      populatePurchaseQuery(Purchase.find(mongoFilter))
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Purchase.countDocuments(mongoFilter)
    ]);

    res.status(200).json({
      success: true,
      data: records,
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages: Math.max(Math.ceil(totalRecords / limit), 1)
      }
    });
  } catch (error) {
    next(error);
  }
});

// GET ONE
purchaseRouter.get('/:id', requireAuth, requirePermission('Purchase', 'view'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Purchase not found' });
    }

    const record = await populatePurchaseQuery(Purchase.findOne({ _id: req.params.id }));

    if (!record) {
      return res.status(404).json({ success: false, message: 'Purchase not found' });
    }

    res.status(200).json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
});

// CREATE (Draft or immediately Finalized based on `action`)
purchaseRouter.post('/', requireAuth, requirePermission('Purchase', 'create'), async (req, res, next) => {
  const action = req.body.action === 'finalize' ? 'finalize' : 'draft';

  try {
    const { errors, data } = await validatePurchaseBody(req.body, { requireItems: action === 'finalize' });
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }

    const purchaseNumber = await generatePurchaseNumber();

    const purchase = await Purchase.create({
      purchaseNumber,
      ...data,
      status: 'Draft',
      createdBy: req.user._id,
      updatedBy: req.user._id
    });

    if (action === 'finalize') {
      try {
        await finalizePurchaseInternal(purchase, req.user._id);
      } catch (finalizeError) {
        return next(finalizeError);
      }
    }

    const populated = await populatePurchaseQuery(Purchase.findOne({ _id: purchase._id }));

    res.status(201).json({
      success: true,
      message: action === 'finalize' ? 'Purchase finalized successfully' : 'Purchase saved as draft',
      data: populated
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'A purchase with this number already exists. Please try again' });
    }
    next(error);
  }
});

// UPDATE (Draft only)
purchaseRouter.put('/:id', requireAuth, requirePermission('Purchase', 'edit'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Purchase not found' });
    }

    const purchase = await Purchase.findOne({ _id: req.params.id });
    if (!purchase) {
      return res.status(404).json({ success: false, message: 'Purchase not found' });
    }

    if (purchase.status !== 'Draft') {
      return res.status(409).json({ success: false, message: `Cannot edit a purchase that is ${purchase.status.toLowerCase()}` });
    }

    const action = req.body.action === 'finalize' ? 'finalize' : 'draft';

    const { errors, data } = await validatePurchaseBody(req.body, { requireItems: action === 'finalize' });
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }

    Object.assign(purchase, data, { updatedBy: req.user._id });
    await purchase.save();

    if (action === 'finalize') {
      try {
        await finalizePurchaseInternal(purchase, req.user._id);
      } catch (finalizeError) {
        return next(finalizeError);
      }
    }

    const populated = await populatePurchaseQuery(Purchase.findOne({ _id: purchase._id }));

    res.status(200).json({
      success: true,
      message: action === 'finalize' ? 'Purchase finalized successfully' : 'Draft updated successfully',
      data: populated
    });
  } catch (error) {
    next(error);
  }
});

// FINALIZE
async function finalizePurchaseInternal(purchase, userId) {
  if (purchase.status !== 'Draft') {
    const err = new Error(`Cannot finalize a purchase that is ${purchase.status.toLowerCase()}`);
    err.status = 409;
    throw err;
  }

  if (!purchase.items || purchase.items.length === 0) {
    const err = new Error('Cannot finalize a purchase with no items');
    err.status = 400;
    throw err;
  }

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      for (const item of purchase.items) {
        const product = await Product.findOne({ _id: item.product, isDeleted: false }).session(session);
        if (!product || product.status !== 'Active') {
          const err = new Error('One or more products in this purchase are no longer active');
          err.status = 400;
          throw err;
        }

        let inventory = await Inventory.findOne({ product: item.product, isDeleted: false }).session(session);

        const previousStock = inventory ? inventory.currentQuantity : 0;
        const newStock = previousStock + item.quantity;

        if (inventory) {
          inventory.currentQuantity = newStock;
          inventory.lastUpdated = new Date();
          inventory.updatedBy = userId;
          await inventory.save({ session });
        } else {
          const created = await Inventory.create([{
            product: item.product,
            currentQuantity: newStock,
            reservedQuantity: 0,
            minStockLevel: product.minStockAlert || 0,
            maxStockLevel: product.maxStock === undefined ? null : product.maxStock,
            reorderLevel: product.reorderLevel || 0,
            openingStockCreated: true,
            lastUpdated: new Date(),
            createdBy: userId,
            updatedBy: userId
          }], { session });
          inventory = created[0];
        }

        await InventoryMovement.create([{
          product: item.product,
          inventory: inventory._id,
          movementType: 'Stock Increase',
          quantity: item.quantity,
          previousStock,
          newStock,
          referenceType: 'Purchase',
          referenceId: purchase._id,
          reason: `Purchase ${purchase.purchaseNumber}`,
          remarks: '',
          performedBy: userId
        }], { session });

        if (item.identifiers && item.identifiers.length > 0) {
          await ProductIdentifier.create(
            item.identifiers.map((identifier) => ({
              product: item.product,
              type: identifier.type,
              value: identifier.value,
              status: 'In Stock',
              purchase: purchase._id
            })),
            { session, ordered: true }
          );
        }
      }

      purchase.status = 'Finalized';
      purchase.finalizedAt = new Date();
      purchase.updatedBy = userId;
      await purchase.save({ session });
    });
  } finally {
    await session.endSession();
  }
}

purchaseRouter.post('/:id/finalize', requireAuth, requirePermission('Purchase', 'edit'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Purchase not found' });
    }

    const purchase = await Purchase.findOne({ _id: req.params.id });
    if (!purchase) {
      return res.status(404).json({ success: false, message: 'Purchase not found' });
    }

    await finalizePurchaseInternal(purchase, req.user._id);

    const populated = await populatePurchaseQuery(Purchase.findOne({ _id: purchase._id }));

    res.status(200).json({ success: true, message: 'Purchase finalized successfully', data: populated });
  } catch (error) {
    next(error);
  }
});

// CANCEL (reverses inventory for Finalized purchases; simply marks Draft as Cancelled)
purchaseRouter.post('/:id/cancel', requireAuth, requirePermission('Purchase', 'edit'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Purchase not found' });
    }

    const { errors, data } = validateCancellationBody(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }

    const purchase = await Purchase.findOne({ _id: req.params.id });
    if (!purchase) {
      return res.status(404).json({ success: false, message: 'Purchase not found' });
    }

    if (purchase.status === 'Cancelled') {
      return res.status(409).json({ success: false, message: 'Purchase is already cancelled' });
    }

    if (purchase.status === 'Draft') {
      purchase.status = 'Cancelled';
      purchase.cancelledAt = new Date();
      purchase.cancellationReason = data.cancellationReason;
      purchase.updatedBy = req.user._id;
      await purchase.save();

      const populated = await populatePurchaseQuery(Purchase.findOne({ _id: purchase._id }));
      return res.status(200).json({ success: true, message: 'Draft purchase cancelled successfully', data: populated });
    }

    // Finalized: reverse inventory changes
    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        for (const item of purchase.items) {
          const inventory = await Inventory.findOne({ product: item.product, isDeleted: false }).session(session);

          if (!inventory) {
            const err = new Error('Inventory record missing for a purchased product. Cannot reverse cleanly');
            err.status = 409;
            throw err;
          }

          const previousStock = inventory.currentQuantity;
          const newStock = previousStock - item.quantity;

          if (newStock < 0) {
            const err = new Error('Cancelling this purchase would result in negative stock. Adjust inventory manually before cancelling');
            err.status = 409;
            throw err;
          }

          inventory.currentQuantity = newStock;
          inventory.lastUpdated = new Date();
          inventory.updatedBy = req.user._id;
          await inventory.save({ session });

          await InventoryMovement.create([{
            product: item.product,
            inventory: inventory._id,
            movementType: 'Stock Decrease',
            quantity: item.quantity,
            previousStock,
            newStock,
            referenceType: 'Purchase',
            referenceId: purchase._id,
            reason: `Cancellation of Purchase ${purchase.purchaseNumber}`,
            remarks: data.cancellationReason,
            performedBy: req.user._id
          }], { session });

          if (item.identifiers && item.identifiers.length > 0) {
            const values = item.identifiers.map((identifier) => identifier.value);
            const identifiersInUse = await ProductIdentifier.find({
              product: item.product,
              value: { $in: values },
              purchase: purchase._id,
              status: 'Sold'
            }).session(session);

            if (identifiersInUse.length > 0) {
              const err = new Error('Cannot cancel this purchase because one or more serial numbers/IMEIs have already been sold');
              err.status = 409;
              throw err;
            }

            await ProductIdentifier.deleteMany({
              product: item.product,
              value: { $in: values },
              purchase: purchase._id,
              status: 'In Stock'
            }).session(session);
          }
        }

        purchase.status = 'Cancelled';
        purchase.cancelledAt = new Date();
        purchase.cancellationReason = data.cancellationReason;
        purchase.updatedBy = req.user._id;
        await purchase.save({ session });
      });
    } finally {
      await session.endSession();
    }

    const populated = await populatePurchaseQuery(Purchase.findOne({ _id: purchase._id }));
    res.status(200).json({ success: true, message: 'Purchase cancelled and inventory reversed successfully', data: populated });
  } catch (error) {
    next(error);
  }
});

app.use('/api/purchases', purchaseRouter);

/* ============================================================
   BILLING ENGINE (POS) — ROUTES
   ============================================================ */

const billingRouter = express.Router();

/* ============================================================
   SELLABLE PRODUCTS — BILLING PRODUCT SOURCE (Inventory-backed)
   ============================================================
   Billing must never read Product Master directly for its product
   selector. A product is sellable only when:
     - Product is Active and not deleted
     - An Inventory record exists for it
     - Inventory is not deleted / is Active
     - currentQuantity > 0
   Search (name/SKU/barcode) is applied on the product side first,
   then intersected with the inventory filter, mirroring the same
   two-step pattern used by the Inventory Engine's own list route.
   ============================================================ */

billingRouter.get('/sellable-products', requireAuth, requirePermission('Billing', 'view'), async (req, res, next) => {
  try {
    const productFilter = { isDeleted: false, status: 'Active' };

    if (req.query.search) {
      const safe = escapeRegex(String(req.query.search).trim());
      if (safe) {
        productFilter.$or = [
          { productName: { $regex: safe, $options: 'i' } },
          { sku: { $regex: safe, $options: 'i' } },
          { barcode: { $regex: safe, $options: 'i' } }
        ];
      }
    }

    const matchingProductIds = await Product.find(productFilter).distinct('_id');

    const inventoryFilter = {
      isDeleted: false,
      status: 'Active',
      currentQuantity: { $gt: 0 },
      product: { $in: matchingProductIds }
    };

    const limit = Math.min(Number(req.query.limit) || 50, 200);

    const inventoryRecords = await Inventory.find(inventoryFilter)
      .select('product currentQuantity reservedQuantity')
      .populate({
        path: 'product',
        select: 'productName sku barcode sellingPrice gst brand unit usesSerialNumber usesImeiNumber',
        populate: [
          { path: 'gst', select: 'gstPercentage' },
          { path: 'brand', select: 'brandName' },
          { path: 'unit', select: 'unitName symbol' }
        ]
      })
      .sort({ lastUpdated: -1 })
      .limit(limit);

    const products = inventoryRecords
      .filter((record) => record.product)
      .map((record) => {
        const product = record.product.toJSON();
        product.availableQuantity = Math.max(record.currentQuantity - record.reservedQuantity, 0);
        return product;
      });

    res.status(200).json({ success: true, data: products });
  } catch (error) {
    next(error);
  }
});

// LIST (search + pagination + filters)
billingRouter.get('/', requireAuth, requirePermission('Billing', 'view'), async (req, res, next) => {
  try {
    const { page, limit, skip } = buildPagination(req.query);
    const mongoFilter = {};

    if (req.query.status && BILL_STATUSES.includes(req.query.status)) {
      mongoFilter.status = req.query.status;
    }

    if (req.query.paymentMode && mongoose.Types.ObjectId.isValid(req.query.paymentMode)) {
      mongoFilter.paymentMode = req.query.paymentMode;
    }

    if (req.query.salesperson && mongoose.Types.ObjectId.isValid(req.query.salesperson)) {
      mongoFilter.salesperson = req.query.salesperson;
    }

    if (req.query.dateFrom || req.query.dateTo) {
      mongoFilter.billDate = {};
      if (req.query.dateFrom && !Number.isNaN(new Date(req.query.dateFrom).getTime())) {
        mongoFilter.billDate.$gte = new Date(req.query.dateFrom);
      }
      if (req.query.dateTo && !Number.isNaN(new Date(req.query.dateTo).getTime())) {
        const dateTo = new Date(req.query.dateTo);
        dateTo.setHours(23, 59, 59, 999);
        mongoFilter.billDate.$lte = dateTo;
      }
      if (Object.keys(mongoFilter.billDate).length === 0) delete mongoFilter.billDate;
    }

    if (req.query.search) {
      const safe = escapeRegex(String(req.query.search).trim());
      if (safe) {
        mongoFilter.$or = [
          { billNumber: { $regex: safe, $options: 'i' } },
          { customerName: { $regex: safe, $options: 'i' } },
          { customerMobile: { $regex: safe, $options: 'i' } }
        ];
      }
    }

    const [records, totalRecords] = await Promise.all([
      populateBillQuery(Bill.find(mongoFilter))
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Bill.countDocuments(mongoFilter)
    ]);

    res.status(200).json({
      success: true,
      data: records,
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages: Math.max(Math.ceil(totalRecords / limit), 1)
      }
    });
  } catch (error) {
    next(error);
  }
});

// NEXT BILL NUMBER (preview only, does not consume the sequence)
billingRouter.get('/next-number', requireAuth, requirePermission('Billing', 'view'), async (req, res, next) => {
  try {
    const series = await NumberSeries.findOne({ seriesKey: 'billNumber' });
    const billNumber = series
      ? await previewNextSeriesNumber(series)
      : await (async () => {
          const counter = await Counter.findOne({ key: 'billNumber' });
          const nextSeq = (counter ? counter.seq : 0) + 1;
          return `INV-${String(nextSeq).padStart(6, '0')}`;
        })();
    res.status(200).json({ success: true, data: { billNumber } });
  } catch (error) {
    next(error);
  }
});

// AVAILABLE IDENTIFIERS FOR A PRODUCT (In Stock only)
billingRouter.get('/available-identifiers/:productId', requireAuth, requirePermission('Billing', 'view'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.productId)) {
      return res.status(404).json({ success: false, message: 'Product not found' });
    }

    const identifiers = await ProductIdentifier.find({
      product: req.params.productId,
      status: 'In Stock'
    }).sort({ createdAt: 1 });

    res.status(200).json({ success: true, data: identifiers });
  } catch (error) {
    next(error);
  }
});

// GET ONE
billingRouter.get('/:id', requireAuth, requirePermission('Billing', 'view'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
    }

    const record = await populateBillQuery(Bill.findOne({ _id: req.params.id }));

    if (!record) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
    }

    res.status(200).json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
});

// CREATE (Draft or immediately Finalized based on `action`)
billingRouter.post('/', requireAuth, requirePermission('Billing', 'create'), async (req, res, next) => {
  const action = req.body.action === 'finalize' ? 'finalize' : 'draft';

  try {
    const { errors, data } = await validateBillBody(req.body, { requireItems: action === 'finalize' });
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }

    const billNumber = await generateBillNumber();
    const strippedItems = data.items.map(({ identifierValues, requiresIdentifiers, identifierType, ...rest }) => rest);

    const bill = await Bill.create({
      billNumber,
      billDate: data.billDate,
      customer: data.customer,
      customerName: data.customerName,
      customerMobile: data.customerMobile,
      paymentMode: data.paymentMode,
      remarks: data.remarks,
      items: strippedItems,
      subtotalAmount: data.subtotalAmount,
      discountAmount: data.discountAmount,
      taxAmount: data.taxAmount,
      grandTotal: data.grandTotal,
      status: 'Draft',
      salesperson: req.user._id,
      createdBy: req.user._id,
      updatedBy: req.user._id
    });

    if (action === 'finalize') {
      try {
        await finalizeBillInternal(bill, data.items, req.user._id);
      } catch (finalizeError) {
        return next(finalizeError);
      }
    }

    const populated = await populateBillQuery(Bill.findOne({ _id: bill._id }));

    res.status(201).json({
      success: true,
      message: action === 'finalize' ? 'Bill finalized successfully' : 'Bill saved as draft',
      data: populated
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'A bill with this number already exists. Please try again' });
    }
    next(error);
  }
});

// UPDATE (Draft only)
billingRouter.put('/:id', requireAuth, requirePermission('Billing', 'edit'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
    }

    const bill = await Bill.findOne({ _id: req.params.id });
    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
    }

    if (bill.status !== 'Draft') {
      return res.status(409).json({ success: false, message: `Cannot edit a bill that is ${bill.status.toLowerCase()}` });
    }

    const action = req.body.action === 'finalize' ? 'finalize' : 'draft';

    const { errors, data } = await validateBillBody(req.body, { requireItems: action === 'finalize' });
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }

    const strippedItems = data.items.map(({ identifierValues, requiresIdentifiers, identifierType, ...rest }) => rest);

    bill.billDate = data.billDate;
    bill.customer = data.customer;
    bill.customerName = data.customerName;
    bill.customerMobile = data.customerMobile;
    bill.paymentMode = data.paymentMode;
    bill.remarks = data.remarks;
    bill.items = strippedItems;
    bill.subtotalAmount = data.subtotalAmount;
    bill.discountAmount = data.discountAmount;
    bill.taxAmount = data.taxAmount;
    bill.grandTotal = data.grandTotal;
    bill.updatedBy = req.user._id;
    await bill.save();

    if (action === 'finalize') {
      try {
        await finalizeBillInternal(bill, data.items, req.user._id);
      } catch (finalizeError) {
        return next(finalizeError);
      }
    }

    const populated = await populateBillQuery(Bill.findOne({ _id: bill._id }));

    res.status(200).json({
      success: true,
      message: action === 'finalize' ? 'Bill finalized successfully' : 'Draft updated successfully',
      data: populated
    });
  } catch (error) {
    next(error);
  }
});

// FINALIZE — validates stock/identifiers, reduces inventory, creates movements,
// updates ProductIdentifier status, and activates warranty, all in one transaction.
async function finalizeBillInternal(bill, validatedItems, userId) {
  if (bill.status !== 'Draft') {
    const err = new Error(`Cannot finalize a bill that is ${bill.status.toLowerCase()}`);
    err.status = 409;
    throw err;
  }

  if (!validatedItems || validatedItems.length === 0) {
    const err = new Error('Cannot finalize a bill with no items');
    err.status = 400;
    throw err;
  }

  const session = await mongoose.startSession();

  try {
    await session.withTransaction(async () => {
      await resolveOrCreateBillCustomer(bill, session, userId);

      for (let i = 0; i < validatedItems.length; i += 1) {
        const item = validatedItems[i];
        // .populate('unit') added for Invoice Engine Phase 20.5 (Product
        // Snapshot): this is the authoritative, once-only capture of
        // Product Name / SKU / Unit / identifier-requirement at the
        // moment of finalization — same query already run here for the
        // active-status check, just with the unit symbol included.
        const product = await Product.findOne({ _id: item.product, isDeleted: false })
          .populate('unit', 'symbol')
          .session(session);
        if (!product || product.status !== 'Active') {
          const err = new Error('One or more products in this bill are no longer active');
          err.status = 400;
          throw err;
        }

        // Product Snapshot (Phase 20.5) — stamped once, here, at the
        // moment of finalization. Matched by product ID rather than
        // array index since bill.items was persisted independently of
        // validatedItems; this is the authoritative snapshot and is
        // never touched again after this save.
        const billItem = bill.items.find((bi) => String(bi.product) === String(item.product));
        if (billItem) {
          billItem.productNameSnapshot = product.productName || '';
          billItem.skuSnapshot = product.sku || '';
          billItem.unitSymbolSnapshot = (product.unit && product.unit.symbol) || '';
          billItem.usesSerialNumberSnapshot = Boolean(product.usesSerialNumber);
          billItem.usesImeiNumberSnapshot = Boolean(product.usesImeiNumber);
        }

        const inventory = await Inventory.findOne({ product: item.product, isDeleted: false }).session(session);

        if (!inventory || inventory.currentQuantity < item.quantity) {
          const err = new Error(`Insufficient stock for "${product.productName}". Available: ${inventory ? inventory.currentQuantity : 0}, Required: ${item.quantity}`);
          err.status = 400;
          throw err;
        }

        let matchedIdentifiers = [];

        if (item.requiresIdentifiers) {
          matchedIdentifiers = await ProductIdentifier.find({
            product: item.product,
            value: { $in: item.identifierValues },
            status: 'In Stock'
          }).session(session);

          if (matchedIdentifiers.length !== item.identifierValues.length) {
            const err = new Error(`One or more selected ${item.identifierType}s for "${product.productName}" are not available in stock`);
            err.status = 400;
            throw err;
          }
        }

        // Stamp the resolved identifiers (with their ProductIdentifier ref)
        // onto the persisted bill item. The draft-time value only had
        // {type, value} from the picker; this is the authoritative,
        // finalize-time write that Bill View and the Invoice Engine
        // actually read from, so without it the IMEI/Serial Number never
        // shows up after finalization even though stock/warranty were
        // correctly matched above.
        if (billItem && item.requiresIdentifiers) {
          billItem.identifiers = matchedIdentifiers.map((identifier) => ({
            type: item.identifierType,
            value: identifier.value,
            productIdentifier: identifier._id
          }));
        }

        const previousStock = inventory.currentQuantity;
        const newStock = previousStock - item.quantity;

        inventory.currentQuantity = newStock;
        inventory.lastUpdated = new Date();
        inventory.updatedBy = userId;
        await inventory.save({ session });

        await InventoryMovement.create([{
          product: item.product,
          inventory: inventory._id,
          movementType: 'Stock Decrease',
          quantity: item.quantity,
          previousStock,
          newStock,
          referenceType: 'Billing',
          referenceId: bill._id,
          reason: `Sale ${bill.billNumber}`,
          remarks: '',
          performedBy: userId
        }], { session });

        if (matchedIdentifiers.length > 0) {
          const saleDate = new Date();
          await ProductIdentifier.updateMany(
            { _id: { $in: matchedIdentifiers.map((i) => i._id) } },
            {
              $set: {
                status: 'Sold',
                bill: bill._id,
                customerName: bill.customerName,
                customerMobile: bill.customerMobile,
                saleDate
              }
            },
            { session }
          );
        }

        if (product.warrantyAvailable && product.warrantyDuration) {
          const warrantyStart = new Date();
          const warrantyEnd = new Date(warrantyStart);
          if (product.warrantyUnit === 'Days') warrantyEnd.setDate(warrantyEnd.getDate() + product.warrantyDuration);
          else if (product.warrantyUnit === 'Months') warrantyEnd.setMonth(warrantyEnd.getMonth() + product.warrantyDuration);
          else if (product.warrantyUnit === 'Years') warrantyEnd.setFullYear(warrantyEnd.getFullYear() + product.warrantyDuration);

          if (matchedIdentifiers.length > 0) {
            await Warranty.create(
              matchedIdentifiers.map((identifier) => ({
                product: item.product,
                productIdentifier: identifier._id,
                bill: bill._id,
                customerName: bill.customerName,
                customerMobile: bill.customerMobile,
                warrantyStart,
                warrantyEnd,
                status: 'Active'
              })),
              { session, ordered: true }
            );
          } else {
            await Warranty.create([{
              product: item.product,
              productIdentifier: null,
              bill: bill._id,
              customerName: bill.customerName,
              customerMobile: bill.customerMobile,
              warrantyStart,
              warrantyEnd,
              status: 'Active'
            }], { session });
          }
        }
      }

      // Footer Snapshot (Phase 20.8) — captured once, here, at the exact
      // moment of finalization, from Print Settings as they exist right
      // now. This mirrors the Product Snapshot read above: a single read
      // of the current singleton, stamped onto the bill and never
      // recomputed afterwards, so a later edit to Print Settings cannot
      // retroactively change what an already-finalized invoice shows on
      // reprint (the Reprint Rule).
      const printSettingsAtFinalization = await getOrCreateSingleton(PrintSettings);
      bill.footerSnapshot = {
        captured: true,
        footerMessage: printSettingsAtFinalization.footerMessage || '',
        termsAndConditions: Array.isArray(printSettingsAtFinalization.termsAndConditions)
          ? printSettingsAtFinalization.termsAndConditions.slice()
          : []
      };

      bill.status = 'Finalized';
      bill.finalizedAt = new Date();
      bill.updatedBy = userId;
      await bill.save({ session });
    });
  } finally {
    await session.endSession();
  }
}

billingRouter.post('/:id/finalize', requireAuth, requirePermission('Billing', 'edit'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
    }

    const bill = await Bill.findOne({ _id: req.params.id });
    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
    }

    const productIds = [...new Set(bill.items.map((item) => String(item.product)))];
    const products = await Product.find({ _id: { $in: productIds } });
    const productsById = new Map(products.map((p) => [String(p._id), p]));

    const validatedItems = bill.items.map((item) => {
      const product = productsById.get(String(item.product));
      const requiresIdentifiers = Boolean(product && (product.usesSerialNumber || product.usesImeiNumber));
      return {
        product: item.product,
        quantity: item.quantity,
        requiresIdentifiers,
        identifierType: product && product.usesImeiNumber ? 'IMEI' : 'Serial Number',
        identifierValues: (item.identifiers || []).map((identifier) => identifier.value)
      };
    });

    await finalizeBillInternal(bill, validatedItems, req.user._id);

    const populated = await populateBillQuery(Bill.findOne({ _id: bill._id }));

    res.status(200).json({ success: true, message: 'Bill finalized successfully', data: populated });
  } catch (error) {
    next(error);
  }
});

// CANCEL (reverses inventory, identifiers, and warranty for Finalized bills; simply marks Draft as Cancelled)
billingRouter.post('/:id/cancel', requireAuth, requirePermission('Billing', 'edit'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
    }

    const { errors, data } = validateBillCancellationBody(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }

    const bill = await Bill.findOne({ _id: req.params.id });
    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
    }

    if (bill.status === 'Cancelled') {
      return res.status(409).json({ success: false, message: 'Bill is already cancelled' });
    }

    if (bill.status === 'Draft') {
      bill.status = 'Cancelled';
      bill.cancelledAt = new Date();
      bill.cancellationReason = data.cancellationReason;
      bill.updatedBy = req.user._id;
      await bill.save();

      const populated = await populateBillQuery(Bill.findOne({ _id: bill._id }));
      return res.status(200).json({ success: true, message: 'Draft bill cancelled successfully', data: populated });
    }

    // Finalized: reverse inventory, identifiers, and warranty
    const session = await mongoose.startSession();

    try {
      await session.withTransaction(async () => {
        for (const item of bill.items) {
          const inventory = await Inventory.findOne({ product: item.product, isDeleted: false }).session(session);

          if (!inventory) {
            const err = new Error('Inventory record missing for a sold product. Cannot reverse cleanly');
            err.status = 409;
            throw err;
          }

          const previousStock = inventory.currentQuantity;
          const newStock = previousStock + item.quantity;

          inventory.currentQuantity = newStock;
          inventory.lastUpdated = new Date();
          inventory.updatedBy = req.user._id;
          await inventory.save({ session });

          await InventoryMovement.create([{
            product: item.product,
            inventory: inventory._id,
            movementType: 'Stock Increase',
            quantity: item.quantity,
            previousStock,
            newStock,
            referenceType: 'Billing',
            referenceId: bill._id,
            reason: `Cancellation of Bill ${bill.billNumber}`,
            remarks: data.cancellationReason,
            performedBy: req.user._id
          }], { session });

          if (item.identifiers && item.identifiers.length > 0) {
            const values = item.identifiers.map((identifier) => identifier.value);
            await ProductIdentifier.updateMany(
              { product: item.product, value: { $in: values }, bill: bill._id, status: 'Sold' },
              {
                $set: {
                  status: 'In Stock',
                  bill: null,
                  customerName: '',
                  customerMobile: '',
                  saleDate: null
                }
              },
              { session }
            );
          }
        }

        await Warranty.updateMany(
          { bill: bill._id, status: 'Active' },
          { $set: { status: 'Reversed' } },
          { session }
        );

        bill.status = 'Cancelled';
        bill.cancelledAt = new Date();
        bill.cancellationReason = data.cancellationReason;
        bill.updatedBy = req.user._id;
        await bill.save({ session });
      });
    } finally {
      await session.endSession();
    }

    const populated = await populateBillQuery(Bill.findOne({ _id: bill._id }));
    res.status(200).json({ success: true, message: 'Bill cancelled and inventory reversed successfully', data: populated });
  } catch (error) {
    next(error);
  }
});

/* ============================================================
   BILLING — INVOICE PRINT (Print Engine, Invoice document only)
   ============================================================
   Server-side HTML render so reprints always use the same stored
   Bill data — never recomputed differently. PrintSettings /
   BusinessProfile / AppSettings are read internally here (not via
   a second authenticated call) so a Cashier with Billing "print"
   permission but no Settings access can still print invoices.
   ============================================================ */

// escapeHtml / formatMoneyForPrint / INVOICE_PAPER_CSS / renderInvoiceHtml
// were extracted to services/invoiceEngine.js (Invoice Engine, Phase 20.1).
// Output is unchanged — see invoiceEngine.renderInvoice() below, called
// from the GET /:id/print route in place of the old inline function.

function validatePrintRecordBody(body) {
  const errors = [];

  if (!['Success', 'Failed'].includes(body.status)) {
    errors.push('Print status must be Success or Failed');
  }

  const copies = Number(body.copies);
  if (!Number.isInteger(copies) || copies < 1) {
    errors.push('Copies must be a positive integer');
  }

  if (errors.length > 0) {
    return { errors, data: null };
  }

  return {
    errors: [],
    data: {
      printerName: (body.printerName || '').trim(),
      copies,
      status: body.status,
      failureReason: (body.failureReason || '').trim()
    }
  };
}

// RENDER INVOICE HTML (Finalized bills only)
billingRouter.get('/:id/print', requireAuth, requirePermission('Billing', 'print'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
    }

    const bill = await populateBillQuery(Bill.findOne({ _id: req.params.id }));

    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
    }

    if (bill.status !== 'Finalized') {
      return res.status(409).json({ success: false, message: 'Only finalized bills can be printed' });
    }

    // Invoice Engine Phase 20.7 (Warranty Information): fetched here,
    // once, the same way businessProfile/printSettings/appSettings
    // already are, and handed to the Invoice Engine as data — no
    // dedicated /api/warranty read endpoint exists (only the Reports
    // module queries Warranty directly today, the same pattern used
    // here). Only this bill's own Warranty records are needed; nothing
    // is written, recalculated, or reused from another bill.
    const [businessProfile, printSettings, appSettings, warranties] = await Promise.all([
      getOrCreateSingleton(BusinessProfile),
      getOrCreateSingleton(PrintSettings),
      getOrCreateSingleton(AppSettings),
      Warranty.find({ bill: bill._id })
    ]);

    // Phase 20.12 (Live Invoice Preview): an optional ?templateKey= query
    // param lets a caller ask for a specific template's HTML (e.g. the
    // preview's A4/A5 switcher) without touching the shop's saved Print
    // Settings → Invoice Template. This is the exact same override
    // invoiceEngine.renderInvoice()/resolveTemplate() already accepted —
    // nothing new in the engine, just exposing it here. Omitting the
    // param preserves today's behavior exactly (falls through to Print
    // Settings as before), so the existing manual/auto print flow in
    // billing.js is completely unaffected.
    const requestedTemplateKey = typeof req.query.templateKey === 'string' && req.query.templateKey
      ? req.query.templateKey
      : undefined;

    let html;
    try {
      html = invoiceEngine.renderInvoice({
        bill,
        businessProfile,
        printSettings,
        appSettings,
        warranties,
        templateKey: requestedTemplateKey,
        logger
      });
    } catch (engineError) {
      if (engineError.code === 'INVOICE_BUSINESS_PROFILE_NOT_CONFIGURED') {
        return res.status(409).json({ success: false, message: engineError.message, code: engineError.code });
      }
      throw engineError;
    }

    res.status(200).json({
      success: true,
      data: {
        html,
        printerName: printSettings.printerName,
        invoicePaperSize: printSettings.invoicePaperSize,
        invoiceTemplate: printSettings.invoiceTemplate,
        printPreviewEnabled: printSettings.printPreviewEnabled,
        autoPrintEnabled: printSettings.autoPrintEnabled,
        billNumber: bill.billNumber
      }
    });
  } catch (error) {
    next(error);
  }
});

// RECORD A PRINT (called by the frontend after the Electron print job completes)
billingRouter.post('/:id/print', requireAuth, requirePermission('Billing', 'print'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
    }

    const bill = await Bill.findOne({ _id: req.params.id });

    if (!bill) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
    }

    const { errors, data } = validatePrintRecordBody(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }

    const record = await PrintHistory.create({
      documentType: 'Invoice',
      documentId: bill._id,
      documentNumber: bill.billNumber,
      printedBy: req.user._id,
      printerName: data.printerName,
      copies: data.copies,
      status: data.status,
      failureReason: data.failureReason
    });

    res.status(201).json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
});

// PRINT HISTORY FOR A BILL (reprint list)
billingRouter.get('/:id/print-history', requireAuth, requirePermission('Billing', 'print'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Bill not found' });
    }

    const records = await PrintHistory.find({ documentType: 'Invoice', documentId: req.params.id })
      .sort({ createdAt: -1 })
      .populate('printedBy', 'fullName');

    res.status(200).json({ success: true, data: records });
  } catch (error) {
    next(error);
  }
});

app.use('/api/billing', billingRouter);

/* ============================================================
   CUSTOMER MANAGEMENT — VALIDATION
   ============================================================ */

function validateDateOnly(value, label) {
  if (isBlank(value)) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return `${label} is invalid`;
  return null;
}

async function validateCustomerBody(body, { currentId = null } = {}) {
  const errors = [
    validateObjectId(body.customerType, 'Customer Type'),
    validateRequiredString(body.customerName, 'Customer Name', 150),
    validateOptionalString(body.businessName, 'Business Name', 150),
    validateDateOnly(body.dateOfBirth, 'Date of Birth'),
    validateDateOnly(body.anniversary, 'Anniversary')
  ].filter(Boolean);

  const mobileError = validateMobile(body.mobileNumber, 'Mobile Number');
  if (mobileError) errors.push(mobileError);

  if (!isBlank(body.alternateMobile)) {
    const alternateMobileError = validateMobile(body.alternateMobile, 'Alternate Mobile');
    if (alternateMobileError) errors.push(alternateMobileError);
  }

  const emailError = validateEmail(body.email, 'Email');
  if (emailError) errors.push(emailError);

  const gstError = validateGstNumber(body.gstNumber, 'GST Number');
  if (gstError) errors.push(gstError);

  const address = body.address && typeof body.address === 'object' ? body.address : {};
  const addressErrors = [
    validateOptionalString(address.addressLine1, 'Address Line 1', 200),
    validateOptionalString(address.addressLine2, 'Address Line 2', 200),
    validateOptionalString(address.city, 'City', 100),
    validateOptionalString(address.state, 'State', 100)
  ].filter(Boolean);
  errors.push(...addressErrors);

  if (!isBlank(address.pincode) && !/^[0-9]{4,10}$/.test(String(address.pincode).trim())) {
    errors.push('Pincode must be a valid postal code');
  }

  const statusError = validateStatus(body.status);
  if (statusError) errors.push(statusError);

  if (errors.length > 0) {
    return { errors, data: null };
  }

  const customerType = await CustomerType.findOne({ _id: body.customerType, isDeleted: false });
  if (!customerType) {
    errors.push('Selected customer type does not exist');
  }

  const trimmedMobile = String(body.mobileNumber).trim();
  const duplicateMobile = await Customer.findOne({
    _id: { $ne: currentId },
    mobileNumber: trimmedMobile,
    isDeleted: false
  });
  if (duplicateMobile) {
    errors.push('A customer with this Mobile Number already exists');
  }

  const trimmedEmail = (body.email || '').trim().toLowerCase();
  if (trimmedEmail) {
    const duplicateEmail = await Customer.findOne({
      _id: { $ne: currentId },
      email: trimmedEmail,
      isDeleted: false
    });
    if (duplicateEmail) {
      errors.push('A customer with this Email already exists');
    }
  }

  const trimmedGst = (body.gstNumber || '').trim().toUpperCase();
  if (trimmedGst) {
    const duplicateGst = await Customer.findOne({
      _id: { $ne: currentId },
      gstNumber: trimmedGst,
      isDeleted: false
    });
    if (duplicateGst) {
      errors.push('A customer with this GST Number already exists');
    }
  }

  if (errors.length > 0) {
    return { errors, data: null };
  }

  return {
    errors: [],
    data: {
      customerType: body.customerType,
      customerName: String(body.customerName).trim(),
      mobileNumber: trimmedMobile,
      alternateMobile: (body.alternateMobile || '').trim(),
      email: trimmedEmail,
      dateOfBirth: isBlank(body.dateOfBirth) ? null : new Date(body.dateOfBirth),
      anniversary: isBlank(body.anniversary) ? null : new Date(body.anniversary),
      address: {
        addressLine1: (address.addressLine1 || '').trim(),
        addressLine2: (address.addressLine2 || '').trim(),
        city: (address.city || '').trim(),
        state: (address.state || '').trim(),
        pincode: (address.pincode || '').trim()
      },
      gstNumber: trimmedGst,
      businessName: (body.businessName || '').trim(),
      ...(currentId ? { status: body.status || 'Active' } : {})
    }
  };
}

function populateCustomerQuery(query) {
  return query.populate('customerType', 'customerType');
}

/* ============================================================
   CUSTOMER MANAGEMENT — ROUTES
   ============================================================ */

const customerRouter = express.Router();

// LIST (search + pagination + filters)
customerRouter.get('/', requireAuth, requirePermission('Customers', 'view'), async (req, res, next) => {
  try {
    const { page, limit, skip } = buildPagination(req.query);
    const mongoFilter = { isDeleted: false };

    if (req.query.status && ['Active', 'Inactive'].includes(req.query.status)) {
      mongoFilter.status = req.query.status;
    }

    if (req.query.customerType && mongoose.Types.ObjectId.isValid(req.query.customerType)) {
      mongoFilter.customerType = req.query.customerType;
    }

    if (req.query.city) {
      const safeCity = escapeRegex(String(req.query.city).trim());
      if (safeCity) {
        mongoFilter['address.city'] = { $regex: safeCity, $options: 'i' };
      }
    }

    if (req.query.search) {
      const safe = escapeRegex(String(req.query.search).trim());
      if (safe) {
        mongoFilter.$or = [
          { customerName: { $regex: safe, $options: 'i' } },
          { mobileNumber: { $regex: safe, $options: 'i' } },
          { customerCode: { $regex: safe, $options: 'i' } },
          { gstNumber: { $regex: safe, $options: 'i' } }
        ];
      }
    }

    const [records, totalRecords] = await Promise.all([
      populateCustomerQuery(Customer.find(mongoFilter))
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Customer.countDocuments(mongoFilter)
    ]);

    res.status(200).json({
      success: true,
      data: records,
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages: Math.max(Math.ceil(totalRecords / limit), 1)
      }
    });
  } catch (error) {
    next(error);
  }
});

// LOOKUP BY EXACT MOBILE NUMBER (Billing — auto customer lookup)
// Placed before GET /:id so this literal path isn't swallowed by the
// :id param route. Uses an exact match on the indexed mobileNumber
// field and returns only the fields Billing actually needs, rather
// than the heavier paginated/regex search used by the customer picker.
customerRouter.get('/lookup/by-mobile/:mobile', requireAuth, requirePermission('Customers', 'view'), async (req, res, next) => {
  try {
    const mobile = String(req.params.mobile || '').trim();

    if (!MOBILE_PATTERN.test(mobile)) {
      return res.status(400).json({ success: false, message: 'Mobile number must be a valid 10-digit number' });
    }

    const customer = await Customer.findOne({ mobileNumber: mobile, isDeleted: false, status: 'Active' })
      .select('customerName mobileNumber customerCode');

    if (!customer) {
      return res.status(200).json({ success: true, data: null });
    }

    res.status(200).json({ success: true, data: customer });
  } catch (error) {
    next(error);
  }
});

// GET ONE
customerRouter.get('/:id', requireAuth, requirePermission('Customers', 'view'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const record = await populateCustomerQuery(Customer.findOne({ _id: req.params.id, isDeleted: false }));

    if (!record) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    res.status(200).json({ success: true, data: record });
  } catch (error) {
    next(error);
  }
});

// PURCHASE HISTORY / PROFILE SUMMARY (calculated dynamically from Billing)
customerRouter.get('/:id/profile', requireAuth, requirePermission('Customers', 'view'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const customer = await populateCustomerQuery(Customer.findOne({ _id: req.params.id, isDeleted: false }));
    if (!customer) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const finalizedFilter = { customer: customer._id, status: 'Finalized' };

    const [summaryAgg, lastBill, recentBills] = await Promise.all([
      Bill.aggregate([
        { $match: finalizedFilter },
        {
          $group: {
            _id: null,
            totalBills: { $sum: 1 },
            totalPurchaseAmount: { $sum: '$grandTotal' }
          }
        }
      ]),
      Bill.findOne(finalizedFilter).sort({ billDate: -1 }),
      Bill.find(finalizedFilter)
        .sort({ billDate: -1 })
        .limit(10)
        .populate('items.product', 'productName sku')
        .select('billNumber billDate grandTotal items status')
    ]);

    const summary = summaryAgg[0] || { totalBills: 0, totalPurchaseAmount: 0 };

    const purchasedProductsMap = new Map();
    recentBills.forEach((bill) => {
      bill.items.forEach((item) => {
        if (!item.product) return;
        const key = String(item.product._id || item.product);
        const existing = purchasedProductsMap.get(key);
        const productName = item.product.productName || 'Unknown Product';
        if (existing) {
          existing.quantity += item.quantity;
        } else {
          purchasedProductsMap.set(key, { productId: key, productName, quantity: item.quantity });
        }
      });
    });

    const activeWarrantyCount = await Warranty.countDocuments({
      customerMobile: customer.mobileNumber,
      status: 'Active'
    });

    res.status(200).json({
      success: true,
      data: {
        customer,
        purchaseHistory: {
          totalBills: summary.totalBills,
          totalPurchaseAmount: round2(summary.totalPurchaseAmount),
          lastPurchaseDate: lastBill ? lastBill.billDate : null
        },
        recentBills: recentBills.map((bill) => ({
          id: bill._id,
          billNumber: bill.billNumber,
          billDate: bill.billDate,
          grandTotal: bill.grandTotal,
          status: bill.status
        })),
        purchasedProducts: Array.from(purchasedProductsMap.values()),
        activeWarrantyCount,
        repairHistory: []
      }
    });
  } catch (error) {
    next(error);
  }
});

// CREATE
customerRouter.post('/', requireAuth, requirePermission('Customers', 'create'), async (req, res, next) => {
  try {
    const { errors, data } = await validateCustomerBody(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }

    const customerCode = await generateCustomerCode();

    const record = await Customer.create({
      ...data,
      customerCode,
      createdBy: req.user._id,
      updatedBy: req.user._id
    });

    const populated = await populateCustomerQuery(Customer.findOne({ _id: record._id }));

    res.status(201).json({ success: true, message: 'Customer created successfully', data: populated });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'A customer with this Mobile Number, Email, or GST Number already exists' });
    }
    next(error);
  }
});

// UPDATE
customerRouter.put('/:id', requireAuth, requirePermission('Customers', 'edit'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const record = await Customer.findOne({ _id: req.params.id, isDeleted: false });
    if (!record) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const { errors, data } = await validateCustomerBody(req.body, { currentId: record._id });
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }

    Object.assign(record, data, { updatedBy: req.user._id });
    await record.save();

    const populated = await populateCustomerQuery(Customer.findOne({ _id: record._id }));

    res.status(200).json({ success: true, message: 'Customer updated successfully', data: populated });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'A customer with this Mobile Number, Email, or GST Number already exists' });
    }
    next(error);
  }
});

// ACTIVATE / DEACTIVATE (soft delete is never permanent — status toggle only)
customerRouter.patch('/:id/status', requireAuth, requirePermission('Customers', 'edit'), async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    const { status } = req.body;
    const statusError = validateStatus(status) || (isBlank(status) ? 'Status is required' : null);
    if (statusError) {
      return res.status(400).json({ success: false, message: statusError });
    }

    const record = await Customer.findOne({ _id: req.params.id, isDeleted: false });
    if (!record) {
      return res.status(404).json({ success: false, message: 'Customer not found' });
    }

    record.status = status;
    record.updatedBy = req.user._id;
    await record.save();

    res.status(200).json({
      success: true,
      message: `Customer ${status === 'Active' ? 'activated' : 'deactivated'} successfully`,
      data: record
    });
  } catch (error) {
    next(error);
  }
});

app.use('/api/customers', customerRouter);

/* ============================================================
   REPORTS ENGINE — SHARED HELPERS
   ============================================================
   Reports are strictly read-only. Every report is generated live
   from existing collections via aggregation pipelines — no report
   data is ever persisted.
   ============================================================ */

const ExcelJS = require('exceljs');
const PDFDocument = require('pdfkit');

function buildDateRangeFilter(query, field) {
  const filter = {};
  if (query.dateFrom && !Number.isNaN(new Date(query.dateFrom).getTime())) {
    filter.$gte = new Date(query.dateFrom);
  }
  if (query.dateTo && !Number.isNaN(new Date(query.dateTo).getTime())) {
    const dateTo = new Date(query.dateTo);
    dateTo.setHours(23, 59, 59, 999);
    filter.$lte = dateTo;
  }
  return Object.keys(filter).length > 0 ? { [field]: filter } : {};
}

function buildSort(query, allowedFields, defaultField, defaultDirection = -1) {
  const field = allowedFields.includes(query.sortBy) ? query.sortBy : defaultField;
  const direction = query.sortDir === 'asc' ? 1 : query.sortDir === 'desc' ? -1 : defaultDirection;
  return { [field]: direction };
}

function parseExportFormat(query) {
  const format = String(query.format || '').toLowerCase();
  return ['pdf', 'xlsx', 'csv'].includes(format) ? format : null;
}

function csvEscape(value) {
  if (value === null || value === undefined) return '';
  const stringValue = String(value);
  if (/[",\n]/.test(stringValue)) {
    return `"${stringValue.replace(/"/g, '""')}"`;
  }
  return stringValue;
}

function sendCsv(res, filename, columns, rows) {
  const header = columns.map((col) => csvEscape(col.label)).join(',');
  const lines = rows.map((row) => columns.map((col) => csvEscape(col.value(row))).join(','));
  const csv = [header, ...lines].join('\r\n');

  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
  res.status(200).send(csv);
}

async function sendXlsx(res, filename, title, columns, rows, summary) {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'Electronics ERP';
  workbook.created = new Date();

  const sheet = workbook.addWorksheet(title.substring(0, 31) || 'Report');

  sheet.columns = columns.map((col) => ({
    header: col.label,
    key: col.key,
    width: col.width || 18
  }));

  sheet.getRow(1).font = { bold: true };
  sheet.getRow(1).fill = {
    type: 'pattern',
    pattern: 'solid',
    fgColor: { argb: 'FFEFF6FF' }
  };

  rows.forEach((row) => {
    const rowValues = {};
    columns.forEach((col) => {
      rowValues[col.key] = col.value(row);
    });
    sheet.addRow(rowValues);
  });

  if (summary && summary.length > 0) {
    sheet.addRow([]);
    sheet.addRow(['Summary']).font = { bold: true };
    summary.forEach((item) => {
      sheet.addRow([item.label, item.value]);
    });
  }

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);

  await workbook.xlsx.write(res);
  res.end();
}

function sendPdf(res, filename, title, columns, rows, summary, filtersDescription) {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: 30 });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
  doc.pipe(res);

  doc.fontSize(16).font('Helvetica-Bold').text(title, { align: 'left' });
  doc.moveDown(0.2);
  doc.fontSize(9).font('Helvetica').fillColor('#667085')
    .text(`Generated on ${new Date().toLocaleString()}`, { align: 'left' });

  if (filtersDescription) {
    doc.moveDown(0.2);
    doc.fontSize(9).fillColor('#667085').text(filtersDescription, { align: 'left' });
  }

  doc.fillColor('#111827');
  doc.moveDown(0.6);

  const pageWidth = doc.page.width - doc.page.margins.left - doc.page.margins.right;
  const colWidth = pageWidth / columns.length;
  const startX = doc.page.margins.left;
  let y = doc.y;

  function drawHeader() {
    doc.font('Helvetica-Bold').fontSize(8.5);
    columns.forEach((col, index) => {
      doc.text(col.label, startX + index * colWidth, y, { width: colWidth - 6 });
    });
    y += 16;
    doc.moveTo(startX, y).lineTo(startX + pageWidth, y).strokeColor('#e5e7eb').stroke();
    y += 6;
    doc.font('Helvetica').fontSize(8.5);
  }

  drawHeader();

  rows.forEach((row) => {
    if (y > doc.page.height - doc.page.margins.bottom - 40) {
      doc.addPage();
      y = doc.page.margins.top;
      drawHeader();
    }
    columns.forEach((col, index) => {
      const value = col.value(row);
      doc.text(value === null || value === undefined ? '' : String(value), startX + index * colWidth, y, { width: colWidth - 6 });
    });
    y += 16;
  });

  if (summary && summary.length > 0) {
    y += 10;
    if (y > doc.page.height - doc.page.margins.bottom - 60) {
      doc.addPage();
      y = doc.page.margins.top;
    }
    doc.font('Helvetica-Bold').fontSize(10).text('Summary', startX, y);
    y += 16;
    doc.font('Helvetica').fontSize(9);
    summary.forEach((item) => {
      doc.text(`${item.label}: ${item.value}`, startX, y);
      y += 14;
    });
  }

  doc.end();
}

async function exportReport(res, { format, filename, title, columns, rows, summary, filtersDescription }) {
  if (format === 'csv') {
    return sendCsv(res, filename, columns, rows);
  }
  if (format === 'xlsx') {
    return sendXlsx(res, filename, title, columns, rows, summary);
  }
  return sendPdf(res, filename, title, columns, rows, summary, filtersDescription);
}

/* ============================================================
   REPORTS ENGINE — ROUTES
   ============================================================ */

const reportRouter = express.Router();
reportRouter.use(requireAuth);

/* ------------------------------------------------------------
   1. SALES REPORT
   ------------------------------------------------------------ */

function buildSalesReportPipeline(query) {
  const match = { status: 'Finalized', ...buildDateRangeFilter(query, 'billDate') };

  if (query.customer && mongoose.Types.ObjectId.isValid(query.customer)) {
    match.customer = new mongoose.Types.ObjectId(query.customer);
  }
  if (query.paymentMode && mongoose.Types.ObjectId.isValid(query.paymentMode)) {
    match.paymentMode = new mongoose.Types.ObjectId(query.paymentMode);
  }
  if (query.salesperson && mongoose.Types.ObjectId.isValid(query.salesperson)) {
    match.salesperson = new mongoose.Types.ObjectId(query.salesperson);
  }
  if (query.search) {
    const safe = escapeRegex(String(query.search).trim());
    if (safe) {
      match.$or = [
        { billNumber: { $regex: safe, $options: 'i' } },
        { customerName: { $regex: safe, $options: 'i' } },
        { customerMobile: { $regex: safe, $options: 'i' } }
      ];
    }
  }

  return match;
}

reportRouter.get('/sales', requirePermission('Reports', 'view'), async (req, res, next) => {
  try {
    const { page, limit, skip } = buildPagination(req.query);
    const match = buildSalesReportPipeline(req.query);
    const sort = buildSort(req.query, ['billDate', 'grandTotal', 'billNumber'], 'billDate');

    const [records, totalRecords, summaryAgg] = await Promise.all([
      Bill.find(match)
        .populate('customer', 'customerCode customerName mobileNumber')
        .populate('paymentMode', 'paymentModeName')
        .populate('salesperson', 'fullName')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Bill.countDocuments(match),
      Bill.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalBills: { $sum: 1 },
            totalSales: { $sum: '$grandTotal' },
            totalGst: { $sum: '$taxAmount' }
          }
        }
      ])
    ]);

    const summary = summaryAgg[0] || { totalBills: 0, totalSales: 0, totalGst: 0 };
    const averageBillValue = summary.totalBills > 0 ? summary.totalSales / summary.totalBills : 0;

    res.status(200).json({
      success: true,
      data: records.map((bill) => ({
        id: bill._id,
        billNumber: bill.billNumber,
        billDate: bill.billDate,
        customerName: bill.customer ? bill.customer.customerName : (bill.customerName || 'Walk-in Customer'),
        totalAmount: bill.grandTotal,
        gst: bill.taxAmount,
        paymentMode: bill.paymentMode ? bill.paymentMode.paymentModeName : '—',
        salesperson: bill.salesperson ? bill.salesperson.fullName : '—'
      })),
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages: Math.max(Math.ceil(totalRecords / limit), 1)
      },
      summary: {
        totalBills: summary.totalBills,
        totalSales: round2(summary.totalSales),
        averageBillValue: round2(averageBillValue),
        totalGst: round2(summary.totalGst)
      }
    });
  } catch (error) {
    next(error);
  }
});

reportRouter.get('/sales/export', requirePermission('Reports', 'export'), async (req, res, next) => {
  try {
    const format = parseExportFormat(req.query);
    if (!format) {
      return res.status(400).json({ success: false, message: 'Invalid export format. Use pdf, xlsx, or csv' });
    }

    const match = buildSalesReportPipeline(req.query);
    const sort = buildSort(req.query, ['billDate', 'grandTotal', 'billNumber'], 'billDate');

    const [records, summaryAgg] = await Promise.all([
      Bill.find(match)
        .populate('customer', 'customerCode customerName mobileNumber')
        .populate('paymentMode', 'paymentModeName')
        .populate('salesperson', 'fullName')
        .sort(sort),
      Bill.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalBills: { $sum: 1 },
            totalSales: { $sum: '$grandTotal' },
            totalGst: { $sum: '$taxAmount' }
          }
        }
      ])
    ]);

    const summaryData = summaryAgg[0] || { totalBills: 0, totalSales: 0, totalGst: 0 };
    const averageBillValue = summaryData.totalBills > 0 ? summaryData.totalSales / summaryData.totalBills : 0;

    const columns = [
      { key: 'billNumber', label: 'Bill Number', value: (r) => r.billNumber, width: 16 },
      { key: 'billDate', label: 'Date', value: (r) => new Date(r.billDate).toLocaleDateString(), width: 14 },
      { key: 'customerName', label: 'Customer', value: (r) => (r.customer ? r.customer.customerName : (r.customerName || 'Walk-in Customer')), width: 22 },
      { key: 'totalAmount', label: 'Total', value: (r) => round2(r.grandTotal), width: 12 },
      { key: 'gst', label: 'GST', value: (r) => round2(r.taxAmount), width: 12 },
      { key: 'paymentMode', label: 'Payment Mode', value: (r) => (r.paymentMode ? r.paymentMode.paymentModeName : '—'), width: 16 },
      { key: 'salesperson', label: 'Salesperson', value: (r) => (r.salesperson ? r.salesperson.fullName : '—'), width: 18 }
    ];

    const summary = [
      { label: 'Total Bills', value: summaryData.totalBills },
      { label: 'Total Sales', value: round2(summaryData.totalSales) },
      { label: 'Average Bill Value', value: round2(averageBillValue) },
      { label: 'Total GST', value: round2(summaryData.totalGst) }
    ];

    await exportReport(res, {
      format,
      filename: `sales-report-${Date.now()}`,
      title: 'Sales Report',
      columns,
      rows: records,
      summary
    });
  } catch (error) {
    next(error);
  }
});

/* ------------------------------------------------------------
   2. PURCHASE REPORT
   ------------------------------------------------------------ */

function buildPurchaseReportMatch(query) {
  const match = { status: 'Finalized', ...buildDateRangeFilter(query, 'purchaseDate') };

  if (query.supplier && mongoose.Types.ObjectId.isValid(query.supplier)) {
    match.supplier = new mongoose.Types.ObjectId(query.supplier);
  }
  if (query.status && PURCHASE_STATUSES.includes(query.status)) {
    match.status = query.status;
  }

  return match;
}

async function resolvePurchaseSearchMatch(query, match) {
  if (query.search) {
    const safe = escapeRegex(String(query.search).trim());
    if (safe) {
      const matchingSupplierIds = await Supplier.find({ supplierName: { $regex: safe, $options: 'i' } }).distinct('_id');
      match.$or = [
        { purchaseNumber: { $regex: safe, $options: 'i' } },
        { supplierInvoiceNumber: { $regex: safe, $options: 'i' } },
        { supplier: { $in: matchingSupplierIds } }
      ];
    }
  }
  return match;
}

reportRouter.get('/purchases', requirePermission('Reports', 'view'), async (req, res, next) => {
  try {
    const { page, limit, skip } = buildPagination(req.query);
    const match = await resolvePurchaseSearchMatch(req.query, buildPurchaseReportMatch(req.query));
    const sort = buildSort(req.query, ['purchaseDate', 'grandTotal', 'purchaseNumber'], 'purchaseDate');

    const [records, totalRecords, summaryAgg] = await Promise.all([
      Purchase.find(match)
        .populate('supplier', 'supplierName')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Purchase.countDocuments(match),
      Purchase.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalPurchases: { $sum: 1 },
            purchaseValue: { $sum: '$grandTotal' }
          }
        }
      ])
    ]);

    const summary = summaryAgg[0] || { totalPurchases: 0, purchaseValue: 0 };
    const averagePurchaseValue = summary.totalPurchases > 0 ? summary.purchaseValue / summary.totalPurchases : 0;

    res.status(200).json({
      success: true,
      data: records.map((purchase) => ({
        id: purchase._id,
        purchaseNumber: purchase.purchaseNumber,
        purchaseDate: purchase.purchaseDate,
        supplier: purchase.supplier ? purchase.supplier.supplierName : '—',
        totalAmount: purchase.grandTotal,
        gst: purchase.taxAmount,
        status: purchase.status
      })),
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages: Math.max(Math.ceil(totalRecords / limit), 1)
      },
      summary: {
        totalPurchases: summary.totalPurchases,
        purchaseValue: round2(summary.purchaseValue),
        averagePurchaseValue: round2(averagePurchaseValue)
      }
    });
  } catch (error) {
    next(error);
  }
});

reportRouter.get('/purchases/export', requirePermission('Reports', 'export'), async (req, res, next) => {
  try {
    const format = parseExportFormat(req.query);
    if (!format) {
      return res.status(400).json({ success: false, message: 'Invalid export format. Use pdf, xlsx, or csv' });
    }

    const match = await resolvePurchaseSearchMatch(req.query, buildPurchaseReportMatch(req.query));
    const sort = buildSort(req.query, ['purchaseDate', 'grandTotal', 'purchaseNumber'], 'purchaseDate');

    const [records, summaryAgg] = await Promise.all([
      Purchase.find(match).populate('supplier', 'supplierName').sort(sort),
      Purchase.aggregate([
        { $match: match },
        { $group: { _id: null, totalPurchases: { $sum: 1 }, purchaseValue: { $sum: '$grandTotal' } } }
      ])
    ]);

    const summaryData = summaryAgg[0] || { totalPurchases: 0, purchaseValue: 0 };
    const averagePurchaseValue = summaryData.totalPurchases > 0 ? summaryData.purchaseValue / summaryData.totalPurchases : 0;

    const columns = [
      { key: 'purchaseNumber', label: 'Purchase Number', value: (r) => r.purchaseNumber, width: 18 },
      { key: 'purchaseDate', label: 'Date', value: (r) => new Date(r.purchaseDate).toLocaleDateString(), width: 14 },
      { key: 'supplier', label: 'Supplier', value: (r) => (r.supplier ? r.supplier.supplierName : '—'), width: 22 },
      { key: 'totalAmount', label: 'Total', value: (r) => round2(r.grandTotal), width: 12 },
      { key: 'gst', label: 'GST', value: (r) => round2(r.taxAmount), width: 12 },
      { key: 'status', label: 'Status', value: (r) => r.status, width: 12 }
    ];

    const summary = [
      { label: 'Total Purchases', value: summaryData.totalPurchases },
      { label: 'Purchase Value', value: round2(summaryData.purchaseValue) },
      { label: 'Average Purchase Value', value: round2(averagePurchaseValue) }
    ];

    await exportReport(res, {
      format,
      filename: `purchase-report-${Date.now()}`,
      title: 'Purchase Report',
      columns,
      rows: records,
      summary
    });
  } catch (error) {
    next(error);
  }
});

/* ------------------------------------------------------------
   3. INVENTORY REPORT
   ------------------------------------------------------------ */

async function buildInventoryReportRecords(query) {
  const productFilter = { isDeleted: false };

  if (query.category && mongoose.Types.ObjectId.isValid(query.category)) {
    productFilter.category = query.category;
  }
  if (query.brand && mongoose.Types.ObjectId.isValid(query.brand)) {
    productFilter.brand = query.brand;
  }
  if (query.search) {
    const safe = escapeRegex(String(query.search).trim());
    if (safe) {
      productFilter.$or = [
        { productName: { $regex: safe, $options: 'i' } },
        { sku: { $regex: safe, $options: 'i' } }
      ];
    }
  }

  const matchingProductIds = await Product.find(productFilter).distinct('_id');

  let records = await Inventory.find({ isDeleted: false, product: { $in: matchingProductIds } })
    .populate({
      path: 'product',
      select: 'productName sku category brand',
      populate: [
        { path: 'category', select: 'categoryName' },
        { path: 'brand', select: 'brandName' }
      ]
    });

  records = records.filter((record) => record.product);

  if (query.lowStock === 'true') {
    records = records.filter((record) => record.currentQuantity > 0 && record.currentQuantity <= record.reorderLevel);
  }
  if (query.outOfStock === 'true') {
    records = records.filter((record) => record.currentQuantity === 0);
  }

  return records.map((record) => ({
    id: record._id,
    productName: record.product.productName,
    sku: record.product.sku,
    category: record.product.category ? record.product.category.categoryName : '—',
    brand: record.product.brand ? record.product.brand.brandName : '—',
    currentStock: record.currentQuantity,
    availableStock: Math.max(record.currentQuantity - record.reservedQuantity, 0),
    reorderLevel: record.reorderLevel,
    stockStatus: computeStockStatus(record)
  }));
}

reportRouter.get('/inventory', requirePermission('Reports', 'view'), async (req, res, next) => {
  try {
    const { page, limit, skip } = buildPagination(req.query);
    let records = await buildInventoryReportRecords(req.query);

    if (req.query.sortBy && ['currentStock', 'productName'].includes(req.query.sortBy)) {
      const direction = req.query.sortDir === 'desc' ? -1 : 1;
      records.sort((a, b) => {
        if (a[req.query.sortBy] < b[req.query.sortBy]) return -1 * direction;
        if (a[req.query.sortBy] > b[req.query.sortBy]) return 1 * direction;
        return 0;
      });
    }

    const totalRecords = records.length;
    const lowStockCount = records.filter((r) => r.stockStatus === 'Low Stock').length;
    const outOfStockCount = records.filter((r) => r.stockStatus === 'Out of Stock').length;

    const paginated = records.slice(skip, skip + limit);

    res.status(200).json({
      success: true,
      data: paginated,
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages: Math.max(Math.ceil(totalRecords / limit), 1)
      },
      summary: {
        totalProducts: totalRecords,
        lowStockCount,
        outOfStockCount
      }
    });
  } catch (error) {
    next(error);
  }
});

reportRouter.get('/inventory/export', requirePermission('Reports', 'export'), async (req, res, next) => {
  try {
    const format = parseExportFormat(req.query);
    if (!format) {
      return res.status(400).json({ success: false, message: 'Invalid export format. Use pdf, xlsx, or csv' });
    }

    const records = await buildInventoryReportRecords(req.query);
    const lowStockCount = records.filter((r) => r.stockStatus === 'Low Stock').length;
    const outOfStockCount = records.filter((r) => r.stockStatus === 'Out of Stock').length;

    const columns = [
      { key: 'productName', label: 'Product', value: (r) => r.productName, width: 24 },
      { key: 'sku', label: 'SKU', value: (r) => r.sku, width: 14 },
      { key: 'category', label: 'Category', value: (r) => r.category, width: 16 },
      { key: 'brand', label: 'Brand', value: (r) => r.brand, width: 16 },
      { key: 'currentStock', label: 'Current Qty', value: (r) => r.currentStock, width: 12 },
      { key: 'availableStock', label: 'Available Qty', value: (r) => r.availableStock, width: 12 },
      { key: 'reorderLevel', label: 'Reorder Level', value: (r) => r.reorderLevel, width: 12 },
      { key: 'stockStatus', label: 'Stock Status', value: (r) => r.stockStatus, width: 14 }
    ];

    const summary = [
      { label: 'Total Products', value: records.length },
      { label: 'Low Stock Count', value: lowStockCount },
      { label: 'Out of Stock Count', value: outOfStockCount }
    ];

    await exportReport(res, {
      format,
      filename: `inventory-report-${Date.now()}`,
      title: 'Inventory Report',
      columns,
      rows: records,
      summary
    });
  } catch (error) {
    next(error);
  }
});

/* ------------------------------------------------------------
   4. STOCK MOVEMENT REPORT
   ------------------------------------------------------------ */

function buildStockMovementMatch(query) {
  const match = { ...buildDateRangeFilter(query, 'createdAt') };

  if (query.product && mongoose.Types.ObjectId.isValid(query.product)) {
    match.product = new mongoose.Types.ObjectId(query.product);
  }
  if (query.movementType && ['Stock Increase', 'Stock Decrease'].includes(query.movementType)) {
    match.movementType = query.movementType;
  }

  return match;
}

reportRouter.get('/stock-movements', requirePermission('Reports', 'view'), async (req, res, next) => {
  try {
    const { page, limit, skip } = buildPagination(req.query);
    const match = buildStockMovementMatch(req.query);
    const sort = buildSort(req.query, ['createdAt', 'quantity'], 'createdAt');

    const [records, totalRecords] = await Promise.all([
      InventoryMovement.find(match)
        .populate('product', 'productName sku')
        .populate('performedBy', 'fullName')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      InventoryMovement.countDocuments(match)
    ]);

    res.status(200).json({
      success: true,
      data: records.map((m) => ({
        id: m._id,
        date: m.createdAt,
        product: m.product ? m.product.productName : '—',
        sku: m.product ? m.product.sku : '—',
        movementType: m.movementType,
        quantity: m.quantity,
        previousStock: m.previousStock,
        newStock: m.newStock,
        referenceType: m.referenceType,
        referenceNumber: m.referenceId ? String(m.referenceId) : '—',
        user: m.performedBy ? m.performedBy.fullName : '—'
      })),
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages: Math.max(Math.ceil(totalRecords / limit), 1)
      }
    });
  } catch (error) {
    next(error);
  }
});

reportRouter.get('/stock-movements/export', requirePermission('Reports', 'export'), async (req, res, next) => {
  try {
    const format = parseExportFormat(req.query);
    if (!format) {
      return res.status(400).json({ success: false, message: 'Invalid export format. Use pdf, xlsx, or csv' });
    }

    const match = buildStockMovementMatch(req.query);
    const sort = buildSort(req.query, ['createdAt', 'quantity'], 'createdAt');

    const records = await InventoryMovement.find(match)
      .populate('product', 'productName sku')
      .populate('performedBy', 'fullName')
      .sort(sort);

    const columns = [
      { key: 'date', label: 'Date & Time', value: (r) => new Date(r.createdAt).toLocaleString(), width: 20 },
      { key: 'product', label: 'Product', value: (r) => (r.product ? r.product.productName : '—'), width: 22 },
      { key: 'movementType', label: 'Movement Type', value: (r) => r.movementType, width: 16 },
      { key: 'quantity', label: 'Quantity', value: (r) => r.quantity, width: 10 },
      { key: 'previousStock', label: 'Previous Stock', value: (r) => r.previousStock, width: 12 },
      { key: 'newStock', label: 'New Stock', value: (r) => r.newStock, width: 12 },
      { key: 'referenceType', label: 'Reference', value: (r) => r.referenceType, width: 16 },
      { key: 'user', label: 'User', value: (r) => (r.performedBy ? r.performedBy.fullName : '—'), width: 16 }
    ];

    await exportReport(res, {
      format,
      filename: `stock-movement-report-${Date.now()}`,
      title: 'Stock Movement Report',
      columns,
      rows: records
    });
  } catch (error) {
    next(error);
  }
});

/* ------------------------------------------------------------
   5. CUSTOMER REPORT
   ------------------------------------------------------------ */

function buildCustomerReportMatch(query) {
  const match = { isDeleted: false };

  if (query.customerType && mongoose.Types.ObjectId.isValid(query.customerType)) {
    match.customerType = new mongoose.Types.ObjectId(query.customerType);
  }
  if (query.status && ['Active', 'Inactive'].includes(query.status)) {
    match.status = query.status;
  }
  if (query.city) {
    const safeCity = escapeRegex(String(query.city).trim());
    if (safeCity) {
      match['address.city'] = { $regex: safeCity, $options: 'i' };
    }
  }
  if (query.search) {
    const safe = escapeRegex(String(query.search).trim());
    if (safe) {
      match.$or = [
        { customerName: { $regex: safe, $options: 'i' } },
        { mobileNumber: { $regex: safe, $options: 'i' } },
        { customerCode: { $regex: safe, $options: 'i' } }
      ];
    }
  }

  return match;
}

async function attachCustomerPurchaseStats(customers) {
  const mobiles = customers.map((c) => c.mobileNumber);

  const stats = await Bill.aggregate([
    { $match: { status: 'Finalized', customerMobile: { $in: mobiles } } },
    {
      $group: {
        _id: '$customerMobile',
        totalBills: { $sum: 1 },
        totalPurchaseAmount: { $sum: '$grandTotal' },
        lastPurchaseDate: { $max: '$billDate' }
      }
    }
  ]);

  const statsByMobile = new Map(stats.map((s) => [s._id, s]));

  return customers.map((customer) => {
    const stat = statsByMobile.get(customer.mobileNumber);
    return {
      id: customer._id,
      customerCode: customer.customerCode,
      customerName: customer.customerName,
      mobileNumber: customer.mobileNumber,
      customerType: customer.customerType ? customer.customerType.customerType : '—',
      totalBills: stat ? stat.totalBills : 0,
      totalPurchaseAmount: stat ? round2(stat.totalPurchaseAmount) : 0,
      lastPurchaseDate: stat ? stat.lastPurchaseDate : null
    };
  });
}

reportRouter.get('/customers', requirePermission('Reports', 'view'), async (req, res, next) => {
  try {
    const { page, limit, skip } = buildPagination(req.query);
    const match = buildCustomerReportMatch(req.query);

    const [customers, totalRecords] = await Promise.all([
      Customer.find(match)
        .populate('customerType', 'customerType')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Customer.countDocuments(match)
    ]);

    const data = await attachCustomerPurchaseStats(customers);

    res.status(200).json({
      success: true,
      data,
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages: Math.max(Math.ceil(totalRecords / limit), 1)
      }
    });
  } catch (error) {
    next(error);
  }
});

reportRouter.get('/customers/export', requirePermission('Reports', 'export'), async (req, res, next) => {
  try {
    const format = parseExportFormat(req.query);
    if (!format) {
      return res.status(400).json({ success: false, message: 'Invalid export format. Use pdf, xlsx, or csv' });
    }

    const match = buildCustomerReportMatch(req.query);
    const customers = await Customer.find(match).populate('customerType', 'customerType').sort({ createdAt: -1 });
    const data = await attachCustomerPurchaseStats(customers);

    const columns = [
      { key: 'customerCode', label: 'Customer Code', value: (r) => r.customerCode, width: 16 },
      { key: 'customerName', label: 'Name', value: (r) => r.customerName, width: 22 },
      { key: 'mobileNumber', label: 'Mobile', value: (r) => r.mobileNumber, width: 14 },
      { key: 'customerType', label: 'Customer Type', value: (r) => r.customerType, width: 16 },
      { key: 'totalBills', label: 'Total Bills', value: (r) => r.totalBills, width: 12 },
      { key: 'totalPurchaseAmount', label: 'Total Purchase Amount', value: (r) => r.totalPurchaseAmount, width: 18 },
      { key: 'lastPurchaseDate', label: 'Last Purchase Date', value: (r) => (r.lastPurchaseDate ? new Date(r.lastPurchaseDate).toLocaleDateString() : '—'), width: 16 }
    ];

    await exportReport(res, {
      format,
      filename: `customer-report-${Date.now()}`,
      title: 'Customer Report',
      columns,
      rows: data
    });
  } catch (error) {
    next(error);
  }
});

/* ------------------------------------------------------------
   6. WARRANTY REPORT
   ------------------------------------------------------------ */

function buildWarrantyReportMatch(query) {
  const match = {};
  const now = new Date();

  if (query.warrantyStatus === 'Active') {
    match.status = 'Active';
    match.warrantyEnd = { $gte: now };
  } else if (query.warrantyStatus === 'Expired') {
    match.status = 'Active';
    match.warrantyEnd = { $lt: now };
  } else if (query.warrantyStatus === 'Void') {
    match.status = 'Reversed';
  } else if (query.warrantyStatus === 'Claimed') {
    // No claim workflow exists yet in this system; reserved for a future phase.
    match._id = null;
  }

  return match;
}

function deriveWarrantyStatus(warranty) {
  if (warranty.status === 'Reversed') return 'Void';
  return new Date(warranty.warrantyEnd) < new Date() ? 'Expired' : 'Active';
}

reportRouter.get('/warranties', requirePermission('Reports', 'view'), async (req, res, next) => {
  try {
    const { page, limit, skip } = buildPagination(req.query);
    const match = buildWarrantyReportMatch(req.query);
    const sort = buildSort(req.query, ['warrantyStart', 'warrantyEnd'], 'warrantyStart');

    const [records, totalRecords] = await Promise.all([
      Warranty.find(match)
        .populate('product', 'productName')
        .populate('productIdentifier', 'value type')
        .populate('bill', 'billNumber')
        .sort(sort)
        .skip(skip)
        .limit(limit),
      Warranty.countDocuments(match)
    ]);

    res.status(200).json({
      success: true,
      data: records.map((w) => ({
        id: w._id,
        warrantyNumber: `WTY-${String(w._id).slice(-6).toUpperCase()}`,
        product: w.product ? w.product.productName : '—',
        customerName: w.customerName || '—',
        identifierValue: w.productIdentifier ? w.productIdentifier.value : '—',
        startDate: w.warrantyStart,
        endDate: w.warrantyEnd,
        status: deriveWarrantyStatus(w)
      })),
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages: Math.max(Math.ceil(totalRecords / limit), 1)
      }
    });
  } catch (error) {
    next(error);
  }
});

reportRouter.get('/warranties/export', requirePermission('Reports', 'export'), async (req, res, next) => {
  try {
    const format = parseExportFormat(req.query);
    if (!format) {
      return res.status(400).json({ success: false, message: 'Invalid export format. Use pdf, xlsx, or csv' });
    }

    const match = buildWarrantyReportMatch(req.query);
    const sort = buildSort(req.query, ['warrantyStart', 'warrantyEnd'], 'warrantyStart');

    const records = await Warranty.find(match)
      .populate('product', 'productName')
      .populate('productIdentifier', 'value type')
      .sort(sort);

    const columns = [
      { key: 'warrantyNumber', label: 'Warranty Number', value: (r) => `WTY-${String(r._id).slice(-6).toUpperCase()}`, width: 16 },
      { key: 'product', label: 'Product', value: (r) => (r.product ? r.product.productName : '—'), width: 22 },
      { key: 'customerName', label: 'Customer', value: (r) => r.customerName || '—', width: 20 },
      { key: 'identifierValue', label: 'Serial/IMEI', value: (r) => (r.productIdentifier ? r.productIdentifier.value : '—'), width: 18 },
      { key: 'startDate', label: 'Start Date', value: (r) => new Date(r.warrantyStart).toLocaleDateString(), width: 14 },
      { key: 'endDate', label: 'End Date', value: (r) => new Date(r.warrantyEnd).toLocaleDateString(), width: 14 },
      { key: 'status', label: 'Status', value: (r) => deriveWarrantyStatus(r), width: 12 }
    ];

    await exportReport(res, {
      format,
      filename: `warranty-report-${Date.now()}`,
      title: 'Warranty Report',
      columns,
      rows: records
    });
  } catch (error) {
    next(error);
  }
});

/* ------------------------------------------------------------
   7. PRODUCT SALES REPORT
   ------------------------------------------------------------ */

async function buildProductSalesAggregation(query) {
  const billMatch = { status: 'Finalized', ...buildDateRangeFilter(query, 'billDate') };

  const productDocMatch = { 'productDoc.isDeleted': false };
  if (query.category && mongoose.Types.ObjectId.isValid(query.category)) {
    productDocMatch['productDoc.category'] = new mongoose.Types.ObjectId(query.category);
  }
  if (query.brand && mongoose.Types.ObjectId.isValid(query.brand)) {
    productDocMatch['productDoc.brand'] = new mongoose.Types.ObjectId(query.brand);
  }

  const pipeline = [
    { $match: billMatch },
    { $unwind: '$items' },
    {
      $lookup: {
        from: 'products',
        localField: 'items.product',
        foreignField: '_id',
        as: 'productDoc'
      }
    },
    { $unwind: '$productDoc' },
    { $match: productDocMatch },
    {
      $group: {
        _id: '$items.product',
        productName: { $first: '$productDoc.productName' },
        sku: { $first: '$productDoc.sku' },
        quantitySold: { $sum: '$items.quantity' },
        salesValue: { $sum: '$items.lineTotal' },
        bills: { $addToSet: '$_id' }
      }
    },
    {
      $project: {
        _id: 0,
        productId: '$_id',
        productName: 1,
        sku: 1,
        quantitySold: 1,
        salesValue: { $round: ['$salesValue', 2] },
        numberOfBills: { $size: '$bills' }
      }
    }
  ];

  return Bill.aggregate(pipeline);
}

reportRouter.get('/product-sales', requirePermission('Reports', 'view'), async (req, res, next) => {
  try {
    const { page, limit, skip } = buildPagination(req.query);
    let records = await buildProductSalesAggregation(req.query);

    const sortField = ['quantitySold', 'salesValue', 'numberOfBills'].includes(req.query.sortBy) ? req.query.sortBy : 'salesValue';
    const direction = req.query.sortDir === 'asc' ? 1 : -1;
    records = records.sort((a, b) => (a[sortField] - b[sortField]) * direction);

    const totalRecords = records.length;
    const paginated = records.slice(skip, skip + limit);

    res.status(200).json({
      success: true,
      data: paginated,
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages: Math.max(Math.ceil(totalRecords / limit), 1)
      }
    });
  } catch (error) {
    next(error);
  }
});

reportRouter.get('/product-sales/export', requirePermission('Reports', 'export'), async (req, res, next) => {
  try {
    const format = parseExportFormat(req.query);
    if (!format) {
      return res.status(400).json({ success: false, message: 'Invalid export format. Use pdf, xlsx, or csv' });
    }

    let records = await buildProductSalesAggregation(req.query);
    const sortField = ['quantitySold', 'salesValue', 'numberOfBills'].includes(req.query.sortBy) ? req.query.sortBy : 'salesValue';
    const direction = req.query.sortDir === 'asc' ? 1 : -1;
    records = records.sort((a, b) => (a[sortField] - b[sortField]) * direction);

    const columns = [
      { key: 'productName', label: 'Product', value: (r) => r.productName, width: 24 },
      { key: 'sku', label: 'SKU', value: (r) => r.sku, width: 14 },
      { key: 'quantitySold', label: 'Quantity Sold', value: (r) => r.quantitySold, width: 14 },
      { key: 'salesValue', label: 'Sales Value', value: (r) => r.salesValue, width: 14 },
      { key: 'numberOfBills', label: 'Number of Bills', value: (r) => r.numberOfBills, width: 14 }
    ];

    await exportReport(res, {
      format,
      filename: `product-sales-report-${Date.now()}`,
      title: 'Product Sales Report',
      columns,
      rows: records
    });
  } catch (error) {
    next(error);
  }
});

/* ------------------------------------------------------------
   8. TOP SELLING PRODUCTS
   ------------------------------------------------------------ */

reportRouter.get('/top-selling', requirePermission('Reports', 'view'), async (req, res, next) => {
  try {
    let records = await buildProductSalesAggregation(req.query);

    const sortField = req.query.sortBy === 'revenue' ? 'salesValue' : 'quantitySold';
    records = records
      .sort((a, b) => b[sortField] - a[sortField])
      .slice(0, Math.min(parseInt(req.query.limit, 10) || 20, 100))
      .map((r) => ({
        productName: r.productName,
        sku: r.sku,
        quantitySold: r.quantitySold,
        revenue: r.salesValue
      }));

    res.status(200).json({ success: true, data: records });
  } catch (error) {
    next(error);
  }
});

reportRouter.get('/top-selling/export', requirePermission('Reports', 'export'), async (req, res, next) => {
  try {
    const format = parseExportFormat(req.query);
    if (!format) {
      return res.status(400).json({ success: false, message: 'Invalid export format. Use pdf, xlsx, or csv' });
    }

    let records = await buildProductSalesAggregation(req.query);
    const sortField = req.query.sortBy === 'revenue' ? 'salesValue' : 'quantitySold';
    records = records
      .sort((a, b) => b[sortField] - a[sortField])
      .slice(0, Math.min(parseInt(req.query.limit, 10) || 20, 100));

    const columns = [
      { key: 'productName', label: 'Product', value: (r) => r.productName, width: 24 },
      { key: 'quantitySold', label: 'Quantity Sold', value: (r) => r.quantitySold, width: 14 },
      { key: 'salesValue', label: 'Revenue', value: (r) => r.salesValue, width: 14 }
    ];

    await exportReport(res, {
      format,
      filename: `top-selling-products-${Date.now()}`,
      title: 'Top Selling Products',
      columns,
      rows: records
    });
  } catch (error) {
    next(error);
  }
});

/* ------------------------------------------------------------
   9. LOW STOCK REPORT
   ------------------------------------------------------------ */

async function buildLowStockRecords() {
  const records = await Inventory.find({ isDeleted: false })
    .populate({
      path: 'product',
      select: 'productName sku category brand isDeleted',
      populate: [
        { path: 'category', select: 'categoryName' },
        { path: 'brand', select: 'brandName' }
      ]
    });

  return records
    .filter((r) => r.product && !r.product.isDeleted && r.currentQuantity > 0 && r.currentQuantity <= r.reorderLevel)
    .map((r) => ({
      id: r._id,
      productName: r.product.productName,
      sku: r.product.sku,
      category: r.product.category ? r.product.category.categoryName : '—',
      brand: r.product.brand ? r.product.brand.brandName : '—',
      currentStock: r.currentQuantity,
      reorderLevel: r.reorderLevel
    }));
}

reportRouter.get('/low-stock', requirePermission('Reports', 'view'), async (req, res, next) => {
  try {
    const { page, limit, skip } = buildPagination(req.query);
    const records = await buildLowStockRecords();
    const totalRecords = records.length;

    res.status(200).json({
      success: true,
      data: records.slice(skip, skip + limit),
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages: Math.max(Math.ceil(totalRecords / limit), 1)
      }
    });
  } catch (error) {
    next(error);
  }
});

reportRouter.get('/low-stock/export', requirePermission('Reports', 'export'), async (req, res, next) => {
  try {
    const format = parseExportFormat(req.query);
    if (!format) {
      return res.status(400).json({ success: false, message: 'Invalid export format. Use pdf, xlsx, or csv' });
    }

    const records = await buildLowStockRecords();

    const columns = [
      { key: 'productName', label: 'Product', value: (r) => r.productName, width: 24 },
      { key: 'sku', label: 'SKU', value: (r) => r.sku, width: 14 },
      { key: 'category', label: 'Category', value: (r) => r.category, width: 16 },
      { key: 'brand', label: 'Brand', value: (r) => r.brand, width: 16 },
      { key: 'currentStock', label: 'Current Stock', value: (r) => r.currentStock, width: 12 },
      { key: 'reorderLevel', label: 'Reorder Level', value: (r) => r.reorderLevel, width: 12 }
    ];

    await exportReport(res, {
      format,
      filename: `low-stock-report-${Date.now()}`,
      title: 'Low Stock Report',
      columns,
      rows: records
    });
  } catch (error) {
    next(error);
  }
});

/* ------------------------------------------------------------
   10. OUT OF STOCK REPORT
   ------------------------------------------------------------ */

async function buildOutOfStockRecords() {
  const records = await Inventory.find({ isDeleted: false, currentQuantity: 0 })
    .populate({
      path: 'product',
      select: 'productName sku category brand isDeleted',
      populate: [
        { path: 'category', select: 'categoryName' },
        { path: 'brand', select: 'brandName' }
      ]
    });

  return records
    .filter((r) => r.product && !r.product.isDeleted)
    .map((r) => ({
      id: r._id,
      productName: r.product.productName,
      sku: r.product.sku,
      category: r.product.category ? r.product.category.categoryName : '—',
      brand: r.product.brand ? r.product.brand.brandName : '—',
      reorderLevel: r.reorderLevel
    }));
}

reportRouter.get('/out-of-stock', requirePermission('Reports', 'view'), async (req, res, next) => {
  try {
    const { page, limit, skip } = buildPagination(req.query);
    const records = await buildOutOfStockRecords();
    const totalRecords = records.length;

    res.status(200).json({
      success: true,
      data: records.slice(skip, skip + limit),
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages: Math.max(Math.ceil(totalRecords / limit), 1)
      }
    });
  } catch (error) {
    next(error);
  }
});

reportRouter.get('/out-of-stock/export', requirePermission('Reports', 'export'), async (req, res, next) => {
  try {
    const format = parseExportFormat(req.query);
    if (!format) {
      return res.status(400).json({ success: false, message: 'Invalid export format. Use pdf, xlsx, or csv' });
    }

    const records = await buildOutOfStockRecords();

    const columns = [
      { key: 'productName', label: 'Product', value: (r) => r.productName, width: 24 },
      { key: 'sku', label: 'SKU', value: (r) => r.sku, width: 14 },
      { key: 'category', label: 'Category', value: (r) => r.category, width: 16 },
      { key: 'brand', label: 'Brand', value: (r) => r.brand, width: 16 },
      { key: 'reorderLevel', label: 'Reorder Level', value: (r) => r.reorderLevel, width: 12 }
    ];

    await exportReport(res, {
      format,
      filename: `out-of-stock-report-${Date.now()}`,
      title: 'Out of Stock Report',
      columns,
      rows: records
    });
  } catch (error) {
    next(error);
  }
});

/* ------------------------------------------------------------
   FILTER OPTIONS (for populating report dropdowns)
   ------------------------------------------------------------ */

reportRouter.get('/filter-options', requirePermission('Reports', 'view'), async (req, res, next) => {
  try {
    const [customers, suppliers, paymentModes, categories, brands, customerTypes, salespeople, products] = await Promise.all([
      Customer.find({ isDeleted: false, status: 'Active' }).select('customerName mobileNumber').sort({ customerName: 1 }),
      Supplier.find({ isDeleted: false, status: 'Active' }).select('supplierName').sort({ supplierName: 1 }),
      PaymentMode.find({ isDeleted: false, status: 'Active' }).select('paymentModeName').sort({ paymentModeName: 1 }),
      Category.find({ isDeleted: false, status: 'Active' }).select('categoryName').sort({ categoryName: 1 }),
      Brand.find({ isDeleted: false, status: 'Active' }).select('brandName').sort({ brandName: 1 }),
      CustomerType.find({ isDeleted: false, status: 'Active' }).select('customerType').sort({ customerType: 1 }),
      User.find({ isActive: true }).select('fullName role').sort({ fullName: 1 }),
      Product.find({ isDeleted: false }).select('productName sku').sort({ productName: 1 })
    ]);

    res.status(200).json({
      success: true,
      data: {
        customers,
        suppliers,
        paymentModes,
        categories,
        brands,
        customerTypes,
        salespeople: salespeople.map((u) => ({ id: u._id, fullName: u.fullName, role: u.role })),
        products
      }
    });
  } catch (error) {
    next(error);
  }
});

app.use('/api/reports', reportRouter);

/* ============================================================
   SETTINGS MODULE — MONGOOSE MODELS
   ============================================================ */

const PAN_PATTERN = /^[A-Z]{5}[0-9]{4}[A-Z]{1}$/;

function validatePanNumber(value, label = 'PAN number') {
  if (isBlank(value)) return null;
  if (!PAN_PATTERN.test(String(value).trim().toUpperCase())) return `${label} format is invalid`;
  return null;
}

const businessProfileSchema = new mongoose.Schema(
  {
    businessName: { type: String, trim: true, maxlength: 150, default: '' },
    tagline: { type: String, trim: true, maxlength: 200, default: '' },
    ownerName: { type: String, trim: true, maxlength: 150, default: '' },
    gstNumber: { type: String, trim: true, uppercase: true, maxlength: 20, default: '' },
    panNumber: { type: String, trim: true, uppercase: true, maxlength: 10, default: '' },
    mobile: { type: String, trim: true, maxlength: 10, default: '' },
    alternateMobile: { type: String, trim: true, maxlength: 10, default: '' },
    email: { type: String, trim: true, lowercase: true, maxlength: 150, default: '' },
    website: { type: String, trim: true, maxlength: 200, default: '' },
    address: { type: String, trim: true, maxlength: 500, default: '' },
    city: { type: String, trim: true, maxlength: 100, default: '' },
    state: { type: String, trim: true, maxlength: 100, default: '' },
    pincode: { type: String, trim: true, maxlength: 10, default: '' },
    country: { type: String, trim: true, maxlength: 100, default: 'India' },
    logoData: { type: String, default: '' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true }
);

businessProfileSchema.set('toJSON', {
  transform(doc, ret) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

const BusinessProfile = mongoose.model('BusinessProfile', businessProfileSchema);

const printSettingsSchema = new mongoose.Schema(
  {
    invoicePaperSize: { type: String, enum: ['A4', 'A5', 'Thermal 80mm', 'Thermal 58mm'], default: 'A4' },

    // Invoice Template Selection (Phase 20.11). Single source of truth
    // for which of the two supported invoice templates a shop wants —
    // deliberately independent of invoicePaperSize (see invoiceEngine.js
    // resolveTemplate()), so a shop can print A4 Professional on A5
    // paper or vice versa without the two settings fighting each other.
    // Defaults to 'A4 Professional', matching the spec's "if no
    // template is configured, automatically use A4 Professional" rule
    // for any newly-created (or pre-Phase-20.11) Print Settings document.
    invoiceTemplate: { type: String, enum: ['A4 Professional', 'A5 Retail'], default: 'A4 Professional' },

    printerName: { type: String, trim: true, maxlength: 150, default: '' },
    headerMessage: { type: String, trim: true, maxlength: 300, default: '' },
    footerMessage: { type: String, trim: true, maxlength: 300, default: 'Thank you for your business!' },

    // Footer Information (Invoice Engine Phase 20.8). Terms & Conditions is
    // stored as an ordered array — one entry per numbered line — so the
    // Invoice Engine can render "1. ...", "2. ..." etc. without parsing a
    // freeform blob. Notes is a single optional internal note (e.g. "Visit
    // again."), shown the same way headerMessage already is — it is NOT
    // part of the Footer Snapshot below because, unlike Footer Message /
    // Terms, the spec does not require Notes to stay historically fixed
    // on reprints.
    termsAndConditions: { type: [String], default: [] },
    notes: { type: String, trim: true, maxlength: 500, default: '' },

    printPreviewEnabled: { type: Boolean, default: true },
    autoPrintEnabled: { type: Boolean, default: false },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true }
);

printSettingsSchema.set('toJSON', {
  transform(doc, ret) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

const PrintSettings = mongoose.model('PrintSettings', printSettingsSchema);

const securitySettingsSchema = new mongoose.Schema(
  {
    sessionTimeoutMinutes: { type: Number, min: 5, max: 1440, default: 480 },
    passwordMinLength: { type: Number, min: 6, max: 64, default: 8 },
    loginAttemptLimit: { type: Number, min: 3, max: 20, default: 5 },
    forcePasswordChange: { type: Boolean, default: false },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true }
);

securitySettingsSchema.set('toJSON', {
  transform(doc, ret) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

const SecuritySettings = mongoose.model('SecuritySettings', securitySettingsSchema);

const appSettingsSchema = new mongoose.Schema(
  {
    currency: { type: String, trim: true, maxlength: 10, default: 'INR' },
    currencySymbol: { type: String, trim: true, maxlength: 5, default: '\u20b9' },
    decimalPlaces: { type: Number, min: 0, max: 4, default: 2 },
    dateFormat: { type: String, enum: ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'], default: 'DD/MM/YYYY' },
    timeFormat: { type: String, enum: ['12h', '24h'], default: '12h' },
    timeZone: { type: String, trim: true, maxlength: 100, default: 'Asia/Kolkata' },
    defaultLanguage: { type: String, trim: true, maxlength: 50, default: 'English' },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true }
);

appSettingsSchema.set('toJSON', {
  transform(doc, ret) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

const AppSettings = mongoose.model('AppSettings', appSettingsSchema);

const PERMISSION_MODULES = [
  'Dashboard', 'Master Data', 'Product Master', 'Inventory',
  'Purchase', 'Billing', 'Customers', 'Warranty', 'Reports', 'Settings'
];
const PERMISSION_ACTIONS = ['view', 'create', 'edit', 'delete', 'export', 'print'];

const rolePermissionSchema = new mongoose.Schema(
  {
    role: { type: String, enum: ROLES, required: true, unique: true },
    permissions: {
      type: Map,
      of: new mongoose.Schema(
        {
          view: { type: Boolean, default: false },
          create: { type: Boolean, default: false },
          edit: { type: Boolean, default: false },
          delete: { type: Boolean, default: false },
          export: { type: Boolean, default: false },
          print: { type: Boolean, default: false }
        },
        { _id: false }
      ),
      default: () => ({})
    },
    updatedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', default: null }
  },
  { timestamps: true }
);

rolePermissionSchema.set('toJSON', {
  transform(doc, ret) {
    ret.id = ret._id;
    delete ret._id;
    delete ret.__v;
    ret.permissions = ret.permissions instanceof Map
      ? Object.fromEntries(ret.permissions)
      : ret.permissions;
    return ret;
  }
});

const RolePermission = mongoose.model('RolePermission', rolePermissionSchema);

function defaultPermissionsForRole(role) {
  const grid = {};
  const fullAccess = role === 'Manager';
  PERMISSION_MODULES.forEach((moduleName) => {
    if (moduleName === 'Settings') {
      grid[moduleName] = { view: false, create: false, edit: false, delete: false, export: false, print: false };
      return;
    }
    grid[moduleName] = {
      view: true,
      create: fullAccess,
      edit: fullAccess,
      delete: false,
      export: fullAccess,
      print: true
    };
  });
  return grid;
}

async function ensureRolePermissionsSeeded() {
  for (const role of ROLES) {
    if (role === 'Owner') continue;
    const exists = await RolePermission.findOne({ role });
    if (!exists) {
      await RolePermission.create({ role, permissions: defaultPermissionsForRole(role) });
    }
  }
}

/* ============================================================
   SETTINGS MODULE — SINGLETON HELPERS
   ============================================================ */

async function getOrCreateSingleton(Model, defaults = {}) {
  let doc = await Model.findOne();
  if (!doc) {
    doc = await Model.create(defaults);
  }
  return doc;
}

async function refreshSecuritySettingsCache() {
  const settings = await getOrCreateSingleton(SecuritySettings);
  setSecuritySettings({
    sessionTimeoutMinutes: settings.sessionTimeoutMinutes,
    passwordMinLength: settings.passwordMinLength,
    loginAttemptLimit: settings.loginAttemptLimit,
    forcePasswordChange: settings.forcePasswordChange
  });
  return settings;
}

/* ============================================================
   SETTINGS MODULE — RBAC ENFORCEMENT
   ============================================================ */

function requirePermission(moduleName, action) {
  return async (req, res, next) => {
    try {
      if (!req.user) {
        return res.status(401).json({ success: false, message: 'Authentication required' });
      }

      if (req.user.role === 'Owner') {
        return next();
      }

      const rolePermission = await RolePermission.findOne({ role: req.user.role });
      const modulePermissions = rolePermission && rolePermission.permissions
        ? rolePermission.permissions.get(moduleName)
        : null;

      if (!modulePermissions || !modulePermissions[action]) {
        return res.status(403).json({ success: false, message: 'Insufficient permissions' });
      }

      next();
    } catch (error) {
      next(error);
    }
  };
}

/* ============================================================
   SETTINGS MODULE — VALIDATORS
   ============================================================ */

function validateBusinessProfileBody(body) {
  const errors = [
    validateOptionalString(body.businessName, 'Business name', 150),
    validateOptionalString(body.tagline, 'Tagline', 200),
    validateOptionalString(body.ownerName, 'Owner name', 150),
    validateGstNumber(body.gstNumber, 'GST number'),
    validatePanNumber(body.panNumber, 'PAN number'),
    (isBlank(body.mobile) ? null : validateMobile(body.mobile, 'Mobile')),
    validateOptionalMobile(body.alternateMobile, 'Alternate mobile'),
    validateEmail(body.email),
    validateWebsite(body.website),
    validateOptionalString(body.address, 'Address', 500),
    validateOptionalString(body.city, 'City', 100),
    validateOptionalString(body.state, 'State', 100),
    validateOptionalString(body.pincode, 'Pincode', 10),
    validateOptionalString(body.country, 'Country', 100)
  ].filter(Boolean);

  return {
    errors,
    data: {
      businessName: (body.businessName || '').trim(),
      tagline: (body.tagline || '').trim(),
      ownerName: (body.ownerName || '').trim(),
      gstNumber: (body.gstNumber || '').trim().toUpperCase(),
      panNumber: (body.panNumber || '').trim().toUpperCase(),
      mobile: (body.mobile || '').trim(),
      alternateMobile: (body.alternateMobile || '').trim(),
      email: (body.email || '').trim().toLowerCase(),
      website: (body.website || '').trim(),
      address: (body.address || '').trim(),
      city: (body.city || '').trim(),
      state: (body.state || '').trim(),
      pincode: (body.pincode || '').trim(),
      country: (body.country || '').trim() || 'India'
    }
  };
}

const SETTINGS_USERNAME_PATTERN = /^[a-zA-Z0-9_.]{3,30}$/;

function validateUserBody(body, { isCreate }) {
  const errors = [
    validateRequiredString(body.fullName, 'Full name', 150),
    isBlank(body.username) ? 'Username is required' : (
      SETTINGS_USERNAME_PATTERN.test(String(body.username).trim())
        ? null
        : 'Username must be 3-30 characters and contain only letters, numbers, dots, or underscores'
    ),
    isBlank(body.role) ? 'Role is required' : (ROLES.includes(body.role) ? null : 'Role is invalid'),
    (isBlank(body.mobile) ? null : validateMobile(body.mobile, 'Mobile')),
    validateEmail(body.email)
  ].filter(Boolean);

  if (isCreate) {
    const passwordError = isBlank(body.password) ? 'Password is required' : validatePasswordStrength(body.password);
    if (passwordError) errors.push(passwordError);
  }

  return {
    errors,
    data: {
      fullName: (body.fullName || '').trim(),
      username: (body.username || '').trim().toLowerCase(),
      role: body.role,
      mobile: (body.mobile || '').trim(),
      email: (body.email || '').trim().toLowerCase()
    }
  };
}

function validateNumberSeriesBody(body) {
  const errors = [
    validateRequiredString(body.prefix, 'Prefix', 10),
    (Number.isFinite(Number(body.startingNumber)) && Number(body.startingNumber) >= 1)
      ? null
      : 'Starting number must be at least 1',
    (Number.isFinite(Number(body.numberLength)) && Number(body.numberLength) >= 1 && Number(body.numberLength) <= 12)
      ? null
      : 'Number length must be between 1 and 12'
  ].filter(Boolean);

  return {
    errors,
    data: {
      prefix: (body.prefix || '').trim(),
      startingNumber: Number(body.startingNumber),
      numberLength: Number(body.numberLength)
    }
  };
}

// Terms & Conditions is submitted as an array (one entry per numbered
// line, matching how the Print Settings form and the Invoice Engine both
// treat it). Accepts an array from the API, or a newline-separated string
// as a convenience for callers posting a plain textarea value; blank
// lines are dropped so numbering in the invoice never has gaps.
function normalizeTermsAndConditions(rawTerms) {
  const list = Array.isArray(rawTerms)
    ? rawTerms
    : String(rawTerms || '').split('\n');

  return list
    .map((line) => String(line || '').trim())
    .filter((line) => line.length > 0);
}

function validatePrintSettingsBody(body) {
  const validPaperSizes = ['A4', 'A5', 'Thermal 80mm', 'Thermal 58mm'];
  // Phase 20.11: the only two template choices the system supports
  // today — must stay in lockstep with invoiceEngine.js's
  // INVOICE_TEMPLATE_SETTING_VALUES, which is the actual selection
  // logic; this list only exists to reject bad input at the API
  // boundary before it ever reaches the Invoice Engine.
  const validInvoiceTemplates = ['A4 Professional', 'A5 Retail'];
  const terms = normalizeTermsAndConditions(body.termsAndConditions);
  const MAX_TERM_LENGTH = 300;
  const MAX_TERMS_COUNT = 30;

  const errors = [
    isBlank(body.invoicePaperSize) ? null : (validPaperSizes.includes(body.invoicePaperSize) ? null : 'Invoice paper size is invalid'),
    isBlank(body.invoiceTemplate) ? null : (validInvoiceTemplates.includes(body.invoiceTemplate) ? null : 'Invoice template is invalid'),
    validateOptionalString(body.printerName, 'Printer selection', 150),
    validateOptionalString(body.headerMessage, 'Header message', 300),
    validateOptionalString(body.footerMessage, 'Footer message', 300),
    validateOptionalString(body.notes, 'Notes', 500),
    terms.length > MAX_TERMS_COUNT ? `Terms & Conditions cannot exceed ${MAX_TERMS_COUNT} lines` : null,
    terms.some((line) => line.length > MAX_TERM_LENGTH) ? `Each Terms & Conditions line must not exceed ${MAX_TERM_LENGTH} characters` : null
  ].filter(Boolean);

  return {
    errors,
    data: {
      invoicePaperSize: body.invoicePaperSize || 'A4',
      // Same "never blank, always a safe default" rule the rest of
      // this function already applies to invoicePaperSize — a blank/
      // missing value here saves as the spec's required default
      // rather than persisting an empty string that resolveTemplate()
      // would then have to treat as unconfigured on every future read.
      invoiceTemplate: body.invoiceTemplate || 'A4 Professional',
      printerName: (body.printerName || '').trim(),
      headerMessage: (body.headerMessage || '').trim(),
      footerMessage: (body.footerMessage || '').trim(),
      termsAndConditions: terms,
      notes: (body.notes || '').trim(),
      printPreviewEnabled: toBoolean(body.printPreviewEnabled, true),
      autoPrintEnabled: toBoolean(body.autoPrintEnabled, false)
    }
  };
}

function validateSecuritySettingsBody(body) {
  const sessionTimeoutMinutes = Number(body.sessionTimeoutMinutes);
  const passwordMinLength = Number(body.passwordMinLength);
  const loginAttemptLimit = Number(body.loginAttemptLimit);

  const errors = [
    (Number.isFinite(sessionTimeoutMinutes) && sessionTimeoutMinutes >= 5 && sessionTimeoutMinutes <= 1440)
      ? null : 'Session timeout must be between 5 and 1440 minutes',
    (Number.isFinite(passwordMinLength) && passwordMinLength >= 6 && passwordMinLength <= 64)
      ? null : 'Password minimum length must be between 6 and 64',
    (Number.isFinite(loginAttemptLimit) && loginAttemptLimit >= 3 && loginAttemptLimit <= 20)
      ? null : 'Login attempt limit must be between 3 and 20'
  ].filter(Boolean);

  return {
    errors,
    data: {
      sessionTimeoutMinutes,
      passwordMinLength,
      loginAttemptLimit,
      forcePasswordChange: toBoolean(body.forcePasswordChange, false)
    }
  };
}

function validateAppSettingsBody(body) {
  const decimalPlaces = Number(body.decimalPlaces);
  const validDateFormats = ['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'];
  const validTimeFormats = ['12h', '24h'];

  const errors = [
    validateRequiredString(body.currency, 'Currency', 10),
    validateRequiredString(body.currencySymbol, 'Currency symbol', 5),
    (Number.isFinite(decimalPlaces) && decimalPlaces >= 0 && decimalPlaces <= 4) ? null : 'Decimal places must be between 0 and 4',
    isBlank(body.dateFormat) ? 'Date format is required' : (validDateFormats.includes(body.dateFormat) ? null : 'Date format is invalid'),
    isBlank(body.timeFormat) ? 'Time format is required' : (validTimeFormats.includes(body.timeFormat) ? null : 'Time format is invalid'),
    validateOptionalString(body.timeZone, 'Time zone', 100),
    validateOptionalString(body.defaultLanguage, 'Default language', 50)
  ].filter(Boolean);

  return {
    errors,
    data: {
      currency: (body.currency || '').trim(),
      currencySymbol: (body.currencySymbol || '').trim(),
      decimalPlaces,
      dateFormat: body.dateFormat,
      timeFormat: body.timeFormat,
      timeZone: (body.timeZone || '').trim(),
      defaultLanguage: (body.defaultLanguage || '').trim()
    }
  };
}

/* ============================================================
   SETTINGS MODULE — ROUTER
   ============================================================ */

const settingsRouter = express.Router();

// ---- Business Profile ----

settingsRouter.get('/business-profile', requireAuth, requirePermission('Settings', 'view'), async (req, res, next) => {
  try {
    const profile = await getOrCreateSingleton(BusinessProfile);
    res.status(200).json({ success: true, data: profile });
  } catch (error) {
    next(error);
  }
});

settingsRouter.put('/business-profile', requireAuth, requireRole('Owner'), async (req, res, next) => {
  try {
    const { errors, data } = validateBusinessProfileBody(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }

    const profile = await getOrCreateSingleton(BusinessProfile);
    Object.assign(profile, data, { updatedBy: req.user._id });

    if (typeof req.body.logoData === 'string') {
      profile.logoData = req.body.logoData;
    } else if (req.body.removeLogo) {
      profile.logoData = '';
    }

    await profile.save();

    res.status(200).json({ success: true, message: 'Business profile updated successfully', data: profile });
  } catch (error) {
    next(error);
  }
});

// ---- User Management ----

settingsRouter.get('/users', requireAuth, requireRole('Owner'), async (req, res, next) => {
  try {
    const { page, limit, skip } = buildPagination(req.query);
    const mongoFilter = {};

    if (req.query.status === 'Active') {
      mongoFilter.isActive = true;
    } else if (req.query.status === 'Inactive') {
      mongoFilter.isActive = false;
    }

    if (req.query.search) {
      const safe = escapeRegex(String(req.query.search).trim());
      if (safe) {
        mongoFilter.$or = ['fullName', 'username', 'email'].map((field) => ({
          [field]: { $regex: safe, $options: 'i' }
        }));
      }
    }

    const [records, totalRecords] = await Promise.all([
      User.find(mongoFilter).sort({ createdDate: -1 }).skip(skip).limit(limit),
      User.countDocuments(mongoFilter)
    ]);

    res.status(200).json({
      success: true,
      data: records.map((u) => u.toSafeObject()),
      pagination: {
        page,
        limit,
        totalRecords,
        totalPages: Math.max(Math.ceil(totalRecords / limit), 1)
      }
    });
  } catch (error) {
    next(error);
  }
});

settingsRouter.post('/users', requireAuth, requireRole('Owner'), async (req, res, next) => {
  try {
    const { errors, data } = validateUserBody(req.body, { isCreate: true });
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }

    const duplicate = await User.findOne({ username: data.username });
    if (duplicate) {
      return res.status(409).json({ success: false, message: 'Username is already taken' });
    }

    const user = await User.create({
      ...data,
      password: req.body.password,
      isActive: true
    });

    res.status(201).json({ success: true, message: 'User created successfully', data: user.toSafeObject() });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Username is already taken' });
    }
    next(error);
  }
});

settingsRouter.put('/users/:id', requireAuth, requireRole('Owner'), async (req, res, next) => {
  try {
    const { errors, data } = validateUserBody(req.body, { isCreate: false });
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.role === 'Owner' && data.role !== 'Owner') {
      return res.status(400).json({ success: false, message: 'The Owner role cannot be removed from the Owner account' });
    }

    const duplicate = await User.findOne({ username: data.username, _id: { $ne: user._id } });
    if (duplicate) {
      return res.status(409).json({ success: false, message: 'Username is already taken' });
    }

    Object.assign(user, data);
    await user.save();

    res.status(200).json({ success: true, message: 'User updated successfully', data: user.toSafeObject() });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Username is already taken' });
    }
    next(error);
  }
});

settingsRouter.patch('/users/:id/status', requireAuth, requireRole('Owner'), async (req, res, next) => {
  try {
    const { status } = req.body;
    if (isBlank(status) || !['Active', 'Inactive'].includes(status)) {
      return res.status(400).json({ success: false, message: 'Status must be either Active or Inactive' });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    if (user.role === 'Owner' && status === 'Inactive') {
      return res.status(400).json({ success: false, message: 'The Owner account cannot be deactivated' });
    }

    user.isActive = status === 'Active';
    await user.save();

    res.status(200).json({
      success: true,
      message: `User ${status === 'Active' ? 'activated' : 'deactivated'} successfully`,
      data: user.toSafeObject()
    });
  } catch (error) {
    next(error);
  }
});

settingsRouter.post('/users/:id/reset-password', requireAuth, requireRole('Owner'), async (req, res, next) => {
  try {
    const { newPassword } = req.body;

    const passwordError = isBlank(newPassword) ? 'New password is required' : validatePasswordStrength(newPassword);
    if (passwordError) {
      return res.status(400).json({ success: false, message: passwordError });
    }

    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }

    user.password = newPassword;
    await user.save();

    res.status(200).json({ success: true, message: 'Password reset successfully' });
  } catch (error) {
    next(error);
  }
});

// ---- Role Permissions ----

// Read-only: any authenticated user may fetch THEIR OWN role's permission
// grid — nothing else. Used by the frontend to hide sidebar links and block
// pages the user has no "view" permission for, instead of only finding out
// after a 403 from the underlying API. This grants no ability to see other
// roles' permissions or to edit anything; editing stays Owner-only below.
authRoutes.get('/permissions', requireAuth, async (req, res, next) => {
  try {
    if (req.user.role === 'Owner') {
      const grid = {};
      PERMISSION_MODULES.forEach((moduleName) => {
        grid[moduleName] = { view: true, create: true, edit: true, delete: true, export: true, print: true };
      });
      return res.status(200).json({
        success: true,
        data: { role: 'Owner', modules: PERMISSION_MODULES, permissions: grid }
      });
    }

    await ensureRolePermissionsSeeded();
    const rolePermission = await RolePermission.findOne({ role: req.user.role });
    const permissions = rolePermission && rolePermission.permissions
      ? (rolePermission.permissions instanceof Map
        ? Object.fromEntries(rolePermission.permissions)
        : rolePermission.permissions)
      : defaultPermissionsForRole(req.user.role);

    res.status(200).json({
      success: true,
      data: { role: req.user.role, modules: PERMISSION_MODULES, permissions }
    });
  } catch (error) {
    next(error);
  }
});

settingsRouter.get('/permissions', requireAuth, requireRole('Owner'), async (req, res, next) => {
  try {
    await ensureRolePermissionsSeeded();
    const records = await RolePermission.find();
    res.status(200).json({
      success: true,
      data: {
        modules: PERMISSION_MODULES,
        actions: PERMISSION_ACTIONS,
        roles: ROLES,
        permissions: records
      }
    });
  } catch (error) {
    next(error);
  }
});

settingsRouter.put('/permissions/:role', requireAuth, requireRole('Owner'), async (req, res, next) => {
  try {
    const { role } = req.params;

    if (role === 'Owner') {
      return res.status(400).json({ success: false, message: 'Owner permissions cannot be modified' });
    }

    if (!ROLES.includes(role)) {
      return res.status(400).json({ success: false, message: 'Role is invalid' });
    }

    const { permissions } = req.body;
    if (!permissions || typeof permissions !== 'object') {
      return res.status(400).json({ success: false, message: 'Permissions payload is required' });
    }

    const sanitized = {};
    for (const moduleName of PERMISSION_MODULES) {
      const modulePerms = permissions[moduleName] || {};
      sanitized[moduleName] = {};
      for (const action of PERMISSION_ACTIONS) {
        sanitized[moduleName][action] = Boolean(modulePerms[action]);
      }
    }

    const record = await RolePermission.findOneAndUpdate(
      { role },
      { permissions: sanitized, updatedBy: req.user._id },
      { new: true, upsert: true }
    );

    res.status(200).json({ success: true, message: 'Role permissions updated successfully', data: record });
  } catch (error) {
    next(error);
  }
});

// ---- Number Series ----

settingsRouter.get('/number-series', requireAuth, requirePermission('Settings', 'view'), async (req, res, next) => {
  try {
    await ensureNumberSeriesSeeded();
    const records = await NumberSeries.find().sort({ label: 1 });

    const withPreview = await Promise.all(
      records.map(async (record) => {
        const counter = await Counter.findOne({ key: record.seriesKey });
        const currentSeq = counter ? counter.seq : 0;
        return {
          ...record.toJSON(),
          currentNumber: currentSeq > 0 ? record.startingNumber + currentSeq - 1 : null,
          preview: await previewNextSeriesNumber(record)
        };
      })
    );

    res.status(200).json({ success: true, data: withPreview });
  } catch (error) {
    next(error);
  }
});

settingsRouter.put('/number-series/:id', requireAuth, requireRole('Owner'), async (req, res, next) => {
  try {
    const { errors, data } = validateNumberSeriesBody(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }

    const record = await NumberSeries.findById(req.params.id);
    if (!record) {
      return res.status(404).json({ success: false, message: 'Number series not found' });
    }

    const duplicatePrefix = await NumberSeries.findOne({
      _id: { $ne: record._id },
      prefix: data.prefix
    });
    if (duplicatePrefix) {
      return res.status(409).json({ success: false, message: 'Another series already uses this prefix' });
    }

    Object.assign(record, data, { updatedBy: req.user._id });
    await record.save();

    const counter = await Counter.findOne({ key: record.seriesKey });
    const currentSeq = counter ? counter.seq : 0;

    res.status(200).json({
      success: true,
      message: 'Number series updated successfully',
      data: {
        ...record.toJSON(),
        currentNumber: currentSeq > 0 ? record.startingNumber + currentSeq - 1 : null,
        preview: await previewNextSeriesNumber(record)
      }
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ success: false, message: 'Another series already uses this prefix' });
    }
    next(error);
  }
});

// ---- Print Settings ----

settingsRouter.get('/print', requireAuth, requirePermission('Settings', 'view'), async (req, res, next) => {
  try {
    const settings = await getOrCreateSingleton(PrintSettings);
    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
});

settingsRouter.put('/print', requireAuth, requireRole('Owner'), async (req, res, next) => {
  try {
    const { errors, data } = validatePrintSettingsBody(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }

    const settings = await getOrCreateSingleton(PrintSettings);
    Object.assign(settings, data, { updatedBy: req.user._id });
    await settings.save();

    res.status(200).json({ success: true, message: 'Print settings updated successfully', data: settings });
  } catch (error) {
    next(error);
  }
});

// ---- Security Settings ----

settingsRouter.get('/security', requireAuth, requireRole('Owner'), async (req, res, next) => {
  try {
    const settings = await refreshSecuritySettingsCache();
    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
});

settingsRouter.put('/security', requireAuth, requireRole('Owner'), async (req, res, next) => {
  try {
    const { errors, data } = validateSecuritySettingsBody(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }

    const settings = await getOrCreateSingleton(SecuritySettings);
    Object.assign(settings, data, { updatedBy: req.user._id });
    await settings.save();

    setSecuritySettings({
      sessionTimeoutMinutes: settings.sessionTimeoutMinutes,
      passwordMinLength: settings.passwordMinLength,
      loginAttemptLimit: settings.loginAttemptLimit,
      forcePasswordChange: settings.forcePasswordChange
    });

    res.status(200).json({ success: true, message: 'Security settings updated successfully', data: settings });
  } catch (error) {
    next(error);
  }
});

// ---- Application Settings ----

settingsRouter.get('/application', requireAuth, requirePermission('Settings', 'view'), async (req, res, next) => {
  try {
    const settings = await getOrCreateSingleton(AppSettings);
    res.status(200).json({ success: true, data: settings });
  } catch (error) {
    next(error);
  }
});

settingsRouter.put('/application', requireAuth, requireRole('Owner'), async (req, res, next) => {
  try {
    const { errors, data } = validateAppSettingsBody(req.body);
    if (errors.length > 0) {
      return res.status(400).json({ success: false, message: errors[0], errors });
    }

    const settings = await getOrCreateSingleton(AppSettings);
    Object.assign(settings, data, { updatedBy: req.user._id });
    await settings.save();

    res.status(200).json({ success: true, message: 'Application settings updated successfully', data: settings });
  } catch (error) {
    next(error);
  }
});

// ---- Database Information (read-only) ----

settingsRouter.get('/database-info', requireAuth, requirePermission('Settings', 'view'), async (req, res, next) => {
  try {
    const connection = mongoose.connection;
    const isConnected = connection.readyState === 1;

    let collectionCount = null;
    let databaseName = null;

    if (isConnected && connection.db) {
      databaseName = connection.db.databaseName;
      const collections = await connection.db.listCollections().toArray();
      collectionCount = collections.length;
    }

    res.status(200).json({
      success: true,
      data: {
        connectionStatus: isConnected ? 'Connected' : 'Disconnected',
        databaseName,
        collectionCount,
        lastBackupTime: null
      }
    });
  } catch (error) {
    next(error);
  }
});

// ---- About (read-only) ----

settingsRouter.get('/about', requireAuth, requirePermission('Settings', 'view'), async (req, res, next) => {
  try {
    res.status(200).json({
      success: true,
      data: {
        erpName: 'Electronics ERP',
        version: '1.0.0',
        buildNumber: process.env.BUILD_NUMBER || 'dev',
        developer: 'Electronics ERP Team',
        licenseStatus: 'Unlicensed (placeholder)'
      }
    });
  } catch (error) {
    next(error);
  }
});

app.use('/api/settings', settingsRouter);





app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route not found'
  });
});

app.use((err, req, res, next) => {
  logger.error(err.message);
  res.status(err.status || 500).json({
    success: false,
    message: NODE_ENV === 'development' ? err.message : 'Internal server error'
  });
});

async function connectDatabase() {
  if (!MONGODB_URI) {
    logger.error('MONGODB_URI is not defined in environment variables');
    return;
  }

  try {
    await mongoose.connect(MONGODB_URI);
    logger.info('MongoDB connected successfully');
  } catch (error) {
    logger.error(`MongoDB connection failed: ${error.message}`);
  }
}

mongoose.connection.on('disconnected', () => {
  logger.warn('MongoDB disconnected');
});

mongoose.connection.on('error', (error) => {
  logger.error(`MongoDB error: ${error.message}`);
});

const WEAK_JWT_SECRET_PATTERNS = [
  /^<.*>$/,           // e.g. "<generate-a-long-random-secret>" left as a literal placeholder
  /changeme/i,
  /placeholder/i,
  /your[-_]?secret/i,
  /secretkey/i,
  /^secret$/i
];

function isWeakJwtSecret(secret) {
  if (!secret || typeof secret !== 'string') return true;
  if (secret.trim().length < 32) return true;
  return WEAK_JWT_SECRET_PATTERNS.some((pattern) => pattern.test(secret.trim()));
}

async function startServer() {
  if (!process.env.JWT_SECRET) {
    logger.error('JWT_SECRET is not defined in environment variables. Server cannot start securely');
    process.exit(1);
  }

  if (isWeakJwtSecret(process.env.JWT_SECRET)) {
    logger.error(
      'JWT_SECRET is missing, a placeholder, or too weak (must be a random string of at least 32 characters). ' +
      'Generate one with: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))" ' +
      'and set it in your .env file. Server cannot start securely'
    );
    process.exit(1);
  }

  await connectDatabase();

  // Start accepting HTTP connections immediately rather than waiting on
  // DB-dependent seeding. If MongoDB is temporarily unreachable at startup,
  // connectDatabase() above has already logged that and returned; the seed
  // functions below would otherwise block here for Mongoose's connection
  // buffering timeout (default up to ~30s) before the server ever started
  // listening, defeating the requireAuth 503 "temporarily unavailable"
  // pattern used everywhere else in this file — main.js's startup health
  // check would spin and eventually show a false "Startup Failed" dialog
  // even though the app is designed to run in a degraded, DB-unavailable
  // state and recover once the database comes back.
  const server = app.listen(PORT, () => {
    logger.info(`Server running on port ${PORT} in ${NODE_ENV} mode`);
  });

  (async () => {
    try {
      await ensureNumberSeriesSeeded();
      await ensureRolePermissionsSeeded();
      await refreshSecuritySettingsCache();
    } catch (error) {
      logger.error(`Settings initialization failed: ${error.message}`);
    }
  })();

  const shutdown = async (signal) => {
    logger.info(`${signal} received. Shutting down gracefully`);
    server.close(() => {
      logger.info('HTTP server closed');
    });
    await mongoose.connection.close();
    process.exit(0);
  };

  process.on('SIGINT', () => shutdown('SIGINT'));
  process.on('SIGTERM', () => shutdown('SIGTERM'));
}

startServer();