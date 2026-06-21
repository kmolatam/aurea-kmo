let staffDb = null;
let refreshTimer = null;
let currentStaffOrderTableId = null;
let currentOrderMode = 'session';
let currentPaymentTableId = null;
let currentStaffOrderDraft = [];
let currentStaffCategoryId = '';
let currentStaffEditingItemId = '';
let guidedTourState = null;
const STAFF_JS_VERSION = '0.9.22-mesero-simple';
let notificationsBaselineReady = false;
const seenAlertIds = new Set();
const seenOrderIds = new Set();
const STAFF_AUTO_BILL_PRINT_KEY = 'aurea-staff-auto-bill-print-v1';
const STAFF_FORBIDDEN_MESSAGE = 'Acción reservada para Caja/Admin';

function isStaffPosMode() {
  try {
    const params = new URLSearchParams(location.search || '');
    return params.get('pos') === '1' || params.get('print') === 'bridge' || params.get('posui') === 'compact' || Boolean(window.AureaPosPrint);
  } catch {
    return Boolean(window.AureaPosPrint);
  }
}

function selectedPosTableId() {
  return document.getElementById('staffPosTableSelect')?.value || (staffDb?.tables || [])[0]?.id || '';
}

function staffAutoPrintedBills() {
  try { return new Set(JSON.parse(localStorage.getItem(STAFF_AUTO_BILL_PRINT_KEY) || '[]')); }
  catch { return new Set(); }
}

function saveStaffAutoPrintedBills(set) {
  localStorage.setItem(STAFF_AUTO_BILL_PRINT_KEY, JSON.stringify(Array.from(set).slice(-250)));
}

function staffBillPrintKey(tableId) {
  const session = (staffDb?.tableSessions || []).find(item => item.tableId === tableId && item.status === 'active');
  return `${tableId}:${session?.id || 'active'}`;
}

function money(value) {
  return new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN' }).format(value || 0);
}

