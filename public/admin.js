let db = null;
let currentSection = 'dashboard';
let refreshTimer = null;
let tablesSignature = '';
let crmFilter = 'all';
let pendingLogoDataUrl = undefined;
const qrCache = new Map();

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

function phoneForWhatsApp(phone) {
  let digits = String(phone || '').replace(/\D/g, '');
  if (digits.length === 10) digits = `52${digits}`;
  return digits;
}

function whatsappUrl(phone, message) {
  const digits = phoneForWhatsApp(phone);
  if (!digits) return '#';
  return `https://wa.me/${digits}?text=${encodeURIComponent(message)}`;
}

function firstActiveStaff() {
  return (db.staff || []).find(member => member.active !== false && member.whatsapp);
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

async function checkSession() {
  const session = await api('/api/session');
  const superLink = document.getElementById('superAdminLink');
  if (superLink) superLink.style.display = session.role === 'superadmin' ? 'block' : 'none';
  if (session.isAdmin) showAdmin();
}

function showAdmin() {
  document.getElementById('loginScreen').style.display = 'none';
  document.getElementById('adminApp').style.display = 'grid';
  loadData(true);
  if (!refreshTimer) refreshTimer = setInterval(() => loadData(false), 5000);
}

async function loadData(fullRender = false) {
  try {
    db = await api('/api/admin/data');
    applyAccent();
    if (fullRender) {
      renderAll();
      maybeShowAdminTour();
    } else renderLiveData();
  } catch (error) {
    if (error.message.includes('No autorizado')) return;
    toast(error.message);
  }
}

function applyAccent() {
  const color = db?.restaurant?.accentColor || '#c9a44c';
  document.documentElement.style.setProperty('--detail', color);
}

function renderAll() {
  renderStats();
  renderAlerts();
  renderOrders();
  renderCommandBoard();
  renderTeam();
  renderHistory();
  renderCategories();
  renderMenu();
  renderTables();
  renderSettings();
  renderStaff();
}

function renderLiveData() {
  renderStats();
  renderAlerts();
  renderOrders();
  renderCommandBoard();
  renderTeam();
  renderHistory();
}

function renderStats() {
  document.getElementById('statAlerts').textContent = db.alerts.filter(a => a.status === 'new').length;
  document.getElementById('statOrders').textContent = db.orders.filter(o => ['new', 'confirmed', 'in_progress', 'ready'].includes(o.status)).length;
  document.getElementById('statTables').textContent = (db.tableSessions || []).filter(s => s.status === 'active').length;
  document.getElementById('statContacts').textContent = (db.contacts || []).length;
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

function statusClass(status) {
  return `status-${String(status || 'new').replaceAll('_', '-')}`;
}

function estimatePicker(orderId) {
  return `
    <div class="inline-actions estimate-actions">
      <button class="btn small secondary" onclick="confirmOrder('${orderId}', '10-15 min')">10-15</button>
      <button class="btn small secondary" onclick="confirmOrder('${orderId}', '15-20 min')">15-20</button>
      <button class="btn small secondary" onclick="confirmOrder('${orderId}', '20-30 min')">20-30</button>
      <button class="btn small ghost" onclick="customConfirmOrder('${orderId}')">Otro</button>
    </div>
  `;
}

function orderCard(order, compact = false) {
  const msg = `Comanda #${order.commandNumber || ''} ${order.tableName}: ${order.items.map(item => `${item.qty}x ${item.name}`).join(', ')}. Total ${money(order.total)}.`;
  const staff = firstActiveStaff();
  return `
    <div class="item command-card ${statusClass(order.status)}" style="align-items:flex-start;">
      <div class="item-main">
        <div class="item-title">#${escapeHtml(order.commandNumber || '-')} · ${escapeHtml(order.tableName)} · ${money(order.total)}</div>
        <div class="item-meta">${dateTime(order.createdAt)} · ${escapeHtml(statusLabel(order.status))}${order.estimatedTime ? ` · Estimado: ${escapeHtml(order.estimatedTime)}` : ''}</div>
        <div style="margin-top:10px; display:grid; gap:4px;">
          ${order.items.map(item => `<div>${item.qty} × ${escapeHtml(item.name)} <span class="item-meta">${money(item.subtotal)}</span>${item.note ? `<div class="item-meta">Nota: ${escapeHtml(item.note)}</div>` : ''}</div>`).join('')}
        </div>
        ${order.note ? `<div class="item-meta" style="margin-top:8px;">Nota general: ${escapeHtml(order.note)}</div>` : ''}
        ${order.customerName || order.customerPhone ? `<div class="item-meta" style="margin-top:8px;">Cliente: ${escapeHtml(order.customerName || 'Sin nombre')} ${escapeHtml(order.customerPhone || '')}</div>` : ''}
        ${order.assignedStaffName ? `<div class="item-meta">Mesero: ${escapeHtml(order.assignedStaffName)}</div>` : `<div class="item-meta">Mesero: sin asignar</div>`}
        ${order.status === 'new' ? `<div style="margin-top:10px;"><span class="pill">Elegir tiempo al confirmar</span></div>${estimatePicker(order.id)}` : ''}
      </div>
      <div class="inline-actions end">
        ${order.status !== 'new' ? `<button class="btn small secondary" onclick="updateOrder('${order.id}', 'confirmed')">Confirmar</button>` : ''}
        <button class="btn small secondary" onclick="updateOrder('${order.id}', 'in_progress')">Preparar</button>
        <button class="btn small secondary" onclick="updateOrder('${order.id}', 'ready')">Listo</button>
        <button class="btn small success" onclick="updateOrder('${order.id}', 'delivered')">Entregado</button>
        <button class="btn small ghost" onclick="updateOrder('${order.id}', 'cancelled')">Cancelar</button>
      </div>
    </div>
  `;
}

function renderAlerts() {
  const el = document.getElementById('alertsList');
  const alerts = db.alerts.filter(alert => ['new', 'in_progress'].includes(alert.status)).slice(0, 10);
  if (alerts.length === 0) {
    el.innerHTML = '<div class="item"><div>No hay alertas todavía.</div></div>';
    return;
  }

  const staff = firstActiveStaff();
  el.innerHTML = alerts.map(alert => {
    const msg = `${alertLabel(alert.type)} · ${alert.tableName}. ${alert.note || ''}`.trim();
    const bill = alert.billDetails;
    const billDetailsHtml = bill ? `
      <div class="bill-alert-mini">
        <span>Total estimado: <strong>${money(bill.total)}</strong></span>
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
          ${alert.customerPhone ? `<div class="item-meta">Cliente: ${escapeHtml(alert.customerName || 'Sin nombre')} · ${escapeHtml(alert.customerPhone)}</div>` : ''}
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

function renderOrders() {
  renderOrdersInto('ordersMiniList', db.orders.slice(0, 5));
}

function renderOrdersInto(elementId, orders) {
  const el = document.getElementById(elementId);
  if (!el) return;
  if (orders.length === 0) {
    el.innerHTML = '<div class="item"><div>No hay comandas todavía.</div></div>';
    return;
  }
  el.innerHTML = orders.map(order => orderCard(order, true)).join('');
}

function renderCommandBoard() {
  const groups = {
    commandsNew: db.orders.filter(o => o.status === 'new'),
    commandsConfirmed: db.orders.filter(o => o.status === 'confirmed'),
    commandsProgress: db.orders.filter(o => ['in_progress', 'ready'].includes(o.status)),
    commandsClosed: db.orders.filter(o => ['delivered', 'cancelled'].includes(o.status)).slice(0, 15)
  };
  for (const [id, orders] of Object.entries(groups)) {
    const el = document.getElementById(id);
    if (!el) continue;
    el.innerHTML = orders.length ? orders.map(order => orderCard(order, false)).join('') : '<div class="item"><div>Sin comandas.</div></div>';
  }
}

function renderCategories() {
  const select = document.getElementById('itemCategory');
  select.innerHTML = db.categories.map(cat => `<option value="${cat.id}">${escapeHtml(cat.name)}</option>`).join('');

  const list = document.getElementById('categoryList');
  if (db.categories.length === 0) {
    list.innerHTML = '<div class="item"><div>Crea una categoría antes de agregar productos.</div></div>';
    return;
  }
  list.innerHTML = db.categories.map(cat => `
    <div class="item">
      <div>
        <div class="item-title">${escapeHtml(cat.name)}</div>
        <div class="item-meta">${db.menuItems.filter(i => i.categoryId === cat.id).length} productos</div>
      </div>
      <button class="btn danger small" onclick="deleteCategory('${cat.id}')">Eliminar</button>
    </div>
  `).join('');
}

function renderMenu() {
  const el = document.getElementById('menuList');
  if (db.menuItems.length === 0) {
    el.innerHTML = '<div class="item"><div>No hay productos todavía.</div></div>';
    return;
  }

  el.innerHTML = db.menuItems.map(item => {
    const category = db.categories.find(c => c.id === item.categoryId);
    return `
      <div class="item">
        <div class="item-main">
          <div class="item-title">${escapeHtml(item.name)} · ${money(item.price)}</div>
          <div class="item-meta">${escapeHtml(category?.name || 'Sin categoría')} · ${item.available ? 'Disponible' : 'Oculto'} ${item.featured ? '· Recomendado' : ''}</div>
          <div class="item-meta">${escapeHtml(item.description || '')}</div>
        </div>
        <div class="inline-actions end">
          <button class="btn secondary small" onclick="editMenuItem('${item.id}')">Editar</button>
          <button class="btn ghost small" onclick="toggleAvailability('${item.id}')">${item.available ? 'Desactivar' : 'Activar'}</button>
          <button class="btn danger small" onclick="deleteMenuItem('${item.id}')">Eliminar</button>
        </div>
      </div>
    `;
  }).join('');
}

async function renderTables(force = false) {
  const el = document.getElementById('tablesList');
  const signature = db.tables.map(t => `${t.id}:${t.name}`).join('|');
  if (!force && signature === tablesSignature && el.innerHTML.trim()) return;
  tablesSignature = signature;

  if (db.tables.length === 0) {
    el.innerHTML = '<div class="item"><div>No hay mesas todavía.</div></div>';
    return;
  }

  el.innerHTML = db.tables.map(table => `
    <div class="item" id="row-${table.id}" style="align-items:flex-start;">
      <div class="item-main">
        <div class="item-title">${escapeHtml(table.name)}</div>
        <div class="item-meta">${qrCache.has(table.id) ? 'QR listo' : 'Generando QR...'}</div>
      </div>
      <div class="inline-actions end">
        <a class="btn small secondary" href="/t/${table.id}" target="_blank">Abrir mesa</a>
        <button class="btn danger small" onclick="deleteTable('${table.id}')">Eliminar</button>
      </div>
    </div>
  `).join('');

  for (const table of db.tables) {
    try {
      let qr = qrCache.get(table.id);
      if (!qr) {
        qr = await api(`/api/admin/qr/${table.id}`);
        qrCache.set(table.id, qr);
      }
      const row = document.getElementById(`row-${table.id}`);
      if (!row) continue;
      row.innerHTML = `
        <div style="display:flex; gap:14px; align-items:center; flex-wrap:wrap; min-width:0;">
          <img class="qr-img" src="${qr.pngDataUrl}" alt="QR ${escapeHtml(table.name)}" />
          <div class="item-main">
            <div class="item-title">${escapeHtml(table.name)}</div>
            <div class="item-meta text-break">${escapeHtml(qr.url)}</div>
            <div style="margin-top:8px;"><span class="pill">QR único por mesa</span></div>
          </div>
        </div>
        <div class="inline-actions end">
          <a class="btn small secondary" href="/t/${table.id}" target="_blank">Abrir mesa</a>
          <a class="btn small secondary" href="${qr.pngDataUrl}" download="${escapeHtml(table.name)}.png">Descargar QR</a>
          <button class="btn danger small" onclick="deleteTable('${table.id}')">Eliminar</button>
        </div>
      `;
    } catch (error) {
      console.error(error);
    }
  }
}


function assignmentModeLabel(mode) {
  return mode === 'zone' ? 'Asignación por zona' : 'Asignación libre';
}

function metric(value, suffix = '') {
  if (value === null || value === undefined || value === '') return '—';
  return `${value}${suffix}`;
}

function renderTeam() {
  const modePill = document.getElementById('assignmentModePill');
  if (modePill) modePill.textContent = assignmentModeLabel(db.restaurant.assignmentMode || 'free');
  renderActiveSessions();
  renderStaffStats();
}

function renderActiveSessions() {
  const el = document.getElementById('activeSessionsList');
  if (!el) return;
  const sessions = (db.tableSessions || []).filter(session => session.status === 'active');
  if (sessions.length === 0) {
    el.innerHTML = '<div class="item"><div>No hay mesas activas todavía.</div></div>';
    return;
  }
  el.innerHTML = sessions.map(session => `
    <div class="item">
      <div class="item-main">
        <div class="item-title">${escapeHtml(session.tableName)} · ${escapeHtml(session.customerName || 'Cliente sin nombre')}</div>
        <div class="item-meta">${session.customerPhone ? `WhatsApp: ${escapeHtml(session.customerPhone)} · ` : ''}Entrada: ${dateTime(session.createdAt)}</div>
        <div style="margin-top:8px;"><span class="pill">${session.assignedStaffName ? `Atiende ${escapeHtml(session.assignedStaffName)}` : 'Sin asignar'}</span></div>
      </div>
      <div class="inline-actions end">
        ${session.assignedStaffName ? '' : (db.staff || []).filter(s => s.active !== false).map(member => `<button class="btn small secondary" onclick="adminAssignTable('${session.tableId}', '${member.id}')">Asignar a ${escapeHtml(member.name)}</button>`).join('')}
        ${session.paymentStatus === 'paid' ? '<span class="pill">Pagada</span>' : ''}
        <button class="btn small success" onclick="adminCloseTable('${session.tableId}')">Cerrar mesa</button>
      </div>
    </div>
  `).join('');
}

function renderStaffStats() {
  const el = document.getElementById('staffStatsList');
  if (!el) return;
  const stats = db.staffStats || [];
  if (stats.length === 0) {
    el.innerHTML = '<div class="item"><div>No hay estadísticas todavía.</div></div>';
    return;
  }
  el.innerHTML = stats.map(stat => `
    <div class="item staff-stat-card">
      <div class="item-main">
        <div class="item-title">${escapeHtml(stat.name)} · ${escapeHtml(stat.role || 'Mesero')}</div>
        <div class="staff-metrics">
          <span><strong>${stat.activeTables}</strong> mesas activas</span>
          <span><strong>${stat.activeOrders}</strong> comandas activas</span>
          <span><strong>${stat.deliveredOrders}</strong> entregadas</span>
          <span><strong>${stat.vipCaptured}</strong> Clientes captados</span>
          <span><strong>${money(stat.totalSales)}</strong> venta registrada</span>
          <span>Tomar mesa: <strong>${metric(stat.avgTakeMinutes, ' min')}</strong></span>
          <span>Confirmar: <strong>${metric(stat.avgConfirmMinutes, ' min')}</strong></span>
          <span>Entregar: <strong>${metric(stat.avgDeliveryMinutes, ' min')}</strong></span>
        </div>
      </div>
    </div>
  `).join('');
}

function renderStaffZoneOptions() {
  const el = document.getElementById('staffZoneTables');
  if (!el) return;
  if (!db.tables.length) {
    el.innerHTML = '<div class="muted">Crea mesas primero.</div>';
    return;
  }
  el.innerHTML = db.tables.map(table => `
    <label class="check-pill">
      <input type="checkbox" name="staffZoneTable" value="${escapeHtml(table.id)}" />
      <span>${escapeHtml(table.name)}</span>
    </label>
  `).join('');
}

async function adminAssignTable(tableId, staffId) {
  try {
    await api(`/api/admin/tables/${tableId}/take/${staffId}`, { method: 'POST' });
    toast('Mesa asignada');
    await loadData(false);
  } catch (error) {
    toast(error.message);
  }
}

async function adminCloseTable(tableId) {
  if (!confirm('¿Cerrar mesa desde admin? Se limpiarán alertas activas y se guardará historial.')) return;
  try {
    await api(`/api/admin/tables/${tableId}/close`, { method: 'POST', body: JSON.stringify({ markPaid: true }) });
    toast('Mesa cerrada');
    await loadData(false);
  } catch (error) {
    toast(error.message);
  }
}

function renderHistory() {
  const el = document.getElementById('historyList');
  const pill = document.getElementById('historyCountPill');
  if (!el) return;
  const closures = (db.tableClosures || []).slice(0, 50);
  if (pill) pill.textContent = `${closures.length} cierre${closures.length === 1 ? '' : 's'}`;
  if (!closures.length) {
    el.innerHTML = '<div class="item"><div>Aún no hay mesas cerradas.</div></div>';
    return;
  }
  el.innerHTML = closures.map(close => {
    const split = close.splitAccounts || [];
    const splitHtml = split.length ? `<div class="split-summary mini-history">${split.map(account => `<span><strong>${escapeHtml(account.name)}</strong> ${money(account.subtotal)}</span>`).join('')}</div>` : '';
    return `
      <div class="item history-card" style="align-items:flex-start;">
        <div class="item-main">
          <div class="item-title">${escapeHtml(close.tableName)} · ${money(close.subtotal)} · ${escapeHtml(close.assignedStaffName || 'Sin mesero')}</div>
          <div class="item-meta">Abrió: ${dateTime(close.openedAt)} · Cerró: ${dateTime(close.closedAt)}${close.durationMinutes !== null && close.durationMinutes !== undefined ? ` · ${close.durationMinutes} min` : ''}</div>
          <div class="item-meta">Comandas: ${close.orderCount || 0} · Productos: ${close.lineCount || 0} · Cliente: ${escapeHtml(close.customerName || 'Sin nombre')}</div>
          ${close.avgRating ? `<div class="item-meta">Calificación promedio: ${escapeHtml(close.avgRating)}/5</div>` : ''}
          ${splitHtml}
        </div>
      </div>
    `;
  }).join('');
}

async function saveStaffZones(staffId) {
  const member = db.staff.find(s => s.id === staffId);
  if (!member) return;
  const raw = prompt('IDs de mesas separados por coma. Ej: mesa-1, mesa-2', (member.assignedTableIds || []).join(', '));
  if (raw === null) return;
  const assignedTableIds = raw.split(',').map(value => value.trim()).filter(Boolean);
  try {
    await api(`/api/admin/staff/${staffId}`, { method: 'PUT', body: JSON.stringify({ assignedTableIds }) });
    toast('Zonas actualizadas');
    await loadData(true);
  } catch (error) {
    toast(error.message);
  }
}

function filteredContacts() {
  const contacts = db.contacts || [];
  if (crmFilter === 'orders') return contacts.filter(c => Number(c.orderCount || 0) > 0);
  if (crmFilter === 'promos') return contacts.filter(c => c.optInPromos);
  if (crmFilter === 'scan') return contacts.filter(c => Number(c.orderCount || 0) === 0);
  return contacts;
}

function setCrmFilter(filter) {
  crmFilter = filter;
}

function renderCRM() {
  const contacts = filteredContacts();
  document.getElementById('crmCountPill').textContent = `${contacts.length} contacto${contacts.length === 1 ? '' : 's'}`;
  const list = document.getElementById('contactsList');
  if (contacts.length === 0) {
    list.innerHTML = '<div class="item"><div>Aún no hay WhatsApps con este filtro.</div></div>';
    return;
  }

  const promo = document.getElementById('promoMessage')?.value || 'Tenemos una promoción especial para ti. Muestra este mensaje al ordenar.';
  list.innerHTML = contacts.map(contact => `
    <div class="item">
      <div class="item-main">
        <div class="item-title">${escapeHtml(contact.name || 'Cliente sin nombre')} · ${escapeHtml(contact.phone)}</div>
        <div class="item-meta">${escapeHtml(contact.lastTableName || contact.firstTableName || 'Sin mesa')} · ${escapeHtml(contact.lastSource || contact.firstSource || 'web')} · ${contact.visits || 1} visita(s) · ${contact.orderCount || 0} pedido(s)</div>
        <div class="item-meta">Último contacto: ${dateTime(contact.lastSeenAt)}</div>
        <div style="margin-top:8px;"><span class="pill">${contact.optInPromos ? 'Acepta promociones' : 'Sin consentimiento promo'}</span></div>
      </div>
      <div class="inline-actions end">
        <a class="btn secondary small" href="${whatsappUrl(contact.phone, promo)}" target="_blank">Enviar promo</a>
        <button class="btn danger small" onclick="deleteContact('${contact.id}')">Eliminar</button>
      </div>
    </div>
  `).join('');
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

function whatsappOrderStatusClass(status) {
  return `status-${String(status || 'new').replaceAll('_', '-')}`;
}

function renderWhatsappOrders() {
  const list = document.getElementById('whatsappOrdersList');
  const pill = document.getElementById('whatsappOrderCountPill');
  if (!list || !db) return;
  const orders = db.whatsappOrders || [];
  if (pill) pill.textContent = `${orders.length} pedido${orders.length === 1 ? '' : 's'}`;
  const qrMessage = document.getElementById('whatsappQrMessage');
  if (qrMessage && !qrMessage.value) qrMessage.value = `Hola, quiero hacer un pedido en ${db.restaurant?.name || 'el restaurante'}.`;
  if (!orders.length) {
    list.innerHTML = '<div class="item"><div>Aún no hay pedidos WhatsApp registrados.</div></div>';
    return;
  }
  list.innerHTML = orders.map(order => {
    const waMsg = `Hola ${order.customerName || ''}, tu pedido #${order.ticketNumber} en ${db.restaurant?.name || 'el restaurante'} está ${whatsappOrderStatusLabel(order.status).toLowerCase()}.`;
    return `
      <div class="item command-card ${whatsappOrderStatusClass(order.status)}" style="align-items:flex-start;">
        <div class="item-main">
          <div class="item-title">WA #${escapeHtml(order.ticketNumber || '-')} · ${escapeHtml(order.customerName || 'Cliente sin nombre')} · ${money(order.totalEstimate || 0)}</div>
          <div class="item-meta">${escapeHtml(order.customerPhone || 'Sin WhatsApp')} · ${escapeHtml(whatsappOrderStatusLabel(order.status))} · ${dateTime(order.createdAt)}</div>
          <div class="item-meta" style="margin-top:8px;">Mensaje: ${escapeHtml(order.message || 'Sin mensaje')}</div>
          <div style="margin-top:8px;">${escapeHtml(order.itemsText || 'Sin detalle interpretado')}</div>
          ${order.address ? `<div class="item-meta" style="margin-top:8px;">Dirección/notas: ${escapeHtml(order.address)}</div>` : ''}
          ${order.commandOrderId ? `<div style="margin-top:8px;"><span class="pill">Enviado a cocina</span></div>` : ''}
        </div>
        <div class="inline-actions end">
          <a class="btn small secondary" href="${whatsappUrl(order.customerPhone, waMsg)}" target="_blank">Responder WA</a>
          <button class="btn small secondary" onclick="updateWhatsappOrder('${order.id}', 'confirmed')">Confirmar</button>
          <button class="btn small secondary" onclick="updateWhatsappOrder('${order.id}', 'in_progress')">Preparar</button>
          <button class="btn small secondary" onclick="updateWhatsappOrder('${order.id}', 'ready')">Listo</button>
          ${order.commandOrderId ? '' : `<button class="btn small success" onclick="sendWhatsappOrderToKitchen('${order.id}')">Mandar a cocina</button>`}
          <button class="btn small success" onclick="updateWhatsappOrder('${order.id}', 'closed')">Cerrar</button>
          <button class="btn small ghost" onclick="updateWhatsappOrder('${order.id}', 'cancelled')">Cancelar</button>
          <button class="btn danger small" onclick="deleteWhatsappOrder('${order.id}')">Eliminar</button>
        </div>
      </div>
    `;
  }).join('');
}

async function generateWhatsappClientQr() {
  try {
    const message = document.getElementById('whatsappQrMessage').value || `Hola, quiero hacer un pedido en ${db.restaurant?.name || 'el restaurante'}.`;
    const result = await api(`/api/admin/whatsapp/client-qr?message=${encodeURIComponent(message)}`);
    const box = document.getElementById('whatsappClientQrBox');
    const link = document.getElementById('whatsappClientLink');
    box.innerHTML = `<img class="qr-img" src="${result.pngDataUrl}" alt="QR WhatsApp" /><div class="item-meta" style="margin-top:8px;">${escapeHtml(result.phone)} · ${escapeHtml(result.message)}</div>`;
    link.href = result.url;
    link.style.display = 'inline-flex';
    toast('QR de WhatsApp generado');
  } catch (error) {
    toast(error.message);
  }
}

async function updateWhatsappOrder(id, status) {
  try {
    await api(`/api/admin/whatsapp-orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
    toast('Pedido WhatsApp actualizado');
    await loadData(false);
  } catch (error) {
    toast(error.message);
  }
}

async function sendWhatsappOrderToKitchen(id) {
  try {
    await api(`/api/admin/whatsapp-orders/${id}/send-to-kitchen`, { method: 'POST' });
    toast('Pedido WhatsApp enviado a cocina');
    await loadData(false);
  } catch (error) {
    toast(error.message);
  }
}

async function deleteWhatsappOrder(id) {
  if (!confirm('¿Eliminar este pedido WhatsApp?')) return;
  try {
    await api(`/api/admin/whatsapp-orders/${id}`, { method: 'DELETE' });
    toast('Pedido WhatsApp eliminado');
    await loadData(false);
  } catch (error) {
    toast(error.message);
  }
}

function renderSettings() {
  document.getElementById('restaurantName').value = db.restaurant.name || '';
  document.getElementById('restaurantSubtitle').value = db.restaurant.subtitle || '';
  document.getElementById('restaurantLogoText').value = db.restaurant.logoText || '';
  document.getElementById('restaurantWhatsapp').value = db.restaurant.whatsapp || '';
  const slugInput = document.getElementById('restaurantInstanceSlug');
  if (slugInput) slugInput.value = db.restaurant.instanceSlug || '';
  const pinPrefixInput = document.getElementById('restaurantPinPrefix');
  if (pinPrefixInput) pinPrefixInput.value = db.restaurant.pinPrefix || 'LL';
  document.getElementById('restaurantAddress').value = db.restaurant.address || '';
  document.getElementById('restaurantHours').value = db.restaurant.hours || '';
  document.getElementById('restaurantCrmText').value = db.restaurant.crmOptInText || 'Recibir promociones y actualizaciones del restaurante por WhatsApp.';
  document.getElementById('restaurantAccentColor').value = db.restaurant.accentColor || '#c9a44c';
  document.getElementById('operationMode').value = db.restaurant.operationMode || 'commands';
  document.getElementById('assignmentMode').value = db.restaurant.assignmentMode || 'free';
  const wa = db.restaurant.whatsappOfficial || {};
  if (document.getElementById('waOfficialEnabled')) {
    document.getElementById('waOfficialEnabled').checked = Boolean(wa.enabled);
    document.getElementById('waOfficialDisplayName').value = wa.displayName || db.restaurant.name || '';
    document.getElementById('waOfficialBusinessId').value = wa.businessPortfolioId || '';
    document.getElementById('waOfficialWabaId').value = wa.wabaId || '';
    document.getElementById('waOfficialPhoneNumberId').value = wa.phoneNumberId || '';
    document.getElementById('waOfficialWebhookUrl').value = wa.webhookUrl || '';
    document.getElementById('waOfficialNotes').value = wa.notes || '';
  }
  const preview = document.getElementById('logoPreview');
  if (db.restaurant.logoDataUrl) preview.innerHTML = `<img src="${db.restaurant.logoDataUrl}" alt="Logo" />`;
  else preview.textContent = 'Sin logo cargado';
  renderStaffZoneOptions();
  updateStaffPinPreview();
}

function renderStaff() {
  const list = document.getElementById('staffList');
  const staff = db.staff || [];
  if (staff.length === 0) {
    list.innerHTML = '<div class="item"><div>No hay staff agregado todavía.</div></div>';
    return;
  }
  list.innerHTML = staff.map(member => `
    <div class="item">
      <div class="item-main">
        <div class="item-title">${escapeHtml(member.name)} · ${escapeHtml(member.role || 'Mesero')}</div>
        <div class="item-meta">WhatsApp: ${escapeHtml(member.whatsapp || 'Sin WhatsApp')} · PIN: ${escapeHtml(member.pin || 'Sin PIN')}</div>
        <div class="item-meta">Zona: ${escapeHtml((member.assignedTableIds || []).map(id => (db.tables.find(t => t.id === id)?.name || id)).join(', ') || 'Sin mesas asignadas')}</div>
        <div style="margin-top:8px;"><span class="pill">${member.active !== false ? 'Activo' : 'Inactivo'}</span></div>
      </div>
      <div class="inline-actions end">
        <button class="btn small secondary" onclick="saveStaffZones('${member.id}')">Editar zona</button>
        <button class="btn danger small" onclick="deleteStaff('${member.id}')">Eliminar</button>
      </div>
    </div>
  `).join('');
}

async function updateAlert(id, status) {
  await api(`/api/admin/alerts/${id}`, { method: 'PATCH', body: JSON.stringify({ status }) });
  await loadData(false);
}

async function updateOrder(id, status, estimatedTime = undefined) {
  await api(`/api/admin/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status, estimatedTime }) });
  await loadData(false);
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

function editMenuItem(id) {
  const item = db.menuItems.find(product => product.id === id);
  if (!item) return toast('Producto no encontrado');
  document.getElementById('itemEditingId').value = item.id;
  document.getElementById('itemCategory').value = item.categoryId;
  document.getElementById('itemName').value = item.name || '';
  document.getElementById('itemDescription').value = item.description || '';
  document.getElementById('itemPrice').value = item.price || '';
  document.getElementById('itemImageUrl').value = item.imageUrl || '';
  document.getElementById('itemAvailable').checked = item.available !== false;
  document.getElementById('itemFeatured').checked = Boolean(item.featured);
  document.getElementById('menuFormTitle').textContent = 'Editar producto';
  document.getElementById('menuSubmitBtn').textContent = 'Actualizar producto';
  document.getElementById('cancelEditBtn').style.display = 'inline-flex';
  document.getElementById('itemName').focus();
}

function cancelMenuEdit() {
  const form = document.getElementById('menuForm');
  form.reset();
  document.getElementById('itemEditingId').value = '';
  document.getElementById('itemAvailable').checked = true;
  document.getElementById('menuFormTitle').textContent = 'Agregar producto';
  document.getElementById('menuSubmitBtn').textContent = 'Guardar producto';
  document.getElementById('cancelEditBtn').style.display = 'none';
}

async function toggleAvailability(id) {
  const item = db.menuItems.find(product => product.id === id);
  if (!item) return toast('Producto no encontrado');
  await api(`/api/admin/menu-items/${id}/availability`, {
    method: 'PATCH',
    body: JSON.stringify({ available: !item.available })
  });
  toast(!item.available ? 'Producto activado' : 'Producto oculto');
  await loadData(true);
}

async function deleteMenuItem(id) {
  await api(`/api/admin/menu-items/${id}`, { method: 'DELETE' });
  toast('Producto eliminado');
  cancelMenuEdit();
  await loadData(true);
}

async function deleteCategory(id) {
  await api(`/api/admin/categories/${id}`, { method: 'DELETE' });
  toast('Categoría eliminada');
  cancelMenuEdit();
  await loadData(true);
}

async function deleteTable(id) {
  await api(`/api/admin/tables/${id}`, { method: 'DELETE' });
  qrCache.delete(id);
  tablesSignature = '';
  toast('Mesa eliminada');
  await loadData(true);
}

async function deleteContact(id) {
  await api(`/api/admin/contacts/${id}`, { method: 'DELETE' });
  toast('Contacto eliminado');
  await loadData(false);
}

async function deleteStaff(id) {
  await api(`/api/admin/staff/${id}`, { method: 'DELETE' });
  toast('Staff eliminado');
  await loadData(true);
}

async function logout() {
  await api('/api/logout', { method: 'POST' });
  location.reload();
}

async function copyPhones() {
  const phones = filteredContacts().map(contact => contact.phone).filter(Boolean).join('\n');
  if (!phones) return toast('No hay teléfonos para copiar');
  await navigator.clipboard.writeText(phones);
  toast('Teléfonos copiados');
}

async function copyPromoMessage() {
  const message = document.getElementById('promoMessage').value;
  if (!message.trim()) return toast('Escribe una promo primero');
  await navigator.clipboard.writeText(message);
  toast('Promo copiada');
}

function readLogoFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve(undefined);
    if (file.size > 2_000_000) return reject(new Error('El logo pesa demasiado. Usa una imagen menor a 2 MB.'));
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('No se pudo leer el logo'));
    reader.readAsDataURL(file);
  });
}


