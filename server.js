const express = require('express');
const session = require('express-session');
const fs = require('fs');
const path = require('path');
const QRCode = require('qrcode');

const app = express();
const PORT = process.env.PORT || 3000;
const DB_PATH = path.resolve(process.env.AUREA_DB_PATH || path.join(__dirname, 'data', 'db.json'));
fs.mkdirSync(path.dirname(DB_PATH), { recursive: true });

const ADMIN_USER = process.env.AUREA_USER || 'lalomita';
const ADMIN_PASS = process.env.AUREA_PASS || '1564';
const SUPER_ADMIN_USER = process.env.AUREA_SUPER_USER || 'superadmin';
const SUPER_ADMIN_PASS = process.env.AUREA_SUPER_PASS || 'aurea-super-1564';

app.use(express.json({ limit: '8mb' }));
app.use(express.urlencoded({ extended: true, limit: '8mb' }));
app.use(session({
  secret: process.env.SESSION_SECRET || 'aurea-kmo-demo-secret-change-me',
  resave: false,
  saveUninitialized: false,
  cookie: { maxAge: 1000 * 60 * 60 * 8 }
}));
app.use((req, res, next) => {
  if (req.path.endsWith('.js') || req.path.endsWith('.css') || req.path.endsWith('.html')) {
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
  }
  next();
});
app.use(express.static(path.join(__dirname, 'public')));

function nowIso() {
  return new Date().toISOString();
}

function ensureDbShape(db) {
  db.restaurant = db.restaurant || {};
  db.restaurant.name = db.restaurant.name || 'AUREA Demo Restaurant';
  db.restaurant.subtitle = db.restaurant.subtitle || 'Menú, pedidos y atención desde cada mesa.';
  db.restaurant.logoText = db.restaurant.logoText || 'AUREA';
  db.restaurant.logoDataUrl = db.restaurant.logoDataUrl || '';
  db.restaurant.whatsapp = db.restaurant.whatsapp || '';
  db.restaurant.address = db.restaurant.address || '';
  db.restaurant.hours = db.restaurant.hours || '';
  db.restaurant.accentColor = db.restaurant.accentColor || db.restaurant.primaryColor || '#c9a44c';
  db.restaurant.primaryColor = '#c9a44c';
  db.restaurant.operationMode = db.restaurant.operationMode || 'commands';
  db.restaurant.crmOptInText = db.restaurant.crmOptInText || '';
  db.restaurant.crmEnabled = Boolean(db.restaurant.crmEnabled);
  db.restaurant.pinPrefix = restaurantPinPrefix(db);
  db.restaurant.assignmentMode = db.restaurant.assignmentMode || 'free';
  db.restaurant.instanceSlug = cleanSlug(db.restaurant.instanceSlug || db.restaurant.name || 'aurea-demo');
  db.restaurant.whatsappOfficial = db.restaurant.whatsappOfficial || {};
  db.restaurant.whatsappOfficial = {
    enabled: Boolean(db.restaurant.whatsappOfficial.enabled),
    displayName: cleanString(db.restaurant.whatsappOfficial.displayName || db.restaurant.name || '', 100),
    businessPortfolioId: cleanString(db.restaurant.whatsappOfficial.businessPortfolioId || '', 120),
    wabaId: cleanString(db.restaurant.whatsappOfficial.wabaId || '', 120),
    phoneNumberId: cleanString(db.restaurant.whatsappOfficial.phoneNumberId || '', 120),
    status: cleanString(db.restaurant.whatsappOfficial.status || 'not_connected', 40),
    webhookUrl: cleanString(db.restaurant.whatsappOfficial.webhookUrl || '', 240),
    notes: cleanString(db.restaurant.whatsappOfficial.notes || '', 300)
  };
  db.tables = Array.isArray(db.tables) ? db.tables : [];
  db.categories = Array.isArray(db.categories) ? db.categories : [];
  db.menuItems = Array.isArray(db.menuItems) ? db.menuItems : [];
  if (!db.menuItems.length && Array.isArray(db.products) && db.products.length) {
    db.menuItems = db.products.map(product => ({
      id: product.id || makeId('item'),
      categoryId: product.categoryId || product.category || '',
      name: product.name || product.title || 'Producto',
      description: product.description || '',
      price: Number(product.price || 0),
      imageUrl: product.imageUrl || product.image || '',
      available: product.available !== false && product.active !== false && product.isAvailable !== false,
      featured: Boolean(product.featured)
    }));
  }
  db.menuItems = db.menuItems.map(item => ({
    ...item,
    price: Number(item.price || 0),
    available: item.available !== false && item.active !== false && item.isAvailable !== false,
    featured: Boolean(item.featured)
  }));
  db.alerts = Array.isArray(db.alerts) ? db.alerts : [];
  db.orders = Array.isArray(db.orders) ? db.orders : [];
  db.contacts = Array.isArray(db.contacts) ? db.contacts : [];
  db.billRequests = Array.isArray(db.billRequests) ? db.billRequests : [];
  db.payments = Array.isArray(db.payments) ? db.payments : [];
  db.expenses = Array.isArray(db.expenses) ? db.expenses : [];
  db.dailyClosures = Array.isArray(db.dailyClosures) ? db.dailyClosures : [];
  db.whatsappOrders = Array.isArray(db.whatsappOrders) ? db.whatsappOrders : [];
  db.whatsappOrders.forEach((order, index) => {
    order.ticketNumber = order.ticketNumber || index + 1;
    order.status = order.status || 'new';
    order.source = order.source || 'whatsapp_manual';
    order.updatedAt = order.updatedAt || order.createdAt || nowIso();
  });
  db.tableClosures = Array.isArray(db.tableClosures) ? db.tableClosures : [];
  db.feedback = Array.isArray(db.feedback) ? db.feedback : [];
  db.adminUsers = Array.isArray(db.adminUsers) ? db.adminUsers : [];
  db.superClients = Array.isArray(db.superClients) ? db.superClients : [];
  db.superClients.forEach(client => {
    client.createdAt = client.createdAt || nowIso();
    client.status = client.status || 'generated';
    client.name = cleanString(client.name || '', 120);
    client.slug = cleanSlug(client.slug || client.name || 'cliente');
    client.pinPrefix = cleanString(client.pinPrefix || initialsForPrefix(client.name || client.slug), 8).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'AU';
    client.subdomain = cleanString(client.subdomain || '', 120).toLowerCase();
  });
  db.staff = Array.isArray(db.staff) ? db.staff : [];
  db.tableSessions = Array.isArray(db.tableSessions) ? db.tableSessions : [];
  db.tableSessions.forEach(session => {
    session.diners = Array.isArray(session.diners) ? session.diners.map(cleanDinerName).filter(Boolean) : [];
    session.billPaidAt = session.billPaidAt || '';
    session.paymentStatus = session.paymentStatus || '';
    session.paymentId = session.paymentId || '';
    session.closedByStaffId = session.closedByStaffId || '';
    session.closedByStaffName = session.closedByStaffName || '';
  });
  db.payments.forEach(payment => {
    payment.status = payment.status || 'pending_admin';
    payment.method = payment.method || 'pending';
    payment.subtotal = roundMoney(payment.subtotal || 0);
    payment.discountAmount = roundMoney(payment.discountAmount || 0);
    payment.tipAmount = roundMoney(payment.tipAmount || 0);
    payment.totalDue = roundMoney(payment.totalDue || payment.subtotal - payment.discountAmount + payment.tipAmount);
    payment.cashAmount = roundMoney(payment.cashAmount || 0);
    payment.cardAmount = roundMoney(payment.cardAmount || 0);
    payment.transferAmount = roundMoney(payment.transferAmount || 0);
    payment.otherAmount = roundMoney(payment.otherAmount || 0);
    payment.totalPaid = roundMoney(payment.totalPaid || payment.cashAmount + payment.cardAmount + payment.transferAmount + payment.otherAmount || payment.totalDue);
    payment.createdAt = payment.createdAt || nowIso();
    payment.updatedAt = payment.updatedAt || payment.createdAt;
    payment.businessDate = payment.businessDate || businessDate(payment.createdAt);
  });
  db.expenses.forEach(expense => {
    expense.amount = roundMoney(expense.amount || 0);
    expense.businessDate = expense.businessDate || businessDate(expense.createdAt || nowIso());
    expense.createdAt = expense.createdAt || nowIso();
    expense.updatedAt = expense.updatedAt || expense.createdAt;
  });
  db.dailyClosures.forEach(close => {
    close.businessDate = close.businessDate || businessDate(close.createdAt || nowIso());
    close.createdAt = close.createdAt || nowIso();
    close.updatedAt = close.updatedAt || close.createdAt;
  });
  db.staff.forEach(member => {
    member.assignedTableIds = Array.isArray(member.assignedTableIds) ? member.assignedTableIds : [];
    member.stats = member.stats || {};
    member.pin = normalizeStaffPin(db, member.pin) || member.pin || '';
  });
  db.orders.forEach((order, index) => {
    order.commandNumber = order.commandNumber || index + 1;
    order.status = order.status || 'new';
    order.estimatedTime = order.estimatedTime || '';
    order.confirmedAt = order.confirmedAt || '';
    order.inProgressAt = order.inProgressAt || '';
    order.readyAt = order.readyAt || '';
    order.deliveredAt = order.deliveredAt || '';
    order.assignedStaffId = order.assignedStaffId || '';
    order.assignedStaffName = order.assignedStaffName || '';
    for (const item of order.items || []) item.dinerName = cleanDinerName(item.dinerName || item.personName || '');
    order.updatedAt = order.updatedAt || order.createdAt || nowIso();
  });
  db.counters = db.counters || {};
  db.counters.command = Number(db.counters.command || Math.max(0, ...db.orders.map(o => Number(o.commandNumber || 0))));
  db.counters.whatsapp = Number(db.counters.whatsapp || Math.max(0, ...db.whatsappOrders.map(o => Number(o.ticketNumber || 0))));
  return db;
}

function readDb() {
  const raw = fs.readFileSync(DB_PATH, 'utf8');
  return ensureDbShape(JSON.parse(raw));
}

function writeDb(db) {
  fs.writeFileSync(DB_PATH, JSON.stringify(ensureDbShape(db), null, 2), 'utf8');
}