function dateTime(value) {
  if (!value) return 'Sin fecha';
  return new Date(value).toLocaleString('es-MX', { dateStyle: 'short', timeStyle: 'short' });
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

function toast(message) {
  const el = document.getElementById('toast');
  el.textContent = message;
  el.classList.add('active');
  setTimeout(() => el.classList.remove('active'), 2600);
}

async function api(url, options = {}) {
  const res = await fetch(url, {
    headers: { 'Content-Type': 'application/json' },
    ...options
  });
  const data = await res.json();
  if (!res.ok || data.ok === false) throw new Error(data.message || 'Error');
  return data;
}

function applyAccent() {
  const color = staffDb?.restaurant?.accentColor || '#c9a44c';
  document.documentElement.style.setProperty('--detail', color);
}

function alertLabel(type) {
  const labels = {
    waiter: '🙋‍♂️ Llamar mesero',
    bill: '🧾 Pedir cuenta',
    charge: '🔋 Solicita carga',
    quick: '✨ Necesita algo',
    takeout: '🥡 Para llevar',
    repeat: '🔁 Repetir pedido',
    feedback: '⭐ Calificación',
    order: '🍽️ Nueva comanda',
    customer: '👑 Nuevo cliente VIP',
    other: '⚠️ Solicitud'
  };
  return labels[type] || labels.other;
}

function statusLabel(status) {
  const labels = {
    new: 'Pendiente',
    confirmed: 'Confirmado',
    in_progress: 'En preparación',
    done: 'Atendido',
    ready: 'Listo',
    delivered: 'Entregado',
    cancelled: 'Cancelado'
  };
  return labels[status] || status;
}

function kitchenStations() {
  const configured = staffDb?.restaurant?.kitchenStations;
  if (Array.isArray(configured) && configured.length) return configured;
  return [
    { id: 'hot', label: 'Barra caliente', icon: '🔥' },
    { id: 'cold', label: 'Barra fría', icon: '🥗' },
    { id: 'drinks', label: 'Bebidas', icon: '🥤' }
  ];
}

function kitchenStationName(value) {
  const raw = String(value || 'hot');
  const station = kitchenStations().find(item => item.id === raw) || kitchenStations()[0] || { id: 'hot', label: 'Barra caliente', icon: '🔥' };
  return `${station.icon ? `${station.icon} ` : ''}${station.label || station.id}`;
}

function lineModifierText(item) {
  return item?.modifierName ? ` · ${item.modifierGroupName || 'Opción'}: ${item.modifierName}` : '';
}

function resetStaffOrderDraft() {
  currentStaffOrderDraft = [];
  currentStaffCategoryId = '';
  currentStaffEditingItemId = '';
}

function setChoiceActive(input) {
  const groupName = input.name;
  document.querySelectorAll(`input[name="${groupName}"]`).forEach(item => {
    const label = item.closest('.choice-check');
    if (label) label.classList.toggle('active', item.checked);
  });
}

function ticketWidthMm() {
  const value = Number(staffDb?.restaurant?.printSettings?.ticketWidthMm || 58);
  return value === 80 ? 80 : 58;
}

function printBrandOptions(includeLogo = false) {
  const restaurant = staffDb?.restaurant || {};
  return {
    restaurantName: restaurant.name || 'AUREA',
    logoText: restaurant.logoText || restaurant.name || 'AUREA',
    logoDataUrl: includeLogo ? (restaurant.logoDataUrl || '') : '',
    feedDots: includeLogo ? 320 : 300
  };
}

function ticketBodyWidthMm(width = ticketWidthMm()) {
  return width === 58 ? 48 : 72;
}

function currentRestaurantLogoDataUrl() {
  return String(staffDb?.restaurant?.logoDataUrl || '').trim();
}

function currentRestaurantLogoText() {
  return String(staffDb?.restaurant?.logoText || staffDb?.restaurant?.name || 'AUREA').trim();
}

function ticketHtmlToBridgeText(bodyHtml) {
  const div = document.createElement('div');
  div.innerHTML = String(bodyHtml || '');
  div.querySelectorAll('script,style,.print-actions,button').forEach(node => node.remove());
  div.querySelectorAll('.line').forEach(node => {
    node.replaceWith(document.createTextNode('\n--------------------------------\n'));
  });
  div.querySelectorAll('br').forEach(node => node.replaceWith(document.createTextNode('\n')));
  return window.AureaPrintBridge?.cleanText
    ? window.AureaPrintBridge.cleanText(div.innerText || div.textContent || '')
    : (div.innerText || div.textContent || '').trim();
}

function ticketPrintStyles(width = ticketWidthMm(), options = {}) {
  const bodyWidth = ticketBodyWidthMm(width);
  const brandSize = width === 58 ? 17 : 20;
  const baseSize = width === 58 ? 11 : 12;
  const strongSize = width === 58 ? 13 : 15;
  const bottomGapMm = Math.max(8, Number(options.bottomGapMm || 22));
  return `
    @page{size:${width}mm auto;margin:0}
    *{box-sizing:border-box}
    html,body{margin:0;padding:0;background:#fff;color:#111}
    body{font-family:ui-monospace,SFMono-Regular,Menlo,Consolas,"Courier New",monospace;width:${bodyWidth}mm;margin:0 auto;font-size:${baseSize}px;line-height:1.28;-webkit-print-color-adjust:exact;print-color-adjust:exact}
    .ticket{padding:3mm 1mm ${bottomGapMm}mm}
    .center{text-align:center}.brand{font-size:${brandSize}px;font-weight:900;letter-spacing:.06em}.muted{color:#555}.line{border-top:1px dashed #222;margin:7px 0}.row{display:flex;justify-content:space-between;gap:6px;align-items:flex-start}.row span:last-child,.row strong:last-child{text-align:right}.item{margin:6px 0;break-inside:avoid}.item strong{font-size:${strongSize}px}.item small{display:block;color:#555;margin-top:2px}.total{font-size:${width === 58 ? 14 : 16}px;font-weight:900}.footer{margin-top:8px;text-align:center;font-size:10px;color:#555}.print-actions{display:grid;gap:8px;margin-top:12px}.print-actions button{width:100%;padding:10px;border:0;border-radius:10px;background:#111;color:#fff;font-weight:800}
    .logo-wrap{display:grid;place-items:center;margin-bottom:6px}.logo-wrap img{max-width:${width === 58 ? 30 : 42}mm;max-height:${width === 58 ? 16 : 22}mm;object-fit:contain;display:block}
    @media print{.print-actions{display:none!important}body{width:${bodyWidth}mm}.ticket{padding:2mm 0 ${bottomGapMm}mm}}
  `;
}

function printHtmlDocument(title, bodyHtml, options = {}) {
  const restaurant = staffDb?.restaurant?.name || 'AUREA';
  const width = ticketWidthMm();
  const footer = options.footer || 'Gracias por su preferencia';
  const showLogo = Boolean(options.showLogo && currentRestaurantLogoDataUrl());
  const logoHtml = showLogo ? `<div class="logo-wrap"><img src="${currentRestaurantLogoDataUrl()}" alt="Logo del restaurante" /></div>` : '';
  const html = `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>${escapeHtml(title)}</title><style>${ticketPrintStyles(width, options)}</style></head><body><div class="ticket">${logoHtml}<div class="center"><div class="brand">${escapeHtml(restaurant)}</div><div class="muted">AUREA by KMO</div></div><div class="line"></div>${bodyHtml}<div class="line"></div><div class="footer">${escapeHtml(footer)}</div><div class="print-actions"><button onclick="window.print()">Imprimir</button><button onclick="window.close()">Cerrar</button></div></div><script>window.addEventListener('load',()=>setTimeout(()=>{window.focus();window.print()},450));<\/script></body></html>`;

  if (window.AureaPrintBridge?.shouldUseBridge()) {
    const bridgePayload = {
      text: options.bridgeText || ticketHtmlToBridgeText(bodyHtml),
      logoDataUrl: showLogo ? currentRestaurantLogoDataUrl() : '',
      logoText: currentRestaurantLogoText(),
      ticketWidthMm: width,
      feedDots: Number(options.feedDots || 300),
      footer,
      returnUrl: location.href
    };
    window.AureaPrintBridge.printPayload(bridgePayload, bridgePayload);
    return true;
  }

  const w = window.open('', '_blank', 'width=380,height=720');
  if (!w) return toast('El navegador bloqueó la ventana de impresión. Permite ventanas emergentes.');
  w.document.write(html);
  w.document.close();
  return true;
}

function printStaffOrderDataBridge(order) {
  const bridge = window.AureaPrintBridge;
  if (!bridge?.shouldUseBridge?.() || !order) return false;
  const stationGroups = new Map();
  (order.items || []).forEach(item => {
    const stationId = item.kitchenStation || 'hot';
    if (!stationGroups.has(stationId)) stationGroups.set(stationId, []);
    stationGroups.get(stationId).push(item);
  });
  if (!stationGroups.size) return false;

  let delay = 0;
  let sent = false;
  for (const [stationId, items] of stationGroups.entries()) {
    const stationLabel = kitchenStationName(stationId);
    const ticketText = bridge.buildOrderTicketText(order, {
      restaurantName: staffDb?.restaurant?.name || 'AUREA',
      ticketWidthMm: ticketWidthMm(),
      title: `COMANDA #${order.commandNumber || '-'}`,
      stationLabel,
      items,
      showPrices: false,
      showTotal: false,
      footer: 'Ticket de cocina'
    });
    setTimeout(() => bridge.printTextIfBridge(ticketText, printBrandOptions(false)), delay);
    delay += 550;
    sent = true;
  }
  return sent;
}

function printStaffOrderTicket(orderId) {
  return toast(STAFF_FORBIDDEN_MESSAGE);
}

function suggestedTipAmount(total, percent) {
  return Math.round((Number(total || 0) * Number(percent || 0) / 100 + Number.EPSILON) * 100) / 100;
}

function printStaffBillTicketForTable(tableId) {
  currentPaymentTableId = tableId;
  return toast(STAFF_FORBIDDEN_MESSAGE);
}

function printStaffBillTicket() {
  return toast(STAFF_FORBIDDEN_MESSAGE);
}

async function checkStaffSession() {
  const session = await api('/api/staff/session');
  if (session.isStaff) showStaffApp();
}

function showStaffApp() {
  document.getElementById('staffLogin').style.display = 'none';
  document.getElementById('staffApp').style.display = 'block';
  if (isStaffPosMode()) document.body.classList.add('pos-mode');
  ensureAureaAssist('staff');
  if (!isStaffPosMode()) showAureaReleaseNotesOnce('staff');
  loadStaffData();
  if (!refreshTimer) refreshTimer = setInterval(loadStaffData, 4000);
}

async function loadStaffData() {
  try {
    staffDb = await api('/api/staff/data');
    applyAccent();
    renderStaff();
  } catch (error) {
    if (!error.message.includes('No autorizado')) toast(error.message);
  }
}

function renderStaff() {
  document.getElementById('staffName').textContent = staffDb.staff?.name || 'Mesero';
  document.getElementById('staffRestaurant').textContent = staffDb.restaurant?.name || 'AUREA';
  const mySessions = (staffDb.tableSessions || []).filter(session => session.status === 'active' && session.assignedStaffId === staffDb.staff?.id);
  const tableCount = document.getElementById('staffTableCount');
  if (tableCount) tableCount.textContent = `${mySessions.length} activa${mySessions.length === 1 ? '' : 's'}`;
  renderSessions();
  renderPosQuickPanel();
}



function canUseNotifications() {
  return 'Notification' in window && (location.protocol === 'https:' || location.hostname === 'localhost' || location.hostname === '127.0.0.1');
}

function updateNotificationPrompt() {
  const box = document.getElementById('notificationPrompt');
  const btn = document.getElementById('enableNotificationsBtn');
  if (!box || !btn) return;
  if (isStaffPosMode()) {
    box.style.display = 'none';
    return;
  }
  if (!canUseNotifications()) {
    box.style.display = 'block';
    btn.disabled = true;
    btn.textContent = 'Requiere HTTPS';
    return;
  }
  if (Notification.permission === 'granted') {
    box.style.display = 'none';
    return;
  }
  box.style.display = 'block';
  btn.disabled = Notification.permission === 'denied';
  btn.textContent = Notification.permission === 'denied' ? 'Bloqueadas en navegador' : 'Activar';
}

async function enableStaffNotifications() {
  if (!canUseNotifications()) return toast('Las notificaciones requieren HTTPS. Usa el dominio seguro de AUREA.');
  const permission = await Notification.requestPermission();
  updateNotificationPrompt();
  if (permission === 'granted') {
    new Notification('AUREA activado', { body: 'Te avisaremos cuando entre una nueva comanda o alerta.' });
    toast('Notificaciones activadas');
  } else if (permission === 'denied') {
    toast('El navegador bloqueó notificaciones. Actívalas desde configuración del sitio.');
  }
}

function notify(title, body, tag) {
  if (!canUseNotifications() || Notification.permission !== 'granted') return;
  try {
    new Notification(title, { body, tag, renotify: true });
  } catch (error) {
    console.warn('No se pudo enviar notificación', error);
  }
}

function maybeNotifyStaff() {
  if (!staffDb) return;
  const activeAlerts = (staffDb.alerts || []).filter(alert => ['new'].includes(alert.status));
  const activeOrders = (staffDb.orders || []).filter(order => ['new'].includes(order.status));

  if (!notificationsBaselineReady) {
    activeAlerts.forEach(alert => seenAlertIds.add(alert.id));
    activeOrders.forEach(order => seenOrderIds.add(order.id));
    notificationsBaselineReady = true;
    return;
  }

  activeAlerts.forEach(alert => {
    if (seenAlertIds.has(alert.id)) return;
    seenAlertIds.add(alert.id);
    notify(`AUREA · ${alertLabel(alert.type)}`, `${alert.tableName || 'Mesa'} · ${alert.note || 'Nueva alerta'}`, `aurea-alert-${alert.id}`);
  });

  activeOrders.forEach(order => {
    if (seenOrderIds.has(order.id)) return;
    seenOrderIds.add(order.id);
    const items = (order.items || []).map(item => `${item.qty}x ${item.name}`).join(', ');
    notify('AUREA · Nueva comanda', `#${order.commandNumber || '-'} · ${order.tableName || 'Mesa'} · ${items}`, `aurea-order-${order.id}`);
  });
}

function metric(value, suffix = '') {
  if (value === null || value === undefined || value === '') return '—';
  return `${value}${suffix}`;
}

function renderSessions() {
  const el = document.getElementById('staffSessions');
  if (!el) return;
  const staffId = staffDb.staff?.id;
  const mode = staffDb.restaurant?.assignmentMode || 'free';
  let sessions = (staffDb.tableSessions || []).filter(session => session.status === 'active');
  if (mode === 'zone') {
    sessions = sessions.filter(session => !session.assignedStaffId || session.assignedStaffId === staffId);
  } else {
    sessions = sessions.filter(session => !session.assignedStaffId || session.assignedStaffId === staffId);
  }

  if (sessions.length === 0) {
    el.innerHTML = '<div class="item"><div>No tienes mesas pendientes o activas.</div></div>';
    return;
  }

  el.innerHTML = sessions.map(session => {
    const mine = session.assignedStaffId === staffId;
    return `
      <div class="item">
        <div class="item-main">
          <div class="item-title">${escapeHtml(session.tableName)} · ${escapeHtml(session.customerName || 'Cliente sin nombre')}</div>
          <div class="item-meta">${session.customerPhone ? `WhatsApp: ${escapeHtml(session.customerPhone)} · ` : ''}${mine ? 'Asignada a ti' : 'Sin asignar'} · ${dateTime(session.createdAt)}</div>
          <div class="item-meta" style="margin-top:6px;">Cuenta y pago se gestionan en Caja/Admin.</div>
        </div>
        <div class="inline-actions end">
          ${mine ? `
            <button class="btn small secondary" onclick="openStaffOrderModal('${session.tableId}')">Nuevo pedido</button>
          ` : '<span class="pill">Caja/Admin asigna mesa</span>'}
        </div>
      </div>
    `;
  }).join('');
}

function renderStaffStats() {
  const el = document.getElementById('staffStats');
  if (!el) return;
  const stat = (staffDb.staffStats || []).find(item => item.staffId === staffDb.staff?.id);
  if (!stat) {
    el.innerHTML = '<span>Sin estadísticas todavía.</span>';
    return;
  }
  el.innerHTML = `
    <span><strong>${stat.activeTables}</strong> mesas activas</span>
    <span><strong>${stat.activeOrders}</strong> comandas activas</span>
    <span><strong>${stat.deliveredOrders}</strong> entregadas</span>
    <span><strong>${stat.vipCaptured}</strong> VIP captados</span>
    <span>Confirmar: <strong>${metric(stat.avgConfirmMinutes, ' min')}</strong></span>
    <span>Entregar: <strong>${metric(stat.avgDeliveryMinutes, ' min')}</strong></span>
  `;
}

async function takeTable(tableId) {
  return toast(STAFF_FORBIDDEN_MESSAGE);
}

async function releaseTable(tableId) {
  return toast(STAFF_FORBIDDEN_MESSAGE);
}

function staffTableSubtotal(tableId) {
  const session = (staffDb.tableSessions || []).find(item => item.tableId === tableId && item.status === 'active');
  if (!session) return 0;
  const orders = (staffDb.orders || []).filter(order => order.tableId === tableId && order.status !== 'cancelled' && order.closedWithTable !== true && (!order.sessionId || order.sessionId === session.id));
  return orders.reduce((sum, order) => sum + Number(order.total || 0), 0);
}


function activeOrdersForTable(tableId) {
  const session = (staffDb.tableSessions || []).find(item => item.tableId === tableId && item.status === 'active');
  if (!session) return [];
  return (staffDb.orders || []).filter(order => order.tableId === tableId && order.status !== 'cancelled' && order.closedWithTable !== true && (!order.sessionId || order.sessionId === session.id));
}

function billLinesForTable(tableId) {
  const lines = [];
  for (const order of activeOrdersForTable(tableId)) {
    (order.items || []).forEach((item, itemIndex) => {
      if (item.cancelled) return;
      lines.push({
        orderId: order.id,
        itemIndex,
        commandNumber: order.commandNumber || '',
        name: item.name || 'Producto',
        qty: Number(item.qty || 0),
        price: Number(item.price || 0),
        subtotal: Number(item.subtotal !== undefined ? item.subtotal : Number(item.qty || 0) * Number(item.price || 0)),
        note: item.note || '',
        modifierName: item.modifierName || '',
        modifierGroupName: item.modifierGroupName || 'Opción',
        dinerName: ''
      });
    });
  }
  return lines;
}

function groupedBillForTable(tableId) {
  const lines = billLinesForTable(tableId).map(line => ({ ...line, dinerName: '' }));
  return [{
    name: 'Mesa completa',
    lines,
    total: lines.reduce((sum, line) => sum + Number(line.subtotal || 0), 0)
  }];
}

function openStaffBillModal(tableId) {
  currentPaymentTableId = tableId;
  return toast(STAFF_FORBIDDEN_MESSAGE);
}

function autoPrintStaffBillIfNeeded(tableId) {
  return;
}

function closeStaffBillModal() {
  document.getElementById('staffBillModal').classList.remove('active');
}

function goToPaymentFromBill() {
  return toast(STAFF_FORBIDDEN_MESSAGE);
}

function openStaffPaymentModal(tableId) {
  currentPaymentTableId = tableId;
  return toast(STAFF_FORBIDDEN_MESSAGE);
}

function closeStaffPaymentModal() {
  currentPaymentTableId = null;
  document.getElementById('staffPaymentModal').classList.remove('active');
}

async function submitStaffPayment() {
  return toast(STAFF_FORBIDDEN_MESSAGE);
}

async function closeTable(tableId) {
  return toast(STAFF_FORBIDDEN_MESSAGE);
}


function categoryName(categoryId) {
  const category = (staffDb.categories || []).find(cat => cat.id === categoryId);
  return category ? category.name : 'Sin categoría';
}


function activeSessionForStaffTable(tableId) {
  return (staffDb?.tableSessions || []).find(item => item.tableId === tableId && item.status === 'active') || null;
}

function sessionBelongsToOtherStaff(session) {
  return Boolean(session?.assignedStaffId && staffDb?.staff?.id && session.assignedStaffId !== staffDb.staff.id);
}

function renderPosQuickPanel() {
  const panel = document.getElementById('posQuickPanel');
  const select = document.getElementById('staffPosTableSelect');
  if (!panel || !select) return;
  if (!isStaffPosMode()) {
    panel.style.display = 'none';
    return;
  }
  panel.style.display = 'block';
  const previous = select.value;
  const tables = staffDb?.tables || [];
  select.innerHTML = tables.length
    ? tables.map(table => {
        const session = activeSessionForStaffTable(table.id);
        const locked = sessionBelongsToOtherStaff(session);
        const label = `${table.name}${session ? ' · activa' : ''}`;
        const optionLabel = locked ? `${table.name} · atendida por ${session.assignedStaffName || 'otro mesero'}` : label;
        return `<option value="${escapeHtml(table.id)}" ${locked ? 'disabled' : ''}>${escapeHtml(optionLabel)}</option>`;
      }).join('')
    : '<option value="">No hay mesas configuradas</option>';
  if (previous && tables.some(table => table.id === previous)) select.value = previous;
}

function openPosManualOrder() {
  const tableId = selectedPosTableId();
  if (!tableId) return toast('Primero configura mesas en Admin');
  const session = activeSessionForStaffTable(tableId);
  if (sessionBelongsToOtherStaff(session)) return toast(`Mesa atendida por ${session.assignedStaffName || 'otro mesero'}`);
  openManualOrderModal(tableId);
}

function openPosBill() {
  return toast(STAFF_FORBIDDEN_MESSAGE);
}

function printPosBill() {
  return toast(STAFF_FORBIDDEN_MESSAGE);
}

function fillManualTableSelect(selectedId = '') {
  const select = document.getElementById('staffManualTableSelect');
  if (!select) return;
  const tables = staffDb?.tables || [];
  select.innerHTML = tables.length
    ? tables.map(table => {
        const session = activeSessionForStaffTable(table.id);
        const locked = sessionBelongsToOtherStaff(session);
        const label = locked ? `${table.name} · atendida por ${session.assignedStaffName || 'otro mesero'}` : table.name;
        return `<option value="${escapeHtml(table.id)}" ${table.id === selectedId ? 'selected' : ''} ${locked ? 'disabled' : ''}>${escapeHtml(label)}</option>`;
      }).join('')
    : '<option value="">No hay mesas configuradas</option>';
}

function openManualOrderModal(preselectedTableId = '') {
  resetStaffOrderDraft();
  currentOrderMode = 'manual';
  const tables = staffDb?.tables || [];
  const firstTable = tables.find(table => !sessionBelongsToOtherStaff(activeSessionForStaffTable(table.id))) || tables[0];
  currentStaffOrderTableId = preselectedTableId || firstTable?.id || null;
  fillManualTableSelect(currentStaffOrderTableId);
  const manualFields = document.getElementById('manualOrderFields');
  if (manualFields) manualFields.style.display = 'grid';
  document.getElementById('staffManualCustomerName').value = '';
  document.getElementById('staffManualCustomerPhone').value = '';
  document.getElementById('staffOrderTableName').textContent = `Nuevo pedido · capturado por ${staffDb.staff?.name || 'mesero'}`;
  document.getElementById('staffOrderNote').value = '';
  document.getElementById('staffOrderModal').classList.add('active');
  renderStaffOrderItems();
}


function openStaffOrderModal(tableId) {
  const session = activeSessionForStaffTable(tableId);
  if (sessionBelongsToOtherStaff(session)) return toast(`Mesa atendida por ${session.assignedStaffName || 'otro mesero'}`);
  resetStaffOrderDraft();
  currentOrderMode = 'session';
  currentStaffOrderTableId = tableId;
  const manualFields = document.getElementById('manualOrderFields');
  if (manualFields) manualFields.style.display = 'none';
  const table = (staffDb.tables || []).find(item => item.id === tableId);
  document.getElementById('staffOrderTableName').textContent = `${session?.tableName || table?.name || 'Mesa'} · Pedido tomado por ${staffDb.staff?.name || 'mesero'}`;
  document.getElementById('staffOrderNote').value = '';
  document.getElementById('staffOrderModal').classList.add('active');
  renderStaffOrderItems();
}

function closeStaffOrderModal() {
  currentStaffOrderTableId = null;
  currentOrderMode = 'session';
  currentStaffEditingItemId = '';
  document.getElementById('staffOrderModal').classList.remove('active');
}

function isProductAvailable(item) {
  return item && item.available !== false && item.active !== false && item.isAvailable !== false;
}

function getStaffMenuItemsFrom(source) {
  const byId = new Map();
  (Array.isArray(source) ? source : []).forEach(item => {
    if (!item) return;
    const id = item.id || item.itemId || item.productId || item.name;
    if (!id) return;
    byId.set(String(id), {
      ...item,
      id: String(id),
      name: item.name || item.title || 'Producto',
      categoryId: item.categoryId || item.category || '',
      description: item.description || '',
      price: Number(item.price || 0),
      kitchenStation: item.kitchenStation || 'hot',
      modifierGroupName: item.modifierGroupName || 'Opción',
      modifiers: Array.isArray(item.modifiers) ? item.modifiers : []
    });
  });
  return Array.from(byId.values()).filter(isProductAvailable);
}

function getStaffMenuItems() {
  const sources = [
    staffDb?.menuItems,
    staffDb?.products,
    staffDb?.menu,
    staffDb?.items,
    staffDb?.restaurant?.menuItems,
    staffDb?.restaurant?.products
  ];
  const byId = new Map();
  sources.forEach(source => {
    getStaffMenuItemsFrom(source).forEach(item => byId.set(item.id, item));
  });
  return Array.from(byId.values());
}

async function reloadMenuFallbackIfNeeded() {
  if (getStaffMenuItems().length) return;
  try {
    const data = await api(`/api/public/restaurant?staffFallback=${Date.now()}`);
    const publicItems = getStaffMenuItemsFrom(data.menuItems || data.products || data.menu);
    if (publicItems.length) {
      staffDb.menuItems = publicItems;
      staffDb.products = publicItems;
    }
  } catch (error) {
    console.warn('AUREA staff menu fallback failed', error);
  }
}


function menuCategoriesWithItems() {
  const items = getStaffMenuItems();
  const cats = (staffDb.categories || []).filter(cat => items.some(item => item.categoryId === cat.id));
  const missing = items.some(item => !item.categoryId || !cats.find(cat => cat.id === item.categoryId));
  if (missing) cats.push({ id: '__sin_categoria', name: 'Sin categoría' });
  return cats;
}

function itemsBySelectedCategory() {
  const items = getStaffMenuItems();
  if (!currentStaffCategoryId) {
    const first = menuCategoriesWithItems()[0];
    currentStaffCategoryId = first?.id || '';
  }
  return items.filter(item => currentStaffCategoryId === '__sin_categoria' ? !item.categoryId : item.categoryId === currentStaffCategoryId);
}

function draftTotal() {
  return currentStaffOrderDraft.reduce((sum, item) => sum + Number(item.price || 0) * Number(item.qty || 0), 0);
}

function draftQtyFor(itemId) {
  return currentStaffOrderDraft.filter(item => item.itemId === itemId).reduce((sum, item) => sum + Number(item.qty || 0), 0);
}

function selectStaffCategory(categoryId) {
  currentStaffCategoryId = categoryId;
  currentStaffEditingItemId = '';
  renderStaffOrderItems();
}

function openStaffItemEditor(itemId) {
  currentStaffEditingItemId = itemId;
  renderStaffOrderItems();
  setTimeout(() => {
    document.querySelector('.quick-item-editor')?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, 30);
}

function adjustStaffQuickQty(delta) {
  const input = document.getElementById('staffQuickQty');
  if (!input) return;
  const next = Math.max(1, Math.min(20, Number(input.value || 1) + Number(delta || 0)));
  input.value = String(next);
}

function closeStaffItemEditor() {
  currentStaffEditingItemId = '';
  renderStaffOrderItems();
}

function addStaffDraftItem(itemId) {
  const item = getStaffMenuItems().find(product => product.id === itemId);
  if (!item) return toast('Producto no encontrado');
  const qty = Math.max(1, Math.min(20, Number(document.getElementById('staffQuickQty')?.value || 1)));
  const note = document.getElementById('staffQuickNote')?.value || '';
  const dinerName = ''; // v0.9.19: cuenta unificada por mesa; no separar por persona
  const modifierName = document.querySelector('input[name="staffQuickModifier"]:checked')?.value || '';
  currentStaffOrderDraft.push({
    localId: `${itemId}-${Date.now()}-${Math.random().toString(16).slice(2, 6)}`,
    itemId,
    name: item.name,
    price: Number(item.price || 0),
    qty,
    note,
    modifierName,
    modifierGroupName: item.modifierGroupName || 'Opción',
    kitchenStation: item.kitchenStation || 'hot',
    kitchenStationLabel: kitchenStationName(item.kitchenStation || 'hot'),
    dinerName,
    dinerBreakdown: dinerName
  });
  currentStaffEditingItemId = '';
  renderStaffOrderItems();
  toast(`${item.name} agregado`);
}

function removeStaffDraftItem(localId) {
  currentStaffOrderDraft = currentStaffOrderDraft.filter(item => item.localId !== localId);
  renderStaffOrderItems();
}

function staffItemEditorHtml(editingItem) {
  if (!editingItem) return '';
  return `
    <div class="quick-item-editor menu-editor-inline">
      <div>
        <h3>${escapeHtml(editingItem.name)}</h3>
        ${editingItem.description ? `<p class="muted">${escapeHtml(editingItem.description)}</p>` : ''}
      </div>
      ${Array.isArray(editingItem.modifiers) && editingItem.modifiers.length ? `
        <div class="modifier-picker">
          <div class="form-label">${escapeHtml(editingItem.modifierGroupName || 'Opción')}</div>
          <div class="choice-grid modifier-choice-grid">
            ${editingItem.modifiers.map((option, index) => `<label class="choice-check ${index === 0 ? 'active' : ''}"><input type="radio" name="staffQuickModifier" value="${escapeHtml(option)}" ${index === 0 ? 'checked' : ''} onchange="setChoiceActive(this)" /> <span>${escapeHtml(option)}</span></label>`).join('')}
          </div>
        </div>
      ` : ''}
      <div class="quick-qty-row">
        <label>Cantidad
          <div class="qty-stepper">
            <button type="button" class="btn ghost small" onclick="adjustStaffQuickQty(-1)">−</button>
            <input id="staffQuickQty" class="input" type="number" min="1" max="20" value="1" />
            <button type="button" class="btn ghost small" onclick="adjustStaffQuickQty(1)">+</button>
          </div>
        </label>
        <input id="staffQuickDiner" type="hidden" value="" />
      </div>
      <label>Nota rápida
        <input id="staffQuickNote" class="input" placeholder="Sin cebolla, extra salsa..." />
      </label>
      <div class="inline-actions end compact-order-actions">
        <button type="button" class="btn ghost small" onclick="closeStaffItemEditor()">Cancelar</button>
        <button type="button" class="btn success small" onclick="addStaffDraftItem('${escapeHtml(editingItem.id)}')">Agregar</button>
      </div>
    </div>
  `;
}

async function renderStaffOrderItems() {
  const el = document.getElementById('staffOrderItems');
  let items = getStaffMenuItems();
  if (!items.length) {
    el.innerHTML = '<div class="item"><div>Cargando productos del menú...</div></div>';
    await reloadMenuFallbackIfNeeded();
    items = getStaffMenuItems();
  }
  if (!items.length) {
    el.innerHTML = `<div class="item"><div>No hay productos disponibles. Abre Admin → Menú y revisa productos disponibles. Versión staff: ${STAFF_JS_VERSION}</div></div>`;
    return;
  }

  const cats = menuCategoriesWithItems();
  if (!currentStaffCategoryId && cats.length) currentStaffCategoryId = cats[0].id;
  const shownItems = itemsBySelectedCategory();
  const editingItem = currentStaffEditingItemId ? items.find(item => item.id === currentStaffEditingItemId) : null;

  el.innerHTML = `
    <div class="order-wizard">
      <div class="wizard-step">
        <span class="wizard-dot">1</span>
        <div>
          <strong>Elige categoría</strong>
          <p class="muted">Separado igual que el menú del restaurante.</p>
        </div>
      </div>
      <div class="category-chips">
        ${cats.map(cat => `<button type="button" class="chip-btn ${cat.id === currentStaffCategoryId ? 'active' : ''}" onclick="selectStaffCategory('${escapeHtml(cat.id)}')">${escapeHtml(cat.name)}</button>`).join('')}
      </div>

      <div class="wizard-step">
        <span class="wizard-dot">2</span>
        <div>
          <strong>Elige platillo</strong>
          <p class="muted">Toca un producto; luego AUREA pide cantidad y nota.</p>
        </div>
      </div>
      <div class="menu-pick-grid">
        ${shownItems.map(item => `
          <button type="button" class="menu-pick-card ${draftQtyFor(item.id) ? 'selected' : ''} ${editingItem?.id === item.id ? 'editing' : ''}" onclick="openStaffItemEditor('${escapeHtml(item.id)}')">
            <strong>${escapeHtml(item.name)}</strong>
            <small>${escapeHtml(kitchenStationName(item.kitchenStation))}</small>
            ${item.description ? `<small>${escapeHtml(item.description)}</small>` : ''}
            ${draftQtyFor(item.id) ? `<em>${draftQtyFor(item.id)} agregado(s)</em>` : ''}
          </button>
          ${editingItem?.id === item.id ? staffItemEditorHtml(editingItem) : ''}
        `).join('')}
      </div>

      <div class="wizard-step">
        <span class="wizard-dot">3</span>
        <div>
          <strong>Revisa pedido</strong>
          <p class="muted">Confirma cantidades, modificadores y notas antes de enviar.</p>
        </div>
      </div>
      <div class="draft-list">
        ${currentStaffOrderDraft.length ? currentStaffOrderDraft.map(item => `
          <div class="draft-row">
            <div>
              <strong>${escapeHtml(item.qty)} × ${escapeHtml(item.name)}</strong>
              <small>${[item.modifierName ? `${item.modifierGroupName || 'Opción'}: ${item.modifierName}` : '', item.note || ''].filter(Boolean).map(escapeHtml).join(' · ') || 'Sin nota'}</small>
            </div>
            <button type="button" class="btn danger tiny" onclick="removeStaffDraftItem('${escapeHtml(item.localId)}')">Quitar</button>
          </div>
        `).join('') : '<div class="item"><div>Selecciona un platillo para empezar.</div></div>'}
      </div>
    </div>
  `;
}

async function submitStaffOrder() {
  const selectedManualTable = document.getElementById('staffManualTableSelect')?.value || '';
  const tableId = currentOrderMode === 'manual' ? selectedManualTable : currentStaffOrderTableId;
  if (!tableId) return toast('Selecciona una mesa');

  const items = currentStaffOrderDraft.map(item => ({
    itemId: item.itemId,
    qty: Number(item.qty || 0),
    note: item.note || '',
    modifierName: item.modifierName || '',
    dinerName: '',
    dinerBreakdown: ''
  })).filter(item => item.qty > 0);

  if (!items.length) {
    toast('Agrega al menos un producto');
    return;
  }

  try {
    const payload = {
      items,
      note: document.getElementById('staffOrderNote').value,
      source: currentOrderMode === 'manual' ? 'staff_manual' : 'staff_order'
    };
    if (currentOrderMode === 'manual') {
      payload.customerName = document.getElementById('staffManualCustomerName')?.value || '';
      payload.customerPhone = document.getElementById('staffManualCustomerPhone')?.value || '';
    }
    const data = await api(`/api/staff/tables/${tableId}/order`, {
      method: 'POST',
      body: JSON.stringify(payload)
    });
    if (data.printJobs?.length) console.log('Comandas en cola de impresion', data.printJobs.map(job => job.id));
    resetStaffOrderDraft();
    closeStaffOrderModal();
    toast(`Pedido #${data.order.commandNumber} enviado a cocina`);
    await loadStaffData();
  } catch (error) {
    toast(error.message);
  }
}

function renderAlerts() {
  const el = document.getElementById('staffAlerts');
  if (!el) return;
  const alerts = staffDb.alerts.filter(alert => ['new', 'in_progress'].includes(alert.status)).slice(0, 20);
  if (alerts.length === 0) {
    el.innerHTML = '<div class="item"><div>No hay alertas todavía.</div></div>';
    return;
  }
  el.innerHTML = alerts.map(alert => {
    const bill = alert.billDetails;
    const billDetailsHtml = bill ? `
      <div class="bill-alert-mini">
        <span>Cuenta solicitada: <strong>${escapeHtml(bill.whenLabel || 'ahora')}</strong></span>
        ${bill.bringTerminal ? '<span>Cliente pide terminal</span>' : ''}
      </div>
    ` : '';
    return `
      <div class="item">
        <div class="item-main">
          <div class="item-title">${escapeHtml(alertLabel(alert.type))} · ${escapeHtml(alert.tableName)}</div>
          <div class="item-meta">${escapeHtml(alert.note || 'Sin nota')} · ${dateTime(alert.createdAt)}</div>
          ${billDetailsHtml}
          <div class="item-meta">Mesero: ${escapeHtml(alert.assignedStaffName || 'sin asignar')}</div>
          <div style="margin-top:8px;"><span class="pill">${escapeHtml(statusLabel(alert.status))}</span></div>
        </div>
        <div class="inline-actions end">
          <button class="btn small secondary" onclick="updateAlert('${alert.id}', 'in_progress')">En proceso</button>
          <button class="btn small success" onclick="updateAlert('${alert.id}', 'done')">Listo</button>
        </div>
      </div>
    `;
  }).join('');
}

function estimateActions(orderId) {
  return `
    <div class="inline-actions" style="margin-top:10px;">
      <button class="btn small secondary" onclick="confirmOrder('${orderId}', '10-15 min')">10-15</button>
      <button class="btn small secondary" onclick="confirmOrder('${orderId}', '15-20 min')">15-20</button>
      <button class="btn small secondary" onclick="confirmOrder('${orderId}', '20-30 min')">20-30</button>
      <button class="btn small ghost" onclick="customConfirmOrder('${orderId}')">Otro</button>
    </div>`;
}

function renderOrders() {
  const el = document.getElementById('staffOrders');
  if (!el) return;
  const orders = staffDb.orders.filter(order => !['delivered', 'cancelled'].includes(order.status)).slice(0, 30);
  if (orders.length === 0) {
    el.innerHTML = '<div class="item"><div>No hay comandas activas.</div></div>';
    return;
  }
  el.innerHTML = orders.map(order => `
    <div class="item command-card" style="align-items:flex-start;">
      <div class="item-main">
        <div class="item-title">#${escapeHtml(order.commandNumber || '-')} · ${escapeHtml(order.tableName)}</div>
        <div class="item-meta">${dateTime(order.createdAt)} · ${escapeHtml(statusLabel(order.status))}${order.estimatedTime ? ` · Estimado: ${escapeHtml(order.estimatedTime)}` : ''}</div>
        <div style="margin-top:10px; display:grid; gap:4px;">
          ${order.items.map(item => `<div>${item.qty} × ${escapeHtml(item.name)}${item.modifierName ? ` · <strong>${escapeHtml(item.modifierName)}</strong>` : ''}${item.note ? `<div class="item-meta">Nota: ${escapeHtml(item.note)}</div>` : ''}</div>`).join('')}
        </div>
        ${order.note ? `<div class="item-meta" style="margin-top:8px;">Nota: ${escapeHtml(order.note)}</div>` : ''}
        <div class="item-meta" style="margin-top:8px;">Mesero: ${escapeHtml(order.assignedStaffName || 'sin asignar')}</div>
      </div>
      <div class="inline-actions end">
        <span class="pill">Comanda enviada</span>
      </div>
    </div>
  `).join('');
}

async function updateAlert(id, status) {
  await api(`/api/staff/alerts/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
  await loadStaffData();
}

async function cancelStaffBillItem(orderId, itemIndex) {
  return toast(STAFF_FORBIDDEN_MESSAGE);
}

async function updateOrder(id, status, estimatedTime = undefined) {
  await api(`/api/staff/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status, estimatedTime }) });
  await loadStaffData();
}