function activeNavButton(section) {
  return document.querySelector(`.nav-btn[data-section="${section}"]`);
}

function switchAdminSection(section) {
  const target = document.getElementById(section);
  const button = activeNavButton(section);
  if (!target || !button) return;
  currentSection = section;
  document.querySelectorAll('.nav-btn').forEach(btn => btn.classList.remove('active'));
  document.querySelectorAll('.section').forEach(sectionEl => sectionEl.classList.remove('active'));
  button.classList.add('active');
  target.classList.add('active');
  if (section === 'tables') renderTables();
}

const adminTourSteps = [
  { section: 'dashboard', title: 'Centro de mando', body: 'Aquí verás alertas, comandas pendientes, mesas activas y el pulso del restaurante en tiempo real.' },
  { section: 'menu', title: 'Menú editable', body: 'Aquí creas categorías, agregas productos, cambias precios y activas u ocultas platillos cuando se agoten.' },
  { section: 'tables', title: 'Mesas y QR', body: 'Aquí creas las mesas y descargas el QR único que va en cada mesa para que los clientes pidan o llamen al mesero.' },
  { section: 'settings', title: 'Meseros y PIN', body: 'Aquí agregas meseros. El PIN se guarda con prefijo del restaurante, por ejemplo LL-1564, para evitar duplicados entre perfiles.' },
  { section: 'team', title: 'Equipo en tiempo real', body: 'Aquí revisas qué mesero tomó cada mesa, quién confirma comandas y cómo va su rendimiento.' }
];
let adminTourIndex = 0;

