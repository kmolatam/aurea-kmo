let staffDb = null;
let refreshTimer = null;
let currentStaffOrderTableId = null;
const STAFF_JS_VERSION = '0.8.0';

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

async function checkStaffSession() {
  const session = await api('/api/staff/session');
  if (session.isStaff) showStaffApp();
}

function showStaffApp() {
  document.getElementById('staffLogin').style.display = 'none';
  document.getElementById('staffApp').style.display = 'block';
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
  const newAlerts = staffDb.alerts.filter(alert => alert.status === 'new').length;
  const activeOrders = staffDb.orders.filter(order => ['new', 'confirmed', 'in_progress', 'ready'].includes(order.status)).length;
  document.getElementById('staffAlertCount').textContent = `${newAlerts} nueva${newAlerts === 1 ? '' : 's'}`;
  document.getElementById('staffOrderCount').textContent = `${activeOrders} activa${activeOrders === 1 ? '' : 's'}`;
  const mySessions = (staffDb.tableSessions || []).filter(session => session.status === 'active' && session.assignedStaffId === staffDb.staff?.id);
  document.getElementById('staffTableCount').textContent = `${mySessions.length} activa${mySessions.length === 1 ? '' : 's'}`;
  renderSessions();
  renderStaffStats();
  renderAlerts();
  renderOrders();
}


function metric(value, suffix = '') {
  if (value === null || value === undefined || value === '') return '—';
  return `${value}${suffix}`;
}

function renderSessions() {
  const el = document.getElementById('staffSessions');
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
        </div>
        <div class="inline-actions end">
          ${mine ? `
            <button class="btn small secondary" onclick="openStaffOrderModal('${session.tableId}')">Levantar pedido</button>
            ${session.paymentStatus === 'paid' ? '<span class="pill">Pagada</span>' : `<button class="btn small secondary" onclick="markTablePaid('${session.tableId}')">Mesa pagada</button>`}
            <button class="btn small success" onclick="closeTable('${session.tableId}')">Cerrar mesa</button>
          ` : `<button class="btn small success" onclick="takeTable('${session.tableId}')">Tomar mesa</button>`}
        </div>
      </div>
    `;
  }).join('');
}

function renderStaffStats() {
  const el = document.getElementById('staffStats');
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
    <span><strong>${money(stat.totalSales)}</strong> venta registrada</span>
    <span>Tomar mesa: <strong>${metric(stat.avgTakeMinutes, ' min')}</strong></span>
    <span>Confirmar: <strong>${metric(stat.avgConfirmMinutes, ' min')}</strong></span>
    <span>Entregar: <strong>${metric(stat.avgDeliveryMinutes, ' min')}</strong></span>
  `;
}

async function takeTable(tableId) {
  try {
    await api(`/api/staff/tables/${tableId}/take`, { method: 'POST' });
    toast('Mesa tomada');
    await loadStaffData();
  } catch (error) {
    toast(error.message);
  }
}

async function releaseTable(tableId) {
  try {
    await api(`/api/staff/tables/${tableId}/release`, { method: 'POST' });
    toast('Mesa liberada');
    await loadStaffData();
  } catch (error) {
    toast(error.message);
  }
}

async function markTablePaid(tableId) {
  try {
    await api(`/api/staff/tables/${tableId}/paid`, { method: 'POST' });
    toast('Mesa marcada como pagada');
    await loadStaffData();
  } catch (error) {
    toast(error.message);
  }
}

async function closeTable(tableId) {
  if (!confirm('¿Cerrar mesa? Se limpiarán alertas activas, se guardará historial y la mesa quedará lista para el siguiente cliente.')) return;
  try {
    await api(`/api/staff/tables/${tableId}/close`, { method: 'POST', body: JSON.stringify({ markPaid: true }) });
    toast('Mesa cerrada y guardada en historial');
    await loadStaffData();
  } catch (error) {
    toast(error.message);
  }
}


function categoryName(categoryId) {
  const category = (staffDb.categories || []).find(cat => cat.id === categoryId);
  return category ? category.name : 'Sin categoría';
}

function openStaffOrderModal(tableId) {
  currentStaffOrderTableId = tableId;
  const session = (staffDb.tableSessions || []).find(item => item.tableId === tableId && item.status === 'active');
  const table = (staffDb.tables || []).find(item => item.id === tableId);
  document.getElementById('staffOrderTableName').textContent = `${session?.tableName || table?.name || 'Mesa'} · Pedido tomado por ${staffDb.staff?.name || 'mesero'}`;
  document.getElementById('staffOrderNote').value = '';
  document.getElementById('staffOrderModal').classList.add('active');
  renderStaffOrderItems();
}