async function cancelStaffOrder(id) {
  return toast(STAFF_FORBIDDEN_MESSAGE);
}

async function confirmOrder(id, estimatedTime) {
  await updateOrder(id, 'confirmed', estimatedTime);
  toast(`Comanda confirmada · ${estimatedTime}`);
}

async function customConfirmOrder(id) {
  const estimatedTime = prompt('Tiempo estimado para el cliente. Ej. 12-18 min', '15-20 min');
  if (!estimatedTime) return;
  await confirmOrder(id, estimatedTime);
}

async function staffLogout() {
  await api('/api/staff/logout', { method: 'POST' });
  location.reload();
}

document.getElementById('staffLoginForm').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    await api('/api/staff/login', {
      method: 'POST',
      body: JSON.stringify({ pin: document.getElementById('staffPinLogin').value })
    });
    showStaffApp();
  } catch (error) {
    toast(error.message);
  }
});

checkStaffSession();


const AUREA_SUPPORT_WHATSAPP = '526601552214';
const AUREA_RELEASE_VERSION = '0.9.18';

function supportWhatsAppUrl(panel) {
  const restaurant = (typeof staffDb !== 'undefined' && staffDb?.restaurant?.name) || (typeof db !== 'undefined' && db?.restaurant?.name) || (typeof kitchenDb !== 'undefined' && kitchenDb?.restaurant?.name) || 'AUREA';
  const text = `Hola Lalo, necesito ayuda con AUREA (${panel}) en ${restaurant}.`;
  return `https://wa.me/${AUREA_SUPPORT_WHATSAPP}?text=${encodeURIComponent(text)}`;
}