function adminTourKey() {
  return `aurea_admin_tour_seen_${db?.restaurant?.instanceSlug || 'default'}`;
}

function maybeShowAdminTour() {
  if (!db || localStorage.getItem(adminTourKey()) === 'yes') return;
  setTimeout(() => showAdminTour(0), 400);
}

function showAdminTour(index = 0) {
  adminTourIndex = Math.max(0, Math.min(index, adminTourSteps.length - 1));
  const step = adminTourSteps[adminTourIndex];
  switchAdminSection(step.section);
  let overlay = document.getElementById('adminTourOverlay');
  if (!overlay) {
    overlay = document.createElement('div');
    overlay.id = 'adminTourOverlay';
    overlay.className = 'tour-overlay';
    document.body.appendChild(overlay);
  }
  overlay.innerHTML = `
    <div class="tour-card">
      <div class="pill">Tour inicial ${adminTourIndex + 1}/${adminTourSteps.length}</div>
      <h2>${escapeHtml(step.title)}</h2>
      <p>${escapeHtml(step.body)}</p>
      <div class="inline-actions end">
        <button class="btn ghost small" onclick="finishAdminTour()">Saltar</button>
        ${adminTourIndex > 0 ? '<button class="btn secondary small" onclick="showAdminTour(adminTourIndex - 1)">Atrás</button>' : ''}
        <button class="btn small" onclick="${adminTourIndex === adminTourSteps.length - 1 ? 'finishAdminTour()' : 'showAdminTour(adminTourIndex + 1)'}">${adminTourIndex === adminTourSteps.length - 1 ? 'Terminar' : 'Siguiente'}</button>
      </div>
    </div>
  `;
  overlay.classList.add('active');
}