function makeId(prefix) {
  return `${prefix}-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
}

function randomChars(length = 18, alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%&*') {
  let output = '';
  for (let i = 0; i < length; i += 1) {
    output += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return output;
}

function generateClientPassword(slug) {
  const safe = String(slug || 'CLIENTE').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 14) || 'CLIENTE';
  return `KMO-${safe}-${randomChars(6, 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789')}!`;
}

function generateSessionSecret() {
  return randomChars(48, 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789!@$%&*_-');
}

function cleanSubdomain(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9.-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function clientEnvBlock(client) {
  return [
    `AUREA_USER=${client.adminUser}`,
    `AUREA_PASS=${client.adminPassword}`,
    `AUREA_SUPER_USER=${SUPER_ADMIN_USER}`,
    `AUREA_SUPER_PASS=USA_TU_PASSWORD_SUPER_ADMIN_ACTUAL`,
    `SESSION_SECRET=${client.sessionSecret}`,
    `AUREA_DB_PATH=${client.dbPath}`
  ].join('\n');
}

function clientWelcomeMessage(client) {
  return [
    `Hola, ${client.name}. Ya quedó listo su acceso inicial a AUREA.`,
    ``,
    `URL: https://${client.subdomain || `${client.slug}.kmo.lat`}`,
    `Usuario admin: ${client.adminUser}`,
    `Contraseña admin: ${client.adminPassword}`,
    `PIN inicial meseros/cocina: ${client.initialPin}`,
    ``,
    `En su primer ingreso verán un tour rápido para configurar menú, mesas, QR y meseros.`
  ].join('\n');
}

function cleanString(value, max = 160) {
  return String(value || '').trim().slice(0, max);
}

function cleanSlug(value) {
  return String(value || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'aurea-demo';
}

function cleanColor(value) {
  const color = cleanString(value, 20);
  return /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(color) ? color : '#c9a44c';
}

function cleanDataUrl(value) {
  const str = String(value || '').trim();
  if (!str) return '';
  if (!str.startsWith('data:image/')) return '';
  return str.slice(0, 4_000_000);
}

function normalizePhone(value) {
  return String(value || '').replace(/\D/g, '').slice(0, 16);
}


function initialsForPrefix(value) {
  const words = String(value || '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toUpperCase()
    .replace(/[^A-Z0-9\s-]/g, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (words.length >= 2) return `${words[0][0]}${words[1][0]}`;
  if (words.length === 1) return words[0].slice(0, 2);
  return 'AU';
}

function restaurantPinPrefix(db) {
  const base = db?.restaurant?.pinPrefix || initialsForPrefix(db?.restaurant?.name || db?.restaurant?.instanceSlug || 'Aurea');
  return String(base || 'AU').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'AU';
}

function pinDigits(value) {
  return String(value || '').replace(/\D/g, '').slice(-4);
}

function normalizeStaffPin(db, value, options = {}) {
  const raw = cleanString(value, 20).toUpperCase().trim();
  const prefix = restaurantPinPrefix(db);
  if (/^[A-Z0-9]{1,6}-\d{4}$/.test(raw)) return raw;
  const digits = pinDigits(raw);
  if (digits.length === 4) return `${prefix}-${digits}`;
  if (options.generate) return generateUniqueStaffPin(db);
  return '';
}

function staffPinLoginCandidates(db, value) {
  const raw = cleanString(value, 20).toUpperCase().trim();
  const normalized = normalizeStaffPin(db, raw);
  return Array.from(new Set([raw, normalized].filter(Boolean)));
}

function staffPinInUse(db, pin, exceptId = '') {
  return (db.staff || []).some(member => member.id !== exceptId && member.pin && member.pin === pin);
}

function generateUniqueStaffPin(db) {
  for (let i = 0; i < 200; i += 1) {
    const digits = String(Math.floor(1000 + Math.random() * 9000));
    const pin = `${restaurantPinPrefix(db)}-${digits}`;
    if (!staffPinInUse(db, pin)) return pin;
  }
  return `${restaurantPinPrefix(db)}-${Date.now().toString().slice(-4)}`;
}

function requireLogin(req, res, next) {
  if (req.session && req.session.isAdmin) return next();
  return res.status(401).json({ ok: false, message: 'No autorizado' });
}

function requireSuperAdmin(req, res, next) {
  if (req.session && req.session.isAdmin && req.session.adminRole === 'superadmin') return next();
  return res.status(403).json({ ok: false, message: 'Solo super admin' });
}

function requireStaff(req, res, next) {
  if (req.session && req.session.staffId) return next();
  return res.status(401).json({ ok: false, message: 'No autorizado' });
}

function getBaseUrl(req) {
  return `${req.protocol}://${req.get('host')}`;
}

function publicOrder(order) {
  if (!order) return null;
  return {
    id: order.id,
    commandNumber: order.commandNumber,
    tableName: order.tableName,
    status: order.status,
    estimatedTime: order.estimatedTime || '',
    total: order.total,
    items: order.items,
    createdAt: order.createdAt,
    updatedAt: order.updatedAt,
    confirmedAt: order.confirmedAt || '',
    inProgressAt: order.inProgressAt || '',
    readyAt: order.readyAt || '',
    deliveredAt: order.deliveredAt || '',
    assignedStaffId: order.assignedStaffId || '',
    assignedStaffName: order.assignedStaffName || ''
  };
}



function whatsappOrderStatusLabel(status) {
  const labels = {
    new: 'Nuevo',
    confirmed: 'Confirmado',
    in_progress: 'En preparación',
    ready: 'Listo',
    delivered: 'Entregado',
    closed: 'Cerrado',
    cancelled: 'Cancelado'
  };
  return labels[status] || labels.new;
}

function cleanWhatsappOrderPayload(body) {
  return {
    customerName: cleanString(body.customerName, 80),
    customerPhone: normalizePhone(body.customerPhone),
    message: cleanString(body.message, 700),
    itemsText: cleanString(body.itemsText || body.message, 900),
    address: cleanString(body.address, 240),
    paymentMethod: ['cash', 'card', 'transfer', 'pending'].includes(body.paymentMethod) ? body.paymentMethod : 'pending',
    totalEstimate: roundMoney(cleanNumber(body.totalEstimate, 0)),
    note: cleanString(body.note, 300),
    estimatedTime: cleanString(body.estimatedTime, 40)
  };
}

function cleanNumber(value, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

function roundMoney(value) {
  return Math.round((Number(value || 0) + Number.EPSILON) * 100) / 100;
}

function buildBillSummary(db, tableId) {
  const table = db.tables.find(t => t.id === tableId);
  if (!table) return null;

  const session = activeSessionForTable(db, table.id);
  let orders = (db.orders || []).filter(order => order.tableId === table.id && order.status !== 'cancelled');

  if (session) {
    orders = orders.filter(order => order.sessionId === session.id);
  } else {
    orders = orders.filter(order => ['new', 'confirmed', 'in_progress', 'ready', 'delivered'].includes(order.status));
  }

  const lines = [];
  for (const order of orders) {
    for (const item of order.items || []) {
      lines.push({
        orderId: order.id,
        commandNumber: order.commandNumber || '',
        status: order.status,
        itemId: item.itemId || '',
        name: item.name || 'Producto',
        qty: Number(item.qty || 0),
        price: Number(item.price || 0),
        note: item.note || '',
        dinerName: cleanDinerName(item.dinerName || item.personName || ''),
        subtotal: roundMoney(item.subtotal !== undefined ? item.subtotal : Number(item.price || 0) * Number(item.qty || 0))
      });
    }
  }

  const subtotal = roundMoney(lines.reduce((sum, item) => sum + Number(item.subtotal || 0), 0));
  return {
    table,
    session: session || null,
    orders: orders.map(publicOrder),
    lines,
    subtotal,
    splitAccounts: splitAccountsFromLines(lines),
    diners: session?.diners || [],
    source: 'aurea_estimated',
    disclaimer: 'Cuenta estimada con base en pedidos registrados en AUREA. Un mesero confirmará el total final.'
  };
}

function billWhenLabel(minutes) {
  const value = Number(minutes || 0);
  if (value === 5) return 'en 5 minutos';
  if (value === 10) return 'en 10 minutos';
  if (value > 0) return `en ${value} minutos`;
  return 'ahora';
}

function paymentMethodLabel(value) {
  const labels = {
    cash: 'Efectivo',
    card: 'Tarjeta / terminal',
    transfer: 'Transferencia',
    split: 'Cuenta dividida',
    pending: 'Por definir'
  };
  return labels[value] || labels.pending;
}

function paymentMethodLabelFull(value) {
  const labels = {
    cash: 'Efectivo',
    card: 'Tarjeta',
    transfer: 'Transferencia',
    mixed: 'Mixto',
    split: 'Cuenta dividida',
    pending: 'Por definir',
    other: 'Otro'
  };
  return labels[value] || labels.pending;
}

function businessDate(value = nowIso()) {
  try {
    return new Intl.DateTimeFormat('en-CA', {
      timeZone: process.env.AUREA_TIMEZONE || 'America/Mexico_City',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }).format(new Date(value));
  } catch (error) {
    return String(value || nowIso()).slice(0, 10);
  }
}

function normalizePaymentInput(db, tableId, payload = {}) {
  const summary = buildBillSummary(db, tableId) || { subtotal: 0, lines: [], orders: [] };
  const subtotal = roundMoney(summary.subtotal || 0);
  const discountAmount = Math.max(0, roundMoney(cleanNumber(payload.discountAmount, 0)));
  const tipAmount = Math.max(0, roundMoney(cleanNumber(payload.tipAmount, 0)));
  const totalDue = Math.max(0, roundMoney(subtotal - discountAmount + tipAmount));
  const method = ['cash', 'card', 'transfer', 'mixed', 'split', 'pending', 'other'].includes(payload.method) ? payload.method : 'pending';

  let cashAmount = Math.max(0, roundMoney(cleanNumber(payload.cashAmount, 0)));
  let cardAmount = Math.max(0, roundMoney(cleanNumber(payload.cardAmount, 0)));
  let transferAmount = Math.max(0, roundMoney(cleanNumber(payload.transferAmount, 0)));
  let otherAmount = Math.max(0, roundMoney(cleanNumber(payload.otherAmount, 0)));
  let totalPaid = roundMoney(cashAmount + cardAmount + transferAmount + otherAmount);

  const explicitPaid = payload.amountPaid !== undefined && payload.amountPaid !== '' ? Math.max(0, roundMoney(cleanNumber(payload.amountPaid, totalDue))) : null;

  if (method !== 'mixed' && method !== 'split') {
    const amount = explicitPaid !== null ? explicitPaid : totalDue;
    cashAmount = method === 'cash' ? amount : 0;
    cardAmount = method === 'card' ? amount : 0;
    transferAmount = method === 'transfer' ? amount : 0;
    otherAmount = method === 'other' ? amount : 0;
    totalPaid = amount;
  } else if (!totalPaid && explicitPaid !== null) {
    totalPaid = explicitPaid;
  } else if (!totalPaid) {
    totalPaid = totalDue;
  }

  return {
    summary,
    subtotal,
    discountAmount,
    tipAmount,
    totalDue,
    method,
    methodLabel: paymentMethodLabelFull(method),
    cashAmount,
    cardAmount,
    transferAmount,
    otherAmount,
    totalPaid,
    changeAmount: method === 'cash' ? Math.max(0, roundMoney(totalPaid - totalDue)) : 0,
    note: cleanString(payload.note || payload.notes || '', 300)
  };
}

function upsertSessionPayment(db, tableId, session, payload = {}, actor = {}) {
  db.payments = Array.isArray(db.payments) ? db.payments : [];
  const normalized = normalizePaymentInput(db, tableId, payload);
  let payment = payload.paymentId ? db.payments.find(item => item.id === payload.paymentId) : null;
  if (!payment && session?.paymentId) payment = db.payments.find(item => item.id === session.paymentId);
  if (!payment && session?.id) payment = db.payments.find(item => item.sessionId === session.id && item.status !== 'cancelled');
  const now = nowIso();
  if (!payment) {
    payment = {
      id: makeId('payment'),
      tableId,
      tableName: session?.tableName || db.tables.find(t => t.id === tableId)?.name || '',
      sessionId: session?.id || '',
      createdAt: now,
      createdByStaffId: actor.staffId || '',
      createdByStaffName: actor.staffName || '',
      createdByRole: actor.role || 'admin'
    };
    db.payments.unshift(payment);
  }

  Object.assign(payment, {
    tableId,
    tableName: session?.tableName || payment.tableName || '',
    sessionId: session?.id || payment.sessionId || '',
    subtotal: normalized.subtotal,
    discountAmount: normalized.discountAmount,
    tipAmount: normalized.tipAmount,
    totalDue: normalized.totalDue,
    method: normalized.method,
    methodLabel: normalized.methodLabel,
    cashAmount: normalized.cashAmount,
    cardAmount: normalized.cardAmount,
    transferAmount: normalized.transferAmount,
    otherAmount: normalized.otherAmount,
    totalPaid: normalized.totalPaid,
    changeAmount: normalized.changeAmount,
    note: normalized.note,
    status: payload.status || payment.status || 'pending_admin',
    businessDate: payload.businessDate || payment.businessDate || businessDate(now),
    updatedAt: now
  });

  if (payload.status === 'approved') {
    payment.approvedAt = payment.approvedAt || now;
    payment.approvedBy = actor.staffName || actor.adminName || 'Admin';
    payment.approvedByRole = actor.role || 'admin';
  }

  if (session) {
    session.paymentId = payment.id;
    session.paymentStatus = payment.status === 'approved' ? 'paid' : 'pending_approval';
    if (payment.status === 'approved') session.billPaidAt = session.billPaidAt || payment.approvedAt || now;
    session.updatedAt = now;
  }

  return payment;
}

function computeDailyFinanceSummary(db, date = businessDate()) {
  const payments = (db.payments || []).filter(payment => payment.status === 'approved' && (payment.businessDate || businessDate(payment.approvedAt || payment.createdAt)) === date);
  const pendingPayments = (db.payments || []).filter(payment => ['pending_admin', 'pending_approval'].includes(payment.status || '') && (payment.businessDate || businessDate(payment.createdAt)) === date);
  const expenses = (db.expenses || []).filter(expense => (expense.businessDate || businessDate(expense.createdAt)) === date && expense.status !== 'cancelled');
  const closures = (db.tableClosures || []).filter(item => businessDate(item.closedAt || item.createdAt) === date);
  const salesByMethod = payments.reduce((acc, payment) => {
    acc.cash += Number(payment.cashAmount || 0);
    acc.card += Number(payment.cardAmount || 0);
    acc.transfer += Number(payment.transferAmount || 0);
    acc.other += Number(payment.otherAmount || 0);
    acc.total += Number(payment.totalDue || payment.totalPaid || 0);
    acc.tips += Number(payment.tipAmount || 0);
    acc.discounts += Number(payment.discountAmount || 0);
    return acc;
  }, { cash: 0, card: 0, transfer: 0, other: 0, total: 0, tips: 0, discounts: 0 });

  Object.keys(salesByMethod).forEach(key => { salesByMethod[key] = roundMoney(salesByMethod[key]); });

  const expenseTotal = roundMoney(expenses.reduce((sum, item) => sum + Number(item.amount || 0), 0));
  const ticketAverage = payments.length ? roundMoney(salesByMethod.total / payments.length) : 0;
  return {
    date,
    payments,
    pendingPayments,
    expenses,
    closures,
    salesByMethod,
    expenseTotal,
    netCashExpected: roundMoney(salesByMethod.cash - expenseTotal),
    ticketAverage,
    paymentCount: payments.length,
    tableClosureCount: closures.length
  };
}

function cleanDinerName(value) {
  return cleanString(value, 60);
}

function normalizeDiners(value) {
  const raw = Array.isArray(value) ? value : String(value || '').split(/[\n,]+/);
  const seen = new Set();
  return raw
    .map(name => cleanDinerName(typeof name === 'string' ? name : (name?.name || name?.dinerName || '')))
    .filter(name => {
      const key = name.toLowerCase();
      if (!name || seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 16);
}

function updateSessionDiners(session, diners) {
  const cleaned = normalizeDiners(diners);
  if (!cleaned.length) return session?.diners || [];
  session.diners = cleaned;
  session.updatedAt = nowIso();
  return session.diners;
}

function splitAccountsFromLines(lines) {
  const map = new Map();
  for (const line of lines || []) {
    const name = cleanDinerName(line.dinerName || line.personName || line.accountName || '') || 'Sin asignar';
    if (!map.has(name)) map.set(name, { name, lines: [], subtotal: 0 });
    const account = map.get(name);
    account.lines.push(line);
    account.subtotal = roundMoney(account.subtotal + Number(line.subtotal || 0));
  }
  return Array.from(map.values()).map(account => ({
    ...account,
    subtotal: roundMoney(account.subtotal)
  }));
}


function parseDinerBreakdown(value) {
  if (Array.isArray(value)) return value;
  const text = String(value || '').trim();
  if (!text) return [];
  return text
    .split(/[,\n]+/)
    .map(part => {
      const [rawName, rawQty] = part.split(/[:=x]/);
      return {
        dinerName: cleanDinerName(rawName || ''),
        qty: Math.max(0, Math.min(20, Math.floor(cleanNumber(rawQty, 0))))
      };
    })
    .filter(part => part.dinerName && part.qty > 0);
}

function normalizeOrderLines(db, rawItems) {
  const cleanItems = [];
  for (const line of Array.isArray(rawItems) ? rawItems : []) {
    const item = db.menuItems.find(i => i.id === line.itemId && i.available !== false);
    let qty = Math.max(0, Math.min(20, Math.floor(Number(line.qty || 0))));
    if (!item || qty <= 0) continue;

    const note = cleanString(line.note, 140);
    const price = Number(item.price || 0);
    const allocations = parseDinerBreakdown(line.splitAssignments || line.dinerBreakdown || line.allocations || []);

    let remaining = qty;
    for (const alloc of allocations) {
      if (remaining <= 0) break;
      const partQty = Math.min(remaining, Math.max(0, Math.floor(Number(alloc.qty || 0))));
      const dinerName = cleanDinerName(alloc.dinerName || alloc.name || alloc.personName || '');
      if (partQty <= 0 || !dinerName) continue;
      cleanItems.push({
        itemId: item.id,
        name: item.name,
        price,
        qty: partQty,
        note,
        dinerName,
        subtotal: roundMoney(price * partQty)
      });
      remaining -= partQty;
    }

    if (remaining > 0) {
      cleanItems.push({
        itemId: item.id,
        name: item.name,
        price,
        qty: remaining,
        note,
        dinerName: cleanDinerName(line.dinerName || line.personName || ''),
        subtotal: roundMoney(price * remaining)
      });
    }
  }
  return cleanItems;
}

function closeTableSession(db, tableId, staff = null, options = {}) {
  const session = activeSessionForTable(db, tableId);
  const table = db.tables.find(t => t.id === tableId);
  if (!session || !table) return null;

  const summary = buildBillSummary(db, tableId) || { lines: [], subtotal: 0, orders: [], splitAccounts: [], diners: [] };
  const closeTime = nowIso();
  let payment = null;
  if (options.markPaid !== false) {
    payment = upsertSessionPayment(db, tableId, session, {
      ...(options.payment || {}),
      paymentId: options.paymentId || session.paymentId || options.payment?.paymentId || '',
      status: 'approved',
      businessDate: options.businessDate || businessDate(closeTime)
    }, {
      staffId: staff?.id || options.closedByStaffId || '',
      staffName: staff?.name || options.closedByStaffName || 'Admin',
      role: staff ? 'staff' : 'admin',
      adminName: options.closedByStaffName || 'Admin'
    });
  }
  const activeOrderIds = new Set((summary.orders || []).map(order => order.id));

  for (const order of db.orders || []) {
    if (activeOrderIds.has(order.id) && !['delivered', 'cancelled'].includes(order.status)) {
      updateOrderStatus(order, 'delivered');
      order.closedWithTable = true;
    }
  }

  for (const alert of db.alerts || []) {
    if ((alert.sessionId && alert.sessionId === session.id) || alert.tableId === tableId) {
      if (['new', 'in_progress'].includes(alert.status)) {
        alert.status = 'done';
        alert.updatedAt = closeTime;
      }
    }
  }

  for (const request of db.billRequests || []) {
    if ((request.sessionId && request.sessionId === session.id) || request.tableId === tableId) {
      if (['new', 'in_progress'].includes(request.status || 'new')) {
        request.status = options.markPaid === false ? 'closed' : 'paid';
        request.updatedAt = closeTime;
      }
    }
  }

  session.status = 'closed';
  session.paymentStatus = options.markPaid === false ? (session.paymentStatus || 'closed') : 'paid';
  session.paymentId = payment?.id || session.paymentId || '';
  session.billPaidAt = session.billPaidAt || (options.markPaid === false ? '' : (payment?.approvedAt || closeTime));
  session.closedAt = closeTime;
  session.closedByStaffId = staff?.id || options.closedByStaffId || '';
  session.closedByStaffName = staff?.name || options.closedByStaffName || 'Admin';
  session.updatedAt = closeTime;

  const feedbackForSession = (db.feedback || []).filter(item => item.sessionId === session.id || item.tableId === tableId);
  const closure = {
    id: makeId('closure'),
    tableId: table.id,
    tableName: table.name,
    sessionId: session.id,
    customerName: session.customerName || '',
    customerPhone: session.customerPhone || '',
    assignedStaffId: session.assignedStaffId || '',
    assignedStaffName: session.assignedStaffName || '',
    closedByStaffId: session.closedByStaffId || '',
    closedByStaffName: session.closedByStaffName || '',
    openedAt: session.createdAt || '',
    takenAt: session.takenAt || '',
    paidAt: session.billPaidAt || '',
    closedAt: closeTime,
    durationMinutes: minutesBetween(session.createdAt, closeTime),
    subtotal: roundMoney(summary.subtotal || 0),
    paymentId: payment?.id || session.paymentId || '',
    paymentMethod: payment?.method || '',
    paymentMethodLabel: payment?.methodLabel || '',
    paymentTotalDue: payment?.totalDue || 0,
    paymentTotalPaid: payment?.totalPaid || 0,
    tipAmount: payment?.tipAmount || 0,
    discountAmount: payment?.discountAmount || 0,
    orderCount: (summary.orders || []).length,
    lineCount: (summary.lines || []).length,
    diners: summary.diners || session.diners || [],
    splitAccounts: summary.splitAccounts || [],
    lines: summary.lines || [],
    feedbackCount: feedbackForSession.length,
    avgRating: average(feedbackForSession.map(item => Number(item.rating || 0)).filter(Boolean)),
    createdAt: closeTime
  };
  db.tableClosures = Array.isArray(db.tableClosures) ? db.tableClosures : [];
  db.tableClosures.unshift(closure);
  return { session, closure };
}

function upsertContact(db, payload) {
  const phone = normalizePhone(payload.phone || payload.customerPhone);
  if (!phone) return null;

  const table = payload.tableId ? db.tables.find(t => t.id === payload.tableId) : null;
  const session = table ? activeSessionForTable(db, table.id) : null;
  const assignedStaffId = payload.assignedStaffId || session?.assignedStaffId || '';
  const assignedStaffName = payload.assignedStaffName || session?.assignedStaffName || '';
  const existing = db.contacts.find(contact => contact.phone === phone);
  const source = cleanString(payload.source || 'web', 40);
  const optInPromos = payload.optInPromos !== false;

  if (existing) {
    existing.name = cleanString(payload.name || payload.customerName || existing.name, 80);
    existing.lastTableId = table?.id || existing.lastTableId || '';
    existing.lastTableName = table?.name || existing.lastTableName || '';
    existing.lastSource = source;
    existing.optInPromos = existing.optInPromos || optInPromos;
    existing.lastSeenAt = nowIso();
    existing.visits = Number(existing.visits || 0) + 1;
    existing.orderCount = Number(existing.orderCount || 0) + (payload.countOrder ? 1 : 0);
    if (assignedStaffId && !existing.assignedStaffId) {
      existing.assignedStaffId = assignedStaffId;
      existing.assignedStaffName = assignedStaffName;
    }
    if (payload.note) existing.note = cleanString(payload.note, 280);
    return existing;
  }

  const contact = {
    id: makeId('contact'),
    name: cleanString(payload.name || payload.customerName || '', 80),
    phone,
    optInPromos,
    firstSource: source,
    lastSource: source,
    firstTableId: table?.id || '',
    firstTableName: table?.name || '',
    lastTableId: table?.id || '',
    lastTableName: table?.name || '',
    note: cleanString(payload.note || '', 280),
    visits: 1,
    orderCount: payload.countOrder ? 1 : 0,
    assignedStaffId,
    assignedStaffName,
    firstSeenAt: nowIso(),
    lastSeenAt: nowIso()
  };
  db.contacts.unshift(contact);
  return contact;
}

function updateOrderStatus(order, status, estimatedTime = '') {
  const allowed = ['new', 'confirmed', 'in_progress', 'ready', 'delivered', 'cancelled'];
  if (!allowed.includes(status)) return order;
  order.status = status;
  order.updatedAt = nowIso();
  if (estimatedTime !== undefined) order.estimatedTime = cleanString(estimatedTime, 30);
  if (status === 'confirmed' && !order.confirmedAt) order.confirmedAt = nowIso();
  if (status === 'in_progress' && !order.inProgressAt) order.inProgressAt = nowIso();
  if (status === 'ready' && !order.readyAt) order.readyAt = nowIso();
  if (status === 'delivered' && !order.deliveredAt) order.deliveredAt = nowIso();
  return order;
}


function minutesBetween(a, b) {
  if (!a || !b) return null;
  const diff = (new Date(b).getTime() - new Date(a).getTime()) / 60000;
  return Number.isFinite(diff) && diff >= 0 ? diff : null;
}

function average(values) {
  const valid = values.filter(value => Number.isFinite(value));
  if (!valid.length) return null;
  return Math.round((valid.reduce((sum, value) => sum + value, 0) / valid.length) * 10) / 10;
}

function findZoneStaff(db, tableId) {
  return (db.staff || []).find(member => member.active !== false && Array.isArray(member.assignedTableIds) && member.assignedTableIds.includes(tableId));
}

function activeSessionForTable(db, tableId) {
  return (db.tableSessions || []).find(session => session.tableId === tableId && session.status === 'active');
}

function createOrUpdateTableSession(db, table, payload = {}) {
  db.tableSessions = Array.isArray(db.tableSessions) ? db.tableSessions : [];
  let session = activeSessionForTable(db, table.id);
  const name = cleanString(payload.customerName || payload.name || session?.customerName || '', 80);
  const phone = normalizePhone(payload.customerPhone || payload.phone || session?.customerPhone || '');

  if (!session) {
    session = {
      id: makeId('session'),
      tableId: table.id,
      tableName: table.name,
      customerName: name,
      customerPhone: phone,
      status: 'active',
      assignedStaffId: '',
      assignedStaffName: '',
      assignmentMode: db.restaurant.assignmentMode || 'free',
      source: cleanString(payload.source || 'table_visit', 40),
      createdAt: nowIso(),
      updatedAt: nowIso(),
      takenAt: '',
      closedAt: '',
      diners: []
    };
    db.tableSessions.unshift(session);
  } else {
    session.customerName = name || session.customerName || '';
    session.customerPhone = phone || session.customerPhone || '';
    session.updatedAt = nowIso();
    session.source = cleanString(payload.source || session.source || 'table_visit', 40);
    session.diners = Array.isArray(session.diners) ? session.diners : [];
  }

  if (payload.diners !== undefined) updateSessionDiners(session, payload.diners);

  if (!session.assignedStaffId && db.restaurant.assignmentMode === 'zone') {
    const zoneStaff = findZoneStaff(db, table.id);
    if (zoneStaff) {
      session.assignedStaffId = zoneStaff.id;
      session.assignedStaffName = zoneStaff.name;
      session.takenAt = session.takenAt || nowIso();
      session.assignmentMode = 'zone';
    }
  }

  return session;
}

function sessionAssignmentPayload(session) {
  if (!session) return {};
  return {
    sessionId: session.id,
    assignedStaffId: session.assignedStaffId || '',
    assignedStaffName: session.assignedStaffName || ''
  };
}

function tableNeedsCustomerAlert(db, tableId) {
  const recent = (db.alerts || []).find(alert => alert.tableId === tableId && alert.type === 'customer' && alert.status === 'new');
  return !recent;
}

function addCustomerArrivalAlert(db, session) {
  if (!session || session.assignedStaffId || !tableNeedsCustomerAlert(db, session.tableId)) return;
  db.alerts.unshift({
    id: makeId('alert'),
    tableId: session.tableId,
    tableName: session.tableName,
    sessionId: session.id,
    type: 'customer',
    customerName: session.customerName || '',
    customerPhone: session.customerPhone || '',
    note: session.customerName ? `Nuevo cliente VIP: ${session.customerName}` : 'Nuevo cliente en mesa',
    status: 'new',
    assignedStaffId: '',
    assignedStaffName: '',
    createdAt: nowIso(),
    updatedAt: nowIso()
  });
}

function assignToSessionRelatedItems(db, session) {
  for (const alert of db.alerts || []) {
    if ((alert.sessionId && alert.sessionId === session.id) || alert.tableId === session.tableId) {
      if (!alert.assignedStaffId) {
        alert.assignedStaffId = session.assignedStaffId;
        alert.assignedStaffName = session.assignedStaffName;
      }
    }
  }
  for (const order of db.orders || []) {
    if (order.tableId === session.tableId && !['delivered', 'cancelled'].includes(order.status)) {
      if (!order.assignedStaffId) {
        order.assignedStaffId = session.assignedStaffId;
        order.assignedStaffName = session.assignedStaffName;
      }
    }
  }
  for (const contact of db.contacts || []) {
    if ((session.customerPhone && contact.phone === session.customerPhone) || contact.lastTableId === session.tableId) {
      if (!contact.assignedStaffId) {
        contact.assignedStaffId = session.assignedStaffId;
        contact.assignedStaffName = session.assignedStaffName;
      }
    }
  }
}

function computeStaffStats(db) {
  const activeSessions = (db.tableSessions || []).filter(session => session.status === 'active');
  const activeAlerts = (db.alerts || []).filter(alert => ['new', 'in_progress'].includes(alert.status));
  const orders = db.orders || [];
  const contacts = db.contacts || [];

  return (db.staff || []).map(member => {
    const memberOrders = orders.filter(order => order.assignedStaffId === member.id);
    const activeOrders = memberOrders.filter(order => ['new', 'confirmed', 'in_progress', 'ready'].includes(order.status));
    const deliveredOrders = memberOrders.filter(order => order.status === 'delivered');
    const responseTimes = (db.tableSessions || [])
      .filter(session => session.assignedStaffId === member.id && session.takenAt)
      .map(session => minutesBetween(session.createdAt, session.takenAt))
      .filter(value => value !== null);
    const confirmTimes = memberOrders
      .filter(order => order.confirmedAt)
      .map(order => minutesBetween(order.createdAt, order.confirmedAt))
      .filter(value => value !== null);
    const deliveryTimes = deliveredOrders
      .filter(order => order.deliveredAt)
      .map(order => minutesBetween(order.createdAt, order.deliveredAt))
      .filter(value => value !== null);
    const vipCaptured = contacts.filter(contact => contact.assignedStaffId === member.id && contact.optInPromos).length;

    return {
      staffId: member.id,
      name: member.name,
      role: member.role,
      activeTables: activeSessions.filter(session => session.assignedStaffId === member.id).length,
      activeAlerts: activeAlerts.filter(alert => alert.assignedStaffId === member.id).length,
      activeOrders: activeOrders.length,
      deliveredOrders: deliveredOrders.length,
      vipCaptured,
      totalSales: memberOrders.reduce((sum, order) => sum + Number(order.total || 0), 0),
      avgTakeMinutes: average(responseTimes),
      avgConfirmMinutes: average(confirmTimes),
      avgDeliveryMinutes: average(deliveryTimes)
    };
  });
}

app.get('/health', (req, res) => {
  res.json({ ok: true, product: 'AUREA by KMO', version: '0.8.7-daily-close' });
});

app.get('/t/:tableId', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'table.html'));
});

app.get('/kitchen', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'kitchen.html'));
});

app.get('/kitchen.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'kitchen.html'));
});

app.get('/superadmin.html', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'superadmin.html'));
});