function ensureAureaAssist(panel = 'panel') {
  if (document.getElementById('aureaAssistDock')) return;
  const dock = document.createElement('div');
  dock.id = 'aureaAssistDock';
  dock.className = 'aurea-assist-dock';
  dock.innerHTML = `
    <button class="aurea-tour-float" type="button" onclick="startAureaTour('${panel}')">Tour</button>
    <a class="aurea-help-float" href="${supportWhatsAppUrl(panel)}" target="_blank" rel="noopener">Ayuda</a>
  `;
  document.body.appendChild(dock);
}

function releaseNotesFor(panel = 'panel') {
  if (panel === 'staff') {
    return [
      'Nuevo pedido limpio: ya no duplica productos anteriores.',
      'Mesero captura pedidos y envía comandas a cocina/barra.',
      'La pantalla del mesero queda enfocada solo en sus mesas.'
    ];
  }
  if (panel === 'kitchen') {
    return [
      'Comandas más claras para cocina.',
      'Botón de Ayuda visible para soporte inmediato.',
      'Tour disponible por si entra personal nuevo.'
    ];
  }
  return [
    'Corte diario con pagos, egresos y cierre de caja.',
    'Caja/Admin concentra ticket, pago y cierre de cuenta.',
    'Nuevo flujo de pedidos más simple para el equipo.'
  ];
}