function finishAdminTour() {
  localStorage.setItem(adminTourKey(), 'yes');
  document.getElementById('adminTourOverlay')?.remove();
}

function adminPinPrefix() {
  return String(db?.restaurant?.pinPrefix || 'LL').toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'LL';
}

function updateStaffPinPreview() {
  const input = document.getElementById('staffPin');
  const preview = document.getElementById('staffPinPreview');
  if (!input || !preview) return;
  const digits = String(input.value || '').replace(/\D/g, '').slice(-4);
  preview.textContent = digits.length === 4 ? `Se guardará como ${adminPinPrefix()}-${digits}` : `Se guardará como ${adminPinPrefix()}-####`;
}

function generateStaffPin() {
  const input = document.getElementById('staffPin');
  if (!input) return;
  input.value = String(Math.floor(1000 + Math.random() * 9000));
  updateStaffPinPreview();
}

document.getElementById('staffPin')?.addEventListener('input', updateStaffPinPreview);

document.getElementById('loginForm').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    await api('/api/login', {
      method: 'POST',
      body: JSON.stringify({
        username: document.getElementById('username').value,
        password: document.getElementById('password').value
      })
    });
    showAdmin();
  } catch (error) {
    toast(error.message);
  }
});

document.querySelectorAll('.nav-btn').forEach(button => {
  button.addEventListener('click', () => switchAdminSection(button.dataset.section));
});