app.get('/superadmin', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'superadmin.html'));
});

app.post('/api/login', (req, res) => {
  const username = cleanString(req.body.username, 80);
  const password = String(req.body.password || '');
  const db = readDb();
  const accounts = [
    { username: ADMIN_USER, password: ADMIN_PASS, role: 'admin', name: db.restaurant?.name || 'Admin' },
    { username: SUPER_ADMIN_USER, password: SUPER_ADMIN_PASS, role: 'superadmin', name: 'Super Admin' },
    ...(Array.isArray(db.adminUsers) ? db.adminUsers : [])
  ].filter(account => account && account.username && account.password);
  const account = accounts.find(item => item.username === username && item.password === password);
  if (account) {
    req.session.isAdmin = true;
    req.session.adminRole = account.role || 'admin';
    req.session.adminUser = account.username;
    return res.json({ ok: true, role: req.session.adminRole, user: req.session.adminUser });
  }
  return res.status(401).json({ ok: false, message: 'Usuario o contraseña incorrectos' });
});

app.post('/api/logout', (req, res) => {
  req.session.destroy(() => res.json({ ok: true }));
});

app.get('/api/session', (req, res) => {
  res.json({ ok: true, isAdmin: Boolean(req.session && req.session.isAdmin), role: req.session?.adminRole || '', user: req.session?.adminUser || '' });
});