function showAureaReleaseNotesOnce(panel = 'panel') {
  const key = `aurea-release-seen-${panel}-${AUREA_RELEASE_VERSION}`;
  if (localStorage.getItem(key)) return;
  localStorage.setItem(key, '1');
  const notes = releaseNotesFor(panel);
  const modal = document.createElement('div');
  modal.className = 'modal-backdrop active aurea-release-modal';
  modal.innerHTML = `
    <div class="modal mini-modal">
      <div class="section-head">
        <div>
          <h2 style="margin:0;">Novedades AUREA ${AUREA_RELEASE_VERSION}</h2>
          <p class="muted" style="margin:6px 0 0;">Te lo mostramos una sola vez en este dispositivo.</p>
        </div>
        <button class="btn ghost small" type="button" data-close-release>Cerrar</button>
      </div>
      <div class="release-notes">
        ${notes.map((note, index) => `<div class="release-note"><strong>${index + 1}</strong><span>${note}</span></div>`).join('')}
      </div>
      <div class="inline-actions end" style="margin-top:16px;">
        <button class="btn secondary" type="button" data-start-tour>Ver tour</button>
        <button class="btn success" type="button" data-close-release>Entendido</button>
      </div>
    </div>
  `;
  modal.querySelectorAll('[data-close-release]').forEach(btn => btn.addEventListener('click', () => modal.remove()));
  modal.querySelector('[data-start-tour]')?.addEventListener('click', () => {
    modal.remove();
    startAureaTour(panel);
  });
  document.body.appendChild(modal);
}