document.getElementById('menuForm').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const editingId = document.getElementById('itemEditingId').value;
    const payload = {
      categoryId: document.getElementById('itemCategory').value,
      name: document.getElementById('itemName').value,
      description: document.getElementById('itemDescription').value,
      price: document.getElementById('itemPrice').value,
      imageUrl: document.getElementById('itemImageUrl').value,
      available: document.getElementById('itemAvailable').checked,
      featured: document.getElementById('itemFeatured').checked
    };

    await api(editingId ? `/api/admin/menu-items/${editingId}` : '/api/admin/menu-items', {
      method: editingId ? 'PUT' : 'POST',
      body: JSON.stringify(payload)
    });

    cancelMenuEdit();
    toast(editingId ? 'Producto actualizado' : 'Producto guardado');
    await loadData(true);
  } catch (error) {
    toast(error.message);
  }
});

document.getElementById('categoryForm').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    await api('/api/admin/categories', {
      method: 'POST',
      body: JSON.stringify({ name: document.getElementById('categoryName').value })
    });
    document.getElementById('categoryName').value = '';
    toast('Categoría creada');
    await loadData(true);
  } catch (error) {
    toast(error.message);
  }
});

document.getElementById('tableForm').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    await api('/api/admin/tables', {
      method: 'POST',
      body: JSON.stringify({ name: document.getElementById('tableNameInput').value })
    });
    document.getElementById('tableNameInput').value = '';
    tablesSignature = '';
    toast('Mesa creada');
    await loadData(true);
  } catch (error) {
    toast(error.message);
  }
});