app.get('/api/super/clients', requireSuperAdmin, (req, res) => {
  const db = readDb();
  res.json({ ok: true, clients: db.superClients || [] });
});

app.post('/api/super/clients/generate', requireSuperAdmin, (req, res) => {
  const db = readDb();
  const name = cleanString(req.body.name, 120);
  if (!name) return res.status(400).json({ ok: false, message: 'Nombre del restaurante requerido' });

  const slug = cleanSlug(req.body.slug || name);
  const pinPrefix = cleanString(req.body.pinPrefix || initialsForPrefix(name), 8).toUpperCase().replace(/[^A-Z0-9]/g, '') || 'AU';
  const subdomain = cleanSubdomain(req.body.subdomain || `${slug}.kmo.lat`);
  const adminUser = cleanSlug(req.body.adminUser || slug).replaceAll('-', '') || slug;
  const adminPassword = generateClientPassword(slug);
  const initialPinDigits = String(Math.floor(1000 + Math.random() * 9000));
  const initialPin = `${pinPrefix}-${initialPinDigits}`;
  const sessionSecret = generateSessionSecret();
  const dbPath = `/data/aurea/${slug}/db.json`;

  const client = {
    id: makeId('client'),
    name,
    slug,
    pinPrefix,
    subdomain,
    adminUser,
    adminPassword,
    initialPin,
    initialPinDigits,
    sessionSecret,
    dbPath,
    envBlock: '',
    welcomeMessage: '',
    status: 'generated',
    createdAt: nowIso(),
    createdBy: req.session.adminUser || 'superadmin'
  };
  client.envBlock = clientEnvBlock(client);
  client.welcomeMessage = clientWelcomeMessage(client);

  db.superClients.unshift(client);
  writeDb(db);
  res.json({ ok: true, client });
});

app.delete('/api/super/clients/:id', requireSuperAdmin, (req, res) => {
  const db = readDb();
  const before = (db.superClients || []).length;
  db.superClients = (db.superClients || []).filter(client => client.id !== req.params.id);
  writeDb(db);
  res.json({ ok: true, deleted: before - db.superClients.length });
});

app.post('/api/staff/login', (req, res) => {
  const db = readDb();
  const candidates = staffPinLoginCandidates(db, req.body.pin);
  const staff = db.staff.find(member => member.active !== false && member.pin && candidates.includes(member.pin));
  if (!staff) return res.status(401).json({ ok: false, message: 'PIN incorrecto o mesero inactivo' });
  req.session.staffId = staff.id;
  res.json({ ok: true, staff: { id: staff.id, name: staff.name, role: staff.role } });
});

app.post('/api/staff/logout', (req, res) => {
  req.session.staffId = null;
  res.json({ ok: true });
});

app.get('/api/staff/session', (req, res) => {
  const db = readDb();
  const staff = req.session?.staffId ? db.staff.find(member => member.id === req.session.staffId) : null;
  res.json({ ok: true, isStaff: Boolean(staff), staff: staff ? { id: staff.id, name: staff.name, role: staff.role } : null });
});

app.get('/api/staff/data', requireStaff, (req, res) => {
  const db = readDb();
  const staff = db.staff.find(member => member.id === req.session.staffId);
  res.json({
    ok: true,
    restaurant: db.restaurant,
    staff: staff ? { id: staff.id, name: staff.name, role: staff.role, whatsapp: staff.whatsapp } : null,
    alerts: db.alerts,
    orders: db.orders,
    feedback: db.feedback || [],
    tableSessions: db.tableSessions,
    tables: db.tables,
    categories: db.categories,
    menuItems: db.menuItems,
    products: db.menuItems,
    menu: db.menuItems,
    staffStats: computeStaffStats(db)
  });
});