function tourStepsFor(panel = 'panel') {
  if (panel === 'staff') {
    return [
      { selector: '.client-hero', title: 'Panel de mesero', text: 'Aquí entras a Nuevo pedido, Tour y Ayuda.' },
      { selector: '#staffSessions', title: 'Mesas asignadas', text: 'Trabaja solo con las mesas asignadas por Caja/Admin.' },
      { selector: '#staffSessions', title: 'Nuevo pedido', text: 'En una mesa activa toca Nuevo pedido: eliges categoría, platillo, cantidad y nota.' },
      { selector: '#staffSessions', title: 'Caja/Admin', text: 'Cuenta, ticket, pago y descuento se hacen fuera del panel Mesero.' }
    ];
  }
  if (panel === 'kitchen') {
    return [
      { selector: '.client-hero', title: 'Cocina', text: 'Aquí se ven las comandas que llegan desde QR o meseros.' },
      { selector: '#kitchenNew', title: 'Nuevas', text: 'Confirma la comanda y asigna tiempo estimado.' },
      { selector: '#kitchenProgress', title: 'En preparación', text: 'Marca como listo cuando cocina termine.' },
      { selector: '#kitchenReady', title: 'Listas', text: 'Aquí quedan las comandas listas para entregar.' }
    ];
  }
  return [
    { selector: '.sidebar', title: 'Menú admin', text: 'Desde aquí navegas entre comandas, producción, historial, corte diario, menú y mesas.' },
    { selector: '#commands', title: 'Comandas', text: 'Monitorea pedidos activos y operación en vivo.' },
    { selector: '#finance', title: 'Corte diario', text: 'Autoriza pagos, registra egresos y cierra caja.' },
    { selector: '#menu', title: 'Menú', text: 'Edita categorías, platillos, precios y disponibilidad.' },
    { selector: '#tables', title: 'Mesas & QR', text: 'Gestiona mesas y códigos QR del restaurante.' }
  ];
}

