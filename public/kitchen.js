let kitchenDb = null;
let refreshTimer = null;

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
  const color = kitchenDb?.restaurant?.accentColor || '#c9a44c';
  document.documentElement.style.setProperty('--detail', color);
}

function statusLabel(status) {
  const labels = {
    new: 'Pendiente',
    confirmed: 'Confirmado',
    in_progress: 'En preparación',
    ready: 'Listo',
    delivered: 'Entregado',
    cancelled: 'Cancelado'
  };
  return labels[status] || status;
}

async function checkKitchenSession() {
  const session = await api('/api/staff/session');
  if (session.isStaff) showKitchenApp();
}

function showKitchenApp() {
  document.getElementById('kitchenLogin').style.display = 'none';
  document.getElementById('kitchenApp').style.display = 'block';
  loadKitchenData();
  if (!refreshTimer) refreshTimer = setInterval(loadKitchenData, 4000);
}

async function loadKitchenData() {
  try {
    kitchenDb = await api('/api/staff/data');
    applyAccent();
    renderKitchen();
  } catch (error) {
    if (!error.message.includes('No autorizado')) toast(error.message);
  }
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

function orderCard(order) {
  return `
    <div class="item command-card" style="align-items:flex-start;">
      <div class="item-main">
        <div class="item-title">#${escapeHtml(order.commandNumber || '-')} · ${escapeHtml(order.tableName)}</div>
        <div class="item-meta">${dateTime(order.createdAt)} · ${escapeHtml(statusLabel(order.status))}${order.estimatedTime ? ` · ${escapeHtml(order.estimatedTime)}` : ''}</div>
        <div style="margin-top:10px; display:grid; gap:8px;">
          ${order.items.map(item => `<div><strong>${item.qty}× ${escapeHtml(item.name)}${item.dinerName ? ` · ${escapeHtml(item.dinerName)}` : ''}</strong>${item.note ? `<div class="item-meta">Nota: ${escapeHtml(item.note)}</div>` : ''}</div>`).join('')}
        </div>
        ${order.note ? `<div class="item-meta" style="margin-top:8px;">Nota general: ${escapeHtml(order.note)}</div>` : ''}
        ${order.status === 'new' ? `<div style="margin-top:8px;"><span class="pill">Confirmar con tiempo estimado</span></div>${estimateActions(order.id)}` : ''}
      </div>
      <div class="inline-actions end">
        <button class="btn small secondary" onclick="updateOrder('${order.id}', 'in_progress')">Preparar</button>
        <button class="btn small secondary" onclick="updateOrder('${order.id}', 'ready')">Listo</button>
        <button class="btn small success" onclick="updateOrder('${order.id}', 'delivered')">Entregado</button>
      </div>
    </div>
  `;
}

function renderKitchen() {
  document.getElementById('kitchenStaffName').textContent = kitchenDb.staff?.name || 'Cocina';
  document.getElementById('kitchenRestaurant').textContent = kitchenDb.restaurant?.name || 'AUREA';
  const groups = {
    kitchenNew: kitchenDb.orders.filter(o => ['new', 'confirmed'].includes(o.status)),
    kitchenProgress: kitchenDb.orders.filter(o => o.status === 'in_progress'),
    kitchenReady: kitchenDb.orders.filter(o => o.status === 'ready')
  };
  for (const [id, orders] of Object.entries(groups)) {
    const el = document.getElementById(id);
    el.innerHTML = orders.length ? orders.map(orderCard).join('') : '<div class="item"><div>Sin comandas.</div></div>';
  }
}

async function updateOrder(id, status, estimatedTime = undefined) {
  await api(`/api/staff/orders/${id}`, { method: 'PATCH', body: JSON.stringify({ status, estimatedTime }) });
  await loadKitchenData();
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

async function kitchenLogout() {
  await api('/api/staff/logout', { method: 'POST' });
  location.reload();
}

document.getElementById('kitchenLoginForm').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    await api('/api/staff/login', {
      method: 'POST',
      body: JSON.stringify({ pin: document.getElementById('kitchenPinLogin').value })
    });
    showKitchenApp();
  } catch (error) {
    toast(error.message);
  }
});

checkKitchenSession();