app.patch('/api/staff/alerts/:id', requireStaff, (req, res) => {
  const db = readDb();
  const alert = db.alerts.find(a => a.id === req.params.id);
  if (!alert) return res.status(404).json({ ok: false, message: 'Alerta no encontrada' });
  alert.status = ['new', 'in_progress', 'done', 'cancelled'].includes(req.body.status) ? req.body.status : alert.status;
  const staff = db.staff.find(member => member.id === req.session.staffId);
  if (staff && !alert.assignedStaffId && ['in_progress', 'done'].includes(alert.status)) {
    alert.assignedStaffId = staff.id;
    alert.assignedStaffName = staff.name;
    const session = activeSessionForTable(db, alert.tableId);
    if (session && !session.assignedStaffId) {
      session.assignedStaffId = staff.id;
      session.assignedStaffName = staff.name;
      session.takenAt = session.takenAt || nowIso();
      assignToSessionRelatedItems(db, session);
    }
  }
  alert.updatedAt = nowIso();
  writeDb(db);
  res.json({ ok: true, alert });
});

app.patch('/api/staff/orders/:id', requireStaff, (req, res) => {
  const db = readDb();
  const order = db.orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ ok: false, message: 'Pedido no encontrado' });
  const staff = db.staff.find(member => member.id === req.session.staffId);
  if (staff && !order.assignedStaffId) {
    order.assignedStaffId = staff.id;
    order.assignedStaffName = staff.name;
    const session = activeSessionForTable(db, order.tableId);
    if (session && !session.assignedStaffId) {
      session.assignedStaffId = staff.id;
      session.assignedStaffName = staff.name;
      session.takenAt = session.takenAt || nowIso();
      assignToSessionRelatedItems(db, session);
    }
  }
  updateOrderStatus(order, req.body.status, req.body.estimatedTime);
  writeDb(db);
  res.json({ ok: true, order });
});



function createManualOrderForTable(db, table, payload = {}, actor = {}) {
  const session = createOrUpdateTableSession(db, table, {
    customerName: payload.customerName || '',
    customerPhone: payload.customerPhone || '',
    source: payload.source || 'manual_order',
    diners: payload.diners
  });

  const staff = actor.staff || null;
  if (staff) {
    if (session.assignedStaffId && session.assignedStaffId !== staff.id && actor.enforceAssignment !== false) {
      const err = new Error(`Esta mesa está asignada a ${session.assignedStaffName || 'otro mesero'}`);
      err.status = 403;
      throw err;
    }
    session.assignedStaffId = staff.id;
    session.assignedStaffName = staff.name;
    session.takenAt = session.takenAt || nowIso();
  } else if (actor.adminName && !session.assignedStaffId) {
    session.assignedStaffId = '';
    session.assignedStaffName = actor.adminName;
  }

  session.assignmentMode = db.restaurant.assignmentMode || 'free';
  session.updatedAt = nowIso();
  assignToSessionRelatedItems(db, session);

  if (payload.diners !== undefined) updateSessionDiners(session, payload.diners);

  const items = Array.isArray(payload.items) ? payload.items : [];
  const cleanItems = normalizeOrderLines(db, items);
  if (cleanItems.length === 0) {
    const err = new Error('La comanda manual está vacía');
    err.status = 400;
    throw err;
  }

  if (session.customerPhone) {
    upsertContact(db, {
      tableId: table.id,
      phone: session.customerPhone,
      name: session.customerName,
      source: payload.source || 'manual_order',
      optInPromos: true,
      countOrder: true,
      assignedStaffId: session.assignedStaffId,
      assignedStaffName: session.assignedStaffName
    });
  }

  const total = roundMoney(cleanItems.reduce((sum, item) => sum + item.subtotal, 0));
  db.counters = db.counters || {};
  db.counters.command = Number(db.counters.command || 0) + 1;
  const order = {
    id: makeId('order'),
    commandNumber: db.counters.command,
    tableId: table.id,
    tableName: table.name,
    customerName: session.customerName || '',
    customerPhone: session.customerPhone || '',
    note: cleanString(payload.note || 'Comanda manual', 280),
    items: cleanItems,
    total,
    status: 'new',
    estimatedTime: '',
    sessionId: session.id,
    assignedStaffId: session.assignedStaffId || '',
    assignedStaffName: session.assignedStaffName || actor.adminName || '',
    source: payload.source || 'manual',
    confirmedAt: '',
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  db.orders.unshift(order);
  db.alerts.unshift({
    id: makeId('alert'),
    tableId: table.id,
    tableName: table.name,
    type: 'order',
    customerName: order.customerName,
    customerPhone: order.customerPhone,
    note: `Comanda manual #${order.commandNumber} · ${cleanItems.length} producto(s) · $${total}`,
    status: 'new',
    sessionId: session.id,
    assignedStaffId: order.assignedStaffId,
    assignedStaffName: order.assignedStaffName,
    createdAt: nowIso(),
    updatedAt: nowIso(),
    orderId: order.id
  });

  return { order, session };
}


app.post('/api/staff/tables/:tableId/order', requireStaff, (req, res) => {
  const db = readDb();
  const table = db.tables.find(t => t.id === req.params.tableId);
  if (!table) return res.status(404).json({ ok: false, message: 'Mesa no encontrada' });

  const staff = db.staff.find(member => member.id === req.session.staffId && member.active !== false);
  if (!staff) return res.status(401).json({ ok: false, message: 'Mesero no autorizado' });

  try {
    const { order } = createManualOrderForTable(db, table, {
      ...req.body,
      source: req.body.source || 'staff_order'
    }, { staff });
    writeDb(db);
    res.json({ ok: true, order: publicOrder(order), message: 'Comanda levantada por mesero.' });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, message: error.message || 'No se pudo levantar la comanda' });
  }
});

app.post('/api/admin/manual-order', requireLogin, (req, res) => {
  const db = readDb();
  const table = db.tables.find(t => t.id === req.body.tableId);
  if (!table) return res.status(404).json({ ok: false, message: 'Selecciona una mesa válida' });

  let staff = null;
  if (req.body.staffId) {
    staff = db.staff.find(member => member.id === req.body.staffId && member.active !== false) || null;
  }

  try {
    const { order } = createManualOrderForTable(db, table, {
      ...req.body,
      source: 'admin_manual'
    }, {
      staff,
      adminName: staff ? staff.name : (req.session.adminUser || 'Admin'),
      enforceAssignment: false
    });
    writeDb(db);
    res.json({ ok: true, order: publicOrder(order), message: 'Comanda manual creada.' });
  } catch (error) {
    res.status(error.status || 500).json({ ok: false, message: error.message || 'No se pudo crear la comanda manual' });
  }
});

app.get('/api/public/restaurant', (req, res) => {
  const db = readDb();
  res.json({
    restaurant: db.restaurant,
    categories: db.categories,
    menuItems: db.menuItems.filter(item => item.available !== false)
  });
});

app.get('/api/public/table/:tableId', (req, res) => {
  const db = readDb();
  const table = db.tables.find(t => t.id === req.params.tableId);
  if (!table) return res.status(404).json({ ok: false, message: 'Mesa no encontrada' });
  res.json({ ok: true, table, restaurant: db.restaurant });
});

app.get('/api/public/orders/:orderId', (req, res) => {
  const db = readDb();
  const order = db.orders.find(o => o.id === req.params.orderId);
  if (!order) return res.status(404).json({ ok: false, message: 'Pedido no encontrado' });
  res.json({ ok: true, order: publicOrder(order) });
});


app.get('/api/public/table/:tableId/bill-summary', (req, res) => {
  const db = readDb();
  const summary = buildBillSummary(db, req.params.tableId);
  if (!summary) return res.status(404).json({ ok: false, message: 'Mesa no encontrada' });
  res.json({ ok: true, ...summary });
});

app.get('/api/public/table/:tableId/diners', (req, res) => {
  const db = readDb();
  const table = db.tables.find(t => t.id === req.params.tableId);
  if (!table) return res.status(404).json({ ok: false, message: 'Mesa no encontrada' });
  const session = activeSessionForTable(db, table.id);
  res.json({ ok: true, diners: session?.diners || [], session: session || null });
});

app.post('/api/public/table/:tableId/diners', (req, res) => {
  const db = readDb();
  const table = db.tables.find(t => t.id === req.params.tableId);
  if (!table) return res.status(404).json({ ok: false, message: 'Mesa no encontrada' });
  const session = createOrUpdateTableSession(db, table, {
    customerName: req.body.customerName,
    customerPhone: req.body.customerPhone,
    diners: req.body.diners,
    source: 'split_accounts'
  });
  writeDb(db);
  res.json({ ok: true, diners: session.diners || [], session });
});