function closeStaffOrderModal() {
  currentStaffOrderTableId = null;
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
      price: Number(item.price || 0)
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

async function renderStaffOrderItems() {
  const el = document.getElementById('staffOrderItems');
  let items = getStaffMenuItems();
  if (!items.length) {
    el.innerHTML = '<div class="item"><div>Cargando productos del menú...</div></div>';
    await reloadMenuFallbackIfNeeded();
    items = getStaffMenuItems();
  }
  if (!items.length) {
    el.innerHTML = `<div class="item"><div>No hay productos disponibles para levantar pedido. Abre Admin → Menú, revisa que existan productos y haz recarga dura del navegador si acabas de actualizar AUREA. Versión staff: ${STAFF_JS_VERSION}</div></div>`;
    return;
  }

  el.innerHTML = items.map(item => `
    <div class="item" style="align-items:flex-start;">
      <div class="item-main">
        <div class="item-title">${escapeHtml(item.name)} · <span class="price">${money(item.price)}</span></div>
        <div class="item-meta">${escapeHtml(categoryName(item.categoryId))}${item.description ? ` · ${escapeHtml(item.description)}` : ''}</div>
        <label style="margin-top:8px;">Nota del producto
          <input class="input staff-order-note" data-item-id="${escapeHtml(item.id)}" placeholder="Ej. sin cebolla, término medio..." />
        </label>
        <label style="margin-top:8px;">Cuenta / persona
          <input class="input staff-order-diner" data-item-id="${escapeHtml(item.id)}" placeholder="Ej. Eduardo o Eduardo:1, Joel:2" />
        </label>
      </div>
      <div style="width:96px;">
        <label>Cantidad
          <input class="input staff-order-qty" data-item-id="${escapeHtml(item.id)}" type="number" min="0" max="20" value="0" />
        </label>
      </div>
    </div>
  `).join('');
}

async function submitStaffOrder() {
  if (!currentStaffOrderTableId) return;
  const items = Array.from(document.querySelectorAll('.staff-order-qty'))
    .map(input => {
      const itemId = input.dataset.itemId;
      const qty = Number(input.value || 0);
      const noteInput = document.querySelector(`.staff-order-note[data-item-id="${CSS.escape(itemId)}"]`);
      const dinerInput = document.querySelector(`.staff-order-diner[data-item-id="${CSS.escape(itemId)}"]`);
      return { itemId, qty, note: noteInput ? noteInput.value : '', dinerName: dinerInput ? dinerInput.value : '', dinerBreakdown: dinerInput ? dinerInput.value : '' };
    })
    .filter(item => item.qty > 0);

  if (!items.length) {
    toast('Agrega al menos un producto');
    return;
  }

  try {
    const data = await api(`/api/staff/tables/${currentStaffOrderTableId}/order`, {
      method: 'POST',
      body: JSON.stringify({ items, note: document.getElementById('staffOrderNote').value })
    });
    closeStaffOrderModal();
    toast(`Comanda #${data.order.commandNumber} levantada`);
    await loadStaffData();
  } catch (error) {
    toast(error.message);
  }
}

function renderAlerts() {
  const el = document.getElementById('staffAlerts');
  const alerts = staffDb.alerts.filter(alert => ['new', 'in_progress'].includes(alert.status)).slice(0, 20);
  if (alerts.length === 0) {
    el.innerHTML = '<div class="item"><div>No hay alertas todavía.</div></div>';
    return;
  }
  el.innerHTML = alerts.map(alert => {
    const bill = alert.billDetails;
    const billDetailsHtml = bill ? `
      <div class="bill-alert-mini">
        <span>Total: <strong>${money(bill.total)}</strong></span>
        <span>Propina: <strong>${money(bill.tipAmount)}</strong></span>
        <span>Pago: <strong>${escapeHtml(bill.paymentMethodLabel || bill.paymentMethod || 'Por definir')}</strong></span>
        <span>Cuenta: <strong>${escapeHtml(bill.whenLabel || 'ahora')}</strong></span>
        ${bill.bringTerminal ? '<span>Terminal: <strong>sí</strong></span>' : ''}
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
          ${alert.assignedStaffId ? '' : `<button class="btn small secondary" onclick="takeTable('${alert.tableId}')">Tomar mesa</button>`}
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
  const orders = staffDb.orders.filter(order => !['delivered', 'cancelled'].includes(order.status)).slice(0, 30);
  if (orders.length === 0) {
    el.innerHTML = '<div class="item"><div>No hay comandas activas.</div></div>';
    return;
  }
  el.innerHTML = orders.map(order => `
    <div class="item command-card" style="align-items:flex-start;">
      <div class="item-main">
        <div class="item-title">#${escapeHtml(order.commandNumber || '-')} · ${escapeHtml(order.tableName)} · ${money(order.total)}</div>
        <div class="item-meta">${dateTime(order.createdAt)} · ${escapeHtml(statusLabel(order.status))}${order.estimatedTime ? ` · Estimado: ${escapeHtml(order.estimatedTime)}` : ''}</div>
        <div style="margin-top:10px; display:grid; gap:4px;">
          ${order.items.map(item => `<div>${item.qty} × ${escapeHtml(item.name)}${item.dinerName ? ` · ${escapeHtml(item.dinerName)}` : ''} <span class="item-meta">${money(item.subtotal)}</span></div>`).join('')}
        </div>
        ${order.note ? `<div class="item-meta" style="margin-top:8px;">Nota: ${escapeHtml(order.note)}</div>` : ''}
        <div class="item-meta" style="margin-top:8px;">Mesero: ${escapeHtml(order.assignedStaffName || 'sin asignar')}</div>
        ${order.status === 'new' ? `<div style="margin-top:8px;"><span class="pill">Confirmar con tiempo estimado</span></div>${estimateActions(order.id)}` : ''}
      </div>
      <div class="inline-actions end">
        ${order.assignedStaffId ? '' : `<button class="btn small secondary" onclick="takeTable('${order.tableId}')">Tomar mesa</button>`}
        <button class="btn small secondary" onclick="updateOrder('${order.id}', 'in_progress')">Preparar</button>
        <button class="btn small secondary" onclick="updateOrder('${order.id}', 'ready')">Listo</button>
        <button class="btn small success" onclick="updateOrder('${order.id}', 'delivered')">Entregado</button>
      </div>
    </div>
  `).join('');
}

async function updateAlert(id, status) {
  await api(`/api/staff/alerts/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
  await loadStaffData();
}

async function updateOrder(id, status, estimatedTime = undefined) {
  await api(`/api/staff/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status, estimatedTime }) });
  await loadStaffData();
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