document.getElementById('restaurantLogoFile').addEventListener('change', async event => {
  try {
    pendingLogoDataUrl = await readLogoFile(event.target.files[0]);
    const preview = document.getElementById('logoPreview');
    if (pendingLogoDataUrl) preview.innerHTML = `<img src="${pendingLogoDataUrl}" alt="Logo" />`;
  } catch (error) {
    toast(error.message);
    event.target.value = '';
  }
});

document.getElementById('settingsForm').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const payload = {
      name: document.getElementById('restaurantName').value,
      subtitle: document.getElementById('restaurantSubtitle').value,
      logoText: document.getElementById('restaurantLogoText').value,
      whatsapp: document.getElementById('restaurantWhatsapp').value,
      instanceSlug: document.getElementById('restaurantInstanceSlug')?.value || '',
      pinPrefix: document.getElementById('restaurantPinPrefix')?.value || '',
      address: document.getElementById('restaurantAddress').value,
      hours: document.getElementById('restaurantHours').value,
      crmOptInText: document.getElementById('restaurantCrmText').value,
      accentColor: document.getElementById('restaurantAccentColor').value,
      operationMode: document.getElementById('operationMode').value,
      assignmentMode: document.getElementById('assignmentMode').value,
      whatsappOfficial: {
        enabled: document.getElementById('waOfficialEnabled')?.checked || false,
        displayName: document.getElementById('waOfficialDisplayName')?.value || '',
        businessPortfolioId: document.getElementById('waOfficialBusinessId')?.value || '',
        wabaId: document.getElementById('waOfficialWabaId')?.value || '',
        phoneNumberId: document.getElementById('waOfficialPhoneNumberId')?.value || '',
        webhookUrl: document.getElementById('waOfficialWebhookUrl')?.value || '',
        notes: document.getElementById('waOfficialNotes')?.value || '',
        status: document.getElementById('waOfficialEnabled')?.checked ? 'config_ready' : 'not_connected'
      }
    };
    if (pendingLogoDataUrl !== undefined) payload.logoDataUrl = pendingLogoDataUrl;
    await api('/api/admin/restaurant', { method: 'PUT', body: JSON.stringify(payload) });
    pendingLogoDataUrl = undefined;
    toast('Restaurante guardado');
    await loadData(true);
  } catch (error) {
    toast(error.message);
  }
});