function startAureaTour(panel = 'panel') {
  const steps = tourStepsFor(panel);
  let index = 0;
  const old = document.getElementById('aureaTourOverlay');
  if (old) old.remove();

  const overlay = document.createElement('div');
  overlay.id = 'aureaTourOverlay';
  overlay.className = 'aurea-tour-overlay';
  overlay.innerHTML = `
    <div class="aurea-tour-card">
      <div class="aurea-tour-count"></div>
      <h3></h3>
      <p></p>
      <div class="inline-actions end">
        <button class="btn ghost small" type="button" data-tour-close>Salir</button>
        <button class="btn secondary small" type="button" data-tour-prev>Anterior</button>
        <button class="btn success small" type="button" data-tour-next>Siguiente</button>
      </div>
    </div>
  `;
  document.body.appendChild(overlay);

  function renderStep() {
    document.querySelectorAll('.aurea-tour-highlight').forEach(el => el.classList.remove('aurea-tour-highlight'));
    const step = steps[index];
    const target = document.querySelector(step.selector);
    if (target) {
      target.classList.add('aurea-tour-highlight');
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
    overlay.querySelector('.aurea-tour-count').textContent = `${index + 1} / ${steps.length}`;
    overlay.querySelector('h3').textContent = step.title;
    overlay.querySelector('p').textContent = step.text;
    overlay.querySelector('[data-tour-prev]').style.visibility = index === 0 ? 'hidden' : 'visible';
    overlay.querySelector('[data-tour-next]').textContent = index === steps.length - 1 ? 'Terminar' : 'Siguiente';
  }

  function closeTour() {
    document.querySelectorAll('.aurea-tour-highlight').forEach(el => el.classList.remove('aurea-tour-highlight'));
    overlay.remove();
  }

  overlay.querySelector('[data-tour-close]').addEventListener('click', closeTour);
  overlay.querySelector('[data-tour-prev]').addEventListener('click', () => { if (index > 0) index -= 1; renderStep(); });
  overlay.querySelector('[data-tour-next]').addEventListener('click', () => {
    if (index >= steps.length - 1) return closeTour();
    index += 1;
    renderStep();
  });

  renderStep();
}