app.post('/api/public/table/:tableId/bill-request', (req, res) => {
  const db = readDb();
  const table = db.tables.find(t => t.id === req.params.tableId);
  if (!table) return res.status(404).json({ ok: false, message: 'Mesa no encontrada' });

  const session = createOrUpdateTableSession(db, table, {
    customerName: req.body.customerName,
    customerPhone: req.body.customerPhone,
    source: 'smart_bill',
    diners: req.body.diners
  });

  const summary = buildBillSummary(db, table.id) || { lines: [], subtotal: 0, orders: [], disclaimer: '' };
  const subtotal = roundMoney(summary.subtotal || 0);
  const tipPercent = Math.max(0, Math.min(100, cleanNumber(req.body.tipPercent, 0)));
  const customTip = req.body.customTipAmount !== undefined && req.body.customTipAmount !== '' ? cleanNumber(req.body.customTipAmount, 0) : null;
  const tipAmount = roundMoney(customTip !== null ? Math.max(0, customTip) : subtotal * (tipPercent / 100));
  const total = roundMoney(subtotal + tipAmount);
  const whenMinutes = Math.max(0, Math.min(60, cleanNumber(req.body.whenMinutes, 0)));
  const paymentMethod = ['cash', 'card', 'transfer', 'split', 'pending'].includes(req.body.paymentMethod) ? req.body.paymentMethod : 'pending';
  const bringTerminal = req.body.bringTerminal === true || req.body.bringTerminal === 'true' || paymentMethod === 'card';
  const customerName = cleanString(req.body.customerName, 80);
  const customerPhone = normalizePhone(req.body.customerPhone);

  if (customerPhone) {
    upsertContact(db, {
      tableId: table.id,
      phone: customerPhone,
      name: customerName,
      source: 'smart_bill',
      optInPromos: req.body.optInPromos !== false,
      assignedStaffId: session.assignedStaffId,
      assignedStaffName: session.assignedStaffName
    });
  }

  const billDetails = {
    subtotal,
    tipPercent,
    tipAmount,
    total,
    paymentMethod,
    paymentMethodLabel: paymentMethodLabel(paymentMethod),
    bringTerminal,
    whenMinutes,
    whenLabel: billWhenLabel(whenMinutes),
    splitMode: req.body.splitMode === true || req.body.splitMode === 'true',
    note: cleanString(req.body.note, 240),
    customerName,
    customerPhone,
    lineCount: summary.lines.length,
    orderCount: summary.orders.length,
    lines: summary.lines.slice(0, 50),
    splitAccounts: summary.splitAccounts || [],
    diners: summary.diners || []
  };

  const request = {
    id: makeId('bill'),
    tableId: table.id,
    tableName: table.name,
    sessionId: session.id,
    status: 'new',
    ...sessionAssignmentPayload(session),
    billDetails,
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  db.billRequests.unshift(request);

  const noteParts = [
    `Cuenta ${billDetails.whenLabel}`,
    `Total estimado $${billDetails.total}`,
    billDetails.tipAmount ? `Propina $${billDetails.tipAmount}` : 'Sin propina definida',
    billDetails.paymentMethodLabel,
    bringTerminal ? 'llevar terminal' : '',
    billDetails.splitMode ? 'cuentas separadas' : ''
  ].filter(Boolean);

  db.alerts.unshift({
    id: makeId('alert'),
    tableId: table.id,
    tableName: table.name,
    sessionId: session.id,
    type: 'bill',
    customerName,
    customerPhone,
    note: noteParts.join(' · '),
    status: 'new',
    ...sessionAssignmentPayload(session),
    billRequestId: request.id,
    billDetails,
    createdAt: nowIso(),
    updatedAt: nowIso()
  });

  writeDb(db);
  res.json({ ok: true, request, summary, message: `Cuenta solicitada ${billDetails.whenLabel}. Un mesero confirmará el total final.` });
});

app.post('/api/public/table/:tableId/contact', (req, res) => {
  const db = readDb();
  const table = db.tables.find(t => t.id === req.params.tableId);
  if (!table) return res.status(404).json({ ok: false, message: 'Mesa no encontrada' });

  const session = createOrUpdateTableSession(db, table, {
    name: req.body.name,
    phone: req.body.phone,
    source: req.body.source || 'menu_start',
    diners: req.body.diners
  });

  const contact = upsertContact(db, {
    ...req.body,
    tableId: table.id,
    source: req.body.source || 'menu_start',
    assignedStaffId: session.assignedStaffId,
    assignedStaffName: session.assignedStaffName
  });

  if (!contact) return res.status(400).json({ ok: false, message: 'WhatsApp requerido para guardar contacto' });
  addCustomerArrivalAlert(db, session);
  writeDb(db);
  res.json({ ok: true, contact });
});

app.post('/api/public/table/:tableId/alert', (req, res) => {
  const db = readDb();
  const table = db.tables.find(t => t.id === req.params.tableId);
  if (!table) return res.status(404).json({ ok: false, message: 'Mesa no encontrada' });

  const session = createOrUpdateTableSession(db, table, {
    customerName: req.body.customerName,
    customerPhone: req.body.customerPhone,
    source: `alert_${req.body.type || 'other'}`
  });

  if (req.body.customerPhone) {
    upsertContact(db, {
      tableId: table.id,
      phone: req.body.customerPhone,
      name: req.body.customerName,
      source: `alert_${req.body.type || 'other'}`,
      optInPromos: req.body.optInPromos !== false,
      assignedStaffId: session.assignedStaffId,
      assignedStaffName: session.assignedStaffName
    });
  }

  const allowed = ['waiter', 'bill', 'charge', 'customer', 'quick', 'takeout', 'repeat', 'feedback', 'other'];
  const type = allowed.includes(req.body.type) ? req.body.type : 'other';
  const alert = {
    id: makeId('alert'),
    tableId: table.id,
    tableName: table.name,
    type,
    customerName: cleanString(req.body.customerName, 80),
    customerPhone: normalizePhone(req.body.customerPhone),
    note: cleanString(req.body.note, 280),
    status: 'new',
    sessionId: session.id,
    ...sessionAssignmentPayload(session),
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  db.alerts.unshift(alert);
  writeDb(db);
  res.json({ ok: true, alert });
});


app.post('/api/public/table/:tableId/feedback', (req, res) => {
  const db = readDb();
  const table = db.tables.find(t => t.id === req.params.tableId);
  if (!table) return res.status(404).json({ ok: false, message: 'Mesa no encontrada' });

  const rating = Math.max(1, Math.min(5, Number(req.body.rating || 0)));
  if (!rating) return res.status(400).json({ ok: false, message: 'Selecciona una calificación' });

  const customerName = cleanString(req.body.customerName, 80);
  const customerPhone = normalizePhone(req.body.customerPhone);
  const note = cleanString(req.body.note, 320);
  const session = createOrUpdateTableSession(db, table, {
    customerName,
    customerPhone,
    source: 'feedback'
  });

  if (customerPhone) {
    upsertContact(db, {
      tableId: table.id,
      phone: customerPhone,
      name: customerName,
      source: 'feedback',
      optInPromos: req.body.optInPromos !== false,
      assignedStaffId: session.assignedStaffId,
      assignedStaffName: session.assignedStaffName
    });
  }

  const feedback = {
    id: makeId('feedback'),
    tableId: table.id,
    tableName: table.name,
    customerName,
    customerPhone,
    rating,
    note,
    sessionId: session.id,
    ...sessionAssignmentPayload(session),
    createdAt: nowIso()
  };
  db.feedback.unshift(feedback);

  db.alerts.unshift({
    id: makeId('alert'),
    tableId: table.id,
    tableName: table.name,
    type: 'feedback',
    customerName,
    customerPhone,
    note: `Calificación ${rating}/5${note ? ` · ${note}` : ''}`,
    status: rating <= 3 ? 'new' : 'done',
    sessionId: session.id,
    ...sessionAssignmentPayload(session),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    feedbackId: feedback.id
  });

  writeDb(db);
  res.json({ ok: true, feedback, message: rating <= 3 ? 'Gracias. Avisamos al equipo para mejorar tu experiencia.' : 'Gracias por calificar tu experiencia.' });
});

app.post('/api/public/table/:tableId/order', (req, res) => {
  const db = readDb();
  const table = db.tables.find(t => t.id === req.params.tableId);
  if (!table) return res.status(404).json({ ok: false, message: 'Mesa no encontrada' });

  const items = Array.isArray(req.body.items) ? req.body.items : [];
  const cleanItems = normalizeOrderLines(db, items);

  if (cleanItems.length === 0) {
    return res.status(400).json({ ok: false, message: 'El pedido está vacío' });
  }

  const customerName = cleanString(req.body.customerName, 80);
  const customerPhone = normalizePhone(req.body.customerPhone);
  const session = createOrUpdateTableSession(db, table, { customerName, customerPhone, source: 'order', diners: req.body.diners });

  if (customerPhone) {
    upsertContact(db, {
      tableId: table.id,
      phone: customerPhone,
      name: customerName,
      source: 'order',
      optInPromos: req.body.optInPromos !== false,
      countOrder: true,
      assignedStaffId: session.assignedStaffId,
      assignedStaffName: session.assignedStaffName
    });
  }

  const total = cleanItems.reduce((sum, item) => sum + item.subtotal, 0);
  db.counters = db.counters || {};
  db.counters.command = Number(db.counters.command || 0) + 1;
  const order = {
    id: makeId('order'),
    commandNumber: db.counters.command,
    tableId: table.id,
    tableName: table.name,
    customerName,
    customerPhone,
    note: cleanString(req.body.note, 280),
    items: cleanItems,
    total,
    status: 'new',
    estimatedTime: '',
    sessionId: session.id,
    ...sessionAssignmentPayload(session),
    confirmedAt: '',
    createdAt: nowIso(),
    updatedAt: nowIso()
  };

  db.orders.unshift(order);
  db.alerts.unshift({
    id: makeId('alert'),
    tableId: table.id,
    tableName: table.name,
    type: 'order',
    customerName,
    customerPhone,
    note: `Comanda #${order.commandNumber} · ${cleanItems.length} producto(s) · $${total}`,
    status: 'new',
    sessionId: session.id,
    ...sessionAssignmentPayload(session),
    createdAt: nowIso(),
    updatedAt: nowIso(),
    orderId: order.id
  });
  writeDb(db);
  res.json({ ok: true, order: publicOrder(order), message: 'Tu pedido fue enviado. Un mesero lo confirmará.' });
});


app.get('/api/admin/whatsapp/client-qr', requireLogin, async (req, res) => {
  const db = readDb();
  const phone = normalizePhone(db.restaurant.whatsapp || '');
  if (!phone) return res.status(400).json({ ok: false, message: 'Configura el WhatsApp principal del restaurante primero' });
  const message = cleanString(req.query.message || `Hola, quiero hacer un pedido en ${db.restaurant.name || 'el restaurante'}.`, 300);
  const digits = phone.length === 10 ? `52${phone}` : phone;
  const url = `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
  const pngDataUrl = await QRCode.toDataURL(url, { width: 360, margin: 2 });
  res.json({ ok: true, phone: digits, url, pngDataUrl, message });
});

app.post('/api/admin/whatsapp-orders', requireLogin, (req, res) => {
  const db = readDb();
  const payload = cleanWhatsappOrderPayload(req.body);
  if (!payload.customerPhone) return res.status(400).json({ ok: false, message: 'WhatsApp del cliente requerido' });
  if (!payload.itemsText && !payload.message) return res.status(400).json({ ok: false, message: 'Escribe el pedido o mensaje recibido' });
  db.counters = db.counters || {};
  db.counters.whatsapp = Number(db.counters.whatsapp || 0) + 1;
  const ticket = {
    id: makeId('wapp'),
    ticketNumber: db.counters.whatsapp,
    ...payload,
    status: 'new',
    source: 'whatsapp_manual',
    commandOrderId: '',
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  db.whatsappOrders.unshift(ticket);
  upsertContact(db, {
    phone: payload.customerPhone,
    name: payload.customerName,
    source: 'whatsapp_order',
    optInPromos: true,
    countOrder: false,
    note: payload.itemsText
  });
  writeDb(db);
  res.json({ ok: true, whatsappOrder: ticket });
});

app.patch('/api/admin/whatsapp-orders/:id', requireLogin, (req, res) => {
  const db = readDb();
  const order = db.whatsappOrders.find(item => item.id === req.params.id);
  if (!order) return res.status(404).json({ ok: false, message: 'Pedido WhatsApp no encontrado' });
  const allowed = ['new', 'confirmed', 'in_progress', 'ready', 'delivered', 'closed', 'cancelled'];
  if (req.body.status && allowed.includes(req.body.status)) order.status = req.body.status;
  if (req.body.estimatedTime !== undefined) order.estimatedTime = cleanString(req.body.estimatedTime, 40);
  if (req.body.note !== undefined) order.note = cleanString(req.body.note, 300);
  order.updatedAt = nowIso();
  writeDb(db);
  res.json({ ok: true, whatsappOrder: order });
});

app.post('/api/admin/whatsapp-orders/:id/send-to-kitchen', requireLogin, (req, res) => {
  const db = readDb();
  const ticket = db.whatsappOrders.find(item => item.id === req.params.id);
  if (!ticket) return res.status(404).json({ ok: false, message: 'Pedido WhatsApp no encontrado' });
  if (ticket.commandOrderId) return res.status(409).json({ ok: false, message: 'Este pedido ya fue enviado a cocina' });
  db.counters = db.counters || {};
  db.counters.command = Number(db.counters.command || 0) + 1;
  const total = roundMoney(ticket.totalEstimate || 0);
  const order = {
    id: makeId('order'),
    commandNumber: db.counters.command,
    tableId: 'whatsapp',
    tableName: 'WhatsApp / Domicilio',
    customerName: ticket.customerName || '',
    customerPhone: ticket.customerPhone || '',
    note: cleanString(`Pedido WhatsApp #${ticket.ticketNumber}. ${ticket.address ? `Dirección: ${ticket.address}. ` : ''}${ticket.note || ''}`, 280),
    items: [{
      itemId: 'whatsapp-free-text',
      name: 'Pedido WhatsApp',
      price: total,
      qty: 1,
      note: ticket.itemsText || ticket.message || '',
      dinerName: '',
      subtotal: total
    }],
    total,
    status: 'new',
    estimatedTime: ticket.estimatedTime || '',
    sessionId: '',
    assignedStaffId: '',
    assignedStaffName: '',
    source: 'whatsapp',
    confirmedAt: '',
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  db.orders.unshift(order);
  ticket.commandOrderId = order.id;
  ticket.status = ticket.status === 'new' ? 'confirmed' : ticket.status;
  ticket.updatedAt = nowIso();
  db.alerts.unshift({
    id: makeId('alert'),
    tableId: 'whatsapp',
    tableName: 'WhatsApp / Domicilio',
    type: 'order',
    customerName: ticket.customerName || '',
    customerPhone: ticket.customerPhone || '',
    note: `Pedido WhatsApp #${ticket.ticketNumber} enviado a cocina · ${total ? `$${total}` : 'sin total estimado'}`,
    status: 'new',
    sessionId: '',
    assignedStaffId: '',
    assignedStaffName: '',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    orderId: order.id
  });
  upsertContact(db, {
    phone: ticket.customerPhone,
    name: ticket.customerName,
    source: 'whatsapp_order_to_kitchen',
    optInPromos: true,
    countOrder: true,
    note: ticket.itemsText
  });
  writeDb(db);
  res.json({ ok: true, whatsappOrder: ticket, order: publicOrder(order) });
});

app.delete('/api/admin/whatsapp-orders/:id', requireLogin, (req, res) => {
  const db = readDb();
  db.whatsappOrders = db.whatsappOrders.filter(item => item.id !== req.params.id);
  writeDb(db);
  res.json({ ok: true });
});

app.get('/api/admin/data', requireLogin, (req, res) => {
  const db = readDb();
  res.json({ ok: true, ...db, staffStats: computeStaffStats(db) });
});

app.put('/api/admin/restaurant', requireLogin, (req, res) => {
  const db = readDb();
  const operationModes = ['alerts', 'orders', 'commands', 'pos_layer'];
  const assignmentModes = ['free', 'zone'];
  db.restaurant = {
    ...db.restaurant,
    name: cleanString(req.body.name || db.restaurant.name, 100),
    subtitle: cleanString(req.body.subtitle, 160),
    logoText: cleanString(req.body.logoText || 'AUREA', 30),
    logoDataUrl: req.body.logoDataUrl !== undefined ? cleanDataUrl(req.body.logoDataUrl) : db.restaurant.logoDataUrl,
    whatsapp: normalizePhone(req.body.whatsapp),
    address: cleanString(req.body.address, 160),
    hours: cleanString(req.body.hours, 160),
    primaryColor: '#c9a44c',
    accentColor: cleanColor(req.body.accentColor || db.restaurant.accentColor || '#c9a44c'),
    operationMode: operationModes.includes(req.body.operationMode) ? req.body.operationMode : db.restaurant.operationMode,
    assignmentMode: assignmentModes.includes(req.body.assignmentMode) ? req.body.assignmentMode : (db.restaurant.assignmentMode || 'free'),
    crmOptInText: cleanString(req.body.crmOptInText || '', 220),
    crmEnabled: req.body.crmEnabled === true || req.body.crmEnabled === 'true',
    instanceSlug: cleanSlug(req.body.instanceSlug || db.restaurant.instanceSlug || db.restaurant.name || 'aurea-demo'),
    pinPrefix: cleanString(req.body.pinPrefix || db.restaurant.pinPrefix || restaurantPinPrefix(db), 6).toUpperCase().replace(/[^A-Z0-9]/g, '') || restaurantPinPrefix(db),
    whatsappOfficial: {
      enabled: req.body.whatsappOfficial?.enabled === true || req.body.whatsappOfficial?.enabled === 'true',
      displayName: cleanString(req.body.whatsappOfficial?.displayName || db.restaurant.name || '', 100),
      businessPortfolioId: cleanString(req.body.whatsappOfficial?.businessPortfolioId || '', 120),
      wabaId: cleanString(req.body.whatsappOfficial?.wabaId || '', 120),
      phoneNumberId: cleanString(req.body.whatsappOfficial?.phoneNumberId || '', 120),
      status: cleanString(req.body.whatsappOfficial?.status || 'not_connected', 40),
      webhookUrl: cleanString(req.body.whatsappOfficial?.webhookUrl || '', 240),
      notes: cleanString(req.body.whatsappOfficial?.notes || '', 300)
    }
  };
  writeDb(db);
  res.json({ ok: true, restaurant: db.restaurant });
});

app.post('/api/admin/tables', requireLogin, (req, res) => {
  const db = readDb();
  const name = cleanString(req.body.name, 60);
  if (!name) return res.status(400).json({ ok: false, message: 'Nombre de mesa requerido' });
  const table = { id: makeId('mesa'), name };
  db.tables.push(table);
  writeDb(db);
  res.json({ ok: true, table });
});

app.delete('/api/admin/tables/:id', requireLogin, (req, res) => {
  const db = readDb();
  db.tables = db.tables.filter(t => t.id !== req.params.id);
  writeDb(db);
  res.json({ ok: true });
});

app.post('/api/admin/categories', requireLogin, (req, res) => {
  const db = readDb();
  const name = cleanString(req.body.name, 60);
  if (!name) return res.status(400).json({ ok: false, message: 'Nombre de categoría requerido' });
  const category = { id: makeId('cat'), name };
  db.categories.push(category);
  writeDb(db);
  res.json({ ok: true, category });
});

app.delete('/api/admin/categories/:id', requireLogin, (req, res) => {
  const db = readDb();
  db.categories = db.categories.filter(c => c.id !== req.params.id);
  db.menuItems = db.menuItems.filter(i => i.categoryId !== req.params.id);
  writeDb(db);
  res.json({ ok: true });
});

app.post('/api/admin/menu-items', requireLogin, (req, res) => {
  const db = readDb();
  const item = {
    id: makeId('item'),
    categoryId: cleanString(req.body.categoryId, 80),
    name: cleanString(req.body.name, 100),
    description: cleanString(req.body.description, 240),
    price: Number(req.body.price || 0),
    imageUrl: cleanString(req.body.imageUrl, 500),
    available: req.body.available !== false && req.body.available !== 'false',
    featured: Boolean(req.body.featured)
  };
  if (!item.name || !item.categoryId || item.price <= 0) {
    return res.status(400).json({ ok: false, message: 'Faltan datos del producto' });
  }
  db.menuItems.push(item);
  writeDb(db);
  res.json({ ok: true, item });
});

app.put('/api/admin/menu-items/:id', requireLogin, (req, res) => {
  const db = readDb();
  const index = db.menuItems.findIndex(i => i.id === req.params.id);
  if (index === -1) return res.status(404).json({ ok: false, message: 'Producto no encontrado' });

  const current = db.menuItems[index];
  const next = {
    ...current,
    categoryId: req.body.categoryId !== undefined ? cleanString(req.body.categoryId, 80) : current.categoryId,
    name: req.body.name !== undefined ? cleanString(req.body.name, 100) : current.name,
    description: req.body.description !== undefined ? cleanString(req.body.description, 240) : current.description,
    price: req.body.price !== undefined ? Number(req.body.price || 0) : current.price,
    imageUrl: req.body.imageUrl !== undefined ? cleanString(req.body.imageUrl, 500) : current.imageUrl,
    available: req.body.available !== undefined ? Boolean(req.body.available) : current.available,
    featured: req.body.featured !== undefined ? Boolean(req.body.featured) : current.featured
  };

  if (!next.name || !next.categoryId || next.price <= 0) {
    return res.status(400).json({ ok: false, message: 'Faltan datos del producto' });
  }

  db.menuItems[index] = next;
  writeDb(db);
  res.json({ ok: true, item: db.menuItems[index] });
});

app.patch('/api/admin/menu-items/:id/availability', requireLogin, (req, res) => {
  const db = readDb();
  const item = db.menuItems.find(i => i.id === req.params.id);
  if (!item) return res.status(404).json({ ok: false, message: 'Producto no encontrado' });
  item.available = req.body.available !== false && req.body.available !== 'false';
  writeDb(db);
  res.json({ ok: true, item });
});

app.delete('/api/admin/menu-items/:id', requireLogin, (req, res) => {
  const db = readDb();
  db.menuItems = db.menuItems.filter(i => i.id !== req.params.id);
  writeDb(db);
  res.json({ ok: true });
});

app.post('/api/admin/staff', requireLogin, (req, res) => {
  const db = readDb();
  const pin = normalizeStaffPin(db, req.body.pin, { generate: true });
  if (staffPinInUse(db, pin)) return res.status(409).json({ ok: false, message: `El PIN ${pin} ya está asignado a otro mesero` });
  const staff = {
    id: makeId('staff'),
    name: cleanString(req.body.name, 80),
    role: cleanString(req.body.role || 'Mesero', 60),
    whatsapp: normalizePhone(req.body.whatsapp),
    pin,
    active: req.body.active !== false,
    assignedTableIds: Array.isArray(req.body.assignedTableIds) ? req.body.assignedTableIds.map(id => cleanString(id, 80)).filter(Boolean) : [],
    createdAt: nowIso()
  };
  if (!staff.name) return res.status(400).json({ ok: false, message: 'Nombre del mesero requerido' });
  db.staff.push(staff);
  writeDb(db);
  res.json({ ok: true, staff });
});

app.put('/api/admin/staff/:id', requireLogin, (req, res) => {
  const db = readDb();
  const index = db.staff.findIndex(member => member.id === req.params.id);
  if (index === -1) return res.status(404).json({ ok: false, message: 'Mesero no encontrado' });
  let nextPin = db.staff[index].pin;
  if (req.body.pin !== undefined) {
    nextPin = normalizeStaffPin(db, req.body.pin, { generate: !String(req.body.pin || '').trim() });
    if (staffPinInUse(db, nextPin, db.staff[index].id)) return res.status(409).json({ ok: false, message: `El PIN ${nextPin} ya está asignado a otro mesero` });
  }
  db.staff[index] = {
    ...db.staff[index],
    name: req.body.name !== undefined ? cleanString(req.body.name, 80) : db.staff[index].name,
    role: req.body.role !== undefined ? cleanString(req.body.role, 60) : db.staff[index].role,
    whatsapp: req.body.whatsapp !== undefined ? normalizePhone(req.body.whatsapp) : db.staff[index].whatsapp,
    pin: nextPin,
    active: req.body.active !== undefined ? Boolean(req.body.active) : db.staff[index].active,
    assignedTableIds: req.body.assignedTableIds !== undefined && Array.isArray(req.body.assignedTableIds) ? req.body.assignedTableIds.map(id => cleanString(id, 80)).filter(Boolean) : (db.staff[index].assignedTableIds || [])
  };
  writeDb(db);
  res.json({ ok: true, staff: db.staff[index] });
});

app.delete('/api/admin/staff/:id', requireLogin, (req, res) => {
  const db = readDb();
  db.staff = db.staff.filter(member => member.id !== req.params.id);
  writeDb(db);
  res.json({ ok: true });
});


app.post('/api/staff/tables/:tableId/take', requireStaff, (req, res) => {
  const db = readDb();
  const table = db.tables.find(t => t.id === req.params.tableId);
  if (!table) return res.status(404).json({ ok: false, message: 'Mesa no encontrada' });
  const staff = db.staff.find(member => member.id === req.session.staffId && member.active !== false);
  if (!staff) return res.status(401).json({ ok: false, message: 'Mesero no autorizado' });

  const session = createOrUpdateTableSession(db, table, { source: 'staff_take' });
  if (session.assignedStaffId && session.assignedStaffId !== staff.id) {
    return res.status(409).json({ ok: false, message: `Esta mesa ya la tomó ${session.assignedStaffName || 'otro mesero'}` });
  }
  session.assignedStaffId = staff.id;
  session.assignedStaffName = staff.name;
  session.takenAt = session.takenAt || nowIso();
  session.assignmentMode = db.restaurant.assignmentMode || 'free';
  session.updatedAt = nowIso();
  assignToSessionRelatedItems(db, session);
  writeDb(db);
  res.json({ ok: true, session });
});


app.post('/api/staff/tables/:tableId/paid', requireStaff, (req, res) => {
  const db = readDb();
  const session = activeSessionForTable(db, req.params.tableId);
  if (!session) return res.status(404).json({ ok: false, message: 'No hay sesión activa en esta mesa' });
  if (session.assignedStaffId && session.assignedStaffId !== req.session.staffId) {
    return res.status(403).json({ ok: false, message: 'Solo el mesero asignado puede capturar pago de esta mesa' });
  }
  const staff = db.staff.find(member => member.id === req.session.staffId);
  const payment = upsertSessionPayment(db, req.params.tableId, session, {
    ...req.body,
    status: 'pending_admin',
    businessDate: businessDate()
  }, { staffId: staff?.id || '', staffName: staff?.name || 'staff', role: 'staff' });

  for (const request of db.billRequests || []) {
    if ((request.sessionId && request.sessionId === session.id) || request.tableId === req.params.tableId) {
      if (['new', 'in_progress'].includes(request.status || 'new')) {
        request.status = 'pending_admin';
        request.updatedAt = nowIso();
      }
    }
  }
  db.alerts.unshift({
    id: makeId('alert'),
    tableId: session.tableId,
    tableName: session.tableName,
    sessionId: session.id,
    type: 'bill',
    note: `Pago capturado por ${staff?.name || 'staff'} · ${payment.methodLabel} · ${paymentMethodLabelFull(payment.method)} · Total ${payment.totalDue}`,
    status: 'new',
    assignedStaffId: session.assignedStaffId || staff?.id || '',
    assignedStaffName: session.assignedStaffName || staff?.name || '',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    paymentId: payment.id
  });
  writeDb(db);
  res.json({ ok: true, session, payment, message: 'Pago capturado. Falta autorización de admin.' });
});

app.post('/api/staff/tables/:tableId/close', requireStaff, (req, res) => {
  const db = readDb();
  const session = activeSessionForTable(db, req.params.tableId);
  if (!session) return res.status(404).json({ ok: false, message: 'No hay sesión activa en esta mesa' });
  if (session.assignedStaffId && session.assignedStaffId !== req.session.staffId) {
    return res.status(403).json({ ok: false, message: 'Solo el mesero asignado puede cerrar esta mesa' });
  }
  const staff = db.staff.find(member => member.id === req.session.staffId);
  const result = closeTableSession(db, req.params.tableId, staff, { markPaid: req.body.markPaid !== false });
  if (!result) return res.status(404).json({ ok: false, message: 'No se pudo cerrar la mesa' });
  writeDb(db);
  res.json({ ok: true, ...result });
});

app.post('/api/staff/tables/:tableId/release', requireStaff, (req, res) => {
  const db = readDb();
  const session = activeSessionForTable(db, req.params.tableId);
  if (!session) return res.status(404).json({ ok: false, message: 'No hay sesión activa en esta mesa' });
  if (session.assignedStaffId && session.assignedStaffId !== req.session.staffId) {
    return res.status(403).json({ ok: false, message: 'Solo el mesero asignado puede liberar esta mesa' });
  }
  const staff = db.staff.find(member => member.id === req.session.staffId);
  const result = closeTableSession(db, req.params.tableId, staff, { markPaid: false });
  writeDb(db);
  res.json({ ok: true, ...result });
});


app.post('/api/admin/tables/:tableId/close', requireLogin, (req, res) => {
  const db = readDb();
  const result = closeTableSession(db, req.params.tableId, null, { markPaid: req.body.markPaid !== false, closedByStaffName: 'Admin' });
  if (!result) return res.status(404).json({ ok: false, message: 'No hay sesión activa en esta mesa' });
  writeDb(db);
  res.json({ ok: true, ...result });
});


app.post('/api/admin/payments/:id/approve', requireLogin, (req, res) => {
  const db = readDb();
  const payment = (db.payments || []).find(item => item.id === req.params.id);
  if (!payment) return res.status(404).json({ ok: false, message: 'Pago no encontrado' });
  const session = payment.sessionId ? (db.tableSessions || []).find(item => item.id === payment.sessionId) : activeSessionForTable(db, payment.tableId);
  if (!session) return res.status(404).json({ ok: false, message: 'No hay sesión activa para este pago' });

  upsertSessionPayment(db, payment.tableId, session, {
    ...payment,
    ...req.body,
    paymentId: payment.id,
    status: 'approved',
    businessDate: payment.businessDate || businessDate()
  }, { adminName: req.session.adminUser || 'Admin', role: 'admin' });

  let result = null;
  if (req.body.closeTable !== false) {
    result = closeTableSession(db, payment.tableId, null, {
      markPaid: true,
      paymentId: payment.id,
      payment,
      closedByStaffName: req.session.adminUser || 'Admin',
      businessDate: payment.businessDate || businessDate()
    });
  }
  writeDb(db);
  res.json({ ok: true, payment, ...(result || {}) });
});

app.post('/api/admin/tables/:tableId/payment', requireLogin, (req, res) => {
  const db = readDb();
  const session = activeSessionForTable(db, req.params.tableId);
  if (!session) return res.status(404).json({ ok: false, message: 'No hay sesión activa en esta mesa' });
  const payment = upsertSessionPayment(db, req.params.tableId, session, {
    ...req.body,
    status: req.body.authorize === false ? 'pending_admin' : 'approved',
    businessDate: req.body.businessDate || businessDate()
  }, { adminName: req.session.adminUser || 'Admin', role: 'admin' });
  let result = null;
  if (req.body.closeTable !== false && payment.status === 'approved') {
    result = closeTableSession(db, req.params.tableId, null, {
      markPaid: true,
      paymentId: payment.id,
      payment,
      closedByStaffName: req.session.adminUser || 'Admin',
      businessDate: payment.businessDate
    });
  }
  writeDb(db);
  res.json({ ok: true, payment, ...(result || {}) });
});

app.post('/api/admin/expenses', requireLogin, (req, res) => {
  const db = readDb();
  const amount = Math.max(0, roundMoney(cleanNumber(req.body.amount, 0)));
  if (!amount) return res.status(400).json({ ok: false, message: 'Monto requerido' });
  const expense = {
    id: makeId('expense'),
    concept: cleanString(req.body.concept || 'Egreso', 120),
    category: cleanString(req.body.category || 'general', 60),
    provider: cleanString(req.body.provider || '', 120),
    amount,
    method: ['cash', 'card', 'transfer', 'other'].includes(req.body.method) ? req.body.method : 'cash',
    note: cleanString(req.body.note || '', 300),
    businessDate: cleanString(req.body.businessDate || businessDate(), 20),
    createdBy: req.session.adminUser || 'Admin',
    createdAt: nowIso(),
    updatedAt: nowIso(),
    status: 'active'
  };
  db.expenses.unshift(expense);
  writeDb(db);
  res.json({ ok: true, expense });
});

app.delete('/api/admin/expenses/:id', requireLogin, (req, res) => {
  const db = readDb();
  const expense = (db.expenses || []).find(item => item.id === req.params.id);
  if (!expense) return res.status(404).json({ ok: false, message: 'Egreso no encontrado' });
  expense.status = 'cancelled';
  expense.updatedAt = nowIso();
  expense.cancelledBy = req.session.adminUser || 'Admin';
  writeDb(db);
  res.json({ ok: true, expense });
});

app.get('/api/admin/finance/summary', requireLogin, (req, res) => {
  const db = readDb();
  const date = cleanString(req.query.date || businessDate(), 20);
  res.json({ ok: true, ...computeDailyFinanceSummary(db, date) });
});

app.post('/api/admin/daily-close', requireLogin, (req, res) => {
  const db = readDb();
  const date = cleanString(req.body.businessDate || businessDate(), 20);
  const summary = computeDailyFinanceSummary(db, date);
  const openingCash = Math.max(0, roundMoney(cleanNumber(req.body.openingCash, 0)));
  const countedCash = Math.max(0, roundMoney(cleanNumber(req.body.countedCash, 0)));
  const expectedCash = roundMoney(openingCash + summary.netCashExpected);
  const difference = roundMoney(countedCash - expectedCash);
  const closure = {
    id: makeId('daily-close'),
    businessDate: date,
    openingCash,
    countedCash,
    expectedCash,
    difference,
    notes: cleanString(req.body.notes || '', 500),
    summary: {
      salesByMethod: summary.salesByMethod,
      expenseTotal: summary.expenseTotal,
      netCashExpected: summary.netCashExpected,
      ticketAverage: summary.ticketAverage,
      paymentCount: summary.paymentCount,
      tableClosureCount: summary.tableClosureCount
    },
    closedBy: req.session.adminUser || 'Admin',
    createdAt: nowIso(),
    updatedAt: nowIso()
  };
  db.dailyClosures = (db.dailyClosures || []).filter(item => item.businessDate !== date);
  db.dailyClosures.unshift(closure);
  writeDb(db);
  res.json({ ok: true, closure });
});


app.post('/api/admin/tables/:tableId/take/:staffId', requireLogin, (req, res) => {
  const db = readDb();
  const table = db.tables.find(t => t.id === req.params.tableId);
  const staff = db.staff.find(member => member.id === req.params.staffId);
  if (!table || !staff) return res.status(404).json({ ok: false, message: 'Mesa o staff no encontrado' });
  const session = createOrUpdateTableSession(db, table, { source: 'admin_assign' });
  session.assignedStaffId = staff.id;
  session.assignedStaffName = staff.name;
  session.takenAt = session.takenAt || nowIso();
  session.updatedAt = nowIso();
  assignToSessionRelatedItems(db, session);
  writeDb(db);
  res.json({ ok: true, session });
});

app.delete('/api/admin/contacts/:id', requireLogin, (req, res) => {
  const db = readDb();
  db.contacts = db.contacts.filter(contact => contact.id !== req.params.id);
  writeDb(db);
  res.json({ ok: true });
});

app.get('/api/admin/qr/:tableId', requireLogin, async (req, res) => {
  const db = readDb();
  const table = db.tables.find(t => t.id === req.params.tableId);
  if (!table) return res.status(404).json({ ok: false, message: 'Mesa no encontrada' });
  const url = `${getBaseUrl(req)}/t/${table.id}`;
  const pngDataUrl = await QRCode.toDataURL(url, { width: 360, margin: 2 });
  res.json({ ok: true, table, url, pngDataUrl });
});

app.get('/api/admin/contacts/export.csv', requireLogin, (req, res) => {
  const db = readDb();
  const headers = ['Nombre', 'WhatsApp', 'Acepta promociones', 'Visitas', 'Pedidos', 'Ultima mesa', 'Mesero asignado', 'Ultima fuente', 'Primer contacto', 'Ultimo contacto'];
  const lines = [headers.join(',')];
  for (const contact of db.contacts) {
    const row = [
      contact.name || '',
      contact.phone || '',
      contact.optInPromos ? 'Si' : 'No',
      contact.visits || 0,
      contact.orderCount || 0,
      contact.lastTableName || contact.firstTableName || '',
      contact.assignedStaffName || '',
      contact.lastSource || contact.firstSource || '',
      contact.firstSeenAt || '',
      contact.lastSeenAt || ''
    ].map(value => `"${String(value).replaceAll('"', '""')}"`);
    lines.push(row.join(','));
  }
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', 'attachment; filename="aurea-contactos.csv"');
  res.send(`\ufeff${lines.join('\n')}`);
});

app.patch('/api/admin/alerts/:id', requireLogin, (req, res) => {
  const db = readDb();
  const alert = db.alerts.find(a => a.id === req.params.id);
  if (!alert) return res.status(404).json({ ok: false, message: 'Alerta no encontrada' });
  alert.status = ['new', 'in_progress', 'done', 'cancelled'].includes(req.body.status) ? req.body.status : alert.status;
  alert.updatedAt = nowIso();
  writeDb(db);
  res.json({ ok: true, alert });
});

app.patch('/api/admin/orders/:id', requireLogin, (req, res) => {
  const db = readDb();
  const order = db.orders.find(o => o.id === req.params.id);
  if (!order) return res.status(404).json({ ok: false, message: 'Pedido no encontrado' });
  updateOrderStatus(order, req.body.status, req.body.estimatedTime);
  writeDb(db);
  res.json({ ok: true, order });
});

app.listen(PORT, () => {
  console.log(`AUREA by KMO v0.8.2-lalomita corriendo en http://localhost:${PORT}`);
  console.log(`Admin demo: usuario ${ADMIN_USER} / contraseña ${ADMIN_PASS}`);
});