document.getElementById('staffForm').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    await api('/api/admin/staff', {
      method: 'POST',
      body: JSON.stringify({
        name: document.getElementById('staffName').value,
        role: document.getElementById('staffRole').value,
        whatsapp: document.getElementById('staffWhatsapp').value,
        pin: document.getElementById('staffPin').value,
        assignedTableIds: Array.from(document.querySelectorAll('input[name="staffZoneTable"]:checked')).map(input => input.value),
        active: true
      })
    });
    event.target.reset();
    document.getElementById('staffRole').value = 'Mesero';
    updateStaffPinPreview();
    toast('Staff agregado');
    await loadData(true);
  } catch (error) {
    toast(error.message);
  }
});


document.getElementById('whatsappOrderForm')?.addEventListener('submit', async event => {
  event.preventDefault();
  try {
    await api('/api/admin/whatsapp-orders', {
      method: 'POST',
      body: JSON.stringify({
        customerName: document.getElementById('whatsappCustomerName').value,
        customerPhone: document.getElementById('whatsappCustomerPhone').value,
        message: document.getElementById('whatsappMessage').value,
        itemsText: document.getElementById('whatsappItemsText').value,
        totalEstimate: document.getElementById('whatsappTotalEstimate').value,
        paymentMethod: document.getElementById('whatsappPaymentMethod').value,
        address: document.getElementById('whatsappAddress').value
      })
    });
    event.target.reset();
    toast('Pedido WhatsApp guardado');
    await loadData(false);
  } catch (error) {
    toast(error.message);
  }
});

document.getElementById('promoMessage')?.addEventListener('input', () => {
  if (db) renderCRM();
});

checkSession();
